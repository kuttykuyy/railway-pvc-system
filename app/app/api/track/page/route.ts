import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { recordPageView } from '@/lib/page-views';

export const dynamic = 'force-dynamic';

/** A signed-in browser reporting the page it just opened. Anonymous visits are ignored. */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return new NextResponse(null, { status: 204 });
  const body = await request.json().catch(() => ({}));
  const path = String(body?.path || '');
  // Admin screens are the team's own footsteps, not a customer's journey.
  if (!path.startsWith('/') || path.startsWith('/admin') || path.startsWith('/api')) {
    return new NextResponse(null, { status: 204 });
  }
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (user) await recordPageView(user.id, path);
  return new NextResponse(null, { status: 204 });
}
