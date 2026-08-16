import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Which agreement numbers have used their one free bill.
 *
 * The rule is one free bill per agreement across every account, so that deleting an
 * account and signing up again cannot earn another. That is the right default, but it
 * is invisible: a customer whose agreement was claimed by someone else — a colleague,
 * a previous account, a test — is simply refused, and nobody can see why. Worse when
 * the claiming account has since been deleted, leaving a claim nobody can trace.
 *
 * This lists them with who claimed each and whether that account still exists, and
 * allows releasing one. Releasing is a real decision, not a cleanup: it hands that
 * agreement another free bill.
 */
async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });
  return user?.role === 'admin' || user?.role === 'superadmin' ? session : null;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const claims = await prisma.trialClaimedAgreement.findMany({
    orderBy: { claimedAt: 'desc' },
  });

  // Who claimed each, and whether a contract still carries that number — the two
  // things needed to judge whether releasing one is reasonable.
  const userIds = Array.from(new Set(claims.map((c) => c.claimedByUserId).filter(Boolean)));
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, name: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  const numbers = claims.map((c) => c.normalizedAgreementNo);
  const contracts = numbers.length
    ? await prisma.contract.findMany({
        where: { agreementNo: { in: numbers } },
        select: { id: true, agreementNo: true, contractorName: true },
      })
    : [];
  const contractByNumber = new Map(contracts.map((c) => [c.agreementNo, c]));

  return NextResponse.json({
    claims: claims.map((c) => {
      const claimer = userById.get(c.claimedByUserId);
      const contract = contractByNumber.get(c.normalizedAgreementNo);
      return {
        id: c.id,
        agreementNo: c.normalizedAgreementNo,
        claimedAt: c.claimedAt,
        claimedByEmail: claimer?.email ?? null,
        claimedByName: claimer?.name ?? null,
        // The claim outlives the account on purpose — deleting the account is exactly
        // the loophole the rule closes — but it leaves nothing to explain a refusal.
        claimerDeleted: !claimer,
        contractId: contract?.id ?? null,
        contractorName: contract?.contractorName ?? null,
      };
    }),
  });
}

export async function DELETE(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const claim = await prisma.trialClaimedAgreement.findUnique({ where: { id } });
  if (!claim) return NextResponse.json({ error: 'That claim no longer exists' }, { status: 404 });

  await prisma.trialClaimedAgreement.delete({ where: { id } });
  console.info(
    `[trial-claims] ${session.user?.email} released ${claim.normalizedAgreementNo}, `
    + `claimed ${claim.claimedAt.toISOString()} — that agreement can take a free bill again.`,
  );

  return NextResponse.json({
    released: claim.normalizedAgreementNo,
    message: `${claim.normalizedAgreementNo} can use a free bill again.`,
  });
}
