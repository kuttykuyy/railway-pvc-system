
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getQuarterlyAverages } from '@/lib/db-utils';
import { 
  calculateClassificationBasedPvcWithComponentsAndSteps,
  calculateDedicatedCementPvcWithSteps,
  calculateComprehensiveSteelPvcWithSteps
} from '@/lib/pvc-calculations';
import { getSteelIndexNamesForZone, getFuelIndexNameForBill } from '@/lib/zone-steel-city-mapping';

export const dynamic = "force-dynamic";

// GET /api/bills/[id]/calculation-steps - Get detailed calculation steps for a bill
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const billId = id;
    
    // Get the bill with related data
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      include: {
        contract: true,
        workClassification: true,
        pvcCalculation: true
      }
    });
    
    if (!bill) {
      return NextResponse.json(
        { error: 'Bill not found' },
        { status: 404 }
      );
    }
    
    if (!bill.pvcCalculation) {
      return NextResponse.json(
        { error: 'PVC calculation not found for this bill' },
        { status: 404 }
      );
    }
    
    // Get all indices for calculation - use zone-based steel city prices
    const steelIndexNames = getSteelIndexNamesForZone(bill.zone);
    const fuelIndexName = getFuelIndexNameForBill(bill.zone, bill.fuelPriceType);
    const allIndices = [
      'Labour', 'RBI Plant Machinery', fuelIndexName, 'RBI Other Materials',
      'RBI Cement', 'RBI Explosives',
      ...steelIndexNames
    ];
    
    const quarterlyAverages = await getQuarterlyAverages(
      bill.quarter, 
      allIndices, 
      bill.contract.baseMonth, 
      'auto'
    );
    
    // Get classification components
    let classificationComponents = null;
    if (bill.workClassification) {
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
      return NextResponse.json(
        { error: 'No work classification found for this bill' },
        { status: 400 }
      );
    }
    
    // Calculate PVC with detailed steps
    const pvcResultsWithSteps = calculateClassificationBasedPvcWithComponentsAndSteps(
      bill.billAmount, 
      quarterlyAverages, 
      classificationComponents
    );

    // Calculate enhanced cement PVC with detailed steps
    const dedicatedCementCalculation = calculateDedicatedCementPvcWithSteps(
      bill.cementAmount || 0,
      quarterlyAverages
    );

    // Calculate comprehensive steel PVC with all components
    const comprehensiveSteelCalculation = calculateComprehensiveSteelPvcWithSteps(
      bill.steelAmount || 0,
      quarterlyAverages,
      bill.selectedSteelComponent || undefined
    );
    
    return NextResponse.json({
      bill: {
        id: bill.id,
        billNo: bill.billNo,
        billAmount: bill.billAmount,
        dateOfMeasurement: bill.dateOfMeasurement,
        quarter: bill.quarter,
        cementAmount: bill.cementAmount || 0,
        steelAmount: bill.steelAmount || 0,
        selectedSteelComponent: bill.selectedSteelComponent || null
      },
      contract: {
        agreementNo: bill.contract.agreementNo,
        contractorName: bill.contract.contractorName,
        workDescription: bill.contract.workDescription,
        baseMonth: bill.contract.baseMonth
      },
      classification: bill.workClassification ? {
        code: bill.workClassification.code,
        name: bill.workClassification.name,
        description: bill.workClassification.description,
        components: classificationComponents
      } : null,
      pvcCalculation: bill.pvcCalculation,
      quarterlyAverages: quarterlyAverages.map(qa => ({
        indexName: qa.indexName,
        average: qa.average,
        baseValue: qa.baseValue,
        quarter: qa.quarter
      })),
      calculationSteps: pvcResultsWithSteps.detailedSteps,
      dedicatedCementCalculation,
      comprehensiveSteelCalculation,
      summary: {
        labourPvc: pvcResultsWithSteps.labourPvc,
        plantMachineryPvc: pvcResultsWithSteps.plantMachineryPvc,
        fuelPowerPvc: pvcResultsWithSteps.fuelPowerPvc,
        otherMaterialsPvc: pvcResultsWithSteps.otherMaterialsPvc,
        cementPvc: pvcResultsWithSteps.cementPvc,
        steelPvc: pvcResultsWithSteps.steelPvc,
        explosivesPvc: pvcResultsWithSteps.explosivesPvc,
        dedicatedCementPvc: bill.pvcCalculation.dedicatedCementPvc,
        dedicatedSteelPvc: bill.pvcCalculation.dedicatedSteelPvc,
        totalPvc: pvcResultsWithSteps.totalPvc
      }
    });
    
  } catch (error) {
    console.error('Error generating calculation steps:', error);
    return NextResponse.json(
      { error: 'Failed to generate calculation steps' },
      { status: 500 }
    );
  }
}
