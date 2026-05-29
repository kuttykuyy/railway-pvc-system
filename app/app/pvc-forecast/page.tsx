'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { BackButton } from '@/components/ui/back-button';
import { getRailwayZoneOptions, getSteelCityForZone } from '@/lib/zone-steel-city-mapping';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
  Calendar,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  BarChart3,
  Zap
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  Legend,
} from 'recharts';

const STEEL_TYPES = [
  { value: 'Steel TMT Bars', label: 'TMT Bars' },
  { value: 'Steel Angle/Channel', label: 'Angle / Channel' },
  { value: 'Steel Plates', label: 'Plates' },
  { value: 'Steel Other Sections', label: 'Other Sections' },
];

interface BillingQuarterInfo {
  quarter: string;
  quarterLabel: string;
  months: string[];
  averageIndex: number;
  baseIndex: number;
  pvcPerLakh: number;
  trend: 'positive' | 'negative' | 'neutral';
  dataComplete: boolean;
  billingMonth: string;
  isEstimated?: boolean;
  confidence?: 'high' | 'moderate' | 'low';
  confidenceNote?: string;
}

interface ForecastData {
  contractName: string;
  agreementNo: string;
  steelType: string;
  steelCity: string;
  indexName: string;
  baseMonth: string;
  baseIndex: number;
  latestIndex: number;
  currentTrend: 'rising' | 'falling' | 'stable';
  indexTrend: Array<{
    month: string;
    monthLabel: string;
    value: number;
    baseValue: number;
  }>;
  quarterForecasts: Array<{
    quarter: string;
    quarterLabel: string;
    months: string[];
    averageIndex: number;
    baseIndex: number;
    pvcPerLakh: number;
    trend: 'positive' | 'negative' | 'neutral';
    dataComplete: boolean;
  }>;
  billingQuarter: BillingQuarterInfo | null;
  billingQuarterUnavailable: string | null;
  summary: {
    totalQuarters: number;
    positiveQuarters: number;
    negativeQuarters: number;
    bestQuarter: { quarter: string; quarterLabel: string; pvcPerLakh: number } | null;
    worstQuarter: { quarter: string; quarterLabel: string; pvcPerLakh: number } | null;
  };
}

export default function PvcForecastPageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><LoadingSpinner /></div>}>
      <PvcForecastPage />
    </Suspense>
  );
}

function PvcForecastPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [contracts, setContracts] = useState<Array<{ id: string; agreementNo: string; workDescription: string; baseMonth: string; dateOfOpening: string }>>([]);
  const [selectedContract, setSelectedContract] = useState<string>('');
  const [zone, setZone] = useState<string>('SR');
  const [steelType, setSteelType] = useState<string>('Steel TMT Bars');
  const [baseMonth, setBaseMonth] = useState<string>('');
  const [forecastData, setForecastData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contractsLoading, setContractsLoading] = useState(true);
  const [useManualBase, setUseManualBase] = useState(false);
  const [billingMonth, setBillingMonth] = useState<string>('');

  const zoneOptions = useMemo(() => getRailwayZoneOptions(), []);

  // Fetch user contracts
  useEffect(() => {
    if (status !== 'authenticated') return;
    const fetchContracts = async () => {
      try {
        const res = await fetch('/api/contracts');
        if (res.ok) {
          const data = await res.json();
          setContracts(data.contracts || data || []);
        }
      } catch { /* ignore */ } finally {
        setContractsLoading(false);
      }
    };
    fetchContracts();
  }, [status]);

  // Auto-select from URL params
  useEffect(() => {
    const contractId = searchParams.get('contractId');
    if (contractId) setSelectedContract(contractId);
    const zoneParam = searchParams.get('zone');
    if (zoneParam) setZone(zoneParam);
  }, [searchParams]);

  const fetchForecast = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (selectedContract && !useManualBase) {
        params.set('contractId', selectedContract);
      } else if (baseMonth) {
        params.set('baseMonth', new Date(baseMonth + '-01').toISOString());
      } else {
        setError('Please select a contract or enter a base month');
        setLoading(false);
        return;
      }
      params.set('zone', zone);
      params.set('steelType', steelType);
      if (billingMonth) {
        params.set('billingMonth', new Date(billingMonth + '-01').toISOString());
      }

      const res = await fetch(`/api/pvc-forecast?${params.toString()}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to fetch forecast');
      }
      const data = await res.json();
      setForecastData(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedContract, zone, steelType, baseMonth, useManualBase, billingMonth]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }

  const steelCity = getSteelCityForZone(zone);

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Steel PVC Forecast</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Analyze steel price trends to plan when to schedule steel-intensive work
          </p>
        </div>
      </div>

      {/* Input Section */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-600" />
            Forecast Parameters
          </CardTitle>
          <CardDescription>
            Select your contract (or enter base month manually) along with zone and steel type
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Toggle: Contract vs Manual */}
          <div className="flex items-center gap-3">
            <Button
              variant={!useManualBase ? 'default' : 'outline'}
              size="sm"
              onClick={() => setUseManualBase(false)}
            >
              Select Contract
            </Button>
            <Button
              variant={useManualBase ? 'default' : 'outline'}
              size="sm"
              onClick={() => setUseManualBase(true)}
            >
              Enter Base Month
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {!useManualBase ? (
              <div className="space-y-2">
                <Label>Contract</Label>
                {contractsLoading ? (
                  <div className="h-10 flex items-center"><LoadingSpinner /></div>
                ) : (
                  <Select value={selectedContract} onValueChange={setSelectedContract}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a contract" />
                    </SelectTrigger>
                    <SelectContent>
                      {contracts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.agreementNo} - {c.workDescription?.slice(0, 40)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {selectedContract && (() => {
                  const sc = contracts.find(c => c.id === selectedContract);
                  if (!sc) return null;
                  const openDate = new Date(sc.dateOfOpening);
                  const baseDate = new Date(sc.baseMonth);
                  return (
                    <p className="text-xs text-muted-foreground">
                      Opening: {!isNaN(openDate.getTime()) ? openDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—'}
                      {' · '}Base Month: {!isNaN(baseDate.getTime()) ? baseDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—'}
                    </p>
                  );
                })()}
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Base Month (Date of Opening - 1 month)</Label>
                <Input
                  type="month"
                  value={baseMonth}
                  onChange={(e) => setBaseMonth(e.target.value)}
                  placeholder="YYYY-MM"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Railway Zone</Label>
              <Select value={zone} onValueChange={setZone}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {zoneOptions.map((z) => (
                    <SelectItem key={z.value} value={z.value}>
                      {z.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Steel city: {steelCity}</p>
            </div>

            <div className="space-y-2">
              <Label>Steel Type</Label>
              <Select value={steelType} onValueChange={setSteelType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STEEL_TYPES.map((st) => (
                    <SelectItem key={st.value} value={st.value}>
                      {st.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Billing Month (Date of Measurement)</Label>
              <Input
                type="month"
                value={billingMonth}
                onChange={(e) => setBillingMonth(e.target.value)}
                placeholder="YYYY-MM"
              />
              <p className="text-xs text-muted-foreground">Which month are you planning to bill?</p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={fetchForecast}
              disabled={loading || (!selectedContract && !baseMonth && !useManualBase)}
              className="min-w-[200px]"
            >
              {loading ? <LoadingSpinner /> : <><Zap className="h-4 w-4 mr-2" /> Generate Forecast</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <p className="font-medium">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {forecastData && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Base Index</p>
                    <p className="text-2xl font-bold">{forecastData.baseIndex.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(forecastData.baseMonth).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}
                    </p>
                  </div>
                  <Calendar className="h-8 w-8 text-blue-500 opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Latest Index</p>
                    <p className="text-2xl font-bold">{forecastData.latestIndex.toFixed(2)}</p>
                    <Badge
                      variant={forecastData.currentTrend === 'rising' ? 'default' : forecastData.currentTrend === 'falling' ? 'destructive' : 'secondary'}
                      className="mt-1"
                    >
                      {forecastData.currentTrend === 'rising' && <TrendingUp className="h-3 w-3 mr-1" />}
                      {forecastData.currentTrend === 'falling' && <TrendingDown className="h-3 w-3 mr-1" />}
                      {forecastData.currentTrend === 'stable' && <Minus className="h-3 w-3 mr-1" />}
                      {forecastData.currentTrend}
                    </Badge>
                  </div>
                  <Activity className="h-8 w-8 text-purple-500 opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-green-200 dark:border-green-800">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Positive Quarters</p>
                    <p className="text-2xl font-bold text-green-600">{forecastData.summary.positiveQuarters}</p>
                    <p className="text-xs text-muted-foreground mt-1">of {forecastData.summary.totalQuarters} total</p>
                  </div>
                  <CheckCircle2 className="h-8 w-8 text-green-500 opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-red-200 dark:border-red-800">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Negative Quarters</p>
                    <p className="text-2xl font-bold text-red-600">{forecastData.summary.negativeQuarters}</p>
                    <p className="text-xs text-muted-foreground mt-1">of {forecastData.summary.totalQuarters} total</p>
                  </div>
                  <XCircle className="h-8 w-8 text-red-500 opacity-50" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Billing Quarter Result — estimated notice when data is projected */}
          {forecastData.billingQuarter?.isEstimated && forecastData.billingQuarterUnavailable && (
            <Card className="border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-600">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Info className="h-6 w-6 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-amber-800 dark:text-amber-300">
                        Estimated Values — Based on Weighted Trend
                      </p>
                      {forecastData.billingQuarter.confidence && (
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            forecastData.billingQuarter.confidence === 'high'
                              ? 'text-green-700 border-green-500 bg-green-100 dark:bg-green-900/40 dark:text-green-300'
                              : forecastData.billingQuarter.confidence === 'moderate'
                              ? 'text-amber-700 border-amber-500 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300'
                              : 'text-red-700 border-red-500 bg-red-100 dark:bg-red-900/40 dark:text-red-300'
                          }`}
                        >
                          Confidence: {forecastData.billingQuarter.confidence === 'high' ? 'High' : forecastData.billingQuarter.confidence === 'moderate' ? 'Moderate' : 'Low'}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                      {forecastData.billingQuarterUnavailable}
                    </p>
                    {forecastData.billingQuarter.confidenceNote && (
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Factors: {forecastData.billingQuarter.confidenceNote}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Billing Quarter Result — fully unavailable (no estimation possible) */}
          {!forecastData.billingQuarter && forecastData.billingQuarterUnavailable && billingMonth && (
            <Card className="border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-600">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-amber-800 dark:text-amber-300">Billing Month Indices Not Available</p>
                    <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                      {forecastData.billingQuarterUnavailable}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Meanwhile, the forecast below shows data for all quarters where indices are currently available.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Billing Quarter Result */}
          {forecastData.billingQuarter && (
            <Card className={`border-2 ${forecastData.billingQuarter.isEstimated ? 'border-dashed' : ''} ${
              forecastData.billingQuarter.trend === 'positive'
                ? 'border-green-400 bg-green-50 dark:bg-green-950/40 dark:border-green-600'
                : forecastData.billingQuarter.trend === 'negative'
                ? 'border-red-400 bg-red-50 dark:bg-red-950/40 dark:border-red-600'
                : 'border-gray-400 bg-gray-50 dark:bg-gray-950/40'
            }`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ArrowRight className="h-5 w-5" />
                  Your Billing Month: {forecastData.billingQuarter.billingMonth}
                  {forecastData.billingQuarter.isEstimated && (
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        forecastData.billingQuarter.confidence === 'high'
                          ? 'text-green-700 border-green-500 bg-green-100 dark:bg-green-900/40 dark:text-green-300'
                          : forecastData.billingQuarter.confidence === 'low'
                          ? 'text-red-700 border-red-500 bg-red-100 dark:bg-red-900/40 dark:text-red-300'
                          : 'text-amber-700 border-amber-500 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300'
                      }`}
                    >
                      ≈ Estimated · {forecastData.billingQuarter.confidence === 'high' ? 'High' : forecastData.billingQuarter.confidence === 'moderate' ? 'Moderate' : 'Low'} Confidence
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Falls in {forecastData.billingQuarter.quarter} ({forecastData.billingQuarter.months.join(', ')})
                  {forecastData.billingQuarter.isEstimated && ' — projected from recent trend'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Quarter Avg Index</p>
                    <p className="text-xl font-bold">{forecastData.billingQuarter.averageIndex.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Base Index</p>
                    <p className="text-xl font-bold">{forecastData.billingQuarter.baseIndex.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Difference</p>
                    <p className={`text-xl font-bold ${
                      forecastData.billingQuarter.averageIndex >= forecastData.billingQuarter.baseIndex
                        ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {(forecastData.billingQuarter.averageIndex - forecastData.billingQuarter.baseIndex) >= 0 ? '+' : ''}
                      {(forecastData.billingQuarter.averageIndex - forecastData.billingQuarter.baseIndex).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Steel PVC per ₹1 Lakh</p>
                    <p className={`text-2xl font-bold ${
                      forecastData.billingQuarter.pvcPerLakh >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {forecastData.billingQuarter.pvcPerLakh >= 0 ? '+' : ''}₹{forecastData.billingQuarter.pvcPerLakh.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                </div>
                {forecastData.billingQuarter.trend === 'negative' && (
                  <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                    <p className="text-sm text-red-800 dark:text-red-300 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                      <span>
                        <strong>Warning:</strong> Billing in {forecastData.billingQuarter.billingMonth} will result in negative steel PVC.
                        {forecastData.summary.bestQuarter && forecastData.summary.bestQuarter.pvcPerLakh > 0 && (
                          <> Consider scheduling steel work in <strong>{forecastData.summary.bestQuarter.quarterLabel}</strong> instead for +₹{forecastData.summary.bestQuarter.pvcPerLakh.toLocaleString('en-IN', { maximumFractionDigits: 0 })} per lakh.</>
                        )}
                      </span>
                    </p>
                  </div>
                )}
                {forecastData.billingQuarter.trend === 'positive' && (
                  <div className="mt-4 p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                    <p className="text-sm text-green-800 dark:text-green-300 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                      <strong>Good choice!</strong> Billing in {forecastData.billingQuarter.billingMonth} gives positive steel PVC.
                    </p>
                  </div>
                )}
                {!forecastData.billingQuarter.dataComplete && (
                  <p className="mt-2 text-xs text-amber-600">⚠ This quarter has incomplete index data — actual PVC may differ.</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Best/Worst Quarter Advisory */}
          {(forecastData.summary.bestQuarter || forecastData.summary.worstQuarter) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {forecastData.summary.bestQuarter && (
                <Card className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="h-6 w-6 text-green-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-green-800 dark:text-green-300">Best Quarter for Steel Work</p>
                        <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                          {forecastData.summary.bestQuarter.quarterLabel}
                        </p>
                        <p className="text-lg font-bold text-green-700 dark:text-green-300 mt-1">
                          +₹{Math.abs(forecastData.summary.bestQuarter.pvcPerLakh).toLocaleString('en-IN', { maximumFractionDigits: 0 })} per ₹1 Lakh
                        </p>
                        <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                          Schedule steel-intensive billing in this quarter for maximum PVC benefit
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              {forecastData.summary.worstQuarter && forecastData.summary.worstQuarter.pvcPerLakh < 0 && (
                <Card className="bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-6 w-6 text-red-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-red-800 dark:text-red-300">Worst Quarter for Steel Work</p>
                        <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                          {forecastData.summary.worstQuarter.quarterLabel}
                        </p>
                        <p className="text-lg font-bold text-red-700 dark:text-red-300 mt-1">
                          -₹{Math.abs(forecastData.summary.worstQuarter.pvcPerLakh).toLocaleString('en-IN', { maximumFractionDigits: 0 })} per ₹1 Lakh
                        </p>
                        <p className="text-xs text-red-600 dark:text-red-500 mt-1">
                          Avoid scheduling steel-heavy RA bills in this quarter if possible
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Index Trend Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-blue-600" />
                {forecastData.steelType} Index Trend ({forecastData.steelCity})
              </CardTitle>
              <CardDescription>
                Monthly index values vs base index. Green area = positive PVC, Red area = negative PVC
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={forecastData.indexTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorAbove" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis
                      dataKey="monthLabel"
                      tick={{ fontSize: 11 }}
                      interval={Math.max(0, Math.floor(forecastData.indexTrend.length / 10))}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        const diff = d.value - d.baseValue;
                        return (
                          <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
                            <p className="font-medium">{d.monthLabel}</p>
                            <p>Index: <span className="font-bold">{d.value.toFixed(2)}</span></p>
                            <p>Base: <span className="font-bold">{d.baseValue.toFixed(2)}</span></p>
                            <p className={diff >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                              {diff >= 0 ? '+' : ''}{diff.toFixed(2)} ({diff >= 0 ? 'Positive PVC' : 'Negative PVC'})
                            </p>
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine
                      y={forecastData.baseIndex}
                      stroke="#ef4444"
                      strokeDasharray="5 5"
                      strokeWidth={2}
                      label={{
                        value: `Base: ${forecastData.baseIndex.toFixed(2)}`,
                        position: 'insideTopRight',
                        fill: '#ef4444',
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="url(#colorAbove)"
                      dot={false}
                      activeDot={{ r: 4, fill: '#3b82f6' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Quarter-wise PVC Impact Bar Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-600" />
                Quarter-wise PVC Impact (per ₹1 Lakh of Steel Work)
              </CardTitle>
              <CardDescription>
                Green bars = you gain PVC, Red bars = PVC deduction from your bill
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={forecastData.quarterForecasts} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="quarter" tick={{ fontSize: 12 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) => `₹${(v/1000).toFixed(0)}K`}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
                            <p className="font-medium">{d.quarterLabel}</p>
                            <p>Avg Index: <span className="font-bold">{d.averageIndex.toFixed(2)}</span></p>
                            <p>Base Index: <span className="font-bold">{d.baseIndex.toFixed(2)}</span></p>
                            <p className={d.pvcPerLakh >= 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                              PVC: {d.pvcPerLakh >= 0 ? '+' : ''}₹{d.pvcPerLakh.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </p>
                            {!d.dataComplete && (
                              <p className="text-amber-600 text-xs mt-1">⚠ Incomplete data</p>
                            )}
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine y={0} stroke="#64748b" strokeWidth={1.5} />
                    <Bar dataKey="pvcPerLakh" radius={[4, 4, 0, 0]}>
                      {forecastData.quarterForecasts.map((entry, idx) => (
                        <Cell
                          key={idx}
                          fill={entry.pvcPerLakh >= 0 ? '#22c55e' : '#ef4444'}
                          opacity={entry.dataComplete ? 1 : 0.5}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Detailed Quarter Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quarter-wise Detailed Breakdown</CardTitle>
              <CardDescription>
                Detailed PVC impact for each quarter. The PVC per ₹1 Lakh shows what you earn (green) or lose (red) on steel-only work at 100% steel component.
                For actual impact, multiply by your classification&apos;s steel percentage.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left py-3 px-4 font-medium">Quarter</th>
                      <th className="text-left py-3 px-4 font-medium">Months</th>
                      <th className="text-right py-3 px-4 font-medium">Avg Index</th>
                      <th className="text-right py-3 px-4 font-medium">Base Index</th>
                      <th className="text-right py-3 px-4 font-medium">Difference</th>
                      <th className="text-right py-3 px-4 font-medium">PVC per ₹1L</th>
                      <th className="text-center py-3 px-4 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecastData.quarterForecasts.map((q) => {
                      const diff = q.averageIndex - q.baseIndex;
                      const isBillingQ = forecastData.billingQuarter?.quarter === q.quarter;
                      return (
                        <tr
                          key={q.quarter}
                          className={`border-b transition-colors ${
                            isBillingQ
                              ? 'ring-2 ring-inset ring-blue-500 bg-blue-50/70 dark:bg-blue-950/30'
                              : q.trend === 'positive'
                              ? 'bg-green-50/50 dark:bg-green-950/20'
                              : q.trend === 'negative'
                              ? 'bg-red-50/50 dark:bg-red-950/20'
                              : ''
                          }`}
                        >
                          <td className="py-3 px-4 font-medium">
                            {q.quarter}
                            {isBillingQ && (
                              <Badge variant="outline" className="ml-2 text-xs border-blue-400 text-blue-600">
                                Your Bill
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground text-xs">
                            {q.months.join(', ')}
                          </td>
                          <td className="py-3 px-4 text-right font-mono">
                            {q.averageIndex.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono">
                            {q.baseIndex.toFixed(2)}
                          </td>
                          <td className={`py-3 px-4 text-right font-mono font-medium ${
                            diff >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {diff >= 0 ? '+' : ''}{diff.toFixed(2)}
                          </td>
                          <td className={`py-3 px-4 text-right font-mono font-bold ${
                            q.pvcPerLakh >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {q.pvcPerLakh >= 0 ? '+' : ''}₹{q.pvcPerLakh.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {q.trend === 'positive' ? (
                              <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                                <TrendingUp className="h-3 w-3 mr-1" /> Gain
                              </Badge>
                            ) : q.trend === 'negative' ? (
                              <Badge variant="destructive" className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
                                <TrendingDown className="h-3 w-3 mr-1" /> Loss
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <Minus className="h-3 w-3 mr-1" /> Neutral
                              </Badge>
                            )}
                            {!q.dataComplete && (
                              <span className="ml-1 text-amber-500 text-xs" title="Incomplete data">⚠</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Advisory Note */}
          <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Info className="h-6 w-6 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="space-y-2">
                  <p className="font-semibold text-blue-800 dark:text-blue-300">How to Use This Forecast</p>
                  <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside">
                    <li><strong>Green quarters:</strong> Steel prices are above your base — schedule steel-heavy RA bills here for positive PVC</li>
                    <li><strong>Red quarters:</strong> Steel prices are below your base — avoid steel billing or minimize steel amounts if possible</li>
                    <li><strong>PVC per ₹1L:</strong> Shows impact at 100% steel. Multiply by your actual steel % (e.g., 0.10 for 10%) for real impact</li>
                    <li><strong>Timing strategy:</strong> If current trend is rising, steel PVC will likely improve in coming quarters</li>
                    <li><strong>Note:</strong> This forecast uses actual historical data. Future index values depend on market conditions and cannot be predicted</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
