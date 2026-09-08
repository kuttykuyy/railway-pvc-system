import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getQuarterFromDate } from '@/lib/pvc-calculations';
import { getQuarterlyAverages } from '@/lib/db-utils';
import { getSteelIndexNamesForZone, getFuelIndexNameForBill, DEFAULT_FUEL_PRICE_TYPE } from '@/lib/zone-steel-city-mapping';
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
      fuelPriceType = DEFAULT_FUEL_PRICE_TYPE,
      calculationMethod = 'auto',
      classificationEntries = [],
      isAiUploaded,
      railwaySuppliedMaterialValue = 0,
      extraItemsOutsidePvc = 0,
    } = body;

    // Same base as the save routes, or the preview promises a figure the saved bill
    // will not show. An entry flagged outsidePvc (a Cl.39 extra item) earns nothing;
    // railway-supplied material and any un-flagged Clause 39 amount come off the rest
    // in proportion.
    const flaggedExtraTotal = (classificationEntries as any[]).reduce(
      (sum: number, e: any) => sum + (e?.outsidePvc ? (parseFloat(e?.amount) || 0) : 0), 0);
    const varyingTotal = (classificationEntries as any[]).reduce(
      (sum: number, e: any) => sum + (e?.outsidePvc ? 0 : (parseFloat(e?.amount) || 0)), 0);
    const outsidePvc = Math.max(0, parseFloat(railwaySuppliedMaterialValue) || 0)
      + Math.max(0, (parseFloat(extraItemsOutsidePvc) || 0) - flaggedExtraTotal);
    const pvcBaseFactor = outsidePvc > 0 && varyingTotal > outsidePvc
      ? (varyingTotal - outsidePvc) / varyingTotal
      : 1;

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
        workDescription: true,
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
    const { calculateClassificationEntryPvc, getClassificationComponents } = await import('@/lib/pvc-calculations');
    let labourPvc = 0, plantPvc = 0, fuelPvc = 0, materialsPvc = 0;
    let cementPvc = 0, steelPvc = 0, explosivesPvc = 0, totalPvc = 0;

    // Classification code for every entry — from BOTH the sub-classification and the legacy
    // classification tables, so a steel-supply (…B) entry is recognised whichever field it
    // uses. Steel items ARE the …B entries (priced at their 85% steel-supply rate); they are
    // pulled out as the separate "steel" line and dropped from the general comparison below.
    const subIds = [...new Set(classificationEntries.map((e: any) => e.subClassificationId).filter(Boolean))] as string[];
    const legacyIds = [...new Set(classificationEntries.map((e: any) => e.classificationId).filter(Boolean))] as string[];
    const [subRows, legacyRows] = await Promise.all([
      subIds.length ? prisma.subClassification.findMany({ where: { id: { in: subIds } }, select: { id: true, code: true } }) : Promise.resolve([]),
      legacyIds.length ? prisma.classification.findMany({ where: { id: { in: legacyIds } }, select: { id: true, code: true } }) : Promise.resolve([]),
    ]);
    const codeBySubId = new Map(subRows.map(r => [r.id, r.code]));
    const codeByLegacyId = new Map(legacyRows.map(r => [r.id, r.code]));
    const singleClassInputs: import('@/lib/single-classification').SingleClassEntryInput[] = [];

    for (const entry of classificationEntries) {
      const hasAmount = entry.amount !== '' && entry.amount !== null && entry.amount !== undefined && parseFloat(entry.amount) > 0;
      if (!hasAmount || (!entry.subClassificationId && !entry.classificationId)) continue;
      // A Cl.39 extra item: on the bill, outside price variation (Cl.46A.1(b)).
      if (entry.outsidePvc === true) continue;

      // Shared cache — the same row calculateClassificationEntryPvc reads below, so this
      // costs nothing after the first entry that uses it.
      const components = await getClassificationComponents(entry.subClassificationId, entry.classificationId);
      const hasSteelComponent = (components?.steel ?? 0) > 0;

      const entrySteelTypes = entry.steelTypes?.length > 0
        ? entry.steelTypes
        : (hasSteelComponent && extractedSteelTypes.length > 0 ? extractedSteelTypes : []);

      const pvc = await calculateClassificationEntryPvc(
        { subClassificationId: entry.subClassificationId, classificationId: entry.classificationId, amount: parseFloat(entry.amount) * pvcBaseFactor, steelTypes: entrySteelTypes, itemRows: entry.itemRows || null },
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

      singleClassInputs.push({
        code: String(codeBySubId.get(entry.subClassificationId) || codeByLegacyId.get(entry.classificationId) || ''),
        amount: parseFloat(entry.amount),
        totalPvc: pvc.totalPvc,
        steelTypes: Array.isArray(entry.steelTypes) ? entry.steelTypes : [],
        steelShare: components?.steel ?? 0,
      });
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

    // Single-classification comparison (TRANSPARENCY / what-if — NOT the tender method).
    // Shared with the Telegram bot, see lib/single-classification.ts.
    let singleClassification: any = null;
    try {
      const { compareSingleClassification } = await import('@/lib/single-classification');
      singleClassification = await compareSingleClassification({
        workDescription: contract.workDescription || '',
        entries: singleClassInputs,
        quarterlyAverages,
        extractedSteelTypes,
        totalPvc,
      });
    } catch (cmpErr) {
      console.error('Single-classification comparison failed (non-fatal):', cmpErr);
    }

    return NextResponse.json({
      quarter,
      isProvisional,
      totalPvc,
      singleClassification,
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
