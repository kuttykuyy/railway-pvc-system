import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateApiAccess } from '@/lib/payment-validation';
import { getBillingSettings } from '@/lib/admin-settings';
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
import { PaymentRequiredError } from '@/try-bill/lib/payment-required-error';

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

    const classification = await getClassificationOrDefault(draft.workClassificationCode);
    if (!classification) {
      throw new ValidationError('No work classification found');
    }

    const workDescription = `${classification.code} - ${classification.name}`;

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

    const quarter = getQuarterFromDate(measurementDate, baseMonthDate);
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

    const result = await prisma.$transaction(async (tx) => {
      const freshUser = await tx.user.findUnique({
        where: { id: user.id },
        include: { customerAccount: true },
      });

      if (!freshUser) {
        throw new ValidationError('User not found');
      }

      const billingSettings = await getBillingSettings();
      const baseAmount = billingSettings.billCost || 199;
      const freeTrialLimit = billingSettings.freeTrialBills || 1;

      let isFree = false;
      let freeReason = '';
      let requiredPayment = 0;

      if (
        freshUser.role === 'admin' ||
        freshUser.role === 'superadmin' ||
        freshUser.role === 'railway_official'
      ) {
        isFree = true;
        freeReason = freshUser.role;
      } else if (freshUser.isFreeAccount) {
        isFree = true;
        freeReason = 'free_account';
      } else if (freshUser.customProcessingFee === 0) {
        isFree = true;
        freeReason = 'custom_zero_fee';
      } else if (freshUser.freeTrialUsed < freeTrialLimit) {
        isFree = true;
        freeReason = 'trial';
      } else {
        requiredPayment = baseAmount;
      }

      if (!isFree) {
        if ((freshUser.customerAccount?.creditBalance ?? 0) < requiredPayment) {
          throw new PaymentRequiredError('Insufficient balance', requiredPayment);
        }
      }

      if (isFree && freeReason === 'trial') {
        const existingClaim = await tx.trialClaimedAgreement.findUnique({
          where: { normalizedAgreementNo },
        });

        if (existingClaim) {
          isFree = false;
          freeReason = '';
          requiredPayment = baseAmount;

          if ((freshUser.customerAccount?.creditBalance ?? 0) < requiredPayment) {
            throw new PaymentRequiredError(
              'A free trial has already been used for this Agreement Number. Please add credits to continue.',
              requiredPayment
            );
          }
        }
      }

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
          isChargeable: !isFree,
          processingFee: isFree ? 0 : requiredPayment,
          subClassifications: [],
          nonScheduleItems: [],
        },
      });

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

      await tx.billTransaction.create({
        data: {
          userId: user.id,
          billId: bill.id,
          amount: isFree ? 0 : requiredPayment,
          originalAmount: baseAmount,
          discount: isFree ? baseAmount : 0,
          discountType: isFree ? freeReason : null,
          status: 'paid',
          isFree,
          paymentMethod: isFree ? (freeReason === 'trial' ? 'free_trial' : 'free_account') : 'credit_balance',
          paidAt: new Date(),
        },
      });

      if (isFree && freeReason === 'trial') {
        await tx.user.update({
          where: { id: user.id },
          data: {
            freeTrialUsed: { increment: 1 },
            totalBillsProcessed: { increment: 1 },
            isTrialActive: freshUser.freeTrialUsed + 1 < freeTrialLimit,
          },
        });

        await tx.trialClaimedAgreement.upsert({
          where: { normalizedAgreementNo },
          create: { normalizedAgreementNo, claimedByUserId: user.id },
          update: {},
        });
      } else {
        await tx.user.update({
          where: { id: user.id },
          data: {
            totalBillsProcessed: { increment: 1 },
          },
        });
      }

      if (!isFree && freshUser.customerAccount) {
        await tx.customerAccount.update({
          where: { userId: user.id },
          data: {
            creditBalance: { decrement: requiredPayment },
          },
        });
      }

      return { contract, bill, pvc };
    });

    return NextResponse.json(
      { contractId: result.contract.id, billId: result.bill.id },
      { status: 201 }
    );
  } catch (error) {
    logger.error('[try-bill/claim] Error claiming draft:', error);
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof PaymentRequiredError) {
      return NextResponse.json(
        { error: error.message, requiredPayment: error.requiredPayment, isFree: false },
        { status: 402 }
      );
    }
    if (typeof error === 'object' && error !== null && (error as any).code === 'P2002') {
      return NextResponse.json({ error: 'Contract with this Agreement Number already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create bill' }, { status: 500 });
  }
}
