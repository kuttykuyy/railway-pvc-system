/**
 * DSR Units Helper — Dynamically loads and caches all valid units from DSR data.
 * This ensures the bill parser supports all units defined in the DSR without hardcoding.
 */

import dsrData from '@/data/dsr-2023.json';

let cachedUnits: Set<string> | null = null;
let cachedUnitRegex: RegExp | null = null;

/**
 * Get all unique units from DSR data, cached for performance.
 */
function getDSRUnits(): Set<string> {
  if (cachedUnits !== null) return cachedUnits;

  const units = new Set<string>();
  
  if (Array.isArray(dsrData.items)) {
    for (const item of dsrData.items) {
      // Item has a unit field "u"
      if (item.u && typeof item.u === 'string' && item.u.trim()) {
        units.add(item.u.trim());
      }
    }
  }

  cachedUnits = units;
  return cachedUnits;
}

/**
 * Get a regex pattern matching any DSR unit (word boundary).
 * Caches the regex for performance.
 */
export function getDSRUnitRegex(): RegExp {
  if (cachedUnitRegex !== null) return cachedUnitRegex;

  const units = getDSRUnits();
  if (units.size === 0) {
    // Fallback if no units found
    cachedUnitRegex = /(?!)/; // Never matches
    return cachedUnitRegex;
  }

  // Escape each unit and join with |
  const escapedUnits = Array.from(units)
    .map(u => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length); // Longer units first to avoid partial matches

  cachedUnitRegex = new RegExp(`\\b(${escapedUnits.join('|')})\\b`, 'i');
  return cachedUnitRegex;
}

/**
 * Check if a string contains a valid DSR unit.
 */
export function containsDSRUnit(text: string): boolean {
  return getDSRUnitRegex().test(text);
}

/**
 * Extract the first DSR unit found in a string.
 */
export function extractDSRUnit(text: string): string | null {
  const match = text.match(getDSRUnitRegex());
  return match ? match[1] : null;
}
