import { config } from 'dotenv';
config();

import { PrismaClient } from '@prisma/client';
import { calculateClassificationEntryPvc } from '../lib/pvc-calculations';
import { getQuarterlyAverages } from '../lib/db-utils';

const prisma = new PrismaClient();

async function fixClassificationEntryPvc() {
  try {
    console.log('\n🔧 ===== FIXING CLASSIFICATION ENTRY PVC VALUES =====\n');
    
    // Find all bills with classification entries that have 0 PVC values
    const bills = await prisma.bill.findMany({
      where: {
        classificationEntries: {
          some: {
            AND: [
              { steelPvc: 0 },
              { labourPvc: 0 },
              { totalPvc: 0 }
            ]
          }
        }
      },
      include: {
        contract: true,
        classificationEntries: {
          where: {
            AND: [
              { steelPvc: 0 },
              { labourPvc: 0 },
              { totalPvc: 0 }
            ]
          },
          include: {
            subClassification: true,
            classification: true
          }
        }
      }
    });

    console.log(`Found ${bills.length} bills with zero PVC classification entries\n`);

    let totalFixed = 0;

    for (const bill of bills) {
      console.log(`\n📋 Processing Bill: ${bill.billNo || bill.id}`);
      console.log(`   Quarter: ${bill.quarter}`);
      console.log(`   Steel Types: ${JSON.stringify(bill.steelTypes)}`);
      console.log(`   Classification Entries: ${bill.classificationEntries.length}`);

      if (bill.classificationEntries.length === 0) {
        console.log(`   ⏭️  Skipping - no classification entries`);
        continue;
      }

      // Get quarterly averages for this bill
      const allIndices = [
        'Labour', 'RBI Plant Machinery', 'MPNG Fuel', 'RBI Other Materials',
        'RBI Cement', 'RBI Explosives',
        'Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'
      ];

      try {
        const quarterlyAverages = await getQuarterlyAverages(
          bill.quarter,
          allIndices,
          bill.contract.baseMonth,
          'auto' // Use auto as default calculation method
        );

        console.log(`   ✅ Got ${quarterlyAverages.length} quarterly averages`);

        // Recalculate PVC for each classification entry
        for (const entry of bill.classificationEntries) {
          const classificationName = entry.subClassification?.name || entry.classification?.name || 'Unknown';
          console.log(`\n   📊 Recalculating entry: ${classificationName}`);
          console.log(`      Amount: ₹${entry.amount.toLocaleString()}`);
          console.log(`      Entry Steel Types: ${JSON.stringify(entry.steelTypes)}`);

          const hasDedicatedCement = bill.cementAmount && Number(bill.cementAmount) > 0;
          const hasDedicatedSteel = 
            (bill.steelTmtBarsAmount && Number(bill.steelTmtBarsAmount) > 0) ||
            (bill.steelAngleChannelAmount && Number(bill.steelAngleChannelAmount) > 0) ||
            (bill.steelPlatesAmount && Number(bill.steelPlatesAmount) > 0) ||
            (bill.steelOtherSectionsAmount && Number(bill.steelOtherSectionsAmount) > 0);

          // Calculate PVC
          const entryPvc = await calculateClassificationEntryPvc(
            {
              subClassificationId: entry.subClassificationId || undefined,
              classificationId: entry.classificationId || undefined,
              amount: entry.amount,
              steelTypes: (entry.steelTypes as string[]) || []
            },
            quarterlyAverages,
            {
              hasDedicatedSteel,
              hasDedicatedCement
            }
          );

          console.log(`      New Labour PVC: ₹${entryPvc.labourPvc.toFixed(2)}`);
          console.log(`      New Steel PVC: ₹${entryPvc.steelPvc.toFixed(2)}`);
          console.log(`      New Total PVC: ₹${entryPvc.totalPvc.toFixed(2)}`);

          // Update the entry
          await prisma.billClassificationEntry.update({
            where: { id: entry.id },
            data: {
              labourPvc: entryPvc.labourPvc,
              plantMachineryPvc: entryPvc.plantMachineryPvc,
              fuelPowerPvc: entryPvc.fuelPowerPvc,
              otherMaterialsPvc: entryPvc.otherMaterialsPvc,
              cementPvc: entryPvc.cementPvc,
              steelPvc: entryPvc.steelPvc,
              explosivesPvc: entryPvc.explosivesPvc,
              totalPvc: entryPvc.totalPvc
            }
          });

          console.log(`      ✅ Entry updated`);
          totalFixed++;
        }

      } catch (error: any) {
        console.error(`   ❌ Error processing bill ${bill.billNo}:`, error.message);
      }
    }

    console.log(`\n\n✅ ===== COMPLETE ===== `);
    console.log(`Total classification entries fixed: ${totalFixed}`);

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixClassificationEntryPvc();
