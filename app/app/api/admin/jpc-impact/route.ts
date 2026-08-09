import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAccess } from '@/lib/role-auth';
import { prisma } from '@/lib/db';
import { getSteelCityForZone } from '@/lib/zone-steel-city-mapping';
import { getQuarterMonths } from '@/lib/pvc-calculations';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** The mark the cross-check's fix endpoint leaves on every rate it corrects. */
const FIX_SOURCE = 'JPC cross-check fix';

/**
 * GET /api/admin/jpc-impact — which bills a JPC correction has moved.
 *
 * Correcting a rate updates the item and rebuilds that month's steel indices, but a
 * bill's PVC is STORED: it keeps the figure computed when the bill was made. So a
 * correction leaves bills quietly disagreeing with the indices they cite, and nothing
 * says which. This finds them: every rate corrected here, the month and city it belongs
 * to, and each bill whose quarter draws on that month with that city's steel.
 *
 * It reports; it recalculates nothing. Bills that have been approved or paid are the
 * ones where a silent change would be worst, so they are named and left alone — what to
 * do about a signed bill is a decision for the office, not for a background job.
 */
export async function GET(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) {
    return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });
  }

  try {
    // Every rate the cross-check corrected, and when.
    const corrections = await prisma.jpcSteelItem.findMany({
      where: { source: FIX_SOURCE },
      select: { itemCode: true, itemName: true, city: true, month: true, f1: true, f2: true, average: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (corrections.length === 0) {
      return NextResponse.json({
        corrections: [],
        bills: [],
        note: 'No JPC rates have been corrected through the cross-check yet, so no bill depends on a changed steel figure.',
      });
    }

    // The (city, month) pairs those corrections touched.
    const touched = new Map<string, { city: string; monthKey: string; items: string[] }>();
    for (const c of corrections) {
      const monthKey = c.month.toISOString().slice(0, 7);
      const key = `${c.city}|${monthKey}`;
      const entry = touched.get(key) || { city: c.city, monthKey, items: [] };
      if (!entry.items.includes(c.itemName)) entry.items.push(c.itemName);
      touched.set(key, entry);
    }

    // Bills that carry steel and could therefore read those months.
    const bills = await prisma.bill.findMany({
      where: { pvcCalculation: { isNot: null } },
      select: {
        id: true,
        billNo: true,
        zone: true,
        quarter: true,
        status: true,
        dateOfMeasurement: true,
        contract: { select: { agreementNo: true, baseMonth: true } },
        pvcCalculation: { select: { steelPvc: true, totalPvc: true } },
      },
    });

    const affected: any[] = [];
    for (const bill of bills) {
      const steelPvc = Number(bill.pvcCalculation?.steelPvc ?? 0);
      // No steel in the bill means no JPC figure reached it.
      if (!steelPvc) continue;

      const city = getSteelCityForZone(bill.zone);
      let quarterMonths: Date[] = [];
      try {
        quarterMonths = getQuarterMonths(bill.quarter, new Date(bill.contract.baseMonth));
      } catch {
        continue;
      }
      const monthKeys = new Set(quarterMonths.map(m => m.toISOString().slice(0, 7)));

      // The default (unsuffixed) steel indices are the Chennai ones, so a Chennai bill
      // is touched by a Chennai correction and by nothing else.
      const hits = [...touched.values()].filter(t => t.city === city && monthKeys.has(t.monthKey));
      if (hits.length === 0) continue;

      affected.push({
        billId: bill.id,
        billNo: bill.billNo,
        agreementNo: bill.contract.agreementNo,
        zone: bill.zone,
        steelCity: city,
        quarter: bill.quarter,
        status: bill.status,
        storedSteelPvc: steelPvc,
        storedTotalPvc: Number(bill.pvcCalculation?.totalPvc ?? 0),
        months: hits.map(h => h.monthKey),
        items: [...new Set(hits.flatMap(h => h.items))],
      });
    }

    // Signed bills first — those are the ones needing a human decision.
    const rank = (s: string) => (['approved', 'paid', 'submitted'].includes(String(s).toLowerCase()) ? 0 : 1);
    affected.sort((a, b) => rank(a.status) - rank(b.status) || String(a.billNo).localeCompare(String(b.billNo)));

    return NextResponse.json({
      corrections: corrections.map(c => ({
        item: c.itemName,
        city: c.city,
        month: c.month.toISOString().slice(0, 7),
        f1: c.f1,
        f2: c.f2,
        average: c.average,
        correctedAt: c.updatedAt,
      })),
      touched: [...touched.values()],
      bills: affected,
      summary: {
        correctionCount: corrections.length,
        affectedBills: affected.length,
        needingDecision: affected.filter(b => rank(b.status) === 0).length,
      },
    });
  } catch (error: any) {
    console.error('[JPC impact] failed:', error);
    return NextResponse.json({ error: error?.message || 'Impact check failed' }, { status: 500 });
  }
}

/**
 * POST /api/admin/jpc-impact — recalculate one named bill.
 *
 * One bill per call, by id, never in bulk: recalculation rewrites a stored figure that
 * may already be on paper somewhere, and that is a decision taken bill by bill with the
 * before and after in view.
 */
export async function POST(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) {
    return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });
  }
  try {
    const { billId } = await request.json().catch(() => ({}));
    if (!billId) return NextResponse.json({ error: 'billId is required' }, { status: 400 });

    const before = await prisma.pvcCalculation.findFirst({
      where: { billId },
      select: { totalPvc: true, steelPvc: true },
    });

    const { recalculateBillPvc } = await import('@/lib/recalculate-bill-pvc');
    await recalculateBillPvc(billId);

    const after = await prisma.pvcCalculation.findFirst({
      where: { billId },
      select: { totalPvc: true, steelPvc: true },
    });

    return NextResponse.json({
      success: true,
      before: { totalPvc: Number(before?.totalPvc ?? 0), steelPvc: Number(before?.steelPvc ?? 0) },
      after: { totalPvc: Number(after?.totalPvc ?? 0), steelPvc: Number(after?.steelPvc ?? 0) },
      difference: Number(after?.totalPvc ?? 0) - Number(before?.totalPvc ?? 0),
    });
  } catch (error: any) {
    console.error('[JPC impact] recalculation failed:', error);
    return NextResponse.json({ error: error?.message || 'Recalculation failed' }, { status: 500 });
  }
}
