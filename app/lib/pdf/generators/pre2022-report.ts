/**
 * The printed price variation statement for a contract under the PRE-2022 GCC.
 *
 * Its own generator, not a mode of the IR-standard report. That report's whole shape is
 * GCC-2022 — nine groups, dedicated cement and steel at 85%, PPAC fuel, JPC steel — and
 * a shared template would carry every one of those headings as a place for the wrong
 * figure to hide. This statement has the old clause's own shape: one work type for the
 * whole contract, cement and steel taken out of the varying amount and paid in full,
 * and the WPI series the clause names.
 *
 * All figures come from pricePre2022Bill — nothing is computed here. A report generator
 * that does its own arithmetic drifts from the screen it is supposed to print.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Pre2022BillPricing } from '@/lib/pre2022-bill-pvc';

function pdfSafe(value: unknown): string {
  return String(value ?? '')
    .replace(/₹/g, 'Rs.')
    .replace(/[×✕✖]/g, 'x')
    .replace(/[‒-―−]/g, '-')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/•/g, '-')
    .replace(/[^\x00-\xFF]/g, '');
}

const rupees = (value: number) =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const monthName = (date: Date | string) => {
  const d = new Date(date);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

export interface Pre2022ReportOptions {
  pricing: Pre2022BillPricing;
  billNo: string;
  agreementNo: string;
  contractorName: string;
  workDescription: string;
  dateOfOpening: Date | string;
  dateOfMeasurement: Date | string;
}

export function generatePre2022Report(opts: Pre2022ReportOptions): Buffer {
  const { pricing } = opts;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const mL = 14;
  const contentW = pageW - mL * 2;
  let y = 16;

  // ---- Heading: which clause, said before any figure -------------------------------
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text('PRICE VARIATION STATEMENT', pageW / 2, y, { align: 'center' });
  y += 6;
  pdf.setFontSize(9.5);
  pdf.setTextColor(120, 60, 0);
  pdf.text('Under the Price Variation Clause of the pre-2022 General Conditions of Contract', pageW / 2, y, { align: 'center' });
  pdf.setTextColor(0, 0, 0);
  y += 8;

  // ---- Contract and bill -----------------------------------------------------------
  autoTable(pdf, {
    startY: y,
    margin: { left: mL, right: mL },
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 1.8 },
    body: [
      [{ content: 'Agreement No.', styles: { fontStyle: 'bold' as const } }, pdfSafe(opts.agreementNo),
       { content: 'Bill No.', styles: { fontStyle: 'bold' as const } }, pdfSafe(opts.billNo)],
      [{ content: 'Contractor', styles: { fontStyle: 'bold' as const } }, pdfSafe(opts.contractorName),
       { content: 'Date of Measurement', styles: { fontStyle: 'bold' as const } },
       new Date(opts.dateOfMeasurement).toLocaleDateString('en-IN', { timeZone: 'UTC' })],
      [{ content: 'Work', styles: { fontStyle: 'bold' as const } },
       { content: pdfSafe(opts.workDescription), colSpan: 3 }],
      [{ content: 'Tender Opening Date', styles: { fontStyle: 'bold' as const } },
       new Date(opts.dateOfOpening).toLocaleDateString('en-IN', { timeZone: 'UTC' }),
       { content: 'Work Type (Cl.46A.6)', styles: { fontStyle: 'bold' as const } },
       pdfSafe(pricing.workTypeLabel)],
      [{ content: 'Base Month', styles: { fontStyle: 'bold' as const } }, monthName(pricing.baseMonth),
       { content: 'Quarter', styles: { fontStyle: 'bold' as const } },
       `${pricing.quarter} (${pricing.quarterMonths.map(m => monthName(m)).join(', ')})`],
    ],
    columnStyles: { 0: { cellWidth: 34 }, 2: { cellWidth: 36 } },
  });
  y = (pdf as any).lastAutoTable.finalY + 5;

  // A work type the app proposed rather than a person confirmed must say so on the
  // page — it is the single choice the whole statement turns on.
  if (pricing.workTypeProposed) {
    pdf.setFillColor(255, 244, 214);
    pdf.setDrawColor(200, 150, 30);
    const note = pdf.splitTextToSize(pdfSafe(
      'The work type above was proposed from the work description and has not been confirmed '
      + 'against the tender. Confirm it before this statement is submitted — the percentages '
      + 'differ a great deal between work types.'), contentW - 6);
    const boxH = 4 + note.length * 3.4;
    pdf.rect(mL, y, contentW, boxH, 'FD');
    pdf.setFontSize(7.5);
    pdf.setTextColor(120, 70, 0);
    pdf.text(note, mL + 3, y + 4);
    pdf.setTextColor(0, 0, 0);
    y += boxH + 5;
  }

  // ---- What the percentages work on ------------------------------------------------
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text('A. Amount on which price variation operates', mL, y);
  y += 2;
  const varyingBody: any[] = [
    ['Gross value of work done in this bill', rupees(pricing.result.grossValueOfWork)],
  ];
  if (pricing.result.cementValue > 0) {
    varyingBody.push(['Less: value of cement supplied (paid separately at C below)', `(-) ${rupees(pricing.result.cementValue)}`]);
  }
  if (pricing.result.steelValue > 0) {
    varyingBody.push(['Less: value of steel supplied (paid separately at C below)', `(-) ${rupees(pricing.result.steelValue)}`]);
  }
  varyingBody.push([
    { content: 'Varying amount (W)', styles: { fontStyle: 'bold' as const } },
    { content: rupees(pricing.result.varyingAmount), styles: { fontStyle: 'bold' as const } },
  ]);
  autoTable(pdf, {
    startY: y + 2,
    margin: { left: mL, right: mL },
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 1.8 },
    body: varyingBody,
    columnStyles: { 1: { halign: 'right' as const, cellWidth: 42 } },
  });
  y = (pdf as any).lastAutoTable.finalY + 6;

  // ---- The components --------------------------------------------------------------
  // Percentage components on W first, then cement and steel on value supplied, then the
  // fixed portion — the order the clause itself takes them in.
  const pctRows = pricing.result.components.filter(c => c.percentage !== 100 && !c.name.startsWith('Fixed'));
  const supplyRows = pricing.result.components.filter(c => c.percentage === 100);
  const fixedRow = pricing.result.components.find(c => c.name.startsWith('Fixed'));

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text('B. Variation on the components of W', mL, y);
  autoTable(pdf, {
    startY: y + 2,
    margin: { left: mL, right: mL },
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: { fillColor: [230, 230, 230], textColor: 20, fontStyle: 'bold' as const },
    head: [['Component', '%', 'Base Index', 'Quarter Avg.', 'Formula', 'Amount (Rs.)']],
    body: [
      ...pctRows.map(c => [
        pdfSafe(c.name),
        String(c.percentage),
        c.baseIndex.toFixed(2),
        c.quarterIndex.toFixed(2),
        pdfSafe(`W x (${c.quarterIndex.toFixed(2)} - ${c.baseIndex.toFixed(2)}) x ${c.percentage}% / ${c.baseIndex.toFixed(2)}`),
        rupees(c.amount),
      ]),
      ...(fixedRow ? [[
        pdfSafe(fixedRow.name), String(fixedRow.percentage), '-', '-',
        'No variation admissible on the fixed component', rupees(0),
      ]] : []),
    ],
    columnStyles: { 1: { halign: 'center' as const, cellWidth: 9 }, 2: { halign: 'right' as const, cellWidth: 20 }, 3: { halign: 'right' as const, cellWidth: 21 }, 5: { halign: 'right' as const, cellWidth: 26 } },
  });
  y = (pdf as any).lastAutoTable.finalY + 6;

  if (supplyRows.length > 0) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('C. Cement and steel, on the value actually supplied (no 85% factor)', mL, y);
    autoTable(pdf, {
      startY: y + 2,
      margin: { left: mL, right: mL },
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.6 },
      headStyles: { fillColor: [230, 230, 230], textColor: 20, fontStyle: 'bold' as const },
      head: [['Supply', 'Value Supplied (Rs.)', 'Base Index', 'Quarter Avg.', 'Amount (Rs.)']],
      body: supplyRows.map(c => [
        pdfSafe(c.name.replace(/^Cement supplied$/, 'Cement').replace(/^Steel supplied - /, 'Steel: ')),
        rupees(c.appliedTo),
        c.baseIndex.toFixed(2),
        c.quarterIndex.toFixed(2),
        rupees(c.amount),
      ]),
      columnStyles: { 1: { halign: 'right' as const, cellWidth: 34 }, 2: { halign: 'right' as const, cellWidth: 20 }, 3: { halign: 'right' as const, cellWidth: 21 }, 4: { halign: 'right' as const, cellWidth: 26 } },
    });
    y = (pdf as any).lastAutoTable.finalY + 6;
  }

  // ---- Total -----------------------------------------------------------------------
  autoTable(pdf, {
    startY: y,
    margin: { left: mL, right: mL },
    theme: 'grid',
    styles: { fontSize: 9.5, cellPadding: 2.2, fontStyle: 'bold' as const },
    body: [[
      pricing.result.totalPvc >= 0
        ? 'TOTAL PRICE VARIATION PAYABLE TO THE CONTRACTOR'
        : 'TOTAL PRICE VARIATION RECOVERABLE FROM THE CONTRACTOR',
      `Rs. ${rupees(Math.abs(pricing.result.totalPvc))}`,
    ]],
    columnStyles: { 1: { halign: 'right' as const, cellWidth: 42 } },
  });
  y = (pdf as any).lastAutoTable.finalY + 6;

  // ---- The index values used, month by month ---------------------------------------
  // The averages above are useless to a checker without the months behind them. This
  // table lets every figure be traced to its published sheet; the sheets themselves are
  // appended after the statement when the office has uploaded them.
  if (pricing.indexValues?.length) {
    if (y + 40 > 280) { pdf.addPage(); y = 16; }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('D. Index values adopted', mL, y);
    const monthCols = pricing.quarterMonths.map(m =>
      new Date(m).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' }));
    autoTable(pdf, {
      startY: y + 2,
      margin: { left: mL, right: mL },
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.6 },
      headStyles: { fillColor: [230, 230, 230], textColor: 20, fontStyle: 'bold' as const },
      head: [['Index series', `Base (${monthName(pricing.baseMonth).replace(' ', ' ')})`, ...monthCols, 'Quarter Avg.']],
      body: pricing.indexValues.map(row => {
        // The months in printed order, whatever order they were fetched in.
        const byMonth = new Map(row.monthlyValues.map(mv => [mv.month, mv.value]));
        const monthVals = pricing.quarterMonths.map(m => {
          const key = new Date(m).toISOString().slice(0, 7);
          const v = byMonth.get(key);
          return v === undefined ? '-' : v.toFixed(2);
        });
        return [pdfSafe(row.indexName), row.baseValue.toFixed(2), ...monthVals, row.average.toFixed(2)];
      }),
      columnStyles: Object.fromEntries(
        Array.from({ length: 2 + monthCols.length + 1 }, (_, i) => i)
          .filter(i => i > 0)
          .map(i => [i, { halign: 'right' as const, cellWidth: 24 }]),
      ),
    });
    y = (pdf as any).lastAutoTable.finalY + 6;
  }

  // ---- How this statement was worked -----------------------------------------------
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('Basis of this statement', mL, y);
  y += 4;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  const basis = [
    `1. Base month is ${monthName(pricing.baseMonth)}, the month falling 28 days before the tender opening date.`,
    `2. Quarters commence from the month after the tender opening month. This bill falls in ${pricing.quarter}, and the quarterly index is the average of ${pricing.quarterMonths.map(m => monthName(m)).join(', ')}.`,
    '3. Labour: CPI-IW (Labour Bureau). Other materials: WPI All Commodities. Plant & machinery: WPI machinery for mining, quarrying and construction. Fuel: WPI Fuel & Power group. Cement: WPI Cement, Lime & Plaster. Steel: WPI mild steel categories per Clause 46A.9, with "other sections" taken as the average of the three named categories. All WPI on base 2011-12 = 100.',
    '4. The value of cement and steel supplied is excluded from W and price variation on it is paid on the full value supplied, at the full index movement.',
    '5. No price variation is admissible on the fixed component.',
    ...pricing.notes.filter(n => !n.startsWith('Priced under')).map((n, i) => `${6 + i}. ${n}`),
  ];
  for (const line of basis) {
    const wrapped = pdf.splitTextToSize(pdfSafe(line), contentW);
    if (y + wrapped.length * 3.2 > 280) { pdf.addPage(); y = 16; }
    pdf.text(wrapped, mL, y);
    y += wrapped.length * 3.2 + 1.2;
  }

  // ---- Signature block -------------------------------------------------------------
  if (y + 26 > 285) { pdf.addPage(); y = 16; }
  y += 12;
  pdf.setFontSize(8.5);
  const third = contentW / 3;
  ['Prepared by', 'Checked by', 'Accepted by'].forEach((label, i) => {
    const cx = mL + third * i + third / 2;
    pdf.line(cx - 24, y, cx + 24, y);
    pdf.text(label, cx, y + 4.5, { align: 'center' });
  });

  return Buffer.from(pdf.output('arraybuffer'));
}
