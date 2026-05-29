
// GCC 17A/17B Extension Compliance for PVC Calculations
// Implements PVC restrictions as per GCC April 2022 Policy

import { prisma } from '@/lib/db';
import { QuarterlyAverage } from './types';
import { 
  calculatePvcComponent, 
  calculatePvcComponentWithSteps,
  calculateClassificationBasedPvcWithComponentsAndSteps 
} from './pvc-calculations';

export interface ExtensionDetails {
  isExtended: boolean;
  extensionType?: '17A' | '17B' | null;
  originalCompletionDate?: Date | null;
  currentCompletionDate?: Date | null;
  pvcRestrictionDate?: Date | null;
  isInExtensionPeriod: boolean;
  requiresPvcRestriction: boolean;
}

export interface ExtensionCompliantPvcResult {
  // Standard PVC results
  labourPvc: number;
  plantMachineryPvc: number;
  fuelPowerPvc: number;
  otherMaterialsPvc: number;
  cementPvc: number;
  steelPvc: number;
  explosivesPvc: number;
  totalPvc: number;
  
  // Extension compliance details
  extensionDetails: ExtensionDetails;
  appliedRestrictions: {
    isRestricted: boolean;
    restrictionType?: '17B_INDEX_CAP' | '17B_LOWER_INDICES';
    originalPvcAmount?: number;
    restrictedPvcAmount?: number;
    savingsAmount?: number;
    unrestrictedCementPvc?: number;  // Classification-based cement PVC without restriction
    unrestrictedSteelPvc?: number;   // Classification-based steel PVC without restriction
    restrictedCementPvc?: number;    // Classification-based cement PVC with restriction
    restrictedSteelPvc?: number;     // Classification-based steel PVC with restriction
    cappedIndices?: {
      labour?: number;
      plantMachinery?: number;
      fuel?: number;
      otherMaterials?: number;
      cement?: number;
      steel?: number;
      explosives?: number;
    };
    indexL_Values?: {
      labour?: number;
      plantMachinery?: number;
      fuel?: number;
      otherMaterials?: number;
      cement?: number;
      steel?: number;
      explosives?: number;
    };
  };
  
  // Detailed calculation steps (for reporting)
  detailedSteps?: any;
}

/**
 * Analyze contract extension details to determine PVC restrictions
 */
export async function analyzeContractExtension(
  contractId: string,
  measurementDate: Date
): Promise<ExtensionDetails> {
  console.log('\n🔍 ===== ANALYZING CONTRACT EXTENSION =====');
  console.log(`📋 Contract ID: ${contractId}`);
  console.log(`📅 Measurement Date: ${measurementDate.toISOString().slice(0, 10)}`);
  
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      extensions: {
        orderBy: { approvalDate: 'desc' }
      }
    }
  });

  if (!contract) {
    throw new Error('Contract not found');
  }

  console.log(`📝 Contract Agreement: ${contract.agreementNo}`);
  console.log(`🔧 Extension Status in DB:`);
  console.log(`   isExtended: ${contract.isExtended}`);
  console.log(`   extensionType: ${contract.extensionType}`);
  console.log(`   originalCompletionDate: ${contract.originalCompletionDate?.toISOString().slice(0, 10) || 'null'}`);
  console.log(`   currentCompletionDate: ${contract.currentCompletionDate?.toISOString().slice(0, 10) || 'null'}`);

  // Check if we're in an extension period
  const originalCompletion = contract.originalCompletionDate;
  const currentCompletion = contract.currentCompletionDate;
  
  const isExtended = contract.isExtended || false;
  const isInExtensionPeriod = originalCompletion 
    ? measurementDate > originalCompletion 
    : false;

  console.log(`⏰ Extension Period Check:`);
  console.log(`   isExtended: ${isExtended}`);
  console.log(`   isInExtensionPeriod: ${isInExtensionPeriod}`);
  console.log(`   Measurement > Original Completion: ${measurementDate > (originalCompletion || new Date(0))}`);

  // Get the latest extension details
  const latestExtension = contract.extensions[0];
  const extensionType = contract.extensionType as '17A' | '17B' | null;

  console.log(`📊 Extension Type: ${extensionType || 'null'}`);

  // Determine if PVC restriction applies (17B extensions only)
  const requiresPvcRestriction = isInExtensionPeriod && extensionType === '17B';
  
  console.log(`🚨 PVC Restriction Required: ${requiresPvcRestriction}`);
  
  // For 17B, PVC restriction date is the end of original/17A completion period
  let pvcRestrictionDate: Date | undefined;
  if (requiresPvcRestriction && originalCompletion) {
    pvcRestrictionDate = originalCompletion;
    console.log(`📍 PVC Restriction Date: ${pvcRestrictionDate.toISOString().slice(0, 10)}`);
  }

  console.log('🔍 ===== ANALYSIS COMPLETE =====\n');

  return {
    isExtended,
    extensionType,
    originalCompletionDate: originalCompletion,
    currentCompletionDate: currentCompletion,
    pvcRestrictionDate,
    isInExtensionPeriod,
    requiresPvcRestriction
  };
}

/**
 * Get capped index values for 17B restrictions
 * As per GCC 46A.10: "indices applicable to the last month of original completion period"
 * 
 * CORRECT FORMULA: Index_L = Index of the LAST MONTH of the original (or 17A-extended) completion period
 * 
 * Example: If original completion date is March 31, 2025
 *          Then Index_L = Index of March 2025 (the last month of completion period)
 * 
 * Returns both the Index_L (last month index) and the capped value (min of current quarter avg and Index_L)
 */
export async function getCappedIndices(
  restrictionDate: Date,
  quarterlyAverages: QuarterlyAverage[],
  baseMonth: Date
): Promise<{ 
  cappedIndices: { [indexName: string]: number };
  indexL_Values: { [indexName: string]: number };
  isProvisional?: boolean;
  missingIndices?: string[];
}> {
  const cappedIndices: { [indexName: string]: number } = {};
  const indexL_Values: { [indexName: string]: number } = {};
  const missingIndices: string[] = [];
  
  // GCC 46A.10: Index_L is the index of the LAST MONTH of the original completion period
  // 
  // For example: If original completion date is 30 Mar 2025,
  // the last month of completion period is March 2025
  // Index_L = Index of March 2025
  
  // Get the last month of the completion period
  const lastMonthOfCompletion = new Date(
    restrictionDate.getFullYear(),
    restrictionDate.getMonth(),
    1
  );
  
  console.log(`📅 17B Restriction - Index_L Calculation:`, {
    originalCompletionDate: restrictionDate.toISOString().slice(0, 10),
    lastMonthOfCompletion: lastMonthOfCompletion.toISOString().slice(0, 7),
    formula: 'Index_L = Index of the last month of original completion period'
  });
  
  for (const qa of quarterlyAverages) {
    // Fetch the index value for the last month of completion
    const lastMonthValue = await prisma.monthlyIndexValue.findFirst({
      where: {
        priceIndex: { name: qa.indexName },
        month: lastMonthOfCompletion
      }
    });
    
    if (lastMonthValue) {
      // Store Index_L (index of last month)
      const indexL = lastMonthValue.value;
      indexL_Values[qa.indexName] = indexL;
      
      // GCC 46A.10: UsedIndex = min(CurrentQuarterAvg, Index_L)
      // - If CurrentQuarterAvg > Index_L: Cap at Index_L (restrict upward variation)
      // - If CurrentQuarterAvg <= Index_L: Use CurrentQuarterAvg (allow downward variation)
      cappedIndices[qa.indexName] = Math.min(qa.average, indexL);
      
      console.log(`🔒 17B Cap for ${qa.indexName} (GCC 46A.10):`, {
        currentQuarterAvg: qa.average.toFixed(2),
        indexL_LastMonth: indexL.toFixed(2),
        lastMonth: lastMonthOfCompletion.toISOString().slice(0, 7),
        usedIndex: cappedIndices[qa.indexName].toFixed(2),
        appliedRule: qa.average > indexL
          ? 'GCC 46A.10(a) - Capped to Index_L (indices increased beyond Index_L)'
          : 'GCC 46A.10(b) - Using lower quarter value (indices below Index_L)'
      });
    } else {
      // Fallback if we don't have data for the last month
      indexL_Values[qa.indexName] = qa.baseValue;
      cappedIndices[qa.indexName] = qa.baseValue;
      missingIndices.push(qa.indexName);
      console.warn(`⚠️ No monthly data for ${qa.indexName} in ${lastMonthOfCompletion.toISOString().slice(0, 7)}, using base value (PROVISIONAL)`);
    }
  }
  
  const isProvisional = missingIndices.length > 0;
  
  return { 
    cappedIndices, 
    indexL_Values,
    isProvisional,
    missingIndices: isProvisional ? missingIndices : undefined
  };
}

/**
 * Calculate PVC with GCC 17A/17B extension compliance
 */
export async function calculateExtensionCompliantPvc(
  contractId: string,
  billAmount: number,
  measurementDate: Date,
  quarterlyAverages: QuarterlyAverage[],
  workClassificationCode?: string | null,
  includeDetailedSteps: boolean = false,
  providedComponents?: any | null
): Promise<ExtensionCompliantPvcResult> {
  
  // Get contract details including base month
  const contract = await prisma.contract.findUnique({
    where: { id: contractId }
  });
  
  if (!contract) {
    throw new Error('Contract not found');
  }
  
  // Analyze extension details
  const extensionDetails = await analyzeContractExtension(contractId, measurementDate);
  
  // Get component percentages
  let components = providedComponents; // Use provided components if available
  
  // Only do database lookup if components not provided
  if (!components) {
    if (workClassificationCode) {
      // First, try to find by code in SubClassification table
      const subClassification = await prisma.subClassification.findFirst({
        where: { 
          code: workClassificationCode,
          isActive: true 
        }
      });
      
      if (subClassification) {
        components = {
          fixed: subClassification.fixed,
          labour: subClassification.labour,
          plantMachinery: subClassification.plantMachinery,
          fuel: subClassification.fuel,
          otherMaterials: subClassification.otherMaterials,
          cement: subClassification.cement,
          steel: subClassification.steel,
          explosives: subClassification.explosives
        };
      } else {
        // Fallback to legacy Classification table
        const classification = await prisma.classification.findFirst({
          where: { 
            code: workClassificationCode,
            isActive: true 
          }
        });
        
        if (classification) {
          components = {
            fixed: classification.fixed,
            labour: classification.labour,
            plantMachinery: classification.plantMachinery,
            fuel: classification.fuel,
            otherMaterials: classification.otherMaterials,
            cement: classification.cement,
            steel: classification.steel,
            explosives: classification.explosives
          };
        }
      }
    }

    // If no classification found by code, try to find default
    if (!components) {
      // Try default SubClassification first
      const defaultSubClassification = await prisma.subClassification.findFirst({
        where: { isDefault: true, isActive: true }
      });
      
      if (defaultSubClassification) {
        components = {
          fixed: defaultSubClassification.fixed,
          labour: defaultSubClassification.labour,
          plantMachinery: defaultSubClassification.plantMachinery,
          fuel: defaultSubClassification.fuel,
          otherMaterials: defaultSubClassification.otherMaterials,
          cement: defaultSubClassification.cement,
          steel: defaultSubClassification.steel,
          explosives: defaultSubClassification.explosives
        };
      } else {
        // Fallback to legacy default Classification
        const defaultClassification = await prisma.classification.findFirst({
          where: { isDefault: true, isActive: true }
        });
        
        if (defaultClassification) {
          components = {
            fixed: defaultClassification.fixed,
            labour: defaultClassification.labour,
            plantMachinery: defaultClassification.plantMachinery,
            fuel: defaultClassification.fuel,
            otherMaterials: defaultClassification.otherMaterials,
            cement: defaultClassification.cement,
            steel: defaultClassification.steel,
            explosives: defaultClassification.explosives
          };
        }
      }
    }

    // If still no components found, throw error
    if (!components) {
      throw new Error('No valid work classification found. Please ensure at least one default classification exists.');
    }
  }

  let result: ExtensionCompliantPvcResult;
  
  // Calculate PVC based on extension restrictions
  if (extensionDetails.requiresPvcRestriction && extensionDetails.pvcRestrictionDate) {
    // 17B Extension: Apply PVC restrictions
    result = await calculateRestrictedPvc(
      billAmount,
      quarterlyAverages,
      components,
      extensionDetails,
      contract.baseMonth,
      includeDetailedSteps
    );
  } else {
    // No restrictions: Calculate normal PVC (17A or no extension)
    result = await calculateNormalPvc(
      billAmount,
      quarterlyAverages,
      components,
      extensionDetails,
      includeDetailedSteps
    );
  }

  return result;
}

/**
 * Calculate PVC with 17B restrictions applied
 */
async function calculateRestrictedPvc(
  billAmount: number,
  quarterlyAverages: QuarterlyAverage[],
  components: any,
  extensionDetails: ExtensionDetails,
  baseMonth: Date,
  includeDetailedSteps: boolean
): Promise<ExtensionCompliantPvcResult> {
  
  // Get capped indices using the three-month quarterly average
  // Returns both cappedIndices (result of min operation) and indexL_Values (actual Index_L from last month)
  const { cappedIndices, indexL_Values } = await getCappedIndices(
    extensionDetails.pvcRestrictionDate!,
    quarterlyAverages,
    baseMonth
  );
  
  // Calculate unrestricted PVC (for comparison)
  const unrestrictedResult = includeDetailedSteps
    ? calculateClassificationBasedPvcWithComponentsAndSteps(billAmount, quarterlyAverages, components)
    : null;
  
  const originalPvcAmount = unrestrictedResult?.totalPvc || 0;
  const unrestrictedCementPvc = unrestrictedResult?.cementPvc || 0;
  const unrestrictedSteelPvc = unrestrictedResult?.steelPvc || 0;
  
  // Create restricted quarterly averages
  const restrictedAverages: QuarterlyAverage[] = quarterlyAverages.map(qa => ({
    ...qa,
    average: cappedIndices[qa.indexName] || qa.average
  }));
  
  // Calculate restricted PVC
  const restrictedResult = includeDetailedSteps
    ? calculateClassificationBasedPvcWithComponentsAndSteps(billAmount, restrictedAverages, components)
    : calculateNormalPvcComponents(billAmount, restrictedAverages, components);

  const restrictedPvcAmount = restrictedResult.totalPvc;
  const savingsAmount = Math.max(0, originalPvcAmount - restrictedPvcAmount);
  
  // Determine restriction type
  const restrictionType = originalPvcAmount > restrictedPvcAmount 
    ? '17B_INDEX_CAP' as const
    : '17B_LOWER_INDICES' as const;

  return {
    labourPvc: restrictedResult.labourPvc,
    plantMachineryPvc: restrictedResult.plantMachineryPvc,
    fuelPowerPvc: restrictedResult.fuelPowerPvc,
    otherMaterialsPvc: restrictedResult.otherMaterialsPvc,
    cementPvc: restrictedResult.cementPvc,
    steelPvc: restrictedResult.steelPvc,
    explosivesPvc: restrictedResult.explosivesPvc,
    totalPvc: restrictedPvcAmount,
    extensionDetails,
    appliedRestrictions: {
      isRestricted: true,
      restrictionType,
      originalPvcAmount,
      restrictedPvcAmount,
      savingsAmount,
      unrestrictedCementPvc,      // Add unrestricted cement PVC
      unrestrictedSteelPvc,        // Add unrestricted steel PVC
      restrictedCementPvc: restrictedResult.cementPvc,  // Add restricted cement PVC
      restrictedSteelPvc: restrictedResult.steelPvc,    // Add restricted steel PVC
      cappedIndices: {
        labour: cappedIndices['Labour'],
        plantMachinery: cappedIndices['RBI Plant Machinery'],
        fuel: cappedIndices['MPNG Fuel'] ?? Object.entries(cappedIndices).find(([k]) => k.startsWith('MPNG Fuel'))?.[1],
        otherMaterials: cappedIndices['RBI Other Materials'],
        cement: cappedIndices['RBI Cement'],
        steel: cappedIndices['Steel TMT Bars'] ?? Object.entries(cappedIndices).find(([k]) => k.startsWith('Steel TMT Bars'))?.[1], // Support city-suffixed steel indices
        explosives: cappedIndices['RBI Explosives']
      },
      indexL_Values: {
        labour: indexL_Values['Labour'],
        plantMachinery: indexL_Values['RBI Plant Machinery'],
        fuel: indexL_Values['MPNG Fuel'] ?? Object.entries(indexL_Values).find(([k]) => k.startsWith('MPNG Fuel'))?.[1],
        otherMaterials: indexL_Values['RBI Other Materials'],
        cement: indexL_Values['RBI Cement'],
        steel: indexL_Values['Steel TMT Bars'] ?? Object.entries(indexL_Values).find(([k]) => k.startsWith('Steel TMT Bars'))?.[1],
        explosives: indexL_Values['RBI Explosives']
      }
    },
    detailedSteps: (restrictedResult as any).detailedSteps || null
  };
}

/**
 * Calculate normal PVC without restrictions (17A or no extension)
 */
async function calculateNormalPvc(
  billAmount: number,
  quarterlyAverages: QuarterlyAverage[],
  components: any,
  extensionDetails: ExtensionDetails,
  includeDetailedSteps: boolean
): Promise<ExtensionCompliantPvcResult> {
  
  const result = includeDetailedSteps
    ? calculateClassificationBasedPvcWithComponentsAndSteps(billAmount, quarterlyAverages, components)
    : calculateNormalPvcComponents(billAmount, quarterlyAverages, components);

  return {
    labourPvc: result.labourPvc,
    plantMachineryPvc: result.plantMachineryPvc,
    fuelPowerPvc: result.fuelPowerPvc,
    otherMaterialsPvc: result.otherMaterialsPvc,
    cementPvc: result.cementPvc,
    steelPvc: result.steelPvc,
    explosivesPvc: result.explosivesPvc,
    totalPvc: result.totalPvc,
    extensionDetails,
    appliedRestrictions: {
      isRestricted: false
    },
    detailedSteps: (result as any).detailedSteps || null
  };
}

/**
 * Helper function to calculate PVC components without detailed steps
 */
function calculateNormalPvcComponents(
  billAmount: number,
  quarterlyAverages: QuarterlyAverage[],
  components: any
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
  const indexMap = new Map<string, QuarterlyAverage>();
  quarterlyAverages.forEach(qa => {
    indexMap.set(qa.indexName, qa);
  });

  // Calculate each component (same logic as existing functions)
  const labourAvg = indexMap.get('Labour');
  const labourPvc = (labourAvg && components.labour > 0) 
    ? calculatePvcComponent(billAmount, labourAvg.average, labourAvg.baseValue, components.labour)
    : 0;

  const plantMachineryAvg = indexMap.get('RBI Plant Machinery');
  const plantMachineryPvc = (plantMachineryAvg && components.plantMachinery > 0)
    ? calculatePvcComponent(billAmount, plantMachineryAvg.average, plantMachineryAvg.baseValue, components.plantMachinery)
    : 0;

  const fuelPowerAvg = indexMap.get('MPNG Fuel') ?? (() => { for (const [k, v] of indexMap) { if (k.startsWith('MPNG Fuel - ')) return v; } return undefined; })();
  const fuelPowerPvc = (fuelPowerAvg && components.fuel > 0)
    ? calculatePvcComponent(billAmount, fuelPowerAvg.average, fuelPowerAvg.baseValue, components.fuel)
    : 0;

  const otherMaterialsAvg = indexMap.get('RBI Other Materials');
  const otherMaterialsPvc = (otherMaterialsAvg && components.otherMaterials > 0)
    ? calculatePvcComponent(billAmount, otherMaterialsAvg.average, otherMaterialsAvg.baseValue, components.otherMaterials)
    : 0;

  const cementAvg = indexMap.get('RBI Cement');
  const cementPvc = (cementAvg && components.cement > 0)
    ? calculatePvcComponent(billAmount, cementAvg.average, cementAvg.baseValue, components.cement)
    : 0;

  // For steel, use the first available steel index (supports city-suffixed names like 'Steel TMT Bars - Delhi')
  let steelPvc = 0;
  if (components.steel > 0) {
    const steelBaseNames = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
    for (const baseName of steelBaseNames) {
      // Try exact match first, then city-suffixed versions
      let steelAvg = indexMap.get(baseName);
      if (!steelAvg) {
        for (const [key, value] of indexMap) {
          if (key.startsWith(baseName + ' - ')) {
            steelAvg = value;
            break;
          }
        }
      }
      if (steelAvg) {
        steelPvc = calculatePvcComponent(billAmount, steelAvg.average, steelAvg.baseValue, components.steel);
        break;
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

/**
 * Save extension compliance details to database
 */
export async function savePvcExtensionCompliance(
  pvcCalculationId: string,
  result: ExtensionCompliantPvcResult
): Promise<void> {
  const extensionDetails = result.extensionDetails;
  const restrictions = result.appliedRestrictions;
  
  await prisma.pvcCalculation.update({
    where: { id: pvcCalculationId },
    data: {
      // Extension period tracking
      isExtensionPeriod: extensionDetails.isInExtensionPeriod,
      extensionType: extensionDetails.extensionType,
      isIndexCapped: restrictions.isRestricted,
      indexCapDate: extensionDetails.pvcRestrictionDate,
      
      // Capped indices (result of min operation - used for calculation)
      cappedLabourIndex: restrictions.cappedIndices?.labour,
      cappedPlantIndex: restrictions.cappedIndices?.plantMachinery,
      cappedFuelIndex: restrictions.cappedIndices?.fuel,
      cappedMaterialsIndex: restrictions.cappedIndices?.otherMaterials,
      cappedCementIndex: restrictions.cappedIndices?.cement,
      cappedSteelIndex: restrictions.cappedIndices?.steel,
      cappedExplosivesIndex: restrictions.cappedIndices?.explosives,
      
      // Index_L values (actual values from last month of original completion)
      indexL_Labour: restrictions.indexL_Values?.labour,
      indexL_Plant: restrictions.indexL_Values?.plantMachinery,
      indexL_Fuel: restrictions.indexL_Values?.fuel,
      indexL_Materials: restrictions.indexL_Values?.otherMaterials,
      indexL_Cement: restrictions.indexL_Values?.cement,
      indexL_Steel: restrictions.indexL_Values?.steel,
      indexL_Explosives: restrictions.indexL_Values?.explosives,
      
      // PVC restriction details
      pvcRestrictionReason: restrictions.isRestricted 
        ? `GCC ${extensionDetails.extensionType} Extension - PVC restriction applied as per clause 46A.10`
        : null,
      originalPvcAmount: restrictions.originalPvcAmount,
      restrictedPvcAmount: restrictions.restrictedPvcAmount,
      pvcSavingsDueToRestriction: restrictions.savingsAmount
    }
  });
}

/**
 * Create or update contract extension record
 */
export async function createContractExtension(
  contractId: string,
  extensionData: {
    extensionType: '17A' | '17B';
    extensionReason: string;
    originalCompletionDate: Date;
    extendedCompletionDate: Date;
    approvedBy?: string;
    orderNumber?: string;
    liquidatedDamagesRate?: number;
  }
): Promise<void> {
  const extensionDuration = Math.ceil(
    (extensionData.extendedCompletionDate.getTime() - extensionData.originalCompletionDate.getTime()) 
    / (1000 * 60 * 60 * 24)
  );

  // Create extension record
  await prisma.contractExtension.create({
    data: {
      contractId,
      extensionType: extensionData.extensionType,
      extensionReason: extensionData.extensionReason,
      originalCompletionDate: extensionData.originalCompletionDate,
      extendedCompletionDate: extensionData.extendedCompletionDate,
      extensionDuration,
      isPvcRestricted: extensionData.extensionType === '17B',
      pvcRestrictionDate: extensionData.extensionType === '17B' 
        ? extensionData.originalCompletionDate 
        : null,
      approvedBy: extensionData.approvedBy,
      orderNumber: extensionData.orderNumber,
      liquidatedDamagesRate: extensionData.liquidatedDamagesRate,
      isLiquidatedDamages: extensionData.extensionType === '17B' && (extensionData.liquidatedDamagesRate || 0) > 0
    }
  });

  // Update contract with latest extension details
  await prisma.contract.update({
    where: { id: contractId },
    data: {
      originalCompletionDate: extensionData.originalCompletionDate,
      currentCompletionDate: extensionData.extendedCompletionDate,
      extensionType: extensionData.extensionType,
      extensionReason: extensionData.extensionReason,
      extensionGrantedDate: new Date(),
      isExtended: true
    }
  });
}
