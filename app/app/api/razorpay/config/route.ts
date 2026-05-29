
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getRazorpayKeyId } from '@/lib/razorpay';
import { prisma } from '@/lib/db';

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if Razorpay is enabled in admin settings (with retry for DB connection issues)
    let setting;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        setting = await prisma.adminSettings.findUnique({
          where: { key: 'payment_method' },
        });
        break;
      } catch (dbError: any) {
        if (attempt < 2 && (dbError.code === 'P1001' || dbError.message?.includes("Can't reach database"))) {
          console.warn(`[Razorpay Config] DB connection failed (attempt ${attempt + 1}/3), retrying...`);
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        throw dbError;
      }
    }

    const isRazorpayEnabled = setting?.value === 'razorpay';
    const keyId = isRazorpayEnabled ? getRazorpayKeyId() : null;

    return NextResponse.json({
      enabled: isRazorpayEnabled,
      keyId,
    });
  } catch (error: any) {
    console.error('Error fetching Razorpay config:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch config' },
      { status: 500 }
    );
  }
}
