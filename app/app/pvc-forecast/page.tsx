'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { BackButton } from '@/components/ui/back-button';
import { getRailwayZoneOptions, getSteelCityForZone } from '@/lib/zone-steel-city-mapping';
import {
  TrendingUp, TrendingDown, Minus, ArrowRight, Calendar, Activity,
  AlertTriangle, CheckCircle2, XCircle, Info, BarChart3, Zap
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';

const STEEL_TYPES = [
  { value: 'Steel TMT Bars', label: 'TMT Bars' },
  { value: 'Steel Angle/Channel', label: 'Angle / Channel' },
  { value: 'Steel Plates', label: 'Plates' },
  { value: 'Steel Other Sections', label: 'Other Sections' },
];

interface BillingQuarterInfo {
  quarter: string; quarterLabel: string; months: string[];
  averageIndex: number; baseIndex: number; pvcPerLakh: number;
  trend: 'positive' | 'negative' | 'neutral'; dataComplete: boolean;
  billingMonth: string; isEstimated?: boolean;
  confidence?: 'high' | 'moderate' | 'low'; confidenceNote?: string;
}

interface ForecastData {
  contractName: string; agreementNo: string; steelType: string;
  steelCity: string; indexName: string; baseMonth: string;
  baseIndex: number; latestIndex: number; currentTrend: 'rising' | 'falling' | 'stable';
  indexTrend: Array<{ month: string; monthLabel: string; value: number; baseValue: number }>;
  quarterForecasts: Array<{
    quarter: string; quarterLabel: string; months: string[];
    averageIndex: number; baseIndex: number; pvcPerLakh: number;
    trend: 'positive' | 'negative' | 'neutral'; dataComplete: boolean;
  }>;
  billingQuarter: BillingQuarterInfo | null;
  billingQuarterUnavailable: string | null;
  summary: {
    totalQuarters: number; positiveQuarters: number; negativeQuarters: number;
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

function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${color || 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
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

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/contracts')
      .then(r => r.ok ? r.json() : [])
      .then(d => setContracts(d.contracts || d || []))
      .catch(() => {})
      .finally(() => setContractsLoading(false));
  }, [status]);

  useEffect(() => {
    const contractId = searchParams.get('contractId');
    if (contractId) setSelectedContract(contractId);
    const zoneParam = searchParams.get('zone');
    if (zoneParam) setZone(zoneParam);
  }, [searchParams]);

  const fetchForecast = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedContract && !useManualBase) {
        params.set('contractId', selectedContract);
      } else if (baseMonth) {
        params.set('baseMonth', new Date(baseMonth + '-01').toISOString());
      } else {
        setError('Please select a contract or enter a base month');
        setLoading(false); return;
      }
      params.set('zone', zone);
      params.set('steelType', steelType);
      if (billingMonth) params.set('billingMonth', new Date(billingMonth + '-01').toISOString());
      const res = await fetch(`/api/pvc-forecast?${params.toString()}`);
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed'); }
      setForecastData(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedContract, zone, steelType, baseMonth, useManualBase, billingMonth]);

  if (status === 'loading') return <div className="flex items-center justify-center min-h-[60vh]"><LoadingSpinner /></div>;
  if (status === 'unauthenticated') { router.push('/auth/signin'); return null; }

  const steelCity = getSteelCityForZone(zone);
  const selectedContractData = contracts.find(c => c.id === selectedContract);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Steel PVC Forecast</h1>
          <p className="text-sm text-gray-500 mt-0.5">Plan when to schedule steel-intensive work based on price index trends</p>
        </div>
      </div>

      {/* Parameters */}
      <div className="border border-gray-200 rounded-lg bg-white p-4 space-y-4">
        {/* Mode toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setUseManualBase(false)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${!useManualBase ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            From Contract
          </button>
          <button
            onClick={() => setUseManualBase(true)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${useManualBase ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            Manual Base Month
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Contract / Base Month */}
          {!useManualBase ? (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Contract</label>
              {contractsLoading ? <div className="h-9 flex items-center"><LoadingSpinner /></div> : (
                <Select value={selectedContract} onValueChange={setSelectedContract}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select contract" />
                  </SelectTrigger>
                  <SelectContent>
                    {contracts.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.agreementNo} — {c.workDescription?.slice(0, 35)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedContractData && (
                <p className="text-xs text-gray-400">
                  Base: {new Date(selectedContractData.baseMonth).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Base Month</label>
              <Input type="month" value={baseMonth} onChange={e => setBaseMonth(e.target.value)} className="h-9 text-sm" />
              <p className="text-xs text-gray-400">Month before date of opening</p>
            </div>
          )}

          {/* Zone */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Railway Zone</label>
            <Select value={zone} onValueChange={setZone}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {zoneOptions.map(z => <SelectItem key={z.value} value={z.value}>{z.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-400">Steel city: {steelCity}</p>
          </div>

          {/* Steel Type */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Steel Type</label>
            <Select value={steelType} onValueChange={setSteelType}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STEEL_TYPES.map(st => <SelectItem key={st.value} value={st.value}>{st.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Billing Month */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Billing Month <span className="text-gray-400">(optional)</span></label>
            <Input type="month" value={billingMonth} onChange={e => setBillingMonth(e.target.value)} className="h-9 text-sm" />
            <p className="text-xs text-gray-400">Date of measurement month</p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={fetchForecast}
            disabled={loading || (!selectedContract && !baseMonth && !useManualBase)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {loading ? <LoadingSpinner /> : <><Zap className="h-4 w-4 mr-2" />Generate Forecast</>}
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />{error}
        </div>
      )}

      {forecastData && (
        <div className="space-y-6">

          {/* Summary strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatBox
              label="Base Index"
              value={forecastData.baseIndex.toFixed(2)}
              sub={new Date(forecastData.baseMonth).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}
            />
            <StatBox
              label="Latest Index"
              value={forecastData.latestIndex.toFixed(2)}
              sub={forecastData.currentTrend === 'rising' ? '↑ Rising' : forecastData.currentTrend === 'falling' ? '↓ Falling' : '→ Stable'}
              color={forecastData.currentTrend === 'rising' ? 'text-green-600' : forecastData.currentTrend === 'falling' ? 'text-red-600' : 'text-gray-600'}
            />
            <StatBox
              label="Positive Quarters"
              value={`${forecastData.summary.positiveQuarters} / ${forecastData.summary.totalQuarters}`}
              sub="quarters with gain"
              color="text-green-600"
            />
            <StatBox
              label="Negative Quarters"
              value={`${forecastData.summary.negativeQuarters} / ${forecastData.summary.totalQuarters}`}
              sub="quarters with loss"
              color={forecastData.summary.negativeQuarters > 0 ? 'text-red-600' : 'text-gray-400'}
            />
          </div>

          {/* Best / Worst advisory */}
          {(forecastData.summary.bestQuarter || forecastData.summary.worstQuarter) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {forecastData.summary.bestQuarter && (
                <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-green-800">Best Quarter — {forecastData.summary.bestQuarter.quarterLabel}</p>
                    <p className="text-xl font-bold text-green-700">+₹{Math.abs(forecastData.summary.bestQuarter.pvcPerLakh).toLocaleString('en-IN', { maximumFractionDigits: 0 })} <span className="text-sm font-normal">per ₹1 lakh of steel work</span></p>
                    <p className="text-xs text-green-600 mt-1">Schedule steel-intensive billing here for maximum benefit</p>
                  </div>
                </div>
              )}
              {forecastData.summary.worstQuarter && forecastData.summary.worstQuarter.pvcPerLakh < 0 && (
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-800">Worst Quarter — {forecastData.summary.worstQuarter.quarterLabel}</p>
                    <p className="text-xl font-bold text-red-700">-₹{Math.abs(forecastData.summary.worstQuarter.pvcPerLakh).toLocaleString('en-IN', { maximumFractionDigits: 0 })} <span className="text-sm font-normal">per ₹1 lakh of steel work</span></p>
                    <p className="text-xs text-red-600 mt-1">Avoid steel-heavy RA bills in this quarter if possible</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Billing quarter estimated notice */}
          {forecastData.billingQuarter?.isEstimated && forecastData.billingQuarterUnavailable && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <Info className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-800">
                  Estimated Values — Based on Weighted Trend
                  {forecastData.billingQuarter.confidence && (
                    <span className={`ml-2 text-xs px-1.5 py-0.5 rounded font-normal ${
                      forecastData.billingQuarter.confidence === 'high' ? 'bg-green-100 text-green-700' :
                      forecastData.billingQuarter.confidence === 'moderate' ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {forecastData.billingQuarter.confidence.charAt(0).toUpperCase() + forecastData.billingQuarter.confidence.slice(1)} confidence
                    </span>
                  )}
                </p>
                <p className="text-amber-700 mt-1">{forecastData.billingQuarterUnavailable}</p>
              </div>
            </div>
          )}

          {/* Billing quarter fully unavailable */}
          {!forecastData.billingQuarter && forecastData.billingQuarterUnavailable && billingMonth && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-800">Billing Month Indices Not Available</p>
                <p className="text-amber-700 mt-1">{forecastData.billingQuarterUnavailable}</p>
              </div>
            </div>
          )}

          {/* Billing quarter result */}
          {forecastData.billingQuarter && (
            <div className={`border-2 rounded-lg p-5 ${
              forecastData.billingQuarter.isEstimated ? 'border-dashed ' : ''
            }${
              forecastData.billingQuarter.trend === 'positive' ? 'border-green-400 bg-green-50' :
              forecastData.billingQuarter.trend === 'negative' ? 'border-red-400 bg-red-50' :
              'border-gray-300 bg-gray-50'
            }`}>
              <div className="flex items-center gap-2 mb-4">
                <ArrowRight className="h-5 w-5 text-gray-600" />
                <h2 className="font-semibold text-gray-800">
                  Billing Month: {forecastData.billingQuarter.billingMonth}
                </h2>
                <span className="text-sm text-gray-500">({forecastData.billingQuarter.quarter} · {forecastData.billingQuarter.months.join(', ')})</span>
                {forecastData.billingQuarter.isEstimated && (
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                    forecastData.billingQuarter.confidence === 'high' ? 'bg-green-100 text-green-700' :
                    forecastData.billingQuarter.confidence === 'low' ? 'bg-red-100 text-red-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    ≈ Estimated
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Quarter Avg Index</p>
                  <p className="text-xl font-bold">{forecastData.billingQuarter.averageIndex.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Base Index</p>
                  <p className="text-xl font-bold">{forecastData.billingQuarter.baseIndex.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Difference</p>
                  <p className={`text-xl font-bold ${forecastData.billingQuarter.averageIndex >= forecastData.billingQuarter.baseIndex ? 'text-green-600' : 'text-red-600'}`}>
                    {(forecastData.billingQuarter.averageIndex - forecastData.billingQuarter.baseIndex) >= 0 ? '+' : ''}
                    {(forecastData.billingQuarter.averageIndex - forecastData.billingQuarter.baseIndex).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Steel PVC per ₹1 Lakh</p>
                  <p className={`text-2xl font-bold ${forecastData.billingQuarter.pvcPerLakh >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {forecastData.billingQuarter.pvcPerLakh >= 0 ? '+' : ''}₹{forecastData.billingQuarter.pvcPerLakh.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>
              {forecastData.billingQuarter.trend === 'negative' && (
                <div className="mt-4 flex items-start gap-2 p-3 bg-red-100 rounded text-sm text-red-800">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>Warning:</strong> Billing in {forecastData.billingQuarter.billingMonth} results in negative steel PVC.
                    {forecastData.summary.bestQuarter?.pvcPerLakh > 0 && (
                      <> Consider <strong>{forecastData.summary.bestQuarter.quarterLabel}</strong> instead (+₹{forecastData.summary.bestQuarter.pvcPerLakh.toLocaleString('en-IN', { maximumFractionDigits: 0 })} per lakh).</>
                    )}
                  </span>
                </div>
              )}
              {forecastData.billingQuarter.trend === 'positive' && (
                <div className="mt-4 flex items-center gap-2 p-3 bg-green-100 rounded text-sm text-green-800">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  <strong>Good choice!</strong> Billing in {forecastData.billingQuarter.billingMonth} gives positive steel PVC.
                </div>
              )}
            </div>
          )}

          {/* Index trend chart */}
          <div className="border border-gray-200 rounded-lg bg-white p-4">
            <div className="mb-3">
              <h2 className="font-semibold text-gray-900">{forecastData.steelType} Index — {forecastData.steelCity}</h2>
              <p className="text-xs text-gray-500 mt-0.5">Monthly index vs base. Area above red line = positive PVC territory.</p>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={forecastData.indexTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="monthLabel" tick={{ fontSize: 11 }} interval={Math.max(0, Math.floor(forecastData.indexTrend.length / 10))} />
                  <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    const diff = d.value - d.baseValue;
                    return (
                      <div className="bg-white border border-gray-200 rounded shadow-lg p-3 text-sm">
                        <p className="font-medium text-gray-700">{d.monthLabel}</p>
                        <p>Index: <span className="font-bold">{d.value.toFixed(2)}</span></p>
                        <p>Base: <span className="font-bold">{d.baseValue.toFixed(2)}</span></p>
                        <p className={diff >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                          {diff >= 0 ? '+' : ''}{diff.toFixed(2)} ({diff >= 0 ? 'Positive PVC' : 'Negative PVC'})
                        </p>
                      </div>
                    );
                  }} />
                  <ReferenceLine y={forecastData.baseIndex} stroke="#ef4444" strokeDasharray="5 5" strokeWidth={1.5}
                    label={{ value: `Base ${forecastData.baseIndex.toFixed(2)}`, position: 'insideTopRight', fill: '#ef4444', fontSize: 11 }} />
                  <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fill="url(#areaGrad)" dot={false} activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Quarter PVC bar chart */}
          <div className="border border-gray-200 rounded-lg bg-white p-4">
            <div className="mb-3">
              <h2 className="font-semibold text-gray-900">Quarter-wise PVC Impact</h2>
              <p className="text-xs text-gray-500 mt-0.5">Amount you gain (green) or lose (red) per ₹1 lakh of steel work</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={forecastData.quarterForecasts} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="quarter" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}K`} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white border border-gray-200 rounded shadow-lg p-3 text-sm">
                        <p className="font-medium text-gray-700">{d.quarterLabel}</p>
                        <p>Avg Index: <span className="font-bold">{d.averageIndex.toFixed(2)}</span></p>
                        <p>Base Index: <span className="font-bold">{d.baseIndex.toFixed(2)}</span></p>
                        <p className={d.pvcPerLakh >= 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                          PVC: {d.pvcPerLakh >= 0 ? '+' : ''}₹{d.pvcPerLakh.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </p>
                        {!d.dataComplete && <p className="text-amber-600 text-xs mt-1">⚠ Incomplete data</p>}
                      </div>
                    );
                  }} />
                  <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} />
                  <Bar dataKey="pvcPerLakh" radius={[3, 3, 0, 0]}>
                    {forecastData.quarterForecasts.map((entry, idx) => (
                      <Cell key={idx} fill={entry.pvcPerLakh >= 0 ? '#22c55e' : '#ef4444'} opacity={entry.dataComplete ? 1 : 0.5} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Quarter detail table */}
          <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Quarter-wise Breakdown</h2>
              <p className="text-xs text-gray-500 mt-0.5">PVC per ₹1L assumes 100% steel component — multiply by your classification's steel % for actual impact</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Quarter</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Months</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Avg Index</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Base Index</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Diff</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">PVC per ₹1L</th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {forecastData.quarterForecasts.map((q) => {
                    const diff = q.averageIndex - q.baseIndex;
                    const isBillingQ = forecastData.billingQuarter?.quarter === q.quarter;
                    return (
                      <tr key={q.quarter} className={`${isBillingQ ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : q.trend === 'positive' ? 'bg-green-50/40' : q.trend === 'negative' ? 'bg-red-50/40' : ''}`}>
                        <td className="px-4 py-2.5 font-medium text-gray-800">
                          {q.quarter}
                          {isBillingQ && <span className="ml-2 text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">Your Bill</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">{q.months.join(', ')}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-700">{q.averageIndex.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-700">{q.baseIndex.toFixed(2)}</td>
                        <td className={`px-4 py-2.5 text-right font-mono font-semibold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {diff >= 0 ? '+' : ''}{diff.toFixed(2)}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono font-bold ${q.pvcPerLakh >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {q.pvcPerLakh >= 0 ? '+' : ''}₹{q.pvcPerLakh.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          {!q.dataComplete && <span className="ml-1 text-amber-500 text-xs">⚠</span>}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {q.trend === 'positive' ? (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                              <TrendingUp className="h-3 w-3" /> Gain
                            </span>
                          ) : q.trend === 'negative' ? (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
                              <TrendingDown className="h-3 w-3" /> Loss
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-medium">
                              <Minus className="h-3 w-3" /> Neutral
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* How to use */}
          <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm">
            <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1 text-blue-800">
              <p className="font-semibold">How to read this forecast</p>
              <ul className="space-y-0.5 text-blue-700 list-disc list-inside">
                <li><strong>Green quarters:</strong> Steel prices above base — positive PVC, schedule steel-heavy bills here</li>
                <li><strong>Red quarters:</strong> Steel prices below base — avoid steel billing or minimise steel amounts</li>
                <li><strong>PVC per ₹1L:</strong> At 100% steel. Multiply by actual steel % (e.g. ×0.10 for 10%) for real impact</li>
                <li><strong>Rising trend:</strong> Steel PVC will likely improve in upcoming quarters</li>
                <li>Future values depend on market — historical data only, not a guaranteed prediction</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
