/**
 * Fix Total PVC Recalculation
 * 
 * This script recalculates the totalPvc for bills where dedicated cement/steel amounts exist.
 * The totalPvc should be the sum of all component PVCs (including dedicated, but not classification-based when dedicated exist).
 */

import { config } from 'dotenv';
config();

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixTotalPvcRecalculation() {
  try {
    console.log('\n=== Fixing Total PVC Recalculation ===\n');

    // Find all bills with dedicated cement or steel amounts
    const billsWithDedicated = await prisma.pvcCalculation.findMany({
      where: {
        OR: [
          { dedicatedCementPvc: { not: 0 } },
          { dedicatedSteelPvc: { not: 0 } }
        ]
      },
      include: {
        bill: {
          select: {
            billNo: true
          }
        }
      }
    });

    console.log(`Found ${billsWithDedicated.length} bills with dedicated cement/steel amounts\n`);

    if (billsWithDedicated.length === 0) {
      console.log('No bills to fix.');
      await prisma.$disconnect();
      return;
    }

    let fixedCount = 0;

    for (const pvcCalc of billsWithDedicated) {
      // Calculate the correct total PVC
      // Sum all components including dedicated cement/steel
      const calculatedTotal = 
        (pvcCalc.labourPvc || 0) +
        (pvcCalc.plantMachineryPvc || 0) +
        (pvcCalc.fuelPowerPvc || 0) +
        (pvcCalc.otherMaterialsPvc || 0) +
        (pvcCalc.cementPvc || 0) +
        (pvcCalc.steelPvc || 0) +
        (pvcCalc.explosivesPvc || 0) +
        (pvcCalc.dedicatedCementPvc || 0) +
        (pvcCalc.dedicatedSteelPvc || 0);

      const storedTotal = pvcCalc.totalPvc;
      const difference = Math.abs(calculatedTotal - storedTotal);

      // Only fix if there's a difference (threshold of 0.01 for rounding errors)
      if (difference > 0.01) {
        console.log(`Fixing bill: ${pvcCalc.bill.billNo}`);
        console.log(`  Components:`);
        console.log(`    - Labour: ₹${(pvcCalc.labourPvc || 0).toFixed(2)}`);
        console.log(`    - Plant: ₹${(pvcCalc.plantMachineryPvc || 0).toFixed(2)}`);
        console.log(`    - Fuel: ₹${(pvcCalc.fuelPowerPvc || 0).toFixed(2)}`);
        console.log(`    - Materials: ₹${(pvcCalc.otherMaterialsPvc || 0).toFixed(2)}`);
        console.log(`    - Cement (classification): ₹${(pvcCalc.cementPvc || 0).toFixed(2)}`);
        console.log(`    - Steel (classification): ₹${(pvcCalc.steelPvc || 0).toFixed(2)}`);
        console.log(`    - Explosives: ₹${(pvcCalc.explosivesPvc || 0).toFixed(2)}`);
        console.log(`    - Dedicated Cement: ₹${(pvcCalc.dedicatedCementPvc || 0).toFixed(2)}`);
        console.log(`    - Dedicated Steel: ₹${(pvcCalc.dedicatedSteelPvc || 0).toFixed(2)}`);
        console.log(`  Stored Total PVC: ₹${storedTotal.toFixed(2)}`);
        console.log(`  Calculated Total PVC: ₹${calculatedTotal.toFixed(2)}`);
        console.log(`  Difference: ₹${difference.toFixed(2)}`);

        // Calculate new cumulative PVC
        const oldCumulative = pvcCalc.cumulativePvc;
        const newCumulative = (pvcCalc.previousPvcTotal || 0) + calculatedTotal;

        await prisma.pvcCalculation.update({
          where: { id: pvcCalc.id },
          data: {
            totalPvc: calculatedTotal,
            cumulativePvc: newCumulative
          }
        });

        console.log(`  ✓ Updated Total PVC to: ₹${calculatedTotal.toFixed(2)}`);
        console.log(`  ✓ Updated Cumulative PVC: ₹${oldCumulative.toFixed(2)} → ₹${newCumulative.toFixed(2)}`);
        console.log('');

        fixedCount++;
      }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Total bills checked: ${billsWithDedicated.length}`);
    console.log(`Bills fixed: ${fixedCount}`);
    console.log(`Bills already correct: ${billsWithDedicated.length - fixedCount}`);

    await prisma.$disconnect();
  } catch (error) {
    console.error('Error fixing total PVC:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

fixTotalPvcRecalculation();
