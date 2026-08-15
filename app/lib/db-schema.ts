import { prisma } from './db';

/**
 * Where a table actually lives, asked of the database itself.
 *
 * Raw SQL here cannot assume a schema. Prisma's own queries always find the tables —
 * it qualifies them with the schema from the connection string — but a raw query is
 * sent verbatim, and under a transaction-pooled connection the search path is whatever
 * the pooled session last had. Unqualified names failed intermittently and a hardcoded
 * "public" failed outright, which is how the tables were discovered not to live there.
 * information_schema answers regardless of search path; the answer is cached because a
 * table does not move.
 *
 * When the same table name exists in MORE THAN ONE schema (a stale "public"."User"
 * survives beside the real one), first-row-wins picked whichever the database listed
 * first. The choice is now ordered: the schema named in DATABASE_URL (what Prisma
 * itself uses), then any non-public schema, then public last — so a stale public
 * leftover can never shadow the live table.
 */
const schemaCache = new Map<string, string>();

function connectionSchema(): string {
  try {
    const url = new URL(process.env.DATABASE_URL || '');
    return url.searchParams.get('schema') || '';
  } catch {
    return '';
  }
}

/** The bare schema name a table lives in (e.g. "railway_pvc"). */
export async function tableSchema(table: string): Promise<string> {
  const cached = schemaCache.get(table);
  if (cached) return cached;
  const preferred = connectionSchema();
  const rows = await prisma.$queryRaw<Array<{ table_schema: string }>>`
    SELECT table_schema FROM information_schema.tables
    WHERE table_name = ${table}
    ORDER BY CASE
      WHEN table_schema = ${preferred} THEN 0
      WHEN table_schema NOT IN ('public', 'pg_catalog', 'information_schema') THEN 1
      ELSE 2
    END
    LIMIT 1`;
  const schema = rows[0]?.table_schema;
  if (!schema) throw new Error(`Table not found in any schema: ${table}`);
  const bare = schema.replace(/"/g, '');
  schemaCache.set(table, bare);
  return bare;
}

/** The table as a fully qualified, quoted identifier: "schema"."table". */
export async function schemaQualified(table: string): Promise<string> {
  const schema = await tableSchema(table);
  return `"${schema}"."${table.replace(/"/g, '')}"`;
}
