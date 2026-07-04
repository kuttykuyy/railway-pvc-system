/**
 * PVC Shortfall Auditor.
 *
 * Compares the GCC 46A entitlement the app computed for a bill (its
 * PvcCalculation) against the PVC figures Railway actually paid/certified
 * (a ShortfallAudit record entered by the contractor), and quantifies the
 * recoverable shortfall — component-wise where Railway's breakdown is known,
 * otherwise at the total level.
 */

export interface EntitlementComponents {
  labour: number;
  plantMachinery: number;
  fuelPower: number;
  cement: number;
  steel: number;
  otherMaterials: number;
  explosives: number;
  total: number;
}

export interface ShortfallRow {
  key: keyof Omit<EntitlementComponents, 'total'>;
  label: string;
  railwayField: string;
  entitlement: number;
  railwayPaid: number | null;
  shortfall: number | null;
}

export type ShortfallDirection = 'recoverable' | 'over_settled' | 'matched';

export interface ShortfallResult {
  hasRailwayData: boolean;
  hasComponentBreakdown: boolean;
  entitlementTotal: number;
  railwayTotal: number;
  shortfallTotal: number;
  recoverable: number;
  overpaid: number;
  shortfallPct: number;
  /** Sign of the entitlement: PVC positive = Railway pays contractor; negative = deduction/recovery from contractor. */
  entitlementIsRecoveryFromContractor: boolean;
  /** recoverable = Railway settled less than due (contractor is owed); over_settled = Railway settled more (recovery risk). */
  direction: ShortfallDirection;
  rows: ShortfallRow[];
}

const COMPONENTS: { key: ShortfallRow['key']; label: string; railwayField: string }[] = [
  { key: 'labour', label: 'Labour', railwayField: 'railwayLabour' },
  { key: 'plantMachinery', label: 'Plant & Machinery', railwayField: 'railwayPlantMachinery' },
  { key: 'fuelPower', label: 'Fuel / Power', railwayField: 'railwayFuelPower' },
  { key: 'cement', label: 'Cement', railwayField: 'railwayCement' },
  { key: 'steel', label: 'Steel', railwayField: 'railwaySteel' },
  { key: 'otherMaterials', label: 'Other Materials', railwayField: 'railwayOtherMaterials' },
  { key: 'explosives', label: 'Explosives', railwayField: 'railwayExplosives' },
];

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** GCC-correct entitlement per component, rolling dedicated cement/steel into their component. */
export function computeEntitlementComponents(pvc: any): EntitlementComponents {
  const cement = num(pvc?.cementPvc) + num(pvc?.dedicatedCementPvc);
  const steel = num(pvc?.steelPvc)
    + num(pvc?.dedicatedSteelTmtBarsPvc)
    + num(pvc?.dedicatedSteelAngleChannelPvc)
    + num(pvc?.dedicatedSteelPlatesPvc)
    + num(pvc?.dedicatedSteelOtherSectionsPvc);
  return {
    labour: num(pvc?.labourPvc),
    plantMachinery: num(pvc?.plantMachineryPvc),
    fuelPower: num(pvc?.fuelPowerPvc),
    cement,
    steel,
    otherMaterials: num(pvc?.otherMaterialsPvc),
    explosives: num(pvc?.explosivesPvc),
    // totalPvc is authoritative (it accounts for extension caps/rounding); fall back
    // to the component sum only if it is missing.
    total: pvc?.totalPvc != null
      ? num(pvc.totalPvc)
      : num(pvc?.labourPvc) + num(pvc?.plantMachineryPvc) + num(pvc?.fuelPowerPvc)
        + cement + steel + num(pvc?.otherMaterialsPvc) + num(pvc?.explosivesPvc),
  };
}

export function computeShortfall(pvc: any, audit: any | null): ShortfallResult {
  const ent = computeEntitlementComponents(pvc);

  const railwayComponentSum = COMPONENTS.reduce(
    (sum, c) => sum + (audit?.[c.railwayField] != null ? num(audit[c.railwayField]) : 0), 0);
  const hasComponentBreakdown = !!audit && COMPONENTS.some(c => audit[c.railwayField] != null);
  const enteredTotal = num(audit?.railwayTotal);
  const railwayTotal = enteredTotal !== 0 ? enteredTotal : railwayComponentSum;
  const hasRailwayData = !!audit && (enteredTotal !== 0 || hasComponentBreakdown);

  const shortfallTotal = Math.round((ent.total - railwayTotal) * 100) / 100;

  const rows: ShortfallRow[] = COMPONENTS.map(c => {
    const railwayPaid = audit && audit[c.railwayField] != null ? num(audit[c.railwayField]) : null;
    return {
      key: c.key,
      label: c.label,
      railwayField: c.railwayField,
      entitlement: ent[c.key],
      railwayPaid,
      shortfall: railwayPaid != null ? Math.round((ent[c.key] - railwayPaid) * 100) / 100 : null,
    };
  });

  const TOL = 0.005;
  const direction: ShortfallDirection =
    shortfallTotal > TOL ? 'recoverable' : shortfallTotal < -TOL ? 'over_settled' : 'matched';

  return {
    hasRailwayData,
    hasComponentBreakdown,
    entitlementTotal: ent.total,
    railwayTotal,
    shortfallTotal,
    recoverable: Math.max(0, shortfallTotal),
    overpaid: Math.max(0, -shortfallTotal),
    // % of the entitlement magnitude, so a negative-PVC bill does not flip the sign.
    shortfallPct: ent.total !== 0 ? Math.round((shortfallTotal / Math.abs(ent.total)) * 10000) / 100 : 0,
    entitlementIsRecoveryFromContractor: ent.total < 0,
    direction,
    rows,
  };
}
