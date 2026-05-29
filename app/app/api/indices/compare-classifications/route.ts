
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { startOfMonth, format } from 'date-fns';
import { areFinalIndicesAvailableForBill } from '@/lib/index-status';

interface IndexData {
  componentName: string;
  baseIndex: number;
  averageIndex: number;
  quarterMonths: { month: string; value: number }[];
}

// Helper to get quarterly average for a component
async function getQuarterlyAverage(
  measurementDate: Date,
  baseDate: Date,
  componentName: string
): Promise<{ average: number; base: number; quarterMonths: { month: string; value: number }[]; monthsUsed: number } | null> {
  const measurementMonth = startOfMonth(measurementDate);
  const baseMonth = startOfMonth(baseDate);

  console.log(`[${componentName}] Looking for indices:`, {
    measurementMonth: format(measurementMonth, 'yyyy-MM'),
    baseMonth: format(baseMonth, 'yyyy-MM')
  });

  // Get price index first
  const priceIndex = await prisma.priceIndex.findUnique({
    where: { name: componentName },
    include: { monthlyValues: true }
  });

  if (!priceIndex) {
    console.log(`[${componentName}] Price index not found in database`);
    return null;
  }

  console.log(`[${componentName}] Found price index with ${priceIndex.monthlyValues.length} monthly values`);

  // Get measurement quarter indices (measurement month + 2 months after)
  // IMPROVED: Now accepts partial quarter data (1-3 months)
  const twoMonthsAfter = new Date(measurementMonth.getFullYear(), measurementMonth.getMonth() + 2, 1);
  const measurementIndices = priceIndex.monthlyValues.filter((mv: any) => {
    const mvDate = new Date(mv.month);
    return mvDate >= measurementMonth && mvDate <= twoMonthsAfter;
  });

  console.log(`[${componentName}] Quarter range: ${format(measurementMonth, 'yyyy-MM')} to ${format(twoMonthsAfter, 'yyyy-MM')}`);
  console.log(`[${componentName}] Found ${measurementIndices.length} measurement indices:`, 
    measurementIndices.map(mv => ({
      month: format(new Date(mv.month), 'yyyy-MM'),
      value: mv.value
    }))
  );

  // Get base index
  const baseIndexValue = priceIndex.monthlyValues.find(mv => {
    const mvDate = new Date(mv.month);
    return mvDate.getFullYear() === baseMonth.getFullYear() && 
           mvDate.getMonth() === baseMonth.getMonth();
  });

  if (baseIndexValue) {
    console.log(`[${componentName}] Found base index:`, {
      month: format(new Date(baseIndexValue.month), 'yyyy-MM'),
      value: baseIndexValue.value
    });
  } else {
    console.log(`[${componentName}] Base index NOT found for ${format(baseMonth, 'yyyy-MM')}`);
  }

  // IMPROVED: Accept at least 1 month of data (instead of requiring all 3)
  if (measurementIndices.length === 0 || !baseIndexValue) {
    console.log(`[${componentName}] Missing critical data - measurementIndices: ${measurementIndices.length}, baseIndex: ${!!baseIndexValue}`);
    return null;
  }

  // Log warning if partial quarter data
  if (measurementIndices.length < 3) {
    console.log(`[${componentName}] ⚠️ WARNING: Using partial quarter data (${measurementIndices.length} month${measurementIndices.length > 1 ? 's' : ''} instead of 3)`);
  }

  // Calculate average from available months
  const sum = measurementIndices.reduce((acc: any, mv: any) => acc + mv.value, 0);
  const average = sum / measurementIndices.length;

  // Format quarter months for display
  const quarterMonths = measurementIndices.map(mv => ({
    month: format(new Date(mv.month), 'MMM yyyy'),
    value: Math.round(mv.value * 100) / 100
  }));

  const result = {
    average: Math.round(average * 100) / 100,
    base: Math.round(baseIndexValue.value * 100) / 100,
    quarterMonths,
    monthsUsed: measurementIndices.length
  };

  console.log(`[${componentName}] Calculation result:`, result);

  return result;
}

// Calculate component PVC with detailed steps
function calculateComponentPvc(
  amount: number,
  averageIndex: number,
  baseIndex: number,
  componentPercentage: number
): { pvc: number; calculationSteps: any } {
  if (baseIndex === 0) {
    return {
      pvc: 0,
      calculationSteps: {
        baseIndex: 0,
        averageIndex: 0,
        indexDiff: 0,
        variationRatio: 0,
        componentAmount: 0,
        percentage: componentPercentage,
        pvc: 0
      }
    };
  }
  
  const indexDiff = averageIndex - baseIndex;
  const variationRatio = indexDiff / baseIndex;
  const componentAmount = amount * variationRatio;
  const pvc = componentAmount * (componentPercentage / 100);
  
  return {
    pvc,
    calculationSteps: {
      baseIndex: Math.round(baseIndex * 100) / 100,
      averageIndex: Math.round(averageIndex * 100) / 100,
      indexDiff: Math.round(indexDiff * 100) / 100,
      variationRatio: Math.round(variationRatio * 10000) / 10000,
      componentAmount: Math.round(componentAmount * 100) / 100,
      percentage: componentPercentage,
      pvc: Math.round(pvc * 100) / 100
    }
  };
}

// Helper to parse date from dd-mm-yyyy format
function parseDateDDMMYYYY(dateStr: string): Date {
  const [day, month, year] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Helper to parse month from mm-yyyy format
function parseMonthMMYYYY(monthStr: string): Date {
  const [month, year] = monthStr.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { baseMonth, bills, classificationSelections } = body;

    console.log('[PVC Comparison] Received request:', {
      baseMonth,
      billsCount: bills?.length,
      classificationSelections,
      selectionCount: classificationSelections?.length,
      bills: bills.map((b: any) => ({ 
        id: b.id, 
        billNumber: b.billNumber,
        dedicatedTmt: b.dedicatedTmt,
        dedicatedCement: b.dedicatedCement 
      }))
    });

    // Validate base month
    if (!baseMonth) {
      return NextResponse.json({ error: 'Base month is required (mm-yyyy format)' }, { status: 400 });
    }

    // Validate date formats
    const baseMonthRegex = /^(0[1-9]|1[0-2])-\d{4}$/;
    const measurementDateRegex = /^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[0-2])-\d{4}$/;

    if (!baseMonthRegex.test(baseMonth)) {
      return NextResponse.json({ error: 'Invalid base month format. Use mm-yyyy (e.g., 01-2024)' }, { status: 400 });
    }

    // Validate bills
    if (!bills || bills.length === 0) {
      return NextResponse.json({ error: 'At least one bill is required' }, { status: 400 });
    }

    for (const bill of bills) {
      if (!bill.amount || bill.amount <= 0) {
        return NextResponse.json({ error: `Invalid amount for bill ${bill.id}` }, { status: 400 });
      }
      if (!bill.measurementDate) {
        return NextResponse.json({ error: `Measurement date required for bill ${bill.id}` }, { status: 400 });
      }
      if (!measurementDateRegex.test(bill.measurementDate)) {
        return NextResponse.json({ error: `Invalid measurement date format for bill ${bill.id}. Use dd-mm-yyyy` }, { status: 400 });
      }
    }

    if (!classificationSelections || classificationSelections.length < 2) {
      return NextResponse.json({ error: 'Please select at least 2 classifications' }, { status: 400 });
    }

    // Validate that final indices are available for all bills' measurement dates
    const baseDateObj = parseMonthMMYYYY(baseMonth);
    for (const bill of bills) {
      const measurementDateObj = parseDateDDMMYYYY(bill.measurementDate);
      const indicesCheck = await areFinalIndicesAvailableForBill(measurementDateObj, baseDateObj);
      
      if (!indicesCheck.available) {
        const billLabel = bill.billNumber || `Bill ${bill.id}`;
        return NextResponse.json(
          { 
            error: `${billLabel}: ${indicesCheck.message}`,
            details: indicesCheck.missingMonths 
          }, 
          { status: 400 }
        );
      }
    }

    // Extract unique classification IDs
    const uniqueIds = new Set<string>();
    for (const selection of classificationSelections) {
      uniqueIds.add(selection.id as string);
    }
    const classificationIds = Array.from(uniqueIds);

    // Fetch sub-classifications from the database (same as bills use)
    const classifications = await prisma.subClassification.findMany({
      where: {
        id: { in: classificationIds }
      },
      include: {
        group: true
      }
    });

    if (classifications.length === 0) {
      return NextResponse.json({ error: 'No sub-classifications found' }, { status: 404 });
    }
    
    // Process each bill
    const billResults = await Promise.all(
      bills.map(async (bill: { id: string; billNumber?: string; amount: number; measurementDate: string; dedicatedTmt?: number; dedicatedCement?: number }) => {
        const measurementDateObj = parseDateDDMMYYYY(bill.measurementDate);
        
        console.log(`[PVC Comparison] Processing Bill ${bill.id}:`, {
          amount: bill.amount,
          baseMonth,
          baseDateObj: baseDateObj.toISOString(),
          measurementDate: bill.measurementDate,
          measurementDateObj: measurementDateObj.toISOString(),
          measurementMonth: format(startOfMonth(measurementDateObj), 'yyyy-MM')
        });

        // Steel type to index name mapping
        const steelTypeIndexMap: Record<string, string> = {
          'TMT': 'Steel TMT Bars',
          'ANGLE_CHANNEL': 'Steel Angle/Channel',
          'PLATES': 'Steel Plates',
          'OTHER_SECTIONS': 'Steel Other Sections'
        };

        // Component mapping - using actual price index names from database
        const componentMapping: Record<string, string> = {
          labour: 'Labour',
          cement: 'RBI Cement',
          plantMachinery: 'RBI Plant Machinery',
          fuel: 'MPNG Fuel',
          otherMaterials: 'RBI Other Materials',
          explosives: 'RBI Explosives'
        };

        // Collect all indices data for display
        const billIndicesData: IndexData[] = [];
        const indicesCache = new Map<string, { average: number; base: number; quarterMonths: { month: string; value: number }[] } | null>();

        // Calculate PVC for each classification selection
        const results = await Promise.all(
          classificationSelections.map(async (selection: any, selectionIndex: number) => {
            const classificationId = selection.id;
            const steelTypes = selection.steelTypes || [];

            const classification = classifications.find(c => c.id === classificationId);
            if (!classification) {
              console.log(`[Bill ${bill.id}][Selection ${selectionIndex}] Classification ${classificationId} not found`);
              return null;
            }

            console.log(`\n[Bill ${bill.id}][Selection ${selectionIndex}] Processing classification ${classification.code}`);
            if (steelTypes.length > 0) {
              console.log(`  Steel types: ${steelTypes.join(', ')}`);
            } else {
              console.log(`  Steel types: Using average of all steel types`);
            }
        const componentPvcs = {
          labour: 0,
          steel: 0,
          cement: 0,
          plantMachinery: 0,
          fuel: 0,
          otherMaterials: 0,
          explosives: 0
        };

        const componentCalculations: Record<string, any> = {};

        let totalPvc = 0;

        // Calculate PVC for each component
        console.log(`  Components:`, {
          labour: classification.labour,
          steel: classification.steel,
          cement: classification.cement,
          plantMachinery: classification.plantMachinery,
          fuel: classification.fuel,
          otherMaterials: classification.otherMaterials,
          explosives: classification.explosives
        });

        // Process non-steel components
        for (const [key, indexName] of Object.entries(componentMapping)) {
          const componentKey = key as keyof typeof componentPvcs;
          const percentage = classification[componentKey];

          console.log(`  Processing ${key} (${percentage}%)`);

          if (percentage > 0) {
            // Check cache first
            let quarterData = indicesCache.get(indexName);
            
            if (!quarterData) {
              quarterData = await getQuarterlyAverage(
                measurementDateObj,
                baseDateObj,
                indexName
              );
              
              if (quarterData) {
                indicesCache.set(indexName, quarterData);
                
                // Add to indices data for display (only once per unique index)
                if (!billIndicesData.some(d => d.componentName === indexName)) {
                  billIndicesData.push({
                    componentName: indexName,
                    baseIndex: quarterData.base,
                    averageIndex: quarterData.average,
                    quarterMonths: quarterData.quarterMonths
                  });
                }
              }
            }

            if (quarterData) {
              const result = calculateComponentPvc(
                bill.amount,
                quarterData.average,
                quarterData.base,
                percentage
              );
              console.log(`  ${key} PVC calculated: ₹${result.pvc.toFixed(2)}`);
              componentPvcs[componentKey] = result.pvc;
              componentCalculations[componentKey] = result.calculationSteps;
              totalPvc += result.pvc;
            } else {
              console.log(`  ${key} - No quarter data found, skipping`);
              componentCalculations[componentKey] = null;
            }
          } else {
            componentCalculations[componentKey] = null;
          }
        }

        // Process steel component with selected steel types
        const steelPercentage = classification.steel;
        if (steelPercentage > 0) {
          console.log(`  Processing steel (${steelPercentage}%)`);
          
          // Determine which steel indices to use
          const steelIndexNames = steelTypes.length > 0
            ? steelTypes.map((st: string) => steelTypeIndexMap[st]).filter(Boolean)
            : Object.values(steelTypeIndexMap);

          console.log(`  Using steel indices: ${steelIndexNames.join(', ')}`);

          // Fetch quarterly data for each steel type
          const steelQuarterData: { average: number; base: number }[] = [];
          for (const steelIndexName of steelIndexNames) {
            // Check cache first
            let quarterData = indicesCache.get(steelIndexName);
            
            if (!quarterData) {
              quarterData = await getQuarterlyAverage(
                measurementDateObj,
                baseDateObj,
                steelIndexName
              );
              
              if (quarterData) {
                indicesCache.set(steelIndexName, quarterData);
                
                // Add to indices data for display (only once per unique index)
                if (!billIndicesData.some(d => d.componentName === steelIndexName)) {
                  billIndicesData.push({
                    componentName: steelIndexName,
                    baseIndex: quarterData.base,
                    averageIndex: quarterData.average,
                    quarterMonths: quarterData.quarterMonths
                  });
                }
              }
            }
            
            if (quarterData) {
              steelQuarterData.push(quarterData);
              console.log(`    ${steelIndexName}: Base=${quarterData.base}, Avg=${quarterData.average}`);
            } else {
              console.log(`    ${steelIndexName}: No data found`);
            }
          }

          if (steelQuarterData.length > 0) {
            // Calculate average of averages and average of bases
            const avgOfAverages = steelQuarterData.reduce((sum, d) => sum + d.average, 0) / steelQuarterData.length;
            const avgOfBases = steelQuarterData.reduce((sum, d) => sum + d.base, 0) / steelQuarterData.length;

            console.log(`  Steel averaged indices: Base=${avgOfBases.toFixed(2)}, Avg=${avgOfAverages.toFixed(2)}`);

            const result = calculateComponentPvc(
              bill.amount,
              avgOfAverages,
              avgOfBases,
              steelPercentage
            );

            console.log(`  Steel PVC calculated: ₹${result.pvc.toFixed(2)}`);
            componentPvcs.steel = result.pvc;
            componentCalculations.steel = result.calculationSteps;
            totalPvc += result.pvc;
          } else {
            console.log(`  Steel - No quarter data found for any steel type, skipping`);
            componentCalculations.steel = null;
          }
        } else {
          componentCalculations.steel = null;
        }

        console.log(`  Total PVC: ₹${totalPvc.toFixed(2)}`);
        console.log(`  Component breakdown:`, {
          labour: componentPvcs.labour.toFixed(2),
          steel: componentPvcs.steel.toFixed(2),
          cement: componentPvcs.cement.toFixed(2),
          plantMachinery: componentPvcs.plantMachinery.toFixed(2),
          fuel: componentPvcs.fuel.toFixed(2),
          otherMaterials: componentPvcs.otherMaterials.toFixed(2),
          explosives: componentPvcs.explosives.toFixed(2)
        });

        // Get main classification name from the group relationship
        const mainClassificationName = classification.group?.name || 'Other Works';

        return {
          classification: {
            id: `${classification.id}-${selectionIndex}`, // Unique ID for each selection
            code: classification.code,
            mainClassification: mainClassificationName,
            subClassification: classification.name,
            description: classification.description || classification.name,
            componentPercentages: {
              fixed: classification.fixed,
              labour: classification.labour,
              steel: classification.steel,
              cement: classification.cement,
              plantMachinery: classification.plantMachinery,
              fuel: classification.fuel,
              otherMaterials: classification.otherMaterials,
              explosives: classification.explosives
            }
          },
          totalPvc,
          componentPvcs,
          componentCalculations,
          steelTypes // Include selected steel types in the response
        };
      })
    );

        // Filter out null results
        const validResults = results.filter(r => r !== null);

        // Calculate dedicated components (TMT and Cement) with 85% composition
        const dedicatedComponents: any[] = [];
        
        // Process dedicated TMT if provided
        if (bill.dedicatedTmt && bill.dedicatedTmt > 0) {
          console.log(`\n[Bill ${bill.id}] Processing dedicated TMT: ₹${bill.dedicatedTmt}`);
          
          // Use TMT Bars index
          const tmtIndexName = 'Steel TMT Bars';
          let quarterData = indicesCache.get(tmtIndexName);
          
          if (!quarterData) {
            quarterData = await getQuarterlyAverage(
              measurementDateObj,
              baseDateObj,
              tmtIndexName
            );
            
            if (quarterData) {
              indicesCache.set(tmtIndexName, quarterData);
              
              // Add to indices data for display if not already present
              if (!billIndicesData.some(d => d.componentName === tmtIndexName)) {
                billIndicesData.push({
                  componentName: tmtIndexName,
                  baseIndex: quarterData.base,
                  averageIndex: quarterData.average,
                  quarterMonths: quarterData.quarterMonths
                });
              }
            }
          }
          
          if (quarterData) {
            // Calculate with 85% composition
            const result = calculateComponentPvc(
              bill.dedicatedTmt,
              quarterData.average,
              quarterData.base,
              85 // 85% composition
            );
            
            console.log(`  Dedicated TMT PVC: ₹${result.pvc.toFixed(2)}`);
            
            dedicatedComponents.push({
              component: 'tmt',
              amount: bill.dedicatedTmt,
              baseIndex: quarterData.base,
              averageIndex: quarterData.average,
              pvc: result.pvc,
              calculationSteps: result.calculationSteps
            });
          } else {
            console.log(`  Dedicated TMT - No quarter data found, skipping`);
          }
        }
        
        // Process dedicated Cement if provided
        if (bill.dedicatedCement && bill.dedicatedCement > 0) {
          console.log(`\n[Bill ${bill.id}] Processing dedicated Cement: ₹${bill.dedicatedCement}`);
          
          // Use RBI Cement index
          const cementIndexName = 'RBI Cement';
          let quarterData = indicesCache.get(cementIndexName);
          
          if (!quarterData) {
            quarterData = await getQuarterlyAverage(
              measurementDateObj,
              baseDateObj,
              cementIndexName
            );
            
            if (quarterData) {
              indicesCache.set(cementIndexName, quarterData);
              
              // Add to indices data for display if not already present
              if (!billIndicesData.some(d => d.componentName === cementIndexName)) {
                billIndicesData.push({
                  componentName: cementIndexName,
                  baseIndex: quarterData.base,
                  averageIndex: quarterData.average,
                  quarterMonths: quarterData.quarterMonths
                });
              }
            }
          }
          
          if (quarterData) {
            // Calculate with 85% composition
            const result = calculateComponentPvc(
              bill.dedicatedCement,
              quarterData.average,
              quarterData.base,
              85 // 85% composition
            );
            
            console.log(`  Dedicated Cement PVC: ₹${result.pvc.toFixed(2)}`);
            
            dedicatedComponents.push({
              component: 'cement',
              amount: bill.dedicatedCement,
              baseIndex: quarterData.base,
              averageIndex: quarterData.average,
              pvc: result.pvc,
              calculationSteps: result.calculationSteps
            });
          } else {
            console.log(`  Dedicated Cement - No quarter data found, skipping`);
          }
        }

        // Return results for this bill
        return {
          billId: bill.id,
          billNumber: bill.billNumber,
          amount: bill.amount,
          measurementDate: bill.measurementDate,
          results: validResults,
          dedicatedComponents: dedicatedComponents.length > 0 ? dedicatedComponents : undefined,
          indicesData: billIndicesData,
          baseMonth: format(startOfMonth(baseDateObj), 'MMM yyyy'),
          measurementMonth: format(startOfMonth(measurementDateObj), 'MMM yyyy')
        };
      })
    );

    // Track usage for daily limit
    const userId = (session.user as any).id as string;
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    try {
      // Update or create daily usage record
      await prisma.pvcComparisonDailyUsage.upsert({
        where: {
          userId_date: {
            userId,
            date: todayStart,
          },
        },
        update: {
          usageCount: {
            increment: 1,
          },
        },
        create: {
          userId,
          date: todayStart,
          usageCount: 1,
        },
      });
      console.log(`[PVC Comparison] Updated daily usage for user ${userId}`);
    } catch (usageError) {
      console.error('[PVC Comparison] Error tracking usage:', usageError);
      // Don't fail the request if usage tracking fails
    }

    // Return results for all bills
    return NextResponse.json({
      billResults: billResults,
      baseMonth: format(startOfMonth(baseDateObj), 'MMM yyyy')
    });

  } catch (error) {
    console.error('Error in compare-classifications API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
