import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getQuarterFromDate } from '@/lib/pvc-calculations';
import { getQuarterlyAverages } from '@/lib/db-utils';
import { getSteelIndexNamesForZone, getFuelIndexNameForBill } from '@/lib/zone-steel-city-mapping';
import { extractSteelTypesFromEntries } from '@/lib/steel-type-handler';
import { isBillUsingProvisionalIndices, relevantIndexNamesForBill } from '@/lib/index-status';
import { getBillingSettings } from '@/lib/admin-settings';

export const dynamic = 'force-dynamic';

// POST /api/bills/preview
// Runs the full PVC calculation WITHOUT saving to DB or charging credits.
// Returns the calculated breakdown so the user can see results before paying.
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true, isFreeAccount: true, freeTrialUsed: true, customProcessingFee: true },
    });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 401 });

    const body = await request.json();
    const {
      contractId,
      grossBillAmount,
      billAmount,
      dateOfMeasurement,
      zone,
      fuelPriceType = 'four_city_avg',
      calculationMethod = 'auto',
      classificationEntries = [],
      isAiUploaded,
    } = body;

    if (!contractId || !grossBillAmount || !billAmount || !dateOfMeasurement) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        agreementNo: true,
        baseMonth: true,
        isExtended: true,
        extensionType: true,
        originalCompletionDate: true,
        userId: true,
      },
    });
    if (!contract) return NextResponse.json({ error: 'Contract not found' }, { status: 404 });

    // Only the contract owner or admin can preview
    if (contract.userId !== user.id && user.role !== 'admin' && user.role !== 'superadmin') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const measurementDate = new Date(dateOfMeasurement);

    // Quarter logic (mirrors main bill route)
    let quarterDateForCalc = measurementDate;
    if (
      contract.isExtended &&
      contract.extensionType === '17B' &&
      contract.originalCompletionDate &&
      measurementDate > contract.originalCompletionDate
    ) {
      quarterDateForCalc = contract.originalCompletionDate;
    }
    const quarter = getQuarterFromDate(quarterDateForCalc, contract.baseMonth);

    // Steel type extraction
    const extractedSteelTypes = await extractSteelTypesFromEntries(classificationEntries);

    // Quarterly averages
    const steelIndexNames = getSteelIndexNamesForZone(zone);
    const fuelIndexName = getFuelIndexNameForBill(zone, fuelPriceType);
    const allIndices = [
      'Labour', 'RBI Plant Machinery', fuelIndexName, 'RBI Other Materials',
      'RBI Cement', 'RBI Explosives', ...steelIndexNames,
    ];
    const quarterlyAverages = await getQuarterlyAverages(quarter, allIndices, contract.baseMonth, calculationMethod);

    // Per-entry PVC calculation (no DB writes)
    const { calculateClassificationEntryPvc } = await import('@/lib/pvc-calculations');
    let labourPvc = 0, plantPvc = 0, fuelPvc = 0, materialsPvc = 0;
    let cementPvc = 0, steelPvc = 0, explosivesPvc = 0, totalPvc = 0;

    for (const entry of classificationEntries) {
      const hasAmount = entry.amount !== '' && entry.amount !== null && entry.amount !== undefined && parseFloat(entry.amount) > 0;
      if (!hasAmount || (!entry.subClassificationId && !entry.classificationId)) continue;

      let hasSteelComponent = false;
      if (entry.subClassificationId) {
        const sub = await prisma.subClassification.findUnique({ where: { id: entry.subClassificationId }, select: { steel: true } });
        hasSteelComponent = (sub?.steel ?? 0) > 0;
      } else if (entry.classificationId) {
        const cls = await prisma.classification.findUnique({ where: { id: entry.classificationId }, select: { steel: true } });
        hasSteelComponent = (cls?.steel ?? 0) > 0;
      }

      const entrySteelTypes = entry.steelTypes?.length > 0
        ? entry.steelTypes
        : (hasSteelComponent && extractedSteelTypes.length > 0 ? extractedSteelTypes : []);

      const pvc = await calculateClassificationEntryPvc(
        { subClassificationId: entry.subClassificationId, classificationId: entry.classificationId, amount: parseFloat(entry.amount), steelTypes: entrySteelTypes },
        quarterlyAverages
      );

      labourPvc += pvc.labourPvc;
      plantPvc += pvc.plantMachineryPvc;
      fuelPvc += pvc.fuelPowerPvc;
      materialsPvc += pvc.otherMaterialsPvc;
      cementPvc += pvc.cementPvc;
      steelPvc += pvc.steelPvc;
      explosivesPvc += pvc.explosivesPvc;
      totalPvc += pvc.totalPvc;

    }

    // Previous cumulative PVC (for new bill display)
    const previousBills = await prisma.bill.findMany({
      where: { contractId },
      include: { pvcCalculation: true },
      orderBy: { dateOfMeasurement: 'desc' },
    });
    const previousCumulativePvc = previousBills[0]?.pvcCalculation?.cumulativePvc ?? 0;

    // Check provisional — against this bill's own indices only. Checking every index in
    // the table flagged bills as provisional over a steel index for another zone, or an
    // explosives index the work never touches.
    const { isProvisional } = await isBillUsingProvisionalIndices(
      quarter,
      contract.baseMonth,
      relevantIndexNamesForBill(zone, fuelPriceType),
    );

    // Determine bill cost for this user
    const billingSettings = await getBillingSettings();
    const fullCost = isAiUploaded ? (billingSettings.aiBillCost || 499) : (billingSettings.billCost || 199);
    const freeTrialLimit = billingSettings.freeTrialBills || 1;

    // Free roles always ₹0
    const isFreeRole = user.role === 'admin' || user.role === 'superadmin' ||
      user.role === 'railway_official' || user.isFreeAccount || user.customProcessingFee === 0;

    // Free trial: new user hasn't used their trial yet
    const isFreeTrial = !isFreeRole && user.freeTrialUsed < freeTrialLimit;

    const isFirstBill = isFreeTrial;
    const billCost = isFreeRole ? 0 : isFreeTrial ? 0 : fullCost;

    return NextResponse.json({
      quarter,
      isProvisional,
      totalPvc,
      cumulativePvc: previousCumulativePvc + totalPvc,
      previousCumulativePvc,
      components: { labourPvc, plantPvc, fuelPvc, materialsPvc, cementPvc, steelPvc, explosivesPvc },
      quarterlyAverages: quarterlyAverages.map(qa => ({
        indexName: qa.indexName,
        quarter: qa.quarter,
        average: qa.average,
        baseValue: qa.baseValue,
      })),
      grossBillAmount: parseFloat(grossBillAmount),
      billAmount: parseFloat(billAmount),
      isFirstBill,
      billCost,
      fullCost,
    });
  } catch (err: any) {
    console.error('Preview error:', err);
    return NextResponse.json({ error: err.message || 'Preview failed' }, { status: 500 });
  }
}
