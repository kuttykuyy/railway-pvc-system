import { prisma } from './db';

export interface DbRateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
  retryAfterSeconds: number;
}

/**
 * Distributed rate limiter backed by Postgres.
 *
 * Unlike the in-memory limiter (`lib/rate-limiter.ts`), this shares state across all
 * serverless instances, so a limit of N per window is enforced globally.
 *
 * It uses Prisma's model API (schema-aware, so it works through Supabase's connection
 * pooler where a raw unqualified table name would not resolve). Within a live window the
 * counter is bumped with an atomic `{ increment: 1 }` update, so concurrent requests are
 * each counted. At the exact window-reset boundary a few extra requests may slip through,
 * which is acceptable for rate limiting.
 *
 * Fail-open: if the DB call errors, the request is allowed (a limiter outage must not take
 * down auth/payments). Errors are logged.
 */
export async function checkDbRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<DbRateLimitResult> {
  const now = new Date();
  const newWindowEnd = new Date(now.getTime() + windowMs);
  const ok = (count: number, resetAt: Date): DbRateLimitResult => {
    const allowed = count <= limit;
    return {
      allowed,
      remaining: Math.max(0, limit - count),
      limit,
      resetAt,
      retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000)),
    };
  };

  try {
    const existing = await prisma.rateLimit.findUnique({ where: { key } });

    // Live window: atomically increment the counter.
    if (existing && existing.windowEnd > now) {
      const updated = await prisma.rateLimit.update({
        where: { key },
        data: { count: { increment: 1 } },
      });
      return ok(updated.count, updated.windowEnd);
    }

    // Missing or expired window: start a fresh window at count 1.
    const reset = await prisma.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, windowEnd: newWindowEnd },
      update: { count: 1, windowEnd: newWindowEnd },
    });
    return ok(reset.count, reset.windowEnd);
  } catch (error) {
    console.error('[rate-limit-db] limiter error (failing open):', error);
    return { allowed: true, remaining: limit, limit, resetAt: newWindowEnd, retryAfterSeconds: 0 };
  }
}
