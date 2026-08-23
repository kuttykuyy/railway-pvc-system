/**
 * Jurisdiction transfers — admin only.
 *
 * GET  lists every transferred contract with its history, plus whether the columns
 *      are applied, plus the full contract list for picking from.
 * POST transfers one or many contracts: { contractIds, toZone, toDivision?, orderRef,
 *      effectiveDate?, note? }. Each contract is moved on its own, so one failure
 *      (already in that zone, not found) does not stop the rest; the response says
 *      what happened to each.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { validateAdminAccess } from '@/lib/role-auth';
import { prisma } from '@/lib/db';
import {
  jurisdictionColumnsReady, listTransferredContracts, transferContractJurisdiction,
} from '@/lib/jurisdiction';
import { RAILWAY_ZONE_STEEL_CITY_MAP } from '@/lib/zone-steel-city-mapping';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });

  const [ready, transferred, contracts] = await Promise.all([
    jurisdictionColumnsReady(),
    listTransferredContracts(),
    prisma.contract.findMany({
      select: { id: true, agreementNo: true, contractorName: true, workDescription: true, _count: { select: { bills: true } } },
      orderBy: { agreementNo: 'asc' },
    }),
  ]);
  const transferredById = new Map(transferred.map(t => [t.id, t]));
  return NextResponse.json({
    ready,
    transferred,
    contracts: contracts.map(c => ({
      id: c.id,
      agreementNo: c.agreementNo,
      contractorName: c.contractorName,
      workDescription: c.workDescription,
      bills: c._count.bills,
      agreementZone: c.agreementNo.split('/')[0]?.trim().toUpperCase() || null,
      administeringZone: transferredById.get(c.id)?.administeringZone || null,
    })),
    zones: Object.values(RAILWAY_ZONE_STEEL_CITY_MAP).map(z => ({ code: z.code, name: z.name })),
  });
}

export async function POST(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });

  const session = await getServerSession(authOptions);
  const body = await request.json().catch(() => ({}));
  const contractIds: string[] = Array.isArray(body.contractIds) ? body.contractIds.filter((x: unknown) => typeof x === 'string') : [];
  if (contractIds.length === 0) return NextResponse.json({ error: 'Pick at least one contract.' }, { status: 400 });
  if (contractIds.length > 200) return NextResponse.json({ error: 'At most 200 contracts per transfer.' }, { status: 400 });

  const toZone = String(body.toZone || '').trim().toUpperCase();
  if (!RAILWAY_ZONE_STEEL_CITY_MAP[toZone]) return NextResponse.json({ error: 'A valid destination zone is required.' }, { status: 400 });
  const orderRef = String(body.orderRef || '').trim();
  if (!orderRef) return NextResponse.json({ error: 'The order reference is required.' }, { status: 400 });

  const results: Array<{ contractId: string; ok: boolean; error?: string; billsRestamped?: number }> = [];
  for (const contractId of contractIds) {
    const r = await transferContractJurisdiction({
      contractId, toZone,
      toDivision: body.toDivision ? String(body.toDivision) : null,
      orderRef,
      effectiveDate: body.effectiveDate ? String(body.effectiveDate) : null,
      note: body.note ? String(body.note) : null,
      byUserEmail: session?.user?.email || null,
    });
    if (r.ok === true) results.push({ contractId, ok: true, billsRestamped: r.entry.billsRestamped });
    else if (r.ok === false) results.push({ contractId, ok: false, error: r.error });
  }
  const moved = results.filter(r => r.ok).length;
  return NextResponse.json({ moved, failed: results.length - moved, results });
}
