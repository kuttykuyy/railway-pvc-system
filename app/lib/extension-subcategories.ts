
// Extension subcategories for GCC 17A extensions
export interface ExtensionSubcategory {
  id: string;
  code: string;
  name: string;
  description: string;
  displayOrder: number;
  isActive: boolean;
}

// Default 17A subcategories
export const DEFAULT_17A_SUBCATEGORIES: Omit<ExtensionSubcategory, 'id'>[] = [
  {
    code: 'I',
    name: 'Subcategory I',
    description: 'Force majeure conditions beyond contractor control',
    displayOrder: 1,
    isActive: true
  },
  {
    code: 'II',
    name: 'Subcategory II',
    description: 'Delays due to exceptional weather conditions',
    displayOrder: 2,
    isActive: true
  },
  {
    code: 'III',
    name: 'Subcategory III',
    description: 'Extension approved by Engineer-in-Charge',
    displayOrder: 3,
    isActive: true
  }
];
