import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { actOnBillAsAccounts, canActAsAccounts, listBillsAwaitingAccounts } from '@/lib/accounts-approval';

export const dynamic = 'force-dynamic';

/**
 * GET  /api/bills/approval/accounts — proposals waiting to be vetted by accounts.
 * POST /api/bills/approval/accounts — pass one for payment, or return it with a reason.
 *
 * The accounts/audit stage follows the executive approval; see lib/accounts-approval.ts.
 */
async function requireAccountsUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) };
  }
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true, railwayZone: true, name: true },
  });
  if (!user) {
    return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };
  }
  if (!canActAsAccounts(user.role)) {
    return {
      error: NextResponse.json(
        { error: 'This is the accounts/audit stage — only an accounts account can act on it.' },
        { status: 403 },
      ),
    };
  }
  return { user };
}

export async function GET(req: NextRequest) {
  try {
    const { error, user } = await requireAccountsUser();
    if (error) return error;

    // ?billId= returns the verification checklist for one proposal — the standard
    // checks with what the app computed beside each, for the officer to tick.
    const billId = req.nextUrl.searchParams.get('billId');
    if (billId) {
      const { buildAccountsChecklist } = await import('@/lib/accounts-checklist');
      const items = await buildAccountsChecklist(billId);
      if (!items) {
        return NextResponse.json({ error: 'That bill has no PVC calculation to vet.' }, { status: 404 });
      }
      return NextResponse.json({ items });
    }

    const bills = await listBillsAwaitingAccounts(user!);
    return NextResponse.json({ bills, count: bills.length });
  } catch (err: any) {
    console.error('Accounts inbox error:', err);
    return NextResponse.json({ error: 'Could not load the proposals awaiting vetting' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { error, user } = await requireAccountsUser();
    if (error) return error;

    const { billId, action, comments, verified } = await req.json();
    if (!billId || (action !== 'pass' && action !== 'return')) {
      return NextResponse.json({ error: 'billId and action ("pass" or "return") are required' }, { status: 400 });
    }

    const result = await actOnBillAsAccounts({
      billId,
      userId: user!.id,
      action,
      comments,
      verified: Array.isArray(verified) ? verified.map(String) : undefined,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }

    return NextResponse.json({
      success: true,
      message: action === 'pass' ? 'Passed for payment' : 'Returned to the executive stage',
      bill: result.bill,
    });
  } catch (err: any) {
    console.error('Accounts action error:', err);
    return NextResponse.json({ error: 'Could not record the accounts decision' }, { status: 500 });
  }
}
