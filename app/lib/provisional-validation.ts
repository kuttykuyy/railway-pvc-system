
import { prisma } from '@/lib/db';
import { getBillingSettings } from '@/lib/admin-settings';

/**
 * Check if provisional indices validation is enabled in system settings
 */
export async function isProvisionalValidationEnabled(): Promise<boolean> {
  try {
    const settings = await getBillingSettings();
    return settings.provisionalIndicesCheckEnabled;
  } catch (error) {
    console.error('Error checking provisional validation setting:', error);
    return false; // Default to disabled if error
  }
}

/**
 * Check if there are provisional indices that match the measurement date quarter
 */
export async function hasProvisionalIndicesForMeasurement(
  measurementDate: Date,
  baseMonth: Date
): Promise<{
  hasProvisionalIndices: boolean;
  provisionalIndices: string[];
  details: string;
}> {
  try {
    // Calculate the quarter for the measurement date
    const quarter = getQuarterFromMeasurementDate(measurementDate, baseMonth);
    const quarterParts = quarter.split('-');
    const year = parseInt(quarterParts[1]);
    const quarterNum = parseInt(quarterParts[0].replace('Q', ''));

    // Calculate the months in this quarter
    const quarterMonths = getQuarterMonths(quarterNum, year, baseMonth);
    
    // Get all required indices for PVC calculation
    const requiredIndices = [
      'Labour', 
      'RBI Plant Machinery', 
      'MPNG Fuel', 
      'RBI Other Materials',
      'RBI Cement', 
      'RBI Explosives',
      'Steel TMT Bars', 
      'Steel Angle/Channel', 
      'Steel Plates', 
      'Steel Other Sections'
    ];

    // Check for provisional indices in the quarter months
    const provisionalIndices: string[] = [];
    
    for (const indexName of requiredIndices) {
      const priceIndex = await prisma.priceIndex.findUnique({
        where: { name: indexName }
      });

      if (!priceIndex) continue;

      // Check if any month in the quarter has provisional data
      for (const month of quarterMonths) {
        const monthlyValue = await prisma.monthlyIndexValue.findUnique({
          where: {
            priceIndexId_month: {
              priceIndexId: priceIndex.id,
              month: month
            }
          }
        });

        if (monthlyValue && monthlyValue.isProvisional) {
          if (!provisionalIndices.includes(indexName)) {
            provisionalIndices.push(indexName);
          }
          break; // Found provisional data for this index, no need to check other months
        }
      }
    }

    return {
      hasProvisionalIndices: provisionalIndices.length > 0,
      provisionalIndices,
      details: provisionalIndices.length > 0 
        ? `The following indices have provisional data for ${quarter}: ${provisionalIndices.join(', ')}`
        : `All indices for ${quarter} are final`
    };

  } catch (error) {
    console.error('Error checking provisional indices:', error);
    return {
      hasProvisionalIndices: false,
      provisionalIndices: [],
      details: 'Error checking provisional indices status'
    };
  }
}

/**
 * Get quarter string from measurement date (similar to existing function)
 */
function getQuarterFromMeasurementDate(measurementDate: Date, baseMonth: Date): string {
  const baseMonthValue = baseMonth.getMonth() + 1; // 1-12
  const baseYear = baseMonth.getFullYear();
  
  const measurementMonthValue = measurementDate.getMonth() + 1; // 1-12
  const measurementYear = measurementDate.getFullYear();

  // Calculate months since base month
  const monthsDiff = (measurementYear - baseYear) * 12 + (measurementMonthValue - baseMonthValue);
  
  // Calculate quarter number (1-based)
  const quarterNumber = Math.ceil((monthsDiff + 1) / 3);
  
  // Calculate the year for this quarter
  const quarterStartMonth = baseMonthValue + (quarterNumber - 1) * 3;
  const quarterYear = baseYear + Math.floor((quarterStartMonth - 1) / 12);
  const adjustedQuarterYear = quarterStartMonth > 12 ? quarterYear : baseYear;

  return `Q${quarterNumber}-${adjustedQuarterYear}`;
}

/**
 * Get the three months that make up a quarter
 */
function getQuarterMonths(quarterNum: number, year: number, baseMonth: Date): Date[] {
  const baseMonthValue = baseMonth.getMonth() + 1; // 1-12
  const baseYear = baseMonth.getFullYear();

  const months: Date[] = [];
  
  // Calculate the starting month for this quarter
  const startingMonth = baseMonthValue + (quarterNum - 1) * 3;
  
  for (let i = 0; i < 3; i++) {
    const monthValue = startingMonth + i;
    const adjustedYear = baseYear + Math.floor((monthValue - 1) / 12);
    const adjustedMonth = ((monthValue - 1) % 12) + 1;
    
    const monthDate = new Date(Date.UTC(adjustedYear, adjustedMonth - 1, 1));
    months.push(monthDate);
  }
  
  return months;
}

/**
 * Validate measurement date against provisional indices (main validation function)
 */
export async function validateMeasurementDateAgainstProvisionalIndices(
  measurementDate: Date,
  baseMonth: Date
): Promise<{
  isValid: boolean;
  error?: string;
  details?: string;
}> {
  try {
    // Check if provisional validation is enabled
    // Note: provisionalIndicesCheckEnabled = true means we ALLOW provisional indices
    const allowProvisionalIndices = await isProvisionalValidationEnabled();
    
    // If provisional indices are allowed, skip validation
    if (allowProvisionalIndices) {
      return {
        isValid: true,
        details: 'Provisional indices are allowed in system settings - bill processing permitted'
      };
    }

    // If provisional indices are NOT allowed, check if there are any
    const { hasProvisionalIndices, provisionalIndices, details } = 
      await hasProvisionalIndicesForMeasurement(measurementDate, baseMonth);
    
    if (hasProvisionalIndices) {
      return {
        isValid: false,
        error: 'Cannot process bill with provisional indices',
        details: `${details}. Bills cannot be processed when provisional indices are used for PVC calculations. Please wait for final indices to be published or enable provisional indices in settings.`
      };
    }

    return {
      isValid: true,
      details: 'All required indices are final - bill processing allowed'
    };

  } catch (error) {
    console.error('Error validating measurement date against provisional indices:', error);
    return {
      isValid: false,
      error: 'Validation error',
      details: 'Unable to validate provisional indices status. Please try again.'
    };
  }
}
