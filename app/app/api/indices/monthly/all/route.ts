
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = "force-dynamic";

/** Newest N monthly values. ~2,000 exist today; this is about 25 years of every index. */
const MONTHLY_VALUE_CAP = 6000;

// GET /api/indices/monthly/all - Get all monthly index values
export async function GET(request: NextRequest) {
  try {
    // Only the fields the manage screen reads. `include: { priceIndex: true }` repeated
    // the whole index record — id, base value, description, timestamps — on every one of
    // the ~2,000 rows this returns, for a screen that uses nothing from it but the name.
    // Bounded. This table gains a row per index per month for ever — about 2,000 today,
    // and it only climbs — and the manage screen it feeds filters in the browser, so
    // paging it would break its own search. The cap is by RECENCY, which is how the
    // screen sorts anyway: the newest values are the ones anybody edits. Roughly
    // twenty-five years of every index, and the headers say when it bites.
    const [total, monthlyValues] = await Promise.all([
      prisma.monthlyIndexValue.count(),
      prisma.monthlyIndexValue.findMany({
        select: {
          id: true,
          priceIndexId: true,
          month: true,
          value: true,
          isProvisional: true,
          source: true,
          updatedAt: true,
          priceIndex: { select: { name: true } },
        },
        orderBy: [
          { month: 'desc' },
          { priceIndex: { name: 'asc' } }
        ],
        take: MONTHLY_VALUE_CAP,
      }),
    ]);

    if (total > MONTHLY_VALUE_CAP) {
      console.warn(`[indices/monthly/all] capped: returned ${MONTHLY_VALUE_CAP} of ${total}`);
    }
    return NextResponse.json(monthlyValues, {
      headers: {
        'X-Total-Count': String(total),
        'X-Returned-Count': String(monthlyValues.length),
        'X-Truncated': total > MONTHLY_VALUE_CAP ? '1' : '0',
      },
    });
  } catch (error) {
    console.error('Error fetching all monthly values:', error);
    return NextResponse.json(
      { error: 'Failed to fetch monthly values' },
      { status: 500 }
    );
  }
}
