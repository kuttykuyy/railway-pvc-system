
/**
 * Migration Script: Recalculate Bills with 17B Restrictions
 * 
 * This script automatically recalculates all bills that have 17B restrictions
 * to ensure they use the correct capped indices for dedicated cement and steel PVC.
 * 
 * Run with: yarn tsx scripts/migrate-17b-bills.ts
 */

import { PrismaClient } from '@prisma/client';
import { getQuarterlyAverages } from '../lib/db-utils';
import { 
  calculateClassificationBasedPvcWithComponents, 
  calculateDedicatedCementPvc, 
  calculateDedicatedSteelPvc,
  getQuarterFromDate 
} from '../lib/pvc-calculations';
import { 
  calculateExtensionCompliantPvc, 
  getCappedIndices 
} from '../lib/extension-compliance';

const prisma = new PrismaClient();

interface MigrationResult {
  billId: string;
  billNo: string;
  contractNo: string;
  previousTotalPvc: number;
  newTotalPvc: number;
  pvcDifference: number;
  previousSavings: number;
  newSavings: number;
  status: 'success' | 'error';
  error?: string;
}

async function migrateBill(billId: string): Promise<MigrationResult> {
  try {
    // Get the bill with related data
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      include: {
        contract: true,
        workClassification: true,
        classificationEntries: {
          include: {
            classification: true,
            subClassification: true
          }
        },
        pvcCalculation: true
      }
    });

    if (!bill) {
      throw new Error('Bill not found');
    }

    console.log(`\n📋 Processing Bill: ${bill.billNo} (Contract: ${bill.contract.agreementNo})`);
    
    // Store previous values for comparison
    const previousTotalPvc = bill.pvcCalculation?.totalPvc || 0;
    const previousSavings = bill.pvcCalculation?.pvcSavingsDueToRestriction || 0;

    // Determine correct quarter for 17B extensions
    let correctQuarter = bill.quarter;
    let quarterRecalculated = false;

    if (bill.contract.isExtended && 
        bill.contract.extensionType === '17B' && 
        bill.contract.originalCompletionDate && 
        bill.dateOfMeasurement > bill.contract.originalCompletionDate) {
      correctQuarter = getQuarterFromDate(bill.contract.originalCompletionDate, bill.contract.baseMonth);

      if (correctQuarter !== bill.quarter) {
        quarterRecalculated = true;
        console.log(`   📅 Quarter recalculated: ${bill.quarter} → ${correctQuarter}`);
        
        // Update the quarter in the bill record
        await prisma.bill.update({
          where: { id: billId },
          data: { quarter: correctQuarter }
        });
      }
    }

    // Get all indices for comprehensive calculation
    const allIndices = [
      'Labour', 'RBI Plant Machinery', 'MPNG Fuel', 'RBI Other Materials',
      'RBI Cement', 'RBI Explosives',
      'Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'
    ];

    const quarterlyAverages = await getQuarterlyAverages(
      correctQuarter,
      allIndices,
      bill.contract.baseMonth,
      'auto'
    );

    // Get classification components
    let classificationComponents = null;
    let classificationCode = null;

    // Try new classification entries first
    if (bill.classificationEntries && bill.classificationEntries.length > 0) {
      const firstEntry = bill.classificationEntries[0];
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
      }
    }

    // Fallback to legacy workClassification
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
    }

    if (!classificationComponents) {
      throw new Error('No work classification found for this bill');
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
        true
      );
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

    // Calculate dedicated cement and steel PVC
    let dedicatedCementPvc = 0;
    let dedicatedSteelPvc = 0;
    let unrestrictedDedicatedCementPvc = 0;
    let unrestrictedDedicatedSteelPvc = 0;

    if (extensionCompliantResult.appliedRestrictions.isRestricted && 
        extensionCompliantResult.appliedRestrictions.restrictionType === '17B_INDEX_CAP') {
      
      console.log('   🔒 17B restriction applies - using capped indices');
      
      // Calculate unrestricted values for comparison
      unrestrictedDedicatedCementPvc = calculateDedicatedCementPvc(bill.cementAmount || 0, quarterlyAverages);
      unrestrictedDedicatedSteelPvc = calculateDedicatedSteelPvc(bill.steelAmount || 0, quarterlyAverages, bill.selectedSteelComponent || undefined);

      // Get the capped indices
      const restrictionDate = extensionCompliantResult.extensionDetails.pvcRestrictionDate || 
                              extensionCompliantResult.extensionDetails.originalCompletionDate;
      if (!restrictionDate) {
        throw new Error('No restriction date found for 17B calculation');
      }

      const { cappedIndices: cappedIndicesMap } = await getCappedIndices(
        restrictionDate,
        quarterlyAverages,
        bill.contract.baseMonth
      );

      // Create restricted quarterly averages
      const restrictedQuarterlyAverages = quarterlyAverages.map(qa => ({
        ...qa,
        average: cappedIndicesMap[qa.indexName] !== undefined ? cappedIndicesMap[qa.indexName] : qa.average
      }));

      dedicatedCementPvc = calculateDedicatedCementPvc(bill.cementAmount || 0, restrictedQuarterlyAverages);
      dedicatedSteelPvc = calculateDedicatedSteelPvc(bill.steelAmount || 0, restrictedQuarterlyAverages, bill.selectedSteelComponent || undefined);
      
      console.log('   💰 Dedicated Cement PVC: ₹' + dedicatedCementPvc.toFixed(2));
      console.log('   💰 Dedicated Steel PVC: ₹' + dedicatedSteelPvc.toFixed(2));
    } else {
      // No restriction - use unrestricted quarterly averages
      dedicatedCementPvc = calculateDedicatedCementPvc(bill.cementAmount || 0, quarterlyAverages);
      dedicatedSteelPvc = calculateDedicatedSteelPvc(bill.steelAmount || 0, quarterlyAverages, bill.selectedSteelComponent || undefined);
      
      unrestrictedDedicatedCementPvc = dedicatedCementPvc;
      unrestrictedDedicatedSteelPvc = dedicatedSteelPvc;
    }

    // Calculate total PVC including dedicated calculations
    const totalPvcWithDedicated = extensionCompliantResult.totalPvc 
      - extensionCompliantResult.cementPvc 
      - extensionCompliantResult.steelPvc 
      + dedicatedCementPvc 
      + dedicatedSteelPvc;

    // Calculate financial impact including dedicated cement/steel
    const adjustedOriginalPvcAmount = (extensionCompliantResult.appliedRestrictions.originalPvcAmount || 0) 
      + unrestrictedDedicatedCementPvc + unrestrictedDedicatedSteelPvc;
    const adjustedRestrictedPvcAmount = (extensionCompliantResult.appliedRestrictions.restrictedPvcAmount || 0) 
      + dedicatedCementPvc + dedicatedSteelPvc;
    const adjustedSavings = Math.max(0, adjustedOriginalPvcAmount - adjustedRestrictedPvcAmount);

    // Get previous cumulative PVC
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

    // Delete existing PVC calculation
    if (bill.pvcCalculation) {
      await prisma.pvcCalculation.delete({
        where: { id: bill.pvcCalculation.id }
      });
    }

    // Create new PVC calculation
    await prisma.pvcCalculation.create({
      data: {
        contractId: bill.contractId,
        billId: bill.id,
        labourPvc: extensionCompliantResult.labourPvc,
        plantMachineryPvc: extensionCompliantResult.plantMachineryPvc,
        fuelPowerPvc: extensionCompliantResult.fuelPowerPvc,
        otherMaterialsPvc: extensionCompliantResult.otherMaterialsPvc,
        cementPvc: extensionCompliantResult.cementPvc,
        explosivesPvc: extensionCompliantResult.explosivesPvc,
        steelPvc: extensionCompliantResult.steelPvc,
        dedicatedCementPvc: dedicatedCementPvc,
        dedicatedSteelPvc: dedicatedSteelPvc,
        totalPvc: totalPvcWithDedicated,
        previousPvcTotal,
        cumulativePvc: previousPvcTotal + totalPvcWithDedicated,
        
        // Extension compliance fields
        isExtensionPeriod: extensionCompliantResult.extensionDetails.isInExtensionPeriod,
        extensionType: extensionCompliantResult.extensionDetails.extensionType,
        isIndexCapped: extensionCompliantResult.appliedRestrictions.isRestricted,
        indexCapDate: extensionCompliantResult.extensionDetails.pvcRestrictionDate,
        
        // Capped indices
        cappedLabourIndex: extensionCompliantResult.appliedRestrictions.cappedIndices?.labour,
        cappedPlantIndex: extensionCompliantResult.appliedRestrictions.cappedIndices?.plantMachinery,
        cappedFuelIndex: extensionCompliantResult.appliedRestrictions.cappedIndices?.fuel,
        cappedMaterialsIndex: extensionCompliantResult.appliedRestrictions.cappedIndices?.otherMaterials,
        cappedCementIndex: extensionCompliantResult.appliedRestrictions.cappedIndices?.cement,
        cappedSteelIndex: extensionCompliantResult.appliedRestrictions.cappedIndices?.steel,
        cappedExplosivesIndex: extensionCompliantResult.appliedRestrictions.cappedIndices?.explosives,
        
        // PVC restriction details
        pvcRestrictionReason: extensionCompliantResult.appliedRestrictions.isRestricted 
          ? `GCC ${extensionCompliantResult.extensionDetails.extensionType} Extension - PVC restriction applied as per clause 46A.10`
          : null,
        originalPvcAmount: adjustedOriginalPvcAmount,
        restrictedPvcAmount: adjustedRestrictedPvcAmount,
        pvcSavingsDueToRestriction: adjustedSavings
      }
    });

    const pvcDifference = totalPvcWithDedicated - previousTotalPvc;
    const newSavings = adjustedSavings;

    console.log(`   ✅ Success! PVC: ₹${previousTotalPvc.toFixed(2)} → ₹${totalPvcWithDedicated.toFixed(2)} (Δ ₹${pvcDifference.toFixed(2)})`);
    console.log(`   💰 Railway Savings: ₹${previousSavings.toFixed(2)} → ₹${newSavings.toFixed(2)}`);

    return {
      billId: bill.id,
      billNo: bill.billNo,
      contractNo: bill.contract.agreementNo,
      previousTotalPvc,
      newTotalPvc: totalPvcWithDedicated,
      pvcDifference,
      previousSavings,
      newSavings,
      status: 'success'
    };

  } catch (error) {
    console.error(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return {
      billId,
      billNo: 'Unknown',
      contractNo: 'Unknown',
      previousTotalPvc: 0,
      newTotalPvc: 0,
      pvcDifference: 0,
      previousSavings: 0,
      newSavings: 0,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function main() {
  console.log('🚀 Starting 17B Bills Migration...\n');
  console.log('=' .repeat(80));

  try {
    // Find all bills that need 17B restriction calculation
    // These are bills where:
    // 1. Contract has a 17B extension
    // 2. Bill measurement date is after original completion date
    const allBills = await prisma.bill.findMany({
      where: {
        contract: {
          isExtended: true,
          extensionType: '17B',
          originalCompletionDate: {
            not: null
          }
        }
      },
      include: {
        contract: true,
        pvcCalculation: true
      }
    });

    // Filter bills where measurement date is after original completion date
    const billsToMigrate = allBills.filter((bill: any) => 
      bill.contract.originalCompletionDate && 
      bill.dateOfMeasurement > bill.contract.originalCompletionDate
    );

    console.log(`\n📊 Found ${billsToMigrate.length} bills that need 17B recalculation\n`);

    if (billsToMigrate.length === 0) {
      console.log('✅ No bills found. All bills are up to date!');
      return;
    }

    // Migrate each bill
    const results: MigrationResult[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const bill of billsToMigrate) {
      const result = await migrateBill(bill.id);
      results.push(result);

      if (result.status === 'success') {
        successCount++;
      } else {
        errorCount++;
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('📈 MIGRATION SUMMARY');
    console.log('='.repeat(80));
    console.log(`\n✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${errorCount}`);
    console.log(`📋 Total: ${results.length}\n`);

    // Print detailed results
    if (successCount > 0) {
      console.log('💰 FINANCIAL IMPACT:');
      console.log('-'.repeat(80));
      const totalPvcChange = results
        .filter(r => r.status === 'success')
        .reduce((sum, r) => sum + r.pvcDifference, 0);
      const totalSavingsChange = results
        .filter(r => r.status === 'success')
        .reduce((sum, r) => sum + (r.newSavings - r.previousSavings), 0);

      console.log(`Total PVC Change: ₹${totalPvcChange.toFixed(2)}`);
      console.log(`Total Railway Savings Change: ₹${totalSavingsChange.toFixed(2)}`);
    }

    // Print errors
    if (errorCount > 0) {
      console.log('\n❌ ERRORS:');
      console.log('-'.repeat(80));
      results
        .filter(r => r.status === 'error')
        .forEach(r => {
          console.log(`Bill: ${r.billNo} (${r.contractNo})`);
          console.log(`Error: ${r.error}\n`);
        });
    }

    console.log('\n✨ Migration complete!\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
