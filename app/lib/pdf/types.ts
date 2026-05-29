
/**
 * Shared TypeScript types for PDF generation
 */

export interface PDFBill {
  id: number;
  billNumber: string;
  measurementDate: Date;
  totalAmount: number;
  totalPVC: number;
  isExtension: boolean;
  gccPolicyType: string | null;
  contract: {
    contractNumber: string;
    contractName: string;
    workDescription: string;
    workClassification: string;
    tenderAdvertisedValue: number;
    baseDate: Date;
  };
  classifications: PDFClassification[];
}

export interface PDFClassification {
  id: number;
  itemDescription: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  componentPercentages: Record<string, number>;
  pvcAmount: number;
  variationRatio: number;
  usedIndex: string;
  restrictionApplied: boolean;
  restrictionDetails?: string;
}

export interface PDFIndices {
  baseMonth: MonthlyIndex;
  measurementMonth: MonthlyIndex;
  quarterlyAverages?: QuarterlyAverage[];
}

export interface MonthlyIndex {
  month: string;
  year: number;
  date: Date;
  indexA: number;
  indexB: number;
  indexC: number;
  indexD: number;
  indexE: number;
  indexF: number;
  indexG: number;
  indexH: number;
  indexI: number;
  indexJ: number;
  indexK: number;
  indexL: number;
  indexLThreeMonthAvg?: number;
}

export interface QuarterlyAverage {
  quarter: string;
  year: number;
  months: string[];
  averages: Record<string, number>;
}

export interface PDFTableColumn {
  header: string;
  key: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  format?: (value: any) => string;
}

export interface PDFTableOptions {
  columns: PDFTableColumn[];
  data: any[];
  headerColor?: string;
  alternateRows?: boolean;
  fontSize?: number;
  padding?: number;
}

export interface PDFSection {
  title: string;
  content: string | PDFTableOptions | PDFSection[];
  level?: number;
}

export interface PDFGeneratorOptions {
  title: string;
  subtitle?: string;
  sections: PDFSection[];
  footer?: string;
  metadata?: {
    author?: string;
    subject?: string;
    keywords?: string[];
  };
}

export interface ComponentPVCBreakdown {
  component: string;
  percentage: number;
  baseIndex: number;
  measurementIndex: number;
  variationRatio: number;
  pvcAmount: number;
  formula?: string;
}

export interface PVCSummary {
  totalBillAmount: number;
  totalPVCAmount: number;
  components: ComponentPVCBreakdown[];
  restrictionApplied: boolean;
  cappingApplied?: boolean;
  gccCompliance?: string;
}

export interface BulkPDFBill extends PDFBill {
  sequenceNumber: number;
}

export interface BulkPDFOptions {
  bills: BulkPDFBill[];
  consolidatedSummary: boolean;
  includeIndividualReports: boolean;
}

export type PDFFormat = 'A4' | 'Letter' | 'Legal';
export type PDFOrientation = 'portrait' | 'landscape';

export interface PDFConfig {
  format: PDFFormat;
  orientation: PDFOrientation;
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}
