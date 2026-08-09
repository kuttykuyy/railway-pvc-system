import { NextRequest, NextResponse } from 'next/server';
import { fetchLabourIndexFromBureau, updateLabourIndexFromData } from '@/lib/labour-fetcher';

/**
 * Scheduled Labour (CPI-IW) auto-import (Vercel Cron).
 *
 * WPI and fuel already fetch themselves nightly; labour alone still travelled by hand —
 * download the CSV from labourbureau.gov.in, upload it here. The bureau's page embeds
 * the same table in its HTML, so this reads it directly on the same schedule as the
 * other indices.
 *
 * The newest two months import as provisional, everything older as final — the same
 * rolling rule the WPI import applies, and what the final-indices alert watches.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. A manual trigger
 * with `?secret=<CRON_SECRET>` is also accepted. Fails closed if CRON_SECRET is unset.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed — no secret configured, no access
  const header = request.headers.get('authorization');
  if (header === `Bearer ${secret}`) return true;
  if (request.nextUrl.searchParams.get('secret') === secret) return true;
  return false;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const data = await fetchLabourIndexFromBureau();
    if (data.length === 0) {
      return NextResponse.json(
        { error: 'The Labour Bureau page yielded no parseable rows — its layout may have changed.' },
        { status: 502 },
      );
    }

    // Only the 2016-base series counts — if the bureau ever lists rebased rows first,
    // slicing before this filter would mark the true newest 2016 months as final while
    // still revisable.
    const data2016 = data.filter(d => d.baseYear === 2016);
    if (data2016.length === 0) {
      return NextResponse.json({ error: 'No 2016-base rows on the bureau page' }, { status: 502 });
    }
    // Data arrives newest-first; the two newest months are still subject to revision.
    const provisional = data2016.slice(0, 2);
    const final = data2016.slice(2);

    const finalResult = await updateLabourIndexFromData(final, { isProvisional: false });
    const provisionalResult = await updateLabourIndexFromData(provisional, { isProvisional: true });

    const latest = data[0];
    return NextResponse.json({
      success: true,
      rowsParsed: data.length,
      latest: `${latest.monthName} ${latest.year} = ${latest.value}`,
      updated: finalResult.updated + provisionalResult.updated,
      created: finalResult.created + provisionalResult.created,
      skipped: finalResult.skipped + provisionalResult.skipped,
      tookMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error('[Labour Cron] Error:', error);
    return NextResponse.json(
      { error: 'Labour cron import failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
