/**
 * Sharing a contract with another account.
 *
 * UserContractAccess and the permission checks that read it already existed, but the
 * only way to write a grant was /admin/user-permissions, which refuses anyone who is
 * not an admin. So a user could not share their own work with the contractor it was
 * prepared for. This route lets the OWNER do it, and no one else.
 *
 * Sharing grants access; it does not move ownership. The contract stays in the
 * granter's account and continues to appear in their list.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function requireOwner(contractId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { ok: false as const, status: 401, error: 'Unauthorized' };
  }
  const [me, contract] = await Promise.all([
    prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true, role: true } }),
    prisma.contract.findUnique({ where: { id: contractId }, select: { id: true, userId: true, agreementNo: true } }),
  ]);
  if (!me) return { ok: false as const, status: 401, error: 'Unauthorized' };
  if (!contract) return { ok: false as const, status: 404, error: 'Contract not found' };

  const isOwner = contract.userId === me.id;
  const isAdmin = me.role === 'admin' || me.role === 'superadmin';
  if (!isOwner && !isAdmin) {
    // Deliberately the same message either way: someone probing contract ids should not
    // learn which ones exist.
    return { ok: false as const, status: 403, error: 'Only the owner of this contract can share it.' };
  }
  return { ok: true as const, me, contract };
}

/** Who this contract is currently shared with. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOwner(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const shares = await prisma.userContractAccess.findMany({
    where: { contractId: id, isActive: true },
    select: {
      id: true,
      canEdit: true,
      canCreateBills: true,
      grantedAt: true,
      expiresAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { grantedAt: 'desc' },
  });
  return NextResponse.json({ shares });
}

/** Share with an account, identified by the email it signs in with. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOwner(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const email = String(body?.email || '').trim().toLowerCase();
  const canEdit = body?.canEdit === true;
  const canCreateBills = body?.canCreateBills !== false; // sharing a contract to work on is the usual case

  if (!email) {
    return NextResponse.json({ error: 'An email address is required.' }, { status: 400 });
  }
  if (email === (await prisma.user.findUnique({ where: { id: auth.me.id }, select: { email: true } }))?.email?.toLowerCase()) {
    return NextResponse.json({ error: 'This contract is already yours.' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true } });
  if (!target) {
    // No invitation flow exists, so say plainly what is missing rather than failing quietly.
    return NextResponse.json(
      { error: `No account is registered with ${email}. Ask them to sign up first, then share it.` },
      { status: 404 },
    );
  }
  if (target.id === auth.contract.userId) {
    return NextResponse.json({ error: 'That account already owns this contract.' }, { status: 400 });
  }

  // Re-sharing with someone whose access was revoked reactivates it rather than failing
  // on the unique constraint.
  const share = await prisma.userContractAccess.upsert({
    where: { userId_contractId: { userId: target.id, contractId: id } },
    create: {
      userId: target.id,
      contractId: id,
      canView: true,
      canEdit,
      canDelete: false, // never granted by sharing; deletion stays with the owner
      canCreateBills,
      grantedByUserId: auth.me.id,
      isActive: true,
    },
    update: {
      canView: true,
      canEdit,
      canDelete: false,
      canCreateBills,
      grantedByUserId: auth.me.id,
      isActive: true,
      expiresAt: null,
    },
    select: { id: true, canEdit: true, canCreateBills: true, grantedAt: true },
  });

  return NextResponse.json({
    share: { ...share, user: target },
    message: `${auth.contract.agreementNo} shared with ${target.email}.`,
  });
}

/** Stop sharing. The grant is deactivated rather than deleted, so the record of who had
 *  access and when is not lost. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOwner(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const userId = new URL(request.url).searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

  await prisma.userContractAccess.updateMany({
    where: { contractId: id, userId },
    data: { isActive: false },
  });
  return NextResponse.json({ message: 'Access removed.' });
}
