
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = "force-dynamic";

// Daily limit for PVC comparisons
const DAILY_LIMIT = 10;

// Helper function to get start of day in UTC
function getStartOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// GET /api/pvc-comparison/check-session
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = (session.user as any).id as string;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get today's start date
    const todayStart = getStartOfDay();

    // Get or create today's usage record
    let dailyUsage = await prisma.pvcComparisonDailyUsage.findUnique({
      where: {
        userId_date: {
          userId,
          date: todayStart,
        },
      },
    });

    if (!dailyUsage) {
      // Create a new usage record for today
      dailyUsage = await prisma.pvcComparisonDailyUsage.create({
        data: {
          userId,
          date: todayStart,
          usageCount: 0,
        },
      });
    }

    const remainingComparisons = Math.max(0, DAILY_LIMIT - dailyUsage.usageCount);
    const hasReachedLimit = dailyUsage.usageCount >= DAILY_LIMIT;

    return NextResponse.json({
      requiresPayment: false, // No payment required
      hasActiveSession: true, // Always allow access
      dailyLimit: DAILY_LIMIT,
      usedToday: dailyUsage.usageCount,
      remainingToday: remainingComparisons,
      hasReachedLimit,
      resetsAt: new Date(todayStart.getTime() + 24 * 60 * 60 * 1000), // Next day
    });
  } catch (error) {
    console.error('Error checking PVC comparison session:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
