/**
 * Migration Script: Recalculate Index_L Using Three-Month Average
 * 
 * This script updates all 17B restricted bills to use the correct Index_L calculation:
 * Index_L = Average of the three months immediately following the original completion date
 * 
 * Previously: Index_L = Last month of original completion period (single month)
 * Now: Index_L = Average of (Month1, Month2, Month3) after completion
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { calculateExtensionCompliantPvc } from '../lib/extension-compliance';

const prisma = new PrismaClient();

async function migrateIndexL() {
  console.log('🔄 Starting Index_L migration to three-month average...\n');
  
  try {
    // Find all bills with 17B extension
    const billsToUpdate = await prisma.bill.findMany({
      where: {
        pvcCalculation: {
          extensionType: '17B'
        }
      },
      include: {
        contract: {
          include: {
            extensions: true
          }
        },
        pvcCalculation: true,
        classificationEntries: {
          include: {
            classification: true,
            subClassification: true
          }
        }
      }
    });
    
    console.log(`Found ${billsToUpdate.length} bills with 17B extension\n`);
    
    if (billsToUpdate.length === 0) {
      console.log('✅ No bills to migrate');
      return;
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const bill of billsToUpdate) {
      try {
        console.log(`\n📋 Processing Bill: ${bill.pvcNumber}`);
        console.log(`   Contract: ${bill.contract.agreementNo}`);
        console.log(`   Bill Amount: ${bill.billAmount.toLocaleString('en-IN')}`);
        
        // Get the 17B extension details
        const extension17B = bill.contract.extensions.find((ext: any) => ext.extensionType === '17B');
        
        if (!extension17B) {
          console.log(`   ⚠️ No 17B extension found for this bill, skipping`);
          continue;
        }
        
        const oldIndexL_Labour = bill.pvcCalculation?.indexL_Labour || 0;
        const oldIndexL_Plant = bill.pvcCalculation?.indexL_Plant || 0;
        
        console.log(`   Old Index_L (Labour): ${oldIndexL_Labour.toFixed(2)}`);
        console.log(`   Old Index_L (Plant): ${oldIndexL_Plant.toFixed(2)}`);
        
        // Get quarterly averages from the bill's quarter
        const { getQuarterlyAverages } = await import('../lib/db-utils');
        
        // Get all index names needed
        const priceIndexNames = [
          'Labour',
          'RBI Plant Machinery',
          'MPNG Fuel',
          'RBI Other Materials',
          'RBI Cement',
          'Steel TMT Bars',
          'Steel Angle/Channel',
          'Steel Plates',
          'Steel Other Sections',
          'RBI Explosives'
        ];
        
        const quarterlyAverages = await getQuarterlyAverages(
          bill.quarter,
          priceIndexNames,
          bill.contract.baseMonth,
          'auto' // calculation method
        );
        
        // Get work classification code from the first classification entry
        const workClassificationCode = bill.classificationEntries[0]?.subClassification?.code || 
                                       bill.classificationEntries[0]?.classification?.code || 
                                       null;
        
        console.log(`   Quarter: ${bill.quarter}`);
        console.log(`   Work Classification: ${workClassificationCode || 'N/A'}`);
        
        // Recalculate PVC with the new three-month average Index_L
        const result = await calculateExtensionCompliantPvc(
          bill.contract.id,
          bill.billAmount,
          bill.dateOfMeasurement,
          quarterlyAverages,
          workClassificationCode,
          true // includeDetailedSteps
        );
        
        // Update the bill with the new calculations
        await prisma.pvcCalculation.update({
          where: { billId: bill.id },
          data: {
            // Update Index_L values (now three-month averages)
            indexL_Labour: result.appliedRestrictions?.indexL_Values?.labour,
            indexL_Plant: result.appliedRestrictions?.indexL_Values?.plantMachinery,
            indexL_Fuel: result.appliedRestrictions?.indexL_Values?.fuel,
            indexL_Materials: result.appliedRestrictions?.indexL_Values?.otherMaterials,
            indexL_Cement: result.appliedRestrictions?.indexL_Values?.cement,
            indexL_Steel: result.appliedRestrictions?.indexL_Values?.steel,
            indexL_Explosives: result.appliedRestrictions?.indexL_Values?.explosives,
            
            // Update capped indices (may change due to new Index_L)
            cappedLabourIndex: result.appliedRestrictions?.cappedIndices?.labour,
            cappedPlantIndex: result.appliedRestrictions?.cappedIndices?.plantMachinery,
            cappedFuelIndex: result.appliedRestrictions?.cappedIndices?.fuel,
            cappedMaterialsIndex: result.appliedRestrictions?.cappedIndices?.otherMaterials,
            cappedCementIndex: result.appliedRestrictions?.cappedIndices?.cement,
            cappedSteelIndex: result.appliedRestrictions?.cappedIndices?.steel,
            cappedExplosivesIndex: result.appliedRestrictions?.cappedIndices?.explosives,
            
            // Update PVC amounts (may change due to new capped values)
            labourPvc: result.labourPvc,
            plantMachineryPvc: result.plantMachineryPvc,
            fuelPowerPvc: result.fuelPowerPvc,
            otherMaterialsPvc: result.otherMaterialsPvc,
            cementPvc: result.cementPvc,
            steelPvc: result.steelPvc,
            explosivesPvc: result.explosivesPvc,
            totalPvc: result.totalPvc,
            
            // Update financial impact
            originalPvcAmount: result.appliedRestrictions?.originalPvcAmount,
            restrictedPvcAmount: result.appliedRestrictions?.restrictedPvcAmount,
            pvcSavingsDueToRestriction: result.appliedRestrictions?.savingsAmount
          }
        });
        
        const newIndexL_Labour = result.appliedRestrictions?.indexL_Values?.labour || 0;
        const newIndexL_Plant = result.appliedRestrictions?.indexL_Values?.plantMachinery || 0;
        
        console.log(`   ✅ Updated Index_L (Labour): ${oldIndexL_Labour.toFixed(2)} → ${newIndexL_Labour.toFixed(2)}`);
        console.log(`   ✅ Updated Index_L (Plant): ${oldIndexL_Plant.toFixed(2)} → ${newIndexL_Plant.toFixed(2)}`);
        console.log(`   ✅ Total PVC: ${result.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
        
        successCount++;
      } catch (error) {
        console.error(`   ❌ Error processing bill ${bill.pvcNumber}:`, error);
        errorCount++;
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary:');
    console.log(`   Total Bills: ${billsToUpdate.length}`);
    console.log(`   ✅ Successfully Updated: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
migrateIndexL().catch(console.error);
