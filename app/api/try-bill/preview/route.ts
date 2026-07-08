import { NextRequest, NextResponse } from 'next/server';
import { calculateGuestPreview } from '@/try-bill/lib/preview-calculation';
import type { GuestBillDraft } from '@/try-bill/types';
import { checkDbRateLimit } from '@/lib/rate-limit-db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const REQUIRED_FIELDS: (keyof GuestBillDraft)[] = [
  'agreementNo',
  'contractorName',
  'dateOfOpening',
  'dateOfMeasurement',
  'grossBillAmount',
  'zone',
  'fuelPriceType',
];

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const rateLimit = await checkDbRateLimit(`try-bill-preview:${ip}`, 20, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many preview requests. Please try again later.' },
        { status: 429 }
      );
    }

    const body = (await request.json()) as Partial<GuestBillDraft>;

    for (const field of REQUIRED_FIELDS) {
      if (body[field] === undefined || body[field] === '') {
        return NextResponse.json(
          { error: `${field} is required` },
          { status: 400 }
        );
      }
    }

    const draft: GuestBillDraft = {
      agreementNo: String(body.agreementNo).trim(),
      contractorName: String(body.contractorName).trim(),
      dateOfOpening: String(body.dateOfOpening),
      dateOfMeasurement: String(body.dateOfMeasurement),
      grossBillAmount: Number(body.grossBillAmount),
      workClassificationCode: body.workClassificationCode,
      zone: String(body.zone),
      fuelPriceType: body.fuelPriceType as 'four_city_avg' | 'zone_city',
    };

    if (!draft.agreementNo || !draft.contractorName) {
      return NextResponse.json({ error: 'Invalid agreement number or contractor name' }, { status: 400 });
    }

    if (Number.isNaN(draft.grossBillAmount) || draft.grossBillAmount <= 0) {
      return NextResponse.json({ error: 'Gross bill amount must be greater than zero' }, { status: 400 });
    }

    const preview = await calculateGuestPreview(draft);

    return NextResponse.json({ preview }, { status: 200 });
  } catch (error: any) {
    logger.error('[try-bill/preview] Error calculating preview:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to calculate preview' },
      { status: 400 }
    );
  }
}
