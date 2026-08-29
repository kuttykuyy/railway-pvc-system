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
    let steelSupplyPvc = 0, steelSupplyAmount = 0;   // …B entries — the separate steel line
    let cementSupplyPvc = 0, cementSupplyAmount = 0; // …C entries — the separate cement line
    let generalPvc = 0, generalAmount = 0;           // everything else (compared below)

    for (const entry of classificationEntries) {
      const hasAmount = entry.amount !== '' && entry.amount !== null && entry.amount !== undefined && parseFloat(entry.amount) > 0;
      if (!hasAmount || (!entry.subClassificationId && !entry.classificationId)) continue;

      // Shared cache — the same row calculateClassificationEntryPvc reads below, so this
      // costs nothing after the first entry that uses it.
      const components = await getClassificationComponents(entry.subClassificationId, entry.classificationId);
      const hasSteelComponent = (components?.steel ?? 0) > 0;

      const entrySteelTypes = entry.steelTypes?.length > 0
        ? entry.steelTypes
        : (hasSteelComponent && extractedSteelTypes.length > 0 ? extractedSteelTypes : []);

      const pvc = await calculateClassificationEntryPvc(
        { subClassificationId: entry.subClassificationId, classificationId: entry.classificationId, amount: parseFloat(entry.amount), steelTypes: entrySteelTypes, itemRows: entry.itemRows || null },
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

      const amt = parseFloat(entry.amount);
      const code = String(codeBySubId.get(entry.subClassificationId) || codeByLegacyId.get(entry.classificationId) || '').trim().toUpperCase();
      const suffix = code.slice(-1);
      // A STEEL item is one you tagged with a steel type (TMT / Structural / Plates / Other)
      // — that is how steel is matched — OR a steel class: …B (TMT reinforcement supply)
      // or …D (fabrication & erection — the other-than-TMT structural steel). A CEMENT
      // item is a cement-supply (…C) class. All are pulled out of the general comparison.
      const ownSteelTypes = Array.isArray(entry.steelTypes) ? entry.steelTypes : [];
      const isSteelItem = ownSteelTypes.length > 0 || suffix === 'B' || suffix === 'D';
      const isCementItem = !isSteelItem && (suffix === 'C');
      if (isSteelItem) { steelSupplyPvc += pvc.totalPvc; steelSupplyAmount += amt; }
      else if (isCementItem) { cementSupplyPvc += pvc.totalPvc; cementSupplyAmount += amt; }
      else { generalPvc += pvc.totalPvc; generalAmount += amt; }
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
    // The per-item split above is the GCC-2022 46A.6 method (classification fixed per BoQ
    // item by the tender). Here we compare the GENERAL (non-steel-supply) work two ways:
    // priced item-by-item vs priced under ONE class (the group's "All items" …A class).
    // STEEL = the steel-supply (…B) items, priced at their own 85% steel-supply rate. It is
    // pulled out as its own line (same either way) and never swings the comparison.
    let singleClassification: any = null;
    try {
      if (generalAmount > 0) {
        const { inferMainClassification } = await import('@/lib/work-classification');
        const { calculateDynamicClassificationPvc } = await import('@/lib/pvc-calculations');
        const main = inferMainClassification(contract.workDescription || '');
        const groupClasses = await prisma.subClassification.findMany({
          where: { isActive: true, code: { startsWith: main.code } },
          select: {
            id: true, code: true, name: true, groupId: true,
            fixed: true, labour: true, steel: true, cement: true,
            plantMachinery: true, fuel: true, otherMaterials: true, explosives: true,
          },
          orderBy: { code: 'asc' },
        });
        // The single class = the group's "All items" (…A) class — the genuine "treat all
        // the general work as one class", never a specific-nature class picked for payout.
        const allItemsClass = groupClasses.find(c => String(c.code || '').trim().slice(-1).toUpperCase() === 'A');
        if (allItemsClass) {
          // Apply the …A class to the general amount only (steel supply already pulled out).
          const single = await calculateDynamicClassificationPvc(generalAmount, quarterlyAverages, allItemsClass.code, extractedSteelTypes);
          if (!single.isProcessingFee) {
            singleClassification = {
              mainCode: main.code,
              mainLabel: main.label,
              generalAmount,
              // Supply items pulled out and priced on their own class, same either way:
              steel: { pvc: steelSupplyPvc, amount: steelSupplyAmount },     // …B, 85% steel
              cement: { pvc: cementSupplyPvc, amount: cementSupplyAmount },  // …C, cement supply
              current: { general: generalPvc, total: totalPvc },
              best: {
                id: allItemsClass.id, code: allItemsClass.code, name: allItemsClass.name, groupId: allItemsClass.groupId,
                fixed: allItemsClass.fixed, labour: allItemsClass.labour, steel: allItemsClass.steel, cement: allItemsClass.cement,
                plantMachinery: allItemsClass.plantMachinery, fuel: allItemsClass.fuel,
                otherMaterials: allItemsClass.otherMaterials, explosives: allItemsClass.explosives,
                generalPvc: single.totalPvc,
                total: single.totalPvc + steelSupplyPvc + cementSupplyPvc,
              },
            };
          }
        }
      }
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
