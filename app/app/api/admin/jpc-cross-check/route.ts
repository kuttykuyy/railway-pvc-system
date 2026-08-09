import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAccess } from '@/lib/role-auth';
import { prisma } from '@/lib/db';
import { getFileUrl } from '@/lib/s3';
import { extractJpcSheet } from '@/lib/ai/jpc-extractor';
import { PVC_CALCULATION_ITEMS } from '@/lib/jpc-items';
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
 * Only the items the PVC formulas actually read (six item codes across the steel
 * indices). The sheets carry 24 items; comparing all of them buried the two real
 * mismatches under hundreds of "on sheet but not in DB" rows for items nobody uses.
 */
const RELEVANT_CODES = new Set(Object.values(PVC_CALCULATION_ITEMS).flat());

/**
 * POST /api/admin/jpc-cross-check — verify stored JPC rates against the uploaded sheet.
 *
 * Two modes, one per request, both admin-only, both read-only:
 *
 *  ?year&month — for documents that follow the six-pages-per-month rhythm: locate the
 *  month's two fortnight price pages by position and compare each against the DB.
 *
 *  ?year&docId&page — for documents that DON'T fit the rhythm (the 2026 production is
 *  16 pages for 3 months): read ONE page and let it identify ITSELF by its printed
 *  date. A page that is not a 24-item price table says so by matching nothing. The
 *  admin screen walks the pages; the rhythm error names the docId and page count so it
 *  knows how far to walk.
 *
 * Checks and reports; never writes. A mismatch is a question for the admin, not a
 * correction to apply blind.
 */
export async function POST(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) {
    return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });
  }

  const year = parseInt(request.nextUrl.searchParams.get('year') || '', 10);
  const month = parseInt(request.nextUrl.searchParams.get('month') || '', 10);
  const pageParam = parseInt(request.nextUrl.searchParams.get('page') || '', 10);
  const docId = request.nextUrl.searchParams.get('docId');

  if (!year) return NextResponse.json({ error: 'year is required' }, { status: 400 });

  try {
    // The document: by id in scan mode, else the year's newest covering the month.
    const documents = await prisma.labourIndexDocument.findMany({
      where: { componentType: { in: JPC_TYPES }, year },
      orderBy: { createdAt: 'desc' },
    });
    const doc = docId
      ? documents.find(d => d.id === docId)
      : documents.find(d => month && d.months.includes(month)) || documents[0];
    if (!doc) {
      return NextResponse.json({ error: `No JPC document uploaded for ${year}` }, { status: 404 });
    }

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
    const pageCount = source.getPageCount();

    const extractPage = async (pageIndex: number) => {
      const onePage = await PDFDocument.create();
      const [page] = await onePage.copyPages(source, [pageIndex]);
      onePage.addPage(page);
      return extractJpcSheet(Buffer.from(await onePage.save()), `${doc.fileName} p${pageIndex + 1}`);
    };

    /** Compare one extracted price page against the DB for its month, six items only. */
    const compare = async (
      data: NonNullable<Awaited<ReturnType<typeof extractJpcSheet>>['data']>,
      fortnight: 'f1' | 'f2',
      sheetMonthKey: string,
    ) => {
      const [y, m] = sheetMonthKey.split('-').map(Number);
      const stored = await prisma.jpcSteelItem.findMany({
        where: { month: { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) } },
      });
      const storedByKey = new Map(stored.map(s => [`${s.itemCode}|${s.city}`, s]));

      const comparison = { matched: 0, mismatched: [] as any[], sheetOnly: [] as any[], dbOnly: 0, unreadableCells: 0 };
      for (const row of data.rows) {
        if (!row.itemCode || !RELEVANT_CODES.has(row.itemCode)) continue;
        for (const [city, sheetValue] of Object.entries(row.prices)) {
          const storedRow = storedByKey.get(`${row.itemCode}|${city}`);
          const dbValue = storedRow ? storedRow[fortnight] : null;
          if (sheetValue === null) {
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
      const seenCodes = new Set(data.rows.filter(r => r.itemCode).map(r => r.itemCode));
      comparison.dbOnly = stored.filter(s => RELEVANT_CODES.has(s.itemCode) && s[fortnight] !== null && !seenCodes.has(s.itemCode)).length;
      return comparison;
    };

    // ---- Scan mode: one page, self-identifying ----
    if (pageParam) {
      if (pageParam < 1 || pageParam > pageCount) {
        return NextResponse.json({ error: `page must be 1..${pageCount}` }, { status: 400 });
      }
      const extraction = await extractPage(pageParam - 1);
      const data = extraction.ok ? extraction.data : null;
      const matched = data ? data.rows.filter(r => r.itemCode).length : 0;
      // Not a price page (items 25-34, disclaimers) — matched almost nothing.
      if (!data || matched < 8) {
        return NextResponse.json({ page: pageParam, skipped: true, reason: extraction.ok ? 'not a 24-item price page' : (extraction.error || 'unreadable') });
      }
      if (!data.month || !data.fortnight) {
        return NextResponse.json({ page: pageParam, skipped: true, reason: 'price page but its date could not be read' });
      }
      const comparison = await compare(data, data.fortnight, data.month);
      return NextResponse.json({
        page: pageParam,
        month: data.month,
        fortnight: data.fortnight,
        priceDate: data.priceDate,
        ...comparison,
      });
    }

    // ---- Rhythm mode: locate the month's pages by position ----
    if (!month || month < 1 || month > 12) {
      return NextResponse.json({ error: 'month is required (or pass page for scan mode)' }, { status: 400 });
    }
    const docMonths = [...(doc.months || [])].sort((a, b) => a - b);
    const PAGES_PER_MONTH = 6;
    if (docMonths.length === 0 || pageCount !== docMonths.length * PAGES_PER_MONTH) {
      // Not refusal — redirection: tell the screen how to walk this document instead.
      return NextResponse.json({
        error: `The ${year} document has ${pageCount} pages for ${docMonths.length} recorded month(s) — pages will be identified by their own printed dates instead.`,
        scanMode: { docId: doc.id, pageCount },
      }, { status: 422 });
    }
    const monthIdx = docMonths.indexOf(month);
    if (monthIdx === -1) {
      return NextResponse.json({ error: `The ${year} document does not cover month ${month}` }, { status: 404 });
    }

    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const results: any[] = [];
    for (const fortnight of ['f1', 'f2'] as const) {
      const pageIndex = monthIdx * PAGES_PER_MONTH + (fortnight === 'f1' ? 0 : 3);
      const extraction = await extractPage(pageIndex);
      if (!extraction.ok || !extraction.data) {
        results.push({ fortnight, pageIndex: pageIndex + 1, error: extraction.error || 'unreadable' });
        continue;
      }
      const comparison = await compare(extraction.data, fortnight, monthKey);
      results.push({
        fortnight,
        pageIndex: pageIndex + 1,
        priceDate: extraction.data.priceDate,
        sheetMonth: extraction.data.month,
        monthMismatch: !!(extraction.data.month && extraction.data.month !== monthKey),
        ...comparison,
      });
    }

    return NextResponse.json({
      year,
      month,
      document: { fileName: doc.fileName, year: doc.year },
      fortnights: results,
    });
  } catch (error: any) {
    console.error('[JPC cross-check] failed:', error);
    return NextResponse.json({ error: error?.message || 'Cross-check failed' }, { status: 500 });
  }
}
