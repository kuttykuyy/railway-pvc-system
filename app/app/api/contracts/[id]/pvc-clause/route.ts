/**
 * Record which price variation clause governs a contract, and — for the pre-2022 clause
 * — which of its six work types applies.
 *
 * Deliberately its own endpoint rather than a field on the contract PUT. That handler
 * takes a whole contract and re-validates the agreement number, schedules and dates; a
 * screen that only wants to set the work type would have to send everything back and
 * could quietly overwrite a field it never showed. This writes two columns and nothing
 * else.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { PRE_2022_WORK_TYPES } from '@/lib/pvc-pre2022';
import { resolvePre2022Setup } from '@/lib/pre2022-contract';

export const dynamic = 'force-dynamic';

const CLAUSE_VERSIONS = ['pre-2022', 'gcc-2022'] as const;

async function contractForUser(contractId: string, email: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
  if (!user) return null;
  const isAdmin = user.role === 'admin' || user.role === 'superadmin';
  return prisma.contract.findFirst({
    where: isAdmin ? { id: contractId } : { id: contractId, userId: user.id },
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const contract = await contractForUser(id, session.user.email);
  if (!contract) return NextResponse.json({ error: 'Contract not found or access denied' }, { status: 404 });

  const setup = resolvePre2022Setup(contract as any);
  return NextResponse.json({
    contractId: contract.id,
    agreementNo: contract.agreementNo,
    workDescription: contract.workDescription,
    dateOfOpening: contract.dateOfOpening,
    setup,
    workTypes: Object.entries(PRE_2022_WORK_TYPES).map(([key, value]) => ({
      key,
      label: value.label,
      percentages: value.percentages,
    })),
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const contract = await contractForUser(id, session.user.email);
  if (!contract) return NextResponse.json({ error: 'Contract not found or access denied' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const data: { pvcClauseVersion?: string | null; pre2022WorkType?: string | null } = {};

  if ('pvcClauseVersion' in body) {
    const value = body.pvcClauseVersion;
    // Null clears the decision and hands the question back to the tender date.
    if (value !== null && !CLAUSE_VERSIONS.includes(value)) {
      return NextResponse.json(
        { error: `Clause version must be one of ${CLAUSE_VERSIONS.join(', ')}, or null to clear it.` },
        { status: 400 },
      );
    }
    data.pvcClauseVersion = value;
  }

  if ('pre2022WorkType' in body) {
    const value = body.pre2022WorkType;
    if (value !== null && !(typeof value === 'string' && value in PRE_2022_WORK_TYPES)) {
      return NextResponse.json(
        { error: 'That is not one of the six work types in Clause 46A.6.' },
        { status: 400 },
      );
    }
    data.pre2022WorkType = value;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  }

  const updated = await prisma.contract.update({ where: { id }, data: data as any });
  return NextResponse.json({ ok: true, setup: resolvePre2022Setup(updated as any) });
}
