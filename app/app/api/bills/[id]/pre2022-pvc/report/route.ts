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

    // Append the published index sheets the office has uploaded — the same annexes the
    // GCC-2022 report carries. Only the series the OLD clause actually uses are
    // attached: Labour (CPI-IW), Other Materials, Plant & Machinery and Cement are the
    // same series under both clauses, so their sheets prove these figures too. The
    // MPNG diesel and JPC steel sheets are deliberately NOT attached — this clause
    // prices fuel and steel on WPI, and a diesel sheet stapled to a WPI figure would
    // invite checking it against the wrong table. Fuel and steel are traceable through
    // the index-values annex to the 2011-12 WPI workbook named on it.
    let finalBytes: Uint8Array = new Uint8Array(pdfBuffer);
    try {
      const { embedComponentIndicesRange } = await import('@/lib/pdf/utils/labour-index-embedder');
      const { ComponentType } = await import('@prisma/client');
      const lastQuarterMonth = pricing.quarterMonths[pricing.quarterMonths.length - 1];
      finalBytes = await embedComponentIndicesRange(finalBytes, {
        startDate: pricing.baseMonth,
        endDate: lastQuarterMonth,
        componentTypes: [
          ComponentType.LABOUR,
          ComponentType.OTHER_MATERIALS,
          ComponentType.PLANT_MACHINERY_SPARES,
          ComponentType.CEMENT,
        ],
      });
    } catch (err) {
      // The statement stands on its own; missing annex sheets must not block it.
      console.error('pre-2022 report: could not embed index documents:', err);
    }

    // The trial watermark, by the same rule as every other report: a trial-discounted
    // bill is stamped until its owner has topped up at least once. Without this, the
    // pre-2022 statement was the clean copy a trial account could walk away with — the
    // exact hole the watermark exists to close.
    // Deliberately NOT wrapped in its own try/catch: if this check cannot run, the
    // request fails (the outer handler 500s) rather than shipping an unstamped copy.
    // An annex that fails to embed is cosmetic; enforcement that fails open is a hole.
    const stamp = await prisma.bill.findUnique({
      where: { id },
      select: {
        createdVia: true,
        billTransaction: { select: { discountType: true } },
        contract: { select: { userId: true } },
      },
    });
    // A chat-created bill that was never charged is stamped whatever the owner has paid
    // for since; a trial bill is stamped until the owner has topped up.
    const { isTrialBill, isUnsettledChatBill } = await import('@/lib/trial-watermark');
    if (isUnsettledChatBill(stamp) || (isTrialBill(stamp) && stamp?.contract?.userId)) {
      const topups = isUnsettledChatBill(stamp) ? 0 : await prisma.creditTransaction.count({
        where: { userId: stamp!.contract!.userId!, type: 'add' },
      });
      if (topups === 0) {
        const { applyTrialWatermark } = await import('@/lib/pdf/utils/watermark');
        finalBytes = await applyTrialWatermark(finalBytes);
      }
    }

    const safeBillNo = bill.billNo.replace(/[^A-Za-z0-9-]+/g, '_');
    return new NextResponse(finalBytes, {
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
