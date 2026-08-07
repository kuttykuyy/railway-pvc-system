import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAccess } from '@/lib/role-auth';
import { auditClassificationPercentages, restoreClassificationPercentages } from '@/lib/classification-audit';

export const dynamic = 'force-dynamic';

/**
 * GET  — compare the live component percentages against the GCC 46A.6 table.
 * POST — put drifted rows back to the GCC figures (optionally only the codes given).
 *
 * These percentages decide every PVC the app computes, so drift here is silent and
 * expensive. See lib/classification-audit.ts.
 */
export async function GET(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });

  try {
    return NextResponse.json(await auditClassificationPercentages());
  } catch (error: any) {
    console.error('classification audit failed:', error);
    return NextResponse.json({ error: error?.message || 'Audit failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });

  try {
    const body = await request.json().catch(() => ({}));
    const codes = Array.isArray(body.codes) ? body.codes.map(String) : undefined;
    const { repaired } = await restoreClassificationPercentages(codes);
    const audit = await auditClassificationPercentages();
    return NextResponse.json({
      success: true,
      repaired,
      audit,
      message: repaired.length
        ? `Restored ${repaired.length} classification(s) to the GCC figures: ${repaired.map(r => r.code).join(', ')}.`
        : 'Nothing needed restoring.',
    });
  } catch (error: any) {
    console.error('classification restore failed:', error);
    return NextResponse.json({ error: error?.message || 'Restore failed' }, { status: 500 });
  }
}
