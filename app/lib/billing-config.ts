
/**
 * Billing configuration for credit-based system
 * Now uses dynamic admin settings from database
 */

import { getBillingSettings } from './admin-settings';

// Static credit packages (for reference)
export const CREDIT_PACKAGES = [
  { credits: 100, price: 1000, name: 'Starter' },
  { credits: 500, price: 4500, name: 'Professional' },
  { credits: 1000, price: 8000, name: 'Business' },
  { credits: 2500, price: 18750, name: 'Enterprise' }
];

/**
 * Calculate bill cost based on user's trial status and admin settings
 */
export async function calculateBillCost(user: {
  freeTrialUsed: number;
  isTrialActive: boolean;
}): Promise<number> {
  const settings = await getBillingSettings();

  // If payment processing is disabled, all bills are free
  if (!settings.paymentEnabled) {
    return 0;
  }

  // If user is still in free trial
  if (user.isTrialActive && user.freeTrialUsed < settings.freeTrialBills) {
    return 0; // Free
  }
  
  return settings.billCost; // Standard cost from admin settings
}

/**
 * Check if user has sufficient credits
 */
export function checkSufficientCredits(creditBalance: number, billCost: number): boolean {
  return creditBalance >= billCost;
}

/**
 * Check if user should see low credit warning
 */
export async function shouldShowLowCreditWarning(creditBalance: number): Promise<boolean> {
  const settings = await getBillingSettings();
  return creditBalance < settings.lowCreditThreshold;
}

/**
 * Check if payment processing is enabled
 */
export async function isPaymentProcessingEnabled(): Promise<boolean> {
  const settings = await getBillingSettings();
  return settings.paymentEnabled;
}
