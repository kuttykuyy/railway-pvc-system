
/**
 * Utility functions to determine if bills are using provisional or final indices
 */

import { prisma } from './db';

/**
 * Check if a bill is using provisional indices
 * Returns true if ANY of the indices used for the bill's quarter are provisional
 */
export async function isBillUsingProvisionalIndices(
  quarter: string,
  baseMonth: Date
): Promise<{ isProvisional: boolean; provisionalCount: number; totalCount: number; provisionalIndices: string[]; details: string }> {
  try {
    // Delegate to getBillIndicesStatus so both use the same rule: a bill is provisional
    // when a value is flagged provisional OR a required month index is missing (borrowed).
    const status = await getBillIndicesStatus(quarter, baseMonth);
    return {
      isProvisional: status.isProvisional,
      provisionalCount: status.provisionalIndices.length,
      totalCount: status.provisionalIndices.length + status.finalIndices.length,
      // Which indices, and why. A bare count cannot tell anyone what to go and fix.
      provisionalIndices: status.provisionalIndices,
      details: status.details,
    };
  } catch (error) {
    console.error('Error checking provisional status:', error);
    return { isProvisional: false, provisionalCount: 0, totalCount: 0, provisionalIndices: [], details: '' };
  }
}

/**
 * Extract months from a quarter string (e.g., "Q1-2023" -> array of Date objects)
 */
function getQuarterMonthsFromQuarter(quarter: string, baseMonth: Date): Date[] {
  try {
    // Parse quarter string like "Q1-2023"
    const match = quarter.match(/Q(\d+)-(\d+)/);
    if (!match) return [];
    
    const quarterNum = parseInt(match[1]);
    const year = parseInt(match[2]);
    
    // Calculate base month number (0-11)
    const baseMonthNum = baseMonth.getMonth();
    
    // Calculate starting month for this quarter
    const startMonthNum = (baseMonthNum + (quarterNum - 1) * 3) % 12;
    
    // Generate 3 months for the quarter using UTC to avoid timezone mismatches
    const months: Date[] = [];
    for (let i = 0; i < 3; i++) {
      const monthNum = (startMonthNum + i) % 12;
      const monthYear = monthNum < startMonthNum ? year + 1 : year;
      months.push(new Date(Date.UTC(monthYear, monthNum, 1)));
    }
    
    return months;
  } catch (error) {
    console.error('Error parsing quarter:', error);
    return [];
  }
}

/**
 * Check if indices are available for bill calculation.
 * When provisional indices are allowed (admin setting), only checks that indices EXIST.
 * When provisional indices are NOT allowed, checks that ALL indices are final (non-provisional).
 */
export async function areFinalIndicesAvailableForBill(
  measurementDate: Date,
  baseMonth: Date
): Promise<{ available: boolean; message: string; missingMonths?: string[]; isProvisional?: boolean }> {
  try {
    // Validate measurement date is strictly in a calendar month after the contract base month
    const baseMonthDate = new Date(baseMonth);
    const measurementYear = measurementDate.getFullYear();
    const measurementMonth = measurementDate.getMonth();
    const baseYear = baseMonthDate.getFullYear();
    const baseMonthVal = baseMonthDate.getMonth();
    
    if (measurementYear < baseYear || (measurementYear === baseYear && measurementMonth <= baseMonthVal)) {
      return {
        available: false,
        message: `Measurement date must be in a month after the contract base month (${baseMonthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })})`
      };
    }

    // Import getQuarterFromDate and getQuarterMonths here to avoid circular dependencies
    const { getQuarterFromDate } = await import('./pvc-calculations');
    const { getQuarterMonths } = await import('./pvc-calculations');
    
    // Check admin setting - do we allow provisional indices?
    const { getBillingSettings } = await import('./admin-settings');
    const settings = await getBillingSettings();
    const allowProvisional = settings.provisionalIndicesCheckEnabled;
    
    // Calculate which quarter this measurement date falls into
    const quarter = getQuarterFromDate(measurementDate, baseMonth);
    
    // Get the 3 months needed for this quarter's calculation
    const quarterMonths = getQuarterMonths(quarter, baseMonth);
    
    // Normalize to first day of month for database queries using UTC representation
    const normalizedMonths = quarterMonths.map(date => 
      new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
    );
    
    // Get CORE price indices only (exclude city-specific variants like "Steel TMT Bars - Delhi", "MPNG Fuel - Mumbai")
    // City-specific indices are alternatives used by zone-specific bills, not universally required
    const allIndices = await prisma.priceIndex.findMany({ select: { id: true, name: true } });
    const coreIndices = allIndices.filter(idx => {
      // City-specific indices have " - CityName" suffix
      const citySpecificPattern = / - (Delhi|Mumbai|Chennai|Kolkata)$/;
      return !citySpecificPattern.test(idx.name);
    });
    const coreIndexIds = coreIndices.map(idx => idx.id);
    const totalIndicesCount = coreIndices.length;
    
    if (totalIndicesCount === 0) {
      return {
        available: false,
        message: 'No price indices configured in the system'
      };
    }
    
    // Check each month in the quarter (only for core indices)
    const missingMonths: string[] = [];
    let hasAnyProvisional = false;
    
    for (const month of normalizedMonths) {
      // Get total count of CORE indices for this month
      const totalIndicesForMonth = await prisma.monthlyIndexValue.count({
        where: {
          month: month,
          priceIndexId: { in: coreIndexIds }
        }
      });
      
      // Get count of finalized (non-provisional) CORE indices
      const finalIndicesForMonth = await prisma.monthlyIndexValue.count({
        where: {
          month: month,
          isProvisional: false,
          priceIndexId: { in: coreIndexIds }
        }
      });
      
      // Get count of provisional CORE indices
      const provisionalIndicesForMonth = await prisma.monthlyIndexValue.count({
        where: {
          month: month,
          isProvisional: true,
          priceIndexId: { in: coreIndexIds }
        }
      });
      
      if (provisionalIndicesForMonth > 0) {
        hasAnyProvisional = true;
      }
      
      const monthName = month.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', 
        month: 'long', 
        year: 'numeric' 
      });
      
      if (allowProvisional) {
        // When provisional allowed: only block if a month has ZERO indices entered
        // If some indices are present (even partially), allow the bill and mark as provisional
        if (totalIndicesForMonth === 0) {
          missingMonths.push(`${monthName} (no indices entered yet)`);
        } else if (totalIndicesForMonth < totalIndicesCount) {
          // Some indices are missing but we have partial data — mark as provisional, don't block
          hasAnyProvisional = true;
        }
      } else {
        // When provisional NOT allowed: block if any are provisional or missing
        if (finalIndicesForMonth < totalIndicesCount) {
          if (totalIndicesForMonth === 0) {
            missingMonths.push(`${monthName} (no indices entered yet)`);
          } else if (provisionalIndicesForMonth > 0 && finalIndicesForMonth === 0) {
            missingMonths.push(`${monthName} (all ${totalIndicesForMonth} indices are provisional)`);
          } else if (provisionalIndicesForMonth > 0) {
            missingMonths.push(`${monthName} (${finalIndicesForMonth} final, ${provisionalIndicesForMonth} provisional, ${totalIndicesCount - totalIndicesForMonth} missing)`);
          } else {
            missingMonths.push(`${monthName} (${finalIndicesForMonth}/${totalIndicesCount} entered)`);
          }
        }
      }
    }
    
    if (missingMonths.length > 0) {
      const monthList = normalizedMonths.map(m => 
        m.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', month: 'short', year: 'numeric' })
      ).join(', ');
      
      const actionMsg = allowProvisional
        ? 'Please enter at least one index value for the missing month(s) before creating the bill. Provisional Indices mode is enabled, so partial data is allowed.'
        : 'Please wait for all indices to be finalized, or enable "Allow Provisional Indices" in Admin Settings.';
      
      return {
        available: false,
        message: `Cannot create bill with measurement date in ${measurementDate.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', month: 'long', year: 'numeric' })}. The PVC calculation requires a three-month average (${monthList}), but the following months have issues: ${missingMonths.join('; ')}. ${actionMsg}`,
        missingMonths,
        isProvisional: hasAnyProvisional
      };
    }
    
    return {
      available: true,
      message: hasAnyProvisional 
        ? 'Indices available (some are provisional — bill will be marked accordingly)' 
        : 'All final indices are available for the calculation period',
      isProvisional: hasAnyProvisional
    };
  } catch (error) {
    console.error('Error checking final indices availability:', error);
    return {
      available: false,
      message: `Error checking index availability: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Get detailed indices status for a bill
 */
export async function getBillIndicesStatus(
  quarter: string,
  baseMonth: Date
): Promise<{
  isProvisional: boolean;
  provisionalIndices: string[];
  finalIndices: string[];
  details: string;
}> {
  try {
    const months = getQuarterMonthsFromQuarter(quarter, baseMonth);
    
    if (months.length === 0) {
      return {
        isProvisional: false,
        provisionalIndices: [],
        finalIndices: [],
        details: 'No index data available'
      };
    }
    
    // Get all index values with their names
    const indexValues = await prisma.monthlyIndexValue.findMany({
      where: {
        month: {
          in: months
        }
      },
      include: {
        priceIndex: {
          select: {
            name: true
          }
        }
      }
    });
    
    const flaggedProvisional = indexValues
      .filter(iv => iv.isProvisional)
      .map(iv => iv.priceIndex.name);

    const finalIndices = indexValues
      .filter(iv => !iv.isProvisional)
      .map(iv => iv.priceIndex.name);

    // A month that is MISSING an index (its value gets borrowed from a nearby month at
    // calc time) is just as provisional as one flagged provisional — but the old check
    // only saw flagged values, so bills with a not-yet-published month showed as "Final".
    // Detect any core index that is present in some quarter month but absent in another.
    const citySpecific = / - (Delhi|Mumbai|Chennai|Kolkata)$/;
    const idToName = new Map<string, string>();
    const expected = new Set<string>();
    const presentByMonth = new Map<string, Set<string>>();
    for (const iv of indexValues) {
      if (citySpecific.test(iv.priceIndex.name)) continue; // core indices only
      idToName.set(iv.priceIndexId, iv.priceIndex.name);
      expected.add(iv.priceIndexId);
      const mk = new Date(iv.month).toISOString().slice(0, 7);
      if (!presentByMonth.has(mk)) presentByMonth.set(mk, new Set());
      presentByMonth.get(mk)!.add(iv.priceIndexId);
    }
    const borrowedIndices = new Set<string>();
    for (const m of months) {
      const mk = new Date(m).toISOString().slice(0, 7);
      const present = presentByMonth.get(mk) || new Set<string>();
      for (const id of expected) {
        if (!present.has(id)) borrowedIndices.add(idToName.get(id)!);
      }
    }

    const provisionalIndices = Array.from(new Set([...flaggedProvisional, ...borrowedIndices]));
    const isProvisional = provisionalIndices.length > 0;

    let details = '';
    if (isProvisional) {
      const parts: string[] = [];
      if (flaggedProvisional.length) parts.push(`provisional: ${Array.from(new Set(flaggedProvisional)).join(', ')}`);
      if (borrowedIndices.size) parts.push(`not yet published (borrowed): ${Array.from(borrowedIndices).join(', ')}`);
      details = `Provisional — ${parts.join('; ')}`;
    } else {
      details = 'All indices are final';
    }

    return {
      isProvisional,
      provisionalIndices,
      finalIndices: Array.from(new Set(finalIndices)),
      details
    };
  } catch (error) {
    console.error('Error getting index status:', error);
    return {
      isProvisional: false,
      provisionalIndices: [],
      finalIndices: [],
      details: 'Error retrieving index status'
    };
  }
}
