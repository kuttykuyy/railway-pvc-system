/**
 * Price one bill under the pre-2022 GCC clause.
 *
 * Separate from the ordinary calculation route on purpose. The stored PvcCalculation is
 * shaped around GCC-2022 — its groups, its dedicated cement and steel, its 85% factor —
 * and writing an old-clause figure into those fields would leave a record nobody could
 * read correctly later. This computes and returns; it stores nothing.
 *
 * So a pre-2022 contract can be priced correctly today, while the ordinary route
 * continues to warn on its face that it is pricing on the wrong clause.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { checkUserBillAccess } from '@/lib/permissions';
import { Pre2022PricingError, pricePre2022BillById } from '@/lib/pre2022-bill-pvc';

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

    const pricing = await pricePre2022BillById(id);

    // The contract is returned so a screen can offer the work-type choice without a
    // second round trip to find out which contract this bill belongs to.
    const bill = await prisma.bill.findUnique({
      where: { id },
      select: { billNo: true, contractId: true, contract: { select: { agreementNo: true } } },
    });

    return NextResponse.json({
      billNo: bill?.billNo ?? null,
      contractId: bill?.contractId ?? null,
      agreementNo: bill?.contract?.agreementNo ?? null,
      quarter: pricing.quarter,
      baseMonth: pricing.baseMonth.toISOString().slice(0, 7),
      quarterMonths: pricing.quarterMonths.map(m => m.toISOString().slice(0, 7)),
      workType: pricing.workTypeLabel,
      workTypeProposed: pricing.workTypeProposed,
      grossValueOfWork: pricing.result.grossValueOfWork,
      cementValue: pricing.result.cementValue,
      steelValue: pricing.result.steelValue,
      varyingAmount: pricing.result.varyingAmount,
      components: pricing.result.components,
      totalPvc: pricing.result.totalPvc,
      notes: pricing.notes,
    });
  } catch (error: any) {
    // A pricing error is a statement about this bill, not a server fault — it says what
    // is missing and what to do, so it is returned as such rather than as a 500.
    if (error instanceof Pre2022PricingError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('pre-2022 pricing failed:', error);
    return NextResponse.json({ error: error?.message || 'Could not price this bill' }, { status: 500 });
  }
}
