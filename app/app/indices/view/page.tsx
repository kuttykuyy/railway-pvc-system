'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Download, ChevronLeft, ChevronRight, Database } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

interface IndexValue {
  value: number | null;
  isProvisional?: boolean;
  formula?: string | null;
  steelDetail?: any;
}

interface MonthlyData {
  month: string;
  [key: string]: IndexValue | number | string | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STEEL_CITIES = ['Default', 'Delhi', 'Mumbai', 'Chennai', 'Kolkata'] as const;

const NON_STEEL_COLUMNS = [
  { key: 'labour', label: 'Labour' },
  { key: 'mpngFuel', label: 'MPNG Fuel' },
  { key: 'rbiCite', label: 'RBI Cement' },
  { key: 'rbiExplosives', label: 'RBI Explosives' },
  { key: 'rbiOtherMaterials', label: 'RBI Other Materials' },
  { key: 'rbiPlantMachinery', label: 'RBI Plant Machinery' },
];

const STEEL_COLUMNS_BY_CITY: Record<string, { key: string; label: string }[]> = {
  'Default': [
    { key: 'steelTMTBars', label: 'Steel TMT Bars' },
    { key: 'steelAngleChannel', label: 'Steel Angle/Channel' },
    { key: 'steelPlates', label: 'Steel Plates' },
    { key: 'steelOtherSections', label: 'Steel Other Sections' },
  ],
  'Delhi': [
    { key: 'steelTMTBars_Delhi', label: 'TMT Bars (Delhi)' },
    { key: 'steelAngleChannel_Delhi', label: 'Angle/Ch (Delhi)' },
    { key: 'steelPlates_Delhi', label: 'Plates (Delhi)' },
    { key: 'steelOtherSections_Delhi', label: 'Other Sec (Delhi)' },
  ],
  'Mumbai': [
    { key: 'steelTMTBars_Mumbai', label: 'TMT Bars (Mumbai)' },
    { key: 'steelAngleChannel_Mumbai', label: 'Angle/Ch (Mumbai)' },
    { key: 'steelPlates_Mumbai', label: 'Plates (Mumbai)' },
    { key: 'steelOtherSections_Mumbai', label: 'Other Sec (Mumbai)' },
  ],
  'Chennai': [
    { key: 'steelTMTBars_Chennai', label: 'TMT Bars (Chennai)' },
    { key: 'steelAngleChannel_Chennai', label: 'Angle/Ch (Chennai)' },
    { key: 'steelPlates_Chennai', label: 'Plates (Chennai)' },
    { key: 'steelOtherSections_Chennai', label: 'Other Sec (Chennai)' },
  ],
  'Kolkata': [
    { key: 'steelTMTBars_Kolkata', label: 'TMT Bars (Kolkata)' },
    { key: 'steelAngleChannel_Kolkata', label: 'Angle/Ch (Kolkata)' },
    { key: 'steelPlates_Kolkata', label: 'Plates (Kolkata)' },
    { key: 'steelOtherSections_Kolkata', label: 'Other Sec (Kolkata)' },
  ],
};

export default function IndicesViewPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<MonthlyData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [steelCity, setSteelCity] = useState<string>('Default');
  const [steelPopover, setSteelPopover] = useState<{
    month: string; colName: string; city: string; value: number;
    detail: any; rect: { top: number; left: number };
  } | null>(null);

  // Build columns based on selected steel city
  const INDEX_COLUMNS = [...NON_STEEL_COLUMNS, ...(STEEL_COLUMNS_BY_CITY[steelCity] || STEEL_COLUMNS_BY_CITY['Default'])];

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/auth/signin');
      return;
    }
    fetchData();
  }, [session, status, year]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/indices/yearly-view?year=${year}`);
      if (response.ok) {
        const result = await response.json();
        setData(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadExcel = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch(`/api/indices/yearly-view/export?year=${year}`);
      if (!response.ok) throw new Error('Failed to download');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Price_Indices_${year}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Excel downloaded');
    } catch (error) {
      toast.error('Download failed');
    } finally {
      setIsDownloading(false);
    }
  };

  // Helper to extract value from both object and direct number formats
  const getValue = (val: IndexValue | number | null | undefined): number | null => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val;
    if (typeof val === 'object' && 'value' in val) return val.value;
    return null;
  };

  const isProvisional = (val: IndexValue | number | null | undefined): boolean => {
    if (val === null || val === undefined) return false;
    if (typeof val === 'object' && 'isProvisional' in val) return val.isProvisional ?? false;
    return false;
  };

  const getFormula = (val: IndexValue | number | null | undefined): string | null => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'object' && 'formula' in val) return val.formula ?? null;
    return null;
  };

  const getSteelDetail = (val: IndexValue | number | null | undefined): any => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'object' && 'steelDetail' in val) return val.steelDetail ?? null;
    return null;
  };

  const formatValue = (val: IndexValue | number | null | undefined) => {
    const numVal = getValue(val);
    if (numVal === null || numVal === undefined) return '-';
    return numVal.toFixed(2);
  };

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Price Indices</h1>
        <div className="flex items-center gap-2">
          <Link href="/indices/jpc-view">
            <Button variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-50">
              <Database className="h-4 w-4 mr-2" />
              JPC Steel Rates
            </Button>
          </Link>
          <Button
            onClick={handleDownloadExcel}
            disabled={isDownloading}
            className="bg-green-600 hover:bg-green-700"
          >
            {isDownloading ? (
              <LoadingSpinner size="sm" className="mr-2" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Download Excel
          </Button>
        </div>
      </div>

      {/* Year Selector */}
      <div className="flex items-center justify-center gap-4 mb-6">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setYear(y => y - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xl font-semibold text-gray-900 min-w-[80px] text-center">
          {year}
        </span>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setYear(y => y + 1)}
          disabled={year >= new Date().getFullYear()}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Steel City Selector */}
      <div className="flex items-center justify-center gap-2 mb-4">
        <span className="text-sm text-gray-600 font-medium">Steel Rates:</span>
        {STEEL_CITIES.map((city) => (
          <Button
            key={city}
            variant={steelCity === city ? "default" : "outline"}
            size="sm"
            onClick={() => setSteelCity(city)}
            className={`text-xs ${steelCity === city ? "bg-blue-600 hover:bg-blue-700" : ""}`}
          >
            {city === 'Default' ? 'Default (Chennai)' : city}
          </Button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100 border-b">
                <th className="px-3 py-3 text-left font-semibold text-gray-700 sticky left-0 bg-gray-100 z-10">Month</th>
                {INDEX_COLUMNS.map(col => (
                  <th key={col.key} className="px-3 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MONTHS.map((month, idx) => {
                const rowData = data.find(d => d.month === month) || {} as MonthlyData;
                return (
                  <tr key={month} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2 font-medium text-gray-900 sticky left-0 bg-inherit z-10 border-r">
                      {month}
                    </td>
                    {INDEX_COLUMNS.map(col => {
                      const cellValue = (rowData as any)[col.key];
                      const provisional = isProvisional(cellValue);
                      const formula = getFormula(cellValue);
                      const detail = getSteelDetail(cellValue);
                      const numVal = getValue(cellValue);
                      const hasValue = numVal !== null && numVal !== undefined;
                      const isSteel = col.key.startsWith('steel');
                      const hasDetail = isSteel && hasValue && detail;
                      const tooltipText = hasDetail 
                        ? 'Click to view breakdown' 
                        : formula ? formula : provisional ? 'Provisional' : undefined;
                      return (
                        <td 
                          key={col.key} 
                          className={`px-3 py-2 text-center ${provisional ? 'text-amber-600 italic' : 'text-gray-700'} ${hasDetail ? 'cursor-pointer hover:bg-blue-50 border-b border-dashed border-blue-300' : hasValue && formula ? 'cursor-help' : ''}`}
                          title={tooltipText}
                          onClick={hasDetail ? (e) => {
                            const rect = (e.target as HTMLElement).getBoundingClientRect();
                            setSteelPopover({
                              month,
                              colName: col.label,
                              city: steelCity === 'Default' ? 'Chennai' : steelCity,
                              value: numVal!,
                              detail,
                              rect: { top: rect.bottom + window.scrollY, left: rect.left + window.scrollX },
                            });
                          } : undefined}
                        >
                          {formatValue(cellValue)}
                          {provisional && <span className="text-xs">*</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Steel Detail Popover */}
      {steelPopover && (
        <div 
          className="fixed inset-0 z-50" 
          onClick={() => setSteelPopover(null)}
        >
          <div 
            className="absolute bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-80 max-w-[90vw]"
            style={{
              top: Math.min(steelPopover.rect.top, window.innerHeight - 320),
              left: Math.min(Math.max(steelPopover.rect.left - 120, 8), window.innerWidth - 330),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="font-semibold text-sm text-gray-900">
                  {steelPopover.colName} — {steelPopover.month} {year}
                </h4>
                <p className="text-xs text-gray-500">{steelPopover.city} JPC Rates</p>
              </div>
              <div className="text-right">
                <span className="text-lg font-bold text-blue-600">{steelPopover.value.toFixed(0)}</span>
                <p className="text-[10px] text-gray-400">₹/MT</p>
              </div>
            </div>
            
            {steelPopover.detail.items && steelPopover.detail.items.length > 0 ? (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="py-1.5 px-2 text-left border font-semibold text-gray-600">Item</th>
                    <th className="py-1.5 px-1.5 text-center border font-semibold text-gray-600">F1</th>
                    <th className="py-1.5 px-1.5 text-center border font-semibold text-gray-600">F2</th>
                    <th className="py-1.5 px-1.5 text-center border font-semibold text-blue-600">Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {steelPopover.detail.items.map((item: any, idx: number) => (
                    <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                      <td className="py-1.5 px-2 text-gray-700 border font-medium">{item.name}</td>
                      <td className="py-1.5 px-1.5 text-center border font-mono text-gray-600">
                        {item.f1 !== null && item.f1 !== undefined ? Number(item.f1).toFixed(0) : '-'}
                      </td>
                      <td className="py-1.5 px-1.5 text-center border font-mono text-gray-600">
                        {item.f2 !== null && item.f2 !== undefined ? Number(item.f2).toFixed(0) : '-'}
                      </td>
                      <td className="py-1.5 px-1.5 text-center border font-mono font-semibold text-blue-600">
                        {item.avg !== null && item.avg !== undefined ? Number(item.avg).toFixed(0) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-gray-500 italic py-2">{steelPopover.detail.formulaDesc}</p>
            )}
            
            <div className="mt-2 pt-2 border-t">
              <p className="text-[10px] text-gray-400">{steelPopover.detail.formulaDesc}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
