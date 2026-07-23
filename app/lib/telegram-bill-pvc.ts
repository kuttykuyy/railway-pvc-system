/**
 * Stage 2a: read an uploaded running-bill PDF and reply with the PVC amount in chat.
 *
 * Pipeline: download the bill PDF -> reuse the app's bill extractor to get line
 * items -> map each item to a PVC sub-classification by its suggested code -> run
 * the SAME PVC engine the website uses (quarterly index averages x classification
 * component split) -> reply with the total and a component breakdown.
 *
 * IMPORTANT: this is an AUTOMATIC ESTIMATE. There is no in-chat review screen like
 * the website has, so the classification is taken from the AI's reading. The reply
 * says so and links to the contract on the site to verify/adjust. Saving the bill +
 * the PDF report is Stage 2b.
 */

import { prisma } from './db';
import { sendTelegramMessage, sendTelegramChatAction, downloadTelegramFile, getPublicSiteUrl } from './telegram-api';
import { extractBillDetailsWithAi } from '@/app/api/bills/cement-analysis/route';
import { getQuarterFromDate, calculateClassificationEntryPvc } from './pvc-calculations';
import { getQuarterlyAverages } from './db-utils';
import { getSteelIndexNamesForZone, getFuelIndexNameForBill } from './zone-steel-city-mapping';
import { extractSteelTypesFromEntries } from './steel-type-handler';
import { inferMainClassification } from './work-classification';

export interface ProcessUploadedBillArgs {
  chatId: string;
  conversationId: string;
  contractId: string;
  billFileId: string;
  billFileName: string;
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

function formatMoney(value: number): string {
  return (Number(value) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function processUploadedBillPvc(args: ProcessUploadedBillArgs): Promise<void> {
  const { chatId, contractId, billFileId, billFileName } = args;

  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract) {
    await sendTelegramMessage(chatId, '❌ Could not find the contract for this bill. Please resend the agreement PDF.');
    return;
  }

  const baseUrl = getPublicSiteUrl();
  const contractLink = `${baseUrl}/contracts/${contractId}`;

  // 1. Download the bill PDF and wrap it as a File for the extractor.
  await sendTelegramMessage(chatId, '📊 Reading the bill items…');
  await sendTelegramChatAction(chatId, 'typing');
  let file: File;
  try {
    const bytes = await downloadTelegramFile(billFileId);
    file = new File([bytes], billFileName, { type: 'application/pdf' });
  } catch (err) {
    console.error('[Telegram] bill download failed:', err);
    await sendTelegramMessage(chatId, '❌ Could not download the bill PDF. Please send it again.');
    return;
  }

  // 2. Extract the bill line items (same engine as the website).
  let items;
  let billDetails;
  try {
    billDetails = await extractBillDetailsWithAi(file, baseUrl, contractId);
    items = billDetails.items || [];
  } catch (err: any) {
    console.error('[Telegram] bill extraction failed:', err);
    await sendTelegramMessage(
      chatId,
      `❌ I couldn't read the bill: ${escapeHtml(err?.message || 'extraction failed')}\n\n` +
        `Make sure it's a digitally generated IREPS PDF (not a scan/photo).`,
    );
    return;
  }
  if (!items.length) {
    await sendTelegramMessage(chatId, '❌ I could not find any bill items in that PDF. Please check it is the running bill.');
    return;
  }

  // 3. Map each item to a PVC sub-classification by its suggested code, summing
  //    amounts per classification. Blank/unknown codes fall back to the bill's main
  //    group ("<group>A"), then to the work-description inferred group.
  const subs = await prisma.subClassification.findMany({
    where: { isActive: true },
    select: { id: true, code: true, groupId: true, steel: true },
  });
  const byCode = new Map(subs.map((s) => [s.code.toUpperCase(), s]));

  const groupCode = String(billDetails.classificationGroupCode || inferMainClassification(contract.workDescription).code || '').trim();
  const defaultSub =
    (groupCode && byCode.get(`${groupCode}A`)) ||
    (groupCode ? subs.find((s) => s.code.toUpperCase().startsWith(groupCode)) : undefined) ||
    subs.find((s) => s.code.toUpperCase().endsWith('A'));

  type EntryAgg = { subClassificationId: string; amount: number; steel: number; steelTypes: Set<string> };
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
    const cur = agg.get(sub.id) || { subClassificationId: sub.id, amount: 0, steel: sub.steel, steelTypes: new Set<string>() };
    cur.amount = round2(cur.amount + amt);
    if (it.isSteelItem && it.steelType) cur.steelTypes.add(it.steelType);
    agg.set(sub.id, cur);
  }

  const entries = [...agg.values()];
  if (!entries.length) {
    await sendTelegramMessage(chatId, '❌ I read the bill but could not classify its items for PVC. Please review it on the site:\n' + contractLink);
    return;
  }

  const grossFromItems = round2(entries.reduce((s, e) => s + e.amount, 0) + unclassifiedAmount);
  const grossBillAmount = round2(Number(billDetails.grossBillAmount) || grossFromItems);

  // 4. Run the PVC engine over the entries for the bill's quarter.
  const measurementDate = billDetails.measurementDate ? new Date(billDetails.measurementDate) : new Date();

  // 17B-extended contracts freeze the quarter at the original completion date.
  let quarterDate = measurementDate;
  if (contract.isExtended && contract.extensionType === '17B' && contract.originalCompletionDate && measurementDate > contract.originalCompletionDate) {
    quarterDate = contract.originalCompletionDate;
  }
  const quarter = getQuarterFromDate(quarterDate, contract.baseMonth);

  const zone = (contract as any).railwayZone || null;
  const extractedSteelTypes = await extractSteelTypesFromEntries(
    entries.map((e) => ({ subClassificationId: e.subClassificationId, amount: e.amount, steelTypes: [...e.steelTypes] })),
  );
  const steelIndexNames = getSteelIndexNamesForZone(zone);
  const fuelIndexName = getFuelIndexNameForBill(zone, 'four_city_avg');
  const allIndices = ['Labour', 'RBI Plant Machinery', fuelIndexName, 'RBI Other Materials', 'RBI Cement', 'RBI Explosives', ...steelIndexNames];
  const quarterlyAverages = await getQuarterlyAverages(quarter, allIndices, contract.baseMonth, 'auto');

  if (!quarterlyAverages || quarterlyAverages.length === 0) {
    await sendTelegramMessage(
      chatId,
      `⚠️ I read the bill (gross ₹${formatMoney(grossBillAmount)}, quarter <b>${quarter}</b>), but the price indices for this quarter aren't available yet, so I can't calculate the PVC.\n\n` +
        `This is the same rule as the website — the PVC can be worked out once the indices for ${quarter} are published.`,
    );
    return;
  }

  let totalPvc = 0, labour = 0, plant = 0, fuel = 0, materials = 0, cement = 0, steel = 0, explosives = 0;
  for (const e of entries) {
    const entrySteelTypes = e.steelTypes.size > 0
      ? [...e.steelTypes]
      : (e.steel > 0 && extractedSteelTypes.length > 0 ? extractedSteelTypes : []);
    const pvc = await calculateClassificationEntryPvc(
      { subClassificationId: e.subClassificationId, amount: e.amount, steelTypes: entrySteelTypes },
      quarterlyAverages,
    );
    labour += pvc.labourPvc;
    plant += pvc.plantMachineryPvc;
    fuel += pvc.fuelPowerPvc;
    materials += pvc.otherMaterialsPvc;
    cement += pvc.cementPvc;
    steel += pvc.steelPvc;
    explosives += pvc.explosivesPvc;
    totalPvc += pvc.totalPvc;
  }

  // 5. Reply with the PVC estimate + component breakdown.
  const comp = (label: string, v: number) => (Math.abs(v) >= 0.005 ? `\n   ${label}: ₹${formatMoney(v)}` : '');
  const sign = totalPvc >= 0 ? '' : '-';
  const billNo = billDetails.billNo ? ` (Bill ${escapeHtml(String(billDetails.billNo))})` : '';

  await sendTelegramMessage(
    chatId,
    `✅ <b>PVC estimate${billNo}</b>\n\n` +
      `📄 Agreement: <b>${escapeHtml(contract.agreementNo)}</b>\n` +
      `📅 Quarter: <b>${quarter}</b>\n` +
      `💰 Gross bill: <b>₹${formatMoney(grossBillAmount)}</b>\n` +
      `📈 <b>PVC amount: ${sign}₹${formatMoney(Math.abs(totalPvc))}</b>\n` +
      `<i>Breakdown:</i>` +
      comp('Labour', labour) +
      comp('Plant &amp; Machinery', plant) +
      comp('Fuel', fuel) +
      comp('Other materials', materials) +
      comp('Cement', cement) +
      comp('Steel', steel) +
      comp('Explosives', explosives) +
      `\n\n<i>⚠️ This is an automatic estimate from the AI's reading of the bill — there's no review step in chat. ` +
      `Open the contract to check the classification and save the bill:</i>\n${contractLink}` +
      (unclassifiedAmount > 0
        ? `\n\n<i>Note: ₹${formatMoney(unclassifiedAmount)} of items couldn't be classified and were left out of the PVC.</i>`
        : ''),
  );
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
