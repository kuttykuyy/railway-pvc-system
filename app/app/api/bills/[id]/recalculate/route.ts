
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getQuarterlyAverages } from '@/lib/db-utils';
import { calculateClassificationBasedPvcWithComponents, calculateDedicatedCementPvc, calculateDedicatedSteelPvc, calculateWeightedComponents } from '@/lib/pvc-calculations';
import { calculateExtensionCompliantPvc, savePvcExtensionCompliance } from '@/lib/extension-compliance';
import { recalculateCumulativePvcForContract } from '@/lib/recalculateCumulativePvc';
import { getSteelIndexNamesForZone, getFuelIndexNameForBill } from '@/lib/zone-steel-city-mapping';
import { advancedCache } from '@/lib/advanced-cache';

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const billId = id;
    
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
      return NextResponse.json(
        { error: 'Bill not found' },
        { status: 404 }
      );
    }
    
    console.log('Recalculating PVC for Bill:', {
      id: bill.id,
      billNo: bill.billNo,
      amount: bill.billAmount,
      quarter: bill.quarter,
      legacyClassification: bill.workClassification?.code,
      entries: bill.classificationEntries.length
    });
    
    // Determine correct quarter for 17B extensions
    let correctQuarter = bill.quarter;
    let quarterRecalculated = false;
    
    if (bill.contract.isExtended && 
        bill.contract.extensionType === '17B' && 
        bill.contract.originalCompletionDate && 
        bill.dateOfMeasurement > bill.contract.originalCompletionDate) {
      // For 17B extensions, recalculate quarter using original completion date
      const { getQuarterFromDate } = await import('@/lib/pvc-calculations');
      correctQuarter = getQuarterFromDate(bill.contract.originalCompletionDate, bill.contract.baseMonth);
      
      if (correctQuarter !== bill.quarter) {
        quarterRecalculated = true;
        console.log('📅 17B Extension: Quarter recalculated');
        console.log(`   Original Quarter (from measurement date): ${bill.quarter}`);
        console.log(`   Correct Quarter (from completion date): ${correctQuarter}`);
        console.log(`   Measurement Date: ${bill.dateOfMeasurement.toDateString()}`);
        console.log(`   Original Completion: ${bill.contract.originalCompletionDate.toDateString()}`);
        
        // Update the quarter in the bill record
        await prisma.bill.update({
          where: { id: billId },
          data: { quarter: correctQuarter }
        });
      }
    }
    
    // Get all indices for comprehensive calculation
    // Use zone-based steel city prices instead of default Chennai rates
    const steelIndexNames = getSteelIndexNamesForZone(bill.zone);
    const fuelIndexName = getFuelIndexNameForBill(bill.zone, bill.fuelPriceType);
    const allIndices = [
      'Labour', 'RBI Plant Machinery', fuelIndexName, 'RBI Other Materials',
      'RBI Cement', 'RBI Explosives',
      ...steelIndexNames
    ];
    
    const quarterlyAverages = await getQuarterlyAverages(
      correctQuarter, 
      allIndices, 
      bill.contract.baseMonth, 
      'auto'
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
      return NextResponse.json(
        { error: 'No work classification found for this bill. Please ensure the bill has a classification assigned.' },
        { status: 400 }
      );
    }
    
    // CRITICAL FIX: Calculate weighted components if multiple classification entries exist
    // This ensures PVC is calculated based on the actual work mix, not just a single classification
    let componentsForPvcCalculation = classificationComponents;
    
    if (bill.classificationEntries && Array.isArray(bill.classificationEntries) && bill.classificationEntries.length > 0) {
      console.log('\n🔍 [RECALCULATE] ===== CALCULATING WEIGHTED COMPONENTS FROM CLASSIFICATION ENTRIES =====');
      console.log(`📊 Number of classification entries: ${bill.classificationEntries.length}`);
      
      // Map classification entries to the format expected by calculateWeightedComponents
      const entriesForCalculation = bill.classificationEntries.map((entry: any) => ({
        subClassificationId: entry.subClassificationId || undefined,
        classificationId: entry.classificationId || undefined,
        amount: entry.amount
      }));
      
      // Calculate weighted components based on all classification entries
      const weightedComponents = await calculateWeightedComponents(entriesForCalculation);
      
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
    let extensionCompliantResult;
    try {
      extensionCompliantResult = await calculateExtensionCompliantPvc(
        bill.contractId,
        bill.billAmount,
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
        bill.billAmount, 
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
        pvcSavingsDueToRestriction: adjustedSavings
      }
    });
    
    // Recalculate cumulative PVC for all bills in this contract
    await recalculateCumulativePvcForContract(bill.contractId);
    
    // Invalidate cached PDFs for this bill as the values have changed
    advancedCache.invalidateByPattern(new RegExp("^pdf-report:" + billId + ":.*"));
    
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
    
    // Add quarter recalculation info
    if (quarterRecalculated) {
      successMessage += ` (Quarter updated for 17B extension compliance)`;
    }
    
    if (extensionCompliantResult.appliedRestrictions.isRestricted) {
      const savingsAmount = extensionCompliantResult.appliedRestrictions.savingsAmount || 0;
      successMessage += ` (GCC ${extensionCompliantResult.extensionDetails.extensionType} compliance - ₹${savingsAmount.toFixed(2)} saved due to index restrictions)`;
    } else if (extensionCompliantResult.extensionDetails.isInExtensionPeriod) {
      successMessage += ` (Contract in ${extensionCompliantResult.extensionDetails.extensionType} extension period)`;
    }

    return NextResponse.json({
      success: true,
      message: successMessage,
      bill: updatedBill,
      calculation: extensionCompliantResult,
      extensionCompliance: {
        isExtended: extensionCompliantResult.extensionDetails.isExtended,
        extensionType: extensionCompliantResult.extensionDetails.extensionType,
        isInExtensionPeriod: extensionCompliantResult.extensionDetails.isInExtensionPeriod,
        hasRestrictions: extensionCompliantResult.appliedRestrictions.isRestricted,
        restrictionDetails: extensionCompliantResult.appliedRestrictions.isRestricted 
          ? extensionCompliantResult.appliedRestrictions 
          : null
      }
    });
    
  } catch (error) {
    console.error('Error recalculating PVC:', error);
    return NextResponse.json(
      { error: 'Failed to recalculate PVC' },
      { status: 500 }
    );
  }
}
