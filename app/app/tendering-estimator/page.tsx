'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BackButton } from '@/components/ui/back-button';
import { getRailwayZoneOptions } from '@/lib/zone-steel-city-mapping';
import { useLanguage } from '@/components/i18n-provider';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2, BarChart3, Sparkles, CheckCircle2, AlertTriangle, ChevronRight,
  ChevronLeft, BrainCircuit, RefreshCw, ShieldAlert, Lightbulb, Target,
  Activity, TrendingUp, ArrowRight
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, PieChart, Pie, Cell
} from 'recharts';

interface CoefficientSet {
  labor: number;
  cement: number;
  steel: number;
  fuel: number;
  materials: number;
  machinery: number;
  explosives: number;
  fixed: number;
}

const PRESETS: Record<string, { label: string; coefficients: CoefficientSet }> = {
  bridge:    { label: 'Bridge Works',           coefficients: { labor: 25, cement: 15, steel: 30, fuel: 10, materials: 10, machinery: 5,  explosives: 0, fixed: 5  } },
  earthwork: { label: 'Earthwork & Excavation', coefficients: { labor: 30, cement: 0,  steel: 0,  fuel: 35, materials: 15, machinery: 10, explosives: 0, fixed: 10 } },
  track:     { label: 'Track Laying & Ballast', coefficients: { labor: 35, cement: 5,  steel: 20, fuel: 15, materials: 15, machinery: 0,  explosives: 0, fixed: 10 } },
  station:   { label: 'Station Buildings',      coefficients: { labor: 25, cement: 20, steel: 15, fuel: 10, materials: 15, machinery: 5,  explosives: 0, fixed: 10 } },
  signaling: { label: 'Signaling & Telecom',    coefficients: { labor: 30, cement: 0,  steel: 5,  fuel: 10, materials: 40, machinery: 5,  explosives: 0, fixed: 10 } },
  custom:    { label: 'Custom',                 coefficients: { labor: 0,  cement: 0,  steel: 0,  fuel: 0,  materials: 0,  machinery: 0,  explosives: 0, fixed: 100 } },
};

const COEFF_COLORS: Record<string, string> = {
  labor: '#6366f1', cement: '#3b82f6', steel: '#10b981',
  fuel: '#f59e0b', materials: '#ec4899', machinery: '#8b5cf6',
  explosives: '#ef4444', fixed: '#94a3b8',
};

const COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b'];

const STEEL_TYPES = [
  { value: 'TMT',            label: 'TMT Bars' },
  { value: 'ANGLE_CHANNEL',  label: 'Angles / Channels' },
  { value: 'PLATES',         label: 'Steel Plates' },
  { value: 'OTHER_SECTIONS', label: 'Other Sections' },
];

export default function TenderingEstimatorPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();

  // Wizard step: 1 = contract details, 2 = coefficients
  const [step, setStep] = useState(1);

  // Step 1 state
  const [tenderTitle, setTenderTitle] = useState('');
  const [projectValue, setProjectValue] = useState<number>(50000000);
  const [duration, setDuration] = useState<number>(18);
  const [startMonth, setStartMonth] = useState('2026-07');
  const [baseMonth, setBaseMonth] = useState('2026-06');
  const [zone, setZone] = useState('SR');
  const [selectedSteelTypes, setSelectedSteelTypes] = useState<string[]>(['TMT']);

  // Step 2 state
  const [classificationGroups, setClassificationGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [selectedSubId, setSelectedSubId] = useState<string>('');
  const [selectedPreset, setSelectedPreset] = useState<string>('bridge');
  const [loadingClassifications, setLoadingClassifications] = useState(true);
  const [coefficients, setCoefficients] = useState<CoefficientSet>({ ...PRESETS.bridge.coefficients });

  // Results state
  const [forecastResult, setForecastResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI insights state
  const [aiInsights, setAiInsights] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const zoneOptions = useMemo(() => getRailwayZoneOptions(), []);

  useEffect(() => {
    const fetchClassifications = async () => {
      try {
        const res = await fetch('/api/classification-groups');
        if (res.ok) {
          const data = await res.json();
          const groups = data.groups || [];
          setClassificationGroups(groups);
          if (groups.length > 0) {
            setSelectedGroupId(groups[0].id);
            const firstSub = groups[0].subClassifications?.[0];
            if (firstSub) {
              setSelectedSubId(firstSub.id);
              setCoefficients({
                labor: firstSub.labour || 0, cement: firstSub.cement || 0,
                steel: firstSub.steel || 0, fuel: firstSub.fuel || 0,
                materials: firstSub.otherMaterials || 0, machinery: firstSub.plantMachinery || 0,
                explosives: firstSub.explosives || 0, fixed: firstSub.fixed || 0,
              });
            }
          }
        }
      } catch (err) {
        console.error('Failed to load classifications:', err);
      } finally {
        setLoadingClassifications(false);
      }
    };
    fetchClassifications();
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin');
  }, [status, router]);

  const handlePresetChange = (val: string) => {
    setSelectedPreset(val);
    setCoefficients({ ...PRESETS[val].coefficients });
  };

  const handleSubClassificationChange = (subId: string) => {
    setSelectedSubId(subId);
    if (!subId) return;
    const group = classificationGroups.find(g => g.subClassifications.some((s: any) => s.id === subId));
    const sub = group?.subClassifications.find((s: any) => s.id === subId);
    if (!sub) return;
    setCoefficients({
      labor: sub.labour || 0, cement: sub.cement || 0, steel: sub.steel || 0,
      fuel: sub.fuel || 0, materials: sub.otherMaterials || 0,
      machinery: sub.plantMachinery || 0, explosives: sub.explosives || 0, fixed: sub.fixed || 0,
    });
  };

  const handleCoefficientChange = (field: keyof CoefficientSet, value: number) => {
    setCoefficients(prev => {
      const next = { ...prev, [field]: value };
      if (selectedGroupId !== 'presets' || selectedPreset !== 'custom') {
        setSelectedGroupId('presets');
        setSelectedPreset('custom');
      }
      const sumOfOthers = Object.keys(next).filter(k => k !== 'fixed').reduce((s, k) => s + (next[k as keyof CoefficientSet] || 0), 0);
      next.fixed = Math.max(0, 100 - sumOfOthers);
      return next;
    });
  };

  const coefficientSum = useMemo(() => Object.values(coefficients).reduce((a, b) => a + b, 0), [coefficients]);

  const handleCalculate = async () => {
    if (coefficientSum !== 100) { setError('Coefficients must sum to 100%'); return; }
    setLoading(true);
    setError(null);
    setAiInsights(null);
    setAiError(null);
    try {
      const res = await fetch('/api/pvc-forecast/tendering', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totalValue: projectValue, duration, startMonth, baseMonth, zone, steelTypes: selectedSteelTypes, coefficients }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      setForecastResult(await res.json());
    } catch (err: any) {
      setError(err.message || 'Calculation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateAiInsights = async () => {
    if (!forecastResult) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch('/api/pvc-forecast/tendering/ai-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(forecastResult),
      });
      const data = await res.json();
      if (data.success) setAiInsights(data.analysis);
      else setAiError(data.error || 'Failed to generate AI insights');
    } catch (err: any) {
      setAiError(err.message || 'AI analysis failed');
    } finally {
      setAiLoading(false);
    }
  };

  if (status === 'loading') {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>;
  }

  const chartData = forecastResult?.scenarios.baseline.quarterBreakdown.map((q: any, idx: number) => ({
    name: `Q${idx + 1}`,
    baseline: q.pvcAmount,
    aggressive: forecastResult.scenarios.aggressive.quarterBreakdown[idx].pvcAmount,
    conservative: forecastResult.scenarios.conservative.quarterBreakdown[idx].pvcAmount,
  })) ?? [];

  const pieData = forecastResult
    ? Object.keys(forecastResult.scenarios.baseline.quarterBreakdown[0].components)
        .map(key => ({
          name: key.toUpperCase(),
          value: forecastResult.scenarios.baseline.quarterBreakdown.reduce((s: number, q: any) => s + (q.components[key] || 0), 0),
        }))
        .filter(d => d.value > 0)
    : [];

  const formatCr = (v: number) => v >= 10000000 ? `₹${(v / 10000000).toFixed(2)} Cr` : v >= 100000 ? `₹${(v / 100000).toFixed(1)} L` : `₹${v.toLocaleString()}`;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BackButton href="/dashboard" className="text-slate-500 hover:text-slate-700" />
            <div>
              <h1 className="text-base font-bold text-slate-900">PVC Tendering Estimator</h1>
              <p className="text-[11px] text-slate-400 hidden sm:block">Forecast price escalation payouts before you bid</p>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full">
            <Sparkles className="h-3 w-3" /> Premium Feature
          </span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* === WIZARD (shown when no results yet) === */}
        {!forecastResult ? (
          <div className="max-w-2xl mx-auto">
            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-8">
              {[{ n: 1, label: 'Contract Details' }, { n: 2, label: 'PVC Coefficients' }].map((s, i) => (
                <div key={s.n} className="flex items-center gap-2 flex-1">
                  <button
                    onClick={() => s.n < step && setStep(s.n)}
                    className={`flex items-center gap-2 ${s.n < step ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      step === s.n ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' :
                      step > s.n  ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
                    }`}>
                      {step > s.n ? <CheckCircle2 className="h-4 w-4" /> : s.n}
                    </span>
                    <span className={`text-sm font-semibold hidden sm:block ${step === s.n ? 'text-slate-800' : 'text-slate-400'}`}>{s.label}</span>
                  </button>
                  {i < 1 && <div className={`flex-1 h-px mx-2 transition-all ${step > 1 ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
                </div>
              ))}
            </div>

            {/* Step 1 */}
            {step === 1 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Contract Details</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Basic information about the tender you're bidding on</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Tender Name / Reference</label>
                  <Input
                    placeholder="e.g. Doubling Works — Trichy Division"
                    value={tenderTitle}
                    onChange={e => setTenderTitle(e.target.value)}
                    className="h-10 border-slate-200 focus:ring-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contract Value (₹)</label>
                    <Input
                      type="number"
                      value={projectValue}
                      onChange={e => setProjectValue(Number(e.target.value))}
                      className="h-10 border-slate-200"
                    />
                    <p className="text-[10px] text-slate-400">{formatCr(projectValue)}</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Duration (Months)</label>
                    <Input
                      type="number"
                      value={duration}
                      onChange={e => setDuration(Number(e.target.value))}
                      min={1}
                      className="h-10 border-slate-200"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Tender Base Month</label>
                    <Input type="month" value={baseMonth} onChange={e => setBaseMonth(e.target.value)} className="h-10 border-slate-200" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Work Start Month</label>
                    <Input type="month" value={startMonth} onChange={e => setStartMonth(e.target.value)} className="h-10 border-slate-200" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Railway Zone</label>
                  <Select value={zone} onValueChange={setZone}>
                    <SelectTrigger className="h-10 border-slate-200">
                      <SelectValue placeholder="Select zone" />
                    </SelectTrigger>
                    <SelectContent>
                      {zoneOptions.map(z => <SelectItem key={z.value} value={z.value}>{z.value} — {z.label || z.value}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Steel Price Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {STEEL_TYPES.map(s => (
                      <label
                        key={s.value}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-all text-sm font-medium select-none ${
                          selectedSteelTypes.includes(s.value)
                            ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <Checkbox
                          checked={selectedSteelTypes.includes(s.value)}
                          onCheckedChange={checked => {
                            setSelectedSteelTypes(prev =>
                              checked ? [...prev, s.value] : prev.length > 1 ? prev.filter(t => t !== s.value) : prev
                            );
                          }}
                          className="border-slate-300"
                        />
                        {s.label}
                      </label>
                    ))}
                  </div>
                </div>

                <Button
                  onClick={() => setStep(2)}
                  className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl"
                >
                  Next: Set PVC Coefficients
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}

            {/* Step 2 */}
            {step === 2 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">PVC Coefficients</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Set the work component weightings for the GCC escalation formula</p>
                </div>

                {/* Classification picker */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Classification</label>
                    <Select
                      value={selectedGroupId}
                      onValueChange={val => {
                        setSelectedGroupId(val);
                        if (val === 'presets') {
                          handlePresetChange('bridge');
                        } else {
                          const group = classificationGroups.find(g => g.id === val);
                          if (group?.subClassifications?.[0]) handleSubClassificationChange(group.subClassifications[0].id);
                        }
                      }}
                      disabled={loadingClassifications}
                    >
                      <SelectTrigger className="h-10 border-slate-200">
                        <SelectValue placeholder={loadingClassifications ? 'Loading...' : 'Select'} />
                      </SelectTrigger>
                      <SelectContent>
                        {classificationGroups.map(g => <SelectItem key={g.id} value={g.id}>{g.code} – {g.name}</SelectItem>)}
                        <SelectItem value="presets">Quick Presets</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Sub-type</label>
                    {selectedGroupId === 'presets' ? (
                      <Select value={selectedPreset} onValueChange={handlePresetChange}>
                        <SelectTrigger className="h-10 border-slate-200"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.keys(PRESETS).map(k => <SelectItem key={k} value={k}>{PRESETS[k].label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select value={selectedSubId} onValueChange={handleSubClassificationChange} disabled={!selectedGroupId}>
                        <SelectTrigger className="h-10 border-slate-200"><SelectValue placeholder="Select sub-type" /></SelectTrigger>
                        <SelectContent>
                          {classificationGroups.find(g => g.id === selectedGroupId)?.subClassifications.map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>{s.code} – {s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                {/* Coefficient inputs */}
                <div className="space-y-3">
                  {(Object.keys(coefficients) as Array<keyof CoefficientSet>).map(key => {
                    const val = coefficients[key] || 0;
                    const isFixed = key === 'fixed';
                    return (
                      <div key={key} className="flex items-center gap-3">
                        <div className="w-24 shrink-0">
                          <span className="text-xs font-semibold text-slate-600 capitalize">{key === 'fixed' ? 'Fixed (W)' : key}</span>
                        </div>
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${Math.min(val, 100)}%`, backgroundColor: COEFF_COLORS[key] }}
                          />
                        </div>
                        <Input
                          type="number"
                          value={val}
                          onChange={e => !isFixed && handleCoefficientChange(key, Number(e.target.value))}
                          disabled={isFixed}
                          min={0}
                          max={100}
                          className={`w-16 h-8 text-center text-sm border-slate-200 p-1 ${isFixed ? 'bg-slate-50 text-slate-400' : ''}`}
                        />
                        <span className="text-xs text-slate-400 w-4">%</span>
                      </div>
                    );
                  })}
                </div>

                {/* Sum indicator */}
                <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-semibold ${
                  coefficientSum === 100 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : coefficientSum > 100  ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  <span>Total</span>
                  <span>{coefficientSum}% {coefficientSum === 100 ? '✓' : `(${100 - coefficientSum > 0 ? '+' : ''}${100 - coefficientSum} remaining)`}</span>
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <Button variant="outline" onClick={() => setStep(1)} className="flex-1 h-11 border-slate-200 text-slate-600 rounded-xl">
                    <ChevronLeft className="h-4 w-4 mr-1" /> Back
                  </Button>
                  <Button
                    onClick={handleCalculate}
                    disabled={loading || coefficientSum !== 100}
                    className="flex-[2] h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl"
                  >
                    {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Calculating...</> : 'Calculate Forecast'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ============================================================
             RESULTS DASHBOARD
          ============================================================ */
          <div className="space-y-6">
            {/* Results header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                {tenderTitle && <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Forecast for</p>}
                <h2 className="text-xl font-bold text-slate-900">{tenderTitle || 'Forecast Results'}</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {formatCr(projectValue)} · {duration} months · Zone {zone} · {forecastResult.contractDetails.baseMonth}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => { setForecastResult(null); setAiInsights(null); setStep(2); }}
                className="border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl h-9 text-sm"
              >
                Edit & Recalculate
              </Button>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {
                  label: 'Recommended Loading',
                  value: `+${forecastResult.biddingIntelligence.recommendedLoadingPercent}%`,
                  sub: 'Markup to hedge fixed-cost inflation',
                  color: 'text-indigo-600',
                  bg: 'bg-indigo-50',
                },
                {
                  label: 'Projected PVC Payout',
                  value: formatCr(forecastResult.scenarios.baseline.totalPvc),
                  sub: 'Baseline escalation recovery',
                  color: 'text-blue-600',
                  bg: 'bg-blue-50',
                },
                {
                  label: 'Cost Inflation',
                  value: formatCr(forecastResult.biddingIntelligence.totalProjectedCostInflation),
                  sub: 'Total projected cost increase',
                  color: 'text-amber-600',
                  bg: 'bg-amber-50',
                },
                {
                  label: 'Risk Rating',
                  value: forecastResult.biddingIntelligence.riskLevel.toUpperCase(),
                  sub: 'Overall inflation volatility',
                  color: forecastResult.biddingIntelligence.riskLevel === 'high' ? 'text-red-600' : forecastResult.biddingIntelligence.riskLevel === 'moderate' ? 'text-amber-600' : 'text-emerald-600',
                  bg: forecastResult.biddingIntelligence.riskLevel === 'high' ? 'bg-red-50' : forecastResult.biddingIntelligence.riskLevel === 'moderate' ? 'bg-amber-50' : 'bg-emerald-50',
                },
              ].map(card => (
                <div key={card.label} className={`${card.bg} rounded-2xl p-4 border border-white`}>
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{card.label}</p>
                  <p className={`text-2xl font-black mt-1 ${card.color}`}>{card.value}</p>
                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">{card.sub}</p>
                </div>
              ))}
            </div>

            {/* Recommendation strip */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-start gap-4">
              <div className="p-2.5 bg-indigo-100 rounded-xl shrink-0">
                <Sparkles className="h-5 w-5 text-indigo-600" />
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">
                Raw price inflation is projected to cost <strong className="text-slate-900">₹{forecastResult.biddingIntelligence.totalProjectedCostInflation.toLocaleString()}</strong> over {duration} months.
                GCC escalation compensates <strong className="text-slate-900">₹{forecastResult.scenarios.baseline.totalPvc.toLocaleString()}</strong>.
                To protect your margin, <strong className="text-indigo-700">load your base quote by +{forecastResult.biddingIntelligence.recommendedLoadingPercent}%</strong>.
              </p>
            </div>

            {/* AI Insights */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-violet-100 rounded-xl shrink-0">
                    <BrainCircuit className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm">AI Market Intelligence</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Real-time analysis of index trends, risks, and bid strategy</p>
                    {forecastResult.dataFreshness && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {Object.entries(forecastResult.dataFreshness).map(([key, val]) => (
                          <span key={key} className="text-[10px] font-medium bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                            {key}: {String(val)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  onClick={handleGenerateAiInsights}
                  disabled={aiLoading}
                  className="shrink-0 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl px-5 h-10"
                >
                  {aiLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analysing...</>
                    : aiInsights ? <><RefreshCw className="h-4 w-4 mr-2" />Regenerate</>
                    : <><Sparkles className="h-4 w-4 mr-2" />Generate AI Insights</>}
                </Button>
              </div>

              {aiError && (
                <div className="mt-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {aiError}
                </div>
              )}

              {aiInsights && (
                <div className="mt-5 space-y-4">
                  {/* Market Outlook */}
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5 text-indigo-500" /> Market Outlook
                    </p>
                    <p className="text-sm text-slate-700 leading-relaxed">{aiInsights.marketOutlook}</p>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    {/* Key Findings */}
                    {aiInsights.keyFindings?.length > 0 && (
                      <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                        <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <Target className="h-3.5 w-3.5" /> Key Findings
                        </p>
                        <ul className="space-y-2">
                          {aiInsights.keyFindings.map((f: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                              <CheckCircle2 className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" /> {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Bid Strategy */}
                    {aiInsights.bidStrategy && (
                      <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                        <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Lightbulb className="h-3.5 w-3.5" /> Bid Strategy
                        </p>
                        <p className="text-xs font-bold text-slate-800 mb-2">{aiInsights.bidStrategy.headline}</p>
                        <div className="space-y-1.5 text-xs text-slate-600">
                          {aiInsights.bidStrategy.loading && <p>{aiInsights.bidStrategy.loading}</p>}
                          {aiInsights.bidStrategy.contingency && <p className="font-medium text-emerald-700">→ {aiInsights.bidStrategy.contingency}</p>}
                        </div>
                      </div>
                    )}

                    {/* Red Flags */}
                    {aiInsights.redFlags?.length > 0 && (
                      <div className="bg-red-50 rounded-xl p-4 border border-red-100">
                        <p className="text-[11px] font-bold text-red-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <ShieldAlert className="h-3.5 w-3.5" /> Red Flags
                        </p>
                        <ul className="space-y-2">
                          {aiInsights.redFlags.map((f: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                              <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" /> {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Opportunities */}
                    {aiInsights.opportunities?.length > 0 && (
                      <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                        <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <TrendingUp className="h-3.5 w-3.5" /> Opportunities
                        </p>
                        <ul className="space-y-2">
                          {aiInsights.opportunities.map((o: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                              <CheckCircle2 className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" /> {o}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Component Insights */}
                  {aiInsights.componentInsights?.length > 0 && (
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <BarChart3 className="h-3.5 w-3.5 text-slate-400" /> Component Insights
                      </p>
                      <div className="grid sm:grid-cols-2 gap-3">
                        {aiInsights.componentInsights.map((c: any, i: number) => (
                          <div key={i} className="bg-white rounded-lg border border-slate-200 p-3">
                            <p className="text-[11px] font-black text-slate-600 uppercase">{c.component}</p>
                            <p className="text-xs text-slate-600 mt-0.5">{c.insight}</p>
                            {c.action && <p className="text-xs text-indigo-600 font-semibold mt-1.5 flex items-center gap-1"><ArrowRight className="h-3 w-3" />{c.action}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {aiInsights.confidenceNote && (
                    <p className="text-[10px] text-slate-400 italic">{aiInsights.confidenceNote}</p>
                  )}
                </div>
              )}
            </div>

            {/* Charts row */}
            <div className="grid md:grid-cols-3 gap-4">
              {/* Scenario chart */}
              <div className="md:col-span-2 bg-white border border-slate-200 rounded-2xl p-5">
                <h3 className="font-bold text-slate-800 text-sm mb-1">Escalation Cash-Flow by Quarter</h3>
                <p className="text-xs text-slate-400 mb-4">Projected PVC payouts across 3 market scenarios</p>
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gBaseline" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} /><stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gAggressive" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gConservative" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} /><stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" stroke="#cbd5e1" fontSize={11} tickLine={false} />
                      <YAxis stroke="#cbd5e1" fontSize={11} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: any) => [`₹${Number(v).toLocaleString()}`, '']} labelFormatter={l => `Quarter ${l}`} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      <Area type="monotone" dataKey="aggressive" name="Aggressive" stroke="#10b981" strokeWidth={2} fill="url(#gAggressive)" />
                      <Area type="monotone" dataKey="baseline" name="Baseline" stroke="#6366f1" strokeWidth={2} fill="url(#gBaseline)" />
                      <Area type="monotone" dataKey="conservative" name="Conservative" stroke="#f59e0b" strokeWidth={2} fill="url(#gConservative)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Pie + component risk */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col">
                <h3 className="font-bold text-slate-800 text-sm mb-4">Component Contribution</h3>
                <div className="h-36 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={2} dataKey="value">
                        {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => `₹${Number(v).toLocaleString()}`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {pieData.map((d, i) => (
                    <span key={d.name} className="flex items-center gap-1 text-[10px] font-semibold text-slate-600">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      {d.name}
                    </span>
                  ))}
                </div>
                {/* Risk badges */}
                <div className="mt-4 space-y-1.5">
                  {forecastResult.biddingIntelligence.componentRisks.filter((c: any) => (coefficients[c.key as keyof CoefficientSet] || 0) > 0).map((c: any) => (
                    <div key={c.key} className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 capitalize font-medium">{c.key}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        c.risk === 'high' ? 'bg-red-100 text-red-700' :
                        c.risk === 'moderate' ? 'bg-amber-100 text-amber-700' :
                        'bg-emerald-100 text-emerald-700'
                      }`}>{c.risk}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Monthly index table */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-800 text-sm">Projected Index Values</h3>
                <p className="text-xs text-slate-400 mt-0.5">Month-by-month baseline projections for active components</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wide">
                    <tr>
                      <th className="px-5 py-3 text-left">Month</th>
                      {(['labor', 'cement', 'steel', 'fuel', 'materials', 'machinery', 'explosives'] as Array<keyof Omit<CoefficientSet, 'fixed'>>).map(key =>
                        (coefficients[key] || 0) > 0 ? <th key={key} className="px-4 py-3 text-right">{key}</th> : null
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {forecastResult.monthlyIndexTrends.map((t: any) => (
                      <tr key={t.month} className="hover:bg-slate-50/50">
                        <td className="px-5 py-2.5 font-medium text-slate-700">{t.month}</td>
                        {(['labor', 'cement', 'steel', 'fuel', 'materials', 'machinery', 'explosives'] as Array<keyof Omit<CoefficientSet, 'fixed'>>).map(key => {
                          if ((coefficients[key] || 0) === 0) return null;
                          const val = t[`${key}_baseline`]?.toFixed(1);
                          const base = t[`${key}_base`]?.toFixed(1);
                          const change = t[`${key}_base`] > 0 ? ((t[`${key}_baseline`] - t[`${key}_base`]) / t[`${key}_base`] * 100) : 0;
                          return (
                            <td key={key} className="px-4 py-2.5 text-right">
                              <span className="font-medium text-slate-800">{val}</span>
                              <span className={`ml-1.5 text-[10px] ${change > 0 ? 'text-emerald-500' : change < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                                {change > 0 ? '+' : ''}{change.toFixed(1)}%
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
