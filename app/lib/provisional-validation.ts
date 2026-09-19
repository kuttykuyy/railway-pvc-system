
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
    // The quarter, and the three months it averages, straight from the functions the PVC
    // amount itself is worked out with. This used to repeat that arithmetic locally and
    // got it wrong twice: it counted the base month into Q1, so a month on a quarter
    // boundary landed in the next quarter (Aug 2026 read as Q14 on a May 2023 base, not
    // Q13), and the months it returned started at the base month, one month early. The
    // gate then let bills through, or blocked them, on months the bill never prices
    // against.
    const { getQuarterFromDate, getQuarterMonths } = await import('@/lib/pvc-calculations');
    const quarter = getQuarterFromDate(measurementDate, baseMonth);

    // A measurement on or before the base month has no quarter to check; the measurement
    // date validation elsewhere is what rejects it.
    if (quarter === 'Q0') {
      return {
        hasProvisionalIndices: false,
        provisionalIndices: [],
        details: 'Measurement date is on or before the contract base month',
      };
    }

    const quarterMonths = getQuarterMonths(quarter, baseMonth);
    
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
