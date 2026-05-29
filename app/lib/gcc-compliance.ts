
// GCC 46A - Price Variation Clause Compliance Utilities

/**
 * GCC 46A.1 Applicability Criteria:
 * - Contract value must be above Rs. 2 Crores
 * - Completion period must be above 12 months
 */

export const GCC_PVC_MINIMUM_VALUE = 20000000; // Rs. 2 Crores
export const GCC_PVC_MINIMUM_MONTHS = 12; // 12 months

export interface PvcEligibilityResult {
  isEligible: boolean;
  reason: string;
  warnings: string[];
  valueCheck: {
    passes: boolean;
    contractValue?: number;
    minimumRequired: number;
  };
  durationCheck: {
    passes: boolean;
    completionPeriod?: number;
    minimumRequired: number;
  };
}

/**
 * Check if a contract is eligible for PVC as per GCC 46A.1
 */
export function checkPvcEligibility(
  contractValue?: number | null,
  completionPeriodMonths?: number | null
): PvcEligibilityResult {
  const warnings: string[] = [];
  
  // Check contract value
  const valueCheck = {
    passes: false,
    contractValue: contractValue || undefined,
    minimumRequired: GCC_PVC_MINIMUM_VALUE
  };
  
  if (!contractValue) {
    warnings.push('Contract value not specified');
  } else if (contractValue <= GCC_PVC_MINIMUM_VALUE) {
    valueCheck.passes = false;
    warnings.push(
      `Contract value (₹${(contractValue / 10000000).toFixed(2)} Cr) is below minimum requirement (₹2 Cr)`
    );
  } else {
    valueCheck.passes = true;
  }
  
  // Check completion period
  const durationCheck = {
    passes: false,
    completionPeriod: completionPeriodMonths || undefined,
    minimumRequired: GCC_PVC_MINIMUM_MONTHS
  };
  
  if (!completionPeriodMonths) {
    warnings.push('Completion period not specified');
  } else if (completionPeriodMonths <= GCC_PVC_MINIMUM_MONTHS) {
    durationCheck.passes = false;
    warnings.push(
      `Completion period (${completionPeriodMonths} months) is below minimum requirement (12 months)`
    );
  } else {
    durationCheck.passes = true;
  }
  
  // Determine overall eligibility
  const isEligible = valueCheck.passes && durationCheck.passes;
  
  let reason: string;
  if (isEligible) {
    reason = 'Contract meets GCC 46A.1 criteria for PVC applicability';
  } else if (!contractValue && !completionPeriodMonths) {
    reason = 'Contract value and completion period not specified - assuming PVC applicable';
  } else {
    reason = warnings.join('; ');
  }
  
  return {
    isEligible: isEligible || (!contractValue && !completionPeriodMonths), // Default to eligible if not specified
    reason,
    warnings,
    valueCheck,
    durationCheck
  };
}

/**
 * Generate a user-friendly eligibility note
 */
export function generateEligibilityNote(
  contractValue?: number | null,
  completionPeriodMonths?: number | null
): string {
  const result = checkPvcEligibility(contractValue, completionPeriodMonths);
  
  if (!contractValue && !completionPeriodMonths) {
    return 'PVC assumed applicable (contract value and duration not specified)';
  }
  
  if (result.isEligible) {
    return `PVC applicable per GCC 46A.1 (Value: ₹${((contractValue || 0) / 10000000).toFixed(2)} Cr, Duration: ${completionPeriodMonths} months)`;
  } else {
    return `PVC NOT applicable per GCC 46A.1: ${result.reason}`;
  }
}

/**
 * Format contract value for display
 */
export function formatContractValue(value: number): string {
  if (value >= 10000000) {
    return `₹${(value / 10000000).toFixed(2)} Crores`;
  } else if (value >= 100000) {
    return `₹${(value / 100000).toFixed(2)} Lakhs`;
  } else {
    return `₹${value.toLocaleString('en-IN')}`;
  }
}

/**
 * Validate base month calculation as per GCC 46A.2
 * "The Base Month for 'Price Variation Clause' shall be taken as the one month
 * prior to closing of tender, unless otherwise stated elsewhere."
 */
export function validateBaseMonth(
  dateOfOpening: Date,
  baseMonth: Date
): {
  isValid: boolean;
  expectedBaseMonth: Date;
  message: string;
} {
  // Base month should be one month prior to date of opening
  const expectedBaseMonth = new Date(dateOfOpening);
  expectedBaseMonth.setMonth(expectedBaseMonth.getMonth() - 1);
  
  // Normalize to first day of month for comparison
  const normalizedExpected = new Date(
    expectedBaseMonth.getFullYear(),
    expectedBaseMonth.getMonth(),
    1
  );
  
  const normalizedActual = new Date(
    baseMonth.getFullYear(),
    baseMonth.getMonth(),
    1
  );
  
  const isValid = 
    normalizedExpected.getTime() === normalizedActual.getTime();
  
  if (isValid) {
    return {
      isValid: true,
      expectedBaseMonth: normalizedExpected,
      message: 'Base month correctly set as one month prior to date of opening (GCC 46A.2)'
    };
  } else {
    return {
      isValid: false,
      expectedBaseMonth: normalizedExpected,
      message: `Base month should be ${normalizedExpected.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })} as per GCC 46A.2`
    };
  }
}
