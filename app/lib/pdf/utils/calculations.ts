
/**
 * PVC calculation utilities for PDF generation
 */

import type { PDFClassification, ComponentPVCBreakdown } from '../types';

/**
 * Calculate component-wise PVC breakdown
 */
export function calculateComponentBreakdown(
  classification: PDFClassification,
  baseIndices: Record<string, number>,
  measurementIndices: Record<string, number>
): ComponentPVCBreakdown[] {
  const components: ComponentPVCBreakdown[] = [];
  const componentPercentages = classification.componentPercentages || {};
  
  for (const [component, percentage] of Object.entries(componentPercentages)) {
    if (percentage > 0) {
      const baseIndex = baseIndices[component] || 0;
      const measurementIndex = measurementIndices[component] || 0;
      
      const variationRatio = baseIndex > 0 
        ? (measurementIndex - baseIndex) / baseIndex 
        : 0;
      
      const pvcAmount = classification.amount * (percentage / 100) * variationRatio;
      
      components.push({
        component,
        percentage,
        baseIndex,
        measurementIndex,
        variationRatio,
        pvcAmount,
        formula: `${classification.amount} × ${percentage}% × ${variationRatio.toFixed(6)}`,
      });
    }
  }
  
  return components;
}

/**
 * Calculate total PVC for a classification
 */
export function calculateClassificationPVC(
  classification: PDFClassification,
  baseIndices: Record<string, number>,
  measurementIndices: Record<string, number>
): number {
  const breakdown = calculateComponentBreakdown(classification, baseIndices, measurementIndices);
  return breakdown.reduce((sum, comp) => sum + comp.pvcAmount, 0);
}

/**
 * Apply 17B capping to PVC amount
 */
export function apply17BCapping(
  pvcAmount: number,
  billAmount: number,
  cappingPercentage: number = 10
): { cappedAmount: number; cappingApplied: boolean } {
  const maxAllowedPVC = billAmount * (cappingPercentage / 100);
  
  if (Math.abs(pvcAmount) > maxAllowedPVC) {
    return {
      cappedAmount: pvcAmount > 0 ? maxAllowedPVC : -maxAllowedPVC,
      cappingApplied: true,
    };
  }
  
  return {
    cappedAmount: pvcAmount,
    cappingApplied: false,
  };
}

/**
 * Calculate quarterly average for an index
 */
export function calculateQuarterlyAverage(
  monthlyValues: number[]
): number {
  if (monthlyValues.length === 0) return 0;
  const sum = monthlyValues.reduce((acc, val) => acc + val, 0);
  return sum / monthlyValues.length;
}

/**
 * Get index value based on policy type and date
 */
export function getUsedIndex(
  baseIndex: number,
  measurementIndex: number,
  quarterlyAverage: number | undefined,
  gccPolicyType: string | null,
  isExtension: boolean
): { value: number; label: string } {
  // For extension bills with 17B policy, use quarterly average
  if (isExtension && gccPolicyType === '17B' && quarterlyAverage !== undefined) {
    return {
      value: quarterlyAverage,
      label: 'Quarterly Average',
    };
  }
  
  // Otherwise use measurement month index
  return {
    value: measurementIndex,
    label: 'Measurement Month',
  };
}
