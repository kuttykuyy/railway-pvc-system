'use client';

import { useState, useEffect, useMemo, startTransition } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BackButton } from '@/components/ui/back-button';
import { getRailwayZoneOptions } from '@/lib/zone-steel-city-mapping';
import { useLanguage } from '@/components/i18n-provider';
import { Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  TrendingUp, TrendingDown, Minus, Info, BarChart3, Calculator, Percent,
  Sparkles, CheckCircle2, AlertTriangle, ArrowRight, Download, Calendar, HelpCircle
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell
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
  bridge: {
    label: 'Bridge Works (High Steel/Cement)',
    coefficients: { labor: 25, cement: 15, steel: 30, fuel: 10, materials: 10, machinery: 5, explosives: 0, fixed: 5 }
  },
  earthwork: {
    label: 'Earthwork & Excavation (High Fuel/Labor)',
    coefficients: { labor: 30, cement: 0, steel: 0, fuel: 35, materials: 15, machinery: 10, explosives: 0, fixed: 10 }
  },
  track: {
    label: 'Track Laying & Ballast (High Labor/Materials)',
    coefficients: { labor: 35, cement: 5, steel: 20, fuel: 15, materials: 15, machinery: 0, explosives: 0, fixed: 10 }
  },
  station: {
    label: 'Station Buildings (General Civil)',
    coefficients: { labor: 25, cement: 20, steel: 15, fuel: 10, materials: 15, machinery: 5, explosives: 0, fixed: 10 }
  },
  signaling: {
    label: 'Signaling & Telecom (High Materials/Labor)',
    coefficients: { labor: 30, cement: 0, steel: 5, fuel: 10, materials: 40, machinery: 5, explosives: 0, fixed: 10 }
  },
  custom: {
    label: 'Custom (Manual Entry)',
    coefficients: { labor: 0, cement: 0, steel: 0, fuel: 0, materials: 0, machinery: 0, explosives: 0, fixed: 100 }
  }
};

const COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b'];

export default function TenderingEstimatorPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t, language } = useLanguage();

  const [tenderTitle, setTenderTitle] = useState('');
  const [projectValue, setProjectValue] = useState<number>(50000000); // 5 Crores
  const [duration, setDuration] = useState<number>(18);
  const [startMonth, setStartMonth] = useState('2026-07');
  const [baseMonth, setBaseMonth] = useState('2026-06');
  const [zone, setZone] = useState('SR');
  const [selectedSteelTypes, setSelectedSteelTypes] = useState<string[]>(['TMT']);
  const [selectedPreset, setSelectedPreset] = useState<string>('bridge');

  // Database classifications state
  const [classificationGroups, setClassificationGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [selectedSubId, setSelectedSubId] = useState<string>('');
  const [loadingClassifications, setLoadingClassifications] = useState(true);

  const [coefficients, setCoefficients] = useState<CoefficientSet>({ ...PRESETS.bridge.coefficients });

  const [forecastResult, setForecastResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const zoneOptions = useMemo(() => getRailwayZoneOptions(), []);

  // Fetch classifications on mount
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
            if (groups[0].subClassifications && groups[0].subClassifications.length > 0) {
              const firstSub = groups[0].subClassifications[0];
              setSelectedSubId(firstSub.id);
              setCoefficients({
                labor: firstSub.labour || 0,
                cement: firstSub.cement || 0,
                steel: firstSub.steel || 0,
                fuel: firstSub.fuel || 0,
                materials: firstSub.otherMaterials || 0,
                machinery: firstSub.plantMachinery || 0,
                explosives: firstSub.explosives || 0,
                fixed: firstSub.fixed || 0
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

  // Update coefficients when preset changes
  const handlePresetChange = (val: string) => {
    setSelectedPreset(val);
    setCoefficients({ ...PRESETS[val].coefficients });
  };

  // Update coefficients when sub-classification changes
  const handleSubClassificationChange = (subId: string) => {
    setSelectedSubId(subId);
    if (!subId) return;

    const group = classificationGroups.find(g => g.subClassifications.some((s: any) => s.id === subId));
    if (!group) return;
    const sub = group.subClassifications.find((s: any) => s.id === subId);
    if (!sub) return;

    setCoefficients({
      labor: sub.labour || 0,
      cement: sub.cement || 0,
      steel: sub.steel || 0,
      fuel: sub.fuel || 0,
      materials: sub.otherMaterials || 0,
      machinery: sub.plantMachinery || 0,
      explosives: sub.explosives || 0,
      fixed: sub.fixed || 0
    });
  };

  const handleCoefficientChange = (field: keyof CoefficientSet, value: number) => {
    setCoefficients(prev => {
      const next = { ...prev, [field]: value };
      
      // If manually modifying any coefficient, switch dropdowns to Custom mode
      const isCustomMode = selectedGroupId === 'presets' && selectedPreset === 'custom';
      if (!isCustomMode) {
        setSelectedGroupId('presets');
        setSelectedPreset('custom');
      }

      // Recalculate fixed component if not custom, or let user adjust all manually
      if (selectedPreset !== 'custom') {
        const sumOfOthers = Object.keys(next)
          .filter(k => k !== 'fixed')
          .reduce((sum, key) => sum + (next[key as keyof CoefficientSet] || 0), 0);
        next.fixed = Math.max(0, 100 - sumOfOthers);
      }
      return next;
    });
  };

  const coefficientSum = useMemo(() => {
    return Object.values(coefficients).reduce((a, b) => a + b, 0);
  }, [coefficients]);

  const handleCalculate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (coefficientSum !== 100) {
      setError('The sum of all work coefficients must equal exactly 100%');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/pvc-forecast/tendering', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totalValue: projectValue,
          duration,
          startMonth,
          baseMonth,
          zone,
          steelTypes: selectedSteelTypes,
          coefficients
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to calculate forecast');
      }

      const result = await response.json();
      setForecastResult(result);
    } catch (err: any) {
      setError(err.message || 'An error occurred during calculations');
    } finally {
      setLoading(false);
    }
  };

  // Auth Protection
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-10 w-10 animate-spin text-purple-600" />
      </div>
    );
  }

  // Pre-process charts data
  const chartData = forecastResult ? forecastResult.scenarios.baseline.quarterBreakdown.map((q: any, idx: number) => {
    return {
      name: `Q${idx + 1}`,
      baseline: q.pvcAmount,
      aggressive: forecastResult.scenarios.aggressive.quarterBreakdown[idx].pvcAmount,
      conservative: forecastResult.scenarios.conservative.quarterBreakdown[idx].pvcAmount
    };
  }) : [];

  const pieData = forecastResult ? Object.keys(forecastResult.scenarios.baseline.quarterBreakdown[0].components).map((key) => {
    // Sum total escalation for this component across all quarters
    const value = forecastResult.scenarios.baseline.quarterBreakdown.reduce((sum: number, q: any) => {
      return sum + (q.components[key] || 0);
    }, 0);
    return { name: key.toUpperCase(), value: Math.max(0, value) };
  }).filter(d => d.value > 0) : [];

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl space-y-8 relative z-10">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <BackButton href="/dashboard" className="border-slate-200/80 bg-white/80 hover:bg-slate-50 text-slate-600 hover:text-slate-800" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <BarChart3 className="h-7 w-7 text-indigo-600" />
              Tendering & Bidding PVC Estimator
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Simulate and model price escalation payouts to optimize your bid quote.
            </p>
          </div>
        </div>
        <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200/50 rounded-full">
          <Sparkles className="h-3 w-3 text-indigo-600 animate-pulse" />
          Premium Bidding Feature
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-8 items-start">
        {/* Left Side: Setup Form */}
        <Card className="lg:col-span-4 border border-slate-100 bg-white/70 backdrop-blur-md shadow-sm rounded-2xl p-6">
          <form onSubmit={handleCalculate} className="space-y-5">
            <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider border-b pb-2 flex items-center gap-2">
              <Calculator className="h-4.5 w-4.5 text-indigo-600" />
              Tender Parameters
            </h3>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Tender Name / Ref</label>
              <Input
                placeholder="e.g. Doubling Works Trichy Division"
                value={tenderTitle}
                onChange={e => setTenderTitle(e.target.value)}
                className="rounded-xl border-slate-200"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Contract Value (₹)</label>
                <Input
                  type="number"
                  value={projectValue}
                  onChange={e => setProjectValue(Number(e.target.value))}
                  className="rounded-xl border-slate-200"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Duration (Months)</label>
                <Input
                  type="number"
                  value={duration}
                  onChange={e => setDuration(Number(e.target.value))}
                  className="rounded-xl border-slate-200"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Tender Base Month</label>
                <Input
                  type="month"
                  value={baseMonth}
                  onChange={e => setBaseMonth(e.target.value)}
                  className="rounded-xl border-slate-200"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Start Date</label>
                <Input
                  type="month"
                  value={startMonth}
                  onChange={e => setStartMonth(e.target.value)}
                  className="rounded-xl border-slate-200"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Railway Zone</label>
              <Select value={zone} onValueChange={setZone}>
                <SelectTrigger className="rounded-xl border-slate-200">
                  <SelectValue placeholder="Zone" />
                </SelectTrigger>
                <SelectContent>
                  {zoneOptions.map(z => (
                    <SelectItem key={z.value} value={z.value}>{z.value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Steel Price Types (Select one or more)
              </label>
              <div className="grid grid-cols-2 gap-2.5 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                {[
                  { value: 'TMT', label: 'TMT Bars', desc: 'Thermo-Mechanically Treated' },
                  { value: 'ANGLE_CHANNEL', label: 'Angles/Channels', desc: 'Structural Sections' },
                  { value: 'PLATES', label: 'Plates', desc: 'Steel Plates' },
                  { value: 'OTHER_SECTIONS', label: 'Other Sections', desc: 'Other Steel Sections' }
                ].map((item) => (
                  <div key={item.value} className="flex items-center space-x-2.5 bg-white px-3 py-2 rounded-lg border border-slate-100 shadow-sm hover:border-indigo-100 hover:bg-indigo-50/20 transition-all">
                    <Checkbox
                      id={`steel-type-${item.value}`}
                      checked={selectedSteelTypes.includes(item.value)}
                      onCheckedChange={(checked) => {
                        setSelectedSteelTypes(prev => {
                          if (checked) {
                            return [...prev, item.value];
                          } else {
                            return prev.length > 1 ? prev.filter(t => t !== item.value) : prev;
                          }
                        });
                      }}
                      className="border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="flex-1 min-w-0">
                      <label
                        htmlFor={`steel-type-${item.value}`}
                        className="text-xs font-semibold text-slate-700 cursor-pointer block select-none"
                      >
                        {item.label}
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider border-b pb-2 pt-2 flex items-center gap-2">
              <Percent className="h-4.5 w-4.5 text-indigo-600" />
              PVC Coefficients (%)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Classification Group</label>
                <Select
                  value={selectedGroupId}
                  onValueChange={(val) => {
                    setSelectedGroupId(val);
                    if (val === 'presets') {
                      handlePresetChange('bridge');
                    } else {
                      const group = classificationGroups.find(g => g.id === val);
                      if (group && group.subClassifications && group.subClassifications.length > 0) {
                        handleSubClassificationChange(group.subClassifications[0].id);
                      }
                    }
                  }}
                  disabled={loadingClassifications}
                >
                  <SelectTrigger className="rounded-xl border-slate-200">
                    <SelectValue placeholder={loadingClassifications ? "Loading groups..." : "Select Group"} />
                  </SelectTrigger>
                  <SelectContent>
                    {classificationGroups.map(g => (
                      <SelectItem key={g.id} value={g.id}>{g.code} - {g.name}</SelectItem>
                    ))}
                    <SelectItem value="presets">--- Quick Presets ---</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Sub-Classification</label>
                {selectedGroupId === 'presets' ? (
                  <Select value={selectedPreset} onValueChange={handlePresetChange}>
                    <SelectTrigger className="rounded-xl border-slate-200">
                      <SelectValue placeholder="Select preset" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(PRESETS).map(key => (
                        <SelectItem key={key} value={key}>{PRESETS[key].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select
                    value={selectedSubId}
                    onValueChange={handleSubClassificationChange}
                    disabled={!selectedGroupId || loadingClassifications}
                  >
                    <SelectTrigger className="rounded-xl border-slate-200">
                      <SelectValue placeholder="Select Sub-Classification" />
                    </SelectTrigger>
                    <SelectContent>
                      {classificationGroups
                        .find(g => g.id === selectedGroupId)
                        ?.subClassifications.map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>{s.code} - {s.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-1">
              {[
                { name: 'labor', label: 'Labor (L)' },
                { name: 'cement', label: 'Cement (C)' },
                { name: 'steel', label: 'Steel (S)' },
                { name: 'fuel', label: 'Fuel (F)' },
                { name: 'materials', label: 'Materials (M)' },
                { name: 'machinery', label: 'Machinery (K)' },
                { name: 'explosives', label: 'Explosives (E)' },
                { name: 'fixed', label: 'Fixed (W)', disabled: selectedGroupId !== 'presets' || selectedPreset !== 'custom' }
              ].map(item => (
                <div key={item.name} className="space-y-0.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{item.label}</label>
                  <Input
                    type="number"
                    value={coefficients[item.name as keyof CoefficientSet]}
                    onChange={e => handleCoefficientChange(item.name as keyof CoefficientSet, Number(e.target.value))}
                    disabled={item.disabled}
                    min={0}
                    max={100}
                    className="rounded-lg h-9 border-slate-200"
                  />
                </div>
              ))}
            </div>

            <div className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between ${
              coefficientSum === 100 
                ? 'bg-emerald-50 border-emerald-100 text-emerald-800' 
                : 'bg-amber-50 border-amber-100 text-amber-800'
            }`}>
              <span className="flex items-center gap-1.5">
                <Info className="h-4 w-4" />
                Sum of coefficients:
              </span>
              <span className="text-sm font-black">{coefficientSum}%</span>
            </div>

            <Button
              type="submit"
              disabled={loading || coefficientSum !== 100}
              className="w-full font-bold py-5 rounded-xl shadow-md bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Calculating Projections...
                </>
              ) : (
                'Calculate Bid Forecast'
              )}
            </Button>
          </form>
        </Card>

        {/* Right Side: Projections Dashboard */}
        <div className="lg:col-span-8 space-y-6">
          {!forecastResult ? (
            <div className="h-[70vh] border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center p-8 text-center text-slate-400 bg-white/30 backdrop-blur-md">
              <BarChart3 className="h-14 w-14 mb-4 text-slate-300 animate-pulse" />
              <h3 className="text-lg font-bold text-slate-700 mb-1">Waiting for Inputs</h3>
              <p className="text-xs max-w-sm font-light">
                Fill in the tender parameters and work coefficients on the left, then click "Calculate" to generate the bidding analysis.
              </p>
            </div>
          ) : (
            <>
              {/* Bidding Intelligence Grid */}
              <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border border-slate-100 bg-gradient-to-b from-indigo-50/50 to-white shadow-sm rounded-2xl p-4 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Loading Recommendation</span>
                    <h4 className="text-2xl font-black text-indigo-600 mt-1 tracking-tight">
                      +{forecastResult.biddingIntelligence.recommendedLoadingPercent}%
                    </h4>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 font-light leading-snug">
                    Suggested markup on quote to hedge uncompensated fixed-cost inflation.
                  </p>
                </Card>

                <Card className="border border-slate-100 bg-gradient-to-b from-blue-50/50 to-white shadow-sm rounded-2xl p-4 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Projected PVC Profit</span>
                    <h4 className="text-2xl font-black text-blue-600 mt-1 tracking-tight">
                      ₹{forecastResult.scenarios.baseline.totalPvc.toLocaleString()}
                    </h4>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 font-light leading-snug">
                    Total expected escalation payout under baseline trend.
                  </p>
                </Card>

                <Card className="border border-slate-100 bg-gradient-to-b from-emerald-50/50 to-white shadow-sm rounded-2xl p-4 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Raw Cost Inflation</span>
                    <h4 className="text-2xl font-black text-emerald-600 mt-1 tracking-tight">
                      ₹{forecastResult.biddingIntelligence.totalProjectedCostInflation.toLocaleString()}
                    </h4>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 font-light leading-snug">
                    Estimated raw cost increase on materials & labor overhead.
                  </p>
                </Card>

                <Card className={`border shadow-sm rounded-2xl p-4 flex flex-col justify-between ${
                  forecastResult.biddingIntelligence.riskLevel === 'high' 
                    ? 'border-red-100 bg-gradient-to-b from-red-50/30 to-white' 
                    : forecastResult.biddingIntelligence.riskLevel === 'moderate'
                    ? 'border-amber-100 bg-gradient-to-b from-amber-50/30 to-white'
                    : 'border-emerald-100 bg-gradient-to-b from-emerald-50/30 to-white'
                }`}>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Inflation Risk Rating</span>
                    <h4 className={`text-2xl font-black mt-1 tracking-tight capitalize ${
                      forecastResult.biddingIntelligence.riskLevel === 'high' 
                        ? 'text-red-600' 
                        : forecastResult.biddingIntelligence.riskLevel === 'moderate'
                        ? 'text-amber-600'
                        : 'text-emerald-600'
                    }`}>
                      {forecastResult.biddingIntelligence.riskLevel}
                    </h4>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 font-light leading-snug">
                    Overall volatility profile of key tender components.
                  </p>
                </Card>
              </div>

              {/* Bidding Recommendation Box */}
              <Card className="border border-indigo-100 bg-indigo-50/30 backdrop-blur-md rounded-2xl p-5">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl shrink-0">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-extrabold text-slate-800 text-sm">Bidding Intelligence Recommendation</h4>
                    <p className="text-xs text-slate-600 leading-relaxed font-light">
                      Raw price index inflation is projected to cost you <strong>₹{forecastResult.biddingIntelligence.totalProjectedCostInflation.toLocaleString()}</strong> over {duration} months. 
                      Because the GCC escalation formula has a fixed component of {coefficients.fixed}%, it only compensates <strong>₹{forecastResult.scenarios.baseline.totalPvc.toLocaleString()}</strong>.
                      To maintain your targeted profit margin, we recommend <strong>loading your base quote by +{forecastResult.biddingIntelligence.recommendedLoadingPercent}%</strong>.
                    </p>
                  </div>
                </div>
              </Card>

              {/* Escalation Scenario Cash-Flow Chart */}
              <Card className="border border-slate-100 bg-white/70 backdrop-blur-md shadow-sm rounded-2xl p-6">
                <CardHeader className="px-0 pt-0 pb-4 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-black text-slate-800">Escalation Cash-Flow Scenarios</CardTitle>
                    <CardDescription className="text-xs">Projected quarterly PVC payouts across three market scenarios</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="px-0 pb-0 pt-2 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorBaseline" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorAggressive" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorConservative" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: any) => [`₹${Number(v).toLocaleString()}`, '']} labelFormatter={(l) => `Billing Quarter ${l}`} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                      <Area type="monotone" dataKey="aggressive" name="Aggressive (Bull Market)" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorAggressive)" />
                      <Area type="monotone" dataKey="baseline" name="Baseline Projection" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorBaseline)" />
                      <Area type="monotone" dataKey="conservative" name="Conservative (Bear Market)" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#colorConservative)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Component Contribution & Volatility */}
              <div className="grid md:grid-cols-12 gap-6">
                {/* Pie Chart: Component Contribution */}
                <Card className="md:col-span-5 border border-slate-100 bg-white/70 backdrop-blur-md shadow-sm rounded-2xl p-6 flex flex-col justify-between">
                  <h4 className="font-extrabold text-slate-800 text-sm mb-4">PVC Component Contribution</h4>
                  <div className="h-48 relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={75}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {pieData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: any) => `₹${Number(v).toLocaleString()}`} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Formula</span>
                      <span className="text-xs font-black text-slate-800 mt-0.5">Escalations</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center mt-3">
                    {pieData.map((d, index) => (
                      <div key={d.name} className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-600 bg-slate-50 border border-slate-100 px-2 py-1 rounded-md">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                        {d.name}
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Table: Volatility Analysis */}
                <Card className="md:col-span-7 border border-slate-100 bg-white/70 backdrop-blur-md shadow-sm rounded-2xl p-6">
                  <h4 className="font-extrabold text-slate-800 text-sm mb-4">Component Volatility Analysis</h4>
                  <div className="space-y-3">
                    {forecastResult.biddingIntelligence.componentRisks.map((c: any) => {
                      const coeff = coefficients[c.key as keyof CoefficientSet] || 0;
                      if (coeff === 0) return null;
                      return (
                        <div key={c.key} className="flex items-center justify-between p-3 bg-slate-50/50 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors">
                          <div className="space-y-0.5">
                            <p className="text-xs font-bold text-slate-700 uppercase">{c.key}</p>
                            <p className="text-[10px] text-slate-400 font-light">Weight: {coeff}% | Index Base: {forecastResult.baseIndices[c.key]?.toFixed(1)}</p>
                          </div>
                          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                            c.risk === 'high' 
                              ? 'bg-red-50 border-red-200 text-red-700' 
                              : c.risk === 'moderate'
                              ? 'bg-amber-50 border-amber-200 text-amber-700'
                              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          }`}>
                            {c.risk.toUpperCase()} RISK
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </div>

              {/* Monthly Index Trends */}
              <Card className="border border-slate-100 bg-white/70 backdrop-blur-md shadow-sm rounded-2xl p-6">
                <h4 className="font-extrabold text-slate-800 text-sm mb-3">Projected Index Values</h4>
                <div className="overflow-x-auto border border-slate-100 rounded-xl">
                  <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
                    <thead className="bg-slate-50/70 font-bold text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5">Month</th>
                        {(['labor', 'cement', 'steel', 'fuel', 'materials', 'machinery', 'explosives'] as Array<keyof Omit<CoefficientSet, 'fixed'>>).map((key) => {
                          const coeff = coefficients[key] || 0;
                          if (coeff === 0) return null;
                          return <th key={key} className="px-4 py-2.5 uppercase">{key}</th>;
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-600 font-normal">
                      {forecastResult.monthlyIndexTrends.map((t: any) => (
                        <tr key={t.month} className="hover:bg-slate-50/40">
                          <td className="px-4 py-2.5 font-medium text-slate-800">{t.month}</td>
                          {(['labor', 'cement', 'steel', 'fuel', 'materials', 'machinery', 'explosives'] as Array<keyof Omit<CoefficientSet, 'fixed'>>).map((key) => {
                            const coeff = coefficients[key] || 0;
                            if (coeff === 0) return null;
                            const val = t[`${key}_baseline`]?.toFixed(1);
                            const base = t[`${key}_base`]?.toFixed(1);
                            return (
                              <td key={key} className="px-4 py-2.5">
                                {val} <span className="text-[10px] text-slate-400 font-light">(Base: {base})</span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
