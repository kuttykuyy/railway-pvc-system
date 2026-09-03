import { prisma } from './db';
import { schemaQualified } from './db-schema';

/**
 * Where signed-in people go, one row per page they land on.
 *
 * The signup funnel needs to answer "they signed up — then what?", and until now the
 * database could only say what a person had CREATED. Someone who verified their email,
 * opened the Create Bill page, and never came back left no trace at all. This records
 * the page, not the click: enough to see where a new user stalled, and nothing more.
 *
 * Best-effort, like parse_failures: a failure to record must never touch the page load.
 */
export async function recordPageView(userId: string, path: string): Promise<void> {
  const clean = String(path || '').split('?')[0].slice(0, 200);
  if (!clean.startsWith('/')) return;
  try {
    const table = await schemaQualified('page_views');
    await prisma.$executeRawUnsafe(
      `INSERT INTO ${table} ("userId", "path") VALUES ($1, $2)`,
      userId,
      clean,
    );
  } catch (err) {
    console.error('page-views: could not store (table not applied yet?):', err);
  }
}
