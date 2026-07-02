/**
 * Indian Railway Standard PVC Statement Generator
 * Format as per Railway Board GCC Clause 17 / 17A / 17B Proforma
 * A4 Landscape for better readability
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

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
  itemRows?: Array<{ itemNumber?: string | null }> | null;
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
  allHistoricalMonthlyData?: { indexName: string; month: string; value: number }[];
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
  } = opts;

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
  pdf.text('(As per GCC Clause 17 / Railway Board Guidelines)', pageW / 2, y, { align: 'center' });
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
      { content: bill.contract.workDescription || '-', colSpan: 3 },
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

  // ── C. PVC COMPUTATION TABLE ───────────────────────────────────────────────
  ensureSpace(60);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('C. PRICE VARIATION COMPUTATION (GCC Clause 17)', mL, y);
  y += 5;

  // GCC Formula display
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(60, 60, 60);
  pdf.text('Formula (GCC Cl.17):  Vn = W x SUM[ Pn x (In - I0) / I0 ]', mL + 2, y);
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

  autoTable(pdf, {
    startY: summaryStartY,
    body: [
      ['Net PVC Amount for this Bill', 'Rs. ' + fmt(totalPvcAmt)],
      ['Previous Cumulative PVC',      'Rs. ' + fmt(pvc?.previousPvcTotal ?? 0)],
      ['Current Cumulative PVC',       'Rs. ' + fmt(pvc?.cumulativePvc ?? 0)],
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
      'Schedule',
      'Amount (Rs.)',
      'Why this classification applies',
    ]];
    const classBody = detailEntries.map((entry, index) => {
      const sub = entry.subClassification;
      const classification = sub?.code ? `${sub.code}${sub.name ? ' - ' + sub.name : ''}` : '-';
      const justification = String(entry.classificationJustification || '').trim()
        || String(entry.description || '').trim()
        || '-';
      const rowItemNumbers = (entry.itemRows || [])
        .map(row => String(row?.itemNumber || '').trim())
        .filter(Boolean);
      const itemNumbers = rowItemNumbers.length > 0
        ? Array.from(new Set(rowItemNumbers)).join(', ')
        : String(entry.itemNumber || '').trim() || '-';
      return [
        index + 1,
        itemNumbers,
        classification,
        entry.scheduleItem || '-',
        fmt(Number(entry.amount) || 0),
        justification,
      ];
    });

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
        1: { cellWidth: 30, halign: 'left' },
        2: { cellWidth: 42, halign: 'left' },
        3: { cellWidth: 24, halign: 'left' },
        4: { cellWidth: 30, halign: 'right' },
        5: { cellWidth: 137, halign: 'left' },
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

  // ── PAGE 2: AFFECTED PRICE INDICES WITH MONTHLY BREAKDOWN ─────────────────
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

      // Build lookup: indexName → month → value
      const histLookup = new Map<string, Map<string, number>>();
      for (const d of histFiltered) {
        if (!histLookup.has(d.indexName)) histLookup.set(d.indexName, new Map());
        histLookup.get(d.indexName)!.set(d.month, d.value);
      }

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
        return `Q${qNum}-${baseYear + Math.floor((baseMon + offset) / 12)}`;
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
        // Quarter header row
        histRows.push([
          { content: `QUARTER ${qLabel}`, colSpan: 1 + orderedIdxNames.length,
            styles: { fontStyle: 'bold' as const, fillColor: [220, 235, 220] as [number,number,number] } }
        ]);

        // Monthly rows
        for (const mk of qMonths.sort()) {
          const [yr, mo] = mk.split('-').map(Number);
          const mLabel = format(new Date(yr, mo - 1, 1), 'MMM yyyy');
          histRows.push([
            mLabel,
            ...orderedIdxNames.map(n => {
              const v = histLookup.get(n)?.get(mk);
              return { content: v !== undefined ? fmtIdx(v) : '-', styles: { halign: 'center' as const } };
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
          { content: qAvgLabel, styles: { fontStyle: 'bold' as const, fillColor: [240, 248, 240] as [number,number,number] } },
          ...qAvgVals.map(v => ({
            content: v !== null ? fmtIdx(v) : '-',
            styles: { fontStyle: 'bold' as const, halign: 'center' as const, fillColor: [240, 248, 240] as [number,number,number] }
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
      angle: 45,
    });
    pdf.restoreGraphicsState();
    pdf.setTextColor(0, 0, 0);
  }

  return Buffer.from(pdf.output('arraybuffer'));
}
