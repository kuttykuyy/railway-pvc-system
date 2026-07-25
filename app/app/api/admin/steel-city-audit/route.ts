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
        contract: { select: { agreementNo: true, contractorName: true, userId: true } },
        pvcCalculation: { select: { steelPvc: true, totalPvc: true } },
      },
      orderBy: { dateOfMeasurement: 'desc' },
    });

    // Only bills that actually have a steel component are affected — a bill with no
    // steel PVC used no steel index, so the wrong city changed nothing.
    const rows = bills.map((b) => {
      const zone = String(b.zone || '');
      const fix = CORRECTED_ZONES[zone];
      const steelPvc = b.pvcCalculation?.steelPvc ?? 0;
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
        // Steel PVC is what the city choice affects; no steel => no impact.
        affected: Math.abs(steelPvc) > 0.005,
      };
    });

    const affected = rows.filter((r) => r.affected);
    const byZone: Record<string, { total: number; affected: number; steelPvcSum: number }> = {};
    for (const r of rows) {
      const z = r.zone || 'unknown';
      byZone[z] = byZone[z] || { total: 0, affected: 0, steelPvcSum: 0 };
      byZone[z].total++;
      if (r.affected) {
        byZone[z].affected++;
        byZone[z].steelPvcSum = Math.round((byZone[z].steelPvcSum + r.steelPvc) * 100) / 100;
      }
    }

    return NextResponse.json({
      rule: 'GCC-2022 Clause 46A.9(2)',
      correctedZones: CORRECTED_ZONES,
      summary: {
        billsInCorrectedZones: rows.length,
        billsWithSteelComponent: affected.length,
        byZone,
      },
      // Affected first, then the rest for reference.
      bills: [...affected, ...rows.filter((r) => !r.affected)],
    });
  } catch (error: any) {
    console.error('steel-city-audit error:', error);
    return NextResponse.json({ error: error?.message || 'Audit failed' }, { status: 500 });
  }
}
