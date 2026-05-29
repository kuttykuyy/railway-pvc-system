
// Auto-fetch functionality has been removed completely
// This file is no longer used for index fetching

export interface IndexData {
  value: number;
  month: string;
  source: string;
  isProvisional?: boolean;
}

// Utility functions for data validation and processing remain for backward compatibility
export class IndexProcessor {
  static validateIndexData(data: IndexData): boolean {
    return (
      typeof data.value === 'number' &&
      data.value > 0 &&
      typeof data.month === 'string' &&
      data.month.match(/^\d{4}-\d{2}$/) !== null &&
      typeof data.source === 'string' &&
      data.source.length > 0
    );
  }

  static formatIndexValue(value: number, indexType: string): string {
    // Steel indices are in absolute values (Rs/MT), others are index numbers
    if (indexType.toLowerCase().includes('steel')) {
      return value.toLocaleString('en-IN', { 
        style: 'currency', 
        currency: 'INR',
        maximumFractionDigits: 0 
      });
    } else {
      return value.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    }
  }

  static calculatePercentageChange(current: number, base: number): number {
    return ((current - base) / base) * 100;
  }
}
