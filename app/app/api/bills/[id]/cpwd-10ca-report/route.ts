import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { checkUserBillAccess } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/** Serve the CPWD 10CA statement PDF for a bill that was computed on Engine B. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const requester = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  const access = requester ? await checkUserBillAccess(requester.id, id) : null;
  if (!access?.canView) return NextResponse.json({ error: 'No access to this bill.' }, { status: 403 });

  const bill = await prisma.bill.findUnique({
    where: { id },
    include: { contract: true },
  });
  if (!bill) return NextResponse.json({ error: 'Bill not found' }, { status: 404 });

  // The stored Engine B result.
  const { schemaQualified } = await import('@/lib/db-schema');
  let row: any;
  try {
    const table = await schemaQualified('cpwd_10ca_calculations');
    const rows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT "region","baseMonth","billMonth","totalVariation","breakdown","flags","excluded"
       FROM ${table} WHERE "billId" = $1 LIMIT 1`,
      id,
    );
    row = rows[0];
  } catch {
    row = null;
  }
  if (!row) {
    return NextResponse.json({ error: 'This bill has no CPWD 10CA calculation yet. Recalculate it first.' }, { status: 400 });
  }

  const { generateCpwd10caReport } = await import('@/lib/pdf/generators/cpwd-10ca-report');
  const bytes = generateCpwd10caReport({
    contractorName: bill.contract.contractorName,
    agreementNo: bill.contract.agreementNo,
    workDescription: bill.contract.workDescription,
    billNo: bill.billNo,
    dateOfMeasurement: bill.dateOfMeasurement,
    region: row.region,
    baseMonth: row.baseMonth,
    billMonth: row.billMonth,
    breakdown: Array.isArray(row.breakdown) ? row.breakdown : [],
    totalVariation: Number(row.totalVariation),
    flags: Array.isArray(row.flags) ? row.flags : [],
    excluded: Array.isArray(row.excluded) ? row.excluded : [],
  });

  const safeName = String(bill.billNo || 'bill').replace(/[^a-z0-9._-]/gi, '_');
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="CPWD-10CA-${safeName}.pdf"`,
    },
  });
}
