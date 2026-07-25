/**
 * Admin-only: identify WHICH database this deployment is connected to.
 *
 * Vercel keeps DATABASE_URL sensitive, so it can't be read back — which makes it
 * hard to tell which Neon project is actually production. This reports the host,
 * database name and user so the right project can be found in the Neon console.
 *
 * The password is never returned. This deliberately does not expose the connection
 * string: knowing the host is enough to identify the project, and the credential
 * itself belongs in the Neon dashboard, not in an HTTP response.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Host / db / user from a connection string, never the password. */
function describe(raw: string | undefined) {
  if (!raw) return { configured: false };
  try {
    const u = new URL(raw);
    return {
      configured: true,
      host: u.hostname,
      port: u.port || '(default)',
      database: u.pathname.replace(/^\//, '') || '(none)',
      user: u.username || '(none)',
      pooled: /-pooler\./.test(u.hostname),
      passwordSet: !!u.password,
    };
  } catch {
    return { configured: true, error: 'Could not parse the connection string' };
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true },
    });
    if (admin?.role !== 'admin' && admin?.role !== 'superadmin') {
      return NextResponse.json({ error: 'Access denied. Admin only.' }, { status: 403 });
    }

    // A few live counts, so it's obvious this is the database with the real data.
    const [users, contracts, bills, indexValues] = await Promise.all([
      prisma.user.count().catch(() => -1),
      prisma.contract.count().catch(() => -1),
      prisma.bill.count().catch(() => -1),
      prisma.monthlyIndexValue.count().catch(() => -1),
    ]);

    return NextResponse.json({
      note: 'Password intentionally omitted. Use the host below to find the project in console.neon.tech.',
      databaseUrl: describe(process.env.DATABASE_URL),
      directUrl: describe(process.env.DIRECT_URL),
      liveData: { users, contracts, bills, monthlyIndexValues: indexValues },
    });
  } catch (error: any) {
    console.error('db-info error:', error);
    return NextResponse.json({ error: error?.message || 'Failed' }, { status: 500 });
  }
}
