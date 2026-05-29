
'use client';

import { useState, useEffect } from 'react';
import { validatePassword, getStrengthColor, getStrengthLabel, PasswordValidationResult } from '@/lib/password-strength';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

interface PasswordStrengthIndicatorProps {
  password: string;
  onValidationChange?: (result: PasswordValidationResult) => void;
}

export function PasswordStrengthIndicator({ password, onValidationChange }: PasswordStrengthIndicatorProps) {
  const [validation, setValidation] = useState<PasswordValidationResult>({
    isValid: false,
    errors: [],
    strength: 0,
    suggestions: [],
  });

  useEffect(() => {
    if (!password) {
      const emptyResult: PasswordValidationResult = {
        isValid: false,
        errors: [],
        strength: 0,
        suggestions: [],
      };
      setValidation(emptyResult);
      onValidationChange?.(emptyResult);
      return;
    }

    const result = validatePassword(password);
    setValidation(result);
    onValidationChange?.(result);
  }, [password, onValidationChange]);

  if (!password) {
    return null;
  }

  const strengthColor = getStrengthColor(validation.strength);
  const strengthLabel = getStrengthLabel(validation.strength);
  const strengthPercentage = (validation.strength / 4) * 100;

  return (
    <div className="space-y-3 mt-2">
      {/* Strength Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Password Strength:</span>
          <span className="font-medium" style={{ color: strengthColor }}>
            {strengthLabel}
          </span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full transition-all duration-300 rounded-full"
            style={{
              width: `${strengthPercentage}%`,
              backgroundColor: strengthColor,
            }}
          />
        </div>
      </div>

      {/* Validation Errors */}
      {validation.errors.length > 0 && (
        <div className="space-y-1">
          {validation.errors.map((error, index) => (
            <div key={index} className="flex items-start gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          ))}
        </div>
      )}

      {/* Requirements Checklist */}
      <div className="space-y-1">
        <div className="text-xs font-medium text-gray-600 mb-2">Requirements:</div>
        {[
          { test: password.length >= 8, label: 'At least 8 characters' },
          { test: /[A-Z]/.test(password), label: 'One uppercase letter' },
          { test: /[a-z]/.test(password), label: 'One lowercase letter' },
          { test: /[0-9]/.test(password), label: 'One number' },
          { test: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password), label: 'One special character' },
        ].map((req, index) => (
          <div key={index} className="flex items-center gap-2 text-xs">
            {req.test ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <div className="h-3.5 w-3.5 rounded-full border-2 border-gray-300" />
            )}
            <span className={req.test ? 'text-green-600' : 'text-gray-500'}>
              {req.label}
            </span>
          </div>
        ))}
      </div>

      {/* Suggestions */}
      {validation.suggestions.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-gray-600">Suggestions:</div>
          {validation.suggestions.map((suggestion, index) => (
            <div key={index} className="text-xs text-gray-600 ml-4">
              • {suggestion}
            </div>
          ))}
        </div>
      )}

      {/* Warning */}
      {validation.warning && (
        <div className="flex items-start gap-2 text-sm text-amber-600 bg-amber-50 p-2 rounded-lg">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{validation.warning}</span>
        </div>
      )}
    </div>
  );
}
