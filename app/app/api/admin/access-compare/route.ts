/**
 * The phase-2 safety net's results: every time the old bill-access id-list and the new
 * database predicate disagreed for a real person, with who, when, and which ids.
 *
 * An empty list over a period of real use is the evidence that the transcription is
 * faithful and the old path can be deleted. Any entry is a bug to read before trusting
 * the new path further. GET reads; DELETE clears, for starting a fresh observation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAccess } from '@/lib/role-auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const KEY = 'access_compare_mismatches';

export async function GET(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });

  const row = await prisma.adminSettings.findUnique({ where: { key: KEY }, select: { value: true, updatedAt: true } });
  let mismatches: unknown[] = [];
  try { mismatches = row?.value ? JSON.parse(row.value) : []; } catch { mismatches = []; }
  return NextResponse.json({ mismatches, lastWrittenAt: row?.updatedAt ?? null });
}

export async function DELETE(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });

  await prisma.adminSettings.deleteMany({ where: { key: KEY } });
  return NextResponse.json({ ok: true });
}
