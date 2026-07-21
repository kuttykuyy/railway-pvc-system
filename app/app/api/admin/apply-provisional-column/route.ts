import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateAdminAccess } from '@/lib/admin-middleware';

export const dynamic = 'force-dynamic';

/**
 * One-time, admin-only helper to add the `usedProvisionalIndices` column to the
 * `pvc_calculations` table on whichever database this deployment is connected to.
 *
 * Safe to run more than once — uses ADD COLUMN IF NOT EXISTS. Remove this route once
 * the column is confirmed present in production.
 *
 * Visit (while logged in as an admin):  /api/admin/apply-provisional-column
 */
async function run(request: NextRequest) {
  const auth = await validateAdminAccess(request);
  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: auth.message || 'Admin access required' }, { status: 403 });
  }

  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "pvc_calculations" ADD COLUMN IF NOT EXISTS "usedProvisionalIndices" BOOLEAN NOT NULL DEFAULT false;'
    );

    // Confirm it now exists so the response is trustworthy.
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'pvc_calculations' AND column_name = 'usedProvisionalIndices';`
    );
    const present = Array.isArray(rows) && rows.length > 0;

    return NextResponse.json({
      ok: present,
      message: present
        ? 'Done. The "usedProvisionalIndices" column is present. You can refresh the site now.'
        : 'The command ran but the column was not found — please tell Claude.',
    });
  } catch (error) {
    console.error('apply-provisional-column error:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Failed to apply column' },
      { status: 500 }
    );
  }
}

// GET so an admin can trigger it by simply visiting the URL in a browser.
export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
