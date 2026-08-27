/**
 * Recalculating a bill's PVC.
 *
 * Lifted out of the /api/bills/[id]/recalculate route so it has one implementation. The
 * route now only authenticates and maps errors; anything else that needs to recompute a
 * bill — a cron refreshing drafts once their indices go final, a bulk fix — calls this
 * instead of growing a second copy. Three separate copies of the fuel basis, the steel
 * page and the Regenerate button each drifted apart before this was done.
 *
 * Callers are responsible for authorisation. This function assumes it may proceed.
 */

import { prisma } from '@/lib/db';
import { getQuarterlyAverages } from '@/lib/db-utils';
import { calculateClassificationBasedPvcWithComponents, calculateDedicatedCementPvc, calculateDedicatedSteelPvc, calculateWeightedComponents } from '@/lib/pvc-calculations';
import { calculateExtensionCompliantPvc } from '@/lib/extension-compliance';
import { recalculateCumulativePvcForContract } from '@/lib/recalculateCumulativePvc';
import { getSteelIndexNamesForZone, getFuelIndexNameForBill } from '@/lib/zone-steel-city-mapping';
import { advancedCache } from '@/lib/advanced-cache';
import { resolveBillClassificationPolicy } from '@/lib/bill-classification-policy';
import { isBillUsingProvisionalIndices, relevantIndexNamesForBill } from '@/lib/index-status';

export class BillNotFoundError extends Error {}
export class NoClassificationError extends Error {}

export async function recalculateBillPvc(billId: string) {
  // Get the bill with related data
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: {
      contract: true,
      workClassification: true, // Legacy classification
      classificationEntries: { // New classification system
        include: {
          classification: true,
          subClassification: true
        }
      },
      pvcCalculation: true
    }
  });
  
  if (!bill) {
    throw new BillNotFoundError('Bill not found');
  }

  // The engine fork. Every contract resolves to the Railway Clause 46A engine today, so
  // this is a no-op that simply proves the seam: a future scheme (e.g. CPWD 10CA) branches
  // here instead of anywhere inside the Railway maths below. An unbuilt scheme fails loudly.
  const { resolvePvcScheme, assertSchemeImplemented } = await import('./pvc-scheme');
  const pvcScheme = resolvePvcScheme(bill.contract as any);
  assertSchemeImplemented(pvcScheme);

  const classificationPolicy = await resolveBillClassificationPolicy(
    bill.contract.workDescription,
    bill.classificationEntries,
    bill,
  );
  bill.cementAmount = classificationPolicy.cementAmount;
  bill.steelTmtBarsAmount = classificationPolicy.steelTmtBarsAmount;
  bill.steelAngleChannelAmount = classificationPolicy.steelAngleChannelAmount;
  bill.steelPlatesAmount = classificationPolicy.steelPlatesAmount;
  bill.steelOtherSectionsAmount = classificationPolicy.steelOtherSectionsAmount;
  await prisma.bill.update({
    where: { id: billId },
    data: {
      cementAmount: bill.cementAmount,
      steelTmtBarsAmount: bill.steelTmtBarsAmount,
      steelAngleChannelAmount: bill.steelAngleChannelAmount,
      steelPlatesAmount: bill.steelPlatesAmount,
      steelOtherSectionsAmount: bill.steelOtherSectionsAmount,
    },
  });
  
  console.log('Recalculating PVC for Bill:', {
    id: bill.id,
    billNo: bill.billNo,
    amount: bill.billAmount,
    quarter: bill.quarter,
    legacyClassification: bill.workClassification?.code,
    entries: bill.classificationEntries.length
  });
  
  // The MEASUREMENT quarter, under 17B too. GCC 46A.10 as this codebase reads it is
  // UsedIndex = min(current quarter average, Index_L) — the current quarter priced,
  // capped at the last month of the original completion period. This used to relabel
  // the quarter to the completion date's, which fed calculateExtensionCompliantPvc
  // restriction-quarter averages while the dedicated cement/steel section below capped
  // measurement-quarter averages — two quarters inside one stored row. Creation now
  // applies the same min() rule, so the two paths finally agree.
  const correctQuarter = bill.quarter;
  
  // Get all indices for comprehensive calculation
  // Use zone-based steel city prices instead of default Chennai rates
  const steelIndexNames = getSteelIndexNamesForZone(bill.zone);
  const fuelIndexName = getFuelIndexNameForBill(bill.zone, bill.fuelPriceType);
  const allIndices = [
    'Labour', 'RBI Plant Machinery', fuelIndexName, 'RBI Other Materials',
    'RBI Cement', 'RBI Explosives',
    ...steelIndexNames
  ];
  
  // Pre-2022 quarters cover different months than the GCC-2022 rule derives from the
  // label alone — without the override this regenerated an old-clause bill's averages
  // over the wrong three months.
  const { resolvePre2022Setup } = await import('./pre2022-contract');
  const clauseSetup = resolvePre2022Setup(bill.contract as any);
  let monthsOverride: Date[] | undefined;
  if (clauseSetup.isPre2022 && bill.contract.dateOfOpening) {
    const { pre2022QuarterMonths } = await import('./pvc-pre2022');
    monthsOverride = pre2022QuarterMonths(correctQuarter, new Date(bill.contract.dateOfOpening));
  }

  const quarterlyAverages = await getQuarterlyAverages(
    correctQuarter,
    allIndices,
    bill.contract.baseMonth,
    'auto',
    monthsOverride
  );
  
  quarterlyAverages.forEach(qa => {
  });
  
  // Get classification components from either legacy or new system
  let classificationComponents = null;
  let classificationCode = null;
  
  // Try new classification entries first
  if (bill.classificationEntries && bill.classificationEntries.length > 0) {
    // Get the first entry (for now, we'll use the first classification found)
    const firstEntry = bill.classificationEntries[0];
    
    // Prefer subClassification over legacy classification
    const classification = firstEntry.subClassification || firstEntry.classification;
    
    if (classification) {
      classificationCode = classification.code;
      classificationComponents = {
        fixed: classification.fixed,
        labour: classification.labour,
        steel: classification.steel,
        cement: classification.cement,
        plantMachinery: classification.plantMachinery,
        fuel: classification.fuel,
        otherMaterials: classification.otherMaterials,
        explosives: classification.explosives
      };
      
      console.log('✅ Found classification from entries:', classificationCode);
    }
  }
  
  // Fallback to legacy workClassification if no entries found
  if (!classificationComponents && bill.workClassification) {
    classificationCode = bill.workClassification.code;
    classificationComponents = {
      fixed: bill.workClassification.fixed,
      labour: bill.workClassification.labour,
      steel: bill.workClassification.steel,
      cement: bill.workClassification.cement,
      plantMachinery: bill.workClassification.plantMachinery,
      fuel: bill.workClassification.fuel,
      otherMaterials: bill.workClassification.otherMaterials,
      explosives: bill.workClassification.explosives
    };
    
    console.log('✅ Found legacy classification:', classificationCode);
  }
  
  if (!classificationComponents) {
    throw new NoClassificationError(
      'No work classification found for this bill. Please ensure the bill has a classification assigned.',
    );
  }
  
  // CRITICAL FIX: Calculate weighted components if multiple classification entries exist
  // This ensures PVC is calculated based on the actual work mix, not just a single classification
  let componentsForPvcCalculation = classificationComponents;
  
  if (bill.classificationEntries && Array.isArray(bill.classificationEntries) && bill.classificationEntries.length > 0) {
    console.log('\n🔍 [RECALCULATE] ===== CALCULATING WEIGHTED COMPONENTS FROM CLASSIFICATION ENTRIES =====');
    console.log(`📊 Number of classification entries: ${bill.classificationEntries.length}`);
    
    // Map classification entries to the format expected by calculateWeightedComponents.
    // steelTypes travel with each entry: without them the steel PVC was silently
    // repriced on the all-four-JPC-types average, so one Regenerate click permanently
    // changed a figure the bill was created with on TMT-only (or any selected) types.
    const entriesForCalculation = bill.classificationEntries.map((entry: any) => ({
      subClassificationId: entry.subClassificationId || undefined,
      classificationId: entry.classificationId || undefined,
      amount: entry.amount,
      steelTypes: entry.steelTypes || []
    }));
    
    const hasDedicatedCement = bill.cementAmount && Number(bill.cementAmount) > 0;
    const hasDedicatedSteel = 
      (bill.steelTmtBarsAmount && Number(bill.steelTmtBarsAmount) > 0) ||
      (bill.steelAngleChannelAmount && Number(bill.steelAngleChannelAmount) > 0) ||
      (bill.steelPlatesAmount && Number(bill.steelPlatesAmount) > 0) ||
      (bill.steelOtherSectionsAmount && Number(bill.steelOtherSectionsAmount) > 0);

    // Calculate weighted components based on all classification entries
    const weightedComponents = await calculateWeightedComponents(entriesForCalculation, {
      hasDedicatedSteel,
      hasDedicatedCement
    });
    
    console.log('📊 Weighted Components:');
    console.log(`   Total Amount: ₹${weightedComponents.totalAmount.toLocaleString()}`);
    console.log(`   Labour: ${weightedComponents.labour.toFixed(2)}%`);
    console.log(`   Cement: ${weightedComponents.cement.toFixed(2)}%`);
    console.log(`   Steel: ${weightedComponents.steel.toFixed(2)}%`);
    console.log(`   Plant Machinery: ${weightedComponents.plantMachinery.toFixed(2)}%`);
    console.log(`   Fuel: ${weightedComponents.fuel.toFixed(2)}%`);
    console.log(`   Other Materials: ${weightedComponents.otherMaterials.toFixed(2)}%`);
    console.log(`   Explosives: ${weightedComponents.explosives.toFixed(2)}%`);
    console.log('🔍 [RECALCULATE] ===== WEIGHTED COMPONENTS CALCULATION COMPLETE =====\n');
    
    componentsForPvcCalculation = weightedComponents;
  } else {
    console.log('\n⚠️  [RECALCULATE] No classification entries found, using classification from bill\n');
  }
  
  // Calculate PVC with GCC 17A/17B extension compliance
  // GCC-2022 Cl.46A: W excludes railway-supplied material. Creation reduces the PVC
  // base by that value; this recalculation priced bill.billAmount in full, so one
  // Regenerate click inflated every component of a bill that had railway-supplied
  // materials — into the stored figures, not just a display.
  const railwaySupplied = Math.max(0, Number(bill.railwaySuppliedMaterialValue || 0));
  const pvcBaseAmount = railwaySupplied > 0 && bill.billAmount > railwaySupplied
    ? bill.billAmount - railwaySupplied
    : bill.billAmount;

  let extensionCompliantResult;
  try {
    extensionCompliantResult = await calculateExtensionCompliantPvc(
      bill.contractId,
      pvcBaseAmount,
      bill.dateOfMeasurement,
      quarterlyAverages,
      classificationCode,
      true, // Include detailed steps for logging
      componentsForPvcCalculation // Pass weighted components or default classification components
    );

    if (extensionCompliantResult.appliedRestrictions.isRestricted) {
    }
  } catch (extensionError) {

    // Fallback to legacy calculation
    const pvcResults = calculateClassificationBasedPvcWithComponents(
      pvcBaseAmount,
      quarterlyAverages,
      classificationComponents
    );
    
    extensionCompliantResult = {
      ...pvcResults,
      extensionDetails: {
        isExtended: false,
        isInExtensionPeriod: false,
        requiresPvcRestriction: false
      },
      appliedRestrictions: {
        isRestricted: false
      }
    };
  }
  
  // Calculate dedicated cement and steel PVC (85% each)
  // CRITICAL: When 17B restriction applies, use capped indices for dedicated cement/steel too
  let dedicatedCementPvc = 0;
  let dedicatedSteelPvc = 0;
  
  // Individual steel component PVCs
  let dedicatedSteelTmtBarsPvc = 0;
  let dedicatedSteelAngleChannelPvc = 0;
  let dedicatedSteelPlatesPvc = 0;
  let dedicatedSteelOtherSectionsPvc = 0;
  
  // For tracking financial impact on dedicated components
  let unrestrictedDedicatedCementPvc = 0;
  let unrestrictedDedicatedSteelPvc = 0;
  
  // Store Index_L values for PDF report display
  let indexL_Values: { [indexName: string]: number } = {};
  
  // Determine which quarterly averages to use (capped or unrestricted)
  let averagesForCalculation = quarterlyAverages;
  
  if (extensionCompliantResult.appliedRestrictions.isRestricted && 
      extensionCompliantResult.appliedRestrictions.restrictionType === '17B_INDEX_CAP') {
    // First calculate unrestricted values for comparison
    unrestrictedDedicatedCementPvc = calculateDedicatedCementPvc(bill.cementAmount || 0, quarterlyAverages);
    
    // Calculate unrestricted steel PVC based on individual components or legacy field
    if (bill.steelTmtBarsAmount || bill.steelAngleChannelAmount || bill.steelPlatesAmount || bill.steelOtherSectionsAmount) {
      unrestrictedDedicatedSteelPvc = 
        calculateDedicatedSteelPvc(bill.steelTmtBarsAmount || 0, quarterlyAverages, 'Steel TMT Bars') +
        calculateDedicatedSteelPvc(bill.steelAngleChannelAmount || 0, quarterlyAverages, 'Steel Angle/Channel') +
        calculateDedicatedSteelPvc(bill.steelPlatesAmount || 0, quarterlyAverages, 'Steel Plates') +
        calculateDedicatedSteelPvc(bill.steelOtherSectionsAmount || 0, quarterlyAverages, 'Steel Other Sections');
    } else {
      unrestrictedDedicatedSteelPvc = calculateDedicatedSteelPvc(bill.steelAmount || 0, quarterlyAverages, bill.selectedSteelComponent || undefined);
    }
    
    // Use the capped indices already calculated by calculateExtensionCompliantPvc
    // IMPORTANT: For 17B capping, we need MEASUREMENT QUARTER averages, not restriction quarter
    // The capping formula is: UsedIndex = min(CurrentQuarterAvg, Index_L)
    // where CurrentQuarterAvg is from the MEASUREMENT DATE's quarter
    const { getCappedIndices } = await import('@/lib/extension-compliance');
    const { getQuarterFromDate } = await import('@/lib/pvc-calculations');
    
    const restrictionDate = extensionCompliantResult.extensionDetails.pvcRestrictionDate || 
                            extensionCompliantResult.extensionDetails.originalCompletionDate;
    if (!restrictionDate) {
      throw new Error('No restriction date found for 17B calculation');
    }
    
    // Calculate the measurement quarter's averages (not the restriction quarter)
    const measurementQuarter = getQuarterFromDate(bill.dateOfMeasurement, bill.contract.baseMonth);
    const measurementQuarterAverages = await getQuarterlyAverages(
      measurementQuarter, 
      allIndices, 
      bill.contract.baseMonth, 
      'auto'
    );
    
    // Get BOTH the capped indices AND the Index_L values for PDF display
    const { cappedIndices: cappedIndicesMap, indexL_Values: indexLValuesMap, isProvisional, missingIndices } = await getCappedIndices(
      restrictionDate,
      measurementQuarterAverages,  // Use measurement quarter, not restriction quarter
      bill.contract.baseMonth
    );
    
    // Log provisional data warning if applicable
    if (isProvisional) {
      console.warn(`⚠️ PROVISIONAL DATA: Index_L values missing for: ${missingIndices?.join(', ')}`);
    }
    
    // Store Index_L values for database
    indexL_Values = indexLValuesMap;
    
    // Create restricted quarterly averages using the capped indices
    const restrictedQuarterlyAverages: typeof measurementQuarterAverages = measurementQuarterAverages.map(qa => ({
      ...qa,
      average: cappedIndicesMap[qa.indexName] !== undefined ? cappedIndicesMap[qa.indexName] : qa.average
    }));
    
    averagesForCalculation = restrictedQuarterlyAverages;
    dedicatedCementPvc = calculateDedicatedCementPvc(bill.cementAmount || 0, restrictedQuarterlyAverages);
  } else {
    // No restriction or lower indices - use unrestricted quarterly averages
    dedicatedCementPvc = calculateDedicatedCementPvc(bill.cementAmount || 0, quarterlyAverages);
    unrestrictedDedicatedCementPvc = dedicatedCementPvc;
  }
  
  // Calculate dedicated steel PVC based on individual components or legacy field
  // CRITICAL: Check for individual steel component amounts first
  const hasIndividualSteelComponents = 
    (bill.steelTmtBarsAmount && bill.steelTmtBarsAmount > 0) ||
    (bill.steelAngleChannelAmount && bill.steelAngleChannelAmount > 0) ||
    (bill.steelPlatesAmount && bill.steelPlatesAmount > 0) ||
    (bill.steelOtherSectionsAmount && bill.steelOtherSectionsAmount > 0);
  
  if (hasIndividualSteelComponents) {
    // NEW: Calculate PVC for each steel component separately
    dedicatedSteelTmtBarsPvc = calculateDedicatedSteelPvc(bill.steelTmtBarsAmount || 0, averagesForCalculation, 'Steel TMT Bars');
    dedicatedSteelAngleChannelPvc = calculateDedicatedSteelPvc(bill.steelAngleChannelAmount || 0, averagesForCalculation, 'Steel Angle/Channel');
    dedicatedSteelPlatesPvc = calculateDedicatedSteelPvc(bill.steelPlatesAmount || 0, averagesForCalculation, 'Steel Plates');
    dedicatedSteelOtherSectionsPvc = calculateDedicatedSteelPvc(bill.steelOtherSectionsAmount || 0, averagesForCalculation, 'Steel Other Sections');
    
    // Total steel PVC is sum of all individual components
    dedicatedSteelPvc = dedicatedSteelTmtBarsPvc + dedicatedSteelAngleChannelPvc + dedicatedSteelPlatesPvc + dedicatedSteelOtherSectionsPvc;
    
    console.log('🔧 Individual Steel Components:');
    console.log(`   TMT Bars: ₹${bill.steelTmtBarsAmount?.toFixed(2)} → PVC: ₹${dedicatedSteelTmtBarsPvc.toFixed(2)}`);
    console.log(`   Angle/Channel: ₹${bill.steelAngleChannelAmount?.toFixed(2)} → PVC: ₹${dedicatedSteelAngleChannelPvc.toFixed(2)}`);
    console.log(`   Plates: ₹${bill.steelPlatesAmount?.toFixed(2)} → PVC: ₹${dedicatedSteelPlatesPvc.toFixed(2)}`);
    console.log(`   Other Sections: ₹${bill.steelOtherSectionsAmount?.toFixed(2)} → PVC: ₹${dedicatedSteelOtherSectionsPvc.toFixed(2)}`);
    console.log(`   TOTAL Steel PVC: ₹${dedicatedSteelPvc.toFixed(2)}`);
  } else {
    // LEGACY: Use single steel amount field
    dedicatedSteelPvc = calculateDedicatedSteelPvc(bill.steelAmount || 0, averagesForCalculation, bill.selectedSteelComponent || undefined);
    console.log('🔧 Legacy Steel Calculation:');
    console.log(`   Steel Amount: ₹${bill.steelAmount?.toFixed(2)} → PVC: ₹${dedicatedSteelPvc.toFixed(2)}`);
  }
  
  // Set unrestricted steel PVC if not already set
  if (!extensionCompliantResult.appliedRestrictions.isRestricted) {
    unrestrictedDedicatedSteelPvc = dedicatedSteelPvc;
  }
  
  // Calculate total PVC including dedicated calculations
  // CRITICAL: SUMMATION LOGIC - Add both classification AND dedicated components together
  // extensionCompliantResult.totalPvc already includes classification-based cement and steel PVCs
  // We simply add the dedicated amounts on top
  
  let totalPvcWithDedicated = extensionCompliantResult.totalPvc 
    + dedicatedCementPvc         // Add dedicated cement (on top of classification)
    + dedicatedSteelPvc;         // Add dedicated steel (on top of classification)
  
  // When calculating adjusted amounts for 17B bills, use summation logic
  let adjustedOriginalPvcAmount = (extensionCompliantResult.appliedRestrictions.originalPvcAmount || 0)
    + unrestrictedDedicatedCementPvc       // Add unrestricted dedicated cement
    + unrestrictedDedicatedSteelPvc;       // Add unrestricted dedicated steel
    
  let adjustedRestrictedPvcAmount = (extensionCompliantResult.appliedRestrictions.restrictedPvcAmount || 0)
    + dedicatedCementPvc                   // Add restricted dedicated cement
    + dedicatedSteelPvc;                   // Add restricted dedicated steel
  
  // Calculate total savings including dedicated cement/steel
  const adjustedSavings = Math.max(0, adjustedOriginalPvcAmount - adjustedRestrictedPvcAmount);
  
  
  // Get previous cumulative PVC (from bills before this one)
  const previousPvcCalculations = await prisma.pvcCalculation.findMany({
    where: { 
      contractId: bill.contractId,
      createdAt: { lt: bill.createdAt }
    },
    orderBy: { createdAt: 'desc' }
  });
  
  const previousPvcTotal = previousPvcCalculations.length > 0 
    ? previousPvcCalculations[0].cumulativePvc 
    : 0;
  
  // Delete existing PVC calculation if it exists
  if (bill.pvcCalculation) {
    await prisma.pvcCalculation.delete({
      where: { id: bill.pvcCalculation.id }
    });
  }
  
  // Create new PVC calculation with extension compliance data
  // CRITICAL: Set classification cement/steel to 0 when dedicated components exist
  // This ensures clear separation and avoids confusion in the UI
  const pvcCalculation = await prisma.pvcCalculation.create({
    data: {
      contractId: bill.contractId,
      billId: bill.id,
      labourPvc: extensionCompliantResult.labourPvc,
      plantMachineryPvc: extensionCompliantResult.plantMachineryPvc,
      fuelPowerPvc: extensionCompliantResult.fuelPowerPvc,
      otherMaterialsPvc: extensionCompliantResult.otherMaterialsPvc,
      // Store classification cement/steel (always stored, even when dedicated exists)
      cementPvc: extensionCompliantResult.cementPvc,
      explosivesPvc: extensionCompliantResult.explosivesPvc,
      steelPvc: extensionCompliantResult.steelPvc,
      dedicatedCementPvc: dedicatedCementPvc,
      dedicatedSteelPvc: dedicatedSteelPvc,
      dedicatedSteelTmtBarsPvc: dedicatedSteelTmtBarsPvc,
      dedicatedSteelAngleChannelPvc: dedicatedSteelAngleChannelPvc,
      dedicatedSteelPlatesPvc: dedicatedSteelPlatesPvc,
      dedicatedSteelOtherSectionsPvc: dedicatedSteelOtherSectionsPvc,
      totalPvc: totalPvcWithDedicated,
      previousPvcTotal,
      cumulativePvc: previousPvcTotal + totalPvcWithDedicated,
      
      // GCC 17A/17B extension compliance fields
      isExtensionPeriod: extensionCompliantResult.extensionDetails.isInExtensionPeriod,
      extensionType: extensionCompliantResult.extensionDetails.extensionType,
      isIndexCapped: extensionCompliantResult.appliedRestrictions.isRestricted,
      indexCapDate: extensionCompliantResult.extensionDetails.pvcRestrictionDate,
      
      // Capped indices (if restricted) - these are UsedIndex = min(CurrentQuarterAvg, Index_L)
      cappedLabourIndex: extensionCompliantResult.appliedRestrictions.cappedIndices?.labour,
      cappedPlantIndex: extensionCompliantResult.appliedRestrictions.cappedIndices?.plantMachinery,
      cappedFuelIndex: extensionCompliantResult.appliedRestrictions.cappedIndices?.fuel,
      cappedMaterialsIndex: extensionCompliantResult.appliedRestrictions.cappedIndices?.otherMaterials,
      cappedCementIndex: extensionCompliantResult.appliedRestrictions.cappedIndices?.cement,
      cappedSteelIndex: extensionCompliantResult.appliedRestrictions.cappedIndices?.steel,
      cappedExplosivesIndex: extensionCompliantResult.appliedRestrictions.cappedIndices?.explosives,
      
      // Index_L values (actual values from last month of original completion)
      indexL_Labour: extensionCompliantResult.appliedRestrictions.indexL_Values?.labour,
      indexL_Plant: extensionCompliantResult.appliedRestrictions.indexL_Values?.plantMachinery,
      indexL_Fuel: extensionCompliantResult.appliedRestrictions.indexL_Values?.fuel,
      indexL_Materials: extensionCompliantResult.appliedRestrictions.indexL_Values?.otherMaterials,
      indexL_Cement: extensionCompliantResult.appliedRestrictions.indexL_Values?.cement,
      indexL_Steel: extensionCompliantResult.appliedRestrictions.indexL_Values?.steel,
      indexL_Explosives: extensionCompliantResult.appliedRestrictions.indexL_Values?.explosives,
      
      // PVC restriction details
      pvcRestrictionReason: extensionCompliantResult.appliedRestrictions.isRestricted 
        ? `GCC ${extensionCompliantResult.extensionDetails.extensionType} Extension - PVC restriction applied as per clause 46A.10`
        : null,
      originalPvcAmount: adjustedOriginalPvcAmount,
      restrictedPvcAmount: adjustedRestrictedPvcAmount,
      pvcSavingsDueToRestriction: adjustedSavings,
      // Re-evaluate provisional status against the live indices. If the month has since
      // been published as final, this flips to false and the "Regenerate" action drops off.
      // Scoped to the indices this bill prices on — unscoped, an unrelated index missing a
      // month would mark it provisional again the instant it was recalculated.
      usedProvisionalIndices: (await isBillUsingProvisionalIndices(
        correctQuarter,
        bill.contract.baseMonth,
        relevantIndexNamesForBill(bill.zone, bill.fuelPriceType),
      )).isProvisional
    }
  });
  
  // Recalculate cumulative PVC for all bills in this contract
  await recalculateCumulativePvcForContract(bill.contractId);
  
  // Invalidate cached PDFs for this bill as the values have changed
  // By the tag the cached reports are stored under. The key-shaped pattern this used
  // stopped matching when a build id was added to the key, which is how a recalculated
  // bill kept handing out its old PDF.
  advancedCache.invalidateByTag(`bill:${billId}`);
  
  // Return updated bill
  const updatedBill = await prisma.bill.findUnique({
    where: { id: bill.id },
    include: {
      contract: true,
      workClassification: true,
      pvcCalculation: true
    }
  });
  
  // Construct success message with compliance info
  let successMessage = 'PVC recalculated successfully';
  
  
  if (extensionCompliantResult.appliedRestrictions.isRestricted) {
    const savingsAmount = extensionCompliantResult.appliedRestrictions.savingsAmount || 0;
    successMessage += ` (GCC ${extensionCompliantResult.extensionDetails.extensionType} compliance - ₹${savingsAmount.toFixed(2)} saved due to index restrictions)`;
  } else if (extensionCompliantResult.extensionDetails.isInExtensionPeriod) {
    successMessage += ` (Contract in ${extensionCompliantResult.extensionDetails.extensionType} extension period)`;
  }

  return {
    message: successMessage,
    bill: updatedBill,
    // Also returned at the top level: the bills list reads data.pvcCalculation to update
    // the row in place, and reading it off the nested bill was silently returning
    // undefined, so a regenerated row never showed its new amount.
    pvcCalculation: updatedBill?.pvcCalculation ?? pvcCalculation,
    calculation: extensionCompliantResult,
    quarterRecalculated: false,
    extensionCompliance: {
      isExtended: extensionCompliantResult.extensionDetails.isExtended,
      extensionType: extensionCompliantResult.extensionDetails.extensionType,
      isInExtensionPeriod: extensionCompliantResult.extensionDetails.isInExtensionPeriod,
      hasRestrictions: extensionCompliantResult.appliedRestrictions.isRestricted,
      restrictionDetails: extensionCompliantResult.appliedRestrictions.isRestricted
        ? extensionCompliantResult.appliedRestrictions
        : null,
    },
  };
}
