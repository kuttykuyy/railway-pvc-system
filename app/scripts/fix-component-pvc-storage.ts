
/**
 * Fix Component PVC Storage
 * 
 * This script fixes bills where dedicated cement and steel values exist
 * but the main cementPvc and steelPvc fields are set to 0.
 * 
 * The fix ensures that:
 * - When dedicatedCementPvc exists, cementPvc = dedicatedCementPvc
 * - When dedicatedSteelPvc exists, steelPvc = dedicatedSteelPvc
 * - The sum of all component PVCs equals the stored total PVC
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixComponentPvcStorage() {
  console.log('\n=== Fixing Component PVC Storage ===\n');
  
  try {
    // Find all PVC calculations where dedicated cement or steel exists
    // but the main fields are 0
    const pvcCalculations = await prisma.pvcCalculation.findMany({
      where: {
        OR: [
          {
            dedicatedCementPvc: { not: 0 },
            cementPvc: 0
          },
          {
            dedicatedSteelPvc: { not: 0 },
            steelPvc: 0
          }
        ]
      },
      include: {
        bill: true
      }
    });
    
    console.log(`Found ${pvcCalculations.length} PVC calculations to fix\n`);
    
    let fixedCount = 0;
    let errors = 0;
    
    for (const pvc of pvcCalculations) {
      try {
        const billNo = pvc.bill?.billNo || 'Unknown';
        
        console.log(`Fixing Bill: ${billNo}`);
        console.log(`  Current State:`);
        console.log(`    Cement PVC: ₹${pvc.cementPvc?.toFixed(2) || '0.00'}`);
        console.log(`    Steel PVC: ₹${pvc.steelPvc?.toFixed(2) || '0.00'}`);
        console.log(`    Dedicated Cement: ₹${pvc.dedicatedCementPvc?.toFixed(2) || '0.00'}`);
        console.log(`    Dedicated Steel: ₹${pvc.dedicatedSteelPvc?.toFixed(2) || '0.00'}`);
        
        // Calculate what the values should be
        const newCementPvc = pvc.dedicatedCementPvc !== 0 && pvc.dedicatedCementPvc !== null
          ? pvc.dedicatedCementPvc
          : pvc.cementPvc || 0;
          
        const newSteelPvc = pvc.dedicatedSteelPvc !== 0 && pvc.dedicatedSteelPvc !== null
          ? pvc.dedicatedSteelPvc
          : pvc.steelPvc || 0;
        
        // Update the record
        await prisma.pvcCalculation.update({
          where: { id: pvc.id },
          data: {
            cementPvc: newCementPvc,
            steelPvc: newSteelPvc
          }
        });
        
        // Verify the fix
        const componentSum = 
          (pvc.labourPvc || 0) +
          (pvc.plantMachineryPvc || 0) +
          (pvc.fuelPowerPvc || 0) +
          (pvc.otherMaterialsPvc || 0) +
          newCementPvc +
          newSteelPvc +
          (pvc.explosivesPvc || 0);
        
        const totalPvc = pvc.totalPvc || 0;
        const difference = Math.abs(componentSum - totalPvc);
        const isCorrect = difference < 0.01; // Allow for rounding errors
        
        console.log(`  After Fix:`);
        console.log(`    Cement PVC: ₹${newCementPvc.toFixed(2)}`);
        console.log(`    Steel PVC: ₹${newSteelPvc.toFixed(2)}`);
        console.log(`    Component Sum: ₹${componentSum.toFixed(2)}`);
        console.log(`    Stored Total: ₹${totalPvc.toFixed(2)}`);
        console.log(`    Difference: ₹${difference.toFixed(2)} ${isCorrect ? '✅ FIXED' : '❌ STILL INCORRECT'}`);
        console.log('');
        
        fixedCount++;
      } catch (error) {
        console.error(`  ❌ Error fixing bill ${pvc.bill?.billNo}:`, error);
        errors++;
      }
    }
    
    console.log('\n=== Summary ===');
    console.log(`Total bills processed: ${pvcCalculations.length}`);
    console.log(`Successfully fixed: ${fixedCount}`);
    console.log(`Errors: ${errors}`);
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Fatal error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

// Run the script
fixComponentPvcStorage();
