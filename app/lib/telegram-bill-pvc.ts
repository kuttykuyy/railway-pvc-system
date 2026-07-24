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
} from './telegram-api';
import { extractBillDetailsDirect } from '@/app/api/bills/cement-analysis/route';
import { getQuarterFromDate, getQuarterMonths, calculateClassificationEntryPvc } from './pvc-calculations';
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

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

  // 1. Download the bill PDF bytes.
  await sendTelegramMessage(chatId, '📊 Reading the bill items…');
  await sendTelegramChatAction(chatId, 'typing');
  let pdfBytes: Buffer;
  try {
    pdfBytes = await downloadTelegramFile(billFileId);
  } catch (err) {
    console.error('[Telegram] bill download failed:', err);
    await sendTelegramMessage(chatId, '❌ Could not download the bill PDF. Please send it again.');
    return;
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
    return;
  }
  const items = billDetails.items || [];
  if (!items.length) {
    await sendTelegramMessage(chatId, '❌ I could not find any bill items in that PDF. Please check it is the running bill.');
    return;
  }

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
  const entriesForReport: any[] = [];
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

    entriesForReport.push({
      amount: e.amount,
      steelTypes: entrySteelTypes,
      subClassification: subById.get(e.subClassificationId),
    });
  }

  // 5. Reply with the PVC estimate + component breakdown.
  const comp = (label: string, v: number) => (Math.abs(v) >= 0.005 ? `\n   ${label}: ₹${formatMoney(v)}` : '');
  const sign = totalPvc >= 0 ? '' : '-';
  const billNo = billDetails.billNo ? String(billDetails.billNo) : '';
  const billNoLabel = billNo ? ` (Bill ${escapeHtml(billNo)})` : '';

  await sendTelegramMessage(
    chatId,
    `✅ <b>PVC estimate${billNoLabel}</b>\n\n` +
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
      `\n\n<i>⚠️ Automatic estimate from the AI's reading — no review step in chat. ` +
      `Open the contract to check the classification:</i>\n${contractLink}` +
      (unclassifiedAmount > 0
        ? `\n\n<i>Note: ₹${formatMoney(unclassifiedAmount)} of items couldn't be classified and were left out of the PVC.</i>`
        : ''),
  );

  // 6. Render the IR standard PDF report and send it as a document.
  await sendTelegramChatAction(chatId, 'upload_document');
  try {
    const pdfBuf = await buildIrReport({
      contract,
      billNo: billNo || 'RA Bill',
      measurementDate,
      grossBillAmount,
      quarter,
      zone,
      fuelIndexName,
      steelIndexNames,
      quarterlyAverages,
      entriesForReport,
      pvcComponents: { labour, plant, fuel, materials, cement, steel, explosives, totalPvc },
      allIndices,
    });

    const safeAgr = String(contract.agreementNo).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const safeBill = (billNo || 'bill').replace(/[^A-Za-z0-9]+/g, '-');
    await sendTelegramDocumentBytes(
      chatId,
      pdfBuf,
      `PVC-${safeAgr}-${safeBill}.pdf`,
      `📎 IR PVC statement — ${escapeHtml(contract.agreementNo)}`,
    );
  } catch (err: any) {
    console.error('[Telegram] IR report generation failed:', err);
    await sendTelegramMessage(
      chatId,
      `⚠️ The PVC amount above is ready, but I couldn't generate the PDF report this time. You can download it from the site:\n${contractLink}`,
    );
  }
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
    const status = await getBillIndicesStatus(o.quarter, baseMonth);
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
      agreementNo: contract.agreementNo,
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

  return generateIRStandardReport({
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
}
