

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getQuarterMonths, getQuarterFromDate } from '@/lib/pvc-calculations';
import { format } from 'date-fns';

export const dynamic = "force-dynamic";

// GET /api/bills/[id]/detailed-report - Get detailed monthly report for a bill
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const billId = params.id;
    
    // Get the bill with all related data
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      include: {
        contract: true,
        pvcCalculation: true,
        workClassification: true
      }
    });

    if (!bill) {
      return NextResponse.json(
        { error: 'Bill not found' },
        { status: 404 }
      );
    }

    // Get work classification details
    const workClassification = bill.workClassification;

    // Get all price indices
    const allIndices = await prisma.priceIndex.findMany({
      orderBy: { name: 'asc' }
    });

    // Get the measurement date and base month
    const measurementDate = new Date(bill.dateOfMeasurement);
    const baseMonth = new Date(bill.contract.baseMonth);
    
    // Calculate the start month (next month after base month)
    const startMonth = new Date(baseMonth);
    startMonth.setMonth(startMonth.getMonth() + 1);
    startMonth.setDate(1);
    startMonth.setHours(0, 0, 0, 0);
    
    // Get all monthly values from start month to measurement date
    const monthlyData: {
      month: Date;
      monthName: string;
      indices: {
        indexName: string;
        baseValue: number;
        currentValue: number | null;
        available: boolean;
        isProvisional: boolean;
      }[];
    }[] = [];
    const currentMonth = new Date(startMonth);
    
    while (currentMonth <= measurementDate) {
      const monthData = {
        month: new Date(currentMonth),
        monthName: format(currentMonth, 'MMMM yyyy'),
        indices: [] as {
          indexName: string;
          baseValue: number;
          currentValue: number | null;
          available: boolean;
          isProvisional: boolean;
        }[]
      };
      
      // Get monthly values for all indices for this month
      for (const index of allIndices) {
        // Get base value from actual monthly data for the base month
        // Normalize base month to the first day of the month for comparison
        const normalizedBaseMonth = new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1);
        const baseMonthValue = await prisma.monthlyIndexValue.findFirst({
          where: {
            priceIndexId: index.id,
            month: {
              gte: normalizedBaseMonth,
              lt: new Date(normalizedBaseMonth.getFullYear(), normalizedBaseMonth.getMonth() + 1, 1)
            }
          }
        });

        const monthlyValue = await prisma.monthlyIndexValue.findFirst({
          where: {
            priceIndexId: index.id,
            month: {
              gte: currentMonth,
              lt: new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
            }
          },
          orderBy: {
            month: 'desc'  // Get the most recent value for the month
          }
        });
        
        monthData.indices.push({
          indexName: index.name,
          baseValue: baseMonthValue?.value || index.baseValue, // Use base month value if available, fallback to static
          currentValue: monthlyValue?.value || null,
          available: !!monthlyValue,
          isProvisional: monthlyValue?.isProvisional || false
        });
      }
      
      monthlyData.push(monthData);
      currentMonth.setMonth(currentMonth.getMonth() + 1);
    }

    // Calculate quarterly breakdown
    const quarter = getQuarterFromDate(measurementDate, baseMonth);
    const allQuarterMonths = getQuarterMonths(quarter, baseMonth);
    
    // Filter quarter months to only include those up to and including the measurement month
    const measurementMonthEnd = new Date(measurementDate.getFullYear(), measurementDate.getMonth() + 1, 0);
    let quarterMonths = allQuarterMonths.filter(qMonth => qMonth <= measurementMonthEnd);
    
    // Check if we need to include future months with provisional data for complete quarterly average
    let includesFutureMonths = false;
    if (quarterMonths.length > 0 && quarterMonths.length < 3) {
      
      // Get the last available month in the quarter
      const lastAvailableMonth = quarterMonths[quarterMonths.length - 1];
      
      // Check future months to see if they have provisional data available
      const additionalMonths = [];
      const monthsNeeded = 3 - quarterMonths.length;
      
      for (let i = 1; i <= monthsNeeded; i++) {
        const futureMonth = new Date(lastAvailableMonth);
        futureMonth.setMonth(futureMonth.getMonth() + i);
        const normalizedFutureMonth = new Date(futureMonth.getFullYear(), futureMonth.getMonth(), 1);
        
        // Check if any index has provisional data for this future month
        const provisionalData = await prisma.monthlyIndexValue.findFirst({
          where: {
            month: {
              gte: normalizedFutureMonth,
              lt: new Date(normalizedFutureMonth.getFullYear(), normalizedFutureMonth.getMonth() + 1, 1)
            },
            isProvisional: true
          }
        });
        
        if (provisionalData) {
          additionalMonths.push(normalizedFutureMonth);
        }
      }
      
      if (additionalMonths.length > 0) {
        quarterMonths = quarterMonths.concat(additionalMonths);
        includesFutureMonths = true;
      }
    }
    
    // Get quarterly averages for each index
    const quarterlyBreakdown: {
      indexName: string;
      baseValue: number;
      quarterMonths: string[];
      monthlyValues: { month: string; value: number; isProvisional: boolean }[];
      average: number | null;
      variation: number | null;
    }[] = [];
    for (const index of allIndices) {
      // Get base value from actual monthly data for the base month
      // Normalize base month to the first day of the month for comparison
      const normalizedBaseMonth = new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1);
      const baseMonthValue = await prisma.monthlyIndexValue.findFirst({
        where: {
          priceIndexId: index.id,
          month: {
            gte: normalizedBaseMonth,
            lt: new Date(normalizedBaseMonth.getFullYear(), normalizedBaseMonth.getMonth() + 1, 1)
          }
        }
      });

      const actualBaseValue = baseMonthValue?.value || index.baseValue;

      const monthlyValues: { month: string; value: number; isProvisional: boolean }[] = [];
      for (const qMonth of quarterMonths) {
        const monthlyValue = await prisma.monthlyIndexValue.findFirst({
          where: {
            priceIndexId: index.id,
            month: {
              gte: qMonth,
              lt: new Date(qMonth.getFullYear(), qMonth.getMonth() + 1, 1)
            }
          },
          orderBy: {
            month: 'desc'  // Get the most recent value for the month
          }
        });
        
        if (monthlyValue) {
          monthlyValues.push({
            month: format(qMonth, 'MMMM yyyy'),
            value: monthlyValue.value,
            isProvisional: monthlyValue.isProvisional || false
          });
        } else if (includesFutureMonths && qMonth > measurementMonthEnd) {
          // For future months without data, use base value as fallback
          monthlyValues.push({
            month: format(qMonth, 'MMMM yyyy'),
            value: actualBaseValue,
            isProvisional: true
          });
        }
      }
      
      const average = monthlyValues.length > 0 
        ? monthlyValues.reduce((sum, mv) => sum + mv.value, 0) / monthlyValues.length
        : null;
      
      quarterlyBreakdown.push({
        indexName: index.name,
        baseValue: actualBaseValue, // Use actual base month value
        quarterMonths: quarterMonths.map(qm => format(qm, 'MMMM yyyy')),
        monthlyValues,
        average,
        variation: average ? ((average - actualBaseValue) / actualBaseValue) * 100 : null
      });
    }

    // Parse sub-classifications from JSON
    let parsedSubClassifications = [];
    try {
      if (bill.subClassifications) {
        parsedSubClassifications = typeof bill.subClassifications === 'string' 
          ? JSON.parse(bill.subClassifications) 
          : bill.subClassifications;
      }
    } catch (error) {
      console.error('Error parsing subClassifications:', error);
      parsedSubClassifications = [];
    }

    // Parse non-schedule items from JSON
    let parsedNonScheduleItems = [];
    try {
      if (bill.nonScheduleItems) {
        parsedNonScheduleItems = typeof bill.nonScheduleItems === 'string' 
          ? JSON.parse(bill.nonScheduleItems) 
          : bill.nonScheduleItems;
      }
    } catch (error) {
      console.error('Error parsing nonScheduleItems:', error);
      parsedNonScheduleItems = [];
    }

    return NextResponse.json({
      bill: {
        id: bill.id,
        billNo: bill.billNo,
        billAmount: bill.billAmount,
        dateOfMeasurement: bill.dateOfMeasurement,
        quarter: bill.quarter,
        cementAmount: bill.cementAmount || 0,
        steelAmount: bill.steelAmount || 0,
        selectedSteelComponent: bill.selectedSteelComponent || null,
        subClassifications: parsedSubClassifications,
        nonScheduleItems: parsedNonScheduleItems,
        dateOfCompletion: bill.dateOfCompletion || null,
        isFinalPvc: bill.isFinalPvc || false
      },
      contract: {
        agreementNo: bill.contract.agreementNo,
        contractorName: bill.contract.contractorName,
        workDescription: bill.contract.workDescription,
        dateOfOpening: bill.contract.dateOfOpening,
        baseMonth: bill.contract.baseMonth
      },
      workClassification: workClassification ? {
        code: workClassification.code,
        name: workClassification.name,
        description: workClassification.description || null,
        fixed: workClassification.fixed,
        labour: workClassification.labour,
        steel: workClassification.steel,
        cement: workClassification.cement,
        plantMachinery: workClassification.plantMachinery,
        fuel: workClassification.fuel,
        otherMaterials: workClassification.otherMaterials,
        explosives: workClassification.explosives
      } : null,
      pvcCalculation: bill.pvcCalculation,
      monthlyData,
      quarterlyBreakdown,
      reportMetadata: {
        baseMonth: format(baseMonth, 'MMMM yyyy'),
        startMonth: format(startMonth, 'MMMM yyyy'),
        measurementDate: format(measurementDate, 'dd MMMM yyyy'),
        quarter,
        quarterMonths: quarterMonths.map(qm => format(qm, 'MMMM yyyy')),
        totalMonths: monthlyData.length,
        includesFutureMonths: includesFutureMonths
      }
    });
  } catch (error) {
    console.error('Error generating detailed report:', error);
    return NextResponse.json(
      { error: 'Failed to generate detailed report' },
      { status: 500 }
    );
  }
}
