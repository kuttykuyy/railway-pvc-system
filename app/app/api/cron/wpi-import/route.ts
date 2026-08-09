import { logger } from '@/lib/logger';
/**
 * Scheduled WPI auto-import (Vercel Cron).
 *
 * Re-fetches the latest WPI workbook from eaindustry.nic.in and upserts the
 * mapped indices, then re-applies the "latest 2 months = provisional" rolling
 * rule. Running this on a schedule keeps index data fresh AND keeps the
 * provisional/final flags accurate without anyone doing the monthly import by
 * hand.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. A manual
 * trigger with `?secret=<CRON_SECRET>` is also accepted. Fails closed if
 * CRON_SECRET is unset.
 */

import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/db';
import {
  WPI_MAPPINGS,
  parseWPIExcelData,
  updateIndicesFromWPI,
  getWPIDownloadUrl,
} from '@/lib/wpi-fetcher';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Both series' codes — two of the four changed at the June 2026 rebase.
const WPI_CODES = new Set(Object.values(WPI_MAPPINGS).flatMap((m: any) => [m.code, m.newCode]));

/** Fetch + parse a WPI workbook; returns the mapped rows, or null if the file is
 *  missing / not yet published (does not contain our commodities). */
async function fetchWpiMonth(year: number, month: number): Promise<any[] | null> {
  const url = getWPIDownloadUrl(year, month);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; IR-PVC/1.0; +https://irpvc.in)' },
  }).catch(() => null);
  if (!res || !res.ok) return null;
  try {
    const wb = XLSX.read(await res.arrayBuffer(), { type: 'array' });
    const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as any[][];
    const parsed = parseWPIExcelData(data);
    return parsed.some((r: any) => WPI_CODES.has(r.commCode)) ? parsed : null;
  } catch {
    return null;
  }
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed — no secret configured, no access
  const header = request.headers.get('authorization');
  if (header === `Bearer ${secret}`) return true;
  if (request.nextUrl.searchParams.get('secret') === secret) return true;
  return false;
}

/** (indexName|month) pairs currently flagged provisional, for the WPI indices. */
async function provisionalKeys(): Promise<Set<string>> {
  const wpiIndices = await prisma.priceIndex.findMany({
    where: { name: { in: Object.keys(WPI_MAPPINGS) } },
    select: { id: true, name: true },
  });
  const byId = new Map(wpiIndices.map(i => [i.id, i.name]));
  const rows = await prisma.monthlyIndexValue.findMany({
    where: { priceIndexId: { in: wpiIndices.map(i => i.id) }, isProvisional: true },
    select: { priceIndexId: true, month: true },
  });
  return new Set(rows.map(r => `${byId.get(r.priceIndexId)}|${new Date(r.month).toISOString().slice(0, 7)}`));
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    // Step back from the CURRENT month until a workbook with our data is found. The
    // site keeps only the newest workbook and removes superseded ones, and new-series
    // files are named a month ahead of their data — starting at last month meant that
    // for half of every month the loop began at a filename that no longer existed and
    // walked backwards through more that didn't, importing nothing until the 1st.
    const now = new Date();
    const baseYear = now.getUTCFullYear();
    const baseMonth = now.getUTCMonth() + 1;

    let wpiData: any[] | null = null;
    let url = '';
    for (let i = 0; i < 5; i++) {
      let y = baseYear;
      let m = baseMonth - i;
      while (m <= 0) { m += 12; y -= 1; }
      url = getWPIDownloadUrl(y, m);
      logger.log('[WPI Cron] Trying', url);
      wpiData = await fetchWpiMonth(y, m);
      if (wpiData) break;
    }
    if (!wpiData) {
      return NextResponse.json(
        { error: 'No published WPI workbook with our commodities found in the last 5 months.' },
        { status: 502 },
      );
    }

    // Snapshot which months are provisional before/after, so we can report which
    // ones this run finalised (a signal that any bill using them may now differ).
    const before = await provisionalKeys();

    // isProvisional = true so wpi-fetcher applies the rolling 2-month rule
    // (newest 2 months provisional, everything older final).
    const result = await updateIndicesFromWPI(wpiData, true);

    const after = await provisionalKeys();
    const finalisedThisRun = [...before].filter(k => !after.has(k)).sort();

    logger.log(`[WPI Cron] updated=${result.updated} finalised=${finalisedThisRun.length} in ${Date.now() - startedAt}ms`);

    return NextResponse.json({
      success: result.success,
      url,
      updated: result.updated,
      finalisedThisRun,        // e.g. ["RBI Cement|2025-04", ...] — moved provisional -> final
      stillProvisional: [...after].sort(),
      errors: result.errors,
      tookMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error('[WPI Cron] Error:', error);
    return NextResponse.json(
      { error: 'WPI cron import failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
