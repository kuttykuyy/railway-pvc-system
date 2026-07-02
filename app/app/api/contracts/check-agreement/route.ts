import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateApiAccess } from '@/lib/payment-validation';
import { normalizeAgreementNo } from '@/lib/railway-division-helper';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { authorized, message } = await validateApiAccess(request);
    if (!authorized) {
      return NextResponse.json(
        { error: message || 'Unauthorized' },
        { status: 401 }
      );
    }

    const agreementNo = request.nextUrl.searchParams.get('agreementNo')?.trim() || '';
    const excludeContractId = request.nextUrl.searchParams.get('excludeContractId') || undefined;
    const normalizedAgreementNo = normalizeAgreementNo(agreementNo);

    if (!normalizedAgreementNo) {
      return NextResponse.json(
        { error: 'A valid agreement number is required' },
        { status: 400 }
      );
    }

    const existingContract = await prisma.contract.findFirst({
      where: {
        ...(excludeContractId ? { id: { not: excludeContractId } } : {}),
        OR: [
          { agreementNo: { equals: normalizedAgreementNo, mode: 'insensitive' } },
          { agreementNo: { equals: agreementNo, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        agreementNo: true,
      },
    });

    return NextResponse.json({
      available: !existingContract,
      normalizedAgreementNo,
      existingAgreementNo: existingContract?.agreementNo,
    });
  } catch (error) {
    console.error('Error checking agreement number:', error);
    return NextResponse.json(
      { error: 'Failed to check agreement number' },
      { status: 500 }
    );
  }
}
