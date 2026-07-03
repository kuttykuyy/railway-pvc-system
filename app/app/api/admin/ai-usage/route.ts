import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAccess } from '@/lib/role-auth';
import { getAiUsageSummary, checkAiProviderStatus } from '@/lib/ai-usage';

export const dynamic = 'force-dynamic';

/** GET /api/admin/ai-usage — AI consumption summary for the admin dashboard. */
export async function GET(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) {
    return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });
  }
  try {
    const usage = await getAiUsageSummary();
    return NextResponse.json({ usage });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load AI usage' }, { status: 500 });
  }
}

/**
 * POST /api/admin/ai-usage — on-demand live status probe of the AI provider.
 * Kept off the GET path so a plain page load never spends provider credit.
 */
export async function POST(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) {
    return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });
  }
  const status = await checkAiProviderStatus();
  return NextResponse.json({ status });
}
