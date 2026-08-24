import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { schemaQualified } from '@/lib/db-schema';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * How does a contractor's quoted rate relate to the schedule rate — and is that one
 * decision per tender, or one per item?
 *
 * This is the question that decides whether a "quoted rates by zone" report can say
 * anything. In a PERCENTAGE-RATE tender the contractor quotes a single figure for the
 * whole work, so a contract with 184 priced items is ONE observation wearing 184 hats,
 * and "SER quotes 18% above" built from two such tenders is a statement about two
 * companies. In an ITEM-RATE tender each item is quoted on its own and 184 really is
 * 184.
 *
 * The data answers it directly: if every item in a contract shares the same
 * quoted ÷ schedule ratio, it is a percentage tender. If they scatter, it is item-rate.
 *
 * The ratios are also a check on the join itself. A contract coming out at 3.0 is not a
 * contractor bidding 200% above — it is the wrong edition, the wrong code, or a rate in
 * different units.
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
  // opened. The bill's schedule heading names the book (lib/rate-book-lookup.ts reads
  // it while parsing) but that answer is not stored, so for bills already saved this is
  // the inference available. Overridable, so its effect can be seen rather than assumed.
  const cutoff = request.nextUrl.searchParams.get('dsr2023From') || '2023-07-01';

  try {
    const entries = await schemaQualified('bill_classification_entries');
    const dsr = await schemaQualified('dsr_items');
    const bills = await schemaQualified('bills');
    const contracts = await schemaQualified('contracts');

    // Every priced item with a code, from both places they live: the entry itself, and
    // the itemRows a merged entry keeps its per-item detail in.
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
               c."dateOfOpening" AS opened,
               COALESCE(b."zone", 'unknown') AS zone,
               i.code,
               i.rate,
               -- The book the bill itself named, when the row kept it. Guess only when
               -- it did not: on a DSR code the guess is worth a median 16%.
               COALESCE(i.stored_edition,
                 CASE
                   WHEN regexp_replace(i.code, '[^0-9]', '', 'g') ~ '^[0-9]{6}$'
                        AND i.code !~ '\\.' THEN 'USSOR 2021'
                   WHEN c."dateOfOpening" >= '${cutoff}'::date THEN 'DSR 2023'
                   ELSE 'DSR 2021'
                 END) AS edition,
               (i.stored_edition IS NOT NULL) AS edition_known
        FROM items i
        JOIN ${bills} b ON b."id" = i.bill_id
        JOIN ${contracts} c ON c."id" = b."contractId"
      ),
      -- ONE ROW PER (contract, code, quoted rate).
      --
      -- Without this a single item counts once for every running bill it appears in —
      -- the first run showed the same code at the same rate eight times over. That
      -- inflates every count, and worse, makes one repeated item look like agreement
      -- between many. Two genuinely different rates for one code in one contract (two
      -- schedules, two sub-works) still survive as two rows, which is right.
      deduped AS (
        SELECT DISTINCT contract_id, agreement_no, opened, zone, code, rate, edition, edition_known
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

    // ── Per contract: is the ratio one decision or many? ─────────────────────────
    const perContract = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `${base}
       SELECT agreement_no, zone, opened, edition,
              bool_and(edition_known) AS edition_from_bill,
              COUNT(*) AS items,
              COUNT(DISTINCT round(ratio, 4)) AS distinct_ratios,
              min(ratio) AS min_ratio,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY ratio) AS median_ratio,
              max(ratio) AS max_ratio,
              avg(ratio) AS mean_ratio,
              stddev_pop(ratio) AS sd_ratio
       FROM matched
       GROUP BY agreement_no, zone, opened, edition
       ORDER BY COUNT(*) DESC`);
    // Note: items are now DISTINCT (contract, code, rate) — see the deduped CTE.

    // ── Per zone, counting every matched item ───────────────────────────────────
    const perZone = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `${base}
       SELECT zone,
              COUNT(*) AS items,
              COUNT(DISTINCT contract_id) AS contracts,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY ratio) AS median_ratio,
              percentile_cont(0.25) WITHIN GROUP (ORDER BY ratio) AS p25_ratio,
              percentile_cont(0.75) WITHIN GROUP (ORDER BY ratio) AS p75_ratio
       FROM matched GROUP BY zone ORDER BY COUNT(*) DESC`);

    // ── The extremes, to eyeball a bad join ─────────────────────────────────────
    const outliers = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `${base}
       SELECT agreement_no, zone, code, edition, rate AS quoted, book_rate, ratio
       FROM matched
       WHERE ratio < 0.4 OR ratio > 3
       ORDER BY abs(ln(ratio)) DESC LIMIT 25`);

    // ── How much the edition guess actually matters ─────────────────────────────
    // Codes priced differently in DSR 2021 and DSR 2023: the size of what the cutoff
    // above is deciding. If this is small, the inference barely matters.
    const [editionRisk] = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT COUNT(*) AS codes_in_both,
              COUNT(*) FILTER (WHERE abs(a."rate" - b."rate") / NULLIF(b."rate", 0) > 0.02) AS differ_over_2pct,
              percentile_cont(0.5) WITHIN GROUP (
                ORDER BY abs(a."rate" - b."rate") / NULLIF(b."rate", 0)
              ) AS median_gap
       FROM ${dsr} a
       JOIN ${dsr} b ON b."code" = a."code" AND b."edition" = 'DSR 2021'
       WHERE a."edition" = 'DSR 2023' AND a."rate" > 0 AND b."rate" > 0`);

    const contracts_ = perContract.map(c => {
      const items = Number(c.items);
      const mean = n(c.mean_ratio) ?? 0;
      const sd = n(c.sd_ratio) ?? 0;
      // Coefficient of variation: how much the ratios move relative to their own size.
      // One quoted percentage for the whole tender lands every item on the same ratio,
      // so this sits at zero. Items quoted one by one scatter.
      const cv = mean > 0 ? sd / mean : 0;
      return {
        agreementNo: c.agreement_no,
        zone: c.zone,
        opened: c.opened,
        edition: c.edition,
        /** True when the bill named the book; false when the opening date guessed it. */
        editionFromBill: c.edition_from_bill === true,
        items,
        distinctRatios: Number(c.distinct_ratios),
        minRatio: n(c.min_ratio),
        medianRatio: n(c.median_ratio),
        maxRatio: n(c.max_ratio),
        spread: Number(cv.toFixed(4)),
        looksLike: items < 3 ? 'too few items to say'
          : cv < 0.005 ? 'one percentage for the whole tender'
          : cv < 0.05 ? 'nearly one percentage (rounding or a few exceptions)'
          : 'quoted item by item',
      };
    });

    const decisive = contracts_.filter(c => c.items >= 3);
    const percentageTenders = decisive.filter(c => c.looksLike.startsWith('one percentage')).length;

    return NextResponse.json({
      assumedDsr2023From: cutoff,
      contracts: contracts_,
      byZone: perZone.map(z => ({
        zone: z.zone,
        items: Number(z.items),
        contracts: Number(z.contracts),
        p25Ratio: n(z.p25_ratio),
        medianRatio: n(z.median_ratio),
        p75Ratio: n(z.p75_ratio),
      })),
      suspiciousRatios: outliers.map(o => ({
        agreementNo: o.agreement_no, zone: o.zone, code: o.code, edition: o.edition,
        quoted: n(o.quoted), bookRate: n(o.book_rate), ratio: n(o.ratio),
      })),
      editionAmbiguity: {
        codesInBothDsrEditions: Number(editionRisk?.codes_in_both ?? 0),
        differByOver2Percent: Number(editionRisk?.differ_over_2pct ?? 0),
        medianGap: n(editionRisk?.median_gap),
        note: 'How much the DSR 2021 / DSR 2023 guess is deciding. A small gap means the '
          + 'cutoff above barely matters; a large one means the edition must be stored, '
          + 'not inferred.',
      },
      verdict: decisive.length === 0
        ? 'No contract has enough matched items to tell.'
        : `${percentageTenders} of ${decisive.length} contracts look like a single quoted `
          + 'percentage for the whole tender. Where that is so, the honest sample size is '
          + 'the number of TENDERS, not the number of items.',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'The spread check failed' },
      { status: 500 },
    );
  }
}
