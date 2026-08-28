import { NextRequest, NextResponse } from 'next/server';
import { importCpwd10caFromNsr } from '@/lib/cpwd-price-import';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Scheduled CPWD 10CA price auto-import (Vercel Cron).
 *
 * Re-fetches the NSRCivil monthly history and upserts it, so the feed picks up new months
 * (e.g. the first 2026 circular) on its own — no one has to click the import. Idempotent:
 * existing months are refreshed, new ones added, and the response names the new months.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`; a manual trigger with
 * `?secret=<CRON_SECRET>` also works. Fails closed if CRON_SECRET is unset.
 */
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (request.headers.get('authorization') === `Bearer ${secret}`) return true;
  if (request.nextUrl.searchParams.get('secret') === secret) return true;
  return false;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await importCpwd10caFromNsr();
    return NextResponse.json({
      ok: true,
      ...result,
      message: result.newMonths.length
        ? `Added ${result.newMonths.length} new month(s): ${result.newMonths.join(', ')}. Latest now ${result.latestMonth}.`
        : `No new months (latest still ${result.latestMonth}); refreshed ${result.written} rows.`,
    });
  } catch (error: any) {
    console.error('[cron/cpwd-prices-import] failed:', error);
    return NextResponse.json({ ok: false, error: error?.message || 'Import failed' }, { status: 500 });
  }
}
