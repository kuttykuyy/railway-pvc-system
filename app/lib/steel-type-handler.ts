import { logger } from './logger';

/**
 * Steel Type Handler - Centralized steel type extraction and validation
 * 
 * This module provides a single source of truth for steel type handling across the app.
 */

import { getClassificationComponents } from '@/lib/pvc-calculations';

export type SteelType = 'TMT' | 'ANGLE_CHANNEL' | 'PLATES' | 'OTHER_SECTIONS';

export const STEEL_TYPE_INDEX_MAP: Record<SteelType, string> = {
  'TMT': 'Steel TMT Bars',
  'ANGLE_CHANNEL': 'Steel Angle/Channel',
  'PLATES': 'Steel Plates',
  'OTHER_SECTIONS': 'Steel Other Sections'
};

/**
 * Extract steel types from classification entries
 * Returns unique steel types from all entries that have steel components
 */
export async function extractSteelTypesFromEntries(
  classificationEntries: Array<{
    subClassificationId?: string;
    classificationId?: string;
    amount: number;
    steelTypes?: string[];
    /** Per-item categories, when one entry merges reinforcement with structural steel. */
    itemRows?: Array<{ steelTypes?: string[] | null }> | null;
  }>
): Promise<string[]> {
  logger.log('\n🔧 [STEEL HANDLER] Extracting steel types from classification entries');
  logger.log(`   Total entries: ${classificationEntries.length}`);
  
  const collectedSteelTypes = new Set<string>();

  for (const entry of classificationEntries) {
    if (entry.amount <= 0) continue;

    // Does this entry carry a steel component at all? Read it through the shared cache
    // rather than one findUnique per entry -- on Vercel the pool is a single connection,
    // so an extra query per entry is an extra wait in a queue.
    const components = await getClassificationComponents(entry.subClassificationId, entry.classificationId);
    if ((components?.steel ?? 0) <= 0) continue;

    // An entry can hold several items of different steel kinds with no category set on
    // the entry itself. Those rows are then the only record of what the steel was, so
    // read them too -- otherwise the bill reports "no category" and gets priced on the
    // average of all four when it did not have to be.
    for (const row of entry.itemRows || []) {
      for (const type of row?.steelTypes || []) collectedSteelTypes.add(type);
    }

    // Only collect steel types from entries with steel components
    if (entry.steelTypes && Array.isArray(entry.steelTypes)) {
      logger.log(`   Entry with steel (${entry.amount}): ${entry.steelTypes.join(', ')}`);
      entry.steelTypes.forEach(type => collectedSteelTypes.add(type));
    }
  }

  const result = Array.from(collectedSteelTypes);
  logger.log(`   ✅ Extracted steel types: ${result.length > 0 ? result.join(', ') : 'None (will use average of all types)'}`);
  
  return result;
}

/**
 * Validate steel types array
 */
export function validateSteelTypes(steelTypes: unknown): steelTypes is string[] {
  if (!Array.isArray(steelTypes)) return false;
  return steelTypes.every(type => 
    typeof type === 'string' && type in STEEL_TYPE_INDEX_MAP
  );
}

/**
 * Get index names for steel types
 */
export function getSteelIndexNames(steelTypes: string[]): string[] {
  return steelTypes.map(type => STEEL_TYPE_INDEX_MAP[type as SteelType]).filter(Boolean);
}

