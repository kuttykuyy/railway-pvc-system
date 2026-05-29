
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BillStatusBadge } from '@/components/bills/bill-status-badge';
import { ApprovalActions } from '@/components/bills/approval-actions';
import { ApprovalHistory } from '@/components/bills/approval-history';
import { WhatsAppSendDialog } from '@/components/whatsapp-send-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Building, 
  Calendar, 
  IndianRupee, 
  FileText, 
  User,
  ArrowLeft,
  Download,
  Edit,
  FileType,
  MessageCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ClassificationComparisonDialog } from '@/components/classification-comparison-dialog';
import { getFuelIndexNameForBill, getSteelCityForZone } from '@/lib/zone-steel-city-mapping';

// Helper: resolve the correct fuel index name for a bill (handles city-specific with fallback)
function resolveFuelIndexName(bill: any): string {
  return getFuelIndexNameForBill(bill?.zone, bill?.fuelPriceType);
}

// Helper: resolve the fuel index key from indicesData (may need fallback to prefix match)
function resolveFuelFromIndices(
  indicesData: { base: { [key: string]: number }; current: { [key: string]: number } } | null,
  fuelIndexName: string
): { base: number; current: number } {
  if (!indicesData) return { base: 0, current: 0 };
  // Exact match first
  if (indicesData.base[fuelIndexName] !== undefined && indicesData.current[fuelIndexName] !== undefined) {
    return { base: indicesData.base[fuelIndexName], current: indicesData.current[fuelIndexName] };
  }
  // Prefix match fallback (e.g. 'MPNG Fuel - Delhi')
  for (const key of Object.keys(indicesData.base)) {
    if (key === fuelIndexName || key.startsWith('MPNG Fuel')) {
      if (indicesData.current[key] !== undefined) {
        return { base: indicesData.base[key], current: indicesData.current[key] };
      }
    }
  }
  return { base: 0, current: 0 };
}

interface BillDetailClientProps {
  bill: any;
  user: any;
  indicesData: { base: { [key: string]: number }; current: { [key: string]: number } } | null;
  monthlyIndicesData: { [key: string]: { [monthKey: string]: number } } | null;
  detailedMonthlyData: any[] | null;
}

// Helper function to calculate weighted component percentage
function calculateWeightedPercentage(
  classificationEntries: any[],
  componentKey: string
): number {
  if (!classificationEntries || classificationEntries.length === 0) {
    return 0;
  }

  let totalAmount = 0;
  let weightedSum = 0;

  classificationEntries.forEach((entry) => {
    const amount = entry.amount || 0;
    const classification = entry.subClassification || entry.classification;
    
    if (classification && classification[componentKey] != null) {
      totalAmount += amount;
      weightedSum += amount * classification[componentKey];
    }
  });

  if (totalAmount === 0) return 0;
  
  return weightedSum / totalAmount;
}

// Detailed Monthly Indices Table - matches PDF report format with quarters and averages
function DetailedMonthlyIndicesTable({
  classificationEntries,
  detailedMonthlyData,
  contract,
  bill
}: {
  classificationEntries: any[];
  detailedMonthlyData: any[] | null;
  contract: any;
  bill?: any;
}) {
  if (!detailedMonthlyData || !classificationEntries || classificationEntries.length === 0) {
    return null;
  }

  const fuelIndexName = bill ? resolveFuelIndexName(bill) : 'MPNG Fuel';
  const fuelDisplayName = fuelIndexName === 'MPNG Fuel' ? 'MPNG Fuel' : fuelIndexName;

  // Define all components with their index names (including dedicated steel components)
  const allComponents = [
    { key: 'labour', name: 'Labour', indexName: 'Labour' },
    { key: 'plantMachinery', name: 'Plant Machinery & Spares', indexName: 'RBI Plant Machinery' },
    { key: 'fuel', name: fuelDisplayName, indexName: fuelIndexName },
    { key: 'otherMaterials', name: 'Other Materials', indexName: 'RBI Other Materials' },
    { key: 'cement', name: 'Cement', indexName: 'RBI Cement' },
    { key: 'explosives', name: 'Explosives', indexName: 'RBI Explosives' },
    { key: 'steel', name: 'TMT Bars', indexName: 'Steel TMT Bars' },
    { key: 'steelAngleChannel', name: 'Angle/Channel', indexName: 'Steel Angle/Channel' },
    { key: 'steelPlates', name: 'Plates', indexName: 'Steel Plates' },
    { key: 'steelOtherSections', name: 'Other Sections', indexName: 'Steel Other Sections' }
  ];

  // Map steel type enums to index names for filtering
  const steelTypeToIndex: { [key: string]: string } = {
    'TMT': 'Steel TMT Bars',
    'ANGLE_CHANNEL': 'Steel Angle/Channel',
    'PLATES': 'Steel Plates',
    'OTHER_SECTIONS': 'Steel Other Sections'
  };

  // Determine which steel indices are actually used by the bill
  const billSteelTypes = bill?.steelTypes as string[] | undefined;
  const usedSteelIndexNames = new Set<string>();
  if (billSteelTypes && Array.isArray(billSteelTypes) && billSteelTypes.length > 0) {
    billSteelTypes.forEach((st: string) => {
      if (steelTypeToIndex[st]) usedSteelIndexNames.add(steelTypeToIndex[st]);
    });
  }

  // Check if bill has dedicated cement/steel amounts
  const hasDedicatedCement = bill?.cementAmount && bill.cementAmount > 0;
  const hasDedicatedSteel = (bill?.steelTmtBarsAmount > 0) || (bill?.steelAngleChannelAmount > 0) ||
    (bill?.steelPlatesAmount > 0) || (bill?.steelOtherSectionsAmount > 0);

  // Determine which components are actually used (have non-zero percentages in classifications or dedicated amounts)
  const usedComponents = allComponents.filter(({ key, indexName }) => {
    // For individual steel types: check bill's steelTypes selection or dedicated amounts
    const steelIndexNames = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
    if (steelIndexNames.includes(indexName)) {
      // Show if this steel type is in the bill's steelTypes
      if (usedSteelIndexNames.has(indexName)) return true;
      // Show if steel is used in classifications and no specific types selected (show all)
      const steelUsedInClassification = classificationEntries.some((entry) => {
        const classification = entry.subClassification || entry.classification;
        return classification && classification['steel'] != null && classification['steel'] > 0;
      });
      if (steelUsedInClassification && usedSteelIndexNames.size === 0) return true;
      // Show if there's a dedicated steel amount for this type
      if (indexName === 'Steel TMT Bars' && bill?.steelTmtBarsAmount > 0) return true;
      if (indexName === 'Steel Angle/Channel' && bill?.steelAngleChannelAmount > 0) return true;
      if (indexName === 'Steel Plates' && bill?.steelPlatesAmount > 0) return true;
      if (indexName === 'Steel Other Sections' && bill?.steelOtherSectionsAmount > 0) return true;
      return false;
    }

    // For cement: also check dedicated amount
    if (key === 'cement' && hasDedicatedCement) return true;

    // Check if used in any classification entry
    const usedInClassification = classificationEntries.some((entry) => {
      const classification = entry.subClassification || entry.classification;
      return classification && classification[key] != null && classification[key] > 0;
    });
    
    return usedInClassification;
  });

  if (usedComponents.length === 0) {
    return null;
  }

  // Separate steel components for grouping
  const steelComponents = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
  const steelColumnsCount = usedComponents.filter(comp => 
    steelComponents.includes(comp.indexName)
  ).length;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full border-collapse text-sm">
          <thead>
            {/* Steel zone header row */}
            {steelColumnsCount > 0 && (
              <tr className="bg-gradient-to-r from-purple-600 to-purple-700 text-white">
                <th className="border border-gray-300 px-4 py-2 text-left font-bold sticky left-0 bg-purple-600 z-10">
                  {/* Empty for Period column */}
                </th>
                {usedComponents.map(({ name, indexName }) => {
                  if (steelComponents.includes(indexName)) {
                    return (
                      <th key={`zone-${indexName}`} className="border border-gray-300 px-3 py-2 text-center font-bold">
                        STEEL
                      </th>
                    );
                  }
                  return (
                    <th key={`zone-${indexName}`} className="border border-gray-300 px-3 py-2">
                      {/* Empty for non-steel columns */}
                    </th>
                  );
                })}
              </tr>
            )}
            {/* Component names header row */}
            <tr className="bg-gradient-to-r from-teal-500 to-teal-600 text-white">
              <th className="border border-gray-300 px-4 py-3 text-left font-bold sticky left-0 bg-teal-500 z-10">
                Period
              </th>
              {usedComponents.map(({ name, indexName, key }) => {
                return (
                  <th key={indexName} className="border border-gray-300 px-3 py-3 text-center font-bold whitespace-pre-wrap" style={{ minWidth: '120px' }}>
                    {name}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {detailedMonthlyData.map((row, index) => {
              if (row.type === 'quarter_header') {
                // Quarter header row
                return (
                  <tr key={`quarter-${index}`} className="bg-gray-100 dark:bg-gray-800">
                    <td 
                      colSpan={usedComponents.length + 1} 
                      className="border border-gray-300 px-4 py-2 font-bold text-sm"
                    >
                      {row.label}
                    </td>
                  </tr>
                );
              } else if (row.type === 'base') {
                // Base month row
                return (
                  <tr key="base" className="bg-gray-50 dark:bg-gray-900">
                    <td className="border border-gray-300 px-4 py-2 font-medium sticky left-0 bg-gray-50 dark:bg-gray-900">
                      {row.label}
                    </td>
                    {usedComponents.map(({ indexName }) => (
                      <td key={indexName} className="border border-gray-300 px-3 py-2 text-center">
                        {row.values[indexName] != null ? row.values[indexName].toFixed(2) : '-'}
                      </td>
                    ))}
                  </tr>
                );
              } else if (row.type === 'quarter_avg') {
                // Quarterly average row
                return (
                  <tr key={`avg-${index}`} className={`${row.isMeasurementQuarter ? 'bg-blue-50 dark:bg-blue-950/20 font-semibold' : 'bg-amber-50 dark:bg-amber-950/20 font-medium'}`}>
                    <td className={`border border-gray-300 px-4 py-2 sticky left-0 ${row.isMeasurementQuarter ? 'bg-blue-50 dark:bg-blue-950/20' : 'bg-amber-50 dark:bg-amber-950/20'}`}>
                      {row.label}
                    </td>
                    {usedComponents.map(({ indexName }) => (
                      <td key={indexName} className="border border-gray-300 px-3 py-2 text-center">
                        {row.values[indexName] != null ? row.values[indexName].toFixed(2) : '-'}
                      </td>
                    ))}
                  </tr>
                );
              } else if (row.type === 'month') {
                // Monthly data row
                return (
                  <tr key={`month-${index}`} className={`hover:bg-muted/50 ${row.isMeasurementQuarter ? 'bg-blue-50/30 dark:bg-blue-950/10' : ''}`}>
                    <td className={`border border-gray-300 px-4 py-2 sticky left-0 bg-background ${row.isMeasurementQuarter ? 'font-medium' : ''}`}>
                      {row.label}{row.isMeasurementQuarter ? ' [Measurement Quarter]' : ''}
                    </td>
                    {usedComponents.map(({ indexName }) => (
                      <td key={indexName} className="border border-gray-300 px-3 py-2 text-center">
                        {row.values[indexName] != null ? row.values[indexName].toFixed(2) : '-'}
                      </td>
                    ))}
                  </tr>
                );
              }
              return null;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Helper function to calculate total PVC from all components
function calculateTotalPvc(
  classificationEntries: any[],
  pvcCalculation: any,
  indicesData: { base: { [key: string]: number }; current: { [key: string]: number } } | null,
  bill?: any
): number {
  if (!pvcCalculation) {
    return 0;
  }

  const fuelIdx = bill ? resolveFuelIndexName(bill) : 'MPNG Fuel';

  // Steel type mapping (same as ComponentPvcTable)
  const steelTypeMap: { [key: string]: string } = {
    'TMT': 'Steel TMT Bars',
    'ANGLE_CHANNEL': 'Steel Angle/Channel',
    'PLATES': 'Steel Plates',
    'OTHER_SECTIONS': 'Steel Other Sections'
  };

  // Component to index name mapping
  const componentIndexMap: { [key: string]: string | null } = {
    fixed: null,
    labour: 'Labour',
    plantMachinery: 'RBI Plant Machinery',
    fuel: fuelIdx,
    otherMaterials: 'RBI Other Materials',
    cement: 'RBI Cement',
    steel: 'Steel',
    explosives: 'RBI Explosives'
  };

  // Helper to get indices with steel type averaging
  const getIndices = (indexName: string | null, steelTypes?: string[]) => {
    if (!indexName || !indicesData) return { base: 0, current: 0 };
    
    if (indexName === 'Steel' && steelTypes && steelTypes.length > 0) {
      const selectedSteelIndices = steelTypes
        .map(type => {
          const steelIndexName = steelTypeMap[type];
          if (steelIndexName && indicesData.base[steelIndexName] && indicesData.current[steelIndexName]) {
            return { base: indicesData.base[steelIndexName], current: indicesData.current[steelIndexName] };
          }
          return null;
        })
        .filter(idx => idx !== null) as { base: number; current: number }[];

      if (selectedSteelIndices.length > 0) {
        const avgBase = selectedSteelIndices.reduce((sum, idx) => sum + idx.base, 0) / selectedSteelIndices.length;
        const avgCurrent = selectedSteelIndices.reduce((sum, idx) => sum + idx.current, 0) / selectedSteelIndices.length;
        return { base: avgBase, current: avgCurrent };
      }
    }
    
    return {
      base: indicesData.base[indexName] || 0,
      current: indicesData.current[indexName] || 0
    };
  };

  // Recalculate classification PVC from indices (same logic as ComponentPvcTable)
  let classificationPvcTotal = 0;
  
  if (classificationEntries && classificationEntries.length > 0 && indicesData) {
    for (const entry of classificationEntries) {
      const entryAmount = parseFloat(String(entry.amount)) || 0;
      if (entryAmount <= 0) continue;
      
      const classification = entry.subClassification || entry.classification;
      if (!classification) continue;

      const entrySteelTypes = entry.steelTypes && Array.isArray(entry.steelTypes) ? entry.steelTypes : [];

      for (const [key, indexName] of Object.entries(componentIndexMap)) {
        if (key === 'fixed') continue;
        const percentage = classification[key];
        if (!percentage || percentage <= 0) continue;

        const indices = key === 'steel'
          ? getIndices(indexName, entrySteelTypes)
          : getIndices(indexName);
          
        const baseIndex = Math.round(indices.base * 100) / 100;
        const currentIndex = Math.round(indices.current * 100) / 100;

        if (baseIndex === 0) continue;
        classificationPvcTotal += entryAmount * ((currentIndex - baseIndex) / baseIndex) * (percentage / 100);
      }
    }
  } else if (classificationEntries && classificationEntries.length > 0) {
    // Fallback to DB entry-level PVC when no indices available
    classificationPvcTotal = classificationEntries.reduce((sum: number, entry: any) => {
      return sum + (entry.totalPvc || 0);
    }, 0);
    if (classificationPvcTotal === 0) {
      classificationPvcTotal = 
        (pvcCalculation.labourPvc || 0) +
        (pvcCalculation.plantMachineryPvc || 0) +
        (pvcCalculation.fuelPowerPvc || 0) +
        (pvcCalculation.otherMaterialsPvc || 0) +
        (pvcCalculation.cementPvc || 0) +
        (pvcCalculation.steelPvc || 0) +
        (pvcCalculation.explosivesPvc || 0);
    }
  }
  
  // Add dedicated cement and steel PVC components
  const dedicatedCementPvc = pvcCalculation.dedicatedCementPvc || 0;
  const dedicatedSteelPvc = 
    (pvcCalculation.dedicatedSteelTmtBarsPvc || 0) +
    (pvcCalculation.dedicatedSteelAngleChannelPvc || 0) +
    (pvcCalculation.dedicatedSteelPlatesPvc || 0) +
    (pvcCalculation.dedicatedSteelOtherSectionsPvc || 0);
  
  return classificationPvcTotal + dedicatedCementPvc + dedicatedSteelPvc;
}

// Component-wise PVC Table - displays per-classification breakdown with percentages (matches PDF format)
function ComponentPvcTable({
  classificationEntries,
  billAmount,
  pvcCalculation,
  indicesData,
  bill
}: {
  classificationEntries: any[];
  billAmount: number;
  pvcCalculation: any;
  indicesData: { base: { [key: string]: number }; current: { [key: string]: number } } | null;
  bill?: any;
}) {
  const fuelIdx = bill ? resolveFuelIndexName(bill) : 'MPNG Fuel';
  const fuelDisplayLabel = fuelIdx === 'MPNG Fuel' ? 'Fuel & Lubricants' : `Fuel & Lubricants (${fuelIdx.replace('MPNG Fuel - ', '')})`;

  // Component mapping for display
  const componentMap = {
    fixed: { name: 'Fixed Component', indexName: null as string | null },
    labour: { name: 'Labour', indexName: 'Labour' },
    plantMachinery: { name: 'Plant Machinery & Spares', indexName: 'RBI Plant Machinery' },
    fuel: { name: fuelDisplayLabel, indexName: fuelIdx },
    otherMaterials: { name: 'Other Materials', indexName: 'RBI Other Materials' },
    cement: { name: 'Cement Component', indexName: 'RBI Cement' },
    steel: { name: 'Steel Component', indexName: 'Steel' },
    explosives: { name: 'Explosives Component', indexName: 'RBI Explosives' }
  };

  // Steel type mapping
  const steelTypeMap: { [key: string]: string } = {
    'TMT': 'Steel TMT Bars',
    'ANGLE_CHANNEL': 'Steel Angle/Channel',
    'PLATES': 'Steel Plates',
    'OTHER_SECTIONS': 'Steel Other Sections'
  };

  // Get indices for calculation - with proper steel type handling
  const getIndices = (indexName: string | null, steelTypes?: string[]) => {
    if (!indexName || !indicesData) return { base: 0, current: 0 };
    
    // For steel component, calculate average of selected steel types
    if (indexName === 'Steel' && steelTypes && steelTypes.length > 0) {
      const selectedSteelIndices = steelTypes
        .map(type => {
          const steelIndexName = steelTypeMap[type];
          if (steelIndexName && indicesData.base[steelIndexName] && indicesData.current[steelIndexName]) {
            return {
              base: indicesData.base[steelIndexName],
              current: indicesData.current[steelIndexName]
            };
          }
          return null;
        })
        .filter(idx => idx !== null) as { base: number; current: number }[];

      if (selectedSteelIndices.length > 0) {
        // Calculate average of selected steel types
        const avgBase = selectedSteelIndices.reduce((sum, idx) => sum + idx.base, 0) / selectedSteelIndices.length;
        const avgCurrent = selectedSteelIndices.reduce((sum, idx) => sum + idx.current, 0) / selectedSteelIndices.length;
        return { base: avgBase, current: avgCurrent };
      }
    }
    
    return {
      base: indicesData.base[indexName] || 0,
      current: indicesData.current[indexName] || 0
    };
  };

  if (!classificationEntries || classificationEntries.length === 0) {
    return <p className="text-sm text-muted-foreground">No classification entries available</p>;
  }

  // Calculate PVC for a component
  const calculateComponentPvc = (
    amount: number,
    percentage: number,
    baseIndex: number,
    currentIndex: number
  ): number => {
    if (baseIndex === 0 || percentage === 0) return 0;
    return amount * ((currentIndex - baseIndex) / baseIndex) * (percentage / 100);
  };

  let grandTotalPvc = 0;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-primary">
          Per-Classification PVC Breakdown
        </h4>
        <p className="text-xs text-muted-foreground">
          Detailed breakdown showing component percentages and PVC for each work classification
        </p>
      </div>

      {classificationEntries.map((entry, entryIndex) => {
        const entryAmount = parseFloat(String(entry.amount)) || 0;
        if (entryAmount <= 0) return null;

        const classification = entry.subClassification || entry.classification;
        if (!classification) return null;

        const classCode = classification.code;
        const className = classification.name;
        
        // Build component rows for this classification
        const componentRows: Array<{
          componentName: string;
          percentage: number;
          formula: string;
          pvcAmount: number;
          isFixed?: boolean;
        }> = [];

        let classificationTotal = 0;

        // Get steel types for this classification entry
        const entrySteelTypes = entry.steelTypes && Array.isArray(entry.steelTypes) ? entry.steelTypes : [];

        // Process each component
        Object.entries(componentMap).forEach(([key, { name: componentName, indexName }]) => {
          const percentage = classification[key];
          
          if (!percentage || percentage <= 0) return;

          // Fixed component doesn't contribute to PVC
          if (key === 'fixed') {
            componentRows.push({
              componentName,
              percentage,
              formula: 'Not subject to price variation',
              pvcAmount: 0,
              isFixed: true
            });
            return;
          }

          // Get indices - pass steel types for steel component
          const indices = key === 'steel' 
            ? getIndices(indexName, entrySteelTypes)
            : getIndices(indexName);
            
          const baseIndex = Math.round(indices.base * 100) / 100;
          const currentIndex = Math.round(indices.current * 100) / 100;

          const pvcAmount = calculateComponentPvc(entryAmount, percentage, baseIndex, currentIndex);
          
          const formula = baseIndex !== 0
            ? `${entryAmount.toLocaleString('en-IN')} × [(${currentIndex.toFixed(2)} - ${baseIndex.toFixed(2)}) ÷ ${baseIndex.toFixed(2)}] × ${percentage.toFixed(1)}%`
            : 'N/A';

          componentRows.push({
            componentName,
            percentage,
            formula,
            pvcAmount
          });

          classificationTotal += pvcAmount;
        });

        grandTotalPvc += classificationTotal;

        if (componentRows.length === 0) return null;

        return (
          <div key={entry.id || entryIndex} className="border rounded-lg p-4 bg-muted/20">
            <div className="mb-3">
              <h5 className="text-sm font-semibold text-primary">
                Classification {entryIndex + 1}: {classCode} - {className}
              </h5>
              <p className="text-xs text-muted-foreground mt-1">
                Amount: ₹ {entryAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-border">
                <thead>
                  <tr className="bg-primary/5">
                    <th className="border border-border px-3 py-2 text-left text-xs font-semibold">Component</th>
                    <th className="border border-border px-3 py-2 text-left text-xs font-semibold">Formula</th>
                    <th className="border border-border px-3 py-2 text-right text-xs font-semibold">PVC Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {componentRows.map((row, rowIndex) => (
                    <tr key={rowIndex} className={row.isFixed ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-muted/50'}>
                      <td className="border border-border px-3 py-2 text-xs font-medium">
                        {row.componentName}
                      </td>
                      <td className="border border-border px-3 py-2 text-xs font-mono">
                        {row.formula}
                      </td>
                      <td className="border border-border px-3 py-2 text-right text-xs font-semibold">
                        {row.pvcAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                  {/* Classification subtotal */}
                  <tr className="bg-amber-50 dark:bg-amber-950/20 font-semibold">
                    <td colSpan={2} className="border border-border px-3 py-2 text-xs text-right">
                      Classification Total:
                    </td>
                    <td className="border border-border px-3 py-2 text-right text-xs font-bold">
                      ₹ {classificationTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Grand Total */}
      {classificationEntries.length > 1 && (
        <div className="border-t-2 border-primary pt-3">
          <div className="flex justify-between items-center bg-primary/10 rounded-lg p-3">
            <span className="text-sm font-bold">TOTAL PVC (All Classifications):</span>
            <span className="text-sm font-bold">
              ₹ {grandTotalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function BillDetailClient({ bill, user, indicesData, monthlyIndicesData, detailedMonthlyData }: BillDetailClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);
  const [defaultTemplate, setDefaultTemplate] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [whatsAppDialogOpen, setWhatsAppDialogOpen] = useState(false);

  // Fetch templates on mount
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const response = await fetch('/api/report-templates');
        if (response.ok) {
          const data = await response.json();
          setTemplates(data);
          const defaultTpl = data.find((t: any) => t.isDefault);
          setDefaultTemplate(defaultTpl || null);
          setSelectedTemplateId(defaultTpl?.id || null);
        }
      } catch (error) {
        console.error('Error fetching templates:', error);
      }
    };
    fetchTemplates();
  }, []);

  const handleActionComplete = () => {
    router.refresh();
  };

  const handleDownloadPDF = async () => {
    try {
      setIsDownloading(true);
      
      // Build URL with optional template parameter
      let url = `/api/bills/${bill.id}/pdf-report`;
      if (selectedTemplateId && selectedTemplateId !== defaultTemplate?.id) {
        url += `?templateId=${selectedTemplateId}`;
      }
      
      // Call the PDF report endpoint
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }
      
      // Get the PDF blob
      const blob = await response.blob();
      
      // Create a download link
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `PVC_Report_${bill.billNo.replace(/\//g, '_')}_${format(toISTDate(new Date()), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(a);
      a.click();
      
      // Cleanup
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
      
      toast({
        title: 'Success',
        description: 'Bill PDF downloaded successfully',
      });
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast({
        title: 'Error',
        description: 'Failed to download PDF. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => router.back()}>
          <ArrowLeft size={20} />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold">{bill.billNo}</h1>
            <BillStatusBadge status={bill.status} size="lg" />
          </div>
          <p className="text-muted-foreground mt-1">
            {bill.contract.agreementNo} · {bill.contract.workDescription?.substring(0, 100)}{bill.contract.workDescription && bill.contract.workDescription.length > 100 ? '...' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          {(user.role === 'user' || user.role === 'contractor' || user.role === 'admin') && 
           (bill.status === 'draft' || bill.status === 'revision_requested') && (
            <>
              {/* Show disabled button with tooltip for contractors who have already edited once */}
              {(user.role === 'user' || user.role === 'contractor') && bill.hasBeenEditedOnce ? (
                <div className="relative group">
                  <Button variant="outline" className="gap-2 opacity-50 cursor-not-allowed" disabled>
                    <Edit size={16} />
                    Edit Bill
                  </Button>
                  <div className="absolute hidden group-hover:block bottom-full mb-2 right-0 w-72 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg z-50">
                    <p className="font-medium mb-1">Edit Limit Reached</p>
                    <p>You have already edited this bill once. Contractors can only edit a bill one time. Please contact support if you need further changes.</p>
                  </div>
                </div>
              ) : (
                <Link href={`/bills/edit/${bill.id}`}>
                  <Button variant="outline" className="gap-2">
                    <Edit size={16} />
                    Edit Bill
                  </Button>
                </Link>
              )}
            </>
          )}

          {/* Template selector and download button */}
          <div className="flex gap-2 items-center">
            {templates.length > 0 && (
              <div className="flex items-center gap-2">
                <Select value={selectedTemplateId || 'default'} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name} {template.isDefault && '(Default)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button 
              variant="outline" 
              className="gap-2"
              onClick={handleDownloadPDF}
              disabled={isDownloading}
            >
              <Download size={16} />
              {isDownloading ? 'Generating...' : 'Download PDF'}
            </Button>
            <Button 
              variant="outline" 
              className="gap-2"
              onClick={() => setWhatsAppDialogOpen(true)}
            >
              <MessageCircle size={16} />
              Send via WhatsApp
            </Button>
          </div>
        </div>
      </div>

      {/* WhatsApp Send Dialog */}
      <WhatsAppSendDialog
        open={whatsAppDialogOpen}
        onOpenChange={setWhatsAppDialogOpen}
        billId={bill.id}
        billNumber={bill.billNo || 'N/A'}
        contractorName={bill.contract?.contractorName}
        contractorPhone={bill.contract?.contractorPhone}
      />

      {/* Template info banner */}
      {defaultTemplate && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <FileType className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900 mb-1">
                Using Default Report Template
              </h3>
              <p className="text-sm text-blue-800">
                PDFs will be generated using the <strong>{defaultTemplate.name}</strong> template. 
                {templates.length > 1 && ' You can select a different template from the dropdown above.'}
              </p>
              {defaultTemplate.description && (
                <p className="text-xs text-blue-700 mt-1">
                  {defaultTemplate.description}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {!defaultTemplate && templates.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <FileType className="h-5 w-5 text-gray-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">
                Using Default Settings
              </h3>
              <p className="text-sm text-gray-700">
                No custom report template is set. PDFs will include all sections and fields. 
                <Link href="/report-templates" className="text-primary hover:underline ml-1">
                  Create a template
                </Link> to customize what appears in your reports.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Edit History Notification - Show for contractors who have edited */}
      {(user.role === 'user' || user.role === 'contractor') && bill.hasBeenEditedOnce && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <Edit className="h-5 w-5 text-yellow-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-yellow-900 mb-1">
                Bill Edit Limit Reached
              </h3>
              <p className="text-sm text-yellow-800">
                You have already edited this bill once. Contractors can only edit a bill one time. 
                {bill.lastEditedAt && (
                  <span className="block mt-1 text-xs">
                    Last edited on {format(new Date(bill.lastEditedAt), 'dd MMM yyyy, HH:mm')}
                  </span>
                )}
              </p>
              <p className="text-xs text-yellow-700 mt-2">
                If you need to make additional changes, please contact support for assistance.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Approval Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Approval Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <ApprovalActions 
            billId={bill.id}
            billStatus={bill.status}
            userRole={user.role}
            onActionComplete={handleActionComplete}
          />
          
          {/* Show rejection reason or approval comments if exists */}
          {bill.rejectionReason && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm font-medium text-red-900 mb-1">Rejection Reason:</p>
              <p className="text-sm text-red-800">{bill.rejectionReason}</p>
            </div>
          )}
          
          {bill.approvalComments && bill.status === 'revision_requested' && (
            <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-md">
              <p className="text-sm font-medium text-orange-900 mb-1">Revision Requirements:</p>
              <p className="text-sm text-orange-800">{bill.approvalComments}</p>
            </div>
          )}
          
          {bill.approvalComments && bill.status === 'approved' && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm font-medium text-green-900 mb-1">Approval Comments:</p>
              <p className="text-sm text-green-800">{bill.approvalComments}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bill Information */}
        <Card>
          <CardHeader>
            <CardTitle>Bill Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bill Number:</span>
                <span className="font-medium">{bill.billNo}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Agreement Number:</span>
                <span className="font-medium">{bill.contract.agreementNo}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Measurement Date:</span>
                <span className="font-medium">
                  {format(new Date(bill.dateOfMeasurement), 'dd MMM yyyy')}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Quarter:</span>
                <Badge variant="outline">{bill.quarter}</Badge>
              </div>

              {bill.zone && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Railway Zone:</span>
                  <span className="font-medium">{bill.zone} ({getSteelCityForZone(bill.zone)})</span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-muted-foreground">Fuel (Diesel) Basis:</span>
                <Badge variant={bill.fuelPriceType === 'zone_city' ? 'default' : 'outline'}>
                  {bill.fuelPriceType === 'zone_city' && bill.zone
                    ? `Zone City (${getSteelCityForZone(bill.zone)})`
                    : 'Average of 4 Cities'}
                </Badge>
              </div>

              {bill.isExtension && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Extension Status:</span>
                  <Badge variant="default">Extension Period</Badge>
                </div>
              )}

              <div className="flex justify-between pt-2 border-t">
                <span className="text-muted-foreground">Bill Amount:</span>
                <span className="font-semibold flex items-center gap-1">
                  <IndianRupee size={14} />
                  {bill.billAmount?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0.00'}
                </span>
              </div>

              {bill.pvcCalculation && (
                <div className="flex justify-between pt-2 border-t">
                  <span className="text-muted-foreground font-medium">Total PVC Amount:</span>
                  <span className="text-lg font-bold text-blue-600 flex items-center gap-1">
                    <IndianRupee size={16} />
                    {calculateTotalPvc(bill.classificationEntries, bill.pvcCalculation, indicesData, bill).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Contractor & Approval Information */}
        <Card>
          <CardHeader>
            <CardTitle>Contractor & Approval Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 text-sm">
              <div className="flex items-start gap-2">
                <Building size={16} className="mt-0.5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-muted-foreground text-xs mb-1">Contractor Name</p>
                  <p className="font-medium">
                    {bill.contract.user.companyName || bill.contract.user.name || 'N/A'}
                  </p>
                  <p className="text-xs text-muted-foreground">{bill.contract.user.email}</p>
                </div>
              </div>

              {bill.submittedAt && (
                <div className="flex items-start gap-2 pt-2 border-t">
                  <Calendar size={16} className="mt-0.5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-muted-foreground text-xs mb-1">Submitted At</p>
                    <p className="font-medium">
                      {format(toISTDate(new Date(bill.submittedAt)), 'dd MMM yyyy, hh:mm a')}
                    </p>
                  </div>
                </div>
              )}

              {bill.approvedAt && bill.approvedByUser && (
                <>
                  <div className="flex items-start gap-2 pt-2 border-t">
                    <Calendar size={16} className="mt-0.5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-muted-foreground text-xs mb-1">Approved At</p>
                      <p className="font-medium">
                        {format(toISTDate(new Date(bill.approvedAt)), 'dd MMM yyyy, hh:mm a')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <User size={16} className="mt-0.5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-muted-foreground text-xs mb-1">Approved By</p>
                      <p className="font-medium">{bill.approvedByUser.name}</p>
                      <div className="flex gap-2 mt-1">
                        {bill.approvedByUser.designation && (
                          <Badge variant="secondary" className="text-xs">
                            {bill.approvedByUser.designation}
                          </Badge>
                        )}
                        {bill.approvedByUser.department && (
                          <Badge variant="secondary" className="text-xs">
                            {bill.approvedByUser.department}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contract Details */}
      <Card>
        <CardHeader>
          <CardTitle>Contract Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Work Description</p>
              <p className="text-sm font-medium">{bill.contract.workDescription || 'N/A'}</p>
            </div>
            
            <div>
              <p className="text-xs text-muted-foreground mb-1">Tender Advertised Value</p>
              <p className="text-sm font-semibold flex items-center gap-1">
                <IndianRupee size={14} />
                {bill.contract.tenderAdvertisedValue?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || 'N/A'}
              </p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-1">Agreement Value</p>
              <p className="text-sm font-semibold flex items-center gap-1">
                <IndianRupee size={14} />
                {bill.contract.agreementValue?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || 'N/A'}
              </p>
            </div>

            {bill.contract.contractorName && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Firm Name</p>
                <p className="text-sm font-medium">{bill.contract.contractorName}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Classifications */}
      {bill.classificationEntries && bill.classificationEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Work Classifications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {bill.classificationEntries.map((entry: any, index: number) => {
                const classComp = entry.subClassification || entry.classification;
                return (
                <div key={entry.id} className="p-3 bg-muted rounded-md">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-medium text-sm">
                        {entry.itemNumber && (
                          <span className="text-blue-700 mr-2">[{entry.itemNumber}]</span>
                        )}
                        {classComp?.code} - {classComp?.name}
                      </p>
                      {entry.scheduleItem && (
                        <p className="text-xs text-violet-600 mt-1 font-medium">📋 {entry.scheduleItem}</p>
                      )}
                      {entry.description && (
                        <p className="text-xs text-muted-foreground mt-1">{entry.description}</p>
                      )}
                      {/* Show item rows if available, else show legacy single qty/rate */}
                      {entry.itemRows && Array.isArray(entry.itemRows) && entry.itemRows.length > 0 ? (
                        <div className="mt-1.5 space-y-0.5">
                          {entry.itemRows.map((row: any, ri: number) => {
                            const rQty = parseFloat(String(row.quantity)) || 0;
                            const rRate = parseFloat(String(row.agreementRate)) || 0;
                            const rAmt = rQty > 0 && rRate > 0 ? rQty * rRate : 0;
                            return (
                              <div key={ri} className="flex items-center gap-3 text-xs text-muted-foreground">
                                {row.itemNumber && <span className="text-blue-600">[{row.itemNumber}]</span>}
                                {rQty > 0 && <span>Qty: <span className="font-medium text-foreground">{rQty.toLocaleString('en-IN', { maximumFractionDigits: 4 })}</span></span>}
                                {rRate > 0 && <span>Rate: <span className="font-medium text-foreground">₹{rRate.toLocaleString('en-IN', { maximumFractionDigits: 5 })}</span></span>}
                                {rAmt > 0 && <span className="text-green-700">= ₹{rAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
                              </div>
                            );
                          })}
                        </div>
                      ) : (entry.quantity || entry.agreementRate) ? (
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                          {entry.quantity != null && entry.quantity !== 0 && (
                            <span>Qty: <span className="font-medium text-foreground">{Number(entry.quantity).toLocaleString('en-IN', { maximumFractionDigits: 4 })}</span></span>
                          )}
                          {entry.agreementRate != null && entry.agreementRate !== 0 && (
                            <span>Rate: <span className="font-medium text-foreground">₹{Number(entry.agreementRate).toLocaleString('en-IN', { maximumFractionDigits: 5 })}</span></span>
                          )}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3">
                      {classComp && (
                        <ClassificationComparisonDialog
                          currentClassification={classComp}
                          entryAmount={parseFloat(String(entry.amount)) || 0}
                          indicesData={indicesData}
                        />
                      )}
                      <div className="text-right">
                        <p className="font-semibold flex items-center gap-1">
                          <IndianRupee size={14} />
                          {entry.amount?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0.00'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* PVC Calculation Details */}
      {bill.pvcCalculation && (
        <Card>
          <CardHeader>
            <CardTitle>PVC Calculation Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* 1. Extension Compliance Info */}
              {bill.pvcCalculation?.isExtensionPeriod && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Extension Compliance (GCC Clause {bill.pvcCalculation.extensionType})
                  </p>
                  <div className="grid gap-2 text-sm">
                    <div className="flex justify-between items-center p-2 bg-muted rounded-md">
                      <span className="text-muted-foreground">Extension Type:</span>
                      <Badge variant="outline">{bill.pvcCalculation.extensionType || 'N/A'}</Badge>
                    </div>
                    
                    {bill.pvcCalculation?.isIndexCapped && (
                      <>
                        <div className="flex justify-between items-center p-2 bg-muted rounded-md">
                          <span className="text-muted-foreground">Index Status:</span>
                          <Badge variant="destructive">Capped</Badge>
                        </div>
                        
                        {bill.pvcCalculation?.indexCapDate && (
                          <div className="flex justify-between items-center p-2 bg-muted rounded-md">
                            <span className="text-muted-foreground">Cap Date:</span>
                            <span className="font-medium">
                              {format(new Date(bill.pvcCalculation.indexCapDate), 'MMM yyyy')}
                            </span>
                          </div>
                        )}

                        {bill.pvcCalculation?.pvcSavingsDueToRestriction != null && 
                         bill.pvcCalculation.pvcSavingsDueToRestriction > 0 && (
                          <div className="flex justify-between items-center p-2 bg-orange-50 dark:bg-orange-950/20 rounded-md">
                            <span className="text-muted-foreground">PVC Savings (Due to Cap):</span>
                            <span className="font-semibold text-orange-600 flex items-center gap-1">
                              <IndianRupee size={14} />
                              {bill.pvcCalculation.pvcSavingsDueToRestriction.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* 2. Component-wise PVC Table - matches PDF report format */}
              <div className={`space-y-3 ${bill.pvcCalculation?.isExtensionPeriod ? 'pt-3 border-t' : ''}`}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Component-wise PVC (from Work Classifications)
                </p>
                <ComponentPvcTable 
                  classificationEntries={bill.classificationEntries}
                  billAmount={bill.billAmount}
                  pvcCalculation={bill.pvcCalculation}
                  bill={bill}
                  indicesData={indicesData}
                />
              </div>

              {/* 3. Dedicated Components (85% calculations) */}
              {(bill.pvcCalculation?.dedicatedCementPvc != null && bill.pvcCalculation.dedicatedCementPvc !== 0) ||
               (bill.pvcCalculation?.dedicatedSteelTmtBarsPvc != null && bill.pvcCalculation.dedicatedSteelTmtBarsPvc !== 0) ||
               (bill.pvcCalculation?.dedicatedSteelAngleChannelPvc != null && bill.pvcCalculation.dedicatedSteelAngleChannelPvc !== 0) ||
               (bill.pvcCalculation?.dedicatedSteelPlatesPvc != null && bill.pvcCalculation.dedicatedSteelPlatesPvc !== 0) ||
               (bill.pvcCalculation?.dedicatedSteelOtherSectionsPvc != null && bill.pvcCalculation.dedicatedSteelOtherSectionsPvc !== 0) ? (
                <div className="space-y-2 pt-3 border-t">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Dedicated Components (85% Calculations)
                  </p>
                  <div className="grid gap-2">
                    {bill.pvcCalculation?.dedicatedCementPvc != null && bill.pvcCalculation.dedicatedCementPvc !== 0 && (
                      <div className="flex justify-between items-center p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-md">
                        <span className="text-sm font-medium">Dedicated Cement (85%)</span>
                        <span className="text-sm font-semibold flex items-center gap-1">
                          <IndianRupee size={14} />
                          {bill.pvcCalculation.dedicatedCementPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}

                    {bill.pvcCalculation?.dedicatedSteelTmtBarsPvc != null && bill.pvcCalculation.dedicatedSteelTmtBarsPvc !== 0 && (
                      <div className="flex justify-between items-center p-3 bg-violet-50 dark:bg-violet-950/20 rounded-md">
                        <span className="text-sm font-medium">Dedicated Steel TMT Bars (85%)</span>
                        <span className="text-sm font-semibold flex items-center gap-1">
                          <IndianRupee size={14} />
                          {bill.pvcCalculation.dedicatedSteelTmtBarsPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}

                    {bill.pvcCalculation?.dedicatedSteelAngleChannelPvc != null && bill.pvcCalculation.dedicatedSteelAngleChannelPvc !== 0 && (
                      <div className="flex justify-between items-center p-3 bg-violet-50 dark:bg-violet-950/20 rounded-md">
                        <span className="text-sm font-medium">Dedicated Steel Angle/Channel (85%)</span>
                        <span className="text-sm font-semibold flex items-center gap-1">
                          <IndianRupee size={14} />
                          {bill.pvcCalculation.dedicatedSteelAngleChannelPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}

                    {bill.pvcCalculation?.dedicatedSteelPlatesPvc != null && bill.pvcCalculation.dedicatedSteelPlatesPvc !== 0 && (
                      <div className="flex justify-between items-center p-3 bg-violet-50 dark:bg-violet-950/20 rounded-md">
                        <span className="text-sm font-medium">Dedicated Steel Plates (85%)</span>
                        <span className="text-sm font-semibold flex items-center gap-1">
                          <IndianRupee size={14} />
                          {bill.pvcCalculation.dedicatedSteelPlatesPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}

                    {bill.pvcCalculation?.dedicatedSteelOtherSectionsPvc != null && bill.pvcCalculation.dedicatedSteelOtherSectionsPvc !== 0 && (
                      <div className="flex justify-between items-center p-3 bg-violet-50 dark:bg-violet-950/20 rounded-md">
                        <span className="text-sm font-medium">Dedicated Steel Other Sections (85%)</span>
                        <span className="text-sm font-semibold flex items-center gap-1">
                          <IndianRupee size={14} />
                          {bill.pvcCalculation.dedicatedSteelOtherSectionsPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {/* 4. Cement Formula Table */}
              {(bill.pvcCalculation?.dedicatedCementPvc != null && bill.pvcCalculation.dedicatedCementPvc !== 0) && indicesData && (
                <div className="space-y-2 pt-3 border-t">
                  <h4 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    Cement Component Formula
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-border">
                      <thead>
                        <tr className="bg-emerald-50 dark:bg-emerald-950/20">
                          <th className="border border-border px-4 py-2.5 text-left text-sm font-semibold">Component</th>
                          <th className="border border-border px-4 py-2.5 text-left text-sm font-semibold">Formula</th>
                          <th className="border border-border px-4 py-2.5 text-right text-sm font-semibold">PVC Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="hover:bg-muted/50">
                          <td className="border border-border px-4 py-2.5 text-sm font-medium">
                            Dedicated Cement (85%)
                          </td>
                          <td className="border border-border px-4 py-2.5 text-sm font-mono text-xs">
                            {bill.cementAmount?.toLocaleString('en-IN')} × [(
                            {indicesData.current['RBI Cement']?.toFixed(2)} - {indicesData.base['RBI Cement']?.toFixed(2)}) ÷ {indicesData.base['RBI Cement']?.toFixed(2)}] × 85%
                          </td>
                          <td className="border border-border px-4 py-2.5 text-sm text-right font-semibold">
                            {bill.pvcCalculation.dedicatedCementPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 5. Steel Formula Table */}
              {(
                (bill.pvcCalculation?.dedicatedSteelTmtBarsPvc != null && bill.pvcCalculation.dedicatedSteelTmtBarsPvc !== 0) ||
                (bill.pvcCalculation?.dedicatedSteelAngleChannelPvc != null && bill.pvcCalculation.dedicatedSteelAngleChannelPvc !== 0) ||
                (bill.pvcCalculation?.dedicatedSteelPlatesPvc != null && bill.pvcCalculation.dedicatedSteelPlatesPvc !== 0) ||
                (bill.pvcCalculation?.dedicatedSteelOtherSectionsPvc != null && bill.pvcCalculation.dedicatedSteelOtherSectionsPvc !== 0)
              ) && indicesData && (
                <div className="space-y-2 pt-3 border-t">
                  <h4 className="text-sm font-semibold text-violet-700 dark:text-violet-400">
                    Steel Components Formula
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-border">
                      <thead>
                        <tr className="bg-violet-50 dark:bg-violet-950/20">
                          <th className="border border-border px-4 py-2.5 text-left text-sm font-semibold">Component</th>
                          <th className="border border-border px-4 py-2.5 text-left text-sm font-semibold">Formula</th>
                          <th className="border border-border px-4 py-2.5 text-right text-sm font-semibold">PVC Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bill.pvcCalculation?.dedicatedSteelTmtBarsPvc != null && bill.pvcCalculation.dedicatedSteelTmtBarsPvc !== 0 && (
                          <tr className="hover:bg-muted/50">
                            <td className="border border-border px-4 py-2.5 text-sm font-medium">
                              Dedicated Steel TMT Bars (85%)
                            </td>
                            <td className="border border-border px-4 py-2.5 text-sm font-mono text-xs">
                              {bill.steelTmtBarsAmount?.toLocaleString('en-IN')} × [(
                              {indicesData.current['Steel TMT Bars']?.toFixed(2)} - {indicesData.base['Steel TMT Bars']?.toFixed(2)}) ÷ {indicesData.base['Steel TMT Bars']?.toFixed(2)}] × 85%
                            </td>
                            <td className="border border-border px-4 py-2.5 text-sm text-right font-semibold">
                              {bill.pvcCalculation.dedicatedSteelTmtBarsPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        )}

                        {bill.pvcCalculation?.dedicatedSteelAngleChannelPvc != null && bill.pvcCalculation.dedicatedSteelAngleChannelPvc !== 0 && (
                          <tr className="hover:bg-muted/50">
                            <td className="border border-border px-4 py-2.5 text-sm font-medium">
                              Dedicated Steel Angle/Channel (85%)
                            </td>
                            <td className="border border-border px-4 py-2.5 text-sm font-mono text-xs">
                              {bill.steelAngleChannelAmount?.toLocaleString('en-IN')} × [(
                              {indicesData.current['Steel Angle/Channel']?.toFixed(2)} - {indicesData.base['Steel Angle/Channel']?.toFixed(2)}) ÷ {indicesData.base['Steel Angle/Channel']?.toFixed(2)}] × 85%
                            </td>
                            <td className="border border-border px-4 py-2.5 text-sm text-right font-semibold">
                              {bill.pvcCalculation.dedicatedSteelAngleChannelPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        )}

                        {bill.pvcCalculation?.dedicatedSteelPlatesPvc != null && bill.pvcCalculation.dedicatedSteelPlatesPvc !== 0 && (
                          <tr className="hover:bg-muted/50">
                            <td className="border border-border px-4 py-2.5 text-sm font-medium">
                              Dedicated Steel Plates (85%)
                            </td>
                            <td className="border border-border px-4 py-2.5 text-sm font-mono text-xs">
                              {bill.steelPlatesAmount?.toLocaleString('en-IN')} × [(
                              {indicesData.current['Steel Plates']?.toFixed(2)} - {indicesData.base['Steel Plates']?.toFixed(2)}) ÷ {indicesData.base['Steel Plates']?.toFixed(2)}] × 85%
                            </td>
                            <td className="border border-border px-4 py-2.5 text-sm text-right font-semibold">
                              {bill.pvcCalculation.dedicatedSteelPlatesPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        )}

                        {bill.pvcCalculation?.dedicatedSteelOtherSectionsPvc != null && bill.pvcCalculation.dedicatedSteelOtherSectionsPvc !== 0 && (
                          <tr className="hover:bg-muted/50">
                            <td className="border border-border px-4 py-2.5 text-sm font-medium">
                              Dedicated Steel Other Sections (85%)
                            </td>
                            <td className="border border-border px-4 py-2.5 text-sm font-mono text-xs">
                              {bill.steelOtherSectionsAmount?.toLocaleString('en-IN')} × [(
                              {indicesData.current['Steel Other Sections']?.toFixed(2)} - {indicesData.base['Steel Other Sections']?.toFixed(2)}) ÷ {indicesData.base['Steel Other Sections']?.toFixed(2)}] × 85%
                            </td>
                            <td className="border border-border px-4 py-2.5 text-sm text-right font-semibold">
                              {bill.pvcCalculation.dedicatedSteelOtherSectionsPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 6. Detailed Monthly Indices Table */}
              {detailedMonthlyData && (
                <div className="space-y-3 pt-3 border-t">
                  <h3 className="text-base font-bold uppercase tracking-wide">
                    DETAILED MONTHLY PRICE INDICES
                  </h3>
                  <DetailedMonthlyIndicesTable 
                    classificationEntries={bill.classificationEntries}
                    detailedMonthlyData={detailedMonthlyData}
                    contract={bill.contract}
                    bill={bill}
                  />
                </div>
              )}

              {/* 7. Total PVC */}
              <div className="flex justify-between items-center p-4 bg-primary/10 rounded-md border-2 border-primary/20 mt-4">
                <span className="text-base font-bold">Total PVC Amount</span>
                <span className="text-lg font-bold text-primary flex items-center gap-1">
                  <IndianRupee size={18} />
                  {calculateTotalPvc(bill.classificationEntries, bill.pvcCalculation, indicesData, bill).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Approval History */}
      <ApprovalHistory billId={bill.id} />
    </div>
  );
}
