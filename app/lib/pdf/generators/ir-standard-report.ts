/**
 * Indian Railway Standard PVC Statement Generator
 * Format as per Railway Board GCC Clause 17 / 17A / 17B Proforma
 * A4 Portrait, formal official layout
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

function fmt(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtIdx(n: number): string {
  return n.toFixed(2);
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(4) + '%';
}

function getIndexAvg(quarterlyAverages: QuarterlyAverage[], ...names: string[]): number {
  for (const name of names) {
    const found = quarterlyAverages.find(q => q.indexName === name);
    if (found) return found.average;
  }
  return 0;
}

function getIndexBase(quarterlyAverages: QuarterlyAverage[], ...names: string[]): number {
  for (const name of names) {
    const found = quarterlyAverages.find(q => q.indexName === name);
    if (found) return found.baseValue;
  }
  return 0;
}

/**
 * Compute weighted component percentages from classification entries.
 * Returns percentages as decimals (e.g., 0.35 = 35%).
 */
function computeWeightedComponents(entries: ClassificationEntry[], billAmount: number) {
  const weights = { labour: 0, plantMachinery: 0, fuel: 0, cement: 0, steel: 0, otherMaterials: 0, explosives: 0, fixed: 0 };
  if (!entries || entries.length === 0 || billAmount <= 0) return weights;

  for (const entry of entries) {
    const sub = entry.subClassification;
    if (!sub) continue;
    const w = entry.amount / billAmount;
    weights.labour += (sub.labour || 0) * w / 100;
    weights.plantMachinery += (sub.plantMachinery || 0) * w / 100;
    weights.fuel += (sub.fuel || 0) * w / 100;
    weights.cement += (sub.cement || 0) * w / 100;
    weights.steel += (sub.steel || 0) * w / 100;
    weights.otherMaterials += (sub.otherMaterials || 0) * w / 100;
    weights.explosives += (sub.explosives || 0) * w / 100;
    weights.fixed += (sub.fixed || 0) * w / 100;
  }
  return weights;
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

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  autoTable(pdf, {}); // init

  const pageW = 210;
  const pageH = 297;
  const mL = 15;
  const mR = 15;
  const mT = 15;
  const contentW = pageW - mL - mR;

  let y = mT;

  const pvc = bill.pvcCalculation;
  const billAmount = bill.grossBillAmount ?? bill.billAmount;
  const entries = (bill.classificationEntries || []) as ClassificationEntry[];
  const weights = computeWeightedComponents(entries, billAmount);

  // Steel: weighted average index (use first found)
  const steelIdx = steelIndexNames[0] || 'Steel TMT Bars';

  // Helper: add new page if needed
  const ensureSpace = (need: number) => {
    if (y + need > pageH - 20) {
      pdf.addPage();
      y = mT;
    }
  };

  // ─── HEADER ────────────────────────────────────────────────────────────────
  pdf.setFontSize(13);
  pdf.setFont('helvetica', 'bold');
  pdf.text(organizationName, pageW / 2, y, { align: 'center' });
  y += 6;
  if (divisionName) {
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    pdf.text(divisionName, pageW / 2, y, { align: 'center' });
    y += 5;
  }

  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('STATEMENT SHOWING PRICE VARIATION CLAUSE', pageW / 2, y, { align: 'center' });
  y += 5;
  pdf.setFontSize(10);
  pdf.text('(As per GCC Clause 17 / Railway Board Guidelines)', pageW / 2, y, { align: 'center' });
  y += 3;

  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.6);
  pdf.line(mL, y, pageW - mR, y);
  y += 1;
  pdf.setLineWidth(0.2);
  pdf.line(mL, y, pageW - mR, y);
  y += 5;

  // ─── CONTRACT & BILL INFO (2-column key-value) ─────────────────────────────
  const infoRows: [string, string, string, string][] = [
    ['Name of Work:', bill.contract.workDescription || '-', '', ''],
    ['Agreement No.:', bill.contract.agreementNo || '-', 'Date of Opening:', format(new Date(bill.contract.dateOfOpening), 'dd MMM yyyy')],
    ['Contractor:', bill.contract.contractorName || '-', 'Base Month (T₀):', format(baseMonth, 'MMM yyyy')],
    ['Contract Value:', bill.contract.contractValue ? `₹${bill.contract.contractValue.toLocaleString('en-IN')}` : 'N/A', 'Completion Period:', bill.contract.completionPeriodMonths ? `${bill.contract.completionPeriodMonths} Months` : 'N/A'],
    ['LOA No.:', bill.contract.loaNo || 'N/A', 'Railway Zone:', bill.zone || 'N/A'],
  ];

  const billInfoRows: [string, string, string, string][] = [
    ['Bill No.:', bill.billNo || '-', 'Date of Measurement:', format(new Date(bill.dateOfMeasurement), 'dd MMM yyyy')],
    ['Gross Bill Amount (W):', `₹${fmt(billAmount)}`, 'Quarter:', bill.quarter || '-'],
    ['PVC No.:', bill.pvcNumber || 'Not Assigned', 'Fuel Pricing:', bill.fuelPriceType === 'zone_city' ? 'Zone City Price' : '4-City Average'],
    ['Indices Status:', isProvisional ? 'PROVISIONAL' : 'FINAL', 'Extension Type:', bill.contract.isExtended ? (bill.contract.extensionType || 'Extended') : 'None'],
  ];

  const col1LabelW = 50;
  const col1ValW = 38;
  const col2LabelW = 50;
  const col2ValW = contentW - col1LabelW - col1ValW - col2LabelW;
  const c1L = mL;
  const c1V = mL + col1LabelW;
  const c2L = mL + col1LabelW + col1ValW + 4;
  const c2V = c2L + col2LabelW;

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('A. CONTRACT DETAILS', mL, y);
  y += 5;

  for (const [l1, v1, l2, v2] of infoRows) {
    if (l1 === 'Name of Work:') {
      // Full width row
      pdf.setFont('helvetica', 'bold');
      pdf.text(l1, c1L, y);
      pdf.setFont('helvetica', 'normal');
      const lines = pdf.splitTextToSize(v1, contentW - col1LabelW - 4);
      pdf.text(lines, c1V, y);
      y += Math.max(5, lines.length * 4.5);
      continue;
    }
    pdf.setFont('helvetica', 'bold');
    pdf.text(l1, c1L, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text(pdf.splitTextToSize(v1, col1ValW - 2), c1V, y);
    if (l2) {
      pdf.setFont('helvetica', 'bold');
      pdf.text(l2, c2L, y);
      pdf.setFont('helvetica', 'normal');
      pdf.text(pdf.splitTextToSize(v2, col2ValW - 2), c2V, y);
    }
    y += 5;
  }

  y += 2;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('B. BILL DETAILS', mL, y);
  y += 5;

  for (const [l1, v1, l2, v2] of billInfoRows) {
    pdf.setFont('helvetica', 'bold');
    pdf.text(l1, c1L, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text(pdf.splitTextToSize(v1, col1ValW - 2), c1V, y);
    if (l2) {
      pdf.setFont('helvetica', 'bold');
      pdf.text(l2, c2L, y);
      pdf.setFont('helvetica', 'normal');
      pdf.text(pdf.splitTextToSize(v2, col2ValW - 2), c2V, y);
    }
    y += 5;
  }

  y += 3;
  pdf.setDrawColor(100, 100, 100);
  pdf.setLineWidth(0.3);
  pdf.line(mL, y, pageW - mR, y);
  y += 5;

  // ─── PVC COMPUTATION TABLE ──────────────────────────────────────────────────
  ensureSpace(60);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('C. PRICE VARIATION COMPUTATION (GCC Clause 17)', mL, y);
  y += 5;

  // Build component rows
  // PVC amount = stored from pvcCalculation (already computed correctly)
  // Component % = weighted from entries
  // I₀ and I₁ from quarterlyAverages

  const labourBase = getIndexBase(quarterlyAverages, 'Labour');
  const labourAvg = getIndexAvg(quarterlyAverages, 'Labour');
  const labourVariation = labourBase > 0 ? (labourAvg - labourBase) / labourBase : 0;
  const labourPct = weights.labour;
  const labourAmt = billAmount * labourPct;
  const labourPvc = pvc?.labourPvc ?? 0;

  const plantBase = getIndexBase(quarterlyAverages, 'RBI Plant Machinery');
  const plantAvg = getIndexAvg(quarterlyAverages, 'RBI Plant Machinery');
  const plantVariation = plantBase > 0 ? (plantAvg - plantBase) / plantBase : 0;
  const plantPct = weights.plantMachinery;
  const plantAmt = billAmount * plantPct;
  const plantPvc = pvc?.plantMachineryPvc ?? 0;

  const fuelBase = getIndexBase(quarterlyAverages, fuelIndexName, 'MPNG Fuel');
  const fuelAvg = getIndexAvg(quarterlyAverages, fuelIndexName, 'MPNG Fuel');
  const fuelVariation = fuelBase > 0 ? (fuelAvg - fuelBase) / fuelBase : 0;
  const fuelPct = weights.fuel;
  const fuelAmt = billAmount * fuelPct;
  const fuelPvc = pvc?.fuelPowerPvc ?? 0;

  const cementBase = getIndexBase(quarterlyAverages, 'RBI Cement');
  const cementAvg = getIndexAvg(quarterlyAverages, 'RBI Cement');
  const cementVariation = cementBase > 0 ? (cementAvg - cementBase) / cementBase : 0;
  const cementPct = weights.cement;
  const cementAmt = billAmount * cementPct;
  const dedicatedCementPvc = pvc?.dedicatedCementPvc ?? 0;
  const cementPvc = (pvc?.cementPvc ?? 0) + dedicatedCementPvc;

  const steelBase = getIndexBase(quarterlyAverages, steelIdx, ...steelIndexNames);
  const steelAvg = getIndexAvg(quarterlyAverages, steelIdx, ...steelIndexNames);
  const steelVariation = steelBase > 0 ? (steelAvg - steelBase) / steelBase : 0;
  const steelPct = weights.steel;
  const steelAmt = billAmount * steelPct;
  const dedicatedSteelPvc = (pvc?.dedicatedSteelTmtBarsPvc ?? 0) + (pvc?.dedicatedSteelAngleChannelPvc ?? 0) + (pvc?.dedicatedSteelPlatesPvc ?? 0) + (pvc?.dedicatedSteelOtherSectionsPvc ?? 0);
  const steelPvc = (pvc?.steelPvc ?? 0) + dedicatedSteelPvc;

  const otherBase = getIndexBase(quarterlyAverages, 'RBI Other Materials');
  const otherAvg = getIndexAvg(quarterlyAverages, 'RBI Other Materials');
  const otherVariation = otherBase > 0 ? (otherAvg - otherBase) / otherBase : 0;
  const otherPct = weights.otherMaterials;
  const otherAmt = billAmount * otherPct;
  const otherPvc = pvc?.otherMaterialsPvc ?? 0;

  const explosivesBase = getIndexBase(quarterlyAverages, 'RBI Explosives');
  const explosivesAvg = getIndexAvg(quarterlyAverages, 'RBI Explosives');
  const explosivesVariation = explosivesBase > 0 ? (explosivesAvg - explosivesBase) / explosivesBase : 0;
  const explosivesPct = weights.explosives;
  const explosivesAmt = billAmount * explosivesPct;
  const explosivesPvc = pvc?.explosivesPvc ?? 0;

  const totalPvc = pvc?.totalPvc ?? 0;

  // Filter out components with 0% weight and 0 PVC
  const allComponents = [
    { name: 'Labour', pct: labourPct, amt: labourAmt, base: labourBase, avg: labourAvg, variation: labourVariation, pvcAmt: labourPvc },
    { name: 'Plant & Machinery', pct: plantPct, amt: plantAmt, base: plantBase, avg: plantAvg, variation: plantVariation, pvcAmt: plantPvc },
    { name: 'Fuel / Power', pct: fuelPct, amt: fuelAmt, base: fuelBase, avg: fuelAvg, variation: fuelVariation, pvcAmt: fuelPvc },
    { name: 'Cement', pct: cementPct, amt: cementAmt, base: cementBase, avg: cementAvg, variation: cementVariation, pvcAmt: cementPvc },
    { name: 'Steel', pct: steelPct, amt: steelAmt, base: steelBase, avg: steelAvg, variation: steelVariation, pvcAmt: steelPvc },
    { name: 'Other Materials', pct: otherPct, amt: otherAmt, base: otherBase, avg: otherAvg, variation: otherVariation, pvcAmt: otherPvc },
    { name: 'Explosives', pct: explosivesPct, amt: explosivesAmt, base: explosivesBase, avg: explosivesAvg, variation: explosivesVariation, pvcAmt: explosivesPvc },
  ].filter(c => c.pct > 0 || Math.abs(c.pvcAmt) > 0.001);

  const tableHead = [['Sl.', 'Component', '% Age\n(Weighted)', 'Component\nAmt (₹)', 'Base Index\n(I₀)', `Quarter Avg\n(I₁) [${bill.quarter}]`, 'Variation\n(I₁−I₀)/I₀', 'PVC Amount\n(₹)']];
  const tableBody = allComponents.map((c, i) => [
    i + 1,
    c.name,
    (c.pct * 100).toFixed(2) + '%',
    fmt(c.amt),
    fmtIdx(c.base),
    fmtIdx(c.avg),
    fmtPct(c.variation),
    fmt(c.pvcAmt),
  ]);

  // Total row
  const totalPct = allComponents.reduce((s, c) => s + c.pct, 0);
  const totalAmt = allComponents.reduce((s, c) => s + c.amt, 0);
  tableBody.push(['', 'TOTAL PVC', (totalPct * 100).toFixed(2) + '%', fmt(totalAmt), '', '', '', fmt(totalPvc)]);

  autoTable(pdf, {
    startY: y,
    head: tableHead,
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 30, 30],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
      valign: 'middle',
      cellPadding: 2,
    },
    bodyStyles: { fontSize: 8, cellPadding: 2, textColor: [0, 0, 0] },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    styles: { lineColor: [0, 0, 0], lineWidth: 0.3, font: 'helvetica' },
    margin: { left: mL, right: mR },
    tableWidth: contentW,
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 32, halign: 'left' },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 18, halign: 'center' },
      5: { cellWidth: 22, halign: 'center' },
      6: { cellWidth: 22, halign: 'center' },
      7: { cellWidth: 32, halign: 'right' },
    },
    didParseCell: (data: any) => {
      if (data.row.index === tableBody.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [230, 230, 230];
      }
    },
  });

  y = pdf.lastAutoTable.finalY + 6;

  // ─── SUMMARY BLOCK ──────────────────────────────────────────────────────────
  ensureSpace(30);

  const summaryW = 100;
  const summaryX = pageW - mR - summaryW;

  const summaryRows = [
    ['Net PVC Amount for this Bill', fmt(totalPvc)],
    ['Previous Cumulative PVC', fmt(pvc?.previousPvcTotal ?? 0)],
    ['Current Cumulative PVC', fmt(pvc?.cumulativePvc ?? 0)],
  ];

  autoTable(pdf, {
    startY: y,
    body: summaryRows,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.5, lineColor: [0, 0, 0], lineWidth: 0.3 },
    bodyStyles: { textColor: [0, 0, 0] },
    margin: { left: summaryX, right: mR },
    tableWidth: summaryW,
    columnStyles: {
      0: { cellWidth: 65, fontStyle: 'bold' },
      1: { cellWidth: 35, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data: any) => {
      if (data.row.index === 2) {
        data.cell.styles.fillColor = [220, 235, 255];
      }
    },
  });

  y = pdf.lastAutoTable.finalY + 6;

  // ─── NOTES ──────────────────────────────────────────────────────────────────
  if (isProvisional && provisionalIndices.length > 0) {
    ensureSpace(12);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(180, 0, 0);
    const noteText = `Note: The following price indices used are provisional and subject to revision: ${provisionalIndices.join(', ')}.`;
    const noteLines = pdf.splitTextToSize(noteText, contentW);
    pdf.text(noteLines, mL, y);
    pdf.setTextColor(0, 0, 0);
    y += noteLines.length * 4 + 4;
  }

  // ─── CERTIFICATION BLOCK ────────────────────────────────────────────────────
  ensureSpace(40);
  pdf.setFontSize(8.5);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(0, 0, 0);

  const certNote = 'Certified that the above Price Variation Clause has been calculated as per the contract conditions and the indices published by the competent authority.';
  const certLines = pdf.splitTextToSize(certNote, contentW);
  pdf.text(certLines, mL, y);
  y += certLines.length * 4 + 8;

  ensureSpace(30);
  // 3-column signature block
  const sigW = contentW / 3;
  const sigLabels = ['Prepared by', 'Checked by', 'Approved by'];
  for (let i = 0; i < 3; i++) {
    const sx = mL + i * sigW;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.text(sigLabels[i], sx + sigW / 2, y, { align: 'center' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.text('(Name & Designation)', sx + sigW / 2, y + 14, { align: 'center' });
    pdf.text('Date: _______________', sx + sigW / 2, y + 19, { align: 'center' });
    // Signature line
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.3);
    pdf.line(sx + 5, y + 12, sx + sigW - 5, y + 12);
  }

  y += 25;

  // ─── PAGE 2: PRICE INDICES TABLE ────────────────────────────────────────────
  if (quarterlyAverages.length > 0) {
    pdf.addPage();
    y = mT;

    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text('PRICE INDICES USED FOR PVC COMPUTATION', pageW / 2, y, { align: 'center' });
    y += 5;
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Base Month: ${format(baseMonth, 'MMMM yyyy')}  |  Quarter: ${bill.quarter}  |  Zone: ${bill.zone || 'N/A'}`, pageW / 2, y, { align: 'center' });
    y += 6;
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.3);
    pdf.line(mL, y, pageW - mR, y);
    y += 5;

    // Index summary table
    const idxHead = [['Index Name', 'Base Month Value (I₀)', `Quarter Average (I₁)\n[${bill.quarter}]`, 'Variation (I₁−I₀)/I₀', 'Variation %']];
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
        fillColor: [30, 30, 30],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5,
        halign: 'center',
        cellPadding: 2.5,
      },
      bodyStyles: { fontSize: 8.5, cellPadding: 2.5, textColor: [0, 0, 0] },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      styles: { lineColor: [0, 0, 0], lineWidth: 0.3 },
      margin: { left: mL, right: mR },
      tableWidth: contentW,
      columnStyles: {
        0: { cellWidth: 60, halign: 'left' },
        1: { cellWidth: 35, halign: 'center' },
        2: { cellWidth: 40, halign: 'center' },
        3: { cellWidth: 25, halign: 'center' },
        4: { cellWidth: 20, halign: 'center' },
      },
    });

    y = pdf.lastAutoTable.finalY + 6;

    // Footer note on page 2
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(80, 80, 80);
    pdf.text('* Indices as published by Ministry of Statistics & PI (Labour), RBI (WPI), and MPNG (Fuel). Quarter average = arithmetic mean of 3 monthly values.', mL, y);
    pdf.setTextColor(0, 0, 0);
  }

  // ─── PAGE NUMBERS ───────────────────────────────────────────────────────────
  const totalPages = (pdf as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 100, 100);
    pdf.text(`Page ${p} of ${totalPages}`, pageW / 2, pageH - 8, { align: 'center' });
    pdf.text(`Generated: ${format(new Date(), 'dd-MM-yyyy HH:mm')}`, pageW - mR, pageH - 8, { align: 'right' });
    pdf.text(`PVC No.: ${bill.pvcNumber || 'N/A'}`, mL, pageH - 8, { align: 'left' });
    pdf.setTextColor(0, 0, 0);
  }

  return Buffer.from(pdf.output('arraybuffer'));
}
