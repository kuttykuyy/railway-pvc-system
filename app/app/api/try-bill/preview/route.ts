import { NextRequest, NextResponse } from 'next/server';
import { calculateGuestPreview } from '@/try-bill/lib/preview-calculation';
import type { GuestBillDraft } from '@/try-bill/types';
import { checkDbRateLimit } from '@/lib/rate-limit-db';
import { getIdentifier } from '@/lib/rate-limiter';
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

function isValidFuelPriceType(value: unknown): value is 'four_city_avg' | 'zone_city' {
  return value === 'four_city_avg' || value === 'zone_city';
}

export async function POST(request: NextRequest) {
  try {
    const identifier = getIdentifier(request);
    const rateLimit = await checkDbRateLimit(`try-bill-preview:${identifier}`, 20, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many preview requests. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();

    for (const field of REQUIRED_FIELDS) {
      const value = body[field];
      if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
        return NextResponse.json(
          { error: `${field} is required` },
          { status: 400 }
        );
      }
    }

    if (!isValidFuelPriceType(body.fuelPriceType)) {
      return NextResponse.json({ error: 'fuelPriceType must be four_city_avg or zone_city' }, { status: 400 });
    }

    const draft: GuestBillDraft = {
      agreementNo: String(body.agreementNo).trim(),
      contractorName: String(body.contractorName).trim(),
      dateOfOpening: String(body.dateOfOpening),
      dateOfMeasurement: String(body.dateOfMeasurement),
      grossBillAmount: Number(body.grossBillAmount),
      workClassificationCode: body.workClassificationCode,
      zone: String(body.zone),
      fuelPriceType: body.fuelPriceType,
    };

    if (Number.isNaN(draft.grossBillAmount) || draft.grossBillAmount <= 0) {
      return NextResponse.json({ error: 'Gross bill amount must be greater than zero' }, { status: 400 });
    }

    const preview = await calculateGuestPreview(draft);

    return NextResponse.json({ preview }, { status: 200 });
  } catch (error: any) {
    logger.error('[try-bill/preview] Error calculating preview:', error);
    const message = error?.message || 'Failed to calculate preview';
    const isValidationError =
      typeof message === 'string' &&
      (/Invalid|must be|after|required|No work classification/.test(message));
    return NextResponse.json({ error: message }, { status: isValidationError ? 400 : 500 });
  }
}
