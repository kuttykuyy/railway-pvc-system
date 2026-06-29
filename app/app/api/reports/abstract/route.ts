import { logger } from '@/lib/logger';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getQuarterFromDate, calculateClassificationEntryPvc } from '@/lib/pvc-calculations';
import { getQuarterlyAverages } from '@/lib/db-utils';
import { getSteelIndexNamesForZone, getFuelIndexNameForBill } from '@/lib/zone-steel-city-mapping';
import { format } from 'date-fns';

export const dynamic = "force-dynamic";

interface BillData {
  billNo: string;
  quarter: string;
  measurementDate: string;
  billAmount: number;
  labour: number;
  material: number; // Other Materials
  fuel: number;
  plantMachinery: number;
  cement: number;
  steelTmt: number;
  steelAngleChannel: number;
  steelPlates: number;
  steelOtherSections: number;
  total: number;
}

interface ClassificationSteel {
  classificationCode: string;
  classificationName: string;
  billNo: string;
  quarter: string;
  steelPvc: number;
  steelTypes: string[];
}



export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get('contractId');
    
    if (!contractId) {
      return NextResponse.json(
        { error: 'Contract ID is required' },
        { status: 400 }
      );
    }

    // Get contract details
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
    });

    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    // Get all bills for this contract with PVC calculations and classification entries
    const bills = await prisma.bill.findMany({
      where: { contractId: contractId },
      include: {
        pvcCalculation: true,
        classificationEntries: {
          include: {
            classification: true,
            subClassification: true,
          }
        }
      },
      orderBy: { dateOfMeasurement: 'asc' }
    });

    // Filter bills that have PVC calculations
    const billsWithPvc = bills.filter((bill: any) => bill.pvcCalculation);

    if (billsWithPvc.length === 0) {
      return NextResponse.json(
        { error: 'No bills with PVC calculations found for this contract' },
        { status: 404 }
      );
    }

    // ===== FIX MISSING CLASSIFICATION ENTRY PVC DATA =====
    // Check and recalculate any classification entries that have all 0 PVC values

    for (const bill of billsWithPvc) {
      // Use zone-based steel city prices for each bill
      const steelNames = getSteelIndexNamesForZone((bill as any).zone);
      const fuelIndexName = getFuelIndexNameForBill((bill as any).zone, (bill as any).fuelPriceType);
      const allIndices = [
        'Labour', 'RBI Plant Machinery', fuelIndexName, 'RBI Other Materials',
        'RBI Cement', 'RBI Explosives',
        ...steelNames
      ];

      // Check if any classification entries have 0 PVC values
      const entriesNeedingFix = bill.classificationEntries.filter(
        entry => entry.steelPvc === 0 && entry.labourPvc === 0 && entry.totalPvc === 0
      );

      if (entriesNeedingFix.length > 0) {
        logger.log(`🔧 Recalculating ${entriesNeedingFix.length} classification entries for bill ${bill.billNo}`);
        
        // Get quarterly averages for this bill's quarter
        const quarterlyAverages = await getQuarterlyAverages(
          bill.quarter,
          allIndices,
          contract.baseMonth,
          'auto' // Use auto as default calculation method
        );

        const hasDedicatedCement = bill.cementAmount && Number(bill.cementAmount) > 0;
        const hasDedicatedSteel = 
          (bill.steelTmtBarsAmount && Number(bill.steelTmtBarsAmount) > 0) ||
          (bill.steelAngleChannelAmount && Number(bill.steelAngleChannelAmount) > 0) ||
          (bill.steelPlatesAmount && Number(bill.steelPlatesAmount) > 0) ||
          (bill.steelOtherSectionsAmount && Number(bill.steelOtherSectionsAmount) > 0);

        // Recalculate and update each entry
        for (const entry of entriesNeedingFix) {
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

          // Update the entry in the database
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

          // Update the entry in memory for the current request
          entry.labourPvc = entryPvc.labourPvc;
          entry.plantMachineryPvc = entryPvc.plantMachineryPvc;
          entry.fuelPowerPvc = entryPvc.fuelPowerPvc;
          entry.otherMaterialsPvc = entryPvc.otherMaterialsPvc;
          entry.cementPvc = entryPvc.cementPvc;
          entry.steelPvc = entryPvc.steelPvc;
          entry.explosivesPvc = entryPvc.explosivesPvc;
          entry.totalPvc = entryPvc.totalPvc;
        }

        logger.log(`✅ Fixed ${entriesNeedingFix.length} entries for bill ${bill.billNo}`);
      }
    }
    // ===== END FIX =====

    // Build bill data - one row per bill
    const billData: BillData[] = [];
    const classificationSteelData: ClassificationSteel[] = [];
    let totalForLabourFuelMaterialsPlant = 0;
    let totalForCement = 0;
    let totalForSteelTmt = 0;
    let totalForSteelAngleChannel = 0;
    let totalForSteelPlates = 0;
    let totalForSteelOtherSections = 0;
    let grandTotal = 0;

    billsWithPvc.forEach(bill => {
      const quarter = getQuarterFromDate(new Date(bill.dateOfMeasurement), new Date(contract.baseMonth));
      
      if (bill.pvcCalculation) {
        const labour = bill.pvcCalculation.labourPvc;
        const material = bill.pvcCalculation.otherMaterialsPvc;
        const fuel = bill.pvcCalculation.fuelPowerPvc;
        const plantMachinery = bill.pvcCalculation.plantMachineryPvc;
        
        // Cement: include both regular and dedicated
        const cement = bill.pvcCalculation.cementPvc + bill.pvcCalculation.dedicatedCementPvc;
        
        // Calculate steel components by checking actual steel types from classification entries
        let steelTmt = 0;
        let steelAngleChannel = 0;
        let steelPlates = 0;
        let steelOtherSections = 0;
        
        // Iterate through classification entries to distribute steel PVC correctly
        if (bill.classificationEntries && bill.classificationEntries.length > 0) {
          bill.classificationEntries.forEach(entry => {
            if (entry.steelPvc && entry.steelPvc !== 0) {
              // Get steel types for this classification entry
              let steelTypes: string[] = [];
              if (entry.steelTypes && Array.isArray(entry.steelTypes)) {
                steelTypes = entry.steelTypes.filter((type): type is string => typeof type === 'string');
              }
              
              // If no steel types specified, default to TMT for backward compatibility
              if (steelTypes.length === 0) {
                steelTmt += entry.steelPvc;
              } else {
                // Distribute steel PVC equally among selected types
                const pvcPerType = entry.steelPvc / steelTypes.length;
                steelTypes.forEach(type => {
                  switch (type) {
                    case 'TMT':
                    case 'TMT_BARS':
                      steelTmt += pvcPerType;
                      break;
                    case 'ANGLE_CHANNEL':
                    case 'ANGLES':
                    case 'CHANNELS':
                      steelAngleChannel += pvcPerType;
                      break;
                    case 'PLATES':
                      steelPlates += pvcPerType;
                      break;
                    case 'OTHER_SECTIONS':
                      steelOtherSections += pvcPerType;
                      break;
                    default:
                      // Unknown type, add to TMT for safety
                      steelTmt += pvcPerType;
                  }
                });
              }
            }
          });
          
          // ADD dedicated steel components to the classification-based steel
          steelTmt += (bill.pvcCalculation.dedicatedSteelTmtBarsPvc || 0);
          steelAngleChannel += (bill.pvcCalculation.dedicatedSteelAngleChannelPvc || 0);
          steelPlates += (bill.pvcCalculation.dedicatedSteelPlatesPvc || 0);
          steelOtherSections += (bill.pvcCalculation.dedicatedSteelOtherSectionsPvc || 0);
        } else {
          // Fallback: use bill-level PVC calculation fields (old logic for bills without classification entries)
          steelTmt = bill.pvcCalculation.steelPvc + (bill.pvcCalculation.dedicatedSteelTmtBarsPvc || 0);
          steelAngleChannel = bill.pvcCalculation.dedicatedSteelAngleChannelPvc || 0;
          steelPlates = bill.pvcCalculation.dedicatedSteelPlatesPvc || 0;
          steelOtherSections = bill.pvcCalculation.dedicatedSteelOtherSectionsPvc || 0;
        }
        
        // Main components total
        const mainTotal = labour + material + fuel + plantMachinery;
        
        // Row total including cement and all steel types
        const rowTotal = mainTotal + cement + steelTmt + steelAngleChannel + steelPlates + steelOtherSections;
        
        // Calculate bill amount as sum of all component allocations from bill creation
        const calculatedBillAmount = (bill.billAmount || 0) + 
                                      (bill.cementAmount || 0) + 
                                      (bill.steelTmtBarsAmount || 0) + 
                                      (bill.steelAngleChannelAmount || 0) + 
                                      (bill.steelPlatesAmount || 0) + 
                                      (bill.steelOtherSectionsAmount || 0);
        
        billData.push({
          billNo: bill.billNo,
          quarter,
          measurementDate: format(new Date(bill.dateOfMeasurement), 'dd MMM yyyy'),
          billAmount: calculatedBillAmount,
          labour,
          material,
          fuel,
          plantMachinery,
          cement,
          steelTmt,
          steelAngleChannel,
          steelPlates,
          steelOtherSections,
          total: rowTotal
        });
        
        // Accumulate totals
        totalForLabourFuelMaterialsPlant += mainTotal;
        totalForCement += cement;
        totalForSteelTmt += steelTmt;
        totalForSteelAngleChannel += steelAngleChannel;
        totalForSteelPlates += steelPlates;
        totalForSteelOtherSections += steelOtherSections;
        grandTotal += rowTotal;
      }
      
      // Collect classification-level steel component data
      if (bill.classificationEntries && bill.classificationEntries.length > 0) {
        bill.classificationEntries.forEach(entry => {
          const classification = entry.subClassification || entry.classification;
          if (classification && entry.steelPvc && entry.steelPvc !== 0) {
            // Safely extract steel types
            let steelTypes: string[] = [];
            if (entry.steelTypes && Array.isArray(entry.steelTypes)) {
              steelTypes = entry.steelTypes.filter((type): type is string => typeof type === 'string');
            }
            
            classificationSteelData.push({
              classificationCode: classification.code || 'N/A',
              classificationName: classification.name || 'Unknown',
              billNo: bill.billNo,
              quarter,
              steelPvc: entry.steelPvc || 0,
              steelTypes
            });
          }
        });
      }
    });
    
    const totalSay = Math.round(grandTotal); // Round to nearest rupee (preserving sign)

    return NextResponse.json({
      contract: {
        agreementNo: contract.agreementNo,
        contractorName: contract.contractorName,
        workDescription: contract.workDescription,
        dateOfOpening: format(new Date(contract.dateOfOpening), 'dd MMM yyyy'),
        baseMonth: format(new Date(contract.baseMonth), 'MMM yyyy')
      },
      billData,
      classificationSteelData,
      totalForLabourFuelMaterialsPlant,
      totalForCement,
      totalForSteelTmt,
      totalForSteelAngleChannel,
      totalForSteelPlates,
      totalForSteelOtherSections,
      grandTotal,
      totalSay
    });

  } catch (error) {
    console.error('Error generating abstract data:', error);
    return NextResponse.json(
      { error: 'Failed to generate abstract data' },
      { status: 500 }
    );
  }
}

