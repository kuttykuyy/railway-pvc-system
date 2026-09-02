import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from './db';
import { normalizePhone } from './phone-validation';

export const REFERRAL_MINIMUM_TOPUP = 1000;
export const REFERRAL_REWARD = 199;
export const REFERRAL_MONTHLY_REWARD_LIMIT = 10;

export function normalizeReferralCode(code: string | null | undefined): string {
  return (code || '').trim().toUpperCase();
}

function createReferralCode(): string {
  return `IR${randomBytes(5).toString('hex').toUpperCase()}`;
}

export async function generateUniqueReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createReferralCode();
    const existing = await prisma.user.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });

    if (!existing) return code;
  }

  throw new Error('Unable to generate a unique referral code');
}

export async function ensureUserReferralCode(userId: string): Promise<string> {
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });

  if (!existingUser) {
    throw new Error('User not found');
  }

  if (existingUser.referralCode) {
    return existingUser.referralCode;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createReferralCode();

    try {
      const claimed = await prisma.user.updateMany({
        where: { id: userId, referralCode: null },
        data: { referralCode: code },
      });

      if (claimed.count === 1) return code;

      const refreshed = await prisma.user.findUnique({
        where: { id: userId },
        select: { referralCode: true },
      });

      if (refreshed?.referralCode) return refreshed.referralCode;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        continue;
      }
      throw error;
    }
  }

  throw new Error('Unable to assign a referral code');
}

export async function findEligibleReferrer(code: string) {
  const normalizedCode = normalizeReferralCode(code);
  if (!normalizedCode) return null;

  return prisma.user.findFirst({
    where: {
      referralCode: normalizedCode,
      emailVerified: { not: null },
    },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      referralCode: true,
    },
  });
}

async function addReferralCredit(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: number,
  reason: string
) {
  const account = await tx.customerAccount.findUnique({
    where: { userId },
    select: { creditBalance: true },
  });
  const balanceBefore = account?.creditBalance || 0;
  const balanceAfter = balanceBefore + amount;

  await tx.customerAccount.upsert({
    where: { userId },
    update: { creditBalance: { increment: amount } },
    create: {
      userId,
      creditBalance: amount,
      currentMonthBills: 0,
      outstandingAmount: 0,
    },
  });

  await tx.creditTransaction.create({
    data: {
      userId,
      amount,
      type: 'referral_reward',
      reason,
      balanceBefore,
      balanceAfter,
    },
  });
}

/**
 * Who actually paid for the qualifying top-up, as Razorpay reports it. A referral is
 * blocked at sign-up when the new account shares the referrer's email or phone, but a
 * second email and a second SIM are cheap, and a self-referral through them earned
 * ₹398 of credit on every ₹1,000 paid. The payment instrument is harder to fake: when
 * the payer's email or contact on the qualifying payment is the REFERRER's, the two
 * accounts are one person and the referral is rejected rather than rewarded.
 */
export interface QualifyingPayer {
  email?: string | null;
  contact?: string | null;
}

export async function processReferralReward(
  referredUserId: string,
  triggeringTransactionId: string,
  payer?: QualifyingPayer,
): Promise<{ rewarded: boolean; reason?: string }> {
  return prisma.$transaction(async (tx) => {
    const triggerTransaction = await tx.razorpayTransaction.findUnique({
      where: { id: triggeringTransactionId },
      select: { id: true, userId: true, status: true },
    });

    if (
      !triggerTransaction ||
      triggerTransaction.userId !== referredUserId ||
      triggerTransaction.status !== 'success'
    ) {
      return { rewarded: false, reason: 'Triggering transaction is not eligible' };
    }

    const referral = await tx.referral.findUnique({
      where: { referredUserId },
      select: {
        id: true,
        status: true,
        referrerUserId: true,
        referredUserId: true,
        referrerReward: true,
        referredReward: true,
      },
    });

    if (!referral) {
      return { rewarded: false, reason: 'No referral attribution found' };
    }

    if (referral.status === 'rewarded') {
      return { rewarded: false, reason: 'Referral already rewarded' };
    }

    if (payer && (payer.email || payer.contact)) {
      const referrer = await tx.user.findUnique({
        where: { id: referral.referrerUserId },
        select: { email: true, phone: true },
      });
      const payerEmail = String(payer.email || '').trim().toLowerCase();
      const payerPhone = payer.contact ? normalizePhone(String(payer.contact)) : null;
      const referrerPhone = referrer?.phone ? normalizePhone(referrer.phone) : null;
      const sameEmail = !!payerEmail && !!referrer?.email && referrer.email.trim().toLowerCase() === payerEmail;
      const samePhone = !!payerPhone && !!referrerPhone && payerPhone === referrerPhone;
      if (sameEmail || samePhone) {
        await tx.referral.updateMany({
          where: { id: referral.id, status: { not: 'rewarded' } },
          data: {
            status: 'rejected',
            rejectedAt: new Date(),
            rejectionReason: 'self_referral_payment_identity',
          },
        });
        return { rewarded: false, reason: 'Qualifying payment was made by the referrer' };
      }
    }

    const firstQualifyingTopup = await tx.razorpayTransaction.findFirst({
      where: {
        userId: referredUserId,
        status: 'success',
        creditAmount: { gte: REFERRAL_MINIMUM_TOPUP },
      },
      orderBy: [{ completedAt: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });

    if (!firstQualifyingTopup) {
      return { rewarded: false, reason: 'Minimum top-up not reached' };
    }

    const rewardedAt = new Date();
    const monthStart = new Date(rewardedAt.getFullYear(), rewardedAt.getMonth(), 1);
    const rewardedThisMonth = await tx.referral.count({
      where: {
        referrerUserId: referral.referrerUserId,
        status: 'rewarded',
        rewardedAt: { gte: monthStart },
      },
    });

    if (rewardedThisMonth >= REFERRAL_MONTHLY_REWARD_LIMIT) {
      await tx.referral.updateMany({
        where: { id: referral.id, status: { not: 'rewarded' } },
        data: {
          status: 'rejected',
          rejectedAt: rewardedAt,
          rejectionReason: 'monthly_reward_limit_reached',
        },
      });
      return { rewarded: false, reason: 'Monthly referral reward limit reached' };
    }

    const claimed = await tx.referral.updateMany({
      where: {
        id: referral.id,
        status: { not: 'rewarded' },
        qualifyingTransactionId: null,
      },
      data: {
        status: 'rewarded',
        qualifyingTransactionId: firstQualifyingTopup.id,
        qualifiedAt: rewardedAt,
        rewardedAt,
      },
    });

    if (claimed.count !== 1) {
      return { rewarded: false, reason: 'Referral reward already claimed' };
    }

    await addReferralCredit(
      tx,
      referral.referrerUserId,
      referral.referrerReward,
      `Referral reward for qualified user ${referredUserId}`
    );
    await addReferralCredit(
      tx,
      referral.referredUserId,
      referral.referredReward,
      'Welcome referral reward after first qualifying top-up'
    );

    return { rewarded: true };
  });
}
