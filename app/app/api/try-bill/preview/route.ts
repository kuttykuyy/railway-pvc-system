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

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function isValidFuelPriceType(value: unknown): value is 'four_city_avg' | 'zone_city' {
  return value === 'four_city_avg' || value === 'zone_city';
}

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const identifier = getIdentifier(request);
    const rateLimit = await checkDbRateLimit(`try-bill-preview:${identifier}`, 20, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many preview requests. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
        }
      );
    }

    const bodyRecord = body as Record<string, unknown>;

    for (const field of REQUIRED_FIELDS) {
      const value = bodyRecord[field];
      if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
        throw new ValidationError(`${field} is required`);
      }
    }

    const fuelPriceTypeValue = typeof bodyRecord.fuelPriceType === 'string'
      ? bodyRecord.fuelPriceType.trim()
      : bodyRecord.fuelPriceType;

    if (!isValidFuelPriceType(fuelPriceTypeValue)) {
      throw new ValidationError('fuelPriceType must be four_city_avg or zone_city');
    }

    const draft: GuestBillDraft = {
      agreementNo: String(bodyRecord.agreementNo).trim(),
      contractorName: String(bodyRecord.contractorName).trim(),
      dateOfOpening: String(bodyRecord.dateOfOpening).trim(),
      dateOfMeasurement: String(bodyRecord.dateOfMeasurement).trim(),
      grossBillAmount: Number(bodyRecord.grossBillAmount),
      workClassificationCode:
        typeof bodyRecord.workClassificationCode === 'string'
          ? bodyRecord.workClassificationCode.trim() || undefined
          : undefined,
      zone: String(bodyRecord.zone).trim(),
      fuelPriceType: fuelPriceTypeValue,
    };

    if (Number.isNaN(draft.grossBillAmount) || draft.grossBillAmount <= 0) {
      throw new ValidationError('Gross bill amount must be greater than zero');
    }

    const preview = await calculateGuestPreview(draft);

    return NextResponse.json({ preview }, { status: 200 });
  } catch (error) {
    logger.error('[try-bill/preview] Error calculating preview:', error);
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to calculate preview' },
      { status: 500 }
    );
  }
}
