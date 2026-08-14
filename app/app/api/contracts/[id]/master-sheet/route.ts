import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { checkUserContractAccess } from '@/lib/permissions';
import { resolvePre2022Setup } from '@/lib/pre2022-contract';
import { getQuarterlyAverages } from '@/lib/db-utils';
import { getQuarterMonths } from '@/lib/pvc-calculations';
import { getSteelCityForZone, getFuelIndexNameForBill } from '@/lib/zone-steel-city-mapping';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * The contract's PVC master sheet: the whole contract on one grid, one row per bill —
 * gross, cement and steel values, the indices used, every component's amount, running
 * total — plus the JPC steel working laid out size by size and fortnight by fortnight.
 *
 * Modelled on the hand-built Excel workings accounts offices actually keep (one master
 * grid, one sheet of index workings, one of JPC averages), but computed: every figure
 * comes from the same calculations the reports use, so this sheet cannot drift from
 * them the way a hand-dragged formula can. Serves both clauses — a pre-2022 contract's
 * rows come from the pre-2022 pricer, a current one's from the stored calculations.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const requester = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    const access = requester ? await checkUserContractAccess(requester.id, id) : null;
    if (!access?.canView) {
      return NextResponse.json({ error: 'You do not have access to this contract.' }, { status: 403 });
    }

    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        bills: {
          orderBy: { dateOfMeasurement: 'asc' },
          include: { pvcCalculation: true },
        },
      },
    });
    if (!contract) return NextResponse.json({ error: 'Contract not found' }, { status: 404 });

    const setup = resolvePre2022Setup(contract as any);
    const rupee = (n: number) => Math.round(n * 100) / 100;

    // ---- Sheet 1: the master grid --------------------------------------------------
    const head = [
      ['PVC MASTER SHEET' + (setup.isPre2022 ? ' — pre-2022 GCC clause' : ' — GCC April 2022')],
      [`Agreement: ${contract.agreementNo}`, '', `Contractor: ${contract.contractorName}`],
      [`Work: ${contract.workDescription}`],
      [`Base month: ${new Date(contract.baseMonth).toISOString().slice(0, 7)}`, '', `Tender opening: ${new Date(contract.dateOfOpening).toLocaleDateString('en-IN')}`],
      [],
    ];
    const columns = [
      'Bill No', 'Quarter', 'Date of Measurement', 'Gross Amount',
      'Cement Value', 'Steel Value', 'Varying Amount (W)',
      'Labour', 'Other Materials', 'Fuel', 'Plant & Machinery', 'Explosives',
      'Cement PVC', 'Steel PVC', 'Total PVC', 'Cumulative PVC',
    ];
    const rows: any[][] = [];
    // Every index series used, per bill, for the second grid below the first.
    const indexRows: any[][] = [];
    let cumulative = 0;
    // The JPC working needs each bill's quarter months and city.
    const jpcNeeds: Array<{ billNo: string; months: Date[]; city: string }> = [];

    for (const bill of contract.bills) {
      const city = getSteelCityForZone(bill.zone);
      if (setup.isPre2022) {
        const { pricePre2022Bill } = await import('@/lib/pre2022-bill-pvc');
        try {
          const p = await pricePre2022Bill(bill as any);
          const comp = (name: string) => rupee(
            p.result.components.filter(c => c.name.startsWith(name)).reduce((s, c) => s + c.amount, 0));
          const steelPvc = rupee(p.result.components.filter(c => c.name.startsWith('Steel supplied')).reduce((s, c) => s + c.amount, 0));
          cumulative += p.result.totalPvc;
          rows.push([
            bill.billNo, p.quarter, new Date(bill.dateOfMeasurement).toLocaleDateString('en-IN'),
            rupee(p.result.grossValueOfWork), rupee(p.result.cementValue), rupee(p.result.steelValue),
            rupee(p.result.varyingAmount),
            comp('Labour'), comp('Other Materials'), comp('Fuel'), comp('Plant'), comp('Explosives'),
            comp('Cement supplied'), steelPvc, rupee(p.result.totalPvc), rupee(cumulative),
          ]);
          for (const iv of p.indexValues) {
            indexRows.push([bill.billNo, p.quarter, iv.indexName, iv.baseValue,
              ...iv.monthlyValues.map(m => m.value), rupee(iv.average)]);
          }
          jpcNeeds.push({ billNo: bill.billNo, months: p.quarterMonths, city });
        } catch (err: any) {
          rows.push([bill.billNo, bill.quarter, new Date(bill.dateOfMeasurement).toLocaleDateString('en-IN'),
            rupee(bill.grossBillAmount ?? bill.billAmount), '', '', '',
            `could not price: ${String(err?.message || err).slice(0, 120)}`]);
        }
      } else {
        const c = bill.pvcCalculation;
        cumulative += c?.totalPvc || 0;
        rows.push([
          bill.billNo, bill.quarter, new Date(bill.dateOfMeasurement).toLocaleDateString('en-IN'),
          rupee(bill.grossBillAmount ?? bill.billAmount),
          rupee(bill.cementAmount || 0), rupee(bill.steelAmount || 0),
          rupee(bill.billAmount),
          rupee(c?.labourPvc || 0), rupee(c?.otherMaterialsPvc || 0), rupee(c?.fuelPowerPvc || 0),
          rupee(c?.plantMachineryPvc || 0), rupee(c?.explosivesPvc || 0),
          rupee((c?.cementPvc || 0) + (c?.dedicatedCementPvc || 0)),
          rupee((c?.steelPvc || 0) + (c?.dedicatedSteelPvc || 0)),
          rupee(c?.totalPvc || 0), rupee(c?.cumulativePvc ?? cumulative),
        ]);
        try {
          const fuelName = getFuelIndexNameForBill(bill.zone, (bill as any).fuelPriceType);
          const names = ['Labour', 'RBI Other Materials', fuelName, 'RBI Plant Machinery', 'RBI Cement', 'RBI Explosives'];
          const averages = await getQuarterlyAverages(bill.quarter, names, new Date(contract.baseMonth), 'auto');
          for (const row of averages as any[]) {
            indexRows.push([bill.billNo, bill.quarter, row.indexName, row.baseValue,
              ...(row.monthlyValues || []).map((m: any) => m.value), rupee(row.average)]);
          }
          jpcNeeds.push({ billNo: bill.billNo, months: getQuarterMonths(bill.quarter, new Date(contract.baseMonth)), city });
        } catch {
          // Index detail is an annex; a bill whose averages cannot be fetched still
          // appears on the master grid with its stored amounts.
        }
      }
    }
    const totalRow = ['TOTAL', '', '',
      rupee(rows.reduce((s, r) => s + (Number(r[3]) || 0), 0)),
      rupee(rows.reduce((s, r) => s + (Number(r[4]) || 0), 0)),
      rupee(rows.reduce((s, r) => s + (Number(r[5]) || 0), 0)), '',
      ...[7, 8, 9, 10, 11, 12, 13, 14].map(i => rupee(rows.reduce((s, r) => s + (Number(r[i]) || 0), 0))),
      '',
    ];
    // ---- Render as PDF: A3 landscape, the grid layout the hand workings use ------
    const pdf = new jsPDF({ unit: 'mm', format: 'a3', orientation: 'landscape' });
    const pageW = pdf.internal.pageSize.getWidth();
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13);
    pdf.text(head[0][0] as string, pageW / 2, 12, { align: 'center' });
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5);
    pdf.text(`${head[1][0]}    ${head[1][2]}`, pageW / 2, 18, { align: 'center' });
    pdf.text(String(head[2][0]).slice(0, 180), pageW / 2, 23, { align: 'center' });
    pdf.text(`${head[3][0]}    ${head[3][2]}`, pageW / 2, 28, { align: 'center' });
    const money = (v: any) => typeof v === 'number' ? v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v ?? '');
    autoTable(pdf, {
      startY: 32, margin: { left: 8, right: 8 }, theme: 'grid',
      styles: { fontSize: 6.5, cellPadding: 1 },
      headStyles: { fillColor: [230, 230, 230], textColor: 20, fontStyle: 'bold' },
      head: [columns],
      body: [...rows.map(r => r.map((v, i) => i >= 3 ? money(v) : String(v ?? ''))),
             totalRow.map((v, i) => i >= 3 ? money(v) : String(v ?? ''))],
      columnStyles: Object.fromEntries(columns.map((_, i) => [i, i >= 3 ? { halign: 'right' } : {}])),
    });
    let y = (pdf as any).lastAutoTable.finalY + 8;
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10);
    pdf.text('Index values used (base, each quarter month, average)', 8, y);
    autoTable(pdf, {
      startY: y + 2, margin: { left: 8, right: 8 }, theme: 'grid',
      styles: { fontSize: 6.5, cellPadding: 1 },
      headStyles: { fillColor: [230, 230, 230], textColor: 20, fontStyle: 'bold' },
      head: [['Bill No', 'Quarter', 'Series', 'Base', 'M1', 'M2', 'M3', 'Quarter Avg']],
      body: indexRows.map(r => r.map(v => typeof v === 'number' ? String(rupee(v)) : String(v ?? ''))),
    });
    // ---- The JPC steel working: size by size, fortnight by fortnight ---------------
    const jpcRows: any[][] = [
      [],
      ['Bill No', 'Month', 'City', 'Category', 'Item', 'Fortnight 1', 'Fortnight 2', 'Month Avg'],
    ];
    for (const need of jpcNeeds) {
      const items = await prisma.jpcSteelItem.findMany({
        where: { month: { in: need.months }, city: need.city },
        orderBy: [{ month: 'asc' }, { indexMapping: 'asc' }, { itemCode: 'asc' }],
      });
      const byCategory = new Map<string, number[]>();
      for (const item of items) {
        jpcRows.push([
          need.billNo, new Date(item.month).toISOString().slice(0, 7), item.city,
          item.indexMapping || item.category, item.itemName,
          item.f1 ?? '', item.f2 ?? '', item.average ?? '',
        ]);
        if (item.indexMapping && item.average != null) {
          const list = byCategory.get(item.indexMapping) || [];
          list.push(item.average);
          byCategory.set(item.indexMapping, list);
        }
      }
      for (const [category, values] of byCategory) {
        jpcRows.push([need.billNo, 'QUARTER AVG', need.city, category, '',
          '', '', rupee(values.reduce((s, v) => s + v, 0) / values.length)]);
      }
    }

    pdf.addPage();
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11);
    pdf.text('JPC steel working — fortnight prices per size, monthly and quarterly averages', 8, 12);
    autoTable(pdf, {
      startY: 16, margin: { left: 8, right: 8 }, theme: 'grid',
      styles: { fontSize: 6.5, cellPadding: 1 },
      headStyles: { fillColor: [230, 230, 230], textColor: 20, fontStyle: 'bold' },
      head: [jpcRows[1]],
      body: jpcRows.slice(2).filter(r => r.length).map(r => r.map((v: any) => typeof v === 'number' ? money(v) : String(v ?? ''))),
    });
    const buffer = Buffer.from(pdf.output('arraybuffer'));
    const safeNo = contract.agreementNo.replace(/[^A-Za-z0-9-]+/g, '_');
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="PVC_Master_${safeNo}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('master-sheet failed:', error);
    return NextResponse.json({ error: error?.message || 'Could not build the master sheet' }, { status: 500 });
  }
}
