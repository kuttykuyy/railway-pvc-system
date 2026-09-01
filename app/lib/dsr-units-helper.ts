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

function getDSRUnits(): Set<string> {
  if (cachedUnits !== null) return cachedUnits;

  const units = new Set<string>();

  if (Array.isArray(dsrData.items)) {
    for (const item of dsrData.items) {
      if (item.u && typeof item.u === 'string' && item.u.trim()) {
        units.add(item.u.trim());
      }
    }
  }

  for (const unit of RAILWAY_SPECIFIC_UNITS) {
    units.add(unit);
  }

  cachedUnits = units;
  return cachedUnits;
}

export function getDSRUnitRegex(): RegExp {
  if (cachedUnitRegex !== null) return cachedUnitRegex;

  const units = getDSRUnits();
  if (units.size === 0) {
    cachedUnitRegex = /(?!)/;
    return cachedUnitRegex;
  }

  const escapedUnits = Array.from(units)
    .map(u => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length);

  cachedUnitRegex = new RegExp(`\\b(${escapedUnits.join('|')})\\b`, 'i');
  return cachedUnitRegex;
}

export function containsDSRUnit(text: string): boolean {
  return getDSRUnitRegex().test(text);
}

export function mightContainUnit(text: string): boolean {
  if (containsDSRUnit(text)) return true;

  const potentialUnitPattern = /\b([A-Z][a-zA-Z]+(?:[A-Z][a-zA-Z]+)*)\b/;
  const match = text.match(potentialUnitPattern);

  if (match && match[1].length > 1) {
    const candidate = match[1];
    const excludeWords = /^(Total|Qty|Rate|Amount|Sr|No|Page|Description|Schedule|Group|Chapter|Now|To|Pay|Remarks|Less|Add|Further|Item|Block|Section)$/i;
    if (!excludeWords.test(candidate)) {
      return true;
    }
  }

  return false;
}

export function extractDSRUnit(text: string): string | null {
  const match = text.match(getDSRUnitRegex());
  return match ? match[1] : null;
}

export function fallbackExtractUnit(text: string): string | null {
  const dsr = extractDSRUnit(text);
  if (dsr) return dsr;

  const fallbackPattern = /\d+[.,]\d*\s+([A-Za-z][A-Za-z0-9\s]*?)(?=\s*\d+[.,]?\d*|$)/;
  const match = text.match(fallbackPattern);

  if (match && match[1]) {
    const candidate = match[1].trim();
    const nonUnitWords = ['and', 'or', 'the', 'a', 'an', 'for', 'to', 'in', 'on', 'at', 'by', 'as', 'is', 'of', 'now', 'pay'];
    if (!nonUnitWords.includes(candidate.toLowerCase()) && candidate.length <= 30) {
      return candidate;
    }
  }

  const capitalizedPattern = /\b([A-Z][a-zA-Z]+(?:[A-Z][a-zA-Z]+)*)\b/;
  const lines = text.split('\n');
  for (const line of lines) {
    if (/\d/.test(line)) {
      const capMatch = line.match(capitalizedPattern);
      if (capMatch && capMatch[1].length > 1 && capMatch[1].length <= 30) {
        const candidate = capMatch[1];
        if (!/^(Total|Qty|Rate|Amount|Sr|No|Page|Description|Schedule|Group|Chapter)$/i.test(candidate)) {
          return candidate;
        }
      }
    }
  }

  return null;
}

