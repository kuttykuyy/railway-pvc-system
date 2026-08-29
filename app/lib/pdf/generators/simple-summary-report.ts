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
  /** The classifications actually used on this bill, with their fixed component %s. */
  classesUsed?: Array<{
    code: string; name: string;
    labour: number; steel: number; cement: number; fuel: number;
    plantMachinery: number; otherMaterials: number; explosives: number; fixed: number;
  }>;
  /** One component worked end-to-end, so the officer can follow the mechanism once. */
  workedExample?: {
    component: string;      // e.g. "Labour"
    baseMonthLabel: string; // e.g. "Apr 2025"
    baseIndex: number;
    quarter: string;
    currentIndex: number;
  };
}

const inr = (v: number) =>
  `${(v ?? 0) < 0 ? '-' : ''}Rs ${Math.abs(Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// The PDF font (standard helvetica) cannot render the Rupee sign or the Unicode minus,
// and an un-renderable glyph makes jsPDF space the whole run out and overflow the cell.
// Checklist text comes from the on-screen audit list (which uses ₹), so sanitise it here.
function pdfSafe(s: unknown): string {
  return String(s ?? '')
    .replace(/₹/g, 'Rs ')   // ₹
    .replace(/−/g, '-')      // − (Unicode minus)
    .replace(/–|—/g, '-') // – — (en/em dash)
    .replace(/[^\x00-\xff]/g, ''); // drop anything else the WinAnsi font lacks
}

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
  pdf.text(pdfSafe(input.organizationName) || 'INDIAN RAILWAY', W / 2, y, { align: 'center' }); y += 6;
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
      [{ content: 'Work:', styles: { fontStyle: 'bold' as const, textColor: ink } }, { content: pdfSafe(input.workDescription) || '-', colSpan: 3 }],
      lv('Agreement No.:', pdfSafe(input.agreementNo) || '-', 'Contractor:', pdfSafe(input.contractorName) || '-'),
      lv('Bill No.:', pdfSafe(input.billNo) || '-', 'PVC No.:', pdfSafe(input.pvcNumber) || 'Not assigned'),
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
    return [mark, pdfSafe(c.label), pdfSafe(c.value)];
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
  pdf.setFontSize(7); pdf.setTextColor(...grey); pdf.setFont('helvetica', 'normal');
  pdf.text('See page 2 for how the classification and the calculation work.', W / 2, 292, { align: 'center' });

  // ═══════════════════ PAGE 2 — HOW IT WORKS ═══════════════════════════════
  pdf.addPage();
  let y2 = 16;
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.setTextColor(...ink);
  pdf.text('How the classification and calculation work', W / 2, y2, { align: 'center' }); y2 += 5;
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...grey);
  pdf.text('Plain explanation of the method behind the figure on page 1.', W / 2, y2, { align: 'center' }); y2 += 4;
  pdf.setDrawColor(...green); pdf.setLineWidth(0.5); pdf.line(mL, y2, W - mR, y2); y2 += 7;

  // ── 1. Classification ──────────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(...ink);
  pdf.text('1.  How each item of work is classified', mL, y2); y2 += 5;
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.4); pdf.setTextColor(...grey);
  const clsText = 'Every item of work is put into a category by its nature — earthwork, concrete, steel supply, and so on (from its DSR / schedule item). Each category has FIXED percentage shares saying how much of that work is labour, steel, cement, fuel, machinery and other materials. These shares come from the GCC Clause 46A table set by the tender — they are not chosen bill by bill. PVC is worked out on those shares. The categories used on this bill are below.';
  const clsLines = pdf.splitTextToSize(clsText, cW);
  pdf.text(clsLines, mL, y2); y2 += clsLines.length * 3.7 + 3;

  const classes = input.classesUsed || [];
  if (classes.length > 0) {
    autoTable(pdf, {
      startY: y2,
      head: [['Category', 'Name', 'Labour', 'Steel', 'Cement', 'Fuel', 'P&M', 'Other', 'Fixed']],
      body: classes.map((c) => [
        pdfSafe(c.code), pdfSafe(c.name),
        `${c.labour}%`, `${c.steel}%`, `${c.cement}%`, `${c.fuel}%`,
        `${c.plantMachinery}%`, `${c.otherMaterials}%`, `${c.fixed}%`,
      ]),
      theme: 'grid',
      headStyles: { fillColor: [243, 244, 246], textColor: ink, fontStyle: 'bold', fontSize: 7.5 },
      styles: { fontSize: 7.5, cellPadding: { top: 1.2, bottom: 1.2, left: 2, right: 2 }, textColor: ink },
      columnStyles: {
        0: { cellWidth: 16, fontStyle: 'bold' }, 1: { cellWidth: cW - 16 - 6 * 16.7 },
        2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' },
        5: { halign: 'center' }, 6: { halign: 'center' }, 7: { halign: 'center' }, 8: { halign: 'center' },
      },
      margin: { left: mL, right: mR },
    });
    y2 = (pdf as any).lastAutoTable.finalY + 2;
    pdf.setFont('helvetica', 'italic'); pdf.setFontSize(7); pdf.setTextColor(...grey);
    pdf.text('"Fixed" is the non-escalable part (overhead & profit) that PVC never pays on.', mL, y2 + 3);
    y2 += 8;
  }

  // ── 2. The calculation ─────────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(...ink);
  pdf.text('2.  How the PVC amount is calculated', mL, y2); y2 += 5;
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.4); pdf.setTextColor(...grey);
  const calcText = 'For each cost part, the bill value is multiplied by that part\'s share and by how much its published price index has moved since the base month. The index movement is (this quarter\'s index minus the base-month index) divided by the base-month index. In short:';
  const calcLines = pdf.splitTextToSize(calcText, cW);
  pdf.text(calcLines, mL, y2); y2 += calcLines.length * 3.7 + 3;

  // Formula box
  pdf.setFillColor(243, 244, 246); pdf.roundedRect(mL, y2, cW, 10, 1.5, 1.5, 'F');
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(...ink);
  pdf.text('PVC for a part  =  Bill value  x  part\'s %  x  (index now - index at base)  /  index at base', W / 2, y2 + 6.3, { align: 'center' });
  y2 += 14;

  // Worked example
  const ex = input.workedExample;
  if (ex && ex.baseIndex > 0) {
    const movePct = ((ex.currentIndex - ex.baseIndex) / ex.baseIndex) * 100;
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.6); pdf.setTextColor(...green);
    pdf.text(`Worked example — the ${ex.component} part`, mL, y2); y2 += 4.5;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.4); pdf.setTextColor(...grey);
    const exText = `The ${ex.component.toLowerCase()} price index was ${ex.baseIndex.toFixed(1)} in the base month (${ex.baseMonthLabel}) and averaged ${ex.currentIndex.toFixed(1)} in this quarter (${ex.quarter}) — a change of ${movePct >= 0 ? '+' : ''}${movePct.toFixed(1)}%. So every rupee of ${ex.component.toLowerCase()} value in the bill is paid ${movePct >= 0 ? '+' : ''}${movePct.toFixed(1)}% more (or less). The same is done for steel, cement, fuel and each other part, each on its OWN index; the parts are then added up to give the total on page 1.`;
    const exLines = pdf.splitTextToSize(exText, cW);
    pdf.text(exLines, mL, y2); y2 += exLines.length * 3.7 + 4;
  }

  // Steel / cement note
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...ink);
  const stText = 'Steel and cement supply items are handled on their own price index (steel by its type — TMT, structural, plates or other — and cement on the cement index), not lumped with the general work. A rising index pays more; a falling index reduces the claim (which is why a part can be a minus figure).';
  const stLines = pdf.splitTextToSize(stText, cW);
  pdf.text(stLines, mL, y2); y2 += stLines.length * 3.7 + 4;

  pdf.setFont('helvetica', 'italic'); pdf.setFontSize(7.2); pdf.setTextColor(...grey);
  pdf.text('The month-by-month index values behind every part are listed in the detailed PVC statement.', mL, y2);

  return new Uint8Array(pdf.output('arraybuffer'));
}
