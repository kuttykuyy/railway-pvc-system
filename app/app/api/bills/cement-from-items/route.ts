import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { normalizeDsrCode, inferCementCoefficientFromMix, matchCementCoefficient } from '@/lib/dsr-cement-calculation';

export const dynamic = 'force-dynamic';

/**
 * Derives cement quantity (MT) per schedule from a manual bill's items, using
 * the DSR cement-coefficient table (cement qty = item qty x coefficient), with a
 * fallback to inferring the coefficient from the item description's mix ratio.
 * Feeds the manual DSR cement-rate calculator so a user doesn't type quantities.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const items: Array<{ dsrCode?: string; description?: string; unit?: string; quantity?: number | string; schedule?: string }> =
      Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json({ schedules: [], totalCementQtyMT: 0, matchedCount: 0, unmatchedCount: 0 });
    }

    // Cement coefficients are a bounded set (only cement-consuming DSR items), so
    // load all active rows and match on the normalized code.
    const coeffs = await prisma.dsrCementCoefficient.findMany({ where: { isActive: true } });
    const byCode = new Map(coeffs.map((c) => [normalizeDsrCode(c.dsrCode), c]));

    const bySchedule = new Map<string, { affectedItemCount: number; cementQtyMT: number }>();
    const unmatchedCodes = new Set<string>();
    let matchedCount = 0;
    let unmatchedCount = 0;

    for (const it of items) {
      const qty = Number(it.quantity) || 0;
      if (qty <= 0) continue;

      // Same matching the PDF-upload analysis uses (exact code, then base-code
      // fallback), so both paths agree on which items consume cement.
      const coeff = matchCementCoefficient(byCode, it.dsrCode || '')
        || inferCementCoefficientFromMix(it.description || '', it.unit || '');
      if (!coeff || !coeff.cementQuantityPerUnit) {
        unmatchedCount++;
        // Report what we actually looked for, so the user can add it rather than
        // being told only that "nothing was found".
        const shown = String(it.dsrCode || '').trim();
        if (shown) unmatchedCodes.add(shown);
        continue;
      }

      const cementQty = qty * coeff.cementQuantityPerUnit; // in coeff.cementUnit (MT)
      matchedCount++;
      const sched = String(it.schedule || 'Default').trim() || 'Default';
      const cur = bySchedule.get(sched) || { affectedItemCount: 0, cementQtyMT: 0 };
      cur.affectedItemCount += 1;
      cur.cementQtyMT += cementQty;
      bySchedule.set(sched, cur);
    }

    const schedules = Array.from(bySchedule.entries())
      .map(([name, v]) => ({ name, affectedItemCount: v.affectedItemCount, cementQtyMT: Math.round(v.cementQtyMT * 1000) / 1000 }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const totalCementQtyMT = Math.round(schedules.reduce((s, x) => s + x.cementQtyMT, 0) * 1000) / 1000;

    return NextResponse.json({
      schedules,
      totalCementQtyMT,
      matchedCount,
      unmatchedCount,
      unmatchedCodes: Array.from(unmatchedCodes).slice(0, 25),
      // The manual form has no unit column, so the mix-ratio fallback (MIX-1:2:4 etc.)
      // that the PDF path relies on cannot fire here. Surfaced so the UI can say so.
      mixInferenceUnavailable: items.every((i) => !String(i.unit || '').trim()),
    });
  } catch (error) {
    console.error('cement-from-items error:', error);
    return NextResponse.json({ error: 'Could not derive cement from items.' }, { status: 500 });
  }
}
