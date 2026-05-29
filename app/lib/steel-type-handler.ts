
/**
 * Steel Type Handler - Centralized steel type extraction and validation
 * 
 * This module provides a single source of truth for steel type handling across the app.
 */

import { prisma } from '@/lib/db';

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
  }>
): Promise<string[]> {
  console.log('\n🔧 [STEEL HANDLER] Extracting steel types from classification entries');
  console.log(`   Total entries: ${classificationEntries.length}`);
  
  const collectedSteelTypes = new Set<string>();

  for (const entry of classificationEntries) {
    if (entry.amount <= 0) continue;

    // Get classification components to check if entry has steel
    let hasSteelComponent = false;
    
    if (entry.subClassificationId) {
      const subClass = await prisma.subClassification.findUnique({
        where: { id: entry.subClassificationId },
        select: { steel: true }
      });
      hasSteelComponent = (subClass?.steel ?? 0) > 0;
    } else if (entry.classificationId) {
      const classification = await prisma.classification.findUnique({
        where: { id: entry.classificationId },
        select: { steel: true }
      });
      hasSteelComponent = (classification?.steel ?? 0) > 0;
    }

    // Only collect steel types from entries with steel components
    if (hasSteelComponent && entry.steelTypes && Array.isArray(entry.steelTypes)) {
      console.log(`   Entry with steel (${entry.amount}): ${entry.steelTypes.join(', ')}`);
      entry.steelTypes.forEach(type => collectedSteelTypes.add(type));
    }
  }

  const result = Array.from(collectedSteelTypes);
  console.log(`   ✅ Extracted steel types: ${result.length > 0 ? result.join(', ') : 'None (will use average of all types)'}`);
  
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
