/**
 * TEMPORARY diagnostic — delete once the database login has been confirmed.
 *
 * Which database login is the running app actually using? This cannot be answered from
 * the database side: Supabase's pooler multiplexes many client sessions onto a few
 * upstream connections, so pg_stat_activity shows the pooler's own connections rather
 * than the app's. Asking from inside the app's own connection is the only reliable way.
 *
 * Admin only, and it reports no secrets — a role name, a schema name and two counts.
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const viewer = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });
  if (viewer?.role !== 'admin' && viewer?.role !== 'superadmin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const [who] = await prisma.$queryRawUnsafe<Array<{ role: string; login: string; schema: string }>>(
      `SELECT current_user AS role, session_user AS login, current_schema() AS schema`,
    );

    // How much of each application this login can actually read.
    const countReadable = async (schema: string) => {
      const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT COUNT(*) AS n
         FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE ns.nspname = $1 AND c.relkind = 'r'
           AND has_table_privilege(current_user, c.oid, 'SELECT')`,
        schema,
      );
      return Number(rows[0]?.n ?? 0);
    };

    const erpTablesReadable = await countReadable('public');
    const irpvcTablesReadable = await countReadable('railway_pvc');

    const scoped = who?.login === 'irpvc_app' && erpTablesReadable === 0;
    return NextResponse.json({
      databaseLogin: who?.login,
      effectiveRole: who?.role,
      defaultSchema: who?.schema,
      irpvcTablesReadable,
      erpTablesReadable,
      verdict: scoped
        ? 'SCOPED — the app is on its own login and cannot read the other application.'
        : who?.login === 'postgres'
          ? 'STILL SHARED — the app is on the postgres login; the DATABASE_URL change has not taken effect.'
          : `UNEXPECTED — login "${who?.login}" with ${erpTablesReadable} other-app tables readable.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Could not read the database identity', detail: String(error?.message || error).slice(0, 200) },
      { status: 500 },
    );
  }
}
