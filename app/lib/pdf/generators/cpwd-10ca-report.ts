import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

/**
 * The CPWD Clause 10CA price-variation statement — Engine B's printable output, the
 * document a contractor hands over. It states the star-rate computation plainly:
 * for each material, the quantity used times how far its price moved since the tender.
 *
 * Deliberately its own generator, not the Railway IR-standard report (which is entirely
 * index-ratio shaped). v1 states cement and steel; diesel is disclosed as not included.
 */

export interface Cpwd10caReportLine {
  label: string;
  unit: string;
  quantity: number;
  basePrice: number;
  currentPrice: number;
  priceDelta: number;
  variation: number;
}

export interface Cpwd10ccReportLine {
  label: string;
  percent: number;
  baseIndex: number;
  currentIndex: number;
  variation: number;
}

export interface Cpwd10caReportOptions {
  contractorName?: string | null;
  agreementNo?: string | null;
  workDescription?: string | null;
  billNo?: string | null;
  dateOfMeasurement?: string | Date | null;
  region?: string | null;
  baseMonth: string;   // "YYYY-MM" (tender-receipt month)
  billMonth: string;   // "YYYY-MM"
  breakdown: Cpwd10caReportLine[];
  totalVariation: number;
  flags: Array<{ code: string; reason: string }>;
  excluded: string[];
  /** 10CC (labour/materials/POL); empty when the contract has no Schedule-E config. */
  cpwd10ccBreakdown?: Cpwd10ccReportLine[];
  cpwd10ccTotal?: number;
  /** 10CA + 10CC — the CPWD price variation for the bill. */
  combinedTotal?: number;
}

const rupee = (n: number) => `Rs ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 3 });
const monthLabel = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return Number.isFinite(y) && Number.isFinite(mo) ? format(new Date(y, mo - 1, 1), 'MMM yyyy') : m;
};

export function generateCpwd10caReport(opts: Cpwd10caReportOptions): Buffer {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210, mL = 14, mR = 14;
  const contentW = pageW - mL - mR;
  let y = 16;

  // ── Header ──
  pdf.setFontSize(15);
  pdf.setFont('helvetica', 'bold');
  pdf.text(opts.contractorName || 'PRICE VARIATION STATEMENT', pageW / 2, y, { align: 'center' });
  y += 6;
  pdf.setFontSize(12);
  pdf.text('PRICE VARIATION STATEMENT — CPWD CLAUSE 10CA', pageW / 2, y, { align: 'center' });
  y += 4.5;
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(90, 90, 90);
  pdf.text('Variation on major materials = quantity used x (current price - base price)', pageW / 2, y, { align: 'center' });
  pdf.setTextColor(0, 0, 0);
  y += 3;
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.4);
  pdf.line(mL, y, pageW - mR, y);
  y += 6;

  // ── Details ──
  const lv = (l1: string, v1: string, l2: string, v2: string) => [
    { content: l1, styles: { fontStyle: 'bold' as const } }, v1,
    { content: l2, styles: { fontStyle: 'bold' as const } }, v2,
  ];
  autoTable(pdf, {
    startY: y,
    body: [
      lv('Contractor:', opts.contractorName || '-', 'Agreement No.:', opts.agreementNo || '-'),
      lv('Bill No.:', opts.billNo || '-', 'Measurement date:', opts.dateOfMeasurement ? format(new Date(opts.dateOfMeasurement), 'dd MMM yyyy') : '-'),
      lv('CPWD region:', opts.region || '-', 'Clause:', '10CA (major materials)'),
      lv('Base month (tender):', monthLabel(opts.baseMonth), 'Bill month:', monthLabel(opts.billMonth)),
    ],
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1 },
    columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 62 }, 2: { cellWidth: 34 }, 3: { cellWidth: contentW - 130 } },
    margin: { left: mL, right: mR },
  });
  y = pdf.lastAutoTable.finalY + 3;

  if (opts.workDescription) {
    pdf.setFontSize(9); pdf.setFont('helvetica', 'bold');
    pdf.text('Name of work:', mL, y);
    pdf.setFont('helvetica', 'normal');
    const wrapped = pdf.splitTextToSize(opts.workDescription, contentW - 28);
    pdf.text(wrapped, mL + 26, y);
    y += Math.max(5, wrapped.length * 4) + 2;
  }

  // ── Formula ──
  pdf.setFillColor(245, 245, 245);
  pdf.rect(mL, y, contentW, 8, 'F');
  pdf.setFontSize(8.5); pdf.setFont('helvetica', 'bold');
  pdf.text('Formula (CPWD Cl.10CA):  V = Sum over materials of  Q x (P_now - P_base)', mL + 2, y + 3.4);
  pdf.setFont('helvetica', 'normal'); pdf.setTextColor(90, 90, 90);
  pdf.text('Q = quantity used since last bill;  P_base = CPWD price at tender-receipt month;  P_now = CPWD price for the bill month.', mL + 2, y + 6.6);
  pdf.setTextColor(0, 0, 0);
  y += 12;

  // ── Materials table ──
  autoTable(pdf, {
    startY: y,
    head: [['Material', 'Quantity', 'Base price', 'Current price', 'Change / unit', 'Variation']],
    body: [
      ...opts.breakdown.map(l => [
        l.label,
        `${qty(l.quantity)} ${l.unit}`,
        rupee(l.basePrice),
        rupee(l.currentPrice),
        rupee(l.priceDelta),
        rupee(l.variation),
      ]),
      ...(opts.breakdown.length === 0 ? [[{ content: 'No priced materials — check that CPWD prices are loaded for this region and month.', colSpan: 6, styles: { halign: 'center' as const, textColor: [150, 60, 60] as [number, number, number] } }]] : []),
    ],
    foot: [[
      { content: 'Total 10CA price variation', colSpan: 5, styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
      { content: rupee(opts.totalVariation), styles: { fontStyle: 'bold' as const } },
    ]],
    theme: 'grid',
    headStyles: { fillColor: [20, 20, 20], textColor: [255, 255, 255], fontSize: 8.5, halign: 'center' },
    footStyles: { fillColor: [235, 235, 235], textColor: [0, 0, 0] },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: {
      0: { cellWidth: 46 },
      1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' },
    },
    margin: { left: mL, right: mR },
  });
  y = pdf.lastAutoTable.finalY + 5;

  // ── Disclosures ──
  if (opts.flags.length > 0) {
    pdf.setFontSize(8); pdf.setTextColor(150, 90, 20);
    const line = `Note: ${opts.flags.length} steel item(s) were NOT priced because their unit could not be resolved (${opts.flags.map(f => f.code).join(', ')}). Correct the rate-book unit and recompute.`;
    const wrapped = pdf.splitTextToSize(line, contentW);
    pdf.text(wrapped, mL, y);
    y += wrapped.length * 3.6 + 2;
    pdf.setTextColor(0, 0, 0);
  }
  if (opts.excluded.length > 0) {
    pdf.setFontSize(8); pdf.setTextColor(120, 120, 120);
    pdf.text(`Not included in this statement: ${opts.excluded.join(', ')}.`, mL, y);
    y += 5; pdf.setTextColor(0, 0, 0);
  }

  // ── 10CC (labour / other materials / POL) ──
  const cc = opts.cpwd10ccBreakdown || [];
  if (cc.length > 0) {
    y += 4;
    pdf.setFontSize(10); pdf.setFont('helvetica', 'bold');
    pdf.text('CLAUSE 10CC — labour, other materials & POL', mL, y);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
    pdf.setTextColor(90, 90, 90);
    pdf.text('W = 85% of work value; component escalation = W x (Sched-E %) x (I_now - I_base)/I_base, on WPI/CPI indices.', mL, y + 4);
    pdf.setTextColor(0, 0, 0);
    y += 8;
    autoTable(pdf, {
      startY: y,
      head: [['Component', 'Sched-E %', 'Base index', 'Current index', 'Variation']],
      body: cc.map(l => [l.label, `${l.percent}%`, l.baseIndex ? String(l.baseIndex) : '-', l.currentIndex ? l.currentIndex.toFixed(1) : '-', rupee(l.variation)]),
      foot: [[
        { content: 'Total 10CC price variation', colSpan: 4, styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
        { content: rupee(opts.cpwd10ccTotal || 0), styles: { fontStyle: 'bold' as const } },
      ]],
      theme: 'grid',
      headStyles: { fillColor: [20, 20, 20], textColor: [255, 255, 255], fontSize: 8.5, halign: 'center' },
      footStyles: { fillColor: [235, 235, 235], textColor: [0, 0, 0] },
      bodyStyles: { fontSize: 8.5 },
      columnStyles: { 0: { cellWidth: 60 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      margin: { left: mL, right: mR },
    });
    y = pdf.lastAutoTable.finalY + 5;
  }

  // ── Combined CPWD total (10CA + 10CC) ──
  if (opts.combinedTotal != null && cc.length > 0) {
    pdf.setFillColor(230, 245, 238);
    pdf.rect(mL, y, contentW, 9, 'F');
    pdf.setFontSize(10); pdf.setFont('helvetica', 'bold');
    pdf.text('TOTAL CPWD PRICE VARIATION (10CA + 10CC)', mL + 3, y + 5.8);
    pdf.text(rupee(opts.combinedTotal), pageW - mR - 3, y + 5.8, { align: 'right' });
    pdf.setFont('helvetica', 'normal');
    y += 13;
  }

  // ── Certificate + signatures ──
  y += 4;
  pdf.setFontSize(8.5); pdf.setFont('helvetica', 'italic');
  const cert = pdf.splitTextToSize(
    'Certified that the above price variation has been computed under CPWD Clause 10CA'
    + (cc.length > 0 ? ' and 10CC' : '')
    + ' on the quantities of material used in this bill and the base prices and indices published by CPWD '
    + '(10CA base: October 2012)' + (cc.length > 0 ? ', with 10CC on the WPI/CPI indices for the relevant months.' : '.'),
    contentW,
  );
  pdf.text(cert, mL, y);
  pdf.setFont('helvetica', 'normal');
  y += cert.length * 4 + 12;

  const third = contentW / 3;
  ['Prepared by', 'Checked (AE/EE)', 'Date & place'].forEach((role, i) => {
    const x = mL + i * third;
    pdf.setDrawColor(0, 0, 0); pdf.line(x, y, x + third - 8, y);
    pdf.setFontSize(8); pdf.setTextColor(90, 90, 90);
    pdf.text(role, x, y + 4);
    pdf.setTextColor(0, 0, 0);
  });

  return Buffer.from(pdf.output('arraybuffer'));
}
