/**
 * Fix Component Double-Counting Issue
 * 
 * This script fixes bills where both classification-based and dedicated cement/steel
 * PVC values were stored, causing the total to be incorrect when components are summed.
 * 
 * The fix: When dedicated cement/steel amounts exist, set classification-based values to 0.
 */

import { config } from 'dotenv';
config();

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixComponentDoubleCounting() {
  try {
    console.log('\n=== Fixing Component Double-Counting Issue ===\n');

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
      const needsFixing = 
        (pvcCalc.dedicatedCementPvc !== 0 && pvcCalc.cementPvc !== 0) ||
        (pvcCalc.dedicatedSteelPvc !== 0 && pvcCalc.steelPvc !== 0);

      if (needsFixing) {
        console.log(`Fixing bill: ${pvcCalc.bill.billNo}`);
        console.log(`  Before:`);
        console.log(`    Classification Cement PVC: ₹${pvcCalc.cementPvc?.toFixed(2) || 0}`);
        console.log(`    Dedicated Cement PVC: ₹${pvcCalc.dedicatedCementPvc?.toFixed(2) || 0}`);
        console.log(`    Classification Steel PVC: ₹${pvcCalc.steelPvc?.toFixed(2) || 0}`);
        console.log(`    Dedicated Steel PVC: ₹${pvcCalc.dedicatedSteelPvc?.toFixed(2) || 0}`);

        await prisma.pvcCalculation.update({
          where: { id: pvcCalc.id },
          data: {
            cementPvc: pvcCalc.dedicatedCementPvc !== 0 ? 0 : pvcCalc.cementPvc,
            steelPvc: pvcCalc.dedicatedSteelPvc !== 0 ? 0 : pvcCalc.steelPvc
          }
        });

        console.log(`  After:`);
        console.log(`    Classification Cement PVC: ₹${pvcCalc.dedicatedCementPvc !== 0 ? '0.00' : pvcCalc.cementPvc?.toFixed(2)}`);
        console.log(`    Dedicated Cement PVC: ₹${pvcCalc.dedicatedCementPvc?.toFixed(2) || 0}`);
        console.log(`    Classification Steel PVC: ₹${pvcCalc.dedicatedSteelPvc !== 0 ? '0.00' : pvcCalc.steelPvc?.toFixed(2)}`);
        console.log(`    Dedicated Steel PVC: ₹${pvcCalc.dedicatedSteelPvc?.toFixed(2) || 0}`);
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
    console.error('Error fixing component double-counting:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

fixComponentDoubleCounting();
