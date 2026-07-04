export interface PvcIndicesData {
  base: { [key: string]: number };
  current: { [key: string]: number };
}

interface ClassificationComponents {
  fixed: number;
  labour: number;
  steel: number;
  cement: number;
  plantMachinery: number;
  fuel: number;
  otherMaterials: number;
  explosives: number;
}

const COMPONENT_INDEX_KEYS: Array<{ key: keyof ClassificationComponents; indexKey: string | null }> = [
  { key: 'fixed', indexKey: null },
  { key: 'labour', indexKey: 'Labour' },
  { key: 'cement', indexKey: 'RBI Cement' },
  { key: 'steel', indexKey: 'Steel' },
  { key: 'plantMachinery', indexKey: 'RBI Plant Machinery' },
  { key: 'fuel', indexKey: 'MPNG Fuel' },
  { key: 'otherMaterials', indexKey: 'RBI Other Materials' },
  { key: 'explosives', indexKey: 'RBI Explosives' },
];

const STEEL_INDEX_KEYS = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];

// Mirrors the per-component PVC formula used by ClassificationComparisonDialog so the
// automated comparison in bill mapping and the manual Compare dialog agree.
export function calculateTotalPvc(
  classification: ClassificationComponents,
  amount: number,
  indicesData: PvcIndicesData,
): number {
  let totalPvc = 0;
  for (const component of COMPONENT_INDEX_KEYS) {
    const percent = classification[component.key] || 0;
    if (percent <= 0 || !component.indexKey) continue;

    let baseIndex = 0;
    let currentIndex = 0;
    if (component.indexKey === 'Steel') {
      const validPairs = STEEL_INDEX_KEYS
        .map(key => ({ base: indicesData.base[key] || 0, current: indicesData.current[key] || 0 }))
        .filter(pair => pair.base > 0);
      if (validPairs.length > 0) {
        baseIndex = validPairs.reduce((sum, pair) => sum + pair.base, 0) / validPairs.length;
        currentIndex = validPairs.reduce((sum, pair) => sum + pair.current, 0) / validPairs.length;
      }
    } else {
      baseIndex = indicesData.base[component.indexKey] || 0;
      currentIndex = indicesData.current[component.indexKey] || 0;
    }

    baseIndex = Math.round(baseIndex * 100) / 100;
    currentIndex = Math.round(currentIndex * 100) / 100;
    if (baseIndex <= 0) continue;

    totalPvc += (amount * percent / 100) * ((currentIndex - baseIndex) / baseIndex);
  }
  return Math.round(totalPvc * 100) / 100;
}

export function formatPvcAmount(value: number): string {
  const prefix = value < 0 ? '-Rs ' : 'Rs ';
  return prefix + Math.abs(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Whether the automatic PVC comparison may switch an item from `currentSuffix` to
 * `candidateSuffix`. Classification must reflect the NATURE of the work, not the
 * highest payout. Each GCC 46A suffix denotes a distinct nature:
 *  - A = general work,
 *  - B = steel supply, C = cement supply,
 *  - D = fabrication/erection INCLUDING contractor-supplied steel,
 *  - E = fabrication/erection EXCLUDING steel (free-issue / railway-supplied).
 * None of these may be swapped for another just because it yields a better PVC —
 * in particular D and E differ by who supplies the steel, so a "Supplying &
 * fixing steel" item (contractor steel → D) must never become E for a bigger
 * payout. The comparison is therefore transparency-only: it may confirm the
 * current suffix but never move to a different one.
 */
export function pvcComparisonAllowsSuffix(currentSuffix: string, candidateSuffix: string): boolean {
  const current = String(currentSuffix || '').toUpperCase();
  const candidate = String(candidateSuffix || '').toUpperCase();
  return current === candidate;
}
