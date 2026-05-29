
import zxcvbn from 'zxcvbn';

export interface PasswordRequirements {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
}

export const DEFAULT_PASSWORD_REQUIREMENTS: PasswordRequirements = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
};

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
  strength: 0 | 1 | 2 | 3 | 4; // 0 = very weak, 4 = very strong
  suggestions: string[];
  warning?: string;
}

/**
 * Validates password against requirements and checks strength
 */
export function validatePassword(
  password: string,
  requirements: PasswordRequirements = DEFAULT_PASSWORD_REQUIREMENTS
): PasswordValidationResult {
  const errors: string[] = [];
  
  // Check minimum length
  if (password.length < requirements.minLength) {
    errors.push(`Password must be at least ${requirements.minLength} characters long`);
  }
  
  // Check uppercase
  if (requirements.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  // Check lowercase
  if (requirements.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  // Check numbers
  if (requirements.requireNumbers && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  // Check special characters
  if (requirements.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  // Use zxcvbn to check password strength
  const strengthResult = zxcvbn(password);
  
  return {
    isValid: errors.length === 0,
    errors,
    strength: strengthResult.score as 0 | 1 | 2 | 3 | 4,
    suggestions: strengthResult.feedback.suggestions,
    warning: strengthResult.feedback.warning || undefined,
  };
}

/**
 * Gets a color for password strength indicator
 */
export function getStrengthColor(strength: 0 | 1 | 2 | 3 | 4): string {
  const colors = {
    0: '#dc2626', // red-600
    1: '#ea580c', // orange-600
    2: '#f59e0b', // amber-500
    3: '#84cc16', // lime-500
    4: '#10b981', // green-500
  };
  return colors[strength];
}

/**
 * Gets a label for password strength
 */
export function getStrengthLabel(strength: 0 | 1 | 2 | 3 | 4): string {
  const labels = {
    0: 'Very Weak',
    1: 'Weak',
    2: 'Fair',
    3: 'Good',
    4: 'Strong',
  };
  return labels[strength];
}
