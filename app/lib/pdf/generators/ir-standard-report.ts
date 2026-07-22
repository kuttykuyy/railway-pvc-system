/**
 * Indian Railway Standard PVC Statement Generator
 * Format as per Railway Board GCC Clause 46A Proforma (17A / 17B govern the extension caps)
 * A4 Landscape for better readability
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import type { SteelBreakdownSection } from '@/lib/jpc-items';
import { findScheduleRates } from '@/lib/contract-schedules';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

interface SubClassification {
  code?: string;
  name?: string;
  labour: number;
  plantMachinery: number;
  fuel: number;
  cement: number;
  steel: number;
  otherMaterials: number;
  explosives: number;
  fixed: number;
}

interface ClassificationEntry {
  amount: number;
  description?: string | null;
  scheduleItem?: string | null;
  itemNumber?: string | null;
  quantity?: number | null;
  agreementRate?: number | null;
  itemRows?: Array<{
    itemNumber?: string | null;
    quantity?: number | null;
    agreementRate?: number | null;
  }> | null;
  steelTypes?: string[] | null;
  classificationJustification?: string | null;
  subClassification?: SubClassification | null;
}

interface PvcCalculation {
  labourPvc: number;
  plantMachineryPvc: number;
  fuelPowerPvc: number;
  cementPvc: number;
  steelPvc: number;
  otherMaterialsPvc: number;
  explosivesPvc: number;
  dedicatedCementPvc?: number;
  dedicatedSteelTmtBarsPvc?: number;
  dedicatedSteelAngleChannelPvc?: number;
  dedicatedSteelPlatesPvc?: number;
  dedicatedSteelOtherSectionsPvc?: number;
  totalPvc: number;
  previousPvcTotal: number;
  cumulativePvc: number;
}

interface Contract {
  agreementNo: string;
  contractorName: string;
  workDescription: string;
  dateOfOpening: string | Date;
  baseMonth: string | Date;
  contractValue?: number | null;
  completionPeriodMonths?: number | null;
  loaNo?: string | null;
  loaDate?: string | Date | null;
  isExtended?: boolean;
  extensionType?: string | null;
  hasRailwaySuppliedMaterials?: boolean;
}

interface Bill {
  billNo: string;
  pvcNumber?: string | null;
  dateOfMeasurement: string | Date;
  grossBillAmount?: number | null;
  billAmount: number;
  quarter: string;
  zone?: string | null;
  fuelPriceType?: string | null;
  isFinalPvc?: boolean;
  contract: Contract;
  pvcCalculation?: PvcCalculation | null;
  classificationEntries?: ClassificationEntry[];
}

interface QuarterlyAverage {
  indexName: string;
  average: number;
  baseValue: number;
  monthlyValues?: { month: string; value: number }[];
}

interface IRStandardReportOptions {
  bill: Bill;
  quarterlyAverages: QuarterlyAverage[];
  baseMonth: Date;
  organizationName?: string;
  divisionName?: string;
  fuelIndexName?: string;
  steelIndexNames?: string[];
  isProvisional?: boolean;
  provisionalIndices?: string[];
  allHistoricalMonthlyData?: { indexName: string; month: string; value: number; isProvisional?: boolean; isBorrowed?: boolean }[];
  previousCumulativePvc?: number;
  steelBreakdown?: SteelBreakdownSection[];
  /** Which sections to render (from the chosen report template). Omitted keys default to shown. */
  sections?: {
    contractDetails?: boolean;
    workClassification?: boolean;
    monthlyIndices?: boolean;
    showCalculationSteps?: boolean;
  };
}

// jsPDF Helvetica does not support Rs. symbol, use "Rs." instead
function fmtMoney(n: number): string {
  return 'Rs. ' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmt(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtIdx(n: number): string {
  return n.toFixed(2);
}

function fmtVariation(n: number): string {
  return (n * 100).toFixed(4) + '%';
}

// jsPDF's built-in Helvetica is WinAnsi-only, so characters outside Latin-1 (₹, ×,
// en/em dashes, curly quotes) render as garbage. Map the common ones to safe text and
// drop anything else still outside the range.
function pdfSafe(value: unknown): string {
  return String(value ?? '')
    .replace(/₹/g, 'Rs.')                 // ₹ rupee
    .replace(/[×✕✖]/g, 'x')     // × multiplication
    .replace(/[‒-―−]/g, '-')    // figure/en/em dash, minus
    .replace(/[‘’‛]/g, "'")     // curly single quotes
    .replace(/[“”]/g, '"')           // curly double quotes
    .replace(/•/g, '-')                    // bullet
    .replace(/[^\x00-\xFF]/g, '');             // drop any remaining non-Latin1
}

// Rewrites a stored classification justification for display: strips the internal
// price-variation working note, and rewords the older terse "Refined classification:
// ..." text into GCC-clause style. Cement-supply rows (code ending in C) get a
// cement-specific reason, so a "...C - supply of cement" row is never described as a
// general concrete/masonry item (the split-off cement portion used to inherit the
// parent item's justification).
function formatJustification(
  raw: string | null | undefined,
  sub: SubClassification | null | undefined,
  description?: string | null,
): string {
  const text = String(raw || '')
    .replace(/\s*(Checking the price variation|PVC comparison)\b[\s\S]*$/i, '')
    .trim();
  const code = sub?.code || '';
  const subName = sub?.name ? ` (${sub.name})` : '';
  const dsrMatch = text.match(/DSR(?:\s+coefficient)?\s+([\d.]+)/i);
  const dsr = dsrMatch ? ` (DSR ${dsrMatch[1]})` : '';
  const isTerse = /^Refined classification:/i.test(text);
  const isCementSupply = /c$/i.test(code);
  const cleanDesc = String(description || '')
    .replace(/\s*\((?:Excluding Cement|Cement Portion)\)\s*$/i, '')
    .trim();

  if (isCementSupply && (isTerse || /general concrete|masonry item/i.test(text) || text === '')) {
    return `Under GCC Clause 46A this represents the cement supplied / consumed for the work${cleanDesc ? ` "${cleanDesc}"` : ''}${dsr}, classified under Sub-classification ${code}${subName} so that the cement price index is applied to this value.`;
  }
  if (isTerse) {
    return `Under GCC Clause 46A, item${cleanDesc ? ` "${cleanDesc}"` : ''}${dsr} is a general work item classified under Sub-classification ${code}${subName}; the cement it consumes is valued and grouped separately.`;
  }
  return text || cleanDesc || '-';
}

// Natural ("human") sort for dotted item numbers like 2.25, 5.9.1, 5.33.2.1,
// 16.3.3-CEM. Compares segment-by-segment: numeric chunks numerically, text
// chunks lexically — so 5.9 sorts before 5.33 and a "-CEM" suffix stays next to
// its base item.
function compareItemNumbers(a: string, b: string): number {
  const tokenize = (s: string): (number | string)[] =>
    (s.trim().match(/\d+|\D+/g) || []).map(t => (/^\d+$/.test(t) ? Number(t) : t.toLowerCase()));
  const ta = tokenize(a);
  const tb = tokenize(b);
  const n = Math.max(ta.length, tb.length);
  for (let i = 0; i < n; i++) {
    const x = ta[i];
    const y = tb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x - y;
    } else {
      const xs = String(x);
      const ys = String(y);
      if (xs !== ys) return xs < ys ? -1 : 1;
    }
  }
  return 0;
}

function getIndexAvg(qa: QuarterlyAverage[], ...names: string[]): number {
  for (const name of names) {
    const found = qa.find(q => q.indexName === name);
    if (found) return found.average;
  }
  return 0;
}

function getIndexBase(qa: QuarterlyAverage[], ...names: string[]): number {
  for (const name of names) {
    const found = qa.find(q => q.indexName === name);
    if (found) return found.baseValue;
  }
  return 0;
}

function computeWeightedComponents(entries: ClassificationEntry[], billAmount: number) {
  const w = { labour: 0, plantMachinery: 0, fuel: 0, cement: 0, steel: 0, otherMaterials: 0, explosives: 0, fixed: 0 };
  if (!entries || entries.length === 0 || billAmount <= 0) return w;
  for (const entry of entries) {
    const sub = entry.subClassification;
    if (!sub) continue;
    const ratio = entry.amount / billAmount;
    w.labour          += (sub.labour || 0)          * ratio / 100;
    w.plantMachinery  += (sub.plantMachinery || 0)  * ratio / 100;
    w.fuel            += (sub.fuel || 0)             * ratio / 100;
    w.cement          += (sub.cement || 0)           * ratio / 100;
    w.steel           += (sub.steel || 0)            * ratio / 100;
    w.otherMaterials  += (sub.otherMaterials || 0)   * ratio / 100;
    w.explosives      += (sub.explosives || 0)       * ratio / 100;
    w.fixed           += (sub.fixed || 0)            * ratio / 100;
  }
  return w;
}

export async function generateIRStandardReport(opts: IRStandardReportOptions): Promise<Buffer> {
  const {
    bill,
    quarterlyAverages,
    baseMonth,
    organizationName = 'INDIAN RAILWAYS',
    divisionName = '',
    fuelIndexName = 'MPNG Fuel',
    steelIndexNames = ['Steel TMT Bars'],
    isProvisional = false,
    provisionalIndices = [],
    allHistoricalMonthlyData = [],
    previousCumulativePvc,
    steelBreakdown = [],
    sections = {},
  } = opts;

  // Section visibility from the report template — default to shown when not specified.
  const showContract = sections.contractDetails !== false;
  const showClassification = sections.workClassification !== false;
  const showMonthlyIndices = sections.monthlyIndices !== false;
  const showCalcSteps = sections.showCalculationSteps !== false;

  // A4 Landscape: 297 x 210 mm
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  autoTable(pdf, {});

  const pageW = 297;
  const pageH = 210;
  const mL = 12;
  const mR = 12;
  const mT = 12;
  const contentW = pageW - mL - mR;  // 273mm

  let y = mT;

  const pvc = bill.pvcCalculation;
  const billAmount = bill.grossBillAmount ?? bill.billAmount;
  const entries = (bill.classificationEntries || []) as ClassificationEntry[];
  const weights = computeWeightedComponents(entries, billAmount);

  // Only the steel index types actually used by this bill (entry steel types or
  // dedicated steel PVC amounts) are shown; falls back to all types if none is marked.
  // steelIndexNames order: [TMT Bars, Angle/Channel, Plates, Other Sections].
  const STEEL_TYPE_INDEX_POSITION: Record<string, number> = {
    TMT: 0,
    ANGLE_CHANNEL: 1,
    PLATES: 2,
    OTHER_SECTIONS: 3,
  };
  const usedSteelPositions = new Set<number>();
  for (const entry of entries) {
    for (const steelType of (Array.isArray(entry.steelTypes) ? entry.steelTypes : [])) {
      const position = STEEL_TYPE_INDEX_POSITION[String(steelType).toUpperCase()];
      if (position !== undefined) usedSteelPositions.add(position);
    }
  }
  if (Math.abs(bill.pvcCalculation?.dedicatedSteelTmtBarsPvc ?? 0) > 0.005) usedSteelPositions.add(0);
  if (Math.abs(bill.pvcCalculation?.dedicatedSteelAngleChannelPvc ?? 0) > 0.005) usedSteelPositions.add(1);
  if (Math.abs(bill.pvcCalculation?.dedicatedSteelPlatesPvc ?? 0) > 0.005) usedSteelPositions.add(2);
  if (Math.abs(bill.pvcCalculation?.dedicatedSteelOtherSectionsPvc ?? 0) > 0.005) usedSteelPositions.add(3);
  const usedSteelIndexNames = usedSteelPositions.size > 0
    ? Array.from(usedSteelPositions).sort().map(position => steelIndexNames[position]).filter(Boolean)
    : steelIndexNames;
  const steelIdx = usedSteelIndexNames[0] || steelIndexNames[0] || 'Steel TMT Bars';

  const ensureSpace = (need: number) => {
    if (y + need > pageH - 15) {
      pdf.addPage();
      y = mT;
    }
  };

  // ── HEADER ────────────────────────────────────────────────────────────────
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text(organizationName, pageW / 2, y, { align: 'center' });
  y += 6;

  if (divisionName) {
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(divisionName, pageW / 2, y, { align: 'center' });
    y += 5;
  }

  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('STATEMENT SHOWING PRICE VARIATION CLAUSE', pageW / 2, y, { align: 'center' });
  y += 5;
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.text('(As per GCC Clause 46A / Railway Board Guidelines)', pageW / 2, y, { align: 'center' });
  y += 2;

  // Double rule
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.7);
  pdf.line(mL, y, pageW - mR, y);
  y += 1;
  pdf.setLineWidth(0.2);
  pdf.line(mL, y, pageW - mR, y);
  y += 4;

  // ── A. CONTRACT & B. BILL DETAILS in a single info table ──────────────────
  if (showContract) {
  // Column widths: label(52) | value(84) | label(52) | value(85) = 273mm
  const C0 = 52;   // label
  const C1 = 84;   // value (left pair)
  const C2 = 52;   // label (right pair)
  const C3 = 85;   // value (right pair)

  const sectionHeader = (text: string) => [
    { content: text, colSpan: 4, styles: { fontStyle: 'bold' as const, textColor: [0, 0, 150] as [number,number,number], fontSize: 9, cellPadding: { top: 3, right: 2, bottom: 1, left: 2 } } },
  ];
  const lv = (l: string, v: string, l2: string, v2: string) => [
    { content: l,  styles: { fontStyle: 'bold' as const, textColor: [30, 30, 30] as [number,number,number] } },
    { content: v  },
    { content: l2, styles: { fontStyle: 'bold' as const, textColor: [30, 30, 30] as [number,number,number] } },
    { content: v2 },
  ];

  const infoData: any[][] = [
    sectionHeader('A. CONTRACT DETAILS'),
    [
      { content: 'Name of Work:', styles: { fontStyle: 'bold' as const, textColor: [30,30,30] as [number,number,number] } },
      { content: pdfSafe(bill.contract.workDescription || '-'), colSpan: 3 },
    ],
    lv('Agreement No.:',   bill.contract.agreementNo || '-',
       'Date of Opening:', format(new Date(bill.contract.dateOfOpening), 'dd MMM yyyy')),
    lv('Contractor:',      bill.contract.contractorName || '-',
       'Base Month (T0):',  format(baseMonth, 'MMM yyyy')),
    lv('Contract Value:',  bill.contract.contractValue ? 'Rs. ' + bill.contract.contractValue.toLocaleString('en-IN') : 'N/A',
       'Completion Period:', bill.contract.completionPeriodMonths ? `${bill.contract.completionPeriodMonths} Months` : 'N/A'),
    lv('LOA No.:',         bill.contract.loaNo || 'N/A',
       'Railway Zone:',    bill.zone || 'N/A'),
    sectionHeader('B. BILL DETAILS'),
    lv('Bill No.:',              bill.billNo || '-',
       'Date of Measurement:',   format(new Date(bill.dateOfMeasurement), 'dd MMM yyyy')),
    lv('Gross Bill Amount (W):', 'Rs. ' + fmt(billAmount),
       'Quarter:',               bill.quarter || '-'),
    lv('PVC No.:',               bill.pvcNumber || 'Not Assigned',
       'Fuel Pricing:',          bill.fuelPriceType === 'zone_city' ? 'Zone City Price' : '4-City Average'),
    lv('Indices Status:',        isProvisional ? 'PROVISIONAL' : 'FINAL',
       'Extension Type:',        bill.contract.isExtended ? (bill.contract.extensionType || 'Extended') : 'None'),
  ];

  autoTable(pdf, {
    startY: y,
    body: infoData,
    theme: 'plain',
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 1.8, right: 3, bottom: 1.8, left: 2 },
      overflow: 'linebreak',
      lineWidth: 0,
    },
    margin: { left: mL, right: mR },
    tableWidth: contentW,
    columnStyles: {
      0: { cellWidth: C0 },
      1: { cellWidth: C1 },
      2: { cellWidth: C2 },
      3: { cellWidth: C3 },
    },
  });

  y = pdf.lastAutoTable.finalY + 3;

  // Section separator
  pdf.setDrawColor(150, 150, 150);
  pdf.setLineWidth(0.3);
  pdf.line(mL, y, pageW - mR, y);
  y += 4;
  }

  // ── C. PVC COMPUTATION TABLE ───────────────────────────────────────────────
  ensureSpace(60);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('C. PRICE VARIATION COMPUTATION (GCC Clause 46A)', mL, y);
  y += 5;

  // GCC Formula display
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(60, 60, 60);
  pdf.text('Formula (GCC Cl.46A):  Vn = W x SUM[ Pn x (In - I0) / I0 ]', mL + 2, y);
  pdf.setFont('helvetica', 'italic');
  pdf.text(`where  W = Gross Bill Amount = ${fmtMoney(billAmount)},  Pn = Component Weight (%),  I0 = Base Month Index,  In = Quarter Average Index`, mL + 2, y + 4);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Component Amt = W x Pn.  Example: ${fmtMoney(billAmount)} x weighted % of each component below.`, mL + 2, y + 8);
  pdf.setTextColor(0, 0, 0);
  y += 13;

  // Build component data
  const labourBase = getIndexBase(quarterlyAverages, 'Labour');
  const labourAvg  = getIndexAvg(quarterlyAverages, 'Labour');
  const labourVar  = labourBase > 0 ? (labourAvg - labourBase) / labourBase : 0;
  const labourPvc  = pvc?.labourPvc ?? 0;

  const plantBase  = getIndexBase(quarterlyAverages, 'RBI Plant Machinery');
  const plantAvg   = getIndexAvg(quarterlyAverages, 'RBI Plant Machinery');
  const plantVar   = plantBase > 0 ? (plantAvg - plantBase) / plantBase : 0;
  const plantPvc   = pvc?.plantMachineryPvc ?? 0;

  const fuelBase   = getIndexBase(quarterlyAverages, fuelIndexName, 'MPNG Fuel');
  const fuelAvg    = getIndexAvg(quarterlyAverages, fuelIndexName, 'MPNG Fuel');
  const fuelVar    = fuelBase > 0 ? (fuelAvg - fuelBase) / fuelBase : 0;
  const fuelPvc    = pvc?.fuelPowerPvc ?? 0;

  const cemBase    = getIndexBase(quarterlyAverages, 'RBI Cement');
  const cemAvg     = getIndexAvg(quarterlyAverages, 'RBI Cement');
  const cemVar     = cemBase > 0 ? (cemAvg - cemBase) / cemBase : 0;
  const cemPvc     = (pvc?.cementPvc ?? 0) + (pvc?.dedicatedCementPvc ?? 0);

  const steelBase  = getIndexBase(quarterlyAverages, steelIdx, ...usedSteelIndexNames);
  const steelAvg   = getIndexAvg(quarterlyAverages, steelIdx, ...usedSteelIndexNames);
  const steelVar   = steelBase > 0 ? (steelAvg - steelBase) / steelBase : 0;
  const steelPvc   = (pvc?.steelPvc ?? 0) + (pvc?.dedicatedSteelTmtBarsPvc ?? 0) + (pvc?.dedicatedSteelAngleChannelPvc ?? 0) + (pvc?.dedicatedSteelPlatesPvc ?? 0) + (pvc?.dedicatedSteelOtherSectionsPvc ?? 0);

  const otherBase  = getIndexBase(quarterlyAverages, 'RBI Other Materials');
  const otherAvg   = getIndexAvg(quarterlyAverages, 'RBI Other Materials');
  const otherVar   = otherBase > 0 ? (otherAvg - otherBase) / otherBase : 0;
  const otherPvc   = pvc?.otherMaterialsPvc ?? 0;

  const explBase   = getIndexBase(quarterlyAverages, 'RBI Explosives');
  const explAvg    = getIndexAvg(quarterlyAverages, 'RBI Explosives');
  const explVar    = explBase > 0 ? (explAvg - explBase) / explBase : 0;
  const explPvc    = pvc?.explosivesPvc ?? 0;

  const totalPvcAmt = pvc?.totalPvc ?? 0;

  const allComponents = [
    { name: 'Labour',           pct: weights.labour,          base: labourBase, avg: labourAvg, variation: labourVar, pvcAmt: labourPvc },
    { name: 'Plant & Machinery',pct: weights.plantMachinery,  base: plantBase,  avg: plantAvg,  variation: plantVar,  pvcAmt: plantPvc  },
    { name: 'Fuel / Power',     pct: weights.fuel,            base: fuelBase,   avg: fuelAvg,   variation: fuelVar,   pvcAmt: fuelPvc   },
    { name: 'Cement',           pct: weights.cement,          base: cemBase,    avg: cemAvg,    variation: cemVar,    pvcAmt: cemPvc    },
    { name: 'Steel',            pct: weights.steel,           base: steelBase,  avg: steelAvg,  variation: steelVar,  pvcAmt: steelPvc  },
    { name: 'Other Materials',  pct: weights.otherMaterials,  base: otherBase,  avg: otherAvg,  variation: otherVar,  pvcAmt: otherPvc  },
    { name: 'Explosives',       pct: weights.explosives,      base: explBase,   avg: explAvg,   variation: explVar,   pvcAmt: explPvc   },
  ].filter(c => c.pct > 0.0001 || Math.abs(c.pvcAmt) > 0.01);

  const totalPct = allComponents.reduce((s, c) => s + c.pct, 0);
  const totalCompAmt = allComponents.reduce((s, c) => s + billAmount * c.pct, 0);

  const tableHead = [[
    'Sl.',
    'Component',
    '% Age\n(Weighted)',
    'Component Amt (Rs.)',
    'Base Index\n(I0)',
    `Quarter Avg (I1)\n[${bill.quarter}]`,
    'Variation\n(I1-I0)/I0',
    'PVC Amount (Rs.)',
  ]];

  const fixedPct = Math.max(0, 1 - totalPct);
  const fixedAmt = billAmount * fixedPct;

  const tableBody: any[] = allComponents.map((c, i) => [
    i + 1,
    c.name,
    (c.pct * 100).toFixed(2) + '%',
    fmt(billAmount * c.pct),
    fmtIdx(c.base),
    fmtIdx(c.avg),
    fmtVariation(c.variation),
    fmt(c.pvcAmt),
  ]);

  // Fixed (non-variable) component row
  if (fixedPct > 0.0001) {
    tableBody.push([
      { content: '', styles: {} },
      { content: 'Fixed (Non-Variable)', styles: { fontStyle: 'italic' as const, textColor: [80, 80, 80] as [number,number,number] } },
      { content: (fixedPct * 100).toFixed(2) + '%', styles: { halign: 'center' as const, fontStyle: 'italic' as const, textColor: [80, 80, 80] as [number,number,number] } },
      { content: fmt(fixedAmt), styles: { halign: 'right' as const, fontStyle: 'italic' as const, textColor: [80, 80, 80] as [number,number,number] } },
      { content: 'Not subject to PVC', colSpan: 4, styles: { halign: 'center' as const, fontStyle: 'italic' as const, textColor: [80, 80, 80] as [number,number,number] } },
    ]);
  }

  tableBody.push([
    '', 'TOTAL PVC',
    (totalPct * 100).toFixed(2) + '%',
    fmt(totalCompAmt),
    '', '', '',
    fmt(totalPvcAmt),
  ]);

  // Total column width available for PVC table: 273mm
  // Columns: Sl(10) + Component(40) + %Age(22) + CompAmt(35) + I0(22) + I1(30) + Var(26) + PVCAmt(36) = 221
  // Remaining 52mm left-aligned — use as padding in component col
  autoTable(pdf, {
    startY: y,
    head: tableHead,
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: [20, 20, 20],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
      valign: 'middle',
      cellPadding: 2.5,
    },
    bodyStyles: {
      fontSize: 8.5,
      cellPadding: { top: 2, right: 3, bottom: 2, left: 3 },
      textColor: [0, 0, 0],
      valign: 'middle',
    },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    styles: { lineColor: [180, 180, 180], lineWidth: 0.3, font: 'helvetica', overflow: 'linebreak' },
    margin: { left: mL, right: mR },
    tableWidth: contentW,
    columnStyles: {
      0: { cellWidth: 10,  halign: 'center' },  // Sl
      1: { cellWidth: 60,  halign: 'left'   },  // Component
      2: { cellWidth: 24,  halign: 'center' },  // % Age
      3: { cellWidth: 45,  halign: 'right'  },  // Component Amt
      4: { cellWidth: 26,  halign: 'center' },  // Base Index
      5: { cellWidth: 38,  halign: 'center' },  // Quarter Avg
      6: { cellWidth: 28,  halign: 'center' },  // Variation
      7: { cellWidth: 42,  halign: 'right'  },  // PVC Amount
    }, // Total: 10+60+24+45+26+38+28+42 = 273mm
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.row.index === tableBody.length - 1) {
        // TOTAL PVC row
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [220, 220, 220];
        data.cell.styles.fontSize = 9;
      }
      if (data.section === 'body' && fixedPct > 0.0001 && data.row.index === tableBody.length - 2) {
        // Fixed row background
        data.cell.styles.fillColor = [248, 248, 248];
      }
    },
  });

  y = pdf.lastAutoTable.finalY + 4;

  // ── SUMMARY TABLE ─────────────────────────────────────────────────────────
  // Summary needs ~35mm. If it won't fit on this page, start a new page.
  const summaryNeeded = 35;
  if (y + summaryNeeded > pageH - mT) {
    pdf.addPage();
    y = mT;
  }

  // Draw summary right-aligned (120mm wide), certification note on the left
  const summaryX = pageW - mR - 120;
  const summaryStartY = y;
  const summaryPreviousPvc = previousCumulativePvc ?? pvc?.previousPvcTotal ?? 0;
  const summaryCurrentPvc = summaryPreviousPvc + totalPvcAmt;

  autoTable(pdf, {
    startY: summaryStartY,
    body: [
      ['Net PVC Amount for this Bill', 'Rs. ' + fmt(totalPvcAmt)],
      ['Previous Cumulative PVC',      'Rs. ' + fmt(summaryPreviousPvc)],
      ['Current Cumulative PVC',       'Rs. ' + fmt(summaryCurrentPvc)],
    ],
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.5, lineColor: [0, 0, 0], lineWidth: 0.3 },
    margin: { left: summaryX, right: mR },
    tableWidth: 120,
    columnStyles: {
      0: { cellWidth: 72, fontStyle: 'bold' },
      1: { cellWidth: 48, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data: any) => {
      if (data.row.index === 2) data.cell.styles.fillColor = [210, 230, 255];
    },
  });

  // Certification note on the left at same height (drawn on same page as summary start)
  const pagesAfterSummary = (pdf as any).internal.getCurrentPageInfo().pageNumber;
  // Go back to the page where summary started to draw cert text
  const summaryPage = pagesAfterSummary - (pdf.lastAutoTable.finalY < summaryStartY ? 1 : 0);
  pdf.setPage(summaryPage);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  const certText = 'Certified that the above Price Variation Clause has been calculated\nas per the contract conditions and the indices published by the\ncompetent authority.';
  pdf.text(certText, mL, summaryStartY + 4);

  if (isProvisional && provisionalIndices.length > 0) {
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(180, 0, 0);
    const note = `Note: Provisional indices used: ${provisionalIndices.join(', ')}`;
    const noteLines = pdf.splitTextToSize(note, summaryX - mL - 5);
    pdf.text(noteLines, mL, summaryStartY + 22);
    pdf.setTextColor(0, 0, 0);
  }

  // Return to last page for indices rendering
  pdf.setPage(pagesAfterSummary);

  // ── D. WORK CLASSIFICATION & JUSTIFICATION ────────────────────────────────
  if (showClassification) {
  const detailEntries = entries.filter(entry =>
    (Number(entry.amount) || 0) !== 0 || entry.classificationJustification || entry.description);
  if (detailEntries.length > 0) {
    y = Math.max(pdf.lastAutoTable.finalY, summaryStartY + 30) + 6;
    ensureSpace(30);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.text('D. WORK CLASSIFICATION & JUSTIFICATION', mL, y);
    y += 2;

    const classHead = [[
      'Sl.',
      'Item No.',
      'Classification',
      'Amount (Rs.)',
      'Why this classification applies',
    ]];

    // Sort key = the entry's lowest item number (natural order).
    const entryItemNo = (entry: ClassificationEntry): string => {
      const rows = (entry.itemRows || []).map(r => String(r?.itemNumber || '').trim()).filter(Boolean);
      const nums = rows.length > 0 ? rows : [String(entry.itemNumber || '').trim()].filter(Boolean);
      return nums.length > 0 ? nums.slice().sort(compareItemNumbers)[0] : '';
    };

    // Group entries by schedule (rendered as a header row instead of a column),
    // and sort the items within each schedule by item number.
    const dGroups = new Map<string, ClassificationEntry[]>();
    for (const entry of detailEntries) {
      const sched = String(entry.scheduleItem || '').trim() || '-';
      if (!dGroups.has(sched)) dGroups.set(sched, []);
      dGroups.get(sched)!.push(entry);
    }
    const sortedDGroups = Array.from(dGroups.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    const dGroupHeaderStyle = {
      fontStyle: 'bold' as const,
      fillColor: [225, 225, 225] as [number, number, number],
      textColor: [0, 0, 0] as [number, number, number],
      halign: 'left' as const,
    };

    const classBody: any[] = [];
    let dSl = 0;
    for (const [sched, groupEntries] of sortedDGroups) {
      groupEntries.sort((a, b) => compareItemNumbers(entryItemNo(a), entryItemNo(b)));
      classBody.push([{ content: pdfSafe(`Schedule: ${sched}`), colSpan: 5, styles: dGroupHeaderStyle }]);
      for (const entry of groupEntries) {
        dSl++;
        const sub = entry.subClassification;
        const classification = sub?.code ? `${sub.code}${sub.name ? ' - ' + sub.name : ''}` : '-';
        // Normalise the stored justification for display: strip the internal
        // price-variation working note and reword terse / mismatched cement-supply
        // reasons into GCC-clause style. (See formatJustification.)
        const justification = formatJustification(entry.classificationJustification, sub, entry.description);
        const rowItemNumbers = (entry.itemRows || [])
          .map(row => String(row?.itemNumber || '').trim())
          .filter(Boolean);
        const itemNumbers = rowItemNumbers.length > 0
          ? Array.from(new Set(rowItemNumbers)).sort(compareItemNumbers).join(', ')
          : String(entry.itemNumber || '').trim() || '-';
        classBody.push([
          dSl,
          pdfSafe(itemNumbers),
          pdfSafe(classification),
          fmt(Number(entry.amount) || 0),
          pdfSafe(justification),
        ]);
      }
    }

    autoTable(pdf, {
      startY: y + 2,
      head: classHead,
      body: classBody,
      theme: 'grid',
      headStyles: {
        fillColor: [20, 20, 20],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center',
        valign: 'middle',
        cellPadding: 2.5,
      },
      bodyStyles: {
        fontSize: 8,
        cellPadding: { top: 2, right: 3, bottom: 2, left: 3 },
        textColor: [0, 0, 0],
        valign: 'top',
      },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      styles: { lineColor: [180, 180, 180], lineWidth: 0.3, font: 'helvetica', overflow: 'linebreak' },
      margin: { left: mL, right: mR, top: mT },
      tableWidth: contentW,
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 32, halign: 'left' },
        2: { cellWidth: 46, halign: 'left' },
        3: { cellWidth: 32, halign: 'right' },
        4: { cellWidth: 153, halign: 'left' },
      },
    });

    y = pdf.lastAutoTable.finalY + 5;

    // Per-classification component percentage matrix so the weighted % in
    // Section C can be verified by the reader.
    const byCode = new Map<string, { sub: SubClassification; amount: number }>();
    for (const entry of detailEntries) {
      const sub = entry.subClassification;
      if (!sub?.code) continue;
      const existing = byCode.get(sub.code);
      if (existing) existing.amount += Number(entry.amount) || 0;
      else byCode.set(sub.code, { sub, amount: Number(entry.amount) || 0 });
    }

    if (byCode.size > 0) {
      ensureSpace(35);
      pdf.setFontSize(8.5);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Component percentages by classification (basis of the weighted % in Section C):', mL, y);
      y += 2;

      const pctHead = [[
        'Classification',
        'Amount (Rs.)',
        'Share of Bill',
        'Fixed %',
        'Labour %',
        'P&M %',
        'Fuel %',
        'Cement %',
        'Steel %',
        'Other %',
        'Expl. %',
      ]];
      const pctBody: any[] = Array.from(byCode.values()).map(({ sub, amount }) => [
        sub.code || '-',
        fmt(amount),
        billAmount > 0 ? ((amount / billAmount) * 100).toFixed(2) + '%' : '-',
        sub.fixed || 0,
        sub.labour || 0,
        sub.plantMachinery || 0,
        sub.fuel || 0,
        sub.cement || 0,
        sub.steel || 0,
        sub.otherMaterials || 0,
        sub.explosives || 0,
      ]);
      pctBody.push([
        { content: 'WEIGHTED (Section C)', styles: { fontStyle: 'bold' as const } },
        { content: fmt(billAmount), styles: { fontStyle: 'bold' as const, halign: 'right' as const } },
        { content: '100.00%', styles: { fontStyle: 'bold' as const, halign: 'center' as const } },
        ...([weights.fixed, weights.labour, weights.plantMachinery, weights.fuel,
          weights.cement, weights.steel, weights.otherMaterials, weights.explosives]
          .map(value => ({
            content: (value * 100).toFixed(2),
            styles: { fontStyle: 'bold' as const, halign: 'center' as const },
          }))),
      ]);

      autoTable(pdf, {
        startY: y + 2,
        head: pctHead,
        body: pctBody,
        theme: 'grid',
        headStyles: {
          fillColor: [70, 70, 70],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 7.5,
          halign: 'center',
          valign: 'middle',
          cellPadding: 2,
        },
        bodyStyles: {
          fontSize: 8,
          cellPadding: { top: 1.8, right: 2.5, bottom: 1.8, left: 2.5 },
          textColor: [0, 0, 0],
          halign: 'center',
        },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        styles: { lineColor: [180, 180, 180], lineWidth: 0.3, font: 'helvetica', overflow: 'linebreak' },
        margin: { left: mL, right: mR, top: mT },
        tableWidth: contentW,
        columnStyles: {
          0: { cellWidth: 45, halign: 'left' },
          1: { cellWidth: 36, halign: 'right' },
          2: { cellWidth: 24 },
          3: { cellWidth: 21 },
          4: { cellWidth: 21 },
          5: { cellWidth: 21 },
          6: { cellWidth: 21 },
          7: { cellWidth: 21 },
          8: { cellWidth: 21 },
          9: { cellWidth: 21 },
          10: { cellWidth: 21 },
        },
        didParseCell: (data: any) => {
          if (data.section === 'body' && data.row.index === pctBody.length - 1) {
            data.cell.styles.fillColor = [220, 220, 220];
          }
        },
      });

      y = pdf.lastAutoTable.finalY + 3;
      pdf.setFontSize(7.5);
      pdf.setFont('helvetica', 'italic');
      pdf.setTextColor(80, 80, 80);
      pdf.text(
        'Weighted % of a component = SUM over classifications of (classification amount / Gross Bill Amount) x classification %.',
        mL, y,
      );
      pdf.setTextColor(0, 0, 0);
      y += 4;
    }

    // Plain-language explanation for end users
    ensureSpace(18);
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(80, 80, 80);
    pdf.text(
      'How to read this statement: each work amount is grouped under a GCC classification, which fixes the component percentages '
      + '(labour, fuel, cement, steel, etc.) shown in Section C.\n'
      + 'PVC for a component = component amount x percentage change of its published price index between the Base Month and the bill quarter.\n'
      + 'A positive PVC amount is payable to the contractor; a negative PVC amount is recoverable because prices fell below the base month level.',
      mL, y,
    );
    pdf.setTextColor(0, 0, 0);
  }

  // ── E. BILL SCHEDULE ITEMS & SUMMARY ──────────────────────────────────────
  // Item-wise listing of the bill schedule (item no., schedule, quantity,
  // agreement rate, amount) followed by a schedule-wise summary, so every
  // classified amount can be traced back to the source bill lines.
  type ScheduleRow = { itemNumber: string; schedule: string; qty: number; rate: number; amount: number };
  // A split-off cement row (manual "Cement (derived)" or AI "(Cement Portion)") is a
  // classification artifact for PVC (Section D), not a real bill line item — the work
  // item's agreement rate already includes its cement. Listing it in the schedule items
  // would double-count cement on top of the full work items and inflate the gross.
  // isDerivedCement isn't persisted, so detect it from the saved description / item codes.
  const isSplitCementEntry = (e: any): boolean => {
    if (e?.isDerivedCement === true) return true;
    const desc = String(e?.description || '');
    if (/cement\s*\(derived\)/i.test(desc) || /\(cement portion\)/i.test(desc)) return true;
    const rows = Array.isArray(e?.itemRows) ? e.itemRows : [];
    return rows.length > 0 && rows.every((r: any) => /\(\s*cement\s*\)\s*$/i.test(String(r?.itemNumber || '')));
  };
  const scheduleRows: ScheduleRow[] = [];
  for (const entry of entries) {
    if (isSplitCementEntry(entry)) continue;
    const schedule = String(entry.scheduleItem || '').trim() || '-';
    const rawRows = Array.isArray(entry.itemRows) ? entry.itemRows : [];
    const usableRows = rawRows.filter(row => row && (row.itemNumber || row.quantity || row.agreementRate));
    if (usableRows.length > 0) {
      for (const row of usableRows) {
        const qty = Number(row.quantity) || 0;
        const rate = Number(row.agreementRate) || 0;
        scheduleRows.push({
          itemNumber: String(row.itemNumber || '').trim() || '-',
          schedule,
          qty,
          rate,
          amount: qty * rate,
        });
      }
    } else if (entry.itemNumber || entry.quantity || entry.agreementRate) {
      const qty = Number(entry.quantity) || 0;
      const rate = Number(entry.agreementRate) || 0;
      const gross = qty * rate;
      scheduleRows.push({
        itemNumber: String(entry.itemNumber || '').trim() || '-',
        schedule,
        qty,
        rate,
        amount: gross > 0 ? gross : (Number(entry.amount) || 0),
      });
    }
  }

  if (scheduleRows.length > 0) {
    pdf.addPage();
    y = mT;

    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.text('E. BILL SCHEDULE ITEMS', mL, y);
    y += 2;

    const itemHead = [['Sl.', 'Item No.', 'Quantity', 'Agreement Rate (Rs.)', 'Amount (Rs.)']];

    // Group items by schedule (rendered as a header row instead of a column),
    // sorted by item number within each schedule.
    const eGroups = new Map<string, ScheduleRow[]>();
    for (const row of scheduleRows) {
      if (!eGroups.has(row.schedule)) eGroups.set(row.schedule, []);
      eGroups.get(row.schedule)!.push(row);
    }
    const sortedEGroups = Array.from(eGroups.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    const eGroupHeaderStyle = {
      fontStyle: 'bold' as const,
      fillColor: [225, 225, 225] as [number, number, number],
      textColor: [0, 0, 0] as [number, number, number],
      halign: 'left' as const,
    };

    const itemBody: any[] = [];
    let eSl = 0;
    for (const [sched, rows] of sortedEGroups) {
      rows.sort((a, b) => compareItemNumbers(a.itemNumber, b.itemNumber));
      itemBody.push([{ content: pdfSafe(`Schedule: ${sched}`), colSpan: 5, styles: eGroupHeaderStyle }]);
      let groupTotal = 0;
      for (const row of rows) {
        eSl++;
        groupTotal += row.amount;
        itemBody.push([
          eSl,
          pdfSafe(row.itemNumber),
          row.qty ? row.qty.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : '-',
          row.rate ? fmt(row.rate) : '-',
          fmt(row.amount),
        ]);
      }
      itemBody.push([
        { content: 'Schedule Total', colSpan: 4, styles: { fontStyle: 'bold' as const, halign: 'right' as const, fillColor: [242, 242, 242] as [number, number, number] } },
        { content: fmt(groupTotal), styles: { fontStyle: 'bold' as const, halign: 'right' as const, fillColor: [242, 242, 242] as [number, number, number] } },
      ]);
    }

    autoTable(pdf, {
      startY: y + 2,
      head: itemHead,
      body: itemBody,
      theme: 'grid',
      headStyles: {
        fillColor: [20, 20, 20],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center',
        valign: 'middle',
        cellPadding: 2.5,
      },
      bodyStyles: {
        fontSize: 8,
        cellPadding: { top: 2, right: 3, bottom: 2, left: 3 },
        textColor: [0, 0, 0],
        valign: 'top',
      },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      styles: { lineColor: [180, 180, 180], lineWidth: 0.3, font: 'helvetica', overflow: 'linebreak' },
      margin: { left: mL, right: mR, top: mT },
      tableWidth: contentW,
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 55, halign: 'left' },
        2: { cellWidth: 60, halign: 'right' },
        3: { cellWidth: 68, halign: 'right' },
        4: { cellWidth: 78, halign: 'right' },
      },
    });

    y = pdf.lastAutoTable.finalY + 6;

    // ── F. BILL SCHEDULE SUMMARY ────────────────────────────────────────────
    const scheduleTotals = new Map<string, number>();
    for (const row of scheduleRows) {
      scheduleTotals.set(row.schedule, (scheduleTotals.get(row.schedule) || 0) + row.amount);
    }
    const itemsGrossTotal = scheduleRows.reduce((sum, row) => sum + row.amount, 0);
    // The schedule-line values (Qty x Agreement Rate) are the GROSS bill value;
    // bill.billAmount is the payable amount, net of any rebate. When the two differ
    // materially, the gap is the rebate — shown as a deduction so the summary
    // reconciles to the actual Bill Amount, matching the IREPS proforma. (grossBillAmount
    // is not relied on here because for rebate bills it is stored equal to the net.)
    const grossTotal = itemsGrossTotal;
    // The schedule items are the GROSS value (Qty x Agreement Rate). The bill's actual
    // value is W (Gross Bill Amount, used everywhere else in this report), so the summary
    // MUST reconcile gross -> W. We attribute the reduction to the contract's per-schedule
    // bid rate then escalation, then the agreement rebate; when that breakdown reconciles
    // to W we show the separate lines, otherwise a single bid-rate line down to W.
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const billValue = round2(Number(bill.grossBillAmount ?? bill.billAmount) || grossTotal); // W
    const contractSchedules = (bill.contract as any)?.schedules;
    let bidAdj = 0, escAdj = 0;
    for (const [schedule, gs] of scheduleTotals.entries()) {
      const rates = findScheduleRates(contractSchedules, schedule);
      const bid = Number(rates?.bidRate) || 0;
      const esc = Number(rates?.escalation) || 0;
      const afterBid = gs * (1 + bid / 100);
      const afterEsc = afterBid * (1 + esc / 100);
      bidAdj += afterBid - gs;         // bid rate effect (signed)
      escAdj += afterEsc - afterBid;   // escalation effect (signed)
    }
    bidAdj = round2(bidAdj);
    escAdj = round2(escAdj);
    const rebatePct = Number((bill.contract as any)?.rebatePercentage) || 0;
    const afterBidEsc = grossTotal + bidAdj + escAdj;
    const rebate = rebatePct > 0 ? round2(afterBidEsc * rebatePct / 100) : 0;
    const computedNet = round2(afterBidEsc - rebate);
    // Net always equals W (the bill's value). Show the itemised breakdown only when the
    // contract's rates actually reconcile to W (within 0.2%); otherwise a single bid line.
    const netAmount = billValue;
    const reconciles = Math.abs(computedNet - billValue) <= Math.max(1, grossTotal * 0.002);
    const showBid = Math.abs(bidAdj) >= 0.01;
    const showEsc = Math.abs(escAdj) >= 0.01;
    const showRebate = rebatePct > 0 && rebate >= 0.01;

    // Reserve room for the whole summary (title + header + one row per schedule,
    // each of which can wrap to ~2 lines, + up to 3 total/rebate/net rows) so the
    // block is not split across a page break.
    ensureSpace(58 + scheduleTotals.size * 14);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.text('F. BILL SCHEDULE SUMMARY', mL, y);
    y += 2;

    const summaryBody: any[] = Array.from(scheduleTotals.entries()).map(([schedule, total]) => [
      schedule,
      { content: fmt(total), styles: { halign: 'right' as const } },
    ]);
    summaryBody.push([
      { content: 'Total of Schedule Items (at agreement rate)', styles: { fontStyle: 'bold' as const } },
      { content: fmt(grossTotal), styles: { fontStyle: 'bold' as const, halign: 'right' as const } },
    ]);
    const signed = (n: number) => (n < 0 ? '-' : '+') + fmt(Math.abs(n));
    const totalAdjust = round2(billValue - grossTotal); // reduction to reach W (negative)
    if (reconciles && (showBid || showEsc || showRebate)) {
      // Contract rates explain the gross -> W reduction: show them line by line.
      if (showBid) summaryBody.push([
        `${bidAdj < 0 ? 'Less' : 'Add'}: Bid rate (per schedule)`,
        { content: signed(bidAdj), styles: { halign: 'right' as const } },
      ]);
      if (showEsc) summaryBody.push([
        `${escAdj < 0 ? 'Less' : 'Add'}: Escalation (per schedule)`,
        { content: signed(escAdj), styles: { halign: 'right' as const } },
      ]);
      if (showRebate) summaryBody.push([
        `Less: Rebate (${rebatePct.toFixed(2)}%)`,
        { content: '-' + fmt(rebate), styles: { halign: 'right' as const } },
      ]);
      summaryBody.push([
        { content: 'Net Bill Amount (Incl. GST)', styles: { fontStyle: 'bold' as const } },
        { content: fmt(netAmount), styles: { fontStyle: 'bold' as const, halign: 'right' as const } },
      ]);
    } else if (Math.abs(totalAdjust) >= 0.01) {
      // Rates don't fully reconcile — show the whole reduction as one bid-rate line to W.
      summaryBody.push([
        `${totalAdjust < 0 ? 'Less' : 'Add'}: Bid rate (per schedule)`,
        { content: signed(totalAdjust), styles: { halign: 'right' as const } },
      ]);
      summaryBody.push([
        { content: 'Net Bill Amount (Incl. GST)', styles: { fontStyle: 'bold' as const } },
        { content: fmt(netAmount), styles: { fontStyle: 'bold' as const, halign: 'right' as const } },
      ]);
    } else {
      summaryBody.push([
        { content: 'Bill Amount (Incl. GST)', styles: { fontStyle: 'bold' as const } },
        { content: fmt(netAmount), styles: { fontStyle: 'bold' as const, halign: 'right' as const } },
      ]);
    }

    autoTable(pdf, {
      startY: y + 2,
      head: [['Schedule', 'Amount (Rs.)']],
      body: summaryBody,
      theme: 'grid',
      headStyles: {
        fillColor: [20, 20, 20],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'left',
        valign: 'middle',
        cellPadding: 2.5,
      },
      bodyStyles: {
        fontSize: 8,
        cellPadding: { top: 2, right: 3, bottom: 2, left: 3 },
        textColor: [0, 0, 0],
      },
      styles: { lineColor: [180, 180, 180], lineWidth: 0.3, font: 'helvetica', overflow: 'linebreak' },
      margin: { left: mL, right: mR, top: mT },
      tableWidth: 150,
      columnStyles: {
        0: { cellWidth: 100, halign: 'left' },
        1: { cellWidth: 50, halign: 'right' },
      },
    });
  }

  }

  // ── G. STATUTORY ESCALATION FRAMEWORK & CALCULATIONS ──────────────────────
  if (showCalcSteps) {
  // Per-component statutory escalation (GCC Clause 46A): each cost component's
  // price variation = its weighted amount x [(I1 - I0) / I0]; dedicated cement
  // and dedicated steel apply the 85% variable factor. Mirrors the on-screen
  // "Statutory Escalate Framework & Calculations" panel, with the bill's item
  // numbers listed alongside.
  if (pvc && allComponents.length > 0) {
    pdf.addPage();
    y = mT;

    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.text('G. STATUTORY ESCALATION FRAMEWORK & CALCULATIONS', mL, y);
    y += 5;

    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(80, 80, 80);
    const gIntro = pdf.splitTextToSize(
      'Statutory escalation per GCC Clause 46A: Component Escalation = Component Amount x [(I1 - I0) / I0], '
      + 'where I0 = Base Month index and I1 = Quarter Average index. Dedicated cement / steel apply the 85% variable factor.',
      contentW,
    );
    pdf.text(gIntro, mL, y);
    pdf.setTextColor(0, 0, 0);
    y += gIntro.length * 3.4 + 3;

    const escHead = [[
      'Component',
      '% (Wtd.)',
      'Component Amt (Rs.)',
      'I0',
      'I1',
      'Statutory Escalate Formula',
      'Escalation Amt (Rs.)',
    ]];
    const escBody: any[] = allComponents.map(c => {
      const amt = billAmount * c.pct;
      return [
        c.name,
        (c.pct * 100).toFixed(2) + '%',
        fmt(amt),
        fmtIdx(c.base),
        fmtIdx(c.avg),
        `${fmt(amt)} x [(${fmtIdx(c.avg)} - ${fmtIdx(c.base)}) / ${fmtIdx(c.base)}]`,
        fmt(c.pvcAmt),
      ];
    });

    // Dedicated cement / steel rows use the 85% escalation factor and their own
    // dedicated amounts / section indices.
    const b = bill as any;
    const dedicated: Array<{ label: string; amount: number; base: number; avg: number; pvc: number }> = [];
    if (Math.abs(pvc.dedicatedCementPvc ?? 0) > 0.005) {
      dedicated.push({ label: 'Dedicated Cement (85%)', amount: Number(b.cementAmount) || 0, base: cemBase, avg: cemAvg, pvc: pvc.dedicatedCementPvc! });
    }
    const steelDed: Array<[number, string, number]> = [
      [pvc.dedicatedSteelTmtBarsPvc ?? 0, 'Dedicated Steel TMT Bars (85%)', Number(b.steelTmtBarsAmount) || 0],
      [pvc.dedicatedSteelAngleChannelPvc ?? 0, 'Dedicated Steel Angle/Channel (85%)', Number(b.steelAngleChannelAmount) || 0],
      [pvc.dedicatedSteelPlatesPvc ?? 0, 'Dedicated Steel Plates (85%)', Number(b.steelPlatesAmount) || 0],
      [pvc.dedicatedSteelOtherSectionsPvc ?? 0, 'Dedicated Steel Other Sections (85%)', Number(b.steelOtherSectionsAmount) || 0],
    ];
    steelDed.forEach(([pvcVal, label, amount], i) => {
      if (Math.abs(pvcVal) > 0.005) {
        const nm = steelIndexNames[i];
        dedicated.push({ label, amount, base: getIndexBase(quarterlyAverages, nm), avg: getIndexAvg(quarterlyAverages, nm), pvc: pvcVal });
      }
    });
    for (const d of dedicated) {
      escBody.push([
        d.label,
        '85%',
        fmt(d.amount),
        fmtIdx(d.base),
        fmtIdx(d.avg),
        `${fmt(d.amount)} x [(${fmtIdx(d.avg)} - ${fmtIdx(d.base)}) / ${fmtIdx(d.base)}] x 85%`,
        fmt(d.pvc),
      ]);
    }

    escBody.push([
      { content: 'TOTAL PRICE VARIATION FOR THIS BILL', colSpan: 6, styles: { fontStyle: 'bold' as const, halign: 'right' as const, fillColor: [220, 220, 220] as [number, number, number] } },
      { content: fmt(pvc.totalPvc ?? 0), styles: { fontStyle: 'bold' as const, halign: 'right' as const, fillColor: [220, 220, 220] as [number, number, number] } },
    ]);

    autoTable(pdf, {
      startY: y,
      head: escHead,
      body: escBody,
      theme: 'grid',
      headStyles: {
        fillColor: [20, 20, 20],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center',
        valign: 'middle',
        cellPadding: 2.5,
      },
      bodyStyles: {
        fontSize: 8,
        cellPadding: { top: 2, right: 2.5, bottom: 2, left: 2.5 },
        textColor: [0, 0, 0],
        valign: 'middle',
      },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      styles: { lineColor: [180, 180, 180], lineWidth: 0.3, font: 'helvetica', overflow: 'linebreak' },
      margin: { left: mL, right: mR, top: mT },
      tableWidth: contentW,
      columnStyles: {
        0: { cellWidth: 42, halign: 'left' },
        1: { cellWidth: 16, halign: 'center' },
        2: { cellWidth: 30, halign: 'right' },
        3: { cellWidth: 17, halign: 'center' },
        4: { cellWidth: 17, halign: 'center' },
        5: { cellWidth: 120, halign: 'left' },
        6: { cellWidth: 31, halign: 'right' },
      },
    });

    y = pdf.lastAutoTable.finalY + 5;

    // Bill item numbers covered by this escalation (item-number list alongside).
    const escItemNos = Array.from(new Set(
      entries.flatMap(e => {
        const rows = (e.itemRows || []).map(r => String(r?.itemNumber || '').trim()).filter(Boolean);
        return rows.length > 0 ? rows : [String(e.itemNumber || '').trim()];
      }).filter(Boolean)
    ));
    if (escItemNos.length > 0) {
      ensureSpace(16);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Bill item numbers covered by this escalation:', mL, y);
      y += 4;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      const itemLines = pdf.splitTextToSize(escItemNos.join(',   '), contentW);
      pdf.text(itemLines, mL, y);
      y += itemLines.length * 3.4;
    }
  }

  }

  // ── PAGE 2: AFFECTED PRICE INDICES WITH MONTHLY BREAKDOWN ─────────────────
  if (showMonthlyIndices) {
  // Build set of index names actually used in this PVC calculation
  const usedIndexNames = new Set<string>();
  for (const c of allComponents) {
    if (c.name === 'Labour')           usedIndexNames.add('Labour');
    if (c.name === 'Plant & Machinery') usedIndexNames.add('RBI Plant Machinery');
    if (c.name === 'Fuel / Power')     usedIndexNames.add(fuelIndexName);
    if (c.name === 'Cement')           usedIndexNames.add('RBI Cement');
    if (c.name === 'Steel')            usedSteelIndexNames.forEach(n => usedIndexNames.add(n));
    if (c.name === 'Other Materials')  usedIndexNames.add('RBI Other Materials');
    if (c.name === 'Explosives')       usedIndexNames.add('RBI Explosives');
  }
  const affectedAverages = quarterlyAverages.filter(qa => usedIndexNames.has(qa.indexName));

  if (affectedAverages.length > 0) {
    pdf.addPage();
    y = mT;

    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text('PRICE INDICES USED FOR PVC COMPUTATION', pageW / 2, y, { align: 'center' });
    y += 5;
    pdf.setFontSize(8.5);
    pdf.setFont('helvetica', 'normal');
    pdf.text(
      `Base Month: ${format(baseMonth, 'MMMM yyyy')}  |  Quarter: ${bill.quarter}  |  Zone: ${bill.zone || 'N/A'}`,
      pageW / 2, y, { align: 'center' }
    );
    y += 3;
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.4);
    pdf.line(mL, y, pageW - mR, y);
    y += 5;

    // Collect all month keys across affected indices (sorted)
    const allMonthKeys = Array.from(
      new Set(affectedAverages.flatMap(qa => (qa.monthlyValues || []).map(mv => mv.month)))
    ).sort();

    // Month labels: "Jan 2025", "Feb 2025", "Mar 2025"
    const monthLabels = allMonthKeys.map(mk => {
      const [yr, mo] = mk.split('-');
      return format(new Date(parseInt(yr), parseInt(mo) - 1, 1), 'MMM yyyy');
    });

    // Column widths: Index(70) + I0(28) + months(28 each) + Avg(32) + Var%(24) = varies
    // For 3 months: 70+28+28+28+28+32+24 = 238; remaining 35mm → add to Index col
    const monthColW = 28;
    const idxColW = Math.max(70, contentW - 28 - monthColW * allMonthKeys.length - 32 - 24);

    const idxHead = [[
      'Index Name',
      'Base Value\n(I0)',
      ...monthLabels,
      `Quarter Avg\n(I1) [${bill.quarter}]`,
      'Variation %',
    ]];

    const idxBody = affectedAverages.map(qa => {
      const variation = qa.baseValue > 0 ? (qa.average - qa.baseValue) / qa.baseValue : 0;
      const monthVals = allMonthKeys.map(mk => {
        const mv = (qa.monthlyValues || []).find(m => m.month === mk);
        return mv ? fmtIdx(mv.value) : '-';
      });
      return [
        qa.indexName,
        fmtIdx(qa.baseValue),
        ...monthVals,
        fmtIdx(qa.average),
        (variation * 100).toFixed(2) + '%',
      ];
    });

    const colStyles: Record<number, any> = {
      0: { cellWidth: idxColW, halign: 'left' },
      1: { cellWidth: 28, halign: 'center' },
    };
    allMonthKeys.forEach((_, i) => {
      colStyles[2 + i] = { cellWidth: monthColW, halign: 'center' };
    });
    colStyles[2 + allMonthKeys.length]     = { cellWidth: 32, halign: 'center' };
    colStyles[2 + allMonthKeys.length + 1] = { cellWidth: 24, halign: 'center' };

    autoTable(pdf, {
      startY: y,
      head: idxHead,
      body: idxBody,
      theme: 'grid',
      headStyles: {
        fillColor: [20, 20, 20],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5,
        halign: 'center',
        valign: 'middle',
        cellPadding: 2.5,
      },
      bodyStyles: { fontSize: 9, cellPadding: { top: 2.5, right: 3, bottom: 2.5, left: 3 }, textColor: [0, 0, 0] },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      styles: { lineColor: [180, 180, 180], lineWidth: 0.3 },
      margin: { left: mL, right: mR },
      tableWidth: contentW,
      columnStyles: colStyles,
    });

    y = pdf.lastAutoTable.finalY + 5;
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(80, 80, 80);
    pdf.text('* Indices as published by Ministry of Statistics & PI (Labour), RBI (WPI), and MPNG (Fuel). Quarter average = arithmetic mean of monthly values shown above.', mL, y);
    pdf.setTextColor(0, 0, 0);
  }

  // ── MONTHLY PRICE INDICES TABLE (full history) ─────────────────────────────
  if (allHistoricalMonthlyData.length > 0) {
    // Only show indices that are actually used
    const histFiltered = allHistoricalMonthlyData.filter(d => usedIndexNames.has(d.indexName));
    if (histFiltered.length > 0) {
      pdf.addPage();
      y = mT;

      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text('MONTHLY PRICE INDICES', pageW / 2, y, { align: 'center' });
      y += 4;
      pdf.setLineWidth(0.5);
      pdf.setDrawColor(0, 0, 0);
      const titleW = pdf.getTextWidth('MONTHLY PRICE INDICES');
      pdf.line(pageW / 2 - titleW / 2, y, pageW / 2 + titleW / 2, y);
      y += 5;

      // Build sorted list of used index names (preserving display order)
      const orderedIdxNames = ['Labour', 'RBI Plant Machinery', fuelIndexName,
        'RBI Other Materials', 'RBI Cement', 'RBI Explosives', ...steelIndexNames]
        .filter(n => usedIndexNames.has(n));

      // Collect all months in order
      const allHistMonths = Array.from(new Set(histFiltered.map(d => d.month))).sort();

      // Build lookup: indexName → month → value, and which of those are provisional.
      const histLookup = new Map<string, Map<string, number>>();
      const provLookup = new Map<string, Set<string>>();     // provisional (flagged) months
      const borrowLookup = new Map<string, Set<string>>();   // borrowed-from-earlier months
      for (const d of histFiltered) {
        if (!histLookup.has(d.indexName)) histLookup.set(d.indexName, new Map());
        histLookup.get(d.indexName)!.set(d.month, d.value);
        if (d.isBorrowed) {
          if (!borrowLookup.has(d.indexName)) borrowLookup.set(d.indexName, new Set());
          borrowLookup.get(d.indexName)!.add(d.month);
        } else if (d.isProvisional) {
          if (!provLookup.has(d.indexName)) provLookup.set(d.indexName, new Set());
          provLookup.get(d.indexName)!.add(d.month);
        }
      }
      const isProvCell = (n: string, mk: string) => provLookup.get(n)?.has(mk) === true;
      const isBorrowCell = (n: string, mk: string) => borrowLookup.get(n)?.has(mk) === true;

      // Build base values from quarterlyAverages
      const baseValLookup = new Map(affectedAverages.map(qa => [qa.indexName, qa.baseValue]));

      // Group months by quarter (3 months each starting from month after base)
      // Quarter N covers 3 months starting from offset 3(N-1)+1 from base month
      const baseYear = baseMonth.getFullYear();
      const baseMon  = baseMonth.getMonth(); // 0-indexed

      function getMonthOffset(mk: string): number {
        const [yr, mo] = mk.split('-').map(Number);
        return (yr - baseYear) * 12 + (mo - 1) - baseMon;
      }

      function getQuarterLabel(offset: number): string {
        if (offset <= 0) return 'BASE';
        const qNum = Math.ceil(offset / 3);
        // Label year comes from the quarter's FIRST month so a quarter spanning a
        // year boundary (e.g. Nov-Dec-Jan) stays one group with one 3-month average.
        const quarterStartOffset = (qNum - 1) * 3 + 1;
        return `Q${qNum}-${baseYear + Math.floor((baseMon + quarterStartOffset) / 12)}`;
      }

      // Build table rows
      // Columns: Period | idx1 | idx2 | ...
      const histHead = [['Period', ...orderedIdxNames]];

      // Build rows: base row, then grouped by quarter with average row
      const histRows: any[][] = [];

      // Base month row
      const baseMK = `${String(baseYear).padStart(4,'0')}-${String(baseMon + 1).padStart(2,'0')}`;
      const baseRowLabel = `BASE (${format(baseMonth, 'MMM yyyy')}) [Base Month]`;
      histRows.push([
        { content: baseRowLabel, styles: { fontStyle: 'bold' as const, fillColor: [230, 230, 230] as [number,number,number] } },
        ...orderedIdxNames.map(n => {
          const bv = baseValLookup.get(n) ?? histLookup.get(n)?.get(baseMK) ?? 0;
          return { content: fmtIdx(bv), styles: { fontStyle: 'bold' as const, fillColor: [230, 230, 230] as [number,number,number], halign: 'center' as const } };
        })
      ]);

      // Group non-base months by quarter
      const nonBaseMonths = allHistMonths.filter(mk => {
        const off = getMonthOffset(mk);
        return off > 0;
      });

      // Group into quarters
      const quarterGroups = new Map<string, string[]>();
      for (const mk of nonBaseMonths) {
        const off = getMonthOffset(mk);
        const ql = getQuarterLabel(off);
        if (!quarterGroups.has(ql)) quarterGroups.set(ql, []);
        quarterGroups.get(ql)!.push(mk);
      }

      for (const [qLabel, qMonths] of quarterGroups) {
        const isAffectedQuarter = qLabel === bill.quarter;
        const quarterHeaderFill = isAffectedQuarter
          ? [0, 130, 115] as [number, number, number]
          : [232, 232, 232] as [number, number, number];
        const affectedMonthFill = [230, 248, 245] as [number, number, number];
        const averageFill = isAffectedQuarter
          ? [205, 235, 230] as [number, number, number]
          : [242, 242, 242] as [number, number, number];

        // Quarter header row
        histRows.push([
          {
            content: `QUARTER ${qLabel}${isAffectedQuarter ? '  [AFFECTED QUARTER FOR THIS BILL]' : ''}`,
            colSpan: 1 + orderedIdxNames.length,
            styles: {
              fontStyle: 'bold' as const,
              fillColor: quarterHeaderFill,
              textColor: isAffectedQuarter ? [255, 255, 255] as [number, number, number] : [0, 0, 0] as [number, number, number],
            },
          }
        ]);

        // Monthly rows
        for (const mk of qMonths.sort()) {
          const [yr, mo] = mk.split('-').map(Number);
          const mLabel = format(new Date(yr, mo - 1, 1), 'MMM yyyy');
          histRows.push([
            { content: mLabel, styles: { fillColor: isAffectedQuarter ? affectedMonthFill : undefined } },
            ...orderedIdxNames.map(n => {
              const v = histLookup.get(n)?.get(mk);
              const borrowed = v !== undefined && isBorrowCell(n, mk);
              const prov = v !== undefined && !borrowed && isProvCell(n, mk);
              // Borrowed value (no number published for this month) → "(b)" in grey.
              // Provisional (published but not final) → "P" in amber. Final → plain black.
              const content = v === undefined ? '-' : borrowed ? `${fmtIdx(v)} (b)` : prov ? `${fmtIdx(v)} P` : fmtIdx(v);
              return {
                content,
                styles: {
                  halign: 'center' as const,
                  fontStyle: (prov ? 'bold' : 'normal') as 'bold' | 'normal',
                  textColor: (borrowed ? [107, 114, 128] : prov ? [180, 83, 9] : [0, 0, 0]) as [number, number, number],
                  fillColor: borrowed ? [243, 244, 246] as [number, number, number] : prov ? [254, 243, 199] as [number, number, number] : (isAffectedQuarter ? affectedMonthFill : undefined),
                },
              };
            })
          ]);
        }

        // Quarter average row
        const qAvgVals = orderedIdxNames.map(n => {
          const vals = qMonths.map(mk => histLookup.get(n)?.get(mk)).filter((v): v is number => v !== undefined);
          return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
        });
        const [qStart, qEnd] = [qMonths[0], qMonths[qMonths.length - 1]];
        const [ys, ms] = qStart.split('-').map(Number);
        const [ye, me] = qEnd.split('-').map(Number);
        const qAvgLabel = `${format(new Date(ys, ms - 1, 1), 'MMM yyyy')}-${format(new Date(ye, me - 1, 1), 'MMM yyyy')} AVG`;
        histRows.push([
          { content: `${qAvgLabel}${isAffectedQuarter ? ' [USED]' : ''}`, styles: { fontStyle: 'bold' as const, fillColor: averageFill } },
          ...qAvgVals.map(v => ({
            content: v !== null ? fmtIdx(v) : '-',
            styles: { fontStyle: 'bold' as const, halign: 'center' as const, fillColor: averageFill }
          }))
        ]);
      }

      // Column widths: Period(65) + equal split for each index
      const idxCols = orderedIdxNames.length;
      const periodColW = 65;
      const idxColEach = Math.floor((contentW - periodColW) / idxCols);
      const histColStyles: Record<number, any> = {
        0: { cellWidth: periodColW, halign: 'left' },
      };
      orderedIdxNames.forEach((_, i) => {
        histColStyles[1 + i] = { cellWidth: idxColEach, halign: 'center' };
      });

      autoTable(pdf, {
        startY: y,
        head: histHead,
        body: histRows,
        theme: 'grid',
        headStyles: {
          fillColor: [0, 150, 130],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8.5,
          halign: 'center',
          cellPadding: 2.5,
        },
        bodyStyles: {
          fontSize: 8.5,
          cellPadding: { top: 2, right: 3, bottom: 2, left: 3 },
          textColor: [0, 0, 0],
        },
        styles: { lineColor: [200, 200, 200], lineWidth: 0.25 },
        margin: { left: mL, right: mR },
        tableWidth: contentW,
        columnStyles: histColStyles,
      });

      // Legend for the P / (b) markers — shown whenever any cell is provisional or borrowed.
      if (isProvisional || provLookup.size > 0 || borrowLookup.size > 0) {
        let afterY = ((pdf as any).lastAutoTable?.finalY ?? y) + 5;
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'italic');
        if (provLookup.size > 0 || isProvisional) {
          pdf.setTextColor(180, 83, 9);
          pdf.text('P = provisional index (temporary — figures shaded amber will be revised when the final index is published).', mL, afterY);
          afterY += 4;
        }
        if (borrowLookup.size > 0) {
          pdf.setTextColor(107, 114, 128);
          pdf.text('(b) = borrowed from the previous available month because this month\'s index is not yet published; used in the quarter average.', mL, afterY);
        }
        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'normal');
      }
    }
  }

  // ── AVERAGE JPC STEEL & MONTHLY FUEL (DIESEL) INDICES ─────────────────────
  // Generated average tables in the railway proforma, filtered to the sections
  // and city actually selected for this bill.
  const drawProformaHeader = (title: string, clauseNote: string) => {
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text(title, pageW / 2, y, { align: 'center' });
    y += 5;
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    const nowLines = pdf.splitTextToSize(pdfSafe(`Name of Work: ${bill.contract.workDescription || '-'}`), contentW);
    pdf.text(nowLines, mL, y);
    y += nowLines.length * 3.6 + 1;
    const loaBits = [
      bill.contract.loaNo ? `LOA No.: ${bill.contract.loaNo}` : `Agreement No.: ${bill.contract.agreementNo}`,
      bill.contract.loaDate ? `dtd: ${format(new Date(bill.contract.loaDate), 'dd.MM.yyyy')}` : '',
    ].filter(Boolean).join('   ');
    pdf.text(loaBits, mL, y);
    y += 4;
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(80, 80, 80);
    pdf.text(clauseNote, mL, y);
    pdf.setTextColor(0, 0, 0);
    y += 3;
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.4);
    pdf.line(mL, y, pageW - mR, y);
    y += 5;
  };

  // Clean section label: "Steel TMT Bars - Mumbai" -> "TMT Bars"
  const cleanSteelLabel = (name: string) =>
    name.replace(/^Steel\s+/i, '').replace(/\s*-\s*[A-Za-z ]+$/,'').trim();

  // Shows how the Quarter Average (I1) is derived: it is the arithmetic mean of
  // the quarter's monthly values, printed as an explicit sum for each column.
  const renderAvgCalc = (indexNames: string[], labelFor: (n: string) => string) => {
    const monthLabel = (mk: string) => {
      const [yr, mo] = mk.split('-');
      return format(new Date(+yr, +mo - 1, 1), 'MMM yyyy');
    };
    const refQa = indexNames
      .map(n => quarterlyAverages.find(q => q.indexName === n))
      .find(q => q && (q.monthlyValues?.length ?? 0) > 0);
    const refMonths = refQa?.monthlyValues || [];
    if (refMonths.length === 0) return;

    y = pdf.lastAutoTable.finalY + 6;
    ensureSpace(12 + indexNames.length * 4);
    pdf.setFontSize(8.5);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`How the Quarter Average (I1) [${bill.quarter}] is calculated`, mL, y);
    y += 4.5;
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(60, 60, 60);
    const introLines = pdf.splitTextToSize(
      `The Quarter Average is the arithmetic mean of the published monthly index values for the quarter months (${refMonths.map(mv => monthLabel(mv.month)).join(', ')}):`,
      contentW,
    );
    pdf.text(introLines, mL, y);
    y += introLines.length * 3.6 + 1.5;
    pdf.setTextColor(0, 0, 0);
    for (const n of indexNames) {
      const qa = quarterlyAverages.find(q => q.indexName === n);
      const mvs = qa?.monthlyValues || [];
      if (mvs.length === 0) continue;
      const values = mvs.map(mv => fmtIdx(mv.value));
      const line = `${labelFor(n)}  =  (${values.join(' + ')}) / ${values.length}  =  ${fmtIdx(qa!.average)}`;
      const wrapped = pdf.splitTextToSize(line, contentW);
      ensureSpace(wrapped.length * 3.6 + 2);
      pdf.text(wrapped, mL, y);
      y += wrapped.length * 3.6 + 1.5;
    }
  };

  // Renders one steel section as its own table showing the constituent JPC
  // readings (e.g. TMT: 10mm F1/F2, 25mm F1/F2) and the derived monthly index,
  // so the reader can see how each section's average is built up.
  const renderSteelSectionTable = (section: SteelBreakdownSection) => {
    const monthsAll = section.months.filter(m => m.average != null || m.values.some(v => v != null));
    if (monthsAll.length === 0) return;
    const baseMK = `${baseMonth.getFullYear()}-${String(baseMonth.getMonth() + 1).padStart(2, '0')}`;
    const qa = quarterlyAverages.find(q => q.indexName === section.indexName);
    const quarterKeys = new Set((qa?.monthlyValues || []).map(m => m.month));
    const cell = (v: number | null | undefined) => (v == null ? '-' : fmtIdx(v));

    ensureSpace(34);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.text(section.sectionLabel, mL, y);
    y += 4;
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(80, 80, 80);
    pdf.text(`Monthly index = ${section.formula}`, mL, y);
    pdf.setTextColor(0, 0, 0);
    y += 2.5;

    const head = [['Month', ...section.columns, 'Average']];
    const grey = [230, 230, 230] as [number, number, number];
    const teal = [205, 235, 230] as [number, number, number];
    const body: any[] = [];
    for (const m of monthsAll) {
      const [yr, mo] = m.month.split('-').map(Number);
      const isBase = m.month === baseMK;
      const label = `${isBase ? 'Base (' : ''}${format(new Date(yr, mo - 1, 1), 'MMM yyyy')}${isBase ? ')' : ''}`;
      const baseSty = isBase ? { fontStyle: 'bold' as const, fillColor: grey } : {};
      body.push([
        { content: label, styles: { ...baseSty } },
        ...m.values.map(v => ({ content: cell(v), styles: { halign: 'center' as const, ...baseSty } })),
        { content: cell(m.average), styles: { halign: 'center' as const, fontStyle: 'bold' as const, ...(isBase ? { fillColor: grey } : {}) } },
      ]);
    }
    // Quarter-average row: per-column mean over the quarter months, plus the
    // official section I1 in the Average column.
    const qMonths = monthsAll.filter(m => quarterKeys.has(m.month));
    const colMeans = section.columns.map((_, ci) => {
      const vals = qMonths.map(m => m.values[ci]).filter((v): v is number => v != null && v > 0);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    });
    body.push([
      { content: `Quarter Average (I1) [${bill.quarter}]`, styles: { fontStyle: 'bold' as const, fillColor: teal } },
      ...colMeans.map(v => ({ content: cell(v), styles: { halign: 'center' as const, fontStyle: 'bold' as const, fillColor: teal } })),
      { content: fmtIdx(qa?.average ?? 0), styles: { halign: 'center' as const, fontStyle: 'bold' as const, fillColor: teal } },
    ]);

    const nCols = section.columns.length;
    const dataW = contentW - 40 - 30;
    const colW = Math.floor(dataW / nCols);
    const colStyles: Record<number, any> = { 0: { cellWidth: 40, halign: 'left' } };
    section.columns.forEach((_, i) => { colStyles[1 + i] = { cellWidth: colW, halign: 'center' }; });
    colStyles[1 + nCols] = { cellWidth: 30, halign: 'center' };

    autoTable(pdf, {
      startY: y + 1,
      head,
      body,
      theme: 'grid',
      headStyles: { fillColor: [20, 20, 20], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8, halign: 'center', valign: 'middle', cellPadding: 2 },
      bodyStyles: { fontSize: 8, cellPadding: { top: 1.4, right: 2, bottom: 1.4, left: 2 }, textColor: [0, 0, 0] },
      styles: { lineColor: [180, 180, 180], lineWidth: 0.3 },
      margin: { left: mL, right: mR, top: mT },
      tableWidth: contentW,
      columnStyles: colStyles,
    });
    y = pdf.lastAutoTable.finalY + 5;
  };

  // AVERAGE JPC STEEL INDICES (selected sections only)
  if (weights.steel > 0.0001 && usedSteelIndexNames.length > 0) {
    // Preferred: per-section breakdown tables showing the constituent JPC
    // readings (F1/F2 per size) that build up each section's monthly index.
    const usedBreakdown = (steelBreakdown || []).filter(s =>
      usedSteelIndexNames.includes(s.indexName)
      && s.months.some(m => m.average != null || m.values.some(v => v != null)));

    if (usedBreakdown.length > 0) {
      pdf.addPage();
      y = mT;
      drawProformaHeader(
        'AVERAGE JPC STEEL INDICES',
        'Clause 46A.9:(1) Relevant category of steel for the purpose of Price Variation formula as mentioned in this clause. '
        + 'Each section index is the average of the JPC readings shown; the fortnightly F1/F2 prices build up the monthly value.',
      );
      // Order the section tables to match the bill's used sections.
      for (const n of usedSteelIndexNames) {
        const section = usedBreakdown.find(s => s.indexName === n);
        if (section) renderSteelSectionTable(section);
      }
      renderAvgCalc(usedSteelIndexNames, cleanSteelLabel);
    } else {
    const steelHist = allHistoricalMonthlyData.filter(d => usedSteelIndexNames.includes(d.indexName));
    if (steelHist.length > 0) {
      pdf.addPage();
      y = mT;
      drawProformaHeader(
        'AVERAGE JPC STEEL INDICES',
        'Clause 46A.9:(1) Relevant category of steel for the purpose of Price Variation formula as mentioned in this clause. '
        + 'Values are the average JPC steel indices for the section(s) applicable to this bill.',
      );

      const baseMKey = `${baseMonth.getFullYear()}-${String(baseMonth.getMonth() + 1).padStart(2, '0')}`;
      const steelMonths = Array.from(new Set(steelHist.map(d => d.month))).sort().filter(mk => mk !== baseMKey);
      const steelLookup = new Map<string, Map<string, number>>();
      for (const d of steelHist) {
        if (!steelLookup.has(d.indexName)) steelLookup.set(d.indexName, new Map());
        steelLookup.get(d.indexName)!.set(d.month, d.value);
      }
      const steelBaseLookup = new Map(quarterlyAverages.map(qa => [qa.indexName, qa.baseValue]));
      const steelAvgLookup = new Map(quarterlyAverages.map(qa => [qa.indexName, qa.average]));

      const steelHead = [['Month', ...usedSteelIndexNames.map(cleanSteelLabel)]];
      const steelRows: any[] = [];
      // Base month row
      steelRows.push([
        { content: `Base (${format(baseMonth, 'MMM yyyy')})`, styles: { fontStyle: 'bold' as const, fillColor: [230, 230, 230] as [number, number, number] } },
        ...usedSteelIndexNames.map(n => ({
          content: fmtIdx(steelBaseLookup.get(n) ?? steelLookup.get(n)?.get(`${baseMonth.getFullYear()}-${String(baseMonth.getMonth() + 1).padStart(2, '0')}`) ?? 0),
          styles: { fontStyle: 'bold' as const, halign: 'center' as const, fillColor: [230, 230, 230] as [number, number, number] },
        })),
      ]);
      for (const mk of steelMonths) {
        const [yr, mo] = mk.split('-').map(Number);
        steelRows.push([
          format(new Date(yr, mo - 1, 1), 'MMM yyyy'),
          ...usedSteelIndexNames.map(n => {
            const v = steelLookup.get(n)?.get(mk);
            return { content: v !== undefined ? fmtIdx(v) : '-', styles: { halign: 'center' as const } };
          }),
        ]);
      }
      // Quarter average row
      steelRows.push([
        { content: `Quarter Average (I1) [${bill.quarter}]`, styles: { fontStyle: 'bold' as const, fillColor: [205, 235, 230] as [number, number, number] } },
        ...usedSteelIndexNames.map(n => ({
          content: fmtIdx(steelAvgLookup.get(n) ?? 0),
          styles: { fontStyle: 'bold' as const, halign: 'center' as const, fillColor: [205, 235, 230] as [number, number, number] },
        })),
      ]);

      // Full page width: fixed Month column, remaining width split across sections.
      const steelMonthColW = 60;
      const steelColW = Math.floor((contentW - steelMonthColW) / usedSteelIndexNames.length);
      const steelColStyles: Record<number, any> = { 0: { cellWidth: steelMonthColW, halign: 'left' } };
      usedSteelIndexNames.forEach((_, i) => { steelColStyles[1 + i] = { cellWidth: steelColW, halign: 'center' }; });

      autoTable(pdf, {
        startY: y,
        head: steelHead,
        body: steelRows,
        theme: 'grid',
        headStyles: { fillColor: [20, 20, 20], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5, halign: 'center', valign: 'middle', cellPadding: 2 },
        bodyStyles: { fontSize: 8.5, cellPadding: { top: 1.5, right: 3, bottom: 1.5, left: 3 }, textColor: [0, 0, 0] },
        alternateRowStyles: { fillColor: [248, 248, 248] },
        styles: { lineColor: [180, 180, 180], lineWidth: 0.3 },
        margin: { left: mL, right: mR },
        tableWidth: contentW,
        columnStyles: steelColStyles,
      });

      renderAvgCalc(usedSteelIndexNames, cleanSteelLabel);
    }
    }
  }

  // MONTHLY FUEL INDICES (DIESEL) — selected city only
  if (weights.fuel > 0.0001) {
    const fuelHist = allHistoricalMonthlyData.filter(d => d.indexName === fuelIndexName);
    if (fuelHist.length > 0) {
      const cityLabel = fuelIndexName === 'MPNG Fuel'
        ? '4-City Average (Delhi, Mumbai, Chennai, Kolkata)'
        : fuelIndexName.replace(/^MPNG Fuel\s*-\s*/i, '');
      pdf.addPage();
      y = mT;
      drawProformaHeader(
        'MONTHLY FUEL INDICES (DIESEL)',
        `Average of official Diesel prices published by the Petroleum Planning & Analysis Cell (PPAC). Basis: ${cityLabel}.`,
      );

      const fuelBaseVal = quarterlyAverages.find(qa => qa.indexName === fuelIndexName)?.baseValue
        ?? fuelHist.find(d => d.month === `${baseMonth.getFullYear()}-${String(baseMonth.getMonth() + 1).padStart(2, '0')}`)?.value ?? 0;
      const fuelAvgVal = quarterlyAverages.find(qa => qa.indexName === fuelIndexName)?.average ?? 0;

      const fuelHead = [['Month', `Diesel Rate — ${cityLabel} (Rs./Litre)`]];
      const fuelRows: any[] = [];
      fuelRows.push([
        { content: `Base (${format(baseMonth, 'MMM yyyy')})`, styles: { fontStyle: 'bold' as const, fillColor: [230, 230, 230] as [number, number, number] } },
        { content: fmtIdx(fuelBaseVal), styles: { fontStyle: 'bold' as const, halign: 'center' as const, fillColor: [230, 230, 230] as [number, number, number] } },
      ]);
      const fuelBaseMKey = `${baseMonth.getFullYear()}-${String(baseMonth.getMonth() + 1).padStart(2, '0')}`;
      for (const d of [...fuelHist].filter(d => d.month !== fuelBaseMKey).sort((a, b) => a.month.localeCompare(b.month))) {
        const [yr, mo] = d.month.split('-').map(Number);
        fuelRows.push([
          format(new Date(yr, mo - 1, 1), 'MMM yyyy'),
          { content: fmtIdx(d.value), styles: { halign: 'center' as const } },
        ]);
      }
      fuelRows.push([
        { content: `Quarter Average (I1) [${bill.quarter}]`, styles: { fontStyle: 'bold' as const, fillColor: [205, 235, 230] as [number, number, number] } },
        { content: fmtIdx(fuelAvgVal), styles: { fontStyle: 'bold' as const, halign: 'center' as const, fillColor: [205, 235, 230] as [number, number, number] } },
      ]);

      autoTable(pdf, {
        startY: y,
        head: fuelHead,
        body: fuelRows,
        theme: 'grid',
        headStyles: { fillColor: [20, 20, 20], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5, halign: 'center', valign: 'middle', cellPadding: 2 },
        bodyStyles: { fontSize: 8.5, cellPadding: { top: 1.5, right: 3, bottom: 1.5, left: 3 }, textColor: [0, 0, 0] },
        alternateRowStyles: { fillColor: [248, 248, 248] },
        styles: { lineColor: [180, 180, 180], lineWidth: 0.3 },
        margin: { left: mL, right: mR },
        tableWidth: contentW,
        columnStyles: { 0: { cellWidth: 90, halign: 'left' }, 1: { cellWidth: contentW - 90, halign: 'center' } },
      });

      renderAvgCalc([fuelIndexName], () => `Diesel Rate — ${cityLabel}`);
    }
  }
  }

  // ── PROVISIONAL WATERMARK on page 1 ──────────────────────────────────────
  if (isProvisional) {
    pdf.setPage(1);
    pdf.saveGraphicsState();
    // Use GState for transparency — jsPDF supports setGState with opacity
    (pdf as any).setGState(new (pdf as any).GState({ opacity: 0.10 }));
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(72);
    pdf.setTextColor(200, 0, 0);
    // Rotate 45 degrees around page center
    pdf.text('PROVISIONAL', pageW / 2, pageH / 2, {
      align: 'center',
      baseline: 'middle',
      angle: 45,
    });
    pdf.restoreGraphicsState();
    pdf.setTextColor(0, 0, 0);
  }

  return Buffer.from(pdf.output('arraybuffer'));
}
