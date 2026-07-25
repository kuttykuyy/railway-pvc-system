/**
 * Railway Zone to Steel City Mapping
 *
 * JPC (Joint Plant Committee) publishes steel prices for 4 metro cities:
 * Delhi, Mumbai, Chennai, Kolkata.
 *
 * SOURCE OF TRUTH — GCC-2022 Clause 46A.9(2) ("Relevant city for referring JPC rates
 * of steel items (SQ/SB) in different Zonal Railways"):
 *
 *   Delhi   — Northern, North Central, North Eastern, North Western
 *   Kolkata — Eastern, East Central, East Coast, Northeast Frontier,
 *             South Eastern, South East Central
 *   Mumbai  — Central, Western, West Central
 *   Chennai — Southern, South Central, South Western
 *
 * This assignment is PRESCRIBED BY CIRCULAR and is NOT geographic — do not infer it
 * from a zone's headquarters. Counterexamples: South East Central (HQ Bilaspur) uses
 * Kolkata; North Eastern (HQ Gorakhpur) uses Delhi; South Western (HQ Hubballi) uses
 * Chennai. Clause 46A.9 has not been amended by any ACS to date (ACS-1..11).
 *
 * Note: the 46A.9(2) table covers the 16 zones above. South Coast Railway (SCoR) was
 * created after GCC-2022 and has no assigned city in any circular found; Konkan (KRCL)
 * and Metro Kolkata are likewise not listed — their values here are fallbacks, not
 * circular-backed.
 *
 * Fuel is NOT zone-specific: GCC 46A.7 uses the average of PPAC diesel prices across
 * Delhi, Kolkata, Mumbai & Chennai for every zone.
 *
 * The zone value stored in bills is the zone code (e.g., 'SR', 'CR').
 */

export interface RailwayZoneInfo {
  code: string;
  name: string;
  headquarters: string;
  steelCity: string; // JPC steel city for price lookup
}

// Complete mapping of all 18 Indian Railway zones to steel cities
export const RAILWAY_ZONE_STEEL_CITY_MAP: Record<string, RailwayZoneInfo> = {
  'SR': {
    code: 'SR',
    name: 'Southern Railway',
    headquarters: 'Chennai',
    steelCity: 'Chennai',
  },
  'CR': {
    code: 'CR',
    name: 'Central Railway',
    headquarters: 'Mumbai',
    steelCity: 'Mumbai',
  },
  'WR': {
    code: 'WR',
    name: 'Western Railway',
    headquarters: 'Mumbai',
    steelCity: 'Mumbai',
  },
  'ER': {
    code: 'ER',
    name: 'Eastern Railway',
    headquarters: 'Kolkata',
    steelCity: 'Kolkata',
  },
  'NR': {
    code: 'NR',
    name: 'Northern Railway',
    headquarters: 'Delhi',
    steelCity: 'Delhi',
  },
  'NER': {
    code: 'NER',
    name: 'North Eastern Railway',
    headquarters: 'Gorakhpur',
    // GCC-2022 Clause 46A.9(2) assigns Delhi to North Eastern Railway. The mapping is
    // prescribed by circular, NOT geographic — don't infer it from the HQ city, and
    // don't confuse NER with NFR (Northeast Frontier), which is Kolkata.
    steelCity: 'Delhi',
  },
  'NFR': {
    code: 'NFR',
    name: 'Northeast Frontier Railway',
    headquarters: 'Guwahati',
    steelCity: 'Kolkata',
  },
  'SCR': {
    code: 'SCR',
    name: 'South Central Railway',
    headquarters: 'Secunderabad',
    steelCity: 'Chennai',
  },
  'SER': {
    code: 'SER',
    name: 'South Eastern Railway',
    headquarters: 'Kolkata',
    steelCity: 'Kolkata',
  },
  'SECR': {
    code: 'SECR',
    name: 'South East Central Railway',
    headquarters: 'Bilaspur',
    steelCity: 'Kolkata',
  },
  'SWR': {
    code: 'SWR',
    name: 'South Western Railway',
    headquarters: 'Hubballi',
    // GCC-2022 Clause 46A.9(2) assigns Chennai to South Western Railway (confirmed by
    // SWR letter SWR/W.496 dated 23.01.2026). Prescribed by circular, not geographic —
    // SWR's HQ is Hubballi.
    steelCity: 'Chennai',
  },
  'WCR': {
    code: 'WCR',
    name: 'West Central Railway',
    headquarters: 'Jabalpur',
    steelCity: 'Mumbai',
  },
  'ECR': {
    code: 'ECR',
    name: 'East Central Railway',
    headquarters: 'Hajipur',
    steelCity: 'Kolkata',
  },
  'ECoR': {
    code: 'ECoR',
    name: 'East Coast Railway',
    headquarters: 'Bhubaneswar',
    steelCity: 'Kolkata',
  },
  'NCR': {
    code: 'NCR',
    name: 'North Central Railway',
    headquarters: 'Prayagraj',
    steelCity: 'Delhi',
  },
  'NWR': {
    code: 'NWR',
    name: 'North Western Railway',
    headquarters: 'Jaipur',
    steelCity: 'Delhi',
  },
  'KRCL': {
    code: 'KRCL',
    name: 'Konkan Railway',
    headquarters: 'Navi Mumbai',
    steelCity: 'Mumbai',
  },
  'Metro': {
    code: 'Metro',
    name: 'Metro Railway (Kolkata)',
    headquarters: 'Kolkata',
    steelCity: 'Kolkata',
  },
};

// Get all railway zones as options for dropdowns
export function getRailwayZoneOptions(): { value: string; label: string; steelCity: string }[] {
  return Object.values(RAILWAY_ZONE_STEEL_CITY_MAP).map(zone => ({
    value: zone.code,
    label: `${zone.code} - ${zone.name}`,
    steelCity: zone.steelCity,
  }));
}

/**
 * Get the steel city for a given railway zone code.
 * Falls back to 'Chennai' if zone is not found (legacy behavior).
 * Also handles legacy city-name values (Chennai, Mumbai, Delhi, Kolkata) from old bills.
 */
export function getSteelCityForZone(zoneCode: string | null | undefined): string {
  if (!zoneCode) return 'Chennai';
  
  // Check if it's already a city name (legacy bills stored city names)
  const validCities = ['Chennai', 'Mumbai', 'Delhi', 'Kolkata'];
  if (validCities.includes(zoneCode)) return zoneCode;
  
  // Look up by zone code
  const zone = RAILWAY_ZONE_STEEL_CITY_MAP[zoneCode];
  return zone?.steelCity || 'Chennai';
}

/**
 * Get steel index names with city suffix for a given railway zone.
 * E.g., for zone 'NR' (Delhi): ['Steel TMT Bars - Delhi', 'Steel Angle/Channel - Delhi', ...]
 * For 'Chennai' city: returns default names without suffix (legacy behavior).
 */
export function getSteelIndexNamesForZone(zoneCode: string | null | undefined): string[] {
  const city = getSteelCityForZone(zoneCode);
  
  const baseNames = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
  
  // Chennai uses default index names (no suffix) for backward compatibility
  if (city === 'Chennai') {
    return baseNames;
  }
  
  // Other cities use city-suffixed names
  return baseNames.map(name => `${name} - ${city}`);
}

/**
 * Get the MPNG Fuel index name for a given railway zone and fuel price type.
 * - fuelPriceType === 'zone_city': returns city-specific index (e.g., 'MPNG Fuel - Delhi')
 * - fuelPriceType === 'four_city_avg' or default: returns 'MPNG Fuel' (4-city average)
 * For Chennai zones with zone_city: returns default 'MPNG Fuel - Chennai' (NOT the unsuffixed name,
 * since unsuffixed 'MPNG Fuel' is the 4-city average, unlike steel where unsuffixed = Chennai)
 */
export function getFuelIndexNameForBill(
  zoneCode: string | null | undefined,
  fuelPriceType: string | null | undefined
): string {
  if (!fuelPriceType || fuelPriceType === 'four_city_avg') {
    return 'MPNG Fuel';
  }
  
  // zone_city: use zone-mapped city
  const city = getSteelCityForZone(zoneCode);
  return `MPNG Fuel - ${city}`;
}

/**
 * Get all fuel index names needed for a bill's allIndices array.
 * Returns an array with a single fuel index name.
 */
export function getFuelIndexNamesForBill(
  zoneCode: string | null | undefined,
  fuelPriceType: string | null | undefined
): string[] {
  return [getFuelIndexNameForBill(zoneCode, fuelPriceType)];
}

/**
 * Get the zone name for a given zone code.
 * Also handles legacy city-name values.
 */
export function getZoneDisplayName(zoneCode: string | null | undefined): string {
  if (!zoneCode) return 'N/A';
  
  const zone = RAILWAY_ZONE_STEEL_CITY_MAP[zoneCode];
  if (zone) return `${zone.code} - ${zone.name}`;
  
  // Legacy city name fallback
  return zoneCode;
}
