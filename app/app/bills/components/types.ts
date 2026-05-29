
/**
 * Shared types for bills components
 */

export interface User {
  id: string;
  name: string | null;
  email: string;
}

export interface Contract {
  id: string;
  agreementNo: string;
  contractorName: string;
  contractorPhone?: string | null;
  workDescription: string;
  isExtended: boolean;
  extensionType: string | null;
  originalCompletionDate: string | null;
  currentCompletionDate: string | null;
  user?: User | null;
}

export interface ReportTemplate {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
}

export interface PvcCalculation {
  id: string;
  totalPvc: number;
  cumulativePvc: number;
  labourPvc: number;
  plantMachineryPvc: number;
  fuelPowerPvc: number;
  otherMaterialsPvc: number;
  cementSteelComponentsPvc: number;
  basePeriodAverage: number;
  currentPeriodAverage: number;
  variationPercentage: number;
  cappingApplied: boolean;
}

export interface Bill {
  id: string;
  billNumber: string;
  billDate: Date | string;
  measurementDate: Date | string;
  description: string | null;
  totalAmount: number;
  isExtension: boolean;
  extensionDetails: string | null;
  contract: Contract;
  isFreeTrial: boolean;
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED' | null;
  approverName?: string | null;
  approverComments?: string | null;
  pvcCalculations?: PvcCalculation[];
  createdAt?: Date | string;
  createdBy?: {
    name: string;
    email: string;
  };
}

export type ViewMode = 'table' | 'grid';
export type SortField = 'billNumber' | 'billDate' | 'totalAmount' | 'contractName';
export type SortDirection = 'asc' | 'desc';

export interface BillFilters {
  search: string;
  contractId: string;
  startDate: string;
  endDate: string;
  extensionStatus: string;
  approvalStatus: string;
}

export interface BillsState {
  bills: Bill[];
  contracts: Contract[];
  isLoading: boolean;
  viewMode: ViewMode;
  selectedBills: string[];
  sortField: SortField;
  sortDirection: SortDirection;
  filters: BillFilters;
}
