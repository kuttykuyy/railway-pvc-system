import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const ALLOWED_PLATFORMS = ['google', 'facebook', 'linkedin', 'other'];

async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  return prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, email: true },
  });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const submission = await prisma.reviewRewardSubmission.findUnique({
    where: { userId: user.id },
  });

  return NextResponse.json({ submission });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const platform = String(body.platform || '').trim().toLowerCase();
  const reviewText = String(body.reviewText || '').trim();
  const proofUrl = String(body.proofUrl || '').trim();

  if (!ALLOWED_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: 'Select a valid review platform' }, { status: 400 });
  }

  if (reviewText.length < 20 || reviewText.length > 2000) {
    return NextResponse.json(
      { error: 'Review text must contain between 20 and 2,000 characters' },
      { status: 400 }
    );
  }

  try {
    const url = new URL(proofUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid protocol');
  } catch {
    return NextResponse.json(
      { error: 'Provide a valid public review or screenshot URL' },
      { status: 400 }
    );
  }

  const existing = await prisma.reviewRewardSubmission.findUnique({
    where: { userId: user.id },
    select: { status: true },
  });

  if (existing?.status === 'approved') {
    return NextResponse.json(
      { error: 'Your one-time review reward has already been issued' },
      { status: 409 }
    );
  }

  if (existing?.status === 'pending') {
    return NextResponse.json(
      { error: 'Your review is already awaiting approval' },
      { status: 409 }
    );
  }

  const submission = await prisma.reviewRewardSubmission.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      platform,
      reviewText,
      proofUrl,
      status: 'pending',
    },
    update: {
      platform,
      reviewText,
      proofUrl,
      status: 'pending',
      submittedAt: new Date(),
      reviewedAt: null,
      reviewedById: null,
      reviewedByEmail: null,
      rejectionReason: null,
      rewardAmount: null,
    },
  });

  return NextResponse.json({ success: true, submission });
}
