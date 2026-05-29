/**
 * Date validation utilities for PVC system
 * Ensures dates are in correct format and within realistic ranges
 */

export interface DateValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates a date string for PVC system
 * @param dateString - Date string in YYYY-MM-DD format
 * @returns Validation result with error message if invalid
 */
export function validateDate(dateString: string): DateValidationResult {
  // Check if date is provided
  if (!dateString || dateString.trim() === '') {
    return {
      isValid: false,
      error: 'Date is required'
    };
  }

  // Check format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) {
    return {
      isValid: false,
      error: 'Invalid date format. Expected YYYY-MM-DD'
    };
  }

  // Parse the date
  const date = new Date(dateString);
  
  // Check if it's a valid date
  if (isNaN(date.getTime())) {
    return {
      isValid: false,
      error: 'Invalid date value'
    };
  }

  // Extract year
  const year = date.getFullYear();
  
  // Check year range (1900-2100)
  if (year < 1900 || year > 2100) {
    return {
      isValid: false,
      error: `Invalid year: ${year}. Year must be between 1900 and 2100`
    };
  }

  // Check if the parsed date matches the input
  // This catches cases like '2024-02-31' which would be parsed as '2024-03-03'
  const yyyy = dateString.substring(0, 4);
  const mm = dateString.substring(5, 7);
  const dd = dateString.substring(8, 10);
  
  const parsedYear = date.getFullYear().toString();
  const parsedMonth = (date.getMonth() + 1).toString().padStart(2, '0');
  const parsedDay = date.getDate().toString().padStart(2, '0');
  
  if (yyyy !== parsedYear || mm !== parsedMonth || dd !== parsedDay) {
    return {
      isValid: false,
      error: 'Invalid date: date does not exist in calendar'
    };
  }

  return {
    isValid: true
  };
}

/**
 * Validates a date for API calls
 * Returns the date if valid, null if invalid
 * Logs errors to console for debugging
 */
export function validateDateForApi(dateString: string, context: string = 'API call'): string | null {
  const validation = validateDate(dateString);
  
  if (!validation.isValid) {
    console.error(`[${context}] Date validation failed:`, {
      date: dateString,
      error: validation.error
    });
    return null;
  }
  
  return dateString;
}

/**
 * Checks if a date is within a realistic range for railway contracts
 * Typically contracts are from 2000 onwards
 */
export function isRealisticContractDate(dateString: string): boolean {
  const validation = validateDate(dateString);
  if (!validation.isValid) {
    return false;
  }
  
  const date = new Date(dateString);
  const year = date.getFullYear();
  
  // Most railway contracts are from 2000 onwards
  // and shouldn't be more than 10 years in the future
  // Use IST year for realistic date check
  const currentYear = parseInt(new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(new Date()), 10);
  return year >= 2000 && year <= currentYear + 10;
}

/**
 * Sanitizes a date value from input field
 * Returns empty string if invalid, otherwise returns the validated date
 */
export function sanitizeDateInput(value: string): string {
  if (!value) return '';
  
  const validation = validateDate(value);
  return validation.isValid ? value : '';
}
