/**
 * Stage 2: read an uploaded running-bill PDF, calculate the PVC, and send back
 * both the PVC amount (in chat) and the full IR standard PDF report (as a file).
 *
 * Pipeline: download the bill PDF -> reuse the app's bill extractor to get line
 * items -> map each item to a PVC sub-classification by its suggested code -> run
 * the SAME PVC engine the website uses -> reply with the total + breakdown, then
 * render the IR standard report and send it as a Telegram document.
 *
 * IMPORTANT: this is an AUTOMATIC ESTIMATE. There is no in-chat review screen like
 * the website has, so the classification is taken from the AI's reading. The reply
 * says so and links to the contract on the site to verify/adjust. The report is
 * generated in memory (the bill is NOT saved to the dashboard) — saving is a
 * separate step if wanted later.
 */

import { prisma } from './db';
import {
  sendTelegramMessage,
  sendTelegramChatAction,
  sendTelegramDocumentBytes,
  downloadTelegramFile,
  getPublicSiteUrl,
  notifyTelegramAdmin,
} from './telegram-api';
import { extractBillDetailsDirect } from '@/app/api/bills/cement-analysis/route';
import { getQuarterFromDate, getQuarterMonths, calculateClassificationEntryPvc } from './pvc-calculations';
import { billRequiresExtension } from './extension-compliance';
import { getQuarterlyAverages } from './db-utils';
import { getSteelIndexNamesForZone, getFuelIndexNameForBill, getSteelCityForZone } from './zone-steel-city-mapping';
import { extractSteelTypesFromEntries } from './steel-type-handler';
import { inferMainClassification } from './work-classification';
import { matchCementCoefficient, normalizeDsrCode, calculateDsrCementRequirement } from './dsr-cement-calculation';
import { CEMENT_DERIVATION_ENABLED } from './cement-derivation';

/** Strip the internal per-chat namespace suffix from a guest contract's agreement
 *  number for display. (Kept local to avoid a circular import with the flow.) */
function displayAgreementNo(stored: string | null | undefined): string {
  return String(stored || '').replace(/\s*·\s*tg:\S+$/i, '').trim();
}

export interface ProcessUploadedBillArgs {
  chatId: string;
  conversationId: string;
  contractId: string;
  billFileId: string;
  billFileName: string;
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

// How many unpaid reports a chat can hold. One per bill sent but not yet paid for;
// beyond this the oldest links stop being redeemable.
const MAX_PENDING_REPORTS = 10;

function formatMoney(value: number): string {
  return (Number(value) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface ProcessUploadedBillResult {
  /**
   * True when the run stopped to ask the user for something (the tender closing
   * date, or the phone number to link their account). The caller keeps the
   * uploaded bill so the run can resume once they answer.
   */
  needsInput?: boolean;
}

export async function processUploadedBillPvc(args: ProcessUploadedBillArgs): Promise<ProcessUploadedBillResult> {
  const { chatId, contractId, billFileId, billFileName } = args;

  let contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract) {
    await sendTelegramMessage(chatId, '❌ Could not find the contract for this bill. Please resend the agreement PDF.');
    return {};
  }

  const baseUrl = getPublicSiteUrl();

  // 1. Download the bill PDF bytes.
  await sendTelegramMessage(chatId, '📊 Reading the bill items…');
  await sendTelegramChatAction(chatId, 'typing');
  let pdfBytes: Buffer;
  try {
    pdfBytes = await downloadTelegramFile(billFileId);
  } catch (err) {
    console.error('[Telegram] bill download failed:', err);
    await sendTelegramMessage(chatId, '❌ Could not download the bill PDF. Please send it again.');
    return {};
  }

  // 2. Extract the bill line items using the SAME path the web uploader uses
  //    (stage=direct): an in-process IREPS PDF parse, so it needs no external
  //    MarkItDown service.
  let billDetails;
  try {
    billDetails = await extractBillDetailsDirect(pdfBytes, contractId);
  } catch (err: any) {
    console.error('[Telegram] bill extraction failed:', err);
    await sendTelegramMessage(
      chatId,
      `❌ I couldn't read the bill: ${escapeHtml(err?.message || 'extraction failed')}\n\n` +
        `Make sure it's a digitally generated IREPS PDF (not a scan/photo).`,
    );
    return {};
  }
  const items = billDetails.items || [];
  if (!items.length) {
    await sendTelegramMessage(chatId, '❌ I could not find any bill items in that PDF. Please check it is the running bill.');
    return {};
  }

  // The bill header repeats the contract's identity, so it can finish a contract set
  // up from an LOA — which carries no agreement number — and fill anything the
  // agreement PDF didn't yield. Only ever fills blanks; never overwrites.
  contract = (await backfillContractFromBill(contract, billDetails, chatId, args.conversationId)) || contract;

  // 3. Map each item to a PVC sub-classification by its suggested code, summing
  //    amounts per classification. Blank/unknown codes fall back to the bill's main
  //    group ("<group>A"), then to the work-description inferred group.
  const subs = await prisma.subClassification.findMany({ where: { isActive: true } });
  const byCode = new Map(subs.map((s) => [s.code.toUpperCase(), s]));
  const subById = new Map(subs.map((s) => [s.id, s]));

  const groupCode = String(billDetails.classificationGroupCode || inferMainClassification(contract.workDescription).code || '').trim();
  const defaultSub =
    (groupCode && byCode.get(`${groupCode}A`)) ||
    (groupCode ? subs.find((s) => s.code.toUpperCase().startsWith(groupCode)) : undefined) ||
    subs.find((s) => s.code.toUpperCase().endsWith('A'));

  // amount and steelTypes are carried per row so a single entry that mixes reinforcement
  // with structural steelwork is priced row by row against each row's own steel index,
  // instead of one category being applied to the whole entry.
  type ItemRow = { itemNumber: string; quantity: number | ''; agreementRate: number | ''; cementMt?: number; amount?: number; steelTypes?: string[] };
  type EntryAgg = { subClassificationId: string; amount: number; steel: number; steelTypes: Set<string>; rows: ItemRow[] };
  const agg = new Map<string, EntryAgg>();
  let unclassifiedAmount = 0;

  for (const it of items) {
    const code = String(it.suggestedClassificationCode || '').toUpperCase().trim();
    const sub = (code && byCode.get(code)) || defaultSub;
    const amt = round2(Number(it.amountSinceLastBill ?? it.amountIncludingSpecialConditionSinceLastBill ?? 0));
    if (amt <= 0) continue;
    if (!sub) {
      unclassifiedAmount += amt;
      continue;
    }
    const cur = agg.get(sub.id) || { subClassificationId: sub.id, amount: 0, steel: sub.steel, steelTypes: new Set<string>(), rows: [] as ItemRow[] };
    cur.amount = round2(cur.amount + amt);
    if (it.isSteelItem && it.steelType) cur.steelTypes.add(it.steelType);
    // Keep the item detail so the report can show item no / qty / agreement rate.
    const q = Number(it.quantitySinceLastBill);
    const r = Number(it.agreementRate);
    cur.rows.push({
      itemNumber: String(it.itemNo || it.dsrCode || '').trim(),
      quantity: Number.isFinite(q) && q > 0 ? q : '',
      agreementRate: Number.isFinite(r) && r > 0 ? r : '',
      amount: amt,
      steelTypes: it.isSteelItem && it.steelType ? [String(it.steelType)] : undefined,
    });
    agg.set(sub.id, cur);
  }

  const entries = [...agg.values()];
  if (!entries.length) {
    await sendTelegramMessage(chatId, '❌ I read the bill but could not work out a PVC classification for its items. Please check it is the correct running bill and try /pvc again.');
    return {};
  }

  const grossFromItems = round2(entries.reduce((s, e) => s + e.amount, 0) + unclassifiedAmount);
  const grossBillAmount = round2(Number(billDetails.grossBillAmount) || grossFromItems);

  // 4. Run the PVC engine over the entries for the bill's quarter.
  const measurementDate = billDetails.measurementDate ? new Date(billDetails.measurementDate) : new Date();

  // A bill measured after the date the contract covers needs its time extension recorded
  // first: the extension decides whether PVC applies to that period at all (17B caps the
  // indices). The web and bulk routes stop there, and this flow now does too, rather than
  // pricing the bill on a guess. The gate lifts itself once an extension pushes the
  // completion date out, and never fires on a contract with no completion date at all.
  const extensionGate = billRequiresExtension(contract, measurementDate);
  if (extensionGate.blocked) {
    const fmt = (d: Date) => new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
    await sendTelegramMessage(
      chatId,
      `⚠️ This bill is measured <b>after the contract's completion date</b>.\n\n` +
        `📅 Bill measured: <b>${fmt(measurementDate)}</b>\n` +
        `📅 Contract covered until: <b>${fmt(extensionGate.coveredUntil!)}</b>\n\n` +
        `Work in this period needs a recorded <b>time extension</b> (GCC 17A/17B), and the extension ` +
        `decides how PVC applies to it. Please record the extension on the website first, then send the bill again:\n` +
        `${getPublicSiteUrl()}/contracts/${contract.id}/extensions`,
    );
    return {};
  }

  // 17B-extended contracts freeze the quarter at the original completion date.
  let quarterDate = measurementDate;
  if (contract.isExtended && contract.extensionType === '17B' && contract.originalCompletionDate && measurementDate > contract.originalCompletionDate) {
    quarterDate = contract.originalCompletionDate;
  }
  const quarter = getQuarterFromDate(quarterDate, contract.baseMonth);

  // Q0 means the measurement date falls on/before the base month, so no PVC period
  // has elapsed and the PVC would be zero. Almost always the contract's tender
  // closing date is wrong (e.g. it couldn't be read from the agreement), so ask for
  // it and recalculate rather than quietly reporting Rs 0.00.
  if (quarter === 'Q0') {
    const fmtDate = (d: Date) => new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
    const { updateTelegramConversation, TelegramStep } = await import('./telegram-conversation');
    await updateTelegramConversation(args.conversationId, TelegramStep.AWAITING_TENDER_DATE, {});
    await sendTelegramMessage(
      chatId,
      `⚠️ I can't calculate the PVC yet — the dates don't line up.\n\n` +
        `📅 Bill measured: <b>${fmtDate(measurementDate)}</b>\n` +
        `📅 Contract base month: <b>${fmtDate(contract.baseMonth)}</b>\n\n` +
        `The bill is <b>before</b> the base month, so no PVC period has passed. ` +
        `This usually means the tender closing date on the contract is wrong.\n\n` +
        `Please reply with the correct <b>tender closing date</b> in <b>DD/MM/YYYY</b> format (e.g. 15/03/2024) and I'll fix it and recalculate:`,
    );
    return { needsInput: true };
  }

  // The railway zone comes from the question the bot asked in the flow — it decides
  // the steel indices and the zone-city diesel index, so it must not be assumed.
  const convForOpts = await prisma.telegramConversation.findUnique({
    where: { id: args.conversationId },
    select: { conversationData: true },
  });
  const convOpts = (convForOpts?.conversationData as any) || {};
  const zone: string | null = convOpts.docZone || null;

  const extractedSteelTypes = await extractSteelTypesFromEntries(
    entries.map((e) => ({ subClassificationId: e.subClassificationId, amount: e.amount, steelTypes: [...e.steelTypes] })),
  );
  const steelIndexNames = getSteelIndexNamesForZone(zone);

  // Fuel basis comes from the AGREEMENT — never hardcoded. GCC-2022 Cl.46A.7 defines
  // the PPAC four-city average and SWR's letter (23.01.2026) directs that, but
  // Sr.DFM/MDU (Southern Railway) returned a PVC proposal demanding the zone's own
  // city rate, and pre-2022 agreements may differ again. Only the contract's terms
  // decide, so the flow asks and stores it.
  const fuelPriceType: string =
    convOpts.docFuelPriceType || (contract as any).fuelPriceType || 'four_city_avg';
  const fuelIndexName = getFuelIndexNameForBill(zone, fuelPriceType);
  const fuelBasisLabel = fuelPriceType === 'zone_city'
    ? `zone city rate (${getSteelCityForZone(zone)})`
    : 'average of 4 cities (PPAC)';
  const allIndices = [
    'Labour', 'RBI Plant Machinery', 'RBI Other Materials', 'RBI Cement', 'RBI Explosives',
    ...steelIndexNames, fuelIndexName,
  ];

  const quarterlyAverages = await getQuarterlyAverages(quarter, allIndices, contract.baseMonth, 'auto');

  if (!quarterlyAverages || quarterlyAverages.length === 0) {
    await sendTelegramMessage(
      chatId,
      `⚠️ I read the bill (gross ₹${formatMoney(grossBillAmount)}, quarter <b>${quarter}</b>), but the price indices for this quarter aren't available yet, so I can't calculate the PVC.\n\n` +
        `This is the same rule as the website — the PVC can be worked out once the indices for ${quarter} are published.`,
    );
    return {};
  }

  const preparedEntries = entries.map((e) => ({
    subClassificationId: e.subClassificationId,
    amount: e.amount,
    steelTypes: e.steelTypes.size > 0
      ? [...e.steelTypes]
      : (e.steel > 0 && extractedSteelTypes.length > 0 ? extractedSteelTypes : []),
    rows: e.rows,
  }));

  let totalPvc = 0, labour = 0, plant = 0, fuel = 0, materials = 0, cement = 0, steel = 0, explosives = 0;
  for (const pe of preparedEntries) {
    const pvc = await calculateClassificationEntryPvc(
      { subClassificationId: pe.subClassificationId, amount: pe.amount, steelTypes: pe.steelTypes, itemRows: pe.rows as any },
      quarterlyAverages,
    );
    labour += pvc.labourPvc; plant += pvc.plantMachineryPvc; fuel += pvc.fuelPowerPvc;
    materials += pvc.otherMaterialsPvc; cement += pvc.cementPvc; steel += pvc.steelPvc;
    explosives += pvc.explosivesPvc; totalPvc += pvc.totalPvc;
  }
  const entriesForReport: any[] = preparedEntries.map((pe) => {
    const first = pe.rows[0];
    return {
      amount: pe.amount,
      steelTypes: pe.steelTypes,
      subClassification: subById.get(pe.subClassificationId),
      // Item detail so the report shows item no / quantity / agreement rate.
      itemRows: pe.rows,
      itemNumber: first?.itemNumber || '',
      quantity: first?.quantity ?? '',
      agreementRate: first?.agreementRate ?? '',
    };
  });

  // Derived-cement breakup: off, as it is on the website. A DSR item's rate already
  // includes its cement and its own class already carries a cement share, so printing a
  // CEMENT BREAKUP table implies a split that is not made — and on a statement going to
  // an accounts office, implying one is worse than leaving it out. The builder is kept;
  // see lib/cement-derivation.ts.
  if (CEMENT_DERIVATION_ENABLED) {
    try {
      const cementEntry = await buildDerivedCementEntry(items);
      if (cementEntry) entriesForReport.push(cementEntry);
    } catch (err) {
      console.error('[Telegram] cement breakup failed:', err);
    }
  }

  // 5. Reply with the PVC estimate + component breakdown.
  const comp = (label: string, v: number) => (Math.abs(v) >= 0.005 ? `\n   ${label}: ₹${formatMoney(v)}` : '');
  const sign = totalPvc >= 0 ? '' : '-';
  const billNo = billDetails.billNo ? String(billDetails.billNo) : '';
  const billNoLabel = billNo ? ` (Bill ${escapeHtml(billNo)})` : '';

  // Classification list — how the bill value was split across GCC classifications.
  // Shown in the chat so the user can sanity-check it without logging in anywhere.
  const classLines = [...agg.values()]
    .map((e) => {
      const sub = subById.get(e.subClassificationId);
      const code = sub?.code || '—';
      const name = sub?.name || 'Unclassified';
      return { code, name, amount: e.amount };
    })
    .sort((a, b) => b.amount - a.amount)
    .map((c) => `\n   <b>${escapeHtml(c.code)}</b> ${escapeHtml(c.name)} — ₹${formatMoney(c.amount)}`)
    .join('');

  await sendTelegramMessage(
    chatId,
    `✅ <b>PVC estimate${billNoLabel}</b>\n\n` +
      `📄 Agreement: <b>${escapeHtml(displayAgreementNo(contract.agreementNo))}</b>\n` +
      `📆 Date of measurement: <b>${new Date(measurementDate).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })}</b>\n` +
      `📅 Quarter: <b>${quarter}</b>\n` +
      `💰 Gross bill: <b>₹${formatMoney(grossBillAmount)}</b>\n` +
      `⛽ Fuel basis: <b>${fuelBasisLabel}</b>\n` +
      `📈 <b>PVC amount: ${sign}₹${formatMoney(Math.abs(totalPvc))}</b>\n` +
      `<i>Breakdown:</i>` +
      comp('Labour', labour) +
      comp('Plant &amp; Machinery', plant) +
      comp('Fuel', fuel) +
      comp('Other materials', materials) +
      comp('Cement', cement) +
      comp('Steel', steel) +
      comp('Explosives', explosives) +
      `\n\n📋 <b>Classification of the bill value:</b>` + classLines +
      `\n\n<i>⚠️ This is an automatic estimate from the AI's reading of your bill. ` +
      `Please verify it before filing.</i>` +
      (unclassifiedAmount > 0
        ? `\n\n<i>Note: ₹${formatMoney(unclassifiedAmount)} of items couldn't be classified and were left out of the PVC.</i>`
        : ''),
  );

  // Tell the admin someone used the bot (no-op unless TELEGRAM_ADMIN_CHAT_ID is set).
  notifyTelegramAdmin(
    `📊 <b>PVC calculated on the bot</b>\n\n` +
      `👤 Chat: <code>${chatId}</code>\n` +
      `📄 Agreement: ${escapeHtml(displayAgreementNo(contract.agreementNo))}\n` +
      `${billNo ? `🔢 Bill: ${escapeHtml(billNo)}\n` : ''}` +
      `📅 Quarter: ${quarter}\n` +
      `💰 Gross: ₹${formatMoney(grossBillAmount)}\n` +
      `📈 PVC: ₹${formatMoney(totalPvc)}`,
  ).catch(() => {});

  // Persist the bill + its PVC calculation so Telegram bills show up alongside the
  // contract (in the bills list / admin). Best-effort — a save failure never blocks
  // the estimate or the report.
  try {
    const fuelPriceTypeChosen = fuelPriceType;
    await persistTelegramBill({
      contractId: contract.id,
      billNo: billNo || `RA-${quarter}`,
      grossBillAmount,
      dateOfMeasurement: measurementDate,
      quarter,
      zone,
      fuelPriceType: fuelPriceTypeChosen,
      components: { labour, plant, fuel, materials, cement, steel, explosives, totalPvc },
    });
  } catch (err) {
    console.error('[Telegram] persist bill failed:', err);
  }

  // 6. The PVC amount above is free; the PDF statement is paid — and paid right
  //    here in the chat via a Razorpay link (UPI/card), with no account needed.
  //    Everything the report needs is parked on the conversation so the Razorpay
  //    webhook can render and send it the moment the payment lands.
  const payload: StoredReportPayload = {
    contractId: contract.id,
    billNo: billNo || 'RA Bill',
    measurementDate: measurementDate.toISOString(),
    grossBillAmount,
    quarter,
    zone,
    fuelIndexName,
    steelIndexNames,
    allIndices,
    entriesForReport,
    pvcComponents: { labour, plant, fuel, materials, cement, steel, explosives, totalPvc },
  };

  try {
    const { mutateTelegramConversationData, TelegramStep } = await import('./telegram-conversation');
    const { getReportPriceRupees, createReportPaymentLink } = await import('./telegram-payment');

    const price = await getReportPriceRupees();
    const link = await createReportPaymentLink({
      chatId,
      amountRupees: price,
      agreementNo: displayAgreementNo(contract.agreementNo),
      billNo: payload.billNo,
    });

    // Park it against its own payment link as well as in the single slot. Several
    // bills for one agreement means several unpaid links at once, and the single slot
    // alone would hand whoever pays the FIRST link the LAST bill's report.
    const stored = await mutateTelegramConversationData(
      args.conversationId,
      (current) => ({
        ...current,
        docPendingReport: payload as any,
        docPendingPaymentLinkId: link.id,
        docPendingReports: [
          ...(current.docPendingReports || []).filter((r) => r.linkId !== link.id),
          { linkId: link.id, payload: payload as any },
        ].slice(-MAX_PENDING_REPORTS),
      }),
      TelegramStep.IDLE,
    );

    // With more than one statement waiting, paying them one link at a time is a
    // nuisance — point at the combined link.
    const waitingCount = (stored.docPendingReports || []).length;
    const payAllHint = waitingCount > 1
      ? `\n\n🧾 <b>${waitingCount} statements are now waiting.</b> Send <b>/payall</b> for one link covering all of them.`
      : '';

    await sendTelegramMessage(
      chatId,
      `📎 <b>Get the full PVC statement (PDF) — ₹${formatMoney(price)}</b>\n\n` +
        `Pay by UPI / card / net banking here:\n${link.url}\n\n` +
        `The moment your payment is confirmed I'll send the signed-format PVC statement right here. No sign-up needed.` +
        payAllHint +
        `\n\n<i>Have a coupon? Send /coupon.\nAlready paid and nothing arrived? Send /paid.</i>`,
    );
  } catch (err: any) {
    console.error('[Telegram] payment link creation failed:', err);
    await sendTelegramMessage(
      chatId,
      `⚠️ The PVC amount above is ready, but I couldn't create the payment link just now. Please try sending the bill again in a moment.`,
    );
  }

  return {};
}

/** How many of the given report links are still waiting to be delivered. */
async function countPendingReports(conversationId: string, linkIds: string[]): Promise<number> {
  const fresh = await prisma.telegramConversation.findUnique({ where: { id: conversationId } });
  const pending: Array<{ linkId: string }> = ((fresh?.conversationData as any) || {}).docPendingReports || [];
  return pending.filter((r) => linkIds.includes(r.linkId)).length;
}

/** Fields the running bill's header can supply about the contract itself. */
interface BillHeaderFacts {
  agreementNo?: string;
  loaNo?: string;
  loaDate?: string;
  agreementValue?: number | null;
  contractorName?: string;
  billWorkDescription?: string;
}

/**
 * Fills in contract details the agreement/LOA didn't give us, using the bill's own
 * header. This is what lets a contractor start from an LOA: the LOA has no agreement
 * number, and the running bill prints it — along with the LOA number and date, the
 * contractor, the Name of Work, and on formats that carry it the contract value.
 *
 * Only ever writes fields that are empty or placeholders — a value read from the
 * actual agreement always wins. Returns the updated contract, or null if nothing
 * needed changing.
 */
async function backfillContractFromBill(
  contract: any,
  billDetails: any,
  chatId: string,
  conversationId: string,
): Promise<any | null> {
  const bill: BillHeaderFacts = billDetails || {};
  const patch: Record<string, any> = {};

  // The agreement number the contract is filed under. A contract created from an LOA
  // is keyed "LOA <no>" (and guests carry a "· tg:<chat>" namespace suffix, which must
  // be preserved or the chat loses its own contract).
  const storedNo = String(contract.agreementNo || '');
  const suffixMatch = storedNo.match(/\s*·\s*tg:\S+$/i);
  const namespaceSuffix = suffixMatch ? suffixMatch[0] : '';
  const realNo = displayAgreementNo(storedNo);
  const billAgreementNo = String(bill.agreementNo || '').trim();
  const stillOnLoaKey = /^LOA\s/i.test(realNo);

  if (stillOnLoaKey && billAgreementNo) {
    patch.agreementNo = `${billAgreementNo}${namespaceSuffix}`;
  }
  if (!contract.loaNo && bill.loaNo) patch.loaNo = String(bill.loaNo).trim();
  if (!contract.loaDate && bill.loaDate) patch.loaDate = new Date(bill.loaDate);
  if (!contract.contractValue && typeof bill.agreementValue === 'number' && bill.agreementValue > 0) {
    patch.contractValue = bill.agreementValue;
  }
  if (!contract.contractorName || contract.contractorName === 'Unknown') {
    const name = String(bill.contractorName || '').trim();
    if (name) patch.contractorName = name;
  }
  // "Work as per agreement" is the placeholder written when the agreement text gave
  // no description. The bill's Name of Work is the real thing, and it decides the GCC
  // work group, so a placeholder must not be allowed to stand.
  if (!contract.workDescription || /^work as per agreement$/i.test(contract.workDescription.trim())) {
    const work = String(bill.billWorkDescription || '').trim();
    if (work) patch.workDescription = work;
  }

  if (!Object.keys(patch).length) return null;

  try {
    const updated = await prisma.contract.update({ where: { id: contract.id }, data: patch });
    if (patch.agreementNo) {
      // The chat (and the admin view, and the nudge message) still name the contract
      // by its LOA key until this is refreshed.
      const { mutateTelegramConversationData } = await import('./telegram-conversation');
      await mutateTelegramConversationData(conversationId, (current) => ({
        ...current,
        docContractAgreementNo: billAgreementNo,
      }));
      await sendTelegramMessage(
        chatId,
        `📄 Picked up the agreement number from your bill: <b>${escapeHtml(billAgreementNo)}</b>`,
      );
    }
    return updated;
  } catch (err: any) {
    // The real agreement number may already belong to another contract (P2002). The
    // LOA-keyed contract still works, so carry on with what we have.
    console.error('[Telegram] contract backfill failed:', err?.code || err);
    if (err?.code === 'P2002' && patch.agreementNo) {
      delete patch.agreementNo;
      if (!Object.keys(patch).length) return null;
      try {
        return await prisma.contract.update({ where: { id: contract.id }, data: patch });
      } catch { return null; }
    }
    return null;
  }
}

/**
 * Saves (or updates) the Telegram-computed bill and its PVC calculation so it
 * appears in the bills list / admin, next to the contract. Deduped by
 * contract + bill number + measurement date, so re-running the same bill updates
 * it rather than creating a duplicate. Cumulative continues from the contract's
 * other bills.
 */
async function persistTelegramBill(o: {
  contractId: string;
  billNo: string;
  grossBillAmount: number;
  dateOfMeasurement: Date;
  quarter: string;
  zone: string | null;
  fuelPriceType: string;
  components: { labour: number; plant: number; fuel: number; materials: number; cement: number; steel: number; explosives: number; totalPvc: number };
}): Promise<void> {
  const c = o.components;
  const existing = await prisma.bill.findFirst({
    where: { contractId: o.contractId, billNo: o.billNo, dateOfMeasurement: o.dateOfMeasurement },
    select: { id: true },
  });

  // Cumulative continues from the contract's OTHER bills (exclude this one on update).
  const others = await prisma.bill.findMany({
    where: { contractId: o.contractId, ...(existing ? { id: { not: existing.id } } : {}) },
    include: { pvcCalculation: true },
    orderBy: { dateOfMeasurement: 'desc' },
    take: 1,
  });
  const previousPvcTotal = others[0]?.pvcCalculation?.cumulativePvc ?? 0;
  const cumulativePvc = round2(previousPvcTotal + c.totalPvc);

  const billData = {
    billNo: o.billNo,
    billAmount: o.grossBillAmount,
    grossBillAmount: o.grossBillAmount,
    dateOfMeasurement: o.dateOfMeasurement,
    quarter: o.quarter,
    zone: o.zone,
    fuelPriceType: o.fuelPriceType,
    isChargeable: false,
    processingFee: 0,
    isFinalPvc: false,
    status: 'draft',
  };
  const pvcData = {
    labourPvc: c.labour,
    plantMachineryPvc: c.plant,
    fuelPowerPvc: c.fuel,
    otherMaterialsPvc: c.materials,
    cementPvc: c.cement,
    explosivesPvc: c.explosives,
    steelPvc: c.steel,
    totalPvc: c.totalPvc,
    previousPvcTotal,
    cumulativePvc,
  };

  if (existing) {
    await prisma.bill.update({ where: { id: existing.id }, data: billData });
    await prisma.pvcCalculation.upsert({
      where: { billId: existing.id },
      update: pvcData,
      create: { ...pvcData, contractId: o.contractId, billId: existing.id },
    });
    return;
  }
  const bill = await prisma.bill.create({ data: { ...billData, contractId: o.contractId, createdVia: 'telegram' } });
  await prisma.pvcCalculation.create({ data: { ...pvcData, contractId: o.contractId, billId: bill.id } });
}

/** Everything needed to render the report later, once payment is confirmed. */
export interface StoredReportPayload {
  contractId: string;
  billNo: string;
  measurementDate: string;
  grossBillAmount: number;
  quarter: string;
  zone: string | null;
  fuelIndexName: string;
  steelIndexNames: string[];
  allIndices: string[];
  entriesForReport: any[];
  pvcComponents: { labour: number; plant: number; fuel: number; materials: number; cement: number; steel: number; explosives: number; totalPvc: number };
}

/**
 * Renders and sends the PVC statement for a chat's pending (now paid) report.
 *
 * Called from the Razorpay webhook, which passes the payment link that was paid so
 * the right bill's report goes out when several are waiting. /coupon and /paid carry
 * no link and take the most recent. Clearing the pending payload doubles as the
 * idempotency guard: a webhook retry finds nothing and won't send twice.
 */
export async function renderAndSendPaidReport(chatId: string, paymentLinkId?: string): Promise<boolean> {
  const conversation = await prisma.telegramConversation.findUnique({ where: { chatId } });
  if (!conversation) return false;

  const data = (conversation.conversationData as any) || {};

  // A /payall link pays for several statements at once — deliver each of them. Each
  // pass takes its own render lock and retires its own report, so a webhook retry
  // sends only what didn't make it out the first time.
  const bundle = paymentLinkId
    ? (data.docBundlePayments || []).find((b: any) => b.linkId === paymentLinkId)
    : undefined;
  if (bundle) {
    let delivered = 0;
    for (const coveredLinkId of bundle.coversLinkIds || []) {
      try {
        if (await renderAndSendPaidReport(chatId, coveredLinkId)) delivered++;
      } catch (err) {
        console.error(`[Telegram] bundled report ${coveredLinkId} failed:`, err);
      }
    }
    // Retire the bundle only once everything it covers has gone out, so /paid can
    // still finish the job after a partial failure.
    const stillPending = await countPendingReports(conversation.id, bundle.coversLinkIds || []);
    if (stillPending === 0) {
      const { mutateTelegramConversationData } = await import('./telegram-conversation');
      await mutateTelegramConversationData(conversation.id, (current) => {
        const rest = (current.docBundlePayments || []).filter((b) => b.linkId !== paymentLinkId);
        return { ...current, docBundlePayments: rest.length ? rest : undefined };
      });
    }
    return delivered > 0;
  }
  const pendingList: Array<{ linkId: string; payload: StoredReportPayload }> = data.docPendingReports || [];
  const matched = paymentLinkId ? pendingList.find((r) => r.linkId === paymentLinkId) : undefined;
  // A named link that isn't in the list has already been delivered (or isn't ours).
  // Falling back to the single slot here would send some OTHER bill's statement —
  // one nobody has paid for — so stop instead. The fallback is only for chats with
  // no list at all: older ones, and /coupon or /paid, which name no link.
  if (paymentLinkId && pendingList.length && !matched) return false;
  const payload: StoredReportPayload | undefined = matched?.payload ?? data.docPendingReport;
  if (!payload) return false;
  // Which entry to retire on success: the one paid for, or — with no link to go on —
  // the most recent, which is what the single slot holds.
  const deliveredLinkId = matched?.linkId ?? data.docPendingPaymentLinkId;

  const contract = await prisma.contract.findUnique({ where: { id: payload.contractId } });
  if (!contract) return false;

  // Re-render lock: rendering + embedding index docs is heavy, so refuse to start a
  // second render of THIS report while one is in flight (guards against coupon/paid
  // spam). Keyed per report, not per chat — paying for two bills at once must produce
  // two statements, and a chat-wide lock would silently drop the second. Self-expires
  // after 2 min so a crashed render can't wedge the chat forever.
  const lockKey = deliveredLinkId || 'single';
  const startedAt = Date.parse(data.reportDelivering?.[lockKey] || data.reportDeliveringAt || '') || 0;
  if (startedAt && Date.now() - startedAt < 120000) {
    console.log(`[Telegram] report ${lockKey} already delivering for chat ${chatId}; skipping duplicate`);
    return true;
  }
  const { mutateTelegramConversationData } = await import('./telegram-conversation');
  const releaseLock = (current: any) => {
    const locks = { ...(current.reportDelivering || {}) };
    delete locks[lockKey];
    return Object.keys(locks).length ? locks : undefined;
  };
  await mutateTelegramConversationData(conversation.id, (current) => ({
    ...current,
    reportDelivering: { ...((current as any).reportDelivering || {}), [lockKey]: new Date().toISOString() },
    reportDeliveringAt: undefined,
  }) as any);

  try {
    console.log(`[Telegram] rendering paid report for chat ${chatId}, agreement ${contract.agreementNo}`);
    await sendTelegramChatAction(chatId, 'upload_document');
    const quarterlyAverages = await getQuarterlyAverages(
      payload.quarter,
      payload.allIndices,
      contract.baseMonth,
      'auto',
    );

    const pdfBuf = await buildIrReport({
      contract,
      billNo: payload.billNo,
      measurementDate: new Date(payload.measurementDate),
      grossBillAmount: payload.grossBillAmount,
      quarter: payload.quarter,
      zone: payload.zone,
      fuelIndexName: payload.fuelIndexName,
      steelIndexNames: payload.steelIndexNames,
      quarterlyAverages,
      entriesForReport: payload.entriesForReport,
      pvcComponents: payload.pvcComponents,
      allIndices: payload.allIndices,
    });
    console.log(`[Telegram] paid report built (${(pdfBuf.length / 1024).toFixed(0)} KB); sending…`);

    const realAgr = displayAgreementNo(contract.agreementNo);
    const safeAgr = realAgr.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const safeBill = String(payload.billNo || 'bill').replace(/[^A-Za-z0-9]+/g, '-');

    // Send FIRST; only clear the pending report once it actually went out, so a failed
    // send can be retried with /paid or the coupon instead of losing the report.
    await sendTelegramDocumentBytes(
      chatId,
      pdfBuf,
      `PVC-${safeAgr}-${safeBill}.pdf`,
      `✅ Here is your PVC statement.\n📎 ${escapeHtml(realAgr)}`,
    );

    // Retire the delivered report AND clear its lock on success. Reports for the
    // other bills stay pending — they have their own payment links.
    await mutateTelegramConversationData(conversation.id, (current) => {
      // With no link to match on (older chats), the single slot was what we sent, so
      // the whole list goes: it can only be holding that same report.
      const rest = deliveredLinkId
        ? (current.docPendingReports || []).filter((r) => r.linkId !== deliveredLinkId)
        : [];
      const newest = rest[rest.length - 1];
      // Drop combined links with nothing left to deliver — a coupon can empty one,
      // and a dead link that still takes money would be worse than no link.
      const stillPending = new Set(rest.map((r) => r.linkId));
      const bundles = (current.docBundlePayments || []).filter(
        (b) => (b.coversLinkIds || []).some((id) => stillPending.has(id)),
      );
      return {
        ...current,
        docPendingReports: rest.length ? rest : undefined,
        docBundlePayments: bundles.length ? bundles : undefined,
        // The single slot follows: it must never still point at what was just sent.
        docPendingReport: newest?.payload,
        docPendingPaymentLinkId: newest?.linkId,
        reportDelivering: releaseLock(current),
        reportDeliveringAt: undefined,
      } as any;
    });

    notifyTelegramAdmin(
      `📎 <b>PVC report delivered</b>\n\n` +
        `👤 Chat: <code>${chatId}</code>\n` +
        `📄 Agreement: ${escapeHtml(realAgr)}\n` +
        `🔢 Bill: ${escapeHtml(String(payload.billNo || '-'))}\n` +
        `📈 PVC: ₹${formatMoney(payload.pvcComponents?.totalPvc ?? 0)}`,
    ).catch(() => {});
    return true;
  } catch (err) {
    // Release the lock so the user can retry (with /paid or the coupon).
    await mutateTelegramConversationData(conversation.id, (current) => ({
      ...current,
      reportDelivering: releaseLock(current),
      reportDeliveringAt: undefined,
    }) as any);
    throw err;
  }
}

/**
 * Builds a "Cement (derived)" entry: for each DSR item that consumes cement, work
 * out the cement quantity (MT) from its DSR coefficient. The report renders this as
 * the CEMENT BREAKUP table (with the qty x coefficient working) and does NOT add it
 * to the bill gross — the work item's rate already includes its cement.
 * Returns null when nothing matches a coefficient.
 */
async function buildDerivedCementEntry(items: any[]): Promise<any | null> {
  const coeffs = await prisma.dsrCementCoefficient.findMany({ where: { isActive: true } });
  if (!coeffs.length) return null;
  const byCode = new Map(coeffs.map((c) => [normalizeDsrCode(c.dsrCode), c]));

  // Cement supply rate (Rs per MT) from a direct MT cement-supply line, if present.
  const MT_UNITS = ['MT', 'M.T.', 'TONNE', 'METRIC TONNE', 'METRIC TON'];
  let cementRatePerMt: number | null = null;
  for (const it of items) {
    const unit = String(it.unit || '').trim().toUpperCase().replace(/\s+/g, ' ');
    const isCementSupply = /cement/i.test(String(it.description || '')) || /^\d+C$/.test(String(it.suggestedClassificationCode || ''));
    if (MT_UNITS.includes(unit) && isCementSupply) {
      const q = Number(it.quantitySinceLastBill || 0);
      const a = Number(it.amountSinceLastBill || 0);
      const r = Number(it.agreementRate || 0);
      cementRatePerMt = q > 0 && a > 0 ? a / q : (r > 0 ? r : null);
      if (cementRatePerMt) break;
    }
  }

  const inputs = items
    .filter((it) => it.sourceBook === 'DSR_2021')
    .map((it) => {
      const coefficient = matchCementCoefficient(byCode, normalizeDsrCode(it.dsrCode));
      return coefficient ? {
        dsrCode: normalizeDsrCode(it.dsrCode),
        description: String(it.description || ''),
        unit: String(it.unit || ''),
        quantity: Number(it.quantitySinceLastBill || 0),
        amount: Number(it.amountSinceLastBill || 0),
        coefficient,
        _srcQty: Number(it.quantitySinceLastBill || 0),
        _workUnit: coefficient.workUnit,
      } : null;
    })
    .filter(Boolean) as any[];

  if (!inputs.length) return null;

  // 1:1 with inputs, so pair each result with its input BEFORE filtering to keep
  // sourceQty / workUnit aligned.
  const results = calculateDsrCementRequirement(inputs, cementRatePerMt);
  const itemRows = results
    .map((r, k) => ({ r, input: inputs[k] }))
    .filter(({ r }) => r.matched && r.cementQuantity > 0)
    .map(({ r, input }) => ({
      itemNumber: `${r.dsrCode} (Cement)`,
      quantity: round2(r.cementQuantity),
      agreementRate: cementRatePerMt || 0,
      sourceQty: input?._srcQty,
      coefficient: r.coefficient,
      workUnit: input?._workUnit,
    }));

  if (!itemRows.length) return null;

  return {
    isDerivedCement: true,
    description: 'Cement (derived)',
    amount: 0, // never summed into the gross
    scheduleItem: '',
    itemRows,
  };
}

/**
 * Builds the in-memory bill object and renders the IR standard PDF. The report
 * generator only needs the shape (not a saved DB row), so nothing is persisted.
 */
async function buildIrReport(o: {
  contract: any;
  billNo: string;
  measurementDate: Date;
  grossBillAmount: number;
  quarter: string;
  zone: string | null;
  fuelIndexName: string;
  steelIndexNames: string[];
  quarterlyAverages: any[];
  entriesForReport: any[];
  pvcComponents: { labour: number; plant: number; fuel: number; materials: number; cement: number; steel: number; explosives: number; totalPvc: number };
  allIndices: string[];
}): Promise<Buffer> {
  const { generateIRStandardReport } = await import('@/lib/pdf/generators/ir-standard-report');
  const { contract, pvcComponents: c } = o;
  const baseMonth = new Date(contract.baseMonth);

  // Cumulative continues from any bills already saved on this contract (usually 0
  // for a Telegram-only contract).
  const prevBills = await prisma.bill.findMany({
    where: { contractId: contract.id },
    include: { pvcCalculation: true },
    orderBy: { dateOfMeasurement: 'desc' },
    take: 1,
  });
  const previousCumulativePvc = prevBills[0]?.pvcCalculation?.cumulativePvc ?? 0;

  // Report branding + division from the contract owner.
  let organizationName = 'INDIAN RAILWAYS';
  let divisionName = '';
  try {
    if (contract.userId) {
      const owner = await prisma.user.findUnique({
        where: { id: contract.userId },
        select: { reportHeaderText: true, divisionName: true },
      });
      if (owner?.reportHeaderText) organizationName = owner.reportHeaderText;
      if (owner?.divisionName) divisionName = owner.divisionName;
    }
  } catch { /* branding is optional */ }

  // Monthly index history (base month → quarter end) and provisional status, so the
  // report's index sections are complete. Best-effort — the report still renders
  // from quarterlyAverages if these fail.
  let allHistoricalMonthlyData: { indexName: string; month: string; value: number }[] = [];
  let isProvisional = false;
  let provisionalIndices: string[] = [];
  try {
    const months = getQuarterMonths(o.quarter, baseMonth);
    const qEnd = months[months.length - 1];
    const qEndDate = new Date(qEnd.getFullYear(), qEnd.getMonth() + 1, 1);
    const priceIndexes = await prisma.priceIndex.findMany({ where: { name: { in: o.allIndices } } });
    const historicalRaw = await prisma.monthlyIndexValue.findMany({
      where: {
        priceIndexId: { in: priceIndexes.map((p) => p.id) },
        month: { gte: new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1), lt: qEndDate },
      },
      include: { priceIndex: true },
    });
    allHistoricalMonthlyData = historicalRaw.map((mv) => ({
      indexName: mv.priceIndex.name,
      month: new Date(mv.month).toISOString().slice(0, 7),
      value: mv.value,
    }));
    const { getBillIndicesStatus } = await import('@/lib/index-status');
    // The fuel and steel names are already resolved for this bill, so pass them straight
    // through rather than re-deriving them from the zone.
    const status = await getBillIndicesStatus(o.quarter, baseMonth, [
      'Labour', 'RBI Plant Machinery', 'RBI Other Materials', 'RBI Cement',
      o.fuelIndexName, ...o.steelIndexNames,
    ]);
    isProvisional = status.isProvisional;
    provisionalIndices = status.provisionalIndices;
  } catch (err) {
    console.warn('[Telegram] report index enrichment skipped:', err);
  }

  const bill = {
    billNo: o.billNo,
    dateOfMeasurement: o.measurementDate,
    grossBillAmount: o.grossBillAmount,
    billAmount: o.grossBillAmount,
    quarter: o.quarter,
    zone: o.zone,
    fuelPriceType: 'four_city_avg',
    contract: {
      agreementNo: displayAgreementNo(contract.agreementNo),
      contractorName: contract.contractorName,
      workDescription: contract.workDescription,
      dateOfOpening: contract.dateOfOpening,
      baseMonth: contract.baseMonth,
      contractValue: contract.contractValue,
      completionPeriodMonths: contract.completionPeriodMonths,
      loaNo: contract.loaNo,
      loaDate: contract.loaDate,
      isExtended: contract.isExtended,
      extensionType: contract.extensionType,
      hasRailwaySuppliedMaterials: contract.hasRailwaySuppliedMaterials,
    },
    pvcCalculation: {
      labourPvc: c.labour,
      plantMachineryPvc: c.plant,
      fuelPowerPvc: c.fuel,
      cementPvc: c.cement,
      steelPvc: c.steel,
      otherMaterialsPvc: c.materials,
      explosivesPvc: c.explosives,
      dedicatedCementPvc: 0,
      dedicatedSteelTmtBarsPvc: 0,
      dedicatedSteelAngleChannelPvc: 0,
      dedicatedSteelPlatesPvc: 0,
      dedicatedSteelOtherSectionsPvc: 0,
      totalPvc: c.totalPvc,
      previousPvcTotal: previousCumulativePvc,
      cumulativePvc: round2(previousCumulativePvc + c.totalPvc),
    },
    classificationEntries: o.entriesForReport,
  };

  const statementBytes = await generateIRStandardReport({
    bill: bill as any,
    quarterlyAverages: o.quarterlyAverages,
    baseMonth,
    organizationName,
    divisionName,
    fuelIndexName: o.fuelIndexName,
    steelIndexNames: o.steelIndexNames,
    isProvisional,
    provisionalIndices,
    allHistoricalMonthlyData,
    previousCumulativePvc,
  });

  // Append the supporting component index documents (labour/fuel/cement/steel
  // index proofs) — same as the website's report, so it isn't just the statement.
  // Best-effort: if embedding fails, return the statement alone rather than nothing.
  try {
    const { embedComponentIndicesRange } = await import('./pdf/utils/labour-index-embedder');
    const { ComponentType } = await import('@prisma/client');
    const STEEL_TYPES = [ComponentType.TMT_BARS, ComponentType.ANGLE_CHANNEL, ComponentType.PLATES, ComponentType.OTHER_SECTIONS];
    const NON_STEEL = Object.values(ComponentType).filter((t) => !STEEL_TYPES.includes(t as any)) as any[];

    const hasSteel = o.entriesForReport.some(
      (e: any) => (Array.isArray(e.steelTypes) && e.steelTypes.length > 0) || (e.subClassification?.steel ?? 0) > 0,
    );

    // The JPC steel sheets are a paid annex (Rs 500 once per bill, charged on the
    // website's single report). The bot never charges, so it must not be the free way
    // around that: the Telegram report goes out WITHOUT the steel sheets — unless this
    // bill was already paid for on the website (matched by contract + bill number),
    // in which case they ride along exactly as they would there. Any lookup failure
    // (e.g. the pending-DB column not applied yet) counts as unpaid — free beats
    // handing out the paid annex blind.
    let jpcPaid = false;
    if (hasSteel) {
      try {
        const billsTable = await (await import('./db-schema')).schemaQualified('bills');
        const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM ${billsTable} WHERE "contractId" = $1 AND "billNo" = $2 AND "jpcDocsPurchasedAt" IS NOT NULL LIMIT 1`,
          contract.id, o.billNo,
        );
        jpcPaid = rows.length > 0;
      } catch { /* treat as unpaid */ }
    }

    const withDocs = await embedComponentIndicesRange(new Uint8Array(statementBytes), {
      startDate: baseMonth,
      endDate: new Date(o.measurementDate),
      componentTypes: hasSteel && jpcPaid ? undefined : NON_STEEL,
    });
    return Buffer.from(withDocs);
  } catch (err) {
    console.error('[Telegram] index-document embedding failed:', err);
    return statementBytes;
  }
}
