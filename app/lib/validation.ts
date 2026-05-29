
/**
 * Validation utilities for Railway PVC System
 * Provides comprehensive validation for forms with detailed error messages
 */

import { format, isAfter, isBefore, isValid, parseISO, startOfMonth, differenceInMonths, addMonths } from 'date-fns';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate contract opening date
 */
export function validateContractDate(dateOfOpening: string | Date): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };

  try {
    const date = typeof dateOfOpening === 'string' ? parseISO(dateOfOpening) : dateOfOpening;
    
    if (!isValid(date)) {
      result.isValid = false;
      result.errors.push('The date you entered is not valid. Please check the date format and try again.');
      return result;
    }

    const now = new Date();
    const fiveYearsAgo = addMonths(now, -60);
    const oneYearFuture = addMonths(now, 12);

    // Check if date is too far in the past
    if (isBefore(date, fiveYearsAgo)) {
      result.warnings.push(
        `The contract opening date (${format(date, 'dd MMM yyyy')}) is more than 5 years old. ` +
        'Please verify this date is correct.'
      );
    }

    // Check if date is in the future beyond reasonable range
    if (isAfter(date, oneYearFuture)) {
      result.isValid = false;
      result.errors.push(
        `The contract opening date cannot be more than 1 year in the future. ` +
        `You entered: ${format(date, 'dd MMM yyyy')}`
      );
    }

    return result;
  } catch (error) {
    result.isValid = false;
    result.errors.push('Unable to process the date. Please use the date picker or enter in format: YYYY-MM-DD');
    return result;
  }
}

/**
 * Validate bill date of measurement
 */
export function validateBillDate(
  dateOfMeasurement: string | Date,
  contractOpeningDate: string | Date
): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };

  try {
    const billDate = typeof dateOfMeasurement === 'string' ? parseISO(dateOfMeasurement) : dateOfMeasurement;
    const contractDate = typeof contractOpeningDate === 'string' ? parseISO(contractOpeningDate) : contractOpeningDate;

    if (!isValid(billDate)) {
      result.isValid = false;
      result.errors.push('The measurement date is not valid. Please check and try again.');
      return result;
    }

    if (!isValid(contractDate)) {
      result.isValid = false;
      result.errors.push('The contract opening date is not available. Please select a valid contract.');
      return result;
    }

    // Bill date must be after contract opening date
    if (isBefore(billDate, contractDate)) {
      result.isValid = false;
      result.errors.push(
        `The measurement date (${format(billDate, 'dd MMM yyyy')}) cannot be before ` +
        `the contract opening date (${format(contractDate, 'dd MMM yyyy')}). ` +
        'Please select a date after the contract was opened.'
      );
    }

    // Check if date is too far in the future
    const now = new Date();
    const threeMonthsFuture = addMonths(now, 3);
    if (isAfter(billDate, threeMonthsFuture)) {
      result.isValid = false;
      result.errors.push(
        `The measurement date cannot be more than 3 months in the future. ` +
        `You entered: ${format(billDate, 'dd MMM yyyy')}`
      );
    }

    // Warning if contract is very old
    const monthsDiff = differenceInMonths(billDate, contractDate);
    if (monthsDiff > 36) {
      result.warnings.push(
        `This bill is for a contract that is ${monthsDiff} months old. ` +
        'Please verify the measurement date is correct.'
      );
    }

    return result;
  } catch (error) {
    result.isValid = false;
    result.errors.push('Unable to validate the date. Please try again or contact support if the issue persists.');
    return result;
  }
}

/**
 * Validate financial amounts
 */
export function validateAmount(
  amount: number | string,
  fieldName: string,
  options: {
    min?: number;
    max?: number;
    allowZero?: boolean;
    isCurrency?: boolean;
  } = {}
): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };

  const {
    min = 0,
    max = 10000000000, // 1000 crores
    allowZero = false,
    isCurrency = true
  } = options;

  try {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

    // Check if it's a valid number
    if (isNaN(numAmount)) {
      result.isValid = false;
      result.errors.push(
        `${fieldName} must be a valid number. Please enter only numbers (e.g., 2500000 for 25 lakhs).`
      );
      return result;
    }

    // Check for negative values
    if (numAmount < 0) {
      result.isValid = false;
      result.errors.push(
        `${fieldName} cannot be negative. Please enter a positive value.`
      );
      return result;
    }

    // Check for zero when not allowed
    if (!allowZero && numAmount === 0) {
      result.isValid = false;
      result.errors.push(
        `${fieldName} must be greater than zero. Please enter a valid amount.`
      );
      return result;
    }

    // Check minimum value
    if (numAmount < min) {
      result.isValid = false;
      const formattedMin = isCurrency ? formatCurrency(min) : min.toLocaleString('en-IN');
      result.errors.push(
        `${fieldName} must be at least ${formattedMin}. You entered ${isCurrency ? formatCurrency(numAmount) : numAmount.toLocaleString('en-IN')}.`
      );
      return result;
    }

    // Check maximum value
    if (numAmount > max) {
      result.isValid = false;
      const formattedMax = isCurrency ? formatCurrency(max) : max.toLocaleString('en-IN');
      result.errors.push(
        `${fieldName} cannot exceed ${formattedMax}. Please verify the amount you entered.`
      );
      return result;
    }

    // Warning for very large amounts (100 crores)
    if (isCurrency && numAmount > 1000000000) {
      result.warnings.push(
        `The amount you entered (${formatCurrency(numAmount)}) is very large. Please double-check this value.`
      );
    }

    return result;
  } catch (error) {
    result.isValid = false;
    result.errors.push(`Unable to validate ${fieldName}. Please enter a valid number.`);
    return result;
  }
}

/**
 * Validate contract value and duration for PVC eligibility
 */
export function validatePvcEligibility(
  tenderValue?: number | null,
  contractValue?: number | null,
  completionMonths?: number | null
): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };

  const value = tenderValue || contractValue;

  // If both values and duration are missing, add informational warning
  if (!value && !completionMonths) {
    result.warnings.push(
      'Contract value and completion period are not provided. ' +
      'These are needed to determine PVC eligibility as per GCC 46A.1. ' +
      'You can add them now or update the contract later.'
    );
    return result;
  }

  // Validate completion period
  if (completionMonths !== null && completionMonths !== undefined) {
    if (completionMonths < 1) {
      result.isValid = false;
      result.errors.push(
        'Completion period must be at least 1 month. Please enter a valid duration.'
      );
    }

    if (completionMonths > 120) {
      result.warnings.push(
        `The completion period (${completionMonths} months = ${Math.floor(completionMonths / 12)} years) is very long. ` +
        'Please verify this is correct.'
      );
    }
  }

  return result;
}

/**
 * Validate bill components (cement, steel) don't exceed total bill amount
 */
export function validateBillComponents(
  totalBillAmount: number,
  components: { name: string; amount: number }[]
): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };

  if (!totalBillAmount || totalBillAmount <= 0) {
    result.isValid = false;
    result.errors.push('Total bill amount must be greater than zero before adding component amounts.');
    return result;
  }

  const totalComponents = components.reduce((sum, comp) => sum + (comp.amount || 0), 0);

  if (totalComponents > totalBillAmount) {
    result.isValid = false;
    result.errors.push(
      `The total of all components (${formatCurrency(totalComponents)}) cannot exceed ` +
      `the gross bill amount (${formatCurrency(totalBillAmount)}). ` +
      'Please check the amounts you entered.'
    );

    // List components
    const componentList = components
      .filter(c => c.amount > 0)
      .map(c => `  • ${c.name}: ${formatCurrency(c.amount)}`)
      .join('\n');

    if (componentList) {
      result.errors.push('Components breakdown:\n' + componentList);
    }
  } else if (totalComponents > totalBillAmount * 0.9) {
    // Warning if components are more than 90% of bill
    result.warnings.push(
      'The component amounts add up to more than 90% of the total bill. ' +
      'Please verify these amounts are correct.'
    );
  }

  return result;
}

/**
 * Validate agreement number format
 */
export function validateAgreementNumber(agreementNo: string): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };

  if (!agreementNo || agreementNo.trim().length === 0) {
    result.isValid = false;
    result.errors.push('Agreement number is required. Please enter the contract agreement number.');
    return result;
  }

  const trimmed = agreementNo.trim();

  if (trimmed.length < 5) {
    result.warnings.push(
      'The agreement number seems very short. Please verify you entered the complete number.'
    );
  }

  if (trimmed.length > 100) {
    result.isValid = false;
    result.errors.push(
      'Agreement number is too long (maximum 100 characters). Please check what you entered.'
    );
  }

  return result;
}

/**
 * Validate price index value
 */
export function validateIndexValue(
  value: number | string,
  baseValue: number,
  indexName: string
): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };

  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(numValue)) {
    result.isValid = false;
    result.errors.push(
      `The index value for ${indexName} must be a valid number. Please enter only numbers.`
    );
    return result;
  }

  if (numValue < 0) {
    result.isValid = false;
    result.errors.push(
      `The index value for ${indexName} cannot be negative. Please enter a positive value.`
    );
    return result;
  }

  if (numValue === 0) {
    result.isValid = false;
    result.errors.push(
      `The index value for ${indexName} cannot be zero. Please enter the actual index value.`
    );
    return result;
  }

  // Check if value is drastically different from base (more than 300% or less than 30%)
  if (baseValue > 0) {
    const ratio = numValue / baseValue;
    
    if (ratio > 3) {
      result.warnings.push(
        `The index value for ${indexName} (${numValue}) is more than 3 times the base value (${baseValue}). ` +
        'This is unusual. Please verify the value is correct.'
      );
    } else if (ratio < 0.3) {
      result.warnings.push(
        `The index value for ${indexName} (${numValue}) is less than 30% of the base value (${baseValue}). ` +
        'This is unusual. Please verify the value is correct.'
      );
    }
  }

  return result;
}

/**
 * Combine multiple validation results
 */
export function combineValidationResults(...results: ValidationResult[]): ValidationResult {
  const combined: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };

  for (const result of results) {
    if (!result.isValid) {
      combined.isValid = false;
    }
    combined.errors.push(...result.errors);
    combined.warnings.push(...result.warnings);
  }

  return combined;
}

/**
 * Helper to format currency for display
 */
function formatCurrency(amount: number): string {
  const crores = amount / 10000000;
  const lakhs = amount / 100000;

  if (crores >= 1) {
    return `₹${crores.toFixed(2)} Cr`;
  } else if (lakhs >= 1) {
    return `₹${lakhs.toFixed(2)} L`;
  } else {
    return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(result: ValidationResult): {
  hasErrors: boolean;
  hasWarnings: boolean;
  errorMessage: string;
  warningMessage: string;
} {
  return {
    hasErrors: !result.isValid,
    hasWarnings: result.warnings.length > 0,
    errorMessage: result.errors.join('\n\n'),
    warningMessage: result.warnings.join('\n\n')
  };
}
