import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateAdminAccess } from '@/lib/role-auth';

export const dynamic = 'force-dynamic';

/**
 * TEMPORARY one-shot migration helper — DELETE THIS ROUTE once the column exists.
 *
 * Adds Contract.rebatePercentage to the live database using the server's own
 * DATABASE_URL. Needed because the production connection string is marked
 * "Sensitive" in Vercel and cannot be read locally, so `prisma migrate deploy`
 * can't be run from a laptop.
 *
 * Safe by design:
 *  - additive, nullable column — no existing data is read, changed or dropped
 *  - IF NOT EXISTS — running it twice is a no-op
 *  - admin-only
 */
export async function GET(request: NextRequest) {
  try {
    const { authorized, message } = await validateAdminAccess(request);
    if (!authorized) {
      return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });
    }

    await prisma.$executeRawUnsafe(
      'ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "rebatePercentage" DOUBLE PRECISION;',
    );

    const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'contracts' AND column_name = 'rebatePercentage'`,
    );

    const done = rows.length > 0;
    return NextResponse.json({
      ok: done,
      message: done
        ? 'Done — contracts.rebatePercentage now exists. You can save contracts with a rebate.'
        : 'The column is still missing. Check the server logs.',
      note: 'Temporary helper. Safe to run again. Ask Claude to remove this route now that it has run.',
    });
  } catch (error: any) {
    console.error('migrate-rebate-column failed:', error);
    return NextResponse.json({ error: error?.message || 'Migration failed' }, { status: 500 });
  }
}
