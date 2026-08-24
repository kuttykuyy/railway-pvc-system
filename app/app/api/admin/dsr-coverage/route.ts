import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { schemaQualified } from '@/lib/db-schema';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Can we actually build a "what do contractors quote against each DSR item" report?
 *
 * Read-only, and deliberately built before the report rather than after. The report
 * needs three things to line up on the same row: an item number that IS a DSR code, an
 * agreement rate against it, and a published DSR rate for that code to compare with. If
 * any one of those is thin, the report is a chart of nothing, and it is much cheaper to
 * find that out from a query than from a finished screen.
 *
 * It also prints the most common item numbers verbatim. That is the diagnostic that
 * matters most: the schema's own example is "1130 10 (G)", which is a railway schedule
 * number, not a CPWD DSR code like "5.22.6". If the real data looks like the former,
 * there is nothing to join to and the answer is "not from this data".
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

/** Same shape on both sides of the join: case, and nothing but digits, letters and dots. */
const NORM = (col: string) => `upper(regexp_replace(${col}, '[^0-9A-Za-z.]', '', 'g'))`;

const num = (value: unknown) => Number(value ?? 0);

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const entries = await schemaQualified('bill_classification_entries');
    const dsr = await schemaQualified('dsr_items');
    const bills = await schemaQualified('bills');
    const contracts = await schemaQualified('contracts');

    // ── What is in dsr_items at all ──────────────────────────────────────────────
    const [dsrSummary] = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT COUNT(*) AS rows,
              COUNT(DISTINCT "edition") AS editions,
              COUNT(*) FILTER (WHERE "rate" IS NOT NULL AND "rate" > 0) AS with_rate
       FROM ${dsr}`);

    const editions = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT "edition", COUNT(*) AS codes,
              COUNT(*) FILTER (WHERE "rate" IS NOT NULL AND "rate" > 0) AS with_rate
       FROM ${dsr} GROUP BY "edition" ORDER BY "edition"`);

    // ── The entry level: one item number per classification entry ────────────────
    const [entrySummary] = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT COUNT(*) AS entries,
              COUNT(*) FILTER (WHERE "itemNumber" IS NOT NULL AND btrim("itemNumber") <> '') AS with_item_number,
              COUNT(*) FILTER (WHERE "agreementRate" IS NOT NULL AND "agreementRate" > 0) AS with_rate,
              COUNT(*) FILTER (WHERE "itemNumber" IS NOT NULL AND btrim("itemNumber") <> ''
                               AND "agreementRate" IS NOT NULL AND "agreementRate" > 0) AS with_both
       FROM ${entries}`);

    // How many of those item numbers are a code dsr_items actually knows.
    const [entryMatch] = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT COUNT(*) AS matched,
              COUNT(*) FILTER (WHERE e."agreementRate" IS NOT NULL AND e."agreementRate" > 0) AS matched_with_rate
       FROM ${entries} e
       WHERE EXISTS (
         SELECT 1 FROM ${dsr} d
         WHERE ${NORM('d."code"')} = ${NORM('e."itemNumber"')}
           AND d."rate" IS NOT NULL AND d."rate" > 0
       )`);

    // ── The row level: itemRows holds the per-item detail on merged entries ──────
    const [rowSummary] = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT COUNT(*) AS rows,
              COUNT(*) FILTER (WHERE btrim(COALESCE(r->>'itemNumber', '')) <> '') AS with_item_number,
              COUNT(*) FILTER (WHERE (r->>'agreementRate') ~ '^[0-9.]+$'
                               AND (r->>'agreementRate')::numeric > 0) AS with_rate
       FROM ${entries} e, jsonb_array_elements(e."itemRows") r
       WHERE jsonb_typeof(e."itemRows") = 'array'`);

    const [rowMatch] = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT COUNT(*) AS matched
       FROM ${entries} e, jsonb_array_elements(e."itemRows") r
       WHERE jsonb_typeof(e."itemRows") = 'array'
         AND EXISTS (
           SELECT 1 FROM ${dsr} d
           WHERE ${NORM('d."code"')} = ${NORM("COALESCE(r->>'itemNumber', '')")}
             AND d."rate" IS NOT NULL AND d."rate" > 0
         )`);

    // ── What the item numbers actually LOOK like ─────────────────────────────────
    // The most useful output on this page. A join that returns nothing is explained by
    // this list, not by the counts above.
    const commonItemNumbers = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT "itemNumber" AS item_number, COUNT(*) AS uses,
              EXISTS (SELECT 1 FROM ${dsr} d
                      WHERE ${NORM('d."code"')} = ${NORM('e."itemNumber"')}) AS in_dsr
       FROM ${entries} e
       WHERE "itemNumber" IS NOT NULL AND btrim("itemNumber") <> ''
       GROUP BY "itemNumber" ORDER BY COUNT(*) DESC LIMIT 40`);

    // ── If it IS viable: how much of it, per zone ────────────────────────────────
    const byZone = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT COALESCE(b."zone", 'unknown') AS zone,
              COUNT(*) AS quotable_items,
              COUNT(DISTINCT c."id") AS contracts
       FROM ${entries} e
       JOIN ${bills} b ON b."id" = e."billId"
       JOIN ${contracts} c ON c."id" = b."contractId"
       WHERE e."agreementRate" IS NOT NULL AND e."agreementRate" > 0
         AND EXISTS (
           SELECT 1 FROM ${dsr} d
           WHERE ${NORM('d."code"')} = ${NORM('e."itemNumber"')}
             AND d."rate" IS NOT NULL AND d."rate" > 0
         )
       GROUP BY 1 ORDER BY 2 DESC`);

    const matchedWithRate = num(entryMatch?.matched_with_rate) + num(rowMatch?.matched);
    const withRate = num(entrySummary?.with_rate) + num(rowSummary?.with_rate);

    return NextResponse.json({
      dsrCatalogue: {
        codes: num(dsrSummary?.rows),
        editions: num(dsrSummary?.editions),
        codesWithARate: num(dsrSummary?.with_rate),
        perEdition: editions.map(e => ({
          edition: e.edition, codes: num(e.codes), withRate: num(e.with_rate),
        })),
      },
      billItems: {
        entries: num(entrySummary?.entries),
        entriesWithItemNumber: num(entrySummary?.with_item_number),
        entriesWithAgreementRate: num(entrySummary?.with_rate),
        entriesWithBoth: num(entrySummary?.with_both),
        entriesMatchingADsrCode: num(entryMatch?.matched),
        entriesMatchingAndPriced: num(entryMatch?.matched_with_rate),
        itemRows: num(rowSummary?.rows),
        itemRowsWithItemNumber: num(rowSummary?.with_item_number),
        itemRowsWithAgreementRate: num(rowSummary?.with_rate),
        itemRowsMatchingADsrCode: num(rowMatch?.matched),
      },
      quotableByZone: byZone.map(z => ({
        zone: z.zone, items: num(z.quotable_items), contracts: num(z.contracts),
      })),
      commonItemNumbers: commonItemNumbers.map(r => ({
        itemNumber: r.item_number, uses: num(r.uses), inDsr: r.in_dsr === true,
      })),
      verdict: matchedWithRate === 0
        ? 'Nothing to build on: not one bill item number matches a DSR code that has a rate. '
          + 'Look at commonItemNumbers — if those are railway schedule numbers rather than '
          + 'DSR codes, this report cannot come from this data as it stands.'
        : `${matchedWithRate} priced bill item(s) match a DSR code with a rate, out of `
          + `${withRate} priced items in total. Whether that is enough depends on how many `
          + 'distinct codes and zones they spread across — see quotableByZone.',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'The coverage check failed' },
      { status: 500 },
    );
  }
}
