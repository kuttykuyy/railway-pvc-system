import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { normalizePhone } from '@/lib/phone-validation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The state of every stored mobile number, and the one safe repair.
 *
 * Numbers were saved exactly as typed, so one mobile could be in the database as
 * "+919876543210", "919876543210" and "9876543210" at once, and nothing stopped two
 * accounts holding the same one. Writes are fixed now; this is for what is already
 * there, and it has to run before the unique index can be applied — the index will
 * refuse to build while duplicates exist, which is the right way round.
 *
 * GET reports. POST rewrites ONLY the rows that are safe to rewrite.
 *
 * The distinction matters: normalising can CREATE a duplicate that was not there as an
 * exact string. If account A holds "+919876543210" and account B holds "9876543210",
 * they look different today and identical afterwards. Rewriting those would quietly
 * make two accounts collide. So any number shared by more than one account is reported
 * and left alone — which of those accounts should keep it is a decision about people,
 * not a decision about data.
 */

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, status: 401, error: 'Unauthorized' };
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });
  if (user?.role !== 'admin' && user?.role !== 'superadmin') {
    return { ok: false as const, status: 403, error: 'Admin access required' };
  }
  return { ok: true as const };
}

interface Holder {
  id: string;
  email: string;
  name: string | null;
  stored: string;
  createdAt: Date;
  bills: number;
  contracts: number;
}

async function survey() {
  const users = await prisma.user.findMany({
    where: { phone: { not: null } },
    select: {
      id: true, email: true, name: true, phone: true, createdAt: true,
      _count: { select: { contracts: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const byNumber = new Map<string, Holder[]>();
  const unreadable: Array<{ id: string; email: string; stored: string }> = [];
  let needsRewrite = 0;

  for (const user of users) {
    const stored = user.phone as string;
    const normalized = normalizePhone(stored);
    if (!normalized) {
      // Nothing that can be made into a number. Someone typed a name, or a landline
      // extension. Worth a human look; never rewritten automatically.
      unreadable.push({ id: user.id, email: user.email, stored });
      continue;
    }
    if (normalized !== stored) needsRewrite += 1;
    const holders = byNumber.get(normalized) || [];
    holders.push({
      id: user.id,
      email: user.email,
      name: user.name,
      stored,
      createdAt: user.createdAt,
      bills: 0,
      contracts: user._count.contracts,
    });
    byNumber.set(normalized, holders);
  }

  const shared = [...byNumber.entries()]
    .filter(([, holders]) => holders.length > 1)
    .map(([number, holders]) => ({ number, holders }));

  const conflictedIds = new Set(shared.flatMap(group => group.holders.map(h => h.id)));

  return { users, byNumber, shared, conflictedIds, unreadable, needsRewrite };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { users, shared, conflictedIds, unreadable, needsRewrite } = await survey();
  const safeToRewrite = users.filter(u => {
    const normalized = normalizePhone(u.phone);
    return normalized && normalized !== u.phone && !conflictedIds.has(u.id);
  }).length;

  return NextResponse.json({
    totalWithPhone: users.length,
    needsRewrite,
    safeToRewrite,
    blockedByConflict: needsRewrite - safeToRewrite,
    unreadable,
    sharedNumbers: shared.map(group => ({
      number: group.number,
      accounts: group.holders.map(h => ({
        email: h.email, name: h.name, stored: h.stored,
        contracts: h.contracts, createdAt: h.createdAt,
      })),
    })),
    readyForUniqueIndex: shared.length === 0,
    nextStep: shared.length > 0
      ? `${shared.length} number(s) are on more than one account. Decide who keeps each one and clear the others, then POST here to normalise, then apply the unique index under Pending DB Changes.`
      : needsRewrite > 0
        ? 'No number is shared. POST here to normalise the stored formats, then apply the unique index under Pending DB Changes.'
        : 'Every number is already in one form and unique. Apply the unique index under Pending DB Changes.',
  });
}

/**
 * Settle one shared number: the account named keeps it, every other account holding it
 * has it cleared.
 *
 * This is the one operation the cleanup needs and the admin pages had no way to perform
 * — there is no screen anywhere for editing somebody's phone number. Clearing rather
 * than reassigning is deliberate: we do not know what the other person's real number
 * is, and inventing one would be worse than asking them.
 *
 * What happens to a cleared account: it is bounced to /auth/complete-mobile on its next
 * page load and has to supply a number, which can no longer be one somebody else holds.
 * Admins, superadmins and railway officials are exempt from that gate, so clearing
 * theirs costs them nothing at all.
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { number, keepEmail } = await request.json().catch(() => ({}));
  const normalized = normalizePhone(String(number || ''));
  if (!normalized || !keepEmail) {
    return NextResponse.json(
      { error: 'Send { number, keepEmail } — the number, and the account that keeps it.' },
      { status: 400 },
    );
  }

  const { byNumber } = await survey();
  const holders = byNumber.get(normalized) || [];
  if (holders.length === 0) {
    return NextResponse.json({ error: `No account holds ${normalized}.` }, { status: 404 });
  }
  const keeper = holders.find(h => h.email.toLowerCase() === String(keepEmail).toLowerCase());
  if (!keeper) {
    return NextResponse.json(
      { error: `${keepEmail} does not hold ${normalized}. Holders: ${holders.map(h => h.email).join(', ')}` },
      { status: 400 },
    );
  }

  const released = holders.filter(h => h.id !== keeper.id);
  for (const holder of released) {
    await prisma.user.update({ where: { id: holder.id }, data: { phone: null } });
  }
  // The keeper's own row is normalised on the way past, so this number is finished with.
  if (keeper.stored !== normalized) {
    await prisma.user.update({ where: { id: keeper.id }, data: { phone: normalized } });
  }

  console.info('[admin/phone-numbers] settled a shared number', {
    number: normalized,
    keptBy: keeper.email,
    clearedFrom: released.map(h => h.email),
  });

  return NextResponse.json({
    number: normalized,
    keptBy: keeper.email,
    clearedFrom: released.map(h => ({ email: h.email, contracts: h.contracts })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
  const { users, conflictedIds } = await survey();

  const changes: Array<{ email: string; from: string; to: string }> = [];
  for (const user of users) {
    const stored = user.phone as string;
    const normalized = normalizePhone(stored);
    if (!normalized || normalized === stored) continue;
    // Left alone on purpose — see the note at the top of this file.
    if (conflictedIds.has(user.id)) continue;
    changes.push({ email: user.email, from: stored, to: normalized });
    if (!dryRun) {
      await prisma.user.update({ where: { id: user.id }, data: { phone: normalized } });
    }
  }

  return NextResponse.json({
    dryRun,
    rewritten: changes.length,
    skippedBecauseShared: conflictedIds.size,
    changes: changes.slice(0, 100),
  });
}
