import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import type { ChecklistItem } from '@/lib/accounts-checklist';

/**
 * A ONE-PAGE, plain-language PVC summary for the department (accounts / executive) user.
 *
 * The full "STATEMENT SHOWING PRICE VARIATION CLAUSE" is the record — dense index tables,
 * formulas, month-by-month working. An officer who only needs to understand and pass a
 * bill should not have to read it end to end. This page answers, in order: what is this,
 * how much, how was it worked out (in one breath), and what should I check before I pass
 * it. No index tables, no jargon, one A4 side.
 */

export interface SimpleSummaryInput {
  organizationName: string;
  workDescription: string;
  agreementNo: string;
  contractorName: string;
  billNo: string;
  pvcNumber?: string | null;
  dateOfMeasurement: Date;
  quarter: string;
  baseMonth: Date;
  billAmount: number;
  isProvisional: boolean;
  /** Component PVC figures, from the saved calculation. */
  components: {
    labour: number;
    plantMachinery: number;
    fuelPower: number;
    cement: number;
    steel: number;
    otherMaterials: number;
    explosives: number;
  };
  thisBillPvc: number;
  previousCumulativePvc: number;
  cumulativePvc: number;
  /** The accounts checklist, so "what to check" reads the same as the audit screen. */
  checklist: ChecklistItem[];
}

const inr = (v: number) =>
  `${(v ?? 0) < 0 ? '-' : ''}Rs ${Math.abs(Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function amountInWords(num: number): string {
  if (!num) return 'Zero Only';
  const neg = num < 0;
  let n = Math.floor(Math.abs(num));
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const three = (x: number): string => {
    let s = '';
    if (x >= 100) { s += a[Math.floor(x / 100)] + ' Hundred '; x %= 100; }
    if (x >= 20) { s += b[Math.floor(x / 10)] + ' '; x %= 10; }
    if (x > 0) s += a[x] + ' ';
    return s;
  };
  let words = '';
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thou = Math.floor(n / 1000); n %= 1000;
  if (crore) words += three(crore) + 'Crore ';
  if (lakh) words += three(lakh) + 'Lakh ';
  if (thou) words += three(thou) + 'Thousand ';
  if (n) words += three(n);
  return (neg ? 'Minus ' : '') + words.trim() + ' Only';
}

export function generateSimpleSummaryReport(input: SimpleSummaryInput): Uint8Array {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const W = pdf.internal.pageSize.getWidth();   // 210
  const mL = 14, mR = 14;
  const cW = W - mL - mR;
  let y = 14;

  const ink: [number, number, number] = [17, 24, 39];
  const grey: [number, number, number] = [90, 96, 110];
  const green: [number, number, number] = [5, 122, 85];
  const amber: [number, number, number] = [180, 83, 9];

  // ── Header ──────────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.setTextColor(...ink);
  pdf.text(input.organizationName || 'INDIAN RAILWAY', W / 2, y, { align: 'center' }); y += 6;
  pdf.setFontSize(11); pdf.setTextColor(...green);
  pdf.text('Price Variation (PVC) — Plain Summary', W / 2, y, { align: 'center' }); y += 5;
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...grey);
  pdf.text('A quick-read summary for checking. The full working is in the detailed PVC statement.', W / 2, y, { align: 'center' }); y += 5;
  pdf.setDrawColor(...green); pdf.setLineWidth(0.6); pdf.line(mL, y, W - mR, y); y += 6;

  // ── Key facts (compact 2-column) ───────────────────────────────────────
  const lv = (l: string, v: string, l2: string, v2: string) => [
    { content: l, styles: { fontStyle: 'bold' as const, textColor: ink } },
    { content: v },
    { content: l2, styles: { fontStyle: 'bold' as const, textColor: ink } },
    { content: v2 },
  ];
  autoTable(pdf, {
    startY: y,
    body: [
      [{ content: 'Work:', styles: { fontStyle: 'bold' as const, textColor: ink } }, { content: input.workDescription || '-', colSpan: 3 }],
      lv('Agreement No.:', input.agreementNo || '-', 'Contractor:', input.contractorName || '-'),
      lv('Bill No.:', input.billNo || '-', 'PVC No.:', input.pvcNumber || 'Not assigned'),
      lv('Measured on:', format(input.dateOfMeasurement, 'dd MMM yyyy'), 'Quarter:', input.quarter || '-'),
      lv('Base month:', format(input.baseMonth, 'MMM yyyy'), 'Indices:', input.isProvisional ? 'PROVISIONAL (may change)' : 'Final'),
      lv('Bill value (W):', inr(input.billAmount), 'GST:', 'Included in the value'),
    ],
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: { top: 1.2, bottom: 1.2, left: 2, right: 2 }, textColor: ink },
    columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: cW / 2 - 30 }, 2: { cellWidth: 28 }, 3: { cellWidth: cW / 2 - 28 } },
    margin: { left: mL, right: mR },
  });
  y = (pdf as any).lastAutoTable.finalY + 5;

  // ── The amount (headline box) ──────────────────────────────────────────
  const boxH = 22;
  pdf.setFillColor(236, 253, 245); pdf.setDrawColor(...green); pdf.setLineWidth(0.4);
  pdf.roundedRect(mL, y, cW, boxH, 2, 2, 'FD');
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(...grey);
  pdf.text('PVC PAYABLE ON THIS BILL', mL + 5, y + 6);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(18); pdf.setTextColor(...green);
  pdf.text(inr(input.thisBillPvc), mL + 5, y + 14);
  pdf.setFont('helvetica', 'italic'); pdf.setFontSize(7.5); pdf.setTextColor(...grey);
  pdf.text(`(${amountInWords(input.thisBillPvc)})`, mL + 5, y + 19);
  // Cumulative on the right
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.8); pdf.setTextColor(...ink);
  const rx = W - mR - 5;
  pdf.text(`Previous cumulative:  ${inr(input.previousCumulativePvc)}`, rx, y + 8, { align: 'right' });
  pdf.text(`This bill:  ${inr(input.thisBillPvc)}`, rx, y + 13, { align: 'right' });
  pdf.setFont('helvetica', 'bold');
  pdf.text(`New cumulative:  ${inr(input.cumulativePvc)}`, rx, y + 18, { align: 'right' });
  y += boxH + 6;

  // ── How it was worked out ──────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9.5); pdf.setTextColor(...ink);
  pdf.text('How this figure was worked out', mL, y); y += 4.5;
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.2); pdf.setTextColor(...grey);
  const explain = `Since the work was tendered (base month ${format(input.baseMonth, 'MMM yyyy')}), the published price indices have moved. PVC pays the contractor for that movement. The bill value is split into cost parts (labour, steel, cement, fuel and so on), and each part is adjusted by how much its index changed between the base month and this quarter (${input.quarter}). Steel and cement supply are priced on their own indices. The parts add up to the figure above.`;
  const lines = pdf.splitTextToSize(explain, cW);
  pdf.text(lines, mL, y); y += lines.length * 3.6 + 3;

  // Component table (only non-zero rows)
  const rowsAll: Array<[string, number]> = [
    ['Labour', input.components.labour],
    ['Plant & Machinery', input.components.plantMachinery],
    ['Fuel / Power', input.components.fuelPower],
    ['Cement', input.components.cement],
    ['Steel', input.components.steel],
    ['Other Materials', input.components.otherMaterials],
    ['Explosives', input.components.explosives],
  ];
  const rows = rowsAll.filter(([, v]) => Math.abs(v) > 0.5);
  autoTable(pdf, {
    startY: y,
    head: [['Cost part', 'PVC amount']],
    body: rows.map(([k, v]) => [k, inr(v)]),
    foot: [['Total PVC on this bill', inr(input.thisBillPvc)]],
    theme: 'grid',
    headStyles: { fillColor: [243, 244, 246], textColor: ink, fontStyle: 'bold', fontSize: 8.5 },
    footStyles: { fillColor: [236, 253, 245], textColor: green, fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 8.5, cellPadding: { top: 1.4, bottom: 1.4, left: 3, right: 3 }, textColor: ink },
    columnStyles: { 0: { cellWidth: cW * 0.62 }, 1: { cellWidth: cW * 0.38, halign: 'right' } },
    margin: { left: mL, right: mR },
  });
  y = (pdf as any).lastAutoTable.finalY + 6;

  // ── What to check ──────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9.5); pdf.setTextColor(...ink);
  pdf.text('What to check before passing', mL, y); y += 1.5;
  const checkBody = (input.checklist || []).map((c) => {
    const mark = c.tone === 'attention' ? 'CHECK' : c.tone === 'ok' ? 'OK' : 'i';
    return [mark, c.label, c.value];
  });
  autoTable(pdf, {
    startY: y + 2,
    head: [['', 'Item', 'What the app found']],
    body: checkBody,
    theme: 'grid',
    headStyles: { fillColor: [243, 244, 246], textColor: ink, fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 7.8, cellPadding: { top: 1.3, bottom: 1.3, left: 2.5, right: 2.5 }, textColor: ink, valign: 'middle' },
    columnStyles: { 0: { cellWidth: 18, halign: 'center', fontStyle: 'bold', fontSize: 7 }, 1: { cellWidth: cW * 0.34 }, 2: { cellWidth: cW * 0.66 - 18 } },
    margin: { left: mL, right: mR },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 0) {
        const t = input.checklist[data.row.index]?.tone;
        if (t === 'attention') data.cell.styles.textColor = amber;
        else if (t === 'ok') data.cell.styles.textColor = green;
        else data.cell.styles.textColor = grey;
      }
    },
  });
  y = (pdf as any).lastAutoTable.finalY + 5;

  // ── Footer note ────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'italic'); pdf.setFontSize(7); pdf.setTextColor(...grey);
  const foot = 'This is a plain summary to help you read the claim quickly. "CHECK" marks an item to look at closely — it is not a rejection. The binding figure and the full month-by-month working are in the detailed PVC statement.';
  const footLines = pdf.splitTextToSize(foot, cW);
  pdf.text(footLines, mL, y);

  return new Uint8Array(pdf.output('arraybuffer'));
}
