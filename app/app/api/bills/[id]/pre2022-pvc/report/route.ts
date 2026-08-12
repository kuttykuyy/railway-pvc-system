/**
 * The printed statement for a bill priced under the pre-2022 clause.
 *
 * Prices the bill through the same path the screen uses and hands the result to the
 * generator — so the page and the paper can never disagree.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { checkUserBillAccess } from '@/lib/permissions';
import { Pre2022PricingError, pricePre2022BillById } from '@/lib/pre2022-bill-pvc';
import { generatePre2022Report } from '@/lib/pdf/generators/pre2022-report';

export const dynamic = 'force-dynamic';

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
    const access = requester ? await checkUserBillAccess(requester.id, id) : null;
    if (!access?.canView) {
      return NextResponse.json({ error: 'You do not have access to this bill.' }, { status: 403 });
    }

    const bill = await prisma.bill.findUnique({
      where: { id },
      select: {
        billNo: true,
        dateOfMeasurement: true,
        contract: {
          select: { agreementNo: true, contractorName: true, workDescription: true, dateOfOpening: true },
        },
      },
    });
    if (!bill) return NextResponse.json({ error: 'Bill not found' }, { status: 404 });

    const pricing = await pricePre2022BillById(id);

    const pdfBuffer = generatePre2022Report({
      pricing,
      billNo: bill.billNo,
      agreementNo: bill.contract.agreementNo,
      contractorName: bill.contract.contractorName,
      workDescription: bill.contract.workDescription,
      dateOfOpening: bill.contract.dateOfOpening,
      dateOfMeasurement: bill.dateOfMeasurement,
    });

    const safeBillNo = bill.billNo.replace(/[^A-Za-z0-9-]+/g, '_');
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="PVC_pre2022_${safeBillNo}.pdf"`,
      },
    });
  } catch (error: any) {
    if (error instanceof Pre2022PricingError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('pre-2022 report failed:', error);
    return NextResponse.json({ error: error?.message || 'Could not build the report' }, { status: 500 });
  }
}
