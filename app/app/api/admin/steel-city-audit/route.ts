/**
 * Admin-only audit: bills whose steel PVC used the wrong JPC city.
 *
 * GCC-2022 Clause 46A.9(2) prescribes which JPC city each zone must use for steel.
 * Two zones were mapped wrongly in this app until the fix:
 *   SWR (South Western)  used Mumbai  -> should be Chennai
 *   NER (North Eastern)  used Kolkata -> should be Delhi
 *
 * Any bill in those zones created BEFORE the fix had its steel component computed
 * against the wrong city's index, so its PVC may need revision. This lists them.
 *
 * Read-only: it reports, it does not recalculate or modify anything.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getSteelCityForZone } from '@/lib/zone-steel-city-mapping';

export const dynamic = 'force-dynamic';

/** Zones whose mapping was corrected, with the city wrongly used before the fix. */
const CORRECTED_ZONES: Record<string, { wrongCity: string; correctCity: string }> = {
  SWR: { wrongCity: 'Mumbai', correctCity: 'Chennai' },
  NER: { wrongCity: 'Kolkata', correctCity: 'Delhi' },
};

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true },
    });
    if (admin?.role !== 'admin' && admin?.role !== 'superadmin') {
      return NextResponse.json({ error: 'Access denied. Admin only.' }, { status: 403 });
    }

    const zones = Object.keys(CORRECTED_ZONES);
    const bills = await prisma.bill.findMany({
      where: { zone: { in: zones } },
      select: {
        id: true,
        billNo: true,
        zone: true,
        quarter: true,
        dateOfMeasurement: true,
        grossBillAmount: true,
        billAmount: true,
        createdAt: true,
        steelAmount: true,
        steelTmtBarsAmount: true,
        steelAngleChannelAmount: true,
        steelPlatesAmount: true,
        steelOtherSectionsAmount: true,
        contract: { select: { agreementNo: true, contractorName: true, userId: true } },
        pvcCalculation: { select: { steelPvc: true, totalPvc: true } },
        classificationEntries: { select: { steelTypes: true, steelPvc: true } },
      },
      orderBy: { dateOfMeasurement: 'desc' },
    });

    /**
     * Did this bill actually involve steel? Dedicated steel amounts or any entry
     * carrying steel types both mean steel was billed. Used to tell "genuinely no
     * steel" apart from "steel was billed but priced at zero".
     */
    const hasSteelWork = (b: (typeof bills)[number]): boolean => {
      const dedicated =
        (b.steelAmount ?? 0) + (b.steelTmtBarsAmount ?? 0) + (b.steelAngleChannelAmount ?? 0) +
        (b.steelPlatesAmount ?? 0) + (b.steelOtherSectionsAmount ?? 0);
      if (dedicated > 0.005) return true;
      return (b.classificationEntries || []).some((e) => {
        const t = e.steelTypes as unknown;
        return Array.isArray(t) && t.length > 0;
      });
    };

    const rows = bills.map((b) => {
      const zone = String(b.zone || '');
      const fix = CORRECTED_ZONES[zone];
      const steelPvc = b.pvcCalculation?.steelPvc ?? 0;
      const billedSteel = hasSteelWork(b);
      const paidSteel = Math.abs(steelPvc) > 0.005;

      // Three outcomes:
      //  - no_steel      : no steel billed, so the city never mattered.
      //  - wrong_city    : steel was priced, but against the wrong city's index.
      //  - steel_zero    : steel WAS billed yet priced at zero — the steel index for
      //                    that city is missing, so the contractor was under-paid.
      //                    This is worse than the wrong city and needs index data.
      const status = !billedSteel && !paidSteel
        ? 'no_steel'
        : paidSteel
          ? 'wrong_city'
          : 'steel_zero';

      return {
        id: b.id,
        billNo: b.billNo,
        agreementNo: b.contract?.agreementNo || null,
        contractorName: b.contract?.contractorName || null,
        zone,
        quarter: b.quarter,
        dateOfMeasurement: b.dateOfMeasurement,
        createdAt: b.createdAt,
        grossBillAmount: b.grossBillAmount ?? b.billAmount,
        steelPvc,
        totalPvc: b.pvcCalculation?.totalPvc ?? 0,
        usedCity: fix?.wrongCity ?? null,
        correctCity: fix?.correctCity ?? getSteelCityForZone(zone),
        billedSteel,
        status,
        affected: status !== 'no_steel',
      };
    });

    const order: Record<string, number> = { steel_zero: 0, wrong_city: 1, no_steel: 2 };
    const sorted = [...rows].sort((a, b) => order[a.status] - order[b.status]);

    const byZone: Record<string, { total: number; wrongCity: number; steelZero: number; noSteel: number }> = {};
    for (const r of rows) {
      const z = r.zone || 'unknown';
      byZone[z] = byZone[z] || { total: 0, wrongCity: 0, steelZero: 0, noSteel: 0 };
      byZone[z].total++;
      if (r.status === 'wrong_city') byZone[z].wrongCity++;
      else if (r.status === 'steel_zero') byZone[z].steelZero++;
      else byZone[z].noSteel++;
    }

    return NextResponse.json({
      rule: 'GCC-2022 Clause 46A.9(2)',
      correctedZones: CORRECTED_ZONES,
      summary: {
        billsInCorrectedZones: rows.length,
        wrongCity: rows.filter((r) => r.status === 'wrong_city').length,
        steelZero: rows.filter((r) => r.status === 'steel_zero').length,
        noSteel: rows.filter((r) => r.status === 'no_steel').length,
        byZone,
      },
      bills: sorted,
    });
  } catch (error: any) {
    console.error('steel-city-audit error:', error);
    return NextResponse.json({ error: error?.message || 'Audit failed' }, { status: 500 });
  }
}
