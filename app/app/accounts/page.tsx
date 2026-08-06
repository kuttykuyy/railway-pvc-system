import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { canActAsAccounts, listBillsAwaitingAccounts, PASSED_FOR_PAYMENT } from '@/lib/accounts-approval';
import { AccountsInboxClient } from './accounts-client';

export const metadata: Metadata = {
  title: 'Accounts / Audit — PVC proposals',
  description: 'Vet approved PVC proposals and pass them for payment',
};

export const dynamic = 'force-dynamic';

/**
 * The accounts/audit inbox: proposals the executive side has approved, waiting to be
 * vetted and passed for payment. Scoped to the user's own railway zone.
 */
export default async function AccountsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/auth/signin');

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true, railwayZone: true, railwayZoneName: true, name: true },
  });
  if (!user) redirect('/auth/signin');
  if (!canActAsAccounts(user.role)) redirect('/dashboard');

  const awaiting = await listBillsAwaitingAccounts(user);

  const isAdmin = user.role === 'admin' || user.role === 'superadmin';
  // Same rule as the inbox: no zone means no bills, never all of them.
  const passed = !isAdmin && !user.railwayZone ? [] : await prisma.bill.findMany({
    where: {
      status: PASSED_FOR_PAYMENT,
      ...(isAdmin ? {} : { zone: user.railwayZone }),
    },
    include: {
      contract: { select: { agreementNo: true, contractorName: true } },
      pvcCalculation: { select: { totalPvc: true } },
      passedByUser: { select: { name: true, email: true } },
    },
    orderBy: { passedAt: 'desc' },
    take: 25,
  });

  return (
    <AccountsInboxClient
      awaiting={JSON.parse(JSON.stringify(awaiting))}
      passed={JSON.parse(JSON.stringify(passed))}
      zoneLabel={user.railwayZoneName || user.railwayZone || (isAdmin ? 'all zones' : '')}
      missingZone={!isAdmin && !user.railwayZone}
    />
  );
}
