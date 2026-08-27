import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { checkUserBillAccess } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/**
 * The stored CPWD 10CA (Engine B) result for a bill, or { present: false } for a Railway
 * bill (or one not yet computed). Read-only; the card on the bill page renders nothing when
 * absent, so this is safe to call for every bill.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const requester = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  const access = requester ? await checkUserBillAccess(requester.id, id) : null;
  if (!access?.canView) return NextResponse.json({ error: 'No access to this bill.' }, { status: 403 });

  try {
    const { schemaQualified } = await import('@/lib/db-schema');
    const table = await schemaQualified('cpwd_10ca_calculations');
    const rows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT "billId","region","baseMonth","billMonth","totalVariation","breakdown","flags","excluded",
              COALESCE("cpwd10ccTotal",0) AS "cpwd10ccTotal",
              COALESCE("cpwd10ccBreakdown",'[]'::jsonb) AS "cpwd10ccBreakdown",
              COALESCE("combinedTotal","totalVariation") AS "combinedTotal"
       FROM ${table} WHERE "billId" = $1 LIMIT 1`,
      id,
    );
    const row = rows[0];
    if (!row) return NextResponse.json({ present: false });
    return NextResponse.json({
      present: true,
      region: row.region,
      baseMonth: row.baseMonth,
      billMonth: row.billMonth,
      totalVariation: Number(row.totalVariation),
      breakdown: row.breakdown || [],
      flags: row.flags || [],
      excluded: row.excluded || [],
      cpwd10ccTotal: Number(row.cpwd10ccTotal),
      cpwd10ccBreakdown: row.cpwd10ccBreakdown || [],
      combinedTotal: Number(row.combinedTotal),
    });
  } catch {
    // Table not created yet (no CPWD bill has ever computed) → nothing to show.
    return NextResponse.json({ present: false });
  }
}
