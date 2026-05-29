'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Download,
  ChevronLeft,
  ChevronRight,
  Database,
  Info,
  TrendingUp,
  FileText,
  Calendar,
  Layers,
  MapPin,
  Flame,
  Construction,
  Hammer,
  HelpCircle,
  TrendingDown,
  LineChart,
  Grid3X3
} from 'lucide-react';
import Link from 'next/link';
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
  { key: 'labour', label: 'Labour Index', desc: 'CPI-IW (Base 2016)', icon: Hammer },
  { key: 'mpngFuel', label: 'MPNG Fuel', desc: 'PPAC Diesel Rate', icon: Flame },
  { key: 'rbiCite', label: 'RBI Cement', desc: 'WPI Cement (Base 2011-12)', icon: Construction },
  { key: 'rbiExplosives', label: 'RBI Explosives', desc: 'WPI Explosives', icon: Flame },
  { key: 'rbiOtherMaterials', label: 'RBI Other Materials', desc: 'WPI All Commodities', icon: Layers },
  { key: 'rbiPlantMachinery', label: 'RBI Plant Machinery', desc: 'WPI Mining & Construction', icon: Database },
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
  const [selectedDetail, setSelectedDetail] = useState<{
    month: string;
    colName: string;
    city: string;
    value: number;
    detail: any;
  } | null>(null);

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
      toast.success('Excel downloaded successfully');
    } catch (error) {
      toast.error('Download failed');
    } finally {
      setIsDownloading(false);
    }
  };

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
    return numVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getLatestIndexInfo = (key: string) => {
    for (let i = MONTHS.length - 1; i >= 0; i--) {
      const row = data.find(d => d.month === MONTHS[i]);
      if (row) {
        const val = row[key] as IndexValue | number | null | undefined;
        const num = getValue(val);
        if (num !== null && num !== undefined) {
          return { month: MONTHS[i], value: num, provisional: isProvisional(val) };
        }
      }
    }
    return null;
  };

  const latestLabour = getLatestIndexInfo('labour');
  const latestFuel = getLatestIndexInfo('mpngFuel');
  const latestCement = getLatestIndexInfo('rbiCite');
  // Get active steel column key (TMT Bars as general indicator)
  const activeSteelColKey = INDEX_COLUMNS.find(c => c.key.startsWith('steelTMTBars'))?.key || 'steelTMTBars';
  const latestSteel = getLatestIndexInfo(activeSteelColKey);

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] space-y-4">
        <LoadingSpinner size="lg" className="text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">Loading price indices data...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Background Decoratives */}
      <div className="absolute top-0 right-0 -z-10 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute top-1/2 left-0 -z-10 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl" />

      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6 border-slate-100 dark:border-slate-800">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
            PVC Price Indices
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Historical index rates used for Price Variation Clause (PVC) bill computations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/indices/jpc-view">
            <Button variant="outline" className="border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all duration-200 shadow-sm">
              <Database className="h-4 w-4 mr-2 text-indigo-500" />
              JPC Raw Steel Rates
            </Button>
          </Link>
          <Button
            onClick={handleDownloadExcel}
            disabled={isDownloading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm transition-all duration-200"
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

      {/* Summary widgets / Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Labour */}
        <Card className="relative overflow-hidden border-slate-200/60 dark:border-slate-800/60 bg-white/50 dark:bg-slate-950/50 backdrop-blur-md hover:shadow-md transition-all duration-200">
          <CardHeader className="pb-2 space-y-1">
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border-amber-100 dark:border-amber-900/30">
                CPI-IW 2016 Base
              </Badge>
              <Hammer className="h-4 w-4 text-amber-500" />
            </div>
            <CardTitle className="text-2xl font-bold font-mono">
              {latestLabour ? latestLabour.value.toFixed(2) : '-'}
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Latest Labour Bureau Index</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium">
              <Calendar className="h-3 w-3" />
              As of {latestLabour?.month || '-'} {year}
              {latestLabour?.provisional && <span className="text-amber-500 font-bold">(Prov.)</span>}
            </span>
          </CardContent>
        </Card>

        {/* Steel */}
        <Card className="relative overflow-hidden border-slate-200/60 dark:border-slate-800/60 bg-white/50 dark:bg-slate-950/50 backdrop-blur-md hover:shadow-md transition-all duration-200">
          <CardHeader className="pb-2 space-y-1">
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 border-blue-100 dark:border-blue-900/30">
                JPC - {steelCity === 'Default' ? 'Chennai' : steelCity}
              </Badge>
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </div>
            <CardTitle className="text-2xl font-bold font-mono">
              {latestSteel ? `₹${Math.round(latestSteel.value).toLocaleString('en-IN')}` : '-'}
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Latest Steel TMT Bars Rate</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium">
              <Calendar className="h-3 w-3" />
              As of {latestSteel?.month || '-'} {year}
              {latestSteel?.provisional && <span className="text-amber-500 font-bold">(Prov.)</span>}
            </span>
          </CardContent>
        </Card>

        {/* Cement */}
        <Card className="relative overflow-hidden border-slate-200/60 dark:border-slate-800/60 bg-white/50 dark:bg-slate-950/50 backdrop-blur-md hover:shadow-md transition-all duration-200">
          <CardHeader className="pb-2 space-y-1">
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/30">
                WPI Cement
              </Badge>
              <Construction className="h-4 w-4 text-indigo-500" />
            </div>
            <CardTitle className="text-2xl font-bold font-mono">
              {latestCement ? latestCement.value.toFixed(2) : '-'}
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Latest RBI Cement WPI</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium">
              <Calendar className="h-3 w-3" />
              As of {latestCement?.month || '-'} {year}
              {latestCement?.provisional && <span className="text-amber-500 font-bold">(Prov.)</span>}
            </span>
          </CardContent>
        </Card>

        {/* Fuel */}
        <Card className="relative overflow-hidden border-slate-200/60 dark:border-slate-800/60 bg-white/50 dark:bg-slate-950/50 backdrop-blur-md hover:shadow-md transition-all duration-200">
          <CardHeader className="pb-2 space-y-1">
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30">
                PPAC Diesel
              </Badge>
              <Flame className="h-4 w-4 text-emerald-500" />
            </div>
            <CardTitle className="text-2xl font-bold font-mono">
              {latestFuel ? `₹${latestFuel.value.toFixed(2)}` : '-'}
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Latest MPNG Fuel Avg</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium">
              <Calendar className="h-3 w-3" />
              As of {latestFuel?.month || '-'} {year}
              {latestFuel?.provisional && <span className="text-amber-500 font-bold">(Prov.)</span>}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Main Tab System */}
      <Tabs defaultValue="sheet" className="w-full space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/80 dark:bg-slate-900/50 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
          <TabsList className="bg-white dark:bg-slate-950 border border-slate-200/50 dark:border-slate-800/50 p-1">
            <TabsTrigger value="sheet" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs font-semibold px-4 py-2">
              <Grid3X3 className="h-3.5 w-3.5 mr-1.5" />
              Data Sheet
            </TabsTrigger>
            <TabsTrigger value="dictionary" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs font-semibold px-4 py-2">
              <Info className="h-3.5 w-3.5 mr-1.5" />
              Indices Glossary
            </TabsTrigger>
          </TabsList>

          {/* Inline Controls (Visible only on sheet tab) */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Year Selector */}
            <div className="flex items-center bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/60 rounded-lg p-0.5 shadow-sm">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setYear(y => y - 1)}
                className="h-8 w-8 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200 px-4 min-w-[70px] text-center">
                {year}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setYear(y => y + 1)}
                disabled={year >= new Date().getFullYear()}
                className="h-8 w-8 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Segmented Steel Selector */}
            <div className="flex items-center gap-1.5 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/60 rounded-lg p-1 shadow-sm overflow-x-auto max-w-full">
              <span className="text-[11px] text-slate-500 font-bold px-2 whitespace-nowrap">STEEL CITY:</span>
              {STEEL_CITIES.map((city) => (
                <Button
                  key={city}
                  variant="ghost"
                  size="sm"
                  onClick={() => setSteelCity(city)}
                  className={`text-[10px] font-bold px-2.5 py-1.5 h-auto transition-all duration-200 rounded-md ${
                    steelCity === city
                      ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/95"
                      : "hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {city === 'Default' ? 'Chennai (Def.)' : city}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Tab 1: Interactive Data Sheet */}
        <TabsContent value="sheet" className="space-y-4 outline-none">
          <div className="bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/60 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto scrollbar-thin scrollbar-track-slate-50 scrollbar-thumb-slate-200">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  {/* Grouped Header row */}
                  <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200/60 dark:border-slate-800/60">
                    <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 sticky left-0 bg-slate-50 dark:bg-slate-900 z-20 border-r border-slate-200/60 dark:border-slate-800/60 w-24">Category</th>
                    <th colSpan={6} className="px-4 py-2 font-bold text-slate-700 dark:text-slate-300 text-center border-r border-slate-200/60 dark:border-slate-800/60">
                      General Indices
                    </th>
                    <th colSpan={4} className="px-4 py-2 font-bold text-slate-700 dark:text-slate-300 text-center bg-blue-50/20 dark:bg-blue-900/10">
                      Steel Rates (JPC) — {steelCity === 'Default' ? 'Chennai' : steelCity}
                    </th>
                  </tr>
                  {/* Base Column Header row */}
                  <tr className="bg-slate-100/50 dark:bg-slate-900/40 border-b border-slate-200/60 dark:border-slate-800/60">
                    <th className="px-4 py-3 font-bold text-slate-800 dark:text-slate-200 sticky left-0 bg-slate-100/50 dark:bg-slate-900/40 z-20 border-r border-slate-200/60 dark:border-slate-800/60 w-24">Month</th>
                    
                    {/* General Cols */}
                    {NON_STEEL_COLUMNS.map(col => (
                      <th key={col.key} className="px-3 py-3 text-center font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap border-r border-slate-100 dark:border-slate-800 last:border-r-2 last:border-r-slate-200 dark:last:border-r-slate-800">
                        <div>{col.label}</div>
                        <div className="text-[9px] text-slate-400 font-normal mt-0.5">{col.desc}</div>
                      </th>
                    ))}

                    {/* Steel Cols */}
                    {(STEEL_COLUMNS_BY_CITY[steelCity] || STEEL_COLUMNS_BY_CITY['Default']).map(col => (
                      <th key={col.key} className="px-3 py-3 text-center font-semibold text-slate-700 dark:text-slate-300 bg-blue-50/5 dark:bg-blue-950/5 whitespace-nowrap border-r border-slate-100 dark:border-slate-800 last:border-r-0">
                        <div>{col.label}</div>
                        <div className="text-[9px] text-blue-500/70 font-bold mt-0.5">₹/MT</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {MONTHS.map((month, idx) => {
                    const rowData = data.find(d => d.month === month) || {} as MonthlyData;
                    
                    // Check if row has any values
                    const hasAnyValues = INDEX_COLUMNS.some(col => {
                      const v = getValue((rowData as any)[col.key]);
                      return v !== null && v !== undefined;
                    });

                    return (
                      <tr 
                        key={month} 
                        className={`hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors duration-150 ${
                          !hasAnyValues ? "opacity-40" : ""
                        }`}
                      >
                        {/* Month sticky cell */}
                        <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-200 sticky left-0 bg-white dark:bg-slate-950 z-10 border-r border-slate-200/60 dark:border-slate-800/60">
                          {month}
                        </td>

                        {/* Columns mapping */}
                        {INDEX_COLUMNS.map(col => {
                          const cellValue = (rowData as any)[col.key];
                          const provisional = isProvisional(cellValue);
                          const formula = getFormula(cellValue);
                          const detail = getSteelDetail(cellValue);
                          const numVal = getValue(cellValue);
                          const hasValue = numVal !== null && numVal !== undefined;
                          const isSteel = col.key.startsWith('steel');
                          const hasDetail = isSteel && hasValue && detail;

                          return (
                            <td 
                              key={col.key} 
                              className={`px-3 py-3 text-center font-mono ${
                                provisional ? 'text-amber-600 dark:text-amber-400 font-medium italic' : 'text-slate-700 dark:text-slate-300'
                              } ${
                                hasDetail 
                                  ? 'cursor-pointer hover:bg-blue-50/80 dark:hover:bg-blue-950/20 bg-blue-50/10 dark:bg-blue-950/5 border-b border-dashed border-blue-400 dark:border-blue-700 font-bold'
                                  : hasValue && formula ? 'cursor-help' : ''
                              }`}
                              title={
                                hasDetail 
                                  ? 'Interactive: Click to view JPC Steel formula breakdown'
                                  : formula ? `Formula: ${formula}` : provisional ? 'Provisional Rate' : undefined
                              }
                              onClick={hasDetail ? () => {
                                setSelectedDetail({
                                  month,
                                  colName: col.label,
                                  city: steelCity === 'Default' ? 'Chennai' : steelCity,
                                  value: numVal!,
                                  detail,
                                });
                              } : undefined}
                            >
                              <div className="flex items-center justify-center gap-1.5">
                                <span>{formatValue(cellValue)}</span>
                                {provisional && (
                                  <Badge className="h-4 px-1 text-[8px] bg-amber-100 hover:bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-none font-bold uppercase rounded">
                                    P
                                  </Badge>
                                )}
                              </div>
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
          <p className="text-[11px] text-muted-foreground italic flex items-center gap-1 px-1">
            <Info className="h-3 w-3 text-amber-500" />
            Rows showing lower opacity indicate months where indices records are not uploaded or incomplete. Rates with a <span className="bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-bold px-1 rounded mx-0.5">P</span> badge indicate provisional indices. Click highlighted Steel Rates cells to view formula calculation logs.
          </p>
        </TabsContent>

        {/* Tab 2: Glossary Info */}
        <TabsContent value="dictionary" className="outline-none">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-950/60">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Hammer className="h-4 w-4 text-amber-500" />
                  Labour Index (CPI-IW)
                </CardTitle>
                <CardDescription>All India Consumer Price Index for Industrial Workers</CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-slate-600 dark:text-slate-400 space-y-2">
                <p>
                  <strong>Source:</strong> Labour Bureau, Ministry of Labour & Employment, Government of India.
                </p>
                <p>
                  <strong>Application:</strong> Represents the wage/labor components in railway works contracts under the Price Variation Clause formulas.
                </p>
                <p>
                  <strong>Base Year:</strong> Re-based to 2016 from calendar year 2020. The application correctly applies the link-factor of 2.88 if comparing with the older 2001 base index.
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-950/60">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Flame className="h-4 w-4 text-emerald-500" />
                  MPNG Fuel Index
                </CardTitle>
                <CardDescription>Ministry of Petroleum & Natural Gas - HSD Prices</CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-slate-600 dark:text-slate-400 space-y-2">
                <p>
                  <strong>Source:</strong> Petroleum Planning & Analysis Cell (PPAC), MoPNG, Government of India.
                </p>
                <p>
                  <strong>Application:</strong> Represents the Fuel & Lubricants component.
                </p>
                <p>
                  <strong>Mechanism:</strong> Based on the retail selling price of High-Speed Diesel (HSD) in metros. The page computes the average daily diesel prices over each calendar month for billing accuracy.
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-950/60">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  JPC Steel Prices
                </CardTitle>
                <CardDescription>Joint Plant Committee Steel Rates</CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-slate-600 dark:text-slate-400 space-y-2">
                <p>
                  <strong>Source:</strong> JPC, Ministry of Steel, Government of India.
                </p>
                <p>
                  <strong>Application:</strong> Direct market raw material pricing used for reinforcement steel items.
                </p>
                <p>
                  <strong>Categories:</strong> Steel TMT Bars, Steel Angle/Channel, Steel Plates, and Steel Other Sections. Calculated using JPC fortnightly ex-works steel yard rates across major metros (Delhi, Mumbai, Chennai, Kolkata).
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-950/60">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4 text-indigo-500" />
                  WPI Indices (RBI Series)
                </CardTitle>
                <CardDescription>Wholesale Price Index - Office of Economic Advisor</CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-slate-600 dark:text-slate-400 space-y-2">
                <p>
                  <strong>Source:</strong> Office of the Economic Adviser (OEA), Ministry of Commerce & Industry, Government of India.
                </p>
                <p>
                  <strong>Components:</strong>
                </p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>RBI Cement:</strong> WPI Manufacture of Cement, Lime & Plaster</li>
                  <li><strong>RBI Plant Machinery:</strong> WPI Construction Machinery series</li>
                  <li><strong>RBI Explosives:</strong> WPI Explosives series</li>
                  <li><strong>RBI Other Materials:</strong> WPI All Commodities Index</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Steel Detail Dialog / Modal */}
      {selectedDetail && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setSelectedDetail(null)}
        >
          <Card 
            className="w-full max-w-lg shadow-2xl border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-950 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg font-bold text-slate-800 dark:text-slate-100">
                    JPC Steel Rate Details
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 flex items-center gap-1.5 mt-1 font-medium">
                    <MapPin className="h-3.5 w-3.5 text-blue-500" />
                    City Yard: {selectedDetail.city} JPC | Month: {selectedDetail.month} {year}
                  </CardDescription>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 font-mono">
                    ₹{Math.round(selectedDetail.value).toLocaleString('en-IN')}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Average Rate / MT</div>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="pt-5 space-y-4">
              <div className="rounded-xl border border-slate-150 dark:border-slate-800 overflow-hidden bg-slate-50/50 dark:bg-slate-900/40">
                {selectedDetail.detail.items && selectedDetail.detail.items.length > 0 ? (
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800/60 border-b border-slate-250/20 text-slate-600 dark:text-slate-400">
                        <th className="py-2.5 px-3 font-semibold">JPC Sub-Item</th>
                        <th className="py-2.5 px-2 text-center font-semibold">Fortnight 1 (F1)</th>
                        <th className="py-2.5 px-2 text-center font-semibold">Fortnight 2 (F2)</th>
                        <th className="py-2.5 px-2 text-center font-semibold text-blue-600 dark:text-blue-400">Avg</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 font-mono">
                      {selectedDetail.detail.items.map((item: any, idx: number) => (
                        <tr key={idx} className="hover:bg-white/50 dark:hover:bg-slate-900/40 transition-colors">
                          <td className="py-2 px-3 text-slate-700 dark:text-slate-300 font-sans font-medium text-xs">
                            {item.name}
                          </td>
                          <td className="py-2 px-2 text-center text-slate-600 dark:text-slate-400">
                            {item.f1 !== null && item.f1 !== undefined ? `₹${Math.round(item.f1).toLocaleString('en-IN')}` : '-'}
                          </td>
                          <td className="py-2 px-2 text-center text-slate-600 dark:text-slate-400">
                            {item.f2 !== null && item.f2 !== undefined ? `₹${Math.round(item.f2).toLocaleString('en-IN')}` : '-'}
                          </td>
                          <td className="py-2 px-2 text-center text-blue-600 dark:text-blue-400 font-bold">
                            {item.avg !== null && item.avg !== undefined ? `₹${Math.round(item.avg).toLocaleString('en-IN')}` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-4 text-center text-xs text-muted-foreground italic">
                    No detailed sub-item fortnightly breakdowns available.
                  </div>
                )}
              </div>

              {/* Formula and Explanatory text */}
              <div className="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100/50 dark:border-blue-900/30 rounded-xl p-3.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400 text-xs font-bold">
                  <Info className="h-4 w-4" />
                  Formula & Weightage
                </div>
                <p className="text-[11px] text-blue-600/90 dark:text-blue-300/80 leading-relaxed font-medium">
                  {selectedDetail.detail.formulaDesc || 'Calculated as simple average of JPC yard pricing.'}
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <Button 
                  onClick={() => setSelectedDetail(null)}
                  className="bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 dark:text-slate-900 text-white text-xs px-4"
                >
                  Close Details
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
