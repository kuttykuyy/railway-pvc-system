
import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { ApprovalsPageClient } from './approvals-client';

export const metadata: Metadata = {
  title: 'Bill Approvals',
  description: 'Review and approve pending PVC bills for railway contractors'
};

export default async function ApprovalsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect('/auth/signin');
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  });

  if (!user) {
    redirect('/auth/signin');
  }

  // Only railway officials and admins can access this page
  if (user.role !== 'RAILWAY_OFFICIAL' && user.role !== 'railway_official' && user.role !== 'admin') {
    redirect('/dashboard');
  }

  // Get pending bills
  const pendingBills = await prisma.bill.findMany({
    where: {
      status: 'submitted'
    },
    include: {
      contract: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              companyName: true
            }
          }
        }
      },
      pvcCalculation: true
    },
    orderBy: {
      submittedAt: 'asc'
    }
  });

  // Get status counts
  const statusCounts = await prisma.bill.groupBy({
    by: ['status'],
    _count: {
      status: true
    }
  });

  const counts = {
    draft: 0,
    submitted: 0,
    approved: 0,
    rejected: 0,
    revision_requested: 0
  };

  statusCounts.forEach(item => {
    if (item.status in counts) {
      counts[item.status as keyof typeof counts] = item._count.status;
    }
  });

  return (
    <ApprovalsPageClient 
      bills={JSON.parse(JSON.stringify(pendingBills))}
      counts={counts}
      user={JSON.parse(JSON.stringify(user))}
    />
  );
}
