import { logger } from '@/lib/logger';
/**
 * Scheduled PPAC diesel-price auto-import (Vercel Cron).
 *
 * Fetches the latest PPAC daily-price PDF, imports the daily records, then
 * re-syncs the monthly MPNG Fuel indices (gap-filled). Running this on a
 * schedule stops the "months missing full records" problem from forming.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron) or `?secret=`.
 * Fails closed if CRON_SECRET is unset.
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchAndImportPPACPrices } from '@/lib/ppac-fetcher';
import { syncFuelPricesToMPNGIndex } from '@/lib/fuel-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (request.headers.get('authorization') === `Bearer ${secret}`) return true;
  if (request.nextUrl.searchParams.get('secret') === secret) return true;
  return false;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const importResult = await fetchAndImportPPACPrices();
    const sync = await syncFuelPricesToMPNGIndex();
    logger.log(`[PPAC Cron] import + sync done in ${Date.now() - startedAt}ms`);
    return NextResponse.json({
      success: true,
      import: importResult,
      sync: { created: sync.created, updated: sync.updated, months: sync.months.length },
      tookMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error('[PPAC Cron] Error:', error);
    return NextResponse.json(
      { error: 'PPAC cron import failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
