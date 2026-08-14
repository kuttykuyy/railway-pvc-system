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
 */
const schemaCache = new Map<string, string>();

export async function schemaQualified(table: string): Promise<string> {
  const cached = schemaCache.get(table);
  if (cached) return cached;
  const rows = await prisma.$queryRaw<Array<{ table_schema: string }>>`
    SELECT table_schema FROM information_schema.tables WHERE table_name = ${table} LIMIT 1`;
  const schema = rows[0]?.table_schema;
  if (!schema) throw new Error(`Table not found in any schema: ${table}`);
  // Quoted identifiers built only from information_schema's own answer.
  const qualified = `"${schema.replace(/"/g, '')}"."${table.replace(/"/g, '')}"`;
  schemaCache.set(table, qualified);
  return qualified;
}
