/**
 * Three whole-system numbers for the welcome page: bills processed, contracts on file,
 * railway zones seen. Aggregate counts only — nothing about any one account — so they
 * are safe to show any signed-in user, and cheap enough to cache for ten minutes.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const TTL_MS = 10 * 60 * 1000;
let cached: { at: number; body: { bills: number; contracts: number; zones: number } } | null = null;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (cached && Date.now() - cached.at < TTL_MS) return NextResponse.json(cached.body);

  const [bills, contracts, zoneRows] = await Promise.all([
    prisma.bill.count(),
    prisma.contract.count(),
    prisma.bill.findMany({ where: { zone: { not: null } }, distinct: ['zone'], select: { zone: true } }),
  ]);
  cached = { at: Date.now(), body: { bills, contracts, zones: zoneRows.length } };
  return NextResponse.json(cached.body);
}
