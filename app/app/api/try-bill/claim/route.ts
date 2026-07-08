import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateApiAccess, validateBillProcessing, processPaymentForBill } from '@/lib/payment-validation';
import { normalizeAgreementNo } from '@/lib/railway-division-helper';
import { getBaseMonth, getQuarterFromDate, calculateClassificationBasedPvcWithComponents } from '@/lib/pvc-calculations';
import { getQuarterlyAverages } from '@/lib/db-utils';
import { getSteelIndexNamesForZone, getFuelIndexNameForBill } from '@/lib/zone-steel-city-mapping';
import { getClassificationOrDefault } from '@/lib/classification-helper';
import { areFinalIndicesAvailableForBill } from '@/lib/index-status';
import { validateMeasurementDateAgainstProvisionalIndices } from '@/lib/provisional-validation';
import { checkDbRateLimit } from '@/lib/rate-limit-db';
import { getIdentifier } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';
import type { GuestBillDraft } from '@/try-bill/types';
import { ValidationError } from '@/try-bill/lib/validation-error';

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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const bodyRecord = body as Record<string, unknown>;
  const draft: GuestBillDraft | undefined = bodyRecord.draft as GuestBillDraft | undefined;

  try {
    const { authorized, user, message } = await validateApiAccess(request);
    if (!authorized || !user) {
      return NextResponse.json({ error: message || 'Unauthorized' }, { status: 401 });
    }

    const identifier = getIdentifier(request);
    const rateLimit = await checkDbRateLimit(`try-bill-claim:${identifier}`, 10, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many claims. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
        }
      );
    }

    if (!draft) {
      throw new ValidationError('Draft is required');
    }

    for (const field of REQUIRED_FIELDS) {
      const value = (draft as any)[field];
      if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
        throw new ValidationError(`${field} is required`);
      }
    }

    if (draft.fuelPriceType !== 'four_city_avg' && draft.fuelPriceType !== 'zone_city') {
      throw new ValidationError('fuelPriceType must be four_city_avg or zone_city');
    }

    const normalizedAgreementNo = normalizeAgreementNo(draft.agreementNo);
    if (!normalizedAgreementNo) {
      throw new ValidationError('Invalid Agreement Number format');
    }

    const dateOfOpening = new Date(draft.dateOfOpening);
    const measurementDate = new Date(draft.dateOfMeasurement);

    if (isNaN(dateOfOpening.getTime()) || isNaN(measurementDate.getTime())) {
      throw new ValidationError('Invalid date format');
    }

    const baseMonthDate = getBaseMonth(dateOfOpening);

    if (measurementDate <= baseMonthDate) {
      throw new ValidationError('Measurement date must be after the contract base month');
    }

    const grossBillAmount = Number(draft.grossBillAmount);
    if (Number.isNaN(grossBillAmount) || !Number.isFinite(grossBillAmount) || grossBillAmount <= 0) {
      throw new ValidationError('Gross bill amount must be greater than zero');
    }

    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (measurementDate > today) {
      throw new ValidationError('Measurement date cannot be in the future');
    }

    const indicesCheck = await areFinalIndicesAvailableForBill(measurementDate, baseMonthDate);
    if (!indicesCheck.available) {
      throw new ValidationError(indicesCheck.message || 'Required indices are not available');
    }

    const provisionalValidation = await validateMeasurementDateAgainstProvisionalIndices(
      measurementDate,
      baseMonthDate
    );
    if (!provisionalValidation.isValid) {
      throw new ValidationError(provisionalValidation.error || 'Provisional indices validation failed');
    }

    // Check if user can process this bill (payment / trial)
    const paymentValidation = await validateBillProcessing(request, false);
    if (!paymentValidation.canProcess) {
      return NextResponse.json(
        {
          error: paymentValidation.reason || 'Payment required',
          requiredPayment: paymentValidation.requiredPayment,
          isFree: paymentValidation.isFree,
        },
        { status: 402 }
      );
    }

    const classification = await getClassificationOrDefault(draft.workClassificationCode);
    if (!classification) {
      throw new ValidationError('No work classification found');
    }

    const workDescription = `${classification.code} - ${classification.name}`;

    const result = await prisma.$transaction(async (tx) => {
      const existingContract = await tx.contract.findFirst({
        where: {
          OR: [
            { agreementNo: { equals: normalizedAgreementNo, mode: 'insensitive' } },
            { agreementNo: { equals: draft.agreementNo.trim(), mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });

      if (existingContract) {
        throw new ValidationError('Contract with this Agreement Number already exists');
      }

      const contract = await tx.contract.create({
        data: {
          agreementNo: normalizedAgreementNo,
          contractorName: draft.contractorName.trim(),
          workDescription,
          workClassification: classification.code,
          dateOfOpening,
          baseMonth: baseMonthDate,
          userId: user.id,
          pvcApplicable: true,
          hasRailwaySuppliedMaterials: false,
        },
      });

      const quarter = getQuarterFromDate(measurementDate, baseMonthDate);
      const billNo = 'BILL-1';
      const autoPvcNumber = `PVC/${contract.agreementNo}/001`;

      const bill = await tx.bill.create({
        data: {
          contractId: contract.id,
          billNo,
          grossBillAmount,
          billAmount: grossBillAmount,
          dateOfMeasurement: measurementDate,
          quarter,
          zone: draft.zone.trim(),
          fuelPriceType: draft.fuelPriceType,
          pvcNumber: autoPvcNumber,
          isChargeable: !paymentValidation.isFree,
          processingFee: paymentValidation.isFree ? 0 : (paymentValidation.requiredPayment || 0),
          subClassifications: [],
          nonScheduleItems: [],
        },
      });

      const components = {
        fixed: classification.fixed ?? 0,
        labour: classification.labour ?? 0,
        steel: classification.steel ?? 0,
        cement: classification.cement ?? 0,
        plantMachinery: classification.plantMachinery ?? 0,
        fuel: classification.fuel ?? 0,
        otherMaterials: classification.otherMaterials ?? 0,
        explosives: classification.explosives ?? 0,
      };

      const steelIndexNames = getSteelIndexNamesForZone(draft.zone);
      const fuelIndexName = getFuelIndexNameForBill(draft.zone, draft.fuelPriceType);
      const allIndices = [
        'Labour',
        'RBI Plant Machinery',
        fuelIndexName,
        'RBI Other Materials',
        'RBI Cement',
        'RBI Explosives',
        ...steelIndexNames,
      ];

      const quarterlyAverages = await getQuarterlyAverages(quarter, allIndices, baseMonthDate, 'auto');
      const pvc = calculateClassificationBasedPvcWithComponents(
        grossBillAmount,
        quarterlyAverages,
        components
      );

      await tx.pvcCalculation.create({
        data: {
          contractId: contract.id,
          billId: bill.id,
          labourPvc: pvc.labourPvc,
          plantMachineryPvc: pvc.plantMachineryPvc,
          fuelPowerPvc: pvc.fuelPowerPvc,
          otherMaterialsPvc: pvc.otherMaterialsPvc,
          cementPvc: pvc.cementPvc,
          steelPvc: pvc.steelPvc,
          explosivesPvc: pvc.explosivesPvc,
          dedicatedCementPvc: 0,
          dedicatedSteelPvc: 0,
          dedicatedSteelTmtBarsPvc: 0,
          dedicatedSteelAngleChannelPvc: 0,
          dedicatedSteelPlatesPvc: 0,
          dedicatedSteelOtherSectionsPvc: 0,
          totalPvc: pvc.totalPvc,
          previousPvcTotal: 0,
          cumulativePvc: pvc.totalPvc,
        },
      });

      return { contract, bill, pvc };
    });

    // Process payment / trial after records exist
    const paymentResult = await processPaymentForBill(
      user.id,
      result.bill.id,
      'free_trial',
      undefined,
      undefined,
      undefined,
      result.pvc.totalPvc,
      result.contract.agreementNo,
      false
    );

    if (!paymentResult.success) {
      // Bill was created but payment failed; return error with bill ID so client can retry
      return NextResponse.json(
        { error: paymentResult.message || 'Payment processing failed', billId: result.bill.id },
        { status: 402 }
      );
    }

    return NextResponse.json(
      { contractId: result.contract.id, billId: result.bill.id },
      { status: 201 }
    );
  } catch (error) {
    logger.error('[try-bill/claim] Error claiming draft:', error);
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (typeof error === 'object' && error !== null && (error as any).code === 'P2002') {
      return NextResponse.json({ error: 'Contract with this Agreement Number already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create bill' }, { status: 500 });
  }
}
