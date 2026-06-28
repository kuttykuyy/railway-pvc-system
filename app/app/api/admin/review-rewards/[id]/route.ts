import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateAdminAccess } from '@/lib/role-auth';
import { getBillingSettings } from '@/lib/admin-settings';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { authorized, user: adminUser, message } = await validateAdminAccess(request);
  if (!authorized || !adminUser) {
    return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });
  }

  const body = await request.json();
  const action = String(body.action || '');
  const rejectionReason = String(body.rejectionReason || '').trim();

  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  if (action === 'reject' && rejectionReason.length < 5) {
    return NextResponse.json(
      { error: 'Provide a clear rejection reason' },
      { status: 400 }
    );
  }

  if (action === 'reject') {
    const rejected = await prisma.reviewRewardSubmission.updateMany({
      where: { id: id, status: 'pending' },
      data: {
        status: 'rejected',
        reviewedAt: new Date(),
        reviewedById: adminUser.id,
        reviewedByEmail: adminUser.email,
        rejectionReason,
      },
    });

    if (rejected.count !== 1) {
      return NextResponse.json(
        { error: 'Submission is no longer pending' },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true });
  }

  const billingSettings = await getBillingSettings();
  const rewardAmount = billingSettings.billCost || 199;

  const result = await prisma.$transaction(async (tx) => {
    const submission = await tx.reviewRewardSubmission.findUnique({
      where: { id: id },
      select: { id: true, userId: true, status: true },
    });

    if (!submission || submission.status !== 'pending') {
      return null;
    }

    const claimed = await tx.reviewRewardSubmission.updateMany({
      where: { id: submission.id, status: 'pending' },
      data: {
        status: 'approved',
        rewardAmount,
        reviewedAt: new Date(),
        reviewedById: adminUser.id,
        reviewedByEmail: adminUser.email,
        rejectionReason: null,
      },
    });
    if (claimed.count !== 1) return null;

    const account = await tx.customerAccount.findUnique({
      where: { userId: submission.userId },
      select: { creditBalance: true },
    });
    const balanceBefore = account?.creditBalance || 0;
    const balanceAfter = balanceBefore + rewardAmount;

    await tx.customerAccount.upsert({
      where: { userId: submission.userId },
      update: { creditBalance: { increment: rewardAmount } },
      create: {
        userId: submission.userId,
        creditBalance: rewardAmount,
        currentMonthBills: 0,
        outstandingAmount: 0,
      },
    });

    await tx.creditTransaction.create({
      data: {
        userId: submission.userId,
        amount: rewardAmount,
        type: 'review_reward',
        reason: 'One free bill credit for approved public review',
        balanceBefore,
        balanceAfter,
        adminUserId: adminUser.id,
        adminUserEmail: adminUser.email,
      },
    });

    return { rewardAmount, balanceAfter };
  });

  if (!result) {
    return NextResponse.json(
      { error: 'Submission is no longer pending' },
      { status: 409 }
    );
  }

  return NextResponse.json({ success: true, ...result });
}
