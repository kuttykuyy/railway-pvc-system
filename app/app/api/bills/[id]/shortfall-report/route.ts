import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { checkUserBillAccess } from '@/lib/permissions';
import { computeShortfall } from '@/lib/shortfall';
import { format } from 'date-fns';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const access = await checkUserBillAccess(user.id, id);
  if (!access) return NextResponse.json({ error: 'Bill not found' }, { status: 404 });

  const bill = await prisma.bill.findUnique({
    where: { id },
    include: {
      pvcCalculation: true,
      shortfallAudit: true,
      contract: { select: { agreementNo: true, contractorName: true, workDescription: true, user: { select: { reportHeaderText: true } } } },
    },
  });
  if (!bill) return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
  if (!bill.pvcCalculation) return NextResponse.json({ error: 'This bill has no PVC calculation yet.' }, { status: 400 });
  if (!bill.shortfallAudit) return NextResponse.json({ error: 'Enter the Railway PVC figures before generating the recovery statement.' }, { status: 400 });

  const { generateShortfallReport } = await import('@/lib/pdf/generators/shortfall-report');
  const bytes = generateShortfallReport({
    organizationName: bill.contract.user?.reportHeaderText || 'INDIAN RAILWAYS',
    contractorName: bill.contract.contractorName,
    agreementNo: bill.contract.agreementNo,
    workDescription: bill.contract.workDescription,
    billNo: bill.billNo,
    pvcNumber: bill.pvcNumber,
    quarter: bill.quarter,
    dateOfMeasurement: bill.dateOfMeasurement,
    railwayReference: bill.shortfallAudit.railwayReference,
    remarks: bill.shortfallAudit.remarks,
    result: computeShortfall(bill.pvcCalculation, bill.shortfallAudit),
  });

  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="PVC_Shortfall_${bill.billNo.replace(/[^a-zA-Z0-9]/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.pdf"`,
    },
  });
}
