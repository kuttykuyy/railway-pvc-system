import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAccess } from '@/lib/role-auth';
import { prisma } from '@/lib/db';
import { getFileUrl } from '@/lib/s3';
import { extractJpcSheet } from '@/lib/ai/jpc-extractor';
import { ComponentType } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const JPC_TYPES: ComponentType[] = [
  ComponentType.TMT_BARS,
  ComponentType.ANGLE_CHANNEL,
  ComponentType.PLATES,
  ComponentType.OTHER_SECTIONS,
];

/**
 * POST /api/admin/jpc-cross-check?year=YYYY&month=M — verify one month's stored JPC
 * rates against the uploaded official sheet.
 *
 * Years of rates were typed in by hand before the sheet reader existed; this reads the
 * month's two fortnight price pages straight out of the stored year document, extracts
 * their figures, and compares them cell by cell with what the database holds. It CHECKS
 * and reports — it never writes: a mismatch is a question for the admin (typo here, or
 * misread there?), not a correction to apply blind.
 *
 * One month per call, by design: each fortnight page costs an AI reading, and a month
 * stays comfortably inside a serverless clock while a year would not. The admin page
 * walks the months and accumulates the report.
 */
export async function POST(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) {
    return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });
  }

  const year = parseInt(request.nextUrl.searchParams.get('year') || '', 10);
  const month = parseInt(request.nextUrl.searchParams.get('month') || '', 10);
  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: 'year and month are required' }, { status: 400 });
  }

  try {
    // The stored year document, newest upload first — the same selection the bills use.
    const documents = await prisma.labourIndexDocument.findMany({
      where: { componentType: { in: JPC_TYPES }, year },
      orderBy: { createdAt: 'desc' },
    });
    const doc = documents.find(d => d.months.includes(month)) || documents[0];
    if (!doc) {
      return NextResponse.json({ error: `No JPC document uploaded for ${year}` }, { status: 404 });
    }

    // Locate the month's two fortnight price pages by the six-pages-per-month rhythm —
    // the same trust rule as everywhere: if the rhythm does not hold, say so rather
    // than read the wrong pages and call them this month.
    let bytes: Buffer;
    if (doc.cloudStoragePath.startsWith('db://') && doc.remarks?.startsWith('base64:')) {
      bytes = Buffer.from(doc.remarks.substring(7).split('|')[0], 'base64');
    } else {
      const url = await getFileUrl(doc.cloudStoragePath);
      const res = await fetch(url);
      if (!res.ok) return NextResponse.json({ error: `Could not fetch the stored document (${res.status})` }, { status: 502 });
      bytes = Buffer.from(await res.arrayBuffer());
    }

    const { PDFDocument } = await import('pdf-lib');
    const source = await PDFDocument.load(bytes);
    const docMonths = [...(doc.months || [])].sort((a, b) => a - b);
    const PAGES_PER_MONTH = 6;
    if (docMonths.length === 0 || source.getPageCount() !== docMonths.length * PAGES_PER_MONTH) {
      return NextResponse.json({
        error: `The ${year} document has ${source.getPageCount()} pages for ${docMonths.length} recorded month(s) — it does not follow the six-pages-per-month layout, so the month's pages cannot be located safely.`,
      }, { status: 422 });
    }
    const monthIdx = docMonths.indexOf(month);
    if (monthIdx === -1) {
      return NextResponse.json({ error: `The ${year} document does not cover month ${month}` }, { status: 404 });
    }

    // The stored rates being checked.
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 1));
    const stored = await prisma.jpcSteelItem.findMany({
      where: { month: { gte: monthStart, lt: monthEnd } },
    });
    const storedByKey = new Map(stored.map(s => [`${s.itemCode}|${s.city}`, s]));

    const results: any[] = [];
    for (const fortnight of ['f1', 'f2'] as const) {
      const pageIndex = monthIdx * PAGES_PER_MONTH + (fortnight === 'f1' ? 0 : 3);
      const onePage = await PDFDocument.create();
      const [page] = await onePage.copyPages(source, [pageIndex]);
      onePage.addPage(page);
      const pageBytes = Buffer.from(await onePage.save());

      const extraction = await extractJpcSheet(pageBytes, `${doc.fileName} p${pageIndex + 1}`);
      if (!extraction.ok || !extraction.data) {
        results.push({ fortnight, pageIndex: pageIndex + 1, error: extraction.error || 'unreadable' });
        continue;
      }

      const comparison = { matched: 0, mismatched: [] as any[], sheetOnly: [] as any[], dbOnly: 0, unreadableCells: 0 };
      for (const row of extraction.data.rows) {
        if (!row.itemCode) continue;
        for (const [city, sheetValue] of Object.entries(row.prices)) {
          const storedRow = storedByKey.get(`${row.itemCode}|${city}`);
          const dbValue = storedRow ? storedRow[fortnight] : null;
          if (sheetValue === null) {
            // The sheet prints NA or the cell was unreadable — nothing to verify against.
            if (dbValue !== null && dbValue !== undefined) comparison.unreadableCells++;
            continue;
          }
          if (dbValue === null || dbValue === undefined) {
            comparison.sheetOnly.push({ item: row.item, itemCode: row.itemCode, city, sheetValue });
          } else if (Math.abs(Number(dbValue) - sheetValue) > 0.5) {
            comparison.mismatched.push({ item: row.item, itemCode: row.itemCode, city, dbValue: Number(dbValue), sheetValue });
          } else {
            comparison.matched++;
          }
        }
      }
      // Stored values whose sheet cells were never seen at all (item missing from sheet).
      const seenCodes = new Set(extraction.data.rows.filter(r => r.itemCode).map(r => r.itemCode));
      comparison.dbOnly = stored.filter(s => s[fortnight] !== null && !seenCodes.has(s.itemCode)).length;

      results.push({
        fortnight,
        pageIndex: pageIndex + 1,
        priceDate: extraction.data.priceDate,
        sheetMonth: extraction.data.month,
        // A page whose own printed date disagrees with where the rhythm placed it is a
        // mis-assembled document — worth shouting about.
        monthMismatch: !!(extraction.data.month && extraction.data.month !== `${year}-${String(month).padStart(2, '0')}`),
        ...comparison,
      });
    }

    return NextResponse.json({
      year,
      month,
      document: { fileName: doc.fileName, year: doc.year },
      storedRowCount: stored.length,
      fortnights: results,
    });
  } catch (error: any) {
    console.error('[JPC cross-check] failed:', error);
    return NextResponse.json({ error: error?.message || 'Cross-check failed' }, { status: 500 });
  }
}
