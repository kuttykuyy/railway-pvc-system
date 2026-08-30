'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PromoMarquee } from '@/components/promo-banner';
import { ShortfallAudit } from '@/components/shortfall-audit';
import { SourceDocuments } from '@/components/documents/source-documents';
import { BillStatusBadge } from '@/components/bills/bill-status-badge';
import { ApprovalActions } from '@/components/bills/approval-actions';
import { ApprovalWorkflowStatus } from '@/components/bills/approval-workflow-status';
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
  MessageCircle,
  TrendingUp,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  Clock,
  ChevronRight,
  ShieldCheck,
  Briefcase,
  Layers,
  MapPin,
  Flame,
  Info
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
import { resolvePre2022Setup } from '@/lib/pre2022-contract';

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

  // Determine which components are actually used (have non-zero percentages in classifications or dedicated amounts)
  const usedComponents = allComponents.filter(({ key, indexName }) => {
    // For individual steel types: check bill's steelTypes selection or dedicated amounts
    const steelIndexNames = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
    if (steelIndexNames.includes(indexName)) {
      if (usedSteelIndexNames.has(indexName)) return true;
      const steelUsedInClassification = classificationEntries.some((entry) => {
        const classification = entry.subClassification || entry.classification;
        return classification && classification['steel'] != null && classification['steel'] > 0;
      });
      if (steelUsedInClassification && usedSteelIndexNames.size === 0) return true;
      if (indexName === 'Steel TMT Bars' && bill?.steelTmtBarsAmount > 0) return true;
      if (indexName === 'Steel Angle/Channel' && bill?.steelAngleChannelAmount > 0) return true;
      if (indexName === 'Steel Plates' && bill?.steelPlatesAmount > 0) return true;
      if (indexName === 'Steel Other Sections' && bill?.steelOtherSectionsAmount > 0) return true;
      return false;
    }

    if (key === 'cement' && hasDedicatedCement) return true;

    const usedInClassification = classificationEntries.some((entry) => {
      const classification = entry.subClassification || entry.classification;
      return classification && classification[key] != null && classification[key] > 0;
    });
    
    return usedInClassification;
  });

  if (usedComponents.length === 0) {
    return null;
  }

  const steelComponents = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
  const steelColumnsCount = usedComponents.filter(comp => 
    steelComponents.includes(comp.indexName)
  ).length;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm bg-white dark:bg-slate-900">
        <table className="w-full border-collapse text-sm">
          <thead>
            {steelColumnsCount > 0 && (
              <tr className="bg-gradient-to-r from-slate-900 to-emerald-950 text-white">
                <th className="border-b border-slate-200 dark:border-slate-800 px-4 py-2.5 text-left font-bold sticky left-0 bg-slate-900 z-10"></th>
                {usedComponents.map(({ indexName }) => {
                  if (steelComponents.includes(indexName)) {
                    return (
                      <th key={`zone-${indexName}`} className="border-b border-slate-200 dark:border-slate-800 px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-emerald-200">
                        Steel Component
                      </th>
                    );
                  }
                  return (
                    <th key={`zone-${indexName}`} className="border-b border-slate-200 dark:border-slate-800 px-3 py-2"></th>
                  );
                })}
              </tr>
            )}
            <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-800">
              <th className="px-4 py-3 text-left font-semibold sticky left-0 bg-slate-100 dark:bg-slate-800 z-10">
                Period
              </th>
              {usedComponents.map(({ name, indexName }) => {
                return (
                  <th key={indexName} className="px-3 py-3 text-center font-semibold whitespace-pre-wrap" style={{ minWidth: '120px' }}>
                    {name}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {detailedMonthlyData.map((row, idx) => {
              if (row.type === 'quarter_header') {
                return (
                  <tr key={`quarter-${idx}`} className="bg-slate-50/80 dark:bg-slate-800/30">
                    <td 
                      colSpan={usedComponents.length + 1} 
                      className="px-4 py-2.5 font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400"
                    >
                      {row.label}
                    </td>
                  </tr>
                );
              } else if (row.type === 'base') {
                return (
                  <tr key="base" className="bg-emerald-50/30 dark:bg-emerald-950/10 font-medium">
                    <td className="px-4 py-3 font-semibold text-emerald-700 dark:text-emerald-400 sticky left-0 bg-emerald-50/30 dark:bg-emerald-950/10 backdrop-blur-sm">
                      {row.label}
                    </td>
                    {usedComponents.map(({ indexName }) => (
                      <td key={indexName} className="px-3 py-3 text-center font-semibold text-emerald-600 dark:text-emerald-400">
                        {row.values[indexName] != null ? row.values[indexName].toFixed(2) : '-'}
                      </td>
                    ))}
                  </tr>
                );
              } else if (row.type === 'quarter_avg') {
                return (
                  <tr key={`avg-${idx}`} className={`${row.isMeasurementQuarter ? 'bg-emerald-500/10 dark:bg-emerald-500/10 font-bold text-emerald-800 dark:text-emerald-400' : 'bg-amber-500/5 dark:bg-amber-500/5 font-semibold text-amber-800 dark:text-amber-400'}`}>
                    <td className={`px-4 py-3 sticky left-0 ${row.isMeasurementQuarter ? 'bg-emerald-500/10 dark:bg-emerald-950/20' : 'bg-amber-500/5 dark:bg-amber-950/20'}`}>
                      {row.label}
                    </td>
                    {usedComponents.map(({ indexName }) => (
                      <td key={indexName} className="px-3 py-3 text-center">
                        {row.values[indexName] != null ? row.values[indexName].toFixed(2) : '-'}
                      </td>
                    ))}
                  </tr>
                );
              } else if (row.type === 'month') {
                return (
                  <tr key={`month-${idx}`} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${row.isMeasurementQuarter ? 'bg-emerald-500/5 dark:bg-emerald-500/5' : ''}`}>
                    <td className={`px-4 py-3 sticky left-0 bg-white dark:bg-slate-900 ${row.isMeasurementQuarter ? 'font-medium text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}`}>
                      {row.label}{row.isMeasurementQuarter ? ' [Meas. Month]' : ''}
                    </td>
                    {usedComponents.map(({ indexName }) => (
                      <td key={indexName} className="px-3 py-3 text-center text-slate-700 dark:text-slate-300">
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

  const steelTypeMap: { [key: string]: string } = {
    'TMT': 'Steel TMT Bars',
    'ANGLE_CHANNEL': 'Steel Angle/Channel',
    'PLATES': 'Steel Plates',
    'OTHER_SECTIONS': 'Steel Other Sections'
  };

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

  const getInMemoryIndices = (indexName: string | null, steelTypes?: string[]) => {
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
    
    if (indexName.startsWith('MPNG Fuel')) {
      return resolveFuelFromIndices(indicesData, indexName);
    }
    
    return {
      base: indicesData.base[indexName] || 0,
      current: indicesData.current[indexName] || 0
    };
  };

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
          ? getInMemoryIndices(indexName, entrySteelTypes)
          : getInMemoryIndices(indexName);
          
        const baseIndex = Math.round(indices.base * 100) / 100;
        const currentIndex = Math.round(indices.current * 100) / 100;

        if (baseIndex === 0) continue;
        classificationPvcTotal += entryAmount * ((currentIndex - baseIndex) / baseIndex) * (percentage / 100);
      }
    }
  } else if (classificationEntries && classificationEntries.length > 0) {
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

  const steelTypeMap: { [key: string]: string } = {
    'TMT': 'Steel TMT Bars',
    'ANGLE_CHANNEL': 'Steel Angle/Channel',
    'PLATES': 'Steel Plates',
    'OTHER_SECTIONS': 'Steel Other Sections'
  };

  const getIndices = (indexName: string | null, steelTypes?: string[]) => {
    if (!indexName || !indicesData) return { base: 0, current: 0 };
    
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
        const avgBase = selectedSteelIndices.reduce((sum, idx) => sum + idx.base, 0) / selectedSteelIndices.length;
        const avgCurrent = selectedSteelIndices.reduce((sum, idx) => sum + idx.current, 0) / selectedSteelIndices.length;
        return { base: avgBase, current: avgCurrent };
      }
    }
    
    if (indexName.startsWith('MPNG Fuel')) {
      return resolveFuelFromIndices(indicesData, indexName);
    }
    
    return {
      base: indicesData.base[indexName] || 0,
      current: indicesData.current[indexName] || 0
    };
  };

  if (!classificationEntries || classificationEntries.length === 0) {
    return <p className="text-sm text-muted-foreground p-4 bg-slate-50 rounded-xl">No classification entries available</p>;
  }

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
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 gap-2">
        <div>
          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
            Per-Classification Breakdown
          </h4>
          <p className="text-xs text-muted-foreground">
            Formulas, indices and calculation paths for every scheduled item classification
          </p>
        </div>
      </div>

      {classificationEntries.map((entry, entryIndex) => {
        const entryAmount = parseFloat(String(entry.amount)) || 0;
        if (entryAmount <= 0) return null;

        const classification = entry.subClassification || entry.classification;
        if (!classification) return null;

        const classCode = classification.code;
        const className = classification.name;
        
        const componentRows: Array<{
          componentName: string;
          percentage: number;
          formula: string;
          pvcAmount: number;
          isFixed?: boolean;
        }> = [];

        let classificationTotal = 0;
        const entrySteelTypes = entry.steelTypes && Array.isArray(entry.steelTypes) ? entry.steelTypes : [];

        Object.entries(componentMap).forEach(([key, { name: componentName, indexName }]) => {
          const percentage = classification[key];
          
          if (!percentage || percentage <= 0) return;

          if (key === 'fixed') {
            componentRows.push({
              componentName,
              percentage,
              formula: 'Non-escalable Fixed base proportion',
              pvcAmount: 0,
              isFixed: true
            });
            return;
          }

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
          <div key={entry.id || entryIndex} className="border border-slate-150 dark:border-slate-800 rounded-2xl p-5 bg-slate-50/50 dark:bg-slate-900/40 backdrop-blur-sm shadow-sm transition-all duration-300 hover:shadow-md">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 pb-3 border-b border-slate-200/60 dark:border-slate-800 gap-3">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 p-2 rounded-xl text-xs font-bold">
                  #{entryIndex + 1}
                </div>
                <div>
                  <h5 className="font-bold text-slate-800 dark:text-slate-200">
                    {classCode} — {className}
                  </h5>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                    Allocated Amount: ₹ {entryAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200/80 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-b border-slate-200/80 dark:border-slate-800">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Component</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Formula / Factors</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider">PVC Contribution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {componentRows.map((row, rIdx) => (
                    <tr key={rIdx} className={row.isFixed ? 'bg-slate-50/55 dark:bg-slate-800/10 text-slate-400' : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/20'}>
                      <td className="px-4 py-3 font-semibold">
                        {row.componentName} <span className="font-mono text-slate-400 font-normal">({row.percentage}%)</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400 break-all max-w-[400px]">
                        {row.formula}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-semibold ${row.isFixed ? 'text-slate-400' : row.pvcAmount < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {row.pvcAmount < 0 ? '-' : ''}₹{Math.abs(row.pvcAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-100/70 dark:bg-slate-800/60 font-bold text-slate-800 dark:text-slate-200 border-t border-slate-200/80 dark:border-slate-800">
                    <td colSpan={2} className="px-4 py-3 text-right text-xs uppercase tracking-wider">
                      Classification {classCode} Subtotal:
                    </td>
                    <td className={`px-4 py-3 text-right font-mono text-sm ${classificationTotal < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {classificationTotal < 0 ? '-' : ''}₹{Math.abs(classificationTotal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {classificationEntries.length > 1 && (
        <div className="bg-gradient-to-r from-slate-900 to-emerald-950 text-white rounded-2xl p-4 shadow-md flex justify-between items-center mt-6">
          <span className="text-xs uppercase tracking-widest text-emerald-300 font-bold">Sum of Classifications:</span>
          <span className="font-mono font-bold text-lg text-emerald-400">
            {grandTotalPvc < 0 ? '-' : ''}₹{Math.abs(grandTotalPvc).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      )}
    </div>
  );
}

export function BillDetailClient({ bill, user, indicesData, monthlyIndicesData, detailedMonthlyData }: BillDetailClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  // Which price variation clause governs. Derived from the contract itself, so this
  // needs no fetch and cannot disagree with what the statement prints.
  const pre2022Setup = resolvePre2022Setup(bill.contract as any);
  const [isDownloading, setIsDownloading] = useState(false);
  const [defaultTemplate, setDefaultTemplate] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  // Detailed format is hidden from the UI; IR Standard is the only downloadable report.
  const [pdfFormat] = useState<'detailed' | 'ir_standard'>('ir_standard');
  const [includeIndexDocs, setIncludeIndexDocs] = useState(true);
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

  // A readable, Windows-safe file name. So a folder of downloads reads as
  // "PVC Statement - GNKUMAR INDUSTRIES - Bill B7 - Q3-2024.pdf" instead of an opaque
  // "PVC_Report_SR_MDU_..._2026-08-30.pdf". Illegal filename characters (\ / : * ? " < >
  // |) are stripped, runs of space/underscore collapsed, and each part length-capped.
  const buildPdfName = (kind: 'Statement' | 'Summary') => {
    const clean = (s: string, cap = 48) =>
      (s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/[\s_]+/g, ' ').trim().slice(0, cap).trim();
    // The bill number usually ends in the CC-bill part (…/B7, …/B1-111) — the tail is
    // what distinguishes bills of one contract, so lead the label with it.
    const billTail = (() => {
      const parts = (bill.billNo || '').split('/').filter(Boolean);
      const tail = parts.length ? parts[parts.length - 1] : bill.billNo;
      return clean(tail, 24);
    })();
    const parts = [
      `PVC ${kind}`,
      clean(bill.contract?.contractorName, 40),
      billTail ? `Bill ${billTail}` : '',
      clean(bill.quarter, 16),
    ].filter(Boolean);
    return `${parts.join(' - ')}.pdf`;
  };

  const handleDownloadPDF = async () => {
    try {
      setIsDownloading(true);
      
      let url = `/api/bills/${bill.id}/pdf-report`;
      const params = new URLSearchParams();
      if (selectedTemplateId && selectedTemplateId !== defaultTemplate?.id) params.set('templateId', selectedTemplateId);
      if (pdfFormat === 'ir_standard') params.set('format', 'ir_standard');
      if (!includeIndexDocs) params.set('includeDocs', '0');
      if (params.toString()) url += `?${params.toString()}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = buildPdfName('Statement');
      document.body.appendChild(a);
      a.click();
      
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

  // One-page plain-language summary for the department (accounts / executive) user.
  const handleDownloadSummary = async () => {
    try {
      setIsDownloading(true);
      const response = await fetch(`/api/bills/${bill.id}/simple-report`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate summary');
      }
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = buildPdfName('Summary');
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
      toast({ title: 'Downloaded', description: 'Plain one-page summary downloaded.' });
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'Failed to download summary.', variant: 'destructive' });
    } finally {
      setIsDownloading(false);
    }
  };

  const grandTotalCalculated = calculateTotalPvc(bill.classificationEntries, bill.pvcCalculation, indicesData, bill);
  const isPvcNegative = grandTotalCalculated < 0;

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl">
      {/* While a report is being built, a full-screen wait state — with the tools
          marquee, since the PDF takes a few seconds and this is a natural moment for it. */}
      {isDownloading && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl rounded-2xl border border-emerald-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex flex-col items-center gap-3 px-6 pt-7 pb-5">
              <div className="h-11 w-11 rounded-full border-[3px] border-emerald-200 border-t-emerald-600 animate-spin" aria-hidden />
              <div className="text-center">
                <p className="text-base font-bold text-slate-900">Building your report…</p>
                <p className="text-[13px] text-slate-500 mt-0.5">Compiling the PVC statement and index sheets. This takes a few seconds.</p>
              </div>
            </div>
            <div className="border-t border-emerald-100 bg-emerald-50/60">
              <div className="px-5 pt-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-700">From the makers of IR-PVC</span>
              </div>
              <PromoMarquee fadeColor="rgba(240,253,244,0.95)" />
            </div>
          </div>
        </div>
      )}

      {/* 1. Header with glassmorphism */}
      <div className="backdrop-blur-md bg-white/70 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80 shadow-lg rounded-3xl p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-5 transition-all duration-300">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => router.back()}
            className="h-11 w-11 rounded-xl shadow-sm hover:bg-slate-50 dark:hover:bg-slate-850 border-slate-200 dark:border-slate-800 transition-transform active:scale-95 flex-shrink-0"
          >
            <ArrowLeft size={18} className="text-slate-600 dark:text-slate-300" />
          </Button>
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight truncate">
                {bill.billNo}
              </h1>
              <BillStatusBadge status={bill.status} size="lg" />
            </div>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 font-medium flex items-center gap-2 flex-wrap min-w-0">
              <Briefcase size={14} className="text-emerald-500 flex-shrink-0" />
              <span className="font-semibold text-slate-700 dark:text-slate-300 flex-shrink-0">{bill.contract.agreementNo}</span>
              <span className="text-slate-300 dark:text-slate-700 flex-shrink-0">•</span>
              <span className="truncate max-w-[200px] md:max-w-md">{bill.contract.workDescription}</span>
            </p>
            {/* A contract on the older GCC is priced by a different clause entirely, and
                everything else on this page is computed on GCC April 2022. Said here, at
                the top, because a figure read off the wrong clause looks exactly like a
                right one. */}
            {pre2022Setup.isPre2022 && (
              <a
                href={`/bills/${bill.id}/pre2022`}
                className="inline-flex items-center gap-2 mt-1 text-xs md:text-sm font-semibold text-amber-900 bg-amber-100 border border-amber-300 rounded-md px-3 py-1.5 hover:bg-amber-200"
              >
                <AlertTriangle size={14} className="flex-shrink-0" />
                This contract is on the older GCC — open the correct statement
              </a>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap md:flex-nowrap items-center gap-2.5 pt-3 md:pt-0 border-t border-slate-100 dark:border-slate-800 md:border-none flex-shrink-0 w-full md:w-auto justify-start md:justify-end">

          {/* IR PDF variant: with or without the supporting index documents */}
          <Select value={includeIndexDocs ? 'with_docs' : 'without_docs'} onValueChange={(v) => setIncludeIndexDocs(v === 'with_docs')}>
            <SelectTrigger className="w-[210px] h-11 rounded-xl shadow-sm border-slate-200 dark:border-slate-800">
              <SelectValue placeholder="PDF contents" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="with_docs" className="text-xs">IR PDF + Index Documents</SelectItem>
              <SelectItem value="without_docs" className="text-xs">IR PDF only (no documents)</SelectItem>
            </SelectContent>
          </Select>


          <Button
            variant="outline"
            className="gap-2 rounded-xl h-11 border-slate-200 dark:border-slate-800 hover:bg-slate-50 shadow-sm"
            onClick={handleDownloadPDF}
            disabled={isDownloading}
          >
            <Download size={16} className={isDownloading ? 'animate-bounce' : 'text-slate-500'} />
            {isDownloading ? 'Building...' : 'Download PDF'}
          </Button>

          <Button
            variant="outline"
            className="gap-2 rounded-xl h-11 border-emerald-200 text-emerald-700 hover:bg-emerald-50 shadow-sm"
            onClick={handleDownloadSummary}
            disabled={isDownloading}
            title="A one-page plain-language summary for the department/accounts user"
          >
            <FileText size={16} className="text-emerald-600" />
            1-page summary
          </Button>

          <Button 
            onClick={() => setWhatsAppDialogOpen(true)}
            className="gap-2 rounded-xl h-11 shadow-md bg-emerald-600 hover:bg-emerald-700 text-white transition-all active:scale-95 duration-200"
          >
            <MessageCircle size={16} />
            Share via WhatsApp
          </Button>
        </div>
      </div>

      {/* 2. Premium Hero Overview Cards (Visual Centerpiece) */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Total PVC Hero Card - Dark Glowing Gradient */}
        <div className="bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-950 text-white rounded-3xl p-6 shadow-2xl relative overflow-hidden group hover:scale-[1.02] transition-all duration-300">
          {/* Ambient Glow */}
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full blur-3xl opacity-25 group-hover:opacity-40 transition-opacity duration-300"></div>
          
          <div className="flex justify-between items-start relative z-10">
            <div className="space-y-1">
              <span className="text-xs font-bold text-emerald-300 uppercase tracking-widest">
                Net Price Variation (PVC)
              </span>
              <h2 className={`text-3xl md:text-4xl font-extrabold font-mono tracking-tight flex items-baseline gap-1 mt-2 ${isPvcNegative ? 'text-rose-400' : 'text-emerald-400'}`}>
                {isPvcNegative ? '-' : ''}₹{Math.abs(grandTotalCalculated).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h2>
            </div>
            <div className={`p-3.5 rounded-2xl ${isPvcNegative ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
              <TrendingUp size={22} className={isPvcNegative ? 'rotate-180' : ''} />
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between text-xs text-slate-400 border-t border-white/5 pt-4 relative z-10">
            <span className="font-semibold flex items-center gap-1">
              <Clock size={12} className="text-emerald-400" />
              Escalation Rate:
            </span>
            <span className="font-mono text-white font-bold">
              {bill.billAmount > 0 
                ? `${((grandTotalCalculated / bill.billAmount) * 100).toFixed(2)}%`
                : '0.00%'}
            </span>
          </div>
        </div>

        {/* Bill Amount Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-md hover:shadow-lg transition-all duration-300 hover:scale-[1.01]">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                Agreement Bill Amount
              </span>
              <h2 className="text-3xl font-extrabold font-mono text-slate-800 dark:text-white tracking-tight flex items-baseline gap-1 mt-2">
                ₹{bill.billAmount?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
              </h2>
            </div>
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 text-emerald-500 dark:text-emerald-400">
              <IndianRupee size={22} />
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-4">
            <span className="font-semibold flex items-center gap-1">
              <Layers size={12} className="text-emerald-500" />
              Agreement Value:
            </span>
            <span className="font-mono text-slate-800 dark:text-slate-200 font-bold">
              ₹{bill.contract.agreementValue?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) || '0'}
            </span>
          </div>
        </div>

        {/* Pricing Factors / Details Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-md hover:shadow-lg transition-all duration-300 md:col-span-2 lg:col-span-1">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4 block">
            Pricing Configuration
          </span>
          <div className="space-y-3.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <MapPin size={14} className="text-slate-400" /> Railway Zone
              </span>
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {bill.zone || 'N/A'} {bill.zone && `(${getSteelCityForZone(bill.zone)})`}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Flame size={14} className="text-slate-400" /> Fuel Basis
              </span>
              <Badge variant="secondary" className="font-bold text-xs">
                {bill.fuelPriceType === 'zone_city' && bill.zone
                  ? `Diesel: ${getSteelCityForZone(bill.zone)}`
                  : 'Diesel: 4-City Avg'}
              </Badge>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Calendar size={14} className="text-slate-400" /> Meas. Quarter
              </span>
              <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                {bill.quarter}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Report template banner removed along with the hidden Detailed PDF format. */}

      {/* 3. Approval Actions card */}
      <Card className="border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800/80 px-6 py-4">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <ShieldCheck size={18} className="text-emerald-500" />
            Verification & Approval Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {/* Where the proposal has got to and how it got there. The chain has always
              been recorded; until now nothing showed it, so "approved" gave no hint
              that a second desk still had the bill. */}
          <div className="mb-6">
            <ApprovalWorkflowStatus status={bill.status} history={bill.approvalHistory || []} />
          </div>

          <ApprovalActions
            billId={bill.id}
            billStatus={bill.status}
            userRole={user.role}
            onActionComplete={handleActionComplete}
          />

          {bill.rejectionReason && (
            <div className="mt-5 p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40 rounded-2xl flex gap-3">
              <div className="p-1 rounded-lg bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 flex-shrink-0 h-fit">
                <AlertTriangle size={16} />
              </div>
              <div>
                <p className="text-xs font-bold text-rose-900 dark:text-rose-300 uppercase tracking-wider">Rejection Reason Given:</p>
                <p className="text-sm text-rose-800 dark:text-rose-400 mt-1">{bill.rejectionReason}</p>
              </div>
            </div>
          )}
          
          {bill.approvalComments && bill.status === 'revision_requested' && (
            <div className="mt-5 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-2xl flex gap-3">
              <div className="p-1 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex-shrink-0 h-fit">
                <Info size={16} />
              </div>
              <div>
                <p className="text-xs font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider">Revision Requirements:</p>
                <p className="text-sm text-amber-800 dark:text-amber-400 mt-1">{bill.approvalComments}</p>
              </div>
            </div>
          )}
          
          {bill.approvalComments && bill.status === 'approved' && (
            <div className="mt-5 p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-2xl flex gap-3">
              <div className="p-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex-shrink-0 h-fit">
                <CheckCircle size={16} />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-900 dark:text-emerald-300 uppercase tracking-wider">Approval Comments:</p>
                <p className="text-sm text-emerald-800 dark:text-emerald-400 mt-1">{bill.approvalComments}</p>
              </div>
            </div>
          )}

          {/* Approved by the executive but not yet vetted — worth saying plainly, since
              the contractor otherwise reads "approved" as "on its way to being paid". */}
          {bill.status === 'approved' && (
            <div className="mt-5 p-4 bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-800/40 rounded-2xl flex gap-3">
              <div className="p-1 rounded-lg bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 flex-shrink-0 h-fit">
                <Info size={16} />
              </div>
              <div>
                <p className="text-xs font-bold text-sky-900 dark:text-sky-300 uppercase tracking-wider">With Accounts</p>
                <p className="text-sm text-sky-800 dark:text-sky-400 mt-1">
                  Approved on the executive side. It now sits with the accounts / audit office, who vet it and pass it for payment.
                </p>
              </div>
            </div>
          )}

          {bill.accountsReturnReason && bill.status === 'submitted' && (
            <div className="mt-5 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-2xl flex gap-3">
              <div className="p-1 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex-shrink-0 h-fit">
                <AlertTriangle size={16} />
              </div>
              <div>
                <p className="text-xs font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider">Returned by Accounts:</p>
                <p className="text-sm text-amber-800 dark:text-amber-400 mt-1">{bill.accountsReturnReason}</p>
              </div>
            </div>
          )}

          {bill.status === 'passed_for_payment' && (
            <div className="mt-5 p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-2xl flex gap-3">
              <div className="p-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex-shrink-0 h-fit">
                <CheckCircle size={16} />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-900 dark:text-emerald-300 uppercase tracking-wider">Passed for Payment</p>
                <p className="text-sm text-emerald-800 dark:text-emerald-400 mt-1">
                  Vetted by accounts{bill.passedAt ? ` on ${format(toISTDate(new Date(bill.passedAt)), 'dd MMM yyyy')}` : ''}
                  {bill.passedByUser?.name ? ` by ${bill.passedByUser.name}` : ''}.
                  {bill.passedComments ? ` ${bill.passedComments}` : ''}
                </p>
                {/* What was actually checked. Without this, "passed" records only that a
                    button was pressed — this is what answers a query months later. */}
                {bill.accountsVerification?.verified && (
                  <p className="text-xs text-emerald-700/90 dark:text-emerald-500 mt-1.5">
                    {bill.accountsVerification.verified.length} of{' '}
                    {bill.accountsVerification.verified.length + (bill.accountsVerification.unverified?.length || 0)} checks verified
                    {bill.accountsVerification.unverified?.length
                      ? ` — not ticked: ${bill.accountsVerification.unverified.join(', ').replace(/_/g, ' ')}`
                      : ''}
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. Side-by-Side Details Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bill & Contractor Information Panel */}
        <Card className="border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden flex flex-col justify-between">
          <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800/80 px-6 py-4">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <FileText size={18} className="text-emerald-500" />
              Bill Record Specifications
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 flex-1 flex flex-col justify-between">
            <div className="divide-y divide-slate-100 dark:divide-slate-850 text-sm space-y-4">
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground font-medium">Bill Number</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{bill.billNo}</span>
              </div>
              
              <div className="flex justify-between py-2 pt-4">
                <span className="text-muted-foreground font-medium">Measurement Date</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {format(new Date(bill.dateOfMeasurement), 'dd MMM yyyy')}
                </span>
              </div>

              {bill.isExtension && (
                <div className="flex justify-between py-2 pt-4">
                  <span className="text-muted-foreground font-medium">Extension Mode</span>
                  <Badge variant="destructive" className="font-bold">Escalation Restriction Active</Badge>
                </div>
              )}

              <div className="flex justify-between py-2 pt-4">
                <span className="text-muted-foreground font-medium">Base Month</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {format(new Date(bill.contract.baseMonth), 'MMMM yyyy')}
                </span>
              </div>

              <div className="flex justify-between py-2 pt-4">
                <span className="text-muted-foreground font-medium">Net Subject PVC Sum</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                  {grandTotalCalculated < 0 ? '-' : ''}₹{Math.abs(grandTotalCalculated).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Firm / Contractor Details Card */}
        <Card className="border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden flex flex-col justify-between">
          <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800/80 px-6 py-4">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Building size={18} className="text-emerald-500" />
              Executing Agency Details
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 flex-1 flex flex-col justify-between">
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500">
                  <Building size={16} />
                </div>
                <div>
                  <p className="text-muted-foreground text-xs font-bold uppercase tracking-wide">Contractor/Firm Name</p>
                  <p className="font-bold text-slate-900 dark:text-white mt-0.5">
                    {bill.contract.user.companyName || bill.contract.user.name || 'N/A'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 font-mono">{bill.contract.user.email}</p>
                </div>
              </div>

              {bill.submittedAt && (
                <div className="flex items-start gap-3 pt-3 border-t border-slate-100 dark:border-slate-850">
                  <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500">
                    <Calendar size={16} />
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs font-bold uppercase tracking-wide">Submission Timestamp</p>
                    <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 font-mono">
                      {format(toISTDate(new Date(bill.submittedAt)), 'dd MMM yyyy, hh:mm a')}
                    </p>
                  </div>
                </div>
              )}

              {bill.approvedAt && bill.approvedByUser && (
                <div className="flex items-start gap-3 pt-3 border-t border-slate-100 dark:border-slate-850">
                  <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500">
                    <User size={16} />
                  </div>
                  <div className="flex-1">
                    <p className="text-muted-foreground text-xs font-bold uppercase tracking-wide">Approved Authority</p>
                    <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">{bill.approvedByUser.name}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {bill.approvedByUser.designation && (
                        <Badge variant="secondary" className="text-[10px] font-bold py-0.5">
                          {bill.approvedByUser.designation}
                        </Badge>
                      )}
                      {bill.approvedByUser.department && (
                        <Badge variant="secondary" className="text-[10px] font-bold py-0.5">
                          {bill.approvedByUser.department}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contract Details */}
      <Card className="border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800/80 px-6 py-4">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <Briefcase size={18} className="text-emerald-500" />
            Underlying Agreement Parameters
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div className="lg:col-span-3 pb-3 border-b border-slate-100 dark:border-slate-850">
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-wide">Work Scope Description</p>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-1">{bill.contract.workDescription || 'N/A'}</p>
            </div>
            
            <div className="bg-slate-50 dark:bg-slate-800/20 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-wide">Advertised Value</p>
              <p className="text-lg font-extrabold text-slate-800 dark:text-white mt-1.5 font-mono flex items-center gap-0.5">
                ₹{bill.contract.tenderAdvertisedValue?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || 'N/A'}
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/20 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-wide">Final Agreement Value</p>
              <p className="text-lg font-extrabold text-slate-800 dark:text-white mt-1.5 font-mono flex items-center gap-0.5">
                ₹{bill.contract.agreementValue?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || 'N/A'}
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/20 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-wide">Executing Firm</p>
              <p className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 mt-1.5 truncate">
                {bill.contract.contractorName || 'N/A'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Classifications */}
      {bill.classificationEntries && bill.classificationEntries.length > 0 && (
        <Card className="border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800/80 px-6 py-4">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Layers size={18} className="text-emerald-500" />
              Bill Schedule Items
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              {bill.classificationEntries.map((entry: any, idx: number) => {
                const classComp = entry.subClassification || entry.classification;
                return (
                  <div key={entry.id} className="p-4 border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 bg-slate-50/40 dark:bg-slate-900/30 rounded-2xl transition-all duration-200">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div className="flex-1 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap text-sm font-bold text-slate-800 dark:text-slate-200">
                          {entry.itemNumber && (
                            <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-lg text-xs font-mono font-bold">
                              Item {entry.itemNumber}
                            </span>
                          )}
                          <span>{classComp?.code} — {classComp?.name}</span>
                        </div>
                        
                        {entry.scheduleItem && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                            <span>📋 Schedule:</span>
                            <span className="font-mono bg-emerald-500/5 px-1.5 py-0.5 rounded">{entry.scheduleItem}</span>
                          </p>
                        )}
                        
                        {entry.description && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 p-2.5 rounded-xl">
                            {entry.description}
                          </p>
                        )}

                        {entry.classificationJustification && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 p-2.5 rounded-xl">
                            <span className="font-semibold text-slate-600 dark:text-slate-300">Justification: </span>
                            {entry.classificationJustification}
                          </p>
                        )}

                        {entry.itemRows && Array.isArray(entry.itemRows) && entry.itemRows.length > 0 ? (
                          <div className="mt-2 space-y-1 bg-white/70 dark:bg-slate-900/50 p-2 rounded-xl border border-slate-200/30">
                            {entry.itemRows.map((row: any, rIdx: number) => {
                              const rQty = parseFloat(String(row.quantity)) || 0;
                              const rRate = parseFloat(String(row.agreementRate)) || 0;
                              const rAmt = rQty > 0 && rRate > 0 ? rQty * rRate : 0;
                              return (
                                <div key={rIdx} className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 py-1 px-2 hover:bg-slate-50/50 rounded-lg">
                                  <div className="flex items-center gap-2">
                                    {row.itemNumber && <span className="font-mono text-emerald-600 bg-emerald-500/5 px-1 rounded">[{row.itemNumber}]</span>}
                                    <span>Qty: <strong className="text-slate-700 dark:text-slate-300 font-mono">{rQty.toLocaleString('en-IN', { maximumFractionDigits: 4 })}</strong></span>
                                    <span className="text-slate-300">•</span>
                                    <span>Rate: <strong className="text-slate-700 dark:text-slate-300 font-mono">₹{rRate.toLocaleString('en-IN', { maximumFractionDigits: 5 })}</strong></span>
                                  </div>
                                  {rAmt > 0 && <span className="font-mono font-bold text-emerald-600">= ₹{rAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
                                </div>
                              );
                            })}
                          </div>
                        ) : (entry.quantity || entry.agreementRate) ? (
                          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-mono pt-1">
                            {entry.quantity != null && entry.quantity !== 0 && (
                              <span>Qty: <strong className="text-slate-700 dark:text-slate-300">{Number(entry.quantity).toLocaleString('en-IN', { maximumFractionDigits: 4 })}</strong></span>
                            )}
                            {entry.quantity != null && entry.quantity !== 0 && entry.agreementRate != null && entry.agreementRate !== 0 && <span className="text-slate-300">•</span>}
                            {entry.agreementRate != null && entry.agreementRate !== 0 && (
                              <span>Rate: <strong className="text-slate-700 dark:text-slate-300">₹{Number(entry.agreementRate).toLocaleString('en-IN', { maximumFractionDigits: 5 })}</strong></span>
                            )}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2.5 self-end md:self-center">
                        {classComp && (
                          <ClassificationComparisonDialog
                            currentClassification={classComp}
                            entryAmount={parseFloat(String(entry.amount)) || 0}
                            indicesData={indicesData}
                          />
                        )}
                        <div className="text-right bg-white dark:bg-slate-900 px-4 py-2 border border-slate-100 dark:border-slate-800 rounded-xl shadow-sm">
                          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Allocated Value</p>
                          <p className="font-mono font-bold text-slate-800 dark:text-white mt-0.5 text-sm flex items-center gap-0.5">
                            ₹{entry.amount?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

      {/* 5. PVC Calculation details */}
      {bill.pvcCalculation && (
        <Card className="border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800/80 px-6 py-4">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <TrendingUp size={18} className="text-emerald-500" />
              Statutory Escalate Framework & Calculations
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-6">
              
              {/* Capped Period restriction */}
              {bill.pvcCalculation?.isExtensionPeriod && (
                <div className="bg-amber-500/5 border border-amber-500/25 p-4 rounded-2xl">
                  <p className="text-xs font-bold text-amber-800 dark:text-amber-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <AlertTriangle size={14} /> Extension compliance restriction active
                  </p>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 text-sm">
                    <div className="bg-white dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 p-3.5 rounded-xl">
                      <span className="text-xs text-muted-foreground font-semibold block">Clause Basis</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200 mt-1 block">GCC Clause {bill.pvcCalculation.extensionType || 'N/A'}</span>
                    </div>

                    <div className="bg-white dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 p-3.5 rounded-xl">
                      <span className="text-xs text-muted-foreground font-semibold block">Restriction Mode</span>
                      <Badge variant="destructive" className="font-bold mt-1">Capped Indices</Badge>
                    </div>

                    {bill.pvcCalculation?.indexCapDate && (
                      <div className="bg-white dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 p-3.5 rounded-xl">
                        <span className="text-xs text-muted-foreground font-semibold block">Indices Cap Date</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200 font-mono mt-1 block">
                          {format(new Date(bill.pvcCalculation.indexCapDate), 'MMMM yyyy')}
                        </span>
                      </div>
                    )}

                    {bill.pvcCalculation?.pvcSavingsDueToRestriction != null && 
                     bill.pvcCalculation.pvcSavingsDueToRestriction > 0 && (
                      <div className="bg-emerald-500/10 dark:bg-emerald-950/20 border border-emerald-500/20 p-3.5 rounded-xl">
                        <span className="text-xs text-emerald-800 dark:text-emerald-400 font-bold block">Restriction Savings</span>
                        <span className="font-mono font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 block flex items-center gap-0.5">
                          ₹{bill.pvcCalculation.pvcSavingsDueToRestriction.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Master Breakdown Table component */}
              <div className="pt-2">
                <ComponentPvcTable 
                  classificationEntries={bill.classificationEntries}
                  billAmount={bill.billAmount}
                  pvcCalculation={bill.pvcCalculation}
                  bill={bill}
                  indicesData={indicesData}
                />
              </div>

              {/* Dedicated cement table */}
              {bill.pvcCalculation?.dedicatedCementPvc != null && bill.pvcCalculation.dedicatedCementPvc !== 0 && indicesData && (
                <div className="border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/10 dark:bg-emerald-950/5 p-5 rounded-2xl space-y-3">
                  <h4 className="text-sm font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle size={16} /> Dedicated Cement Formula (GCC Clause 46A)
                  </h4>
                  <div className="overflow-x-auto border border-emerald-250 dark:border-emerald-850 rounded-xl bg-white dark:bg-slate-900">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-emerald-500/5 text-slate-800 dark:text-slate-200 text-xs border-b border-emerald-100 dark:border-emerald-900 font-semibold">
                          <th className="px-4 py-2.5 text-left">Description</th>
                          <th className="px-4 py-2.5 text-left">Statutory Escalate Formula</th>
                          <th className="px-4 py-2.5 text-right">Escalation Amount</th>
                        </tr>
                      </thead>
                      <tbody className="text-xs">
                        <tr>
                          <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                            Dedicated Cement Allocation (85% escalation factor)
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400 max-w-[400px] break-all">
                            {bill.cementAmount?.toLocaleString('en-IN')} × [({indicesData.current['RBI Cement']?.toFixed(2)} - {indicesData.base['RBI Cement']?.toFixed(2)}) ÷ {indicesData.base['RBI Cement']?.toFixed(2)}] × 85%
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            ₹{bill.pvcCalculation.dedicatedCementPvc.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Dedicated Steel Table */}
              {(
                (bill.pvcCalculation?.dedicatedSteelTmtBarsPvc != null && bill.pvcCalculation.dedicatedSteelTmtBarsPvc !== 0) ||
                (bill.pvcCalculation?.dedicatedSteelAngleChannelPvc != null && bill.pvcCalculation.dedicatedSteelAngleChannelPvc !== 0) ||
                (bill.pvcCalculation?.dedicatedSteelPlatesPvc != null && bill.pvcCalculation.dedicatedSteelPlatesPvc !== 0) ||
                (bill.pvcCalculation?.dedicatedSteelOtherSectionsPvc != null && bill.pvcCalculation.dedicatedSteelOtherSectionsPvc !== 0)
              ) && indicesData && (
                <div className="border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/10 dark:bg-emerald-950/5 p-5 rounded-2xl space-y-3">
                  <h4 className="text-sm font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle size={16} /> Dedicated Steel Formula (85% escalation factor)
                  </h4>
                  <div className="overflow-x-auto border border-emerald-250 dark:border-emerald-850 rounded-xl bg-white dark:bg-slate-900">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-emerald-500/5 text-slate-800 dark:text-slate-200 text-xs border-b border-emerald-100 dark:border-emerald-900 font-semibold">
                          <th className="px-4 py-2.5 text-left">Steel Component Type</th>
                          <th className="px-4 py-2.5 text-left">Statutory Escalate Formula</th>
                          <th className="px-4 py-2.5 text-right">Escalation Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                        {bill.pvcCalculation?.dedicatedSteelTmtBarsPvc != null && bill.pvcCalculation.dedicatedSteelTmtBarsPvc !== 0 && (
                          <tr>
                            <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                              Dedicated Steel TMT Bars (85%)
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400 break-all max-w-[400px]">
                              {bill.steelTmtBarsAmount?.toLocaleString('en-IN')} × [({indicesData.current['Steel TMT Bars']?.toFixed(2)} - {indicesData.base['Steel TMT Bars']?.toFixed(2)}) ÷ {indicesData.base['Steel TMT Bars']?.toFixed(2)}] × 85%
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                              ₹{bill.pvcCalculation.dedicatedSteelTmtBarsPvc.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        )}

                        {bill.pvcCalculation?.dedicatedSteelAngleChannelPvc != null && bill.pvcCalculation.dedicatedSteelAngleChannelPvc !== 0 && (
                          <tr>
                            <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                              Dedicated Steel Angle/Channel (85%)
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400 break-all max-w-[400px]">
                              {bill.steelAngleChannelAmount?.toLocaleString('en-IN')} × [({indicesData.current['Steel Angle/Channel']?.toFixed(2)} - {indicesData.base['Steel Angle/Channel']?.toFixed(2)}) ÷ {indicesData.base['Steel Angle/Channel']?.toFixed(2)}] × 85%
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                              ₹{bill.pvcCalculation.dedicatedSteelAngleChannelPvc.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        )}

                        {bill.pvcCalculation?.dedicatedSteelPlatesPvc != null && bill.pvcCalculation.dedicatedSteelPlatesPvc !== 0 && (
                          <tr>
                            <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                              Dedicated Steel Plates (85%)
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400 break-all max-w-[400px]">
                              {bill.steelPlatesAmount?.toLocaleString('en-IN')} × [({indicesData.current['Steel Plates']?.toFixed(2)} - {indicesData.base['Steel Plates']?.toFixed(2)}) ÷ {indicesData.base['Steel Plates']?.toFixed(2)}] × 85%
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                              ₹{bill.pvcCalculation.dedicatedSteelPlatesPvc.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        )}

                        {bill.pvcCalculation?.dedicatedSteelOtherSectionsPvc != null && bill.pvcCalculation.dedicatedSteelOtherSectionsPvc !== 0 && (
                          <tr>
                            <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                              Dedicated Steel Other Sections (85%)
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400 break-all max-w-[400px]">
                              {bill.steelOtherSectionsAmount?.toLocaleString('en-IN')} × [({indicesData.current['Steel Other Sections']?.toFixed(2)} - {indicesData.base['Steel Other Sections']?.toFixed(2)}) ÷ {indicesData.base['Steel Other Sections']?.toFixed(2)}] × 85%
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                              ₹{bill.pvcCalculation.dedicatedSteelOtherSectionsPvc.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Master detailed monthly index table */}
              {detailedMonthlyData && (
                <div className="space-y-4 pt-5 border-t border-slate-100 dark:border-slate-850">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <FileSpreadsheet size={16} />
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                      Detailed Monthly Price Indices Table
                    </h3>
                  </div>
                  <DetailedMonthlyIndicesTable 
                    classificationEntries={bill.classificationEntries}
                    detailedMonthlyData={detailedMonthlyData}
                    contract={bill.contract}
                    bill={bill}
                  />
                </div>
              )}

              {/* Grand summary box */}
              <div className="flex justify-between items-center p-5 bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-950 text-white rounded-2xl border-2 border-emerald-500/20 shadow-md">
                <div className="space-y-0.5">
                  <span className="text-xs uppercase tracking-widest text-emerald-300 font-bold">Grand Escalation Total:</span>
                  <p className="text-[10px] text-slate-400">Aggregate of schedule subclassifications and dedicated 85% materials</p>
                </div>
                <span className={`font-mono font-extrabold text-xl ${isPvcNegative ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {isPvcNegative ? '-' : ''}₹{Math.abs(grandTotalCalculated).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* PVC Shortfall Auditor — compare Railway-paid PVC vs computed entitlement */}
      {bill.pvcCalculation && <ShortfallAudit billId={bill.id} />}

      {/* The bill PDF this was read from, while it is still held. Renders nothing for a
          bill that was typed in, or one whose upload has passed its ninety days. */}
      <SourceDocuments billId={bill.id} />

      {/* Approval history timeline */}
      <ApprovalHistory billId={bill.id} />
    </div>
  );
}
