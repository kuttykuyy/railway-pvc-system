import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { schemaQualified } from '@/lib/db-schema';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * How far above (or below) the DSR par rate do contractors actually quote?
 *
 * Contractors in different zones bid differently to win a tender, and the practical
 * question is the cost difference against the schedule (DSR/USSOR) rate for the same
 * item. This compares every priced item the app holds to the book rate for its code and
 * reports that difference three ways: by zone, by contractor, and by DSR item — plus,
 * for one item code, every individual quote behind the averages.
 *
 * The join and edition inference mirror the quote-spread check (which studies whether
 * the numbers are one-per-tender or item-by-item); here the numbers are turned into the
 * cost-difference answer. A ratio of quoted ÷ book; the percentage is (ratio − 1) × 100.
 *
 * Read-only.
 */

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, status: 401, error: 'Unauthorized' };
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });
  if (user?.role !== 'admin' && user?.role !== 'superadmin') {
    return { ok: false as const, status: 403, error: 'Admin access required' };
  }
  return { ok: true as const };
}

const NORM = (col: string) => `upper(regexp_replace(${col}, '[^0-9A-Za-z.]', '', 'g'))`;
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // Which CPWD edition a dotted code is priced against, decided by when the tender
  // opened when the bill did not name the book. Overridable so its effect is visible.
  const cutoff = request.nextUrl.searchParams.get('dsr2023From') || '2023-07-01';
  // When present, also return every individual quote for this one item code.
  const codeParam = (request.nextUrl.searchParams.get('code') || '').trim();

  try {
    const entries = await schemaQualified('bill_classification_entries');
    const dsr = await schemaQualified('dsr_items');
    const bills = await schemaQualified('bills');
    const contracts = await schemaQualified('contracts');

    // Every priced item joined to its book rate, deduped to one row per
    // (contract, code, quoted rate) so a code repeated across running bills counts once.
    // Same shape as the quote-spread check, with the contractor name carried through so
    // the difference can be grouped by who quoted it.
    const base = `
      WITH items AS (
        SELECT e."billId" AS bill_id, e."itemNumber" AS code, e."agreementRate"::numeric AS rate,
               NULL::text AS stored_edition
        FROM ${entries} e
        WHERE e."agreementRate" IS NOT NULL AND e."agreementRate" > 0
          AND btrim(COALESCE(e."itemNumber", '')) <> ''
        UNION ALL
        SELECT e."billId", r->>'itemNumber', (r->>'agreementRate')::numeric,
               NULLIF(btrim(COALESCE(r->>'rateBookEdition', '')), '')
        FROM ${entries} e, jsonb_array_elements(e."itemRows") r
        WHERE jsonb_typeof(e."itemRows") = 'array'
          AND btrim(COALESCE(r->>'itemNumber', '')) <> ''
          AND (r->>'agreementRate') ~ '^[0-9]+(\\.[0-9]+)?$'
          AND (r->>'agreementRate')::numeric > 0
      ),
      priced AS (
        SELECT c."id" AS contract_id,
               c."agreementNo" AS agreement_no,
               COALESCE(NULLIF(btrim(c."contractorName"), ''), 'Unknown') AS contractor,
               COALESCE(b."zone", 'unknown') AS zone,
               i.code,
               i.rate,
               COALESCE(i.stored_edition,
                 CASE
                   WHEN regexp_replace(i.code, '[^0-9]', '', 'g') ~ '^[0-9]{6}$'
                        AND i.code !~ '\\.' THEN 'USSOR 2021'
                   WHEN c."dateOfOpening" >= '${cutoff}'::date THEN 'DSR 2023'
                   ELSE 'DSR 2021'
                 END) AS edition
        FROM items i
        JOIN ${bills} b ON b."id" = i.bill_id
        JOIN ${contracts} c ON c."id" = b."contractId"
      ),
      deduped AS (
        SELECT DISTINCT contract_id, agreement_no, contractor, zone, code, rate, edition
        FROM priced
      ),
      matched AS (
        SELECT p.*, d."rate"::numeric AS book_rate, p.rate / d."rate"::numeric AS ratio
        FROM deduped p
        JOIN ${dsr} d
          ON d."edition" = p.edition
         AND ${NORM('d."code"')} = ${NORM('p.code')}
        WHERE d."rate" IS NOT NULL AND d."rate" > 0
      )`;

    // One item code asked for: return every quote behind it, no aggregation.
    if (codeParam) {
      const detail = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `${base}
         SELECT agreement_no, contractor, zone, edition, rate AS quoted, book_rate, ratio
         FROM matched
         WHERE ${NORM('code')} = ${NORM('$1')}
         ORDER BY ratio`,
        codeParam);
      return NextResponse.json({
        code: codeParam,
        assumedDsr2023From: cutoff,
        itemDetail: detail.map(d => ({
          agreementNo: d.agreement_no,
          contractor: d.contractor,
          zone: d.zone,
          edition: d.edition,
          quoted: n(d.quoted),
          dsrRate: n(d.book_rate),
          ratio: n(d.ratio),
        })),
      });
    }

    // ── Overall ──────────────────────────────────────────────────────────────────
    const [overall] = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `${base}
       SELECT COUNT(*) AS items, COUNT(DISTINCT contract_id) AS contracts,
              percentile_cont(0.25) WITHIN GROUP (ORDER BY ratio) AS p25,
              percentile_cont(0.5)  WITHIN GROUP (ORDER BY ratio) AS median,
              percentile_cont(0.75) WITHIN GROUP (ORDER BY ratio) AS p75
       FROM matched`);

    // ── By zone ──────────────────────────────────────────────────────────────────
    const byZone = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `${base}
       SELECT zone,
              COUNT(*) AS items,
              COUNT(DISTINCT contract_id) AS contracts,
              percentile_cont(0.25) WITHIN GROUP (ORDER BY ratio) AS p25,
              percentile_cont(0.5)  WITHIN GROUP (ORDER BY ratio) AS median,
              percentile_cont(0.75) WITHIN GROUP (ORDER BY ratio) AS p75
       FROM matched GROUP BY zone ORDER BY COUNT(*) DESC`);

    // ── By contractor ────────────────────────────────────────────────────────────
    const byContractor = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `${base}
       SELECT contractor,
              array_agg(DISTINCT zone) AS zones,
              COUNT(*) AS items,
              COUNT(DISTINCT contract_id) AS tenders,
              min(ratio) AS min_ratio,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY ratio) AS median,
              max(ratio) AS max_ratio
       FROM matched GROUP BY contractor ORDER BY COUNT(*) DESC`);

    // ── By DSR item ──────────────────────────────────────────────────────────────
    // The book rate is one value per (edition, code), so max() just reads it back.
    const byItem = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `${base}
       SELECT code, edition,
              max(book_rate) AS dsr_rate,
              COUNT(*) AS quotes,
              COUNT(DISTINCT contract_id) AS tenders,
              min(ratio) AS min_ratio,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY ratio) AS median,
              max(ratio) AS max_ratio,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY rate) AS median_quoted
       FROM matched
       GROUP BY code, edition
       ORDER BY COUNT(*) DESC
       LIMIT 500`);

    return NextResponse.json({
      assumedDsr2023From: cutoff,
      overall: {
        items: Number(overall?.items ?? 0),
        contracts: Number(overall?.contracts ?? 0),
        p25Ratio: n(overall?.p25),
        medianRatio: n(overall?.median),
        p75Ratio: n(overall?.p75),
      },
      byZone: byZone.map(z => ({
        zone: z.zone,
        items: Number(z.items),
        contracts: Number(z.contracts),
        p25Ratio: n(z.p25),
        medianRatio: n(z.median),
        p75Ratio: n(z.p75),
      })),
      byContractor: byContractor.map(c => ({
        contractor: c.contractor,
        zones: Array.isArray(c.zones) ? (c.zones as unknown[]).map(String) : [],
        items: Number(c.items),
        tenders: Number(c.tenders),
        minRatio: n(c.min_ratio),
        medianRatio: n(c.median),
        maxRatio: n(c.max_ratio),
      })),
      byItem: byItem.map(it => ({
        code: it.code,
        edition: it.edition,
        dsrRate: n(it.dsr_rate),
        quotes: Number(it.quotes),
        tenders: Number(it.tenders),
        minRatio: n(it.min_ratio),
        medianRatio: n(it.median),
        maxRatio: n(it.max_ratio),
        medianQuoted: n(it.median_quoted),
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'The cost-difference check failed' },
      { status: 500 },
    );
  }
}
