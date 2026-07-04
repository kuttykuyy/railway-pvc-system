/**
 * PVC Shortfall Recovery Statement.
 * A4 portrait: entitlement (GCC 46A) vs Railway-paid, the recoverable shortfall,
 * and a formal recovery-claim letter.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import type { ShortfallResult } from '@/lib/shortfall';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

export interface ShortfallReportOptions {
  organizationName?: string;
  contractorName: string;
  agreementNo: string;
  workDescription: string;
  billNo: string;
  pvcNumber?: string | null;
  quarter?: string | null;
  dateOfMeasurement?: string | Date | null;
  railwayReference?: string | null;
  remarks?: string | null;
  result: ShortfallResult;
}

const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rs = (n: number) => 'Rs. ' + fmt(n);

export function generateShortfallReport(opts: ShortfallReportOptions): Buffer {
  const { result } = opts;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  autoTable(pdf, {});
  const pageW = 210;
  const mL = 14;
  const mR = 14;
  const contentW = pageW - mL - mR;
  let y = 16;

  // ── Header ──
  pdf.setFontSize(15);
  pdf.setFont('helvetica', 'bold');
  pdf.text(opts.organizationName || 'INDIAN RAILWAYS', pageW / 2, y, { align: 'center' });
  y += 6;
  pdf.setFontSize(12);
  pdf.text('PVC SHORTFALL RECOVERY STATEMENT', pageW / 2, y, { align: 'center' });
  y += 4.5;
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(90, 90, 90);
  pdf.text('Price Variation payable under GCC Clause 17 / 46A vs amount paid by Railway', pageW / 2, y, { align: 'center' });
  pdf.setTextColor(0, 0, 0);
  y += 3;
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.4);
  pdf.line(mL, y, pageW - mR, y);
  y += 6;

  // ── Bill / contract details ──
  const lv = (l1: string, v1: string, l2: string, v2: string) => [
    { content: l1, styles: { fontStyle: 'bold' as const } }, v1,
    { content: l2, styles: { fontStyle: 'bold' as const } }, v2,
  ];
  autoTable(pdf, {
    startY: y,
    body: [
      lv('Contractor:', opts.contractorName || '-', 'Agreement No.:', opts.agreementNo || '-'),
      lv('Bill No.:', opts.billNo || '-', 'PVC No.:', opts.pvcNumber || 'Not Assigned'),
      lv('Quarter:', opts.quarter || '-', 'Measurement Date:',
        opts.dateOfMeasurement ? format(new Date(opts.dateOfMeasurement), 'dd MMM yyyy') : '-'),
      lv('Railway PVC Ref.:', opts.railwayReference || '-', 'Statement Date:', format(new Date(), 'dd MMM yyyy')),
    ],
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: { top: 1.4, right: 3, bottom: 1.4, left: 1 } },
    margin: { left: mL, right: mR },
    tableWidth: contentW,
    columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 58 }, 2: { cellWidth: 32 }, 3: { cellWidth: 52 } },
  });
  y = pdf.lastAutoTable.finalY + 3;

  const now = pdf.splitTextToSize(`Name of Work: ${opts.workDescription || '-'}`, contentW);
  pdf.setFontSize(8.5);
  pdf.setFont('helvetica', 'normal');
  pdf.text(now, mL, y);
  y += now.length * 3.8 + 3;

  // ── Comparison table ──
  const showComponents = result.hasComponentBreakdown;
  const head = showComponents
    ? [['Component', 'Entitlement (GCC) Rs.', 'Paid by Railway Rs.', 'Shortfall Rs.']]
    : [['Particulars', 'Amount (Rs.)']];

  const body: any[] = [];
  if (showComponents) {
    for (const row of result.rows) {
      body.push([
        row.label,
        { content: fmt(row.entitlement), styles: { halign: 'right' as const } },
        { content: row.railwayPaid != null ? fmt(row.railwayPaid) : '-', styles: { halign: 'right' as const } },
        {
          content: row.shortfall != null ? fmt(row.shortfall) : '-',
          styles: { halign: 'right' as const, textColor: (row.shortfall ?? 0) > 0 ? [176, 0, 0] as [number, number, number] : [0, 0, 0] as [number, number, number] },
        },
      ]);
    }
    body.push([
      { content: 'TOTAL', styles: { fontStyle: 'bold' as const, fillColor: [230, 230, 230] as [number, number, number] } },
      { content: fmt(result.entitlementTotal), styles: { fontStyle: 'bold' as const, halign: 'right' as const, fillColor: [230, 230, 230] as [number, number, number] } },
      { content: fmt(result.railwayTotal), styles: { fontStyle: 'bold' as const, halign: 'right' as const, fillColor: [230, 230, 230] as [number, number, number] } },
      { content: fmt(result.shortfallTotal), styles: { fontStyle: 'bold' as const, halign: 'right' as const, fillColor: [230, 230, 230] as [number, number, number] } },
    ]);
  } else {
    body.push(
      [{ content: 'PVC entitlement as per GCC Clause 17 / 46A (this statement)', styles: {} }, { content: fmt(result.entitlementTotal), styles: { halign: 'right' as const } }],
      [{ content: 'Less: PVC paid / certified by Railway', styles: {} }, { content: fmt(result.railwayTotal), styles: { halign: 'right' as const } }],
      [
        { content: 'Shortfall recoverable from Railway', styles: { fontStyle: 'bold' as const, fillColor: [230, 230, 230] as [number, number, number] } },
        { content: fmt(result.shortfallTotal), styles: { fontStyle: 'bold' as const, halign: 'right' as const, fillColor: [230, 230, 230] as [number, number, number] } },
      ],
    );
  }

  autoTable(pdf, {
    startY: y,
    head,
    body,
    theme: 'grid',
    headStyles: { fillColor: [20, 20, 20], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5, halign: 'center', valign: 'middle', cellPadding: 2.5 },
    bodyStyles: { fontSize: 9, cellPadding: { top: 2.2, right: 3, bottom: 2.2, left: 3 }, textColor: [0, 0, 0] },
    styles: { lineColor: [170, 170, 170], lineWidth: 0.3 },
    margin: { left: mL, right: mR },
    tableWidth: contentW,
    columnStyles: showComponents
      ? { 0: { cellWidth: 46 }, 1: { cellWidth: 44, halign: 'right' }, 2: { cellWidth: 44, halign: 'right' }, 3: { cellWidth: 38, halign: 'right' } }
      : { 0: { cellWidth: contentW - 50 }, 1: { cellWidth: 44, halign: 'right' } },
  });
  y = pdf.lastAutoTable.finalY + 6;

  // ── Headline recoverable / over-settled box ──
  const isRecoverable = result.direction === 'recoverable';
  const isOverSettled = result.direction === 'over_settled';
  const boxColor: [number, number, number] = isRecoverable ? [176, 0, 0] : isOverSettled ? [200, 140, 0] : [0, 120, 70];
  const headline = isRecoverable
    ? `AMOUNT RECOVERABLE FROM RAILWAY:  ${rs(result.recoverable)}`
    : isOverSettled
      ? `RAILWAY SETTLED ${rs(result.overpaid)} MORE THAN DUE - AT RISK OF RECOVERY`
      : 'Railway settlement matches the computed PVC entitlement. No shortfall.';
  pdf.setFillColor(boxColor[0], boxColor[1], boxColor[2]);
  pdf.roundedRect(mL, y, contentW, 12, 2, 2, 'F');
  pdf.setFontSize(11.5);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(255, 255, 255);
  pdf.text(headline, pageW / 2, y + 7.6, { align: 'center' });
  pdf.setTextColor(0, 0, 0);
  y += 12 + 3;
  if (isRecoverable && result.entitlementTotal !== 0) {
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(90, 90, 90);
    pdf.text(`The shortfall is ${result.shortfallPct.toFixed(2)}% of the PVC entitlement for this bill.`, mL, y);
    pdf.setTextColor(0, 0, 0);
    y += 5;
  }

  // ── Recovery-claim letter ──
  if (isRecoverable) {
    y += 3;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.text('DRAFT RECOVERY CLAIM', mL, y);
    y += 5;
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    const letter =
      `To,\nThe Concerned Engineering / Accounts Authority,\n${opts.organizationName || 'Indian Railways'}.\n\n`
      + `Sub: Recovery of short-paid Price Variation Clause (PVC) amount for Bill No. ${opts.billNo}`
      + `${opts.pvcNumber ? ` (PVC No. ${opts.pvcNumber})` : ''} under Agreement No. ${opts.agreementNo}.\n\n`
      + `Sir/Madam,\n\n`
      + `The Price Variation payable on the above bill, computed as per GCC Clause 17 / 46A on the published `
      + `Labour, Fuel, Cement, Steel and WPI indices for the quarter${opts.quarter ? ` ${opts.quarter}` : ''}, works out to `
      + `${rs(result.entitlementTotal)}. Against this, an amount of ${rs(result.railwayTotal)} has been paid/certified by the Railway, `
      + `leaving a shortfall of ${rs(result.recoverable)}.\n\n`
      + `It is therefore requested that the short-paid PVC amount of ${rs(result.recoverable)} be verified and released. `
      + `The component-wise computation and the index basis are enclosed in the accompanying PVC statement for ready verification.\n\n`
      + `Thanking you,\nYours faithfully,\n${opts.contractorName || ''}`;
    const lines = pdf.splitTextToSize(letter, contentW);
    pdf.text(lines, mL, y);
    y += lines.length * 4.2;
  }

  if (opts.remarks) {
    y += 4;
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(90, 90, 90);
    const rem = pdf.splitTextToSize(`Remarks: ${opts.remarks}`, contentW);
    pdf.text(rem, mL, y);
    pdf.setTextColor(0, 0, 0);
  }

  // Footer note on every page
  const pages = pdf.internal.pages.length - 1;
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(120, 120, 120);
    pdf.text('Computer-generated shortfall statement. Figures are the contractor’s computed entitlement and are subject to Railway verification.',
      pageW / 2, 292, { align: 'center' });
    pdf.setTextColor(0, 0, 0);
  }

  return Buffer.from(pdf.output('arraybuffer'));
}
