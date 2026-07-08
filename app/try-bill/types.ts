export interface GuestBillDraft {
  agreementNo: string;
  contractorName: string;
  dateOfOpening: string; // YYYY-MM-DD
  dateOfMeasurement: string; // YYYY-MM-DD
  grossBillAmount: number;
  workClassificationCode?: string;
  zone: string;
  fuelPriceType: 'four_city_avg' | 'zone_city';
}

export interface GuestPreviewResult {
  quarter: string;
  labourPvc: number;
  plantMachineryPvc: number;
  fuelPowerPvc: number;
  otherMaterialsPvc: number;
  cementPvc: number;
  steelPvc: number;
  explosivesPvc: number;
  totalPvc: number;
  indices: Record<string, number>;
}

export const GUEST_DRAFT_STORAGE_KEY = 'irpvc_guest_draft';
