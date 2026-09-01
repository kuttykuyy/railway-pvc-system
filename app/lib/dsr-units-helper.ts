/**
 * DSR Units Helper — Dynamically loads and caches all valid units from DSR data.
 * This ensures the bill parser supports all units defined in the DSR without hardcoding.
 * Includes railway-specific units not found in standard DSR.
 */

import dsrData from '@/data/dsr-2023.json';

// Railway-specific units not typically in DSR but appear in railway bills
const RAILWAY_SPECIFIC_UNITS = [
  'PerTrack',
  'PerTrackMetre',
  'of', // for miscellaneous items
];

let cachedUnits: Set<string> | null = null;
let cachedUnitRegex: RegExp | null = null;

/**
 * Get all unique units from DSR data + railway-specific units, cached for performance.
 */
function getDSRUnits(): Set<string> {
  if (cachedUnits !== null) return cachedUnits;

  const units = new Set<string>();
  
  // Add DSR units
  if (Array.isArray(dsrData.items)) {
    for (const item of dsrData.items) {
      // Item has a unit field "u"
      if (item.u && typeof item.u === 'string' && item.u.trim()) {
        units.add(item.u.trim());
      }
    }
  }

  // Add railway-specific units
  for (const unit of RAILWAY_SPECIFIC_UNITS) {
    units.add(unit);
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
 * Check if a line might contain a unit (DSR-known or potential unit-like word).
 * More lenient than containsDSRUnit to catch railway-specific units.
 */
export function mightContainUnit(text: string): boolean {
  // First check: Does it match a known DSR unit?
  if (containsDSRUnit(text)) return true;

  // Second check: Does it look like it might be a unit?
  // Pattern: Line with a capitalized word that could be a unit (e.g., "PerTrack", "PerTrackMetre")
  // Exclude common non-unit words
  const potentialUnitPattern = /\b([A-Z][a-zA-Z]+(?:[A-Z][a-zA-Z]+)*)\b/;
  const match = text.match(potentialUnitPattern);
  
  if (match && match[1].length > 1) {
    const candidate = match[1];
    // Exclude common non-unit words
    const excludeWords = /^(Total|Qty|Rate|Amount|Sr|No|Page|Description|Schedule|Group|Chapter|Now|To|Pay|Remarks|Less|Add|Further|Item|Block|Section)$/i;
    if (!excludeWords.test(candidate)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a line might contain a unit (DSR-known or potential unit-like word).
 * More lenient than containsDSRUnit to catch railway-specific units.
 */
export function mightContainUnit(text: string): boolean {
  // First check: Does it match a known DSR unit?
  if (containsDSRUnit(text)) return true;

  // Second check: Does it look like it might be a unit?
  // Pattern: Line with a capitalized word that could be a unit (e.g., "PerTrack", "PerTrackMetre")
  // Exclude common non-unit words
  const potentialUnitPattern = /\b([A-Z][a-zA-Z]+(?:[A-Z][a-zA-Z]+)*)\b/;
  const match = text.match(potentialUnitPattern);
  
  if (match && match[1].length > 1) {
    const candidate = match[1];
    // Exclude common non-unit words
    const excludeWords = /^(Total|Qty|Rate|Amount|Sr|No|Page|Description|Schedule|Group|Chapter|Now|To|Pay|Remarks|Less|Add|Further|Item|Block|Section)$/i;
    if (!excludeWords.test(candidate)) {
      return true;
    }
  }

  return false;
}

/**
 * Extract the first DSR unit found in a string.
 */
export function extractDSRUnit(text: string): string | null {
  const match = text.match(getDSRUnitRegex());
  return match ? match[1] : null;
}

/**
 * Fallback unit extraction: Try to infer unit from context when DSR regex doesn't match.
 * Looks for common unit-like patterns: single words surrounded by numbers/rates.
 * This helps catch railway-specific units like "PerTrack", "PerTrackMetre", "of" that might be malformed or not in our list.
 */
export function fallbackExtractUnit(text: string): string | null {
  // First try DSR units (most reliable)
  const dsr = extractDSRUnit(text);
  if (dsr) return dsr;

  // Fallback: Look for words that appear between numbers and could be units
  // Pattern: number ... word ... number (where word looks like a unit label)
  // Match: 1078074.00 PerTrack 1000000 -> extract "PerTrack"
  const fallbackPattern = /\d+[.,]\d*\s+([A-Za-z][A-Za-z0-9\s]*?)(?=\s*\d+[.,]?\d*|$)/;
  const match = text.match(fallbackPattern);
  
  if (match && match[1]) {
    const candidate = match[1].trim();
    // Filter out common non-unit words
    const nonUnitWords = ['and', 'or', 'the', 'a', 'an', 'for', 'to', 'in', 'on', 'at', 'by', 'as', 'is', 'of', 'now', 'pay'];
    if (!nonUnitWords.includes(candidate.toLowerCase()) && candidate.length <= 30) {
      return candidate;
    }
  }

  // Last fallback: Look for any capitalized word or abbreviation that might be a unit
  // Pattern: "1078074.00 PERTRACK 1000000" or "PerTrack" standalone
  const capitalizedPattern = /\b([A-Z][a-zA-Z]+(?:[A-Z][a-zA-Z]+)*)\b/;
  const lines = text.split('\n');
  for (const line of lines) {
    // Only consider lines that have both numbers and a potential unit
    if (/\d/.test(line)) {
      const capMatch = line.match(capitalizedPattern);
      if (capMatch && capMatch[1].length > 1 && capMatch[1].length <= 30) {
        const candidate = capMatch[1];
        // Additional checks to ensure it's unit-like
        if (!/^(Total|Qty|Rate|Amount|Sr|No|Page|Description|Schedule|Group|Chapter)$/i.test(candidate)) {
          return candidate;
        }
      }
    }
  }

  return null;
}
