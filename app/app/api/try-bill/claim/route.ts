import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateApiAccess } from '@/lib/payment-validation';
import { normalizeAgreementNo } from '@/lib/railway-division-helper';
import { getBaseMonth, getQuarterFromDate } from '@/lib/pvc-calculations';
import { getQuarterlyAverages } from '@/lib/db-utils';
import { getSteelIndexNamesForZone, getFuelIndexNameForBill } from '@/lib/zone-steel-city-mapping';
import { getClassificationOrDefault } from '@/lib/classification-helper';
import { calculateClassificationBasedPvcWithComponents } from '@/lib/pvc-calculations';
import { logger } from '@/lib/logger';
import type { GuestBillDraft } from '@/try-bill/types';
import { ValidationError } from '@/try-bill/lib/validation-error';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { authorized, user, message } = await validateApiAccess(request);
    if (!authorized || !user) {
      return NextResponse.json({ error: message || 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const draft: GuestBillDraft = body.draft;

    if (!draft) {
      return NextResponse.json({ error: 'Draft is required' }, { status: 400 });
    }

    const required = [
      'agreementNo',
      'contractorName',
      'dateOfOpening',
      'dateOfMeasurement',
      'grossBillAmount',
      'zone',
      'fuelPriceType',
    ];
    for (const field of required) {
      if ((draft as any)[field] === undefined || (draft as any)[field] === '') {
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

    const existingContract = await prisma.contract.findFirst({
      where: {
        OR: [
          { agreementNo: { equals: normalizedAgreementNo, mode: 'insensitive' } },
          { agreementNo: { equals: draft.agreementNo.trim(), mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });

    if (existingContract) {
      return NextResponse.json(
        { error: 'Contract with this Agreement Number already exists' },
        { status: 409 }
      );
    }

    const dateOfOpening = new Date(draft.dateOfOpening);
    const measurementDate = new Date(draft.dateOfMeasurement);
    const baseMonthDate = getBaseMonth(dateOfOpening);

    if (isNaN(dateOfOpening.getTime()) || isNaN(measurementDate.getTime())) {
      throw new ValidationError('Invalid date format');
    }

    if (measurementDate <= baseMonthDate) {
      throw new ValidationError('Measurement date must be after the contract base month');
    }

    const grossBillAmount = Number(draft.grossBillAmount);
    if (Number.isNaN(grossBillAmount) || !Number.isFinite(grossBillAmount) || grossBillAmount <= 0) {
      throw new ValidationError('Gross bill amount must be greater than zero');
    }

    const classification = await getClassificationOrDefault(draft.workClassificationCode);
    if (!classification) {
      throw new ValidationError('No work classification found');
    }

    const workDescription = classification
      ? `${classification.code} - ${classification.name}`
      : 'General Work';

    const contract = await prisma.contract.create({
      data: {
        agreementNo: normalizedAgreementNo,
        contractorName: draft.contractorName.trim(),
        workDescription,
        workClassification: classification?.code || null,
        dateOfOpening,
        baseMonth: baseMonthDate,
        userId: user.id,
        pvcApplicable: true,
        hasRailwaySuppliedMaterials: false,
      },
    });

    const quarter = getQuarterFromDate(measurementDate, baseMonthDate);
    const billNo = 'BILL-1';

    const contractBills = await prisma.bill.findMany({
      where: { contractId: contract.id },
      select: { pvcNumber: true },
    });
    let maxSequence = 0;
    for (const b of contractBills) {
      if (b.pvcNumber) {
        const parts = b.pvcNumber.split('/');
        const seq = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(seq) && seq > maxSequence) maxSequence = seq;
      }
    }
    const sequenceNumber = String(maxSequence + 1).padStart(3, '0');
    const autoPvcNumber = `PVC/${contract.agreementNo}/${sequenceNumber}`;

    const bill = await prisma.bill.create({
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
        isChargeable: false,
        processingFee: 0,
        subClassifications: [],
        nonScheduleItems: [],
      },
    });

    const components = {
      fixed: classification?.fixed ?? 0,
      labour: classification?.labour ?? 0,
      steel: classification?.steel ?? 0,
      cement: classification?.cement ?? 0,
      plantMachinery: classification?.plantMachinery ?? 0,
      fuel: classification?.fuel ?? 0,
      otherMaterials: classification?.otherMaterials ?? 0,
      explosives: classification?.explosives ?? 0,
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

    await prisma.pvcCalculation.create({
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

    const { getBillingSettings } = await import('@/lib/admin-settings');
    const billingSettings = await getBillingSettings();
    const baseAmount = billingSettings.billCost || 199;
    const freeTrialLimit = billingSettings.freeTrialBills || 1;

    await prisma.billTransaction.create({
      data: {
        userId: user.id,
        billId: bill.id,
        amount: 0,
        originalAmount: baseAmount,
        discount: baseAmount,
        discountType: 'trial',
        status: 'paid',
        isFree: true,
        paymentMethod: 'free_trial',
        paidAt: new Date(),
      },
    });

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        freeTrialUsed: { increment: 1 },
        totalBillsProcessed: { increment: 1 },
      },
      select: { freeTrialUsed: true },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isTrialActive: updatedUser.freeTrialUsed < freeTrialLimit,
      },
    });

    return NextResponse.json({ contractId: contract.id, billId: bill.id }, { status: 201 });
  } catch (error) {
    logger.error('[try-bill/claim] Error claiming draft:', error);
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to create bill' },
      { status: 500 }
    );
  }
}
