
// Types for the Railway PVC system

export interface Contract {
  id: string;
  agreementNo: string;
  loaNo?: string | null;
  contractorName: string;
  workDescription: string;
  workClassification?: string | null;
  dateOfOpening: Date;
  baseMonth: Date;
  
  // GCC 46A.1 - PVC Applicability
  tenderAdvertisedValue?: number | null;  // Original tender/estimated amount
  contractValue?: number | null;          // Final agreed amount after tender evaluation
  completionPeriodMonths?: number | null;
  pvcApplicable: boolean;
  pvcEligibilityNote?: string | null;
  
  // Materials supplied by Railway (GCC 46A.1 exclusions)
  hasRailwaySuppliedMaterials: boolean;
  railwaySuppliedMaterialsNote?: string | null;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface PriceIndex {
  id: string;
  name: string;
  baseValue: number;
  description?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MonthlyIndexValue {
  id: string;
  priceIndexId: string;
  month: Date;
  value: number;
  createdAt: Date;
  updatedAt: Date;
  priceIndex?: PriceIndex;
}

export interface SubClassification {
  code: string;
  name: string;
  amount: number;
}

export interface NonScheduleItem {
  description: string;
  amount: number;
}

export interface Bill {
  id: string;
  contractId: string;
  billNo: string;
  billAmount: number;
  dateOfMeasurement: Date;
  quarter: string;
  cementAmount?: number; // Amount allocated specifically for cement work
  
  // Steel components - four separate fields
  steelTmtBarsAmount?: number;       // Amount allocated for TMT Bars
  steelAngleChannelAmount?: number;  // Amount allocated for Angle/Channel
  steelPlatesAmount?: number;        // Amount allocated for Plates
  steelOtherSectionsAmount?: number; // Amount allocated for Other Sections
  
  // Legacy fields for backward compatibility
  steelAmount?: number;  // Deprecated: Use specific steel fields above
  selectedSteelComponent?: string; // Deprecated
  
  subClassifications?: SubClassification[]; // Array of sub-classifications with amounts
  nonScheduleItems?: NonScheduleItem[]; // Array of non-schedule items with amounts (deducted from bill)
  createdAt: Date;
  updatedAt: Date;
  contract?: Contract;
}

export interface PvcCalculation {
  id: string;
  contractId: string;
  billId: string;
  labourPvc: number;
  plantMachineryPvc: number;
  fuelPowerPvc: number;
  otherMaterialsPvc: number;
  cementPvc: number;
  steelPvc: number;
  explosivesPvc: number;
  dedicatedCementPvc: number; // PVC from dedicated cement amount (85%)
  
  // Dedicated steel PVC amounts - four separate fields for each steel type
  dedicatedSteelTmtBarsPvc: number;      // PVC from TMT Bars amount (85%)
  dedicatedSteelAngleChannelPvc: number; // PVC from Angle/Channel amount (85%)
  dedicatedSteelPlatesPvc: number;       // PVC from Plates amount (85%)
  dedicatedSteelOtherSectionsPvc: number;// PVC from Other Sections amount (85%)
  
  // Legacy field for backward compatibility
  dedicatedSteelPvc: number;  // Deprecated: Use specific steel fields above
  
  totalPvc: number;
  previousPvcTotal: number;
  cumulativePvc: number;
  createdAt: Date;
  updatedAt: Date;
  contract?: Contract;
  bill?: Bill;
}

export interface PvcComponent {
  name: string;
  percentage: number;
  indices: string[];
}

// DEPRECATED: Old hardcoded classification data removed
// Classifications are now stored in the database using the ClassificationGroup and SubClassification models
// Use lib/classification-helper.ts to fetch classifications from the database

// Legacy component definitions for backward compatibility
export const PVC_COMPONENTS: Record<string, PvcComponent> = {
  labour: {
    name: 'Labour',
    percentage: 50,
    indices: ['Labour']
  },
  plantMachinery: {
    name: 'Plant Machinery & Spares',
    percentage: 15,
    indices: ['RBI Plant Machinery']
  },
  fuelPower: {
    name: 'Fuel & Lubricants', 
    percentage: 15,
    indices: ['MPNG Fuel']
  },
  otherMaterials: {
    name: 'Other Materials',
    percentage: 5, // Updated: Set to 5% as requested
    indices: ['RBI Other Materials']
  }
};

// Steel component options for dedicated steel calculations
export const STEEL_COMPONENT_OPTIONS = [
  { value: 'Steel Angle/Channel', label: 'Steel Angle/Channel', description: 'Joint Plant Committee rate for Angle/Channel' },
  { value: 'Steel Plates', label: 'Steel Plates', description: 'Joint Plant Committee rate for Steel Plates' },
  { value: 'Steel Other Sections', label: 'Steel Other Sections', description: 'Joint Plant Committee rate for Other Sections' }
];

// Base price indices with default values - Extended based on GCC-2022-ACS2
export const BASE_PRICE_INDICES = [
  // Core Labour Index
  { name: 'Labour', baseValue: 129.90, description: 'Consumer Price Index for Industrial Workers - All India (RBI Bulletin)' },
  
  // Plant Machinery & Spares
  { name: 'RBI Plant Machinery', baseValue: 83.90, description: 'Index for Manufacture of machinery for mining, quarrying and construction (RBI Bulletin)' },
  
  // Fuel & Lubricants
  { name: 'MPNG Fuel', baseValue: 93.06, description: 'Average official prices of Diesel (PPAC under Ministry of Petroleum & Natural Gas)' },
  
  // Materials
  { name: 'RBI Other Materials', baseValue: 154.00, description: 'Wholesale Price Index: All commodities (RBI Bulletin)' },
  { name: 'RBI Cement', baseValue: 137.40, description: 'Wholesale Price Index of sub-group Cement, Lime & Plaster (RBI Bulletin)' },
  { name: 'RBI Explosives', baseValue: 190.10, description: 'Monthly Wholesale Price Index for Explosives (DIPP, Ministry of Commerce & Industry)' },
  
  // Steel Components - Joint Plant Committee rates
  { name: 'Steel TMT Bars', baseValue: 70150.00, description: 'Joint Plant Committee rate for TMT Bars' },
  { name: 'Steel Angle/Channel', baseValue: 69740.00, description: 'Joint Plant Committee rate for Angle/Channel' },
  { name: 'Steel Plates', baseValue: 75540.00, description: 'Joint Plant Committee rate for Steel Plates' },
  { name: 'Steel Other Sections', baseValue: 71810.00, description: 'Joint Plant Committee rate for Other Sections' },
  { name: 'Steel Blooms', baseValue: 68500.00, description: 'IEEMA price index for Steel Blooms (150mmx150mm)' },
  
  // Electrification Components - IEEMA indices
  { name: 'Copper Wire Rods', baseValue: 875000.00, description: 'IEEMA price index for Copper wire rods' },
  { name: 'Zinc', baseValue: 290000.00, description: 'IEEMA price index for Zinc' },
  { name: 'Insulators', baseValue: 180.50, description: 'RBI wholesale price index for Insulators' }
];

export interface QuarterlyAverage {
  quarter: string;
  indexName: string;
  average: number;
  baseValue: number;
}
