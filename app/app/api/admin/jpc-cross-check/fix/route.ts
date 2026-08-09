import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAccess } from '@/lib/role-auth';
import { prisma } from '@/lib/db';
import { JPC_ITEMS } from '@/lib/jpc-items';
import { calculateIndexAveragesFromItemsMap, importToSteelIndices } from '@/lib/jpc-index-calc';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/jpc-cross-check/fix — correct one JPC rate cell, and everything
 * downstream of it.
 *
 * The cross-check reports; this applies. Each call is one cell — item, city, month,
 * fortnight, value — because each correction is one human decision made against the
 * sheet, whether that means adopting the sheet's figure or typing the true one where
 * the scan misled the reader.
 *
 * The cell alone is not enough: the fortnight values feed the item's average, the
 * averages feed the four steel indices, and the indices feed every bill. So after the
 * cell updates, the month+city's indices are recomputed through the SAME formulas the
 * steel-import save uses (shared in lib/jpc-index-calc) and written back — a corrected
 * rate that left a stale index behind would be worse than no correction at all.
 */
export async function POST(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) {
    return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });
  }

  try {
    const { itemCode, city, month, fortnight, value } = await request.json().catch(() => ({}));

    const jpcItem = JPC_ITEMS.find(i => i.id === itemCode);
    if (!jpcItem) return NextResponse.json({ error: `Unknown item code: ${itemCode}` }, { status: 400 });
    if (!['Kolkata', 'Delhi', 'Mumbai', 'Chennai'].includes(city)) {
      return NextResponse.json({ error: `Unknown city: ${city}` }, { status: 400 });
    }
    if (fortnight !== 'f1' && fortnight !== 'f2') {
      return NextResponse.json({ error: 'fortnight must be f1 or f2' }, { status: 400 });
    }
    const numericValue = Number(value);
    if (!isFinite(numericValue) || numericValue < 1000 || numericValue > 1000000) {
      return NextResponse.json({ error: 'value must be a plausible rupees-per-tonne figure' }, { status: 400 });
    }
    const monthMatch = String(month || '').match(/^(\d{4})-(\d{2})$/);
    if (!monthMatch) return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
    const monthDate = new Date(Date.UTC(Number(monthMatch[1]), Number(monthMatch[2]) - 1, 1));

    // Update the cell, recompute the item's own average from what its fortnights now hold.
    const existing = await prisma.jpcSteelItem.findUnique({
      where: { itemCode_month_city: { itemCode, month: monthDate, city } },
    });
    const f1 = fortnight === 'f1' ? numericValue : existing?.f1 ?? null;
    const f2 = fortnight === 'f2' ? numericValue : existing?.f2 ?? null;
    const average = f1 !== null && f2 !== null
      ? parseFloat(((f1 + f2) / 2).toFixed(2))
      : f1 !== null ? f1 : f2;

    const saved = await prisma.jpcSteelItem.upsert({
      where: { itemCode_month_city: { itemCode, month: monthDate, city } },
      update: { f1, f2, average, source: `JPC cross-check fix` },
      create: {
        itemCode,
        itemName: jpcItem.name,
        category: jpcItem.category,
        indexMapping: jpcItem.indexMapping ?? null,
        month: monthDate,
        city,
        f1,
        f2,
        average,
        source: `JPC cross-check fix`,
      },
    });

    // Recompute this month+city's steel indices from ALL its items and write them back.
    const items = await prisma.jpcSteelItem.findMany({ where: { month: monthDate, city } });
    const itemsMap: Record<string, any> = {};
    for (const item of items) itemsMap[item.itemCode] = item;
    const indexAverages = calculateIndexAveragesFromItemsMap(itemsMap);
    // Corrections come from final published sheets — the recomputed values are final.
    const indexResults = await importToSteelIndices(monthDate, indexAverages, false, city);

    return NextResponse.json({
      success: true,
      saved: { itemCode, city, month, fortnight, value: numericValue, average: saved.average },
      indices: Object.fromEntries(
        Object.entries(indexAverages).filter(([, v]) => v.value > 0).map(([k, v]) => [k, v.value]),
      ),
      indexResults,
    });
  } catch (error: any) {
    console.error('[JPC cross-check fix] failed:', error);
    return NextResponse.json({ error: error?.message || 'Fix failed' }, { status: 500 });
  }
}
