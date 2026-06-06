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
  const steelIdx = steelIndexNames[0] || 'Steel TMT Bars';

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
  ensureSpace(50);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('C. PRICE VARIATION COMPUTATION (GCC Clause 17)', mL, y);
  y += 4;

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

  const steelBase  = getIndexBase(quarterlyAverages, steelIdx, ...steelIndexNames);
  const steelAvg   = getIndexAvg(quarterlyAverages, steelIdx, ...steelIndexNames);
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
      0: { cellWidth: 10,  halign: 'center' },
      1: { cellWidth: 52,  halign: 'left'   },
      2: { cellWidth: 22,  halign: 'center' },
      3: { cellWidth: 38,  halign: 'right'  },
      4: { cellWidth: 22,  halign: 'center' },
      5: { cellWidth: 35,  halign: 'center' },
      6: { cellWidth: 26,  halign: 'center' },
      7: { cellWidth: 38,  halign: 'right'  },
    },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.row.index === tableBody.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [220, 220, 220];
        data.cell.styles.fontSize = 9;
      }
    },
  });

  y = pdf.lastAutoTable.finalY + 4;

  // ── SUMMARY + CERTIFICATION side by side ──────────────────────────────────
  // No ensureSpace here — let summary flow naturally; if PVC table is tall it
  // may overflow, but we handle it by just placing at y and letting autoTable decide.

  // Summary table (right-aligned, 120mm wide)
  const summaryX = pageW - mR - 120;
  autoTable(pdf, {
    startY: y,
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

  const summaryEndY = pdf.lastAutoTable.finalY;

  // Certification note (left side, same y)
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  const certText = 'Certified that the above Price Variation Clause has been calculated as per the\ncontract conditions and the indices published by the competent authority.';
  pdf.text(certText, mL, y + 4);

  // Provisional note
  if (isProvisional && provisionalIndices.length > 0) {
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(180, 0, 0);
    const note = `Note: Provisional indices used: ${provisionalIndices.join(', ')}`;
    const noteLines = pdf.splitTextToSize(note, summaryX - mL - 5);
    pdf.text(noteLines, mL, y + 14);
    pdf.setTextColor(0, 0, 0);
  }

  y = summaryEndY + 6;

  // ── SIGNATURE BLOCK ────────────────────────────────────────────────────────
  const sigW = contentW / 3;
  const sigLabels = ['Prepared by', 'Checked by', 'Approved by'];
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  for (let i = 0; i < 3; i++) {
    const sx = mL + i * sigW;
    pdf.text(sigLabels[i], sx + sigW / 2, y, { align: 'center' });
  }
  y += 10;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  for (let i = 0; i < 3; i++) {
    const sx = mL + i * sigW;
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.3);
    pdf.line(sx + 8, y, sx + sigW - 8, y);
    pdf.text('(Name & Designation)', sx + sigW / 2, y + 4, { align: 'center' });
    pdf.text('Date: _______________', sx + sigW / 2, y + 9, { align: 'center' });
  }

  // ── PAGE 2: PRICE INDICES TABLE ────────────────────────────────────────────
  if (quarterlyAverages.length > 0) {
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

    const idxHead = [[
      'Index Name',
      'Base Month Value (I0)',
      `Quarter Average (I1) [${bill.quarter}]`,
      'Variation (I1-I0)/I0',
      'Variation %',
    ]];

    const idxBody = quarterlyAverages.map(qa => {
      const variation = qa.baseValue > 0 ? (qa.average - qa.baseValue) / qa.baseValue : 0;
      return [
        qa.indexName,
        fmtIdx(qa.baseValue),
        fmtIdx(qa.average),
        variation.toFixed(4),
        (variation * 100).toFixed(2) + '%',
      ];
    });

    autoTable(pdf, {
      startY: y,
      head: idxHead,
      body: idxBody,
      theme: 'grid',
      headStyles: {
        fillColor: [20, 20, 20],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
        halign: 'center',
        cellPadding: 3,
      },
      bodyStyles: { fontSize: 9, cellPadding: 3, textColor: [0, 0, 0] },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      styles: { lineColor: [180, 180, 180], lineWidth: 0.3 },
      margin: { left: mL, right: mR },
      tableWidth: contentW,
      columnStyles: {
        0: { cellWidth: 90,  halign: 'left'   },
        1: { cellWidth: 50,  halign: 'center' },
        2: { cellWidth: 65,  halign: 'center' },
        3: { cellWidth: 40,  halign: 'center' },
        4: { cellWidth: 28,  halign: 'center' },
      },
    });

    y = pdf.lastAutoTable.finalY + 5;
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(80, 80, 80);
    pdf.text('* Indices as published by Ministry of Statistics & PI (Labour), RBI (WPI), and MPNG (Fuel). Quarter average = arithmetic mean of 3 monthly values.', mL, y);
    pdf.setTextColor(0, 0, 0);
  }

  // ── PAGE NUMBERS ────────────────────────────────────────────────────────────
  const totalPages = (pdf as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 100, 100);
    pdf.text(`PVC No.: ${bill.pvcNumber || 'N/A'}`, mL, pageH - 5, { align: 'left' });
    pdf.text(`Page ${p} of ${totalPages}`, pageW / 2, pageH - 5, { align: 'center' });
    pdf.text(`Generated: ${format(new Date(), 'dd-MM-yyyy HH:mm')}`, pageW - mR, pageH - 5, { align: 'right' });
    pdf.setTextColor(0, 0, 0);
  }

  return Buffer.from(pdf.output('arraybuffer'));
}
