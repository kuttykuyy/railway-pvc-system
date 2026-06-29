import { prisma } from './db';
import { logger } from './logger';

import { PVC_COMPONENTS, QuarterlyAverage } from './types';

import { getClassificationOrDefault } from './classification-helper';



// PVC Formula: NEW Step-by-step calculation method requested by user
export function calculatePvcComponent(
  billAmount: number,
  averageIndex: number,
  baseIndex: number,
  componentPercentage: number
): number {
  if (baseIndex === 0) return 0;
  
  // USER'S NEW METHOD - Step-by-step calculation:
  // Step 1: Average Index - Base Index (round to 2 decimal to avoid floating point errors)
  const step1Result = Math.round((averageIndex - baseIndex) * 100) / 100;
  
  // Step 2: Amount × Result of Step 1
  const step2Result = billAmount * step1Result;
  
  // Step 3: Step 2 Result × (Component Percentage/100)
  const step3Result = step2Result * (componentPercentage / 100);
  
  // Step 4: Step 3 ÷ Base Index
  const finalPvc = step3Result / baseIndex;
  
  return finalPvc;
}

// PVC Formula with detailed step breakdown for reports
export function calculatePvcComponentWithSteps(
  billAmount: number,
  averageIndex: number,
  baseIndex: number,
  componentPercentage: number,
  componentName: string
): {
  finalPvc: number;
  steps: {
    step1: { description: string; calculation: string; result: number };
    step2: { description: string; calculation: string; result: number };
    step3: { description: string; calculation: string; result: number };
    step4: { description: string; calculation: string; result: number };
  };
  formula: string;
  debug?: {
    billAmountPrecise: number;
    averageIndexPrecise: number;
    baseIndexPrecise: number;
    step1ResultPrecise: number;
    step2ResultPrecise: number;
  };
} {
  // CRITICAL: Round indices to 2 decimal places BEFORE calculations
  // This ensures displayed formulas match actual calculations exactly
  const avgIndexRounded = Math.round(averageIndex * 100) / 100;
  const baseIndexRounded = Math.round(baseIndex * 100) / 100;
  
  if (baseIndexRounded === 0) {
    return {
      finalPvc: 0,
      steps: {
        step1: { description: "Step 1: Average Index - Base Index", calculation: "0 - 0", result: 0 },
        step2: { description: "Step 2: Bill Amount × Step 1 Result", calculation: "0 × 0", result: 0 },
        step3: { description: "Step 3: Step 2 Result × (Component %/100)", calculation: "0 × 0", result: 0 },
        step4: { description: "Step 4: Step 3 Result ÷ Base Index", calculation: "0 ÷ 0", result: 0 }
      },
      formula: `PVC = (₹${billAmount.toLocaleString()} × (${avgIndexRounded} - ${baseIndexRounded}) × ${componentPercentage}%) ÷ ${baseIndexRounded}`
    };
  }
  
  // CORE CALCULATION LOGIC: Use 2-decimal rounded indices
  // Step 1: Index Difference = Average Index - Base Index (using rounded indices)
  const step1Result = avgIndexRounded - baseIndexRounded;
  
  // Step 2: Variation Ratio = Index Difference ÷ Base Index (UNROUNDED - full precision result)
  const variationRatio = step1Result / baseIndexRounded;
  
  // Step 3: Component Amount = Bill Amount × Variation Ratio (full precision)
  const componentAmount = billAmount * variationRatio;
  
  // Step 4: Final PVC = Component Amount × (Component Percentage/100)
  const finalPvc = componentAmount * (componentPercentage / 100);
  
  return {
    finalPvc,
    steps: {
      step1: {
        description: "Step 1: Index Difference (Average - Base)",
        calculation: `${avgIndexRounded.toFixed(2)} - ${baseIndexRounded.toFixed(2)}`,
        result: step1Result
      },
      step2: {
        description: "Step 2: Variation Ratio (Index Diff ÷ Base Index)",
        calculation: `${step1Result.toFixed(2)} ÷ ${baseIndexRounded.toFixed(2)}`,
        result: variationRatio
      },
      step3: {
        description: "Step 3: Component Amount (Bill Amt × Variation Ratio)",
        calculation: `₹${billAmount.toLocaleString()} × ${variationRatio}`,
        result: componentAmount
      },
      step4: {
        description: "Step 4: Final PVC (Component Amt × Component %)",
        calculation: `₹${componentAmount.toLocaleString()} × ${componentPercentage}%`,
        result: finalPvc
      }
    },
    formula: `PVC = ₹${billAmount.toLocaleString()} × [(${avgIndexRounded.toFixed(2)} - ${baseIndexRounded.toFixed(2)}) ÷ ${baseIndexRounded.toFixed(2)}] × ${componentPercentage}%`,
    debug: {
      billAmountPrecise: billAmount,
      averageIndexPrecise: averageIndex,
      baseIndexPrecise: baseIndex,
      step1ResultPrecise: step1Result,
      step2ResultPrecise: variationRatio
    }
  };
}

// Helper to find the fuel index in the indexMap, supporting city-suffixed names
// E.g., looking for 'MPNG Fuel' will also match 'MPNG Fuel - Delhi', 'MPNG Fuel - Mumbai', etc.
function findFuelIndex(indexMap: Map<string, QuarterlyAverage>): QuarterlyAverage | undefined {
  // First try exact match (4-city average)
  const exact = indexMap.get('MPNG Fuel');
  if (exact) return exact;
  
  // Try city-suffixed versions
  for (const [key, value] of indexMap) {
    if (key.startsWith('MPNG Fuel - ')) {
      return value;
    }
  }
  return undefined;
}

// Helper to find a steel index in the indexMap by base name, supporting city-suffixed names
// E.g., looking for 'Steel TMT Bars' will also match 'Steel TMT Bars - Delhi'
function findSteelIndex(indexMap: Map<string, QuarterlyAverage>, baseName: string): QuarterlyAverage | undefined {
  // First try exact match (default/Chennai indices)
  const exact = indexMap.get(baseName);
  if (exact) return exact;
  
  // Try city-suffixed versions
  for (const [key, value] of indexMap) {
    if (key.startsWith(baseName + ' - ')) {
      return value;
    }
  }
  return undefined;
}

// Helper function to calculate steel PVC with optional steel types
function calculateSteelPvc(
  billAmount: number,
  indexMap: Map<string, QuarterlyAverage>,
  steelPercentage: number,
  steelTypes?: string[]
): number {
  if (steelPercentage <= 0) return 0;

  // Map steel type codes to base index names
  const steelTypeMap: { [key: string]: string } = {
    'TMT': 'Steel TMT Bars',
    'ANGLE_CHANNEL': 'Steel Angle/Channel',
    'PLATES': 'Steel Plates',
    'OTHER_SECTIONS': 'Steel Other Sections'
  };

  if (steelTypes && steelTypes.length > 0) {
    // Use selected steel types
    const selectedIndices: QuarterlyAverage[] = [];
    
    for (const steelType of steelTypes) {
      const baseName = steelTypeMap[steelType];
      const steelAvg = findSteelIndex(indexMap, baseName);
      if (steelAvg) {
        selectedIndices.push(steelAvg);
      }
    }

    if (selectedIndices.length > 0) {
      // Calculate average of selected steel indices
      const avgBaseValue = selectedIndices.reduce((sum, idx) => sum + idx.baseValue, 0) / selectedIndices.length;
      const avgIndexValue = selectedIndices.reduce((sum, idx) => sum + idx.average, 0) / selectedIndices.length;
      
      const pvc = calculatePvcComponent(billAmount, avgIndexValue, avgBaseValue, steelPercentage);
      
      logger.log(`📊 Steel PVC Calculation with ${selectedIndices.length} type(s):`, {
        steelTypes: steelTypes,
        selectedIndices: selectedIndices.map(idx => ({ name: idx.indexName, base: idx.baseValue, avg: idx.average })),
        avgBaseValue,
        avgIndexValue,
        pvc
      });
      
      return pvc;
    }
  }
  
  // Default behavior: use AVERAGE of ALL available steel indices (GCC requirement)
  const steelBaseNames = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
  const availableIndices: QuarterlyAverage[] = [];
  
  for (const baseName of steelBaseNames) {
    const steelAvg = findSteelIndex(indexMap, baseName);
    if (steelAvg) {
      availableIndices.push(steelAvg);
    }
  }
  
  if (availableIndices.length > 0) {
    // Calculate average of ALL available steel indices
    const avgBaseValue = availableIndices.reduce((sum, idx) => sum + idx.baseValue, 0) / availableIndices.length;
    const avgIndexValue = availableIndices.reduce((sum, idx) => sum + idx.average, 0) / availableIndices.length;
    
    const pvc = calculatePvcComponent(billAmount, avgIndexValue, avgBaseValue, steelPercentage);
    
    logger.log(`📊 Steel PVC Calculation (default - average of all types):`, {
      availableIndices: availableIndices.map(idx => ({ name: idx.indexName, base: idx.baseValue, avg: idx.average })),
      avgBaseValue,
      avgIndexValue,
      pvc
    });
    
    return pvc;
  }
  
  return 0;
}

// Helper function to check if classification is processing fee / overhead type
export function isProcessingFeeClassification(components: {
  labour: number;
  plantMachinery: number;
  fuel: number;
  otherMaterials: number;
  cement: number;
  steel: number;
  explosives?: number;
}): boolean {
  const totalPercentage = 
    (components.labour || 0) +
    (components.plantMachinery || 0) +
    (components.fuel || 0) +
    (components.otherMaterials || 0) +
    (components.cement || 0) +
    (components.steel || 0) +
    (components.explosives || 0);
  
  // If all components are 0 or total is less than 1%, it's a processing fee classification
  return totalPercentage === 0 || totalPercentage < 1;
}

// Calculate PVC using database-stored classifications
export async function calculateDynamicClassificationPvc(
  billAmount: number,
  quarterlyAverages: QuarterlyAverage[],
  workClassificationCode?: string | null,
  steelTypes?: string[]  // Optional array of steel types: ["TMT", "ANGLE_CHANNEL", "PLATES", "OTHER_SECTIONS"]
): Promise<{
  labourPvc: number;
  plantMachineryPvc: number;
  fuelPowerPvc: number;
  otherMaterialsPvc: number;
  cementPvc: number;
  steelPvc: number;
  explosivesPvc: number;
  totalPvc: number;
  isProcessingFee?: boolean;
}> {
  // Create a map for easy lookup
  const indexMap = new Map<string, QuarterlyAverage>();
  quarterlyAverages.forEach(qa => {
    indexMap.set(qa.indexName, qa);
  });

  // Get work classification from database using helper
  const classification = await getClassificationOrDefault(workClassificationCode);
  
  // If still no classification, return zero PVC
  if (!classification) {
    console.error('No classification found, returning zero PVC');
    return {
      labourPvc: 0,
      plantMachineryPvc: 0,
      fuelPowerPvc: 0,
      otherMaterialsPvc: 0,
      cementPvc: 0,
      steelPvc: 0,
      explosivesPvc: 0,
      totalPvc: 0,
      isProcessingFee: false
    };
  }

  const components = {
    labour: classification.labour,
    plantMachinery: classification.plantMachinery,
    fuel: classification.fuel,
    otherMaterials: classification.otherMaterials,
    cement: classification.cement,
    steel: classification.steel,
    explosives: classification.explosives
  };

  // Check if this is a processing fee classification
  if (isProcessingFeeClassification(components)) {
    logger.log(`Processing fee classification detected: ${workClassificationCode || 'Unknown'}`);
    logger.log('All component percentages are 0%, returning zero PVC');
    return {
      labourPvc: 0,
      plantMachineryPvc: 0,
      fuelPowerPvc: 0,
      otherMaterialsPvc: 0,
      cementPvc: 0,
      steelPvc: 0,
      explosivesPvc: 0,
      totalPvc: 0,
      isProcessingFee: true
    };
  }

  // Calculate each component
  const labourAvg = indexMap.get('Labour');
  const labourPvc = (labourAvg && components.labour > 0) 
    ? calculatePvcComponent(billAmount, labourAvg.average, labourAvg.baseValue, components.labour)
    : 0;

  const plantMachineryAvg = indexMap.get('RBI Plant Machinery');
  const plantMachineryPvc = (plantMachineryAvg && components.plantMachinery > 0)
    ? calculatePvcComponent(billAmount, plantMachineryAvg.average, plantMachineryAvg.baseValue, components.plantMachinery)
    : 0;

  const fuelPowerAvg = findFuelIndex(indexMap);
  const fuelPowerPvc = (fuelPowerAvg && components.fuel > 0)
    ? calculatePvcComponent(billAmount, fuelPowerAvg.average, fuelPowerAvg.baseValue, components.fuel)
    : 0;

  const otherMaterialsAvg = indexMap.get('RBI Other Materials');
  const otherMaterialsPvc = (otherMaterialsAvg && components.otherMaterials > 0)
    ? calculatePvcComponent(billAmount, otherMaterialsAvg.average, otherMaterialsAvg.baseValue, components.otherMaterials)
    : 0;

  // Cement PVC from classification percentages (e.g., 1C, 5C, 6C with 85% cement)
  const cementAvg = indexMap.get('RBI Cement');
  const cementPvc = (cementAvg && components.cement > 0)
    ? calculatePvcComponent(billAmount, cementAvg.average, cementAvg.baseValue, components.cement)
    : 0;

  // For steel, use helper function with optional steel types
  const steelPvc = calculateSteelPvc(billAmount, indexMap, components.steel, steelTypes);

  const explosivesAvg = indexMap.get('RBI Explosives');
  const explosivesPvc = (explosivesAvg && components.explosives > 0)
    ? calculatePvcComponent(billAmount, explosivesAvg.average, explosivesAvg.baseValue, components.explosives)
    : 0;

  const totalPvc = labourPvc + plantMachineryPvc + fuelPowerPvc + otherMaterialsPvc + cementPvc + steelPvc + explosivesPvc;

  return {
    labourPvc,
    plantMachineryPvc,
    fuelPowerPvc,
    otherMaterialsPvc,
    cementPvc,
    steelPvc,
    explosivesPvc,
    totalPvc,
    isProcessingFee: false
  };
}

// Calculate PVC based on component percentages with detailed steps (for reports)
export function calculateClassificationBasedPvcWithComponentsAndSteps(
  billAmount: number,
  quarterlyAverages: QuarterlyAverage[],
  components: {
    fixed: number;
    labour: number;
    steel: number;
    cement: number;
    plantMachinery: number;
    fuel: number;
    otherMaterials: number;
    explosives: number;
    steelTypes?: string[];
  }
): {
  labourPvc: number;
  plantMachineryPvc: number;
  fuelPowerPvc: number;
  otherMaterialsPvc: number;
  cementPvc: number;
  steelPvc: number;
  explosivesPvc: number;
  totalPvc: number;
  detailedSteps: {
    [key: string]: {
      finalPvc: number;
      steps: {
        step1: { description: string; calculation: string; result: number };
        step2: { description: string; calculation: string; result: number };
        step3: { description: string; calculation: string; result: number };
        step4: { description: string; calculation: string; result: number };
      };
      formula: string;
      averageIndex: number;
      baseIndex: number;
      componentPercentage: number;
    };
  };
} {
  // Create a map for easy lookup
  const indexMap = new Map<string, QuarterlyAverage>();
  quarterlyAverages.forEach(qa => {
    indexMap.set(qa.indexName, qa);
  });

  const detailedSteps: any = {};
  let labourPvc = 0;
  let plantMachineryPvc = 0;
  let fuelPowerPvc = 0;
  let otherMaterialsPvc = 0;
  let cementPvc = 0;
  let steelPvc = 0;
  let explosivesPvc = 0;

  // Calculate each component with detailed steps
  const labourAvg = indexMap.get('Labour');
  if (labourAvg && components.labour > 0) {
    const labourCalc = calculatePvcComponentWithSteps(
      billAmount, 
      labourAvg.average, 
      labourAvg.baseValue, 
      components.labour,
      'Labour'
    );
    labourPvc = labourCalc.finalPvc;
    detailedSteps.labour = {
      ...labourCalc,
      averageIndex: labourAvg.average,
      baseIndex: labourAvg.baseValue,
      componentPercentage: components.labour,
      componentName: 'Labour',
      indexSource: 'Consumer Price Index for Industrial Workers'
    };
  }

  const plantMachineryAvg = indexMap.get('RBI Plant Machinery');
  if (plantMachineryAvg && components.plantMachinery > 0) {
    const plantCalc = calculatePvcComponentWithSteps(
      billAmount, 
      plantMachineryAvg.average, 
      plantMachineryAvg.baseValue, 
      components.plantMachinery,
      'Plant Machinery & Spares'
    );
    plantMachineryPvc = plantCalc.finalPvc;
    detailedSteps.plantMachinery = {
      ...plantCalc,
      averageIndex: plantMachineryAvg.average,
      baseIndex: plantMachineryAvg.baseValue,
      componentPercentage: components.plantMachinery,
      componentName: 'Plant Machinery & Spares',
      indexSource: 'RBI Plant Machinery index'
    };
  }

  const fuelPowerAvg = findFuelIndex(indexMap);
  if (fuelPowerAvg && components.fuel > 0) {
    const fuelCalc = calculatePvcComponentWithSteps(
      billAmount, 
      fuelPowerAvg.average, 
      fuelPowerAvg.baseValue, 
      components.fuel,
      'Fuel & Lubricants'
    );
    fuelPowerPvc = fuelCalc.finalPvc;
    detailedSteps.fuel = {
      ...fuelCalc,
      averageIndex: fuelPowerAvg.average,
      baseIndex: fuelPowerAvg.baseValue,
      componentPercentage: components.fuel,
      componentName: 'Fuel & Lubricants',
      indexSource: 'MPNG Fuel & Lubricants index'
    };
  }

  const otherMaterialsAvg = indexMap.get('RBI Other Materials');
  if (otherMaterialsAvg && components.otherMaterials > 0) {
    const otherCalc = calculatePvcComponentWithSteps(
      billAmount, 
      otherMaterialsAvg.average, 
      otherMaterialsAvg.baseValue, 
      components.otherMaterials,
      'Other Materials'
    );
    otherMaterialsPvc = otherCalc.finalPvc;
    detailedSteps.otherMaterials = {
      ...otherCalc,
      averageIndex: otherMaterialsAvg.average,
      baseIndex: otherMaterialsAvg.baseValue,
      componentPercentage: components.otherMaterials,
      componentName: 'Other Materials',
      indexSource: 'RBI Other Materials index'
    };
  }

  // Cement PVC from classification percentages (e.g., 1C, 5C, 6C with 85% cement)
  const cementAvg = indexMap.get('RBI Cement');
  if (cementAvg && components.cement > 0) {
    const cementCalc = calculatePvcComponentWithSteps(
      billAmount,
      cementAvg.average,
      cementAvg.baseValue,
      components.cement,
      'Cement'
    );
    cementPvc = cementCalc.finalPvc;
    detailedSteps.cement = {
      ...cementCalc,
      averageIndex: cementAvg.average,
      baseIndex: cementAvg.baseValue,
      componentPercentage: components.cement,
      componentName: 'Cement',
      indexSource: 'RBI Cement, Lime & Plaster index'
    };
  }

  // For steel, use selected steel types if available, otherwise use default behavior
  if (components.steel > 0) {
    // Map steel type codes to index names
    const steelTypeMap: { [key: string]: string } = {
      'TMT': 'Steel TMT Bars',
      'ANGLE_CHANNEL': 'Steel Angle/Channel',
      'PLATES': 'Steel Plates',
      'OTHER_SECTIONS': 'Steel Other Sections'
    };

    if (components.steelTypes && components.steelTypes.length > 0) {
      // Use selected steel types - calculate average of all selected types
      const selectedIndices: QuarterlyAverage[] = [];
      
      for (const steelType of components.steelTypes) {
        const indexName = steelTypeMap[steelType];
        const steelAvg = findSteelIndex(indexMap, indexName);
        if (steelAvg) {
          selectedIndices.push(steelAvg);
        }
      }

      if (selectedIndices.length > 0) {
        // Calculate average of selected steel indices
        const avgBaseValue = selectedIndices.reduce((sum, idx) => sum + idx.baseValue, 0) / selectedIndices.length;
        const avgIndexValue = selectedIndices.reduce((sum, idx) => sum + idx.average, 0) / selectedIndices.length;
        
        const steelCalc = calculatePvcComponentWithSteps(
          billAmount, 
          avgIndexValue, 
          avgBaseValue, 
          components.steel,
          'Steel'
        );
        steelPvc = steelCalc.finalPvc;
        
        const selectedIndexNames = selectedIndices.map(idx => idx.indexName).join(', ');
        detailedSteps.steel = {
          ...steelCalc,
          averageIndex: avgIndexValue,
          baseIndex: avgBaseValue,
          componentPercentage: components.steel,
          componentName: 'Steel',
          indexSource: `Joint Plant Committee steel rates (${selectedIndexNames})`,
          selectedSteelTypes: components.steelTypes
        };
        
        logger.log(`📊 Steel PVC Calculation (with steps) using ${selectedIndices.length} selected type(s):`, {
          steelTypes: components.steelTypes,
          selectedIndices: selectedIndices.map(idx => ({ name: idx.indexName, base: idx.baseValue, avg: idx.average })),
          avgBaseValue,
          avgIndexValue,
          steelPvc
        });
      }
    } else {
      // Default behavior: use AVERAGE of ALL available steel indices (GCC requirement)
      const steelIndices = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
      const availableIndices: QuarterlyAverage[] = [];
      
      for (const steelIndex of steelIndices) {
        const steelAvg = findSteelIndex(indexMap, steelIndex);
        if (steelAvg) {
          availableIndices.push(steelAvg);
        }
      }
      
      if (availableIndices.length > 0) {
        // Calculate average of ALL available steel indices
        const avgBaseValue = availableIndices.reduce((sum, idx) => sum + idx.baseValue, 0) / availableIndices.length;
        const avgIndexValue = availableIndices.reduce((sum, idx) => sum + idx.average, 0) / availableIndices.length;
        
        const steelCalc = calculatePvcComponentWithSteps(
          billAmount, 
          avgIndexValue, 
          avgBaseValue, 
          components.steel,
          'Steel'
        );
        steelPvc = steelCalc.finalPvc;
        detailedSteps.steel = {
          ...steelCalc,
          averageIndex: avgIndexValue,
          baseIndex: avgBaseValue,
          componentPercentage: components.steel,
          componentName: 'Steel',
          indexSource: `Joint Plant Committee steel rates (average of ${availableIndices.length} types)`
        };
      }
    }
  }

  const explosivesAvg = indexMap.get('RBI Explosives');
  if (explosivesAvg && components.explosives > 0) {
    const explosivesCalc = calculatePvcComponentWithSteps(
      billAmount, 
      explosivesAvg.average, 
      explosivesAvg.baseValue, 
      components.explosives,
      'Explosives'
    );
    explosivesPvc = explosivesCalc.finalPvc;
    detailedSteps.explosives = {
      ...explosivesCalc,
      averageIndex: explosivesAvg.average,
      baseIndex: explosivesAvg.baseValue,
      componentPercentage: components.explosives,
      componentName: 'Explosives',
      indexSource: 'RBI Explosives index'
    };
  }

  const totalPvc = labourPvc + plantMachineryPvc + fuelPowerPvc + otherMaterialsPvc + cementPvc + steelPvc + explosivesPvc;

  return {
    labourPvc,
    plantMachineryPvc,
    fuelPowerPvc,
    otherMaterialsPvc,
    cementPvc,
    steelPvc,
    explosivesPvc,
    totalPvc,
    detailedSteps
  };
}

/**
 * Calculate PVC for a single classification entry
 * This ensures per-entry calculation matches PDF generation logic
 */
export async function calculateClassificationEntryPvc(
  entry: {
    subClassificationId?: string;
    classificationId?: string;
    amount: number;
    steelTypes?: string[];
  },
  quarterlyAverages: QuarterlyAverage[],
  options?: {
    hasDedicatedSteel?: boolean;
    hasDedicatedCement?: boolean;
  }
): Promise<{
  labourPvc: number;
  plantMachineryPvc: number;
  fuelPowerPvc: number;
  otherMaterialsPvc: number;
  cementPvc: number;
  steelPvc: number;
  explosivesPvc: number;
  totalPvc: number;
}> {
  const { prisma } = await import('@/lib/db');
  
  // Get classification components
  let components = null;
  
  if (entry.subClassificationId) {
    const subClass = await prisma.subClassification.findUnique({
      where: { id: entry.subClassificationId }
    });
    if (subClass) {
      components = subClass;
    }
  }
  
  if (!components && entry.classificationId) {
    const classification = await prisma.classification.findUnique({
      where: { id: entry.classificationId }
    });
    if (classification) {
      components = classification;
    }
  }
  
  if (!components) {
    return {
      labourPvc: 0,
      plantMachineryPvc: 0,
      fuelPowerPvc: 0,
      otherMaterialsPvc: 0,
      cementPvc: 0,
      steelPvc: 0,
      explosivesPvc: 0,
      totalPvc: 0
    };
  }
  
  // Create index map
  const indexMap = new Map<string, QuarterlyAverage>();
  quarterlyAverages.forEach(qa => {
    indexMap.set(qa.indexName, qa);
  });
  
  // Get classification/subclassification code for dedicated check
  const subClassCode = components.code ? String(components.code).toUpperCase() : '';
  let steelPct = components.steel;
  let cementPct = components.cement;

  // Exclude pure steel supply (ends with B) if dedicated steel is handled separately
  if (options?.hasDedicatedSteel && subClassCode.endsWith('B')) {
    steelPct = 0;
  }
  // Exclude pure cement supply (ends with C) if dedicated cement is handled separately
  if (options?.hasDedicatedCement && subClassCode.endsWith('C')) {
    cementPct = 0;
  }

  // Calculate each component PVC for this entry
  const labourAvg = indexMap.get('Labour');
  const labourPvc = (labourAvg && components.labour > 0) 
    ? calculatePvcComponent(entry.amount, labourAvg.average, labourAvg.baseValue, components.labour)
    : 0;

  const plantMachineryAvg = indexMap.get('RBI Plant Machinery');
  const plantMachineryPvc = (plantMachineryAvg && components.plantMachinery > 0)
    ? calculatePvcComponent(entry.amount, plantMachineryAvg.average, plantMachineryAvg.baseValue, components.plantMachinery)
    : 0;

  const fuelPowerAvg = findFuelIndex(indexMap);
  const fuelPowerPvc = (fuelPowerAvg && components.fuel > 0)
    ? calculatePvcComponent(entry.amount, fuelPowerAvg.average, fuelPowerAvg.baseValue, components.fuel)
    : 0;

  const otherMaterialsAvg = indexMap.get('RBI Other Materials');
  const otherMaterialsPvc = (otherMaterialsAvg && components.otherMaterials > 0)
    ? calculatePvcComponent(entry.amount, otherMaterialsAvg.average, otherMaterialsAvg.baseValue, components.otherMaterials)
    : 0;

  // Cement PVC from classification percentages (e.g., 1C, 5C, 6C with 85% cement)
  const cementAvg = indexMap.get('RBI Cement');
  const cementPvc = (cementAvg && cementPct > 0)
    ? calculatePvcComponent(entry.amount, cementAvg.average, cementAvg.baseValue, cementPct)
    : 0;
  
  // For steel, use entry-specific steel types
  const steelPvc = calculateSteelPvc(entry.amount, indexMap, steelPct, entry.steelTypes);
  
  const explosivesAvg = indexMap.get('RBI Explosives');
  const explosivesPvc = (explosivesAvg && components.explosives > 0)
    ? calculatePvcComponent(entry.amount, explosivesAvg.average, explosivesAvg.baseValue, components.explosives)
    : 0;

  const totalPvc = labourPvc + plantMachineryPvc + fuelPowerPvc + otherMaterialsPvc + cementPvc + steelPvc + explosivesPvc;

  logger.log(`📊 Entry PVC Calculation (Amount: ₹${entry.amount.toLocaleString()}):`, {
    labourPvc: labourPvc.toFixed(2),
    plantMachineryPvc: plantMachineryPvc.toFixed(2),
    fuelPowerPvc: fuelPowerPvc.toFixed(2),
    otherMaterialsPvc: otherMaterialsPvc.toFixed(2),
    cementPvc: cementPvc.toFixed(2),
    steelPvc: steelPvc.toFixed(2),
    explosivesPvc: explosivesPvc.toFixed(2),
    totalPvc: totalPvc.toFixed(2),
    steelTypes: entry.steelTypes || 'All types (average)'
  });

  return {
    labourPvc,
    plantMachineryPvc,
    fuelPowerPvc,
    otherMaterialsPvc,
    cementPvc,
    steelPvc,
    explosivesPvc,
    totalPvc
  };
}

// Calculate PVC based on component percentages (for dynamic classifications from database)
/**
 * Calculate weighted average components from multiple classification entries
 * Returns the weighted component percentages based on the amount allocated to each classification
 */
export async function calculateWeightedComponents(
  classificationEntries: Array<{
    subClassificationId?: string;
    classificationId?: string;
    amount: number;
    steelTypes?: string[];
  }>,
  options?: {
    hasDedicatedSteel?: boolean;
    hasDedicatedCement?: boolean;
  }
): Promise<{
  fixed: number;
  labour: number;
  steel: number;
  cement: number;
  plantMachinery: number;
  fuel: number;
  otherMaterials: number;
  explosives: number;
  totalAmount: number;
  steelTypes?: string[];
}> {
  const { prisma } = await import('@/lib/db');
  
  let totalFixed = 0;
  let totalLabour = 0;
  let totalSteel = 0;
  let totalCement = 0;
  let totalPlantMachinery = 0;
  let totalFuel = 0;
  let totalOtherMaterials = 0;
  let totalExplosives = 0;
  let totalAmount = 0;
  
  // Collect steel types from all entries
  const collectedSteelTypes = new Set<string>();

  for (const entry of classificationEntries) {
    if (entry.amount <= 0) continue;

    let components = null;
    let subClassCode = '';

    // Try to find as SubClassification first
    if (entry.subClassificationId) {
      const subClass = await prisma.subClassification.findUnique({
        where: { id: entry.subClassificationId }
      });
      if (subClass) {
        components = subClass;
        subClassCode = subClass.code.toUpperCase();
      }
    }

    // Fallback to legacy Classification
    if (!components && entry.classificationId) {
      const classification = await prisma.classification.findUnique({
        where: { id: entry.classificationId }
      });
      if (classification) {
        components = classification;
        subClassCode = classification.code.toUpperCase();
      }
    }

    if (components) {
      let steelPct = components.steel;
      let cementPct = components.cement;

      // Exclude pure steel supply (ends with B) if dedicated steel is handled separately
      if (options?.hasDedicatedSteel && subClassCode.endsWith('B')) {
        steelPct = 0;
      }
      // Exclude pure cement supply (ends with C) if dedicated cement is handled separately
      if (options?.hasDedicatedCement && subClassCode.endsWith('C')) {
        cementPct = 0;
      }

      // Weight each component by the entry amount
      totalFixed += (components.fixed / 100) * entry.amount;
      totalLabour += (components.labour / 100) * entry.amount;
      totalSteel += (steelPct / 100) * entry.amount;
      totalCement += (cementPct / 100) * entry.amount;
      totalPlantMachinery += (components.plantMachinery / 100) * entry.amount;
      totalFuel += (components.fuel / 100) * entry.amount;
      totalOtherMaterials += (components.otherMaterials / 100) * entry.amount;
      totalExplosives += (components.explosives / 100) * entry.amount;
      totalAmount += entry.amount;
      
      // Collect steel types from this entry if steel component exists
      if (steelPct > 0 && entry.steelTypes && Array.isArray(entry.steelTypes)) {
        entry.steelTypes.forEach((type: string) => collectedSteelTypes.add(type));
      }
    }
  }

  // Convert back to percentages (weighted average)
  if (totalAmount === 0) {
    return {
      fixed: 0,
      labour: 0,
      steel: 0,
      cement: 0,
      plantMachinery: 0,
      fuel: 0,
      otherMaterials: 0,
      explosives: 0,
      totalAmount: 0,
      steelTypes: []
    };
  }

  const result = {
    fixed: (totalFixed / totalAmount) * 100,
    labour: (totalLabour / totalAmount) * 100,
    steel: (totalSteel / totalAmount) * 100,
    cement: (totalCement / totalAmount) * 100,
    plantMachinery: (totalPlantMachinery / totalAmount) * 100,
    fuel: (totalFuel / totalAmount) * 100,
    otherMaterials: (totalOtherMaterials / totalAmount) * 100,
    explosives: (totalExplosives / totalAmount) * 100,
    totalAmount,
    steelTypes: collectedSteelTypes.size > 0 ? Array.from(collectedSteelTypes) : undefined
  };
  
  logger.log('🔧 calculateWeightedComponents - Collected Steel Types:', result.steelTypes);
  
  return result;
}

export function calculateClassificationBasedPvcWithComponents(
  billAmount: number,
  quarterlyAverages: QuarterlyAverage[],
  components: {
    fixed: number;
    labour: number;
    steel: number;
    cement: number;
    plantMachinery: number;
    fuel: number;
    otherMaterials: number;
    explosives: number;
    steelTypes?: string[];
  }
): {
  labourPvc: number;
  plantMachineryPvc: number;
  fuelPowerPvc: number;
  otherMaterialsPvc: number;
  cementPvc: number;
  steelPvc: number;
  explosivesPvc: number;
  totalPvc: number;
} {
  // Create a map for easy lookup
  const indexMap = new Map<string, QuarterlyAverage>();
  quarterlyAverages.forEach(qa => {
    indexMap.set(qa.indexName, qa);
  });

  // Calculate each component
  const labourAvg = indexMap.get('Labour');
  const labourPvc = (labourAvg && components.labour > 0) 
    ? calculatePvcComponent(billAmount, labourAvg.average, labourAvg.baseValue, components.labour)
    : 0;

  const plantMachineryAvg = indexMap.get('RBI Plant Machinery');
  const plantMachineryPvc = (plantMachineryAvg && components.plantMachinery > 0)
    ? calculatePvcComponent(billAmount, plantMachineryAvg.average, plantMachineryAvg.baseValue, components.plantMachinery)
    : 0;

  const fuelPowerAvg = findFuelIndex(indexMap);
  const fuelPowerPvc = (fuelPowerAvg && components.fuel > 0)
    ? calculatePvcComponent(billAmount, fuelPowerAvg.average, fuelPowerAvg.baseValue, components.fuel)
    : 0;

  const otherMaterialsAvg = indexMap.get('RBI Other Materials');
  const otherMaterialsPvc = (otherMaterialsAvg && components.otherMaterials > 0)
    ? calculatePvcComponent(billAmount, otherMaterialsAvg.average, otherMaterialsAvg.baseValue, components.otherMaterials)
    : 0;

  // Cement PVC from classification percentages (e.g., 1C, 5C, 6C with 85% cement)
  const cementAvg = indexMap.get('RBI Cement');
  const cementPvc = (cementAvg && components.cement > 0)
    ? calculatePvcComponent(billAmount, cementAvg.average, cementAvg.baseValue, components.cement)
    : 0;

  // For steel, use selected steel types if available, otherwise use default behavior
  let steelPvc = 0;
  if (components.steel > 0) {
    // Map steel type codes to index names
    const steelTypeMap: { [key: string]: string } = {
      'TMT': 'Steel TMT Bars',
      'ANGLE_CHANNEL': 'Steel Angle/Channel',
      'PLATES': 'Steel Plates',
      'OTHER_SECTIONS': 'Steel Other Sections'
    };

    if (components.steelTypes && components.steelTypes.length > 0) {
      // Use selected steel types - calculate average of all selected types
      const selectedIndices: QuarterlyAverage[] = [];
      
      for (const steelType of components.steelTypes) {
        const indexName = steelTypeMap[steelType];
        const steelAvg = findSteelIndex(indexMap, indexName);
        if (steelAvg) {
          selectedIndices.push(steelAvg);
        }
      }

      if (selectedIndices.length > 0) {
        // Calculate average of selected steel indices
        const avgBaseValue = selectedIndices.reduce((sum, idx) => sum + idx.baseValue, 0) / selectedIndices.length;
        const avgIndexValue = selectedIndices.reduce((sum, idx) => sum + idx.average, 0) / selectedIndices.length;
        
        steelPvc = calculatePvcComponent(billAmount, avgIndexValue, avgBaseValue, components.steel);
        
        logger.log(`📊 Steel PVC Calculation with ${selectedIndices.length} selected type(s):`, {
          steelTypes: components.steelTypes,
          selectedIndices: selectedIndices.map(idx => ({ name: idx.indexName, base: idx.baseValue, avg: idx.average })),
          avgBaseValue,
          avgIndexValue,
          steelPvc
        });
      }
    } else {
      // Default behavior: use AVERAGE of ALL available steel indices (GCC requirement)
      const steelIndices = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
      const availableIndices: QuarterlyAverage[] = [];
      
      for (const steelIndex of steelIndices) {
        const steelAvg = findSteelIndex(indexMap, steelIndex);
        if (steelAvg) {
          availableIndices.push(steelAvg);
        }
      }
      
      if (availableIndices.length > 0) {
        // Calculate average of ALL available steel indices
        const avgBaseValue = availableIndices.reduce((sum, idx) => sum + idx.baseValue, 0) / availableIndices.length;
        const avgIndexValue = availableIndices.reduce((sum, idx) => sum + idx.average, 0) / availableIndices.length;
        
        steelPvc = calculatePvcComponent(billAmount, avgIndexValue, avgBaseValue, components.steel);
        
        logger.log(`📊 Steel PVC Calculation (default - average of all types):`, {
          availableIndices: availableIndices.map(idx => ({ name: idx.indexName, base: idx.baseValue, avg: idx.average })),
          avgBaseValue,
          avgIndexValue,
          steelPvc
        });
      }
    }
  }

  const explosivesAvg = indexMap.get('RBI Explosives');
  const explosivesPvc = (explosivesAvg && components.explosives > 0)
    ? calculatePvcComponent(billAmount, explosivesAvg.average, explosivesAvg.baseValue, components.explosives)
    : 0;

  const totalPvc = labourPvc + plantMachineryPvc + fuelPowerPvc + otherMaterialsPvc + cementPvc + steelPvc + explosivesPvc;

  return {
    labourPvc,
    plantMachineryPvc,
    fuelPowerPvc,
    otherMaterialsPvc,
    cementPvc,
    steelPvc,
    explosivesPvc,
    totalPvc
  };
}

// Calculate PVC based on work classification (GCC-2022-ACS2 compliant) - Legacy function
export async function calculateClassificationBasedPvc(
  billAmount: number,
  quarterlyAverages: QuarterlyAverage[],
  workClassificationCode?: string | null
): Promise<{
  labourPvc: number;
  plantMachineryPvc: number;
  fuelPowerPvc: number;
  otherMaterialsPvc: number;
  cementPvc: number;
  steelPvc: number;
  explosivesPvc: number;
  totalPvc: number;
}> {
  // Create a map for easy lookup
  const indexMap = new Map<string, QuarterlyAverage>();
  quarterlyAverages.forEach(qa => {
    indexMap.set(qa.indexName, qa);
  });

  // Get work classification from database or use default
  const classification = await getClassificationOrDefault(workClassificationCode);
  
  if (!classification) {
    console.error('No classification found, returning zero PVC');
    return {
      labourPvc: 0,
      plantMachineryPvc: 0,
      fuelPowerPvc: 0,
      otherMaterialsPvc: 0,
      cementPvc: 0,
      steelPvc: 0,
      explosivesPvc: 0,
      totalPvc: 0
    };
  }

  const components = {
    fixed: classification.fixed,
    labour: classification.labour,
    steel: classification.steel,
    cement: classification.cement,
    plantMachinery: classification.plantMachinery,
    fuel: classification.fuel,
    otherMaterials: classification.otherMaterials,
    explosives: classification.explosives
  };

  // Calculate each component
  const labourAvg = indexMap.get('Labour');
  const labourPvc = (labourAvg && components.labour > 0) 
    ? calculatePvcComponent(billAmount, labourAvg.average, labourAvg.baseValue, components.labour)
    : 0;

  const plantMachineryAvg = indexMap.get('RBI Plant Machinery');
  const plantMachineryPvc = (plantMachineryAvg && components.plantMachinery > 0)
    ? calculatePvcComponent(billAmount, plantMachineryAvg.average, plantMachineryAvg.baseValue, components.plantMachinery)
    : 0;

  const fuelPowerAvg = findFuelIndex(indexMap);
  const fuelPowerPvc = (fuelPowerAvg && components.fuel > 0)
    ? calculatePvcComponent(billAmount, fuelPowerAvg.average, fuelPowerAvg.baseValue, components.fuel)
    : 0;

  const otherMaterialsAvg = indexMap.get('RBI Other Materials');
  const otherMaterialsPvc = (otherMaterialsAvg && components.otherMaterials > 0)
    ? calculatePvcComponent(billAmount, otherMaterialsAvg.average, otherMaterialsAvg.baseValue, components.otherMaterials)
    : 0;

  // Cement PVC from classification percentages (e.g., 1C, 5C, 6C with 85% cement)
  const cementAvg = indexMap.get('RBI Cement');
  const cementPvc = (cementAvg && components.cement > 0)
    ? calculatePvcComponent(billAmount, cementAvg.average, cementAvg.baseValue, components.cement)
    : 0;

  // For steel, we can use various steel indices - prioritize the most suitable
  let steelPvc = 0;
  if (components.steel > 0) {
    const steelIndices = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
    for (const steelIndex of steelIndices) {
      const steelAvg = findSteelIndex(indexMap, steelIndex);
      if (steelAvg) {
        steelPvc = calculatePvcComponent(billAmount, steelAvg.average, steelAvg.baseValue, components.steel);
        break; // Use the first available steel index
      }
    }
  }

  const explosivesAvg = indexMap.get('RBI Explosives');
  const explosivesPvc = (explosivesAvg && components.explosives > 0)
    ? calculatePvcComponent(billAmount, explosivesAvg.average, explosivesAvg.baseValue, components.explosives)
    : 0;

  const totalPvc = labourPvc + plantMachineryPvc + fuelPowerPvc + otherMaterialsPvc + cementPvc + steelPvc + explosivesPvc;

  return {
    labourPvc,
    plantMachineryPvc,
    fuelPowerPvc,
    otherMaterialsPvc,
    cementPvc,
    steelPvc,
    explosivesPvc,
    totalPvc
  };
}

// Legacy function for backward compatibility
export async function calculateTotalPvc(
  billAmount: number,
  quarterlyAverages: QuarterlyAverage[]
): Promise<{
  labourPvc: number;
  plantMachineryPvc: number;
  fuelPowerPvc: number;
  otherMaterialsPvc: number;
  totalPvc: number;
}> {
  const result = await calculateClassificationBasedPvc(billAmount, quarterlyAverages, '7A');
  
  return {
    labourPvc: result.labourPvc,
    plantMachineryPvc: result.plantMachineryPvc,
    fuelPowerPvc: result.fuelPowerPvc,
    otherMaterialsPvc: result.otherMaterialsPvc,
    totalPvc: result.totalPvc
  };
}

// Calculate dedicated cement PVC with 85% component percentage
export function calculateDedicatedCementPvc(
  cementAmount: number,
  quarterlyAverages: QuarterlyAverage[]
): number {
  if (!cementAmount || cementAmount <= 0) return 0;
  
  const indexMap = new Map<string, QuarterlyAverage>();
  quarterlyAverages.forEach(qa => {
    indexMap.set(qa.indexName, qa);
  });

  const cementAvg = indexMap.get('RBI Cement');
  if (!cementAvg) return 0;

  // Use 85% component percentage as specified
  return calculatePvcComponent(cementAmount, cementAvg.average, cementAvg.baseValue, 85);
}

// Calculate dedicated steel PVC with 85% component percentage
export function calculateDedicatedSteelPvc(
  steelAmount: number,
  quarterlyAverages: QuarterlyAverage[],
  selectedSteelComponent?: string
): number {
  if (!steelAmount || steelAmount <= 0) return 0;
  
  const indexMap = new Map<string, QuarterlyAverage>();
  quarterlyAverages.forEach(qa => {
    indexMap.set(qa.indexName, qa);
  });

  // Available steel indices
  const steelIndices = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
  
  // Use selected steel component if provided and available
  if (selectedSteelComponent && steelIndices.includes(selectedSteelComponent)) {
    const steelAvg = findSteelIndex(indexMap, selectedSteelComponent);
    if (steelAvg) {
      return calculatePvcComponent(steelAmount, steelAvg.average, steelAvg.baseValue, 85);
    }
  }
  
  // Fallback to first available steel index
  for (const steelIndex of steelIndices) {
    const steelAvg = findSteelIndex(indexMap, steelIndex);
    if (steelAvg) {
      return calculatePvcComponent(steelAmount, steelAvg.average, steelAvg.baseValue, 85);
    }
  }
  
  return 0;
}

// Calculate dedicated cement PVC with detailed steps for reports
export function calculateDedicatedCementPvcWithSteps(
  cementAmount: number,
  quarterlyAverages: QuarterlyAverage[]
): {
  finalPvc: number;
  steps: {
    step1: { description: string; calculation: string; result: number };
    step2: { description: string; calculation: string; result: number };
    step3: { description: string; calculation: string; result: number };
    step4: { description: string; calculation: string; result: number };
  };
  formula: string;
  averageIndex: number;
  baseIndex: number;
  componentPercentage: number;
  componentName: string;
  indexSource: string;
} | null {
  if (!cementAmount || cementAmount <= 0) return null;
  
  const indexMap = new Map<string, QuarterlyAverage>();
  quarterlyAverages.forEach(qa => {
    indexMap.set(qa.indexName, qa);
  });

  const cementAvg = indexMap.get('RBI Cement');
  if (!cementAvg) return null;

  const cementCalc = calculatePvcComponentWithSteps(
    cementAmount, 
    cementAvg.average, 
    cementAvg.baseValue, 
    85, // 85% component percentage
    'Dedicated Cement'
  );

  return {
    ...cementCalc,
    averageIndex: cementAvg.average,
    baseIndex: cementAvg.baseValue,
    componentPercentage: 85,
    componentName: 'Dedicated Cement',
    indexSource: 'RBI Cement, Lime & Plaster index'
  };
}

// Calculate dedicated steel PVC with detailed steps for reports
export function calculateDedicatedSteelPvcWithSteps(
  steelAmount: number,
  quarterlyAverages: QuarterlyAverage[],
  selectedSteelComponent?: string
): {
  finalPvc: number;
  steps: {
    step1: { description: string; calculation: string; result: number };
    step2: { description: string; calculation: string; result: number };
    step3: { description: string; calculation: string; result: number };
    step4: { description: string; calculation: string; result: number };
  };
  formula: string;
  averageIndex: number;
  baseIndex: number;
  componentPercentage: number;
  componentName: string;
  indexSource: string;
  selectedComponent: string;
} | null {
  if (!steelAmount || steelAmount <= 0) return null;
  
  const indexMap = new Map<string, QuarterlyAverage>();
  quarterlyAverages.forEach(qa => {
    indexMap.set(qa.indexName, qa);
  });

  // Available steel indices
  const steelIndices = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
  
  let selectedIndex = selectedSteelComponent;
  
  // Use selected steel component if provided and available
  if (selectedSteelComponent && steelIndices.includes(selectedSteelComponent)) {
    const steelAvg = findSteelIndex(indexMap, selectedSteelComponent);
    if (steelAvg) {
      const steelCalc = calculatePvcComponentWithSteps(
        steelAmount, 
        steelAvg.average, 
        steelAvg.baseValue, 
        85, // 85% component percentage
        'Dedicated Steel'
      );

      return {
        ...steelCalc,
        averageIndex: steelAvg.average,
        baseIndex: steelAvg.baseValue,
        componentPercentage: 85,
        componentName: 'Dedicated Steel',
        indexSource: `Joint Plant Committee steel rates (${selectedSteelComponent})`,
        selectedComponent: selectedSteelComponent
      };
    }
  }
  
  // Fallback to first available steel index
  for (const steelIndex of steelIndices) {
    const steelAvg = findSteelIndex(indexMap, steelIndex);
    if (steelAvg) {
      selectedIndex = steelIndex;
      const steelCalc = calculatePvcComponentWithSteps(
        steelAmount, 
        steelAvg.average, 
        steelAvg.baseValue, 
        85, // 85% component percentage
        'Dedicated Steel'
      );

      return {
        ...steelCalc,
        averageIndex: steelAvg.average,
        baseIndex: steelAvg.baseValue,
        componentPercentage: 85,
        componentName: 'Dedicated Steel',
        indexSource: `Joint Plant Committee steel rates (${steelIndex})`,
        selectedComponent: steelIndex
      };
    }
  }
  
  return null;
}

// Calculate comprehensive steel PVC with breakdown for all steel components
export function calculateComprehensiveSteelPvcWithSteps(
  steelAmount: number,
  quarterlyAverages: QuarterlyAverage[],
  selectedSteelComponent?: string
): {
  selectedComponent: {
    finalPvc: number;
    steps: any;
    formula: string;
    averageIndex: number;
    baseIndex: number;
    componentPercentage: number;
    componentName: string;
    indexSource: string;
    selectedComponent: string;
  } | null;
  allSteelComponents: {
    [key: string]: {
      finalPvc: number;
      averageIndex: number;
      baseIndex: number;
      variation: number;
      available: boolean;
      componentName: string;
      indexSource: string;
    };
  };
  totalAmount: number;
} {
  if (!steelAmount || steelAmount <= 0) {
    return {
      selectedComponent: null,
      allSteelComponents: {},
      totalAmount: 0
    };
  }
  
  const indexMap = new Map<string, QuarterlyAverage>();
  quarterlyAverages.forEach(qa => {
    indexMap.set(qa.indexName, qa);
  });

  // Available steel indices
  const steelIndices = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
  
  const allSteelComponents: any = {};
  let selectedComponent = null;
  
  // Calculate for all steel components to show comparison
  steelIndices.forEach(steelIndex => {
    const steelAvg = findSteelIndex(indexMap, steelIndex);
    if (steelAvg) {
      const pvc = calculatePvcComponent(steelAmount, steelAvg.average, steelAvg.baseValue, 85);
      const variation = ((steelAvg.average - steelAvg.baseValue) / steelAvg.baseValue) * 100;
      
      allSteelComponents[steelIndex] = {
        finalPvc: pvc,
        averageIndex: steelAvg.average,
        baseIndex: steelAvg.baseValue,
        variation: variation,
        available: true,
        componentName: steelIndex,
        indexSource: `Joint Plant Committee steel rates (${steelIndex})`
      };
    } else {
      allSteelComponents[steelIndex] = {
        finalPvc: 0,
        averageIndex: 0,
        baseIndex: 0,
        variation: 0,
        available: false,
        componentName: steelIndex,
        indexSource: `Joint Plant Committee steel rates (${steelIndex})`
      };
    }
  });
  
  // Calculate detailed steps for selected component
  if (selectedSteelComponent && steelIndices.includes(selectedSteelComponent)) {
    const steelAvg = findSteelIndex(indexMap, selectedSteelComponent);
    if (steelAvg) {
      const steelCalc = calculatePvcComponentWithSteps(
        steelAmount, 
        steelAvg.average, 
        steelAvg.baseValue, 
        85, // 85% component percentage
        'Dedicated Steel'
      );

      selectedComponent = {
        ...steelCalc,
        averageIndex: steelAvg.average,
        baseIndex: steelAvg.baseValue,
        componentPercentage: 85,
        componentName: 'Dedicated Steel',
        indexSource: `Joint Plant Committee steel rates (${selectedSteelComponent})`,
        selectedComponent: selectedSteelComponent
      };
    }
  }
  
  // If no specific component selected, use the first available
  if (!selectedComponent) {
    for (const steelIndex of steelIndices) {
      const steelAvg = findSteelIndex(indexMap, steelIndex);
      if (steelAvg) {
        const steelCalc = calculatePvcComponentWithSteps(
          steelAmount, 
          steelAvg.average, 
          steelAvg.baseValue, 
          85, // 85% component percentage
          'Dedicated Steel'
        );

        selectedComponent = {
          ...steelCalc,
          averageIndex: steelAvg.average,
          baseIndex: steelAvg.baseValue,
          componentPercentage: 85,
          componentName: 'Dedicated Steel',
          indexSource: `Joint Plant Committee steel rates (${steelIndex})`,
          selectedComponent: steelIndex
        };
        break;
      }
    }
  }
  
  return {
    selectedComponent,
    allSteelComponents,
    totalAmount: steelAmount
  };
}

// Calculate quarter based on contract base month (quarters start from next month of base month)
export function getQuarterFromDate(date: Date, baseMonth: Date): string {
  // Validate inputs
  if (!date || isNaN(date.getTime())) {
    throw new Error('Invalid measurement date provided');
  }
  
  if (!baseMonth || isNaN(baseMonth.getTime())) {
    throw new Error('Invalid contract base month provided');
  }
  
  const baseYear = baseMonth.getFullYear();
  const baseMonthNum = baseMonth.getMonth(); // 0-based
  const dateYear = date.getFullYear();
  const dateMonthNum = date.getMonth(); // 0-based
  
  // Validate year ranges to prevent overflow
  if (baseYear < 1970 || baseYear > 2100 || dateYear < 1970 || dateYear > 2100) {
    throw new Error('Date years must be between 1970 and 2100');
  }
  
  // Calculate months from the start month (next month after base month)
  const startMonth = (baseMonthNum + 1) % 12; // Next month after base month
  const startYear = baseMonthNum === 11 ? baseYear + 1 : baseYear; // Handle year wrap
  
  // Calculate total months from start
  const monthsFromStart = (dateYear - startYear) * 12 + (dateMonthNum - startMonth);
  
  // Handle cases where date might be before or equal to base month
  // Return Q0 for such cases instead of throwing an error
  if (monthsFromStart < 0) {
    return 'Q0'; // Special case for dates before first quarter
  }
  
  // Each quarter is 3 months
  const quarterNum = Math.floor(monthsFromStart / 3) + 1;
  
  // Validate quarter number is reasonable
  if (quarterNum < 1 || quarterNum > 1000) {
    throw new Error(`Invalid quarter number calculated: Q${quarterNum}. Please check your dates.`);
  }
  
  // Determine which year this quarter belongs to
  const quarterStartMonth = startMonth + ((quarterNum - 1) * 3);
  const quarterYear = startYear + Math.floor(quarterStartMonth / 12);
  
  // Validate the calculated year
  if (quarterYear < 1970 || quarterYear > 2100) {
    throw new Error(`Invalid quarter year calculated: ${quarterYear}`);
  }
  
  return `Q${quarterNum}-${quarterYear}`;
}

export function getBaseMonth(dateOfOpening: Date): Date {
  // Validate input
  if (!dateOfOpening || isNaN(dateOfOpening.getTime())) {
    throw new Error('Invalid date of opening provided for base month calculation');
  }

  // Validate year range
  const year = dateOfOpening.getFullYear();
  if (year < 1970 || year > 2100) {
    throw new Error(`Date of opening year must be between 1970 and 2100, got: ${year}`);
  }

  // Create base month by going back one month
  const baseMonth = new Date(dateOfOpening);
  
  // Handle month rollback properly
  const currentMonth = baseMonth.getMonth();
  const currentYear = baseMonth.getFullYear();
  
  if (currentMonth === 0) {
    // If current month is January (0), go to December of previous year
    baseMonth.setFullYear(currentYear - 1, 11, 1);
  } else {
    // Otherwise, just go back one month
    baseMonth.setMonth(currentMonth - 1, 1);
  }
  
  // Set to first day of the month with time 00:00:00
  baseMonth.setHours(0, 0, 0, 0);
  
  // Validate the result
  if (isNaN(baseMonth.getTime())) {
    throw new Error('Failed to calculate valid base month');
  }
  
  return baseMonth;
}

// Get the 3 months for a quarter based on base month (quarters start from next month of base month)
export function getQuarterMonths(quarter: string, baseMonth: Date): Date[] {
  // Validate inputs
  if (!quarter || typeof quarter !== 'string') {
    throw new Error(`Invalid quarter: ${quarter}`);
  }
  
  if (quarter === 'Q0') {
    throw new Error('Measurement date must be in a month after the contract base month.');
  }
  
  if (!baseMonth || isNaN(baseMonth.getTime())) {
    throw new Error(`Invalid base month: ${baseMonth}`);
  }
  
  const [q, year] = quarter.split('-');
  const quarterNum = parseInt(q.replace('Q', ''), 10);
  const quarterYear = parseInt(year, 10);
  
  // Validate quarter format
  if (isNaN(quarterNum) || isNaN(quarterYear) || quarterNum < 1) {
    throw new Error(`Invalid quarter format: ${quarter}. Expected format: Q1-2024`);
  }
  
  const baseMonthNum = baseMonth.getMonth(); // 0-based
  const baseYear = baseMonth.getFullYear();
  
  // Calculate start month for this quarter (next month after base month)
  const startMonth = (baseMonthNum + 1) % 12; // Next month after base month
  const startYear = baseMonthNum === 11 ? baseYear + 1 : baseYear;
  
  // Calculate the first month of this specific quarter
  const quarterFirstMonth = startMonth + ((quarterNum - 1) * 3);
  const quarterStartYear = startYear + Math.floor(quarterFirstMonth / 12);
  const quarterStartMonth = quarterFirstMonth % 12;
  
  // Create dates with proper validation and error handling
  const dates: Date[] = [];
  
  for (let i = 0; i < 3; i++) {
    const monthOffset = quarterStartMonth + i;
    let year = quarterStartYear + Math.floor(monthOffset / 12);
    let month = monthOffset % 12;
    
    // Ensure year and month are valid
    if (year < 1970 || year > 2100) {
      throw new Error(`Invalid year calculated for quarter ${quarter}: ${year}`);
    }
    
    if (month < 0 || month > 11) {
      // Handle negative months
      if (month < 0) {
        year += Math.floor(month / 12);
        month = ((month % 12) + 12) % 12;
      }
    }
    
    // Create date with UTC to avoid timezone issues
    const date = new Date(Date.UTC(year, month, 1));
    
    // Validate the created date
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date created for quarter ${quarter}: year=${year}, month=${month + 1}`);
    }
    
    dates.push(date);
  }
  
  return dates;
}

