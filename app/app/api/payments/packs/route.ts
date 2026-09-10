import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getBillPacks, MIN_TOPUP_AMOUNT } from '@/lib/bill-packs';
import { getBillingSettings } from '@/lib/admin-settings';

export const dynamic = 'force-dynamic';

/**
 * What the top-up dialog can sell: the bill packs, the per-bill costs it needs to
 * show "N bills" as credits, and the plain top-up minimum. Prices only — nothing here
 * is trusted back; the order route works everything out again from the settings.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [packs, { billCost, aiBillCost }] = await Promise.all([getBillPacks(), getBillingSettings()]);
  return NextResponse.json({
    billCost,
    aiBillCost,
    minTopup: MIN_TOPUP_AMOUNT,
    packs: packs.map((p) => ({
      bills: p.bills,
      price: p.price,
      ai: p.ai,
      credits: p.bills * (p.ai ? aiBillCost : billCost),
      perBill: Math.round(p.price / p.bills),
    })),
  });
}
