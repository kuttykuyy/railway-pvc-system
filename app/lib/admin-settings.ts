
/**
 * Admin settings utility for dynamic system configuration
 */

import { prisma, withPrismaErrorHandling } from '@/lib/db';

interface AdminSetting {
  key: string;
  value: string;
  description?: string | null;
  dataType: string;
}

// Cache for settings to avoid database calls on every request
let settingsCache: Map<string, any> = new Map();
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get all admin settings from database with caching
 */
export async function getAdminSettings(): Promise<AdminSetting[]> {
  try {
    const now = Date.now();
    
    // Return cached settings if still valid
    if (settingsCache.size > 0 && (now - cacheTimestamp) < CACHE_DURATION) {
      return Array.from(settingsCache.values());
    }

    const settings = await withPrismaErrorHandling(() => prisma.adminSettings.findMany());
    
    // Update cache
    settingsCache.clear();
    settings.forEach(setting => {
      settingsCache.set(setting.key, setting);
    });
    cacheTimestamp = now;

    return settings;
  } catch (error) {
    console.error('Error fetching admin settings:', error);
    return [];
  }
}

/**
 * Get a specific admin setting by key
 */
export async function getAdminSetting(key: string, defaultValue: any = null): Promise<any> {
  try {
    const settings = await getAdminSettings();
    const setting = settings.find(s => s.key === key);
    
    if (!setting) {
      return defaultValue;
    }

    // Parse value based on data type
    switch (setting.dataType) {
      case 'number':
        return parseFloat(setting.value) || defaultValue;
      case 'boolean':
        return setting.value.toLowerCase() === 'true';
      case 'json':
        try {
          return JSON.parse(setting.value);
        } catch {
          return defaultValue;
        }
      default:
        return setting.value;
    }
  } catch (error) {
    console.error(`Error getting setting ${key}:`, error);
    return defaultValue;
  }
}

/**
 * Clear settings cache (call after updating settings)
 */
export function clearSettingsCache(): void {
  settingsCache.clear();
  cacheTimestamp = 0;
}

/**
 * Get billing-related settings
 */
export async function getBillingSettings() {
  // Single cache read — getAdminSettings() returns a cached Map, so this is one lookup
  const settings = await getAdminSettings();
  const byKey = new Map(settings.map(s => [s.key, s]));

  const parse = (key: string, def: any) => {
    const s = byKey.get(key);
    if (!s) return def;
    switch (s.dataType) {
      case 'number': return parseFloat(s.value) || def;
      case 'boolean': return s.value.toLowerCase() === 'true';
      default: return s.value;
    }
  };

  return {
    billCost:                       Number(parse('BILL_PROCESSING_COST', 99)),
    paymentEnabled:                 Boolean(parse('PAYMENT_PROCESSING_ENABLED', true)),
    freeTrialBills:                 Number(parse('FREE_TRIAL_BILLS', 1)),
    lowCreditThreshold:             Number(parse('LOW_CREDIT_THRESHOLD', 50)),
    provisionalIndicesCheckEnabled: Boolean(parse('PROVISIONAL_INDICES_CHECK_ENABLED', true)),
  };
}

/**
 * Check if single bill creation is in maintenance mode
 */
export async function isSingleBillMaintenanceMode(): Promise<boolean> {
  return await getAdminSetting('SINGLE_BILL_MAINTENANCE_ENABLED', false);
}

/**
 * Check if bulk billing is in maintenance mode
 */
export async function isBulkBillingMaintenanceMode(): Promise<boolean> {
  return await getAdminSetting('BULK_BILLING_MAINTENANCE_ENABLED', false);
}

/**
 * Get maintenance mode status for all features
 */
export async function getMaintenanceStatus() {
  const [singleBillMaintenance, bulkBillingMaintenance] = await Promise.all([
    isSingleBillMaintenanceMode(),
    isBulkBillingMaintenanceMode()
  ]);

  return {
    singleBillMaintenance,
    bulkBillingMaintenance
  };
}

/**
 * Check if multiple bill edits are allowed
 */
export async function isMultipleBillEditsAllowed(): Promise<boolean> {
  return await getAdminSetting('ALLOW_MULTIPLE_BILL_EDITS', false);
}

/**
 * Check if email verification is required for user signup
 */
export async function isEmailVerificationRequired(): Promise<boolean> {
  return await getAdminSetting('EMAIL_VERIFICATION_REQUIRED', true);
}
