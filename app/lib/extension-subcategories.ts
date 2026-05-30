// Extension subcategories for GCC 17A extensions
export interface ExtensionSubcategory {
  id: string;
  code: string;
  name: string;
  description: string;
  displayOrder: number;
  isActive: boolean;
}

// GCC 2022 ACS2 - Clause 17A subcategories
// 17A = Extension without Liquidated Damages (no PVC restriction)
// 17B = Extension with Liquidated Damages (PVC indices capped at original completion date)
export const DEFAULT_17A_SUBCATEGORIES: Omit<ExtensionSubcategory, 'id'>[] = [
  {
    code: 'I',
    name: 'Delay in Handing Over Site',
    description: 'Extension due to delay in handing over the site or part thereof to the contractor by the Railway.',
    displayOrder: 1,
    isActive: true
  },
  {
    code: 'II',
    name: 'Delay in Supply of Drawings / Designs',
    description: 'Extension due to delay in supply of drawings, designs, or specifications by the Railway/Engineer-in-Charge.',
    displayOrder: 2,
    isActive: true
  },
  {
    code: 'III',
    name: 'Delay in Supply of Materials by Railway',
    description: 'Extension due to delay in supply of Railway-furnished materials, plant, or equipment required for the work.',
    displayOrder: 3,
    isActive: true
  },
  {
    code: 'IV',
    name: 'Modifications / Extra Items Ordered',
    description: 'Extension due to modifications in design or quantities, or additional/extra items ordered by the Engineer-in-Charge during execution.',
    displayOrder: 4,
    isActive: true
  },
  {
    code: 'V',
    name: 'Force Majeure',
    description: 'Extension due to Force Majeure conditions — war, hostilities, riots, civil commotion, epidemics, or acts of God beyond the control of either party.',
    displayOrder: 5,
    isActive: true
  },
  {
    code: 'VI',
    name: 'Abnormal Weather Conditions',
    description: 'Extension due to exceptionally adverse weather conditions (rainfall, flood, cyclone, etc.) that were unforeseeable at the time of tendering.',
    displayOrder: 6,
    isActive: true
  },
  {
    code: 'VII',
    name: 'Delay in Payment',
    description: 'Extension due to delay in payments by the Railway beyond the stipulated period causing hindrance to the contractor\'s progress.',
    displayOrder: 7,
    isActive: true
  },
  {
    code: 'VIII',
    name: 'Other Reasons Beyond Contractor\'s Control',
    description: 'Extension for any other reasons beyond the control of the contractor, duly accepted and certified by the competent authority.',
    displayOrder: 8,
    isActive: true
  },
];
