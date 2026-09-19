import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAccess } from '@/lib/role-auth';
import { reportClassificationCorrections } from '@/lib/classification-corrections';

export const dynamic = 'force-dynamic';

/**
 * GET — which classifications people keep correcting, worst first.
 *
 * The app's own accuracy, measured from real bills rather than guessed at. See
 * lib/classification-corrections.ts.
 */
export async function GET(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });

  try {
    const limit = Number(new URL(request.url).searchParams.get('limit')) || 25;
    return NextResponse.json(await reportClassificationCorrections(Math.min(Math.max(limit, 1), 100)));
  } catch (error: any) {
    console.error('classification corrections report failed:', error);
    return NextResponse.json({ error: error?.message || 'Report failed' }, { status: 500 });
  }
}
