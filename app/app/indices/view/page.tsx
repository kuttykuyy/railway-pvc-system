'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Download, ChevronLeft, ChevronRight, Database, Info, TrendingUp, Flame, Construction, Hammer, Layers, MapPin, Loader2 } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { OfficialSheetViewer } from '@/components/official-sheet-viewer';

interface IndexValue { value: number | null; isProvisional?: boolean; formula?: string | null; steelDetail?: any }
interface MonthlyData { month: string; [key: string]: IndexValue | number | string | null }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const STEEL_CITIES = ['Default','Delhi','Mumbai','Chennai','Kolkata'] as const;

const NON_STEEL = [
  { key: 'labour',           label: 'Labour',       sub: 'CPI-IW 2016' },
  { key: 'mpngFuel',         label: 'Fuel',         sub: 'PPAC Diesel' },
  { key: 'rbiCite',          label: 'Cement',       sub: 'WPI Cement' },
  { key: 'rbiExplosives',    label: 'Explosives',   sub: 'WPI Explosives' },
  { key: 'rbiOtherMaterials',label: 'Materials',    sub: 'WPI All Comm.' },
  { key: 'rbiPlantMachinery',label: 'Plant',        sub: 'WPI Const.' },
];

const STEEL_BY_CITY: Record<string, { key: string; label: string }[]> = {
  Default:  [{ key:'steelTMTBars', label:'TMT Bars' },{ key:'steelAngleChannel', label:'Angle/Ch' },{ key:'steelPlates', label:'Plates' },{ key:'steelOtherSections', label:'Other Sec' }],
  Delhi:    [{ key:'steelTMTBars_Delhi', label:'TMT (Delhi)' },{ key:'steelAngleChannel_Delhi', label:'Angle (Delhi)' },{ key:'steelPlates_Delhi', label:'Plates (Delhi)' },{ key:'steelOtherSections_Delhi', label:'Other (Delhi)' }],
  Mumbai:   [{ key:'steelTMTBars_Mumbai', label:'TMT (Mumbai)' },{ key:'steelAngleChannel_Mumbai', label:'Angle (Mumbai)' },{ key:'steelPlates_Mumbai', label:'Plates (Mumbai)' },{ key:'steelOtherSections_Mumbai', label:'Other (Mumbai)' }],
  Chennai:  [{ key:'steelTMTBars_Chennai', label:'TMT (Chennai)' },{ key:'steelAngleChannel_Chennai', label:'Angle (Chennai)' },{ key:'steelPlates_Chennai', label:'Plates (Chennai)' },{ key:'steelOtherSections_Chennai', label:'Other (Chennai)' }],
  Kolkata:  [{ key:'steelTMTBars_Kolkata', label:'TMT (Kolkata)' },{ key:'steelAngleChannel_Kolkata', label:'Angle (Kolkata)' },{ key:'steelPlates_Kolkata', label:'Plates (Kolkata)' },{ key:'steelOtherSections_Kolkata', label:'Other (Kolkata)' }],
};

const GLOSSARY = [
  { icon: Hammer, title: 'Labour Index (CPI-IW)', sub: 'All India Consumer Price Index for Industrial Workers', lines: [
    'Source: Labour Bureau, Ministry of Labour & Employment, Government of India.',
    'Application: Represents the wage/labour components in railway works contracts under PVC formulas.',
    'Base Year: Re-based to 2016 from calendar year 2020. Link-factor of 2.88 applied when comparing with the older 2001 base index.',
  ]},
  { icon: Flame, title: 'MPNG Fuel Index', sub: 'Ministry of Petroleum & Natural Gas — HSD Prices', lines: [
    'Source: Petroleum Planning & Analysis Cell (PPAC), MoPNG, Government of India.',
    'Application: Represents the Fuel & Lubricants component.',
    'Mechanism: Based on the retail selling price of High-Speed Diesel (HSD) in metros. Monthly average of daily diesel prices used for billing accuracy.',
  ]},
  { icon: TrendingUp, title: 'JPC Steel Prices', sub: 'Joint Plant Committee Steel Rates', lines: [
    'Source: JPC, Ministry of Steel, Government of India.',
    'Application: Direct market raw material pricing used for reinforcement steel items.',
    'Categories: Steel TMT Bars, Angle/Channel, Plates, and Other Sections. Calculated from JPC fortnightly ex-works yard rates across Delhi, Mumbai, Chennai, Kolkata.',
  ]},
  { icon: Layers, title: 'WPI Indices (RBI Series)', sub: 'Wholesale Price Index — Office of Economic Advisor', lines: [
    'Source: Office of the Economic Adviser (OEA), Ministry of Commerce & Industry, Government of India.',
    'RBI Cement: WPI Manufacture of Cement, Lime & Plaster.',
    'RBI Plant Machinery: WPI Construction Machinery series.',
    'RBI Explosives: WPI Explosives series.',
    'RBI Other Materials: WPI All Commodities Index.',
  ]},
];

export default function IndicesViewPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [steelCity, setSteelCity] = useState('Default');
  const [tab, setTab] = useState<'sheet'|'glossary'>('sheet');
  const [detail, setDetail] = useState<{ month: string; colName: string; city: string; value: number; detail: any } | null>(null);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [checkingSub, setCheckingSub] = useState(true);

  const allCols = [...NON_STEEL, ...(STEEL_BY_CITY[steelCity] || STEEL_BY_CITY.Default)];

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/auth/signin');
      return;
    }

    const checkSub = async () => {
      try {
        const res = await fetch('/api/credits/balance');
        if (res.ok) {
          const data = await res.json();
          const isExempt = 
            data.accountInfo?.tier === 'Superadmin' || 
            data.accountInfo?.tier === 'Admin' || 
            data.accountInfo?.tier === 'Railway Department' || 
            data.accountInfo?.tier === 'Free Tier' || 
            data.accountInfo?.tier === 'Unlimited' || 
            !data.paymentProcessingEnabled;
          
          const hasSub = !!data.subscription?.isActive;
          setSubscriptionActive(isExempt || hasSub);
        }
      } catch (err) {
        console.error('Error checking subscription for indices view:', err);
      } finally {
        setCheckingSub(false);
      }
    };

    checkSub();
  }, [session, status, router]);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) { router.push('/auth/signin'); return; }
    setLoading(true);
    fetch(`/api/indices/yearly-view?year=${year}`)
      .then(r => r.json()).then(d => setData(d.data || []))
      .catch(() => {}).finally(() => setLoading(false));
  }, [session, status, year, router]);

  const val = (v: any): number | null => {
    if (v == null) return null;
    if (typeof v === 'number') return v;
    if (typeof v === 'object' && 'value' in v) return v.value;
    return null;
  };
  const isProv = (v: any) => typeof v === 'object' && v?.isProvisional;
  const formula = (v: any) => typeof v === 'object' ? v?.formula ?? null : null;
  const steelDetail = (v: any) => typeof v === 'object' ? v?.steelDetail ?? null : null;
  const fmt = (v: any) => { const n = val(v); return n == null ? '—' : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

  const latest = (key: string) => {
    for (let i = MONTHS.length - 1; i >= 0; i--) {
      const row = data.find(d => d.month === MONTHS[i]);
      if (row) { const n = val((row as any)[key]); if (n != null) return { month: MONTHS[i], value: n, prov: isProv((row as any)[key]) }; }
    }
    return null;
  };

  const lLabour = latest('labour');
  const lFuel   = latest('mpngFuel');
  const lCement = latest('rbiCite');
  const steelKey = (STEEL_BY_CITY[steelCity]?.[0]?.key) || 'steelTMTBars';
  const lSteel  = latest(steelKey);

  const download = async () => {
    setDownloading(true);
    try {
      const r = await fetch(`/api/indices/yearly-view/export?year=${year}`);
      if (!r.ok) throw new Error();
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `Price_Indices_${year}.xlsx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      toast.success('Downloaded');
    } catch { toast.error('Download failed'); } finally { setDownloading(false); }
  };

  if (status === 'loading' || loading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" text="Loading price indices..." /></div>;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">PVC Price Indices</h1>
          <p className="text-sm text-gray-500 mt-0.5">Historical index rates used for Price Variation Clause computations</p>
        </div>
        <div className="flex items-center gap-2">
          {checkingSub ? (
            <>
              <div className="h-9 w-32 bg-gray-200 animate-pulse rounded-lg" />
              <div className="h-9 w-20 bg-gray-200 animate-pulse rounded-lg" />
            </>
          ) : !subscriptionActive ? (
            <>
              <button
                onClick={() => toast.error("Requires Advanced Feature Subscription (₹99/month). Please subscribe in the Billing panel to access this feature.")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                <span className="text-[10px]">🔒</span> View official sheet
              </button>
              <button
                onClick={() => toast.error("Requires Advanced Feature Subscription (₹99/month). Please subscribe in the Billing panel to access this feature.")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                <span className="text-[10px]">🔒</span> JPC Raw Rates
              </button>
              <button
                onClick={() => toast.error("Requires Advanced Feature Subscription (₹99/month). Please subscribe in the Billing panel to access this feature.")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <span className="text-[10px]">🔒</span> Excel
              </button>
            </>
          ) : (
            <>
              {/* The sheet itself, sliced to the month being read — rate matching
                  without leaving the indices table. Opens on the current month for the
                  current year, January for a past one; months switch inside. */}
              <OfficialSheetViewer
                year={year}
                initialMonth={year === new Date().getFullYear() ? new Date().getMonth() + 1 : 1}
              />
              <Link href="/indices/jpc-view"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
                <Database className="h-4 w-4" /> JPC Raw Rates
              </Link>
              <button onClick={download} disabled={downloading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60">
                <Download className="h-4 w-4" /> {downloading ? 'Downloading...' : 'Excel'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Labour', sub: 'CPI-IW 2016', info: lLabour, fmt: (v: number) => v.toFixed(2), icon: Hammer },
          { label: 'Steel TMT', sub: `JPC ${steelCity === 'Default' ? 'Chennai' : steelCity}`, info: lSteel, fmt: (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`, icon: TrendingUp },
          { label: 'Cement', sub: 'WPI Cement', info: lCement, fmt: (v: number) => v.toFixed(2), icon: Construction },
          { label: 'Fuel', sub: 'PPAC Diesel', info: lFuel, fmt: (v: number) => `₹${v.toFixed(2)}`, icon: Flame },
        ].map(({ label, sub, info, fmt: f, icon: Icon }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
            </div>
            <p className="text-xl font-bold text-gray-900 font-mono">{info ? f(info.value) : '—'}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {sub} · {info ? `${info.month} ${year}` : 'No data'}
              {info?.prov && <span className="ml-1 text-amber-500 font-semibold">P</span>}
            </p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Tabs */}
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          <button onClick={() => setTab('sheet')}
            className={`px-4 py-1.5 text-sm font-medium transition-colors ${tab === 'sheet' ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            Data Sheet
          </button>
          <button onClick={() => setTab('glossary')}
            className={`px-4 py-1.5 text-sm font-medium transition-colors ${tab === 'glossary' ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            Glossary
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Year */}
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button onClick={() => setYear(y => y - 1)} className="px-2 py-1.5 text-gray-600 hover:bg-gray-50"><ChevronLeft className="h-4 w-4" /></button>
            <span className="px-3 text-sm font-bold text-gray-800">{year}</span>
            <button onClick={() => setYear(y => y + 1)} disabled={year >= new Date().getFullYear()} className="px-2 py-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
          </div>

          {/* Steel city */}
          <div className="flex items-center gap-1 border border-gray-200 rounded-lg p-1">
            <span className="text-xs text-gray-400 px-1 font-medium">Steel:</span>
            {STEEL_CITIES.map(c => (
              <button key={c} onClick={() => setSteelCity(c)}
                className={`px-2 py-1 text-xs rounded font-medium transition-colors ${steelCity === c ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                {c === 'Default' ? 'Chennai*' : c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Data Sheet */}
      {tab === 'sheet' && (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-2 text-left font-semibold text-gray-500 sticky left-0 bg-gray-50 z-20 border-r border-gray-200 w-16">Month</th>
                  {NON_STEEL.map(c => (
                    <th key={c.key} className="px-3 py-2 text-center font-semibold text-gray-600 border-r border-gray-100 whitespace-nowrap">
                      <div>{c.label}</div>
                      <div className="text-gray-400 font-normal text-[10px]">{c.sub}</div>
                    </th>
                  ))}
                  <th colSpan={4} className="px-3 py-2 text-center font-semibold text-emerald-600 bg-emerald-50/50 border-l border-emerald-100 whitespace-nowrap">
                    Steel (JPC) — {steelCity === 'Default' ? 'Chennai' : steelCity} · ₹/MT
                  </th>
                </tr>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="sticky left-0 bg-gray-50 z-20 border-r border-gray-200" />
                  {NON_STEEL.map(() => <th key={Math.random()} />)}
                  {(STEEL_BY_CITY[steelCity] || STEEL_BY_CITY.Default).map(c => (
                    <th key={c.key} className="px-3 py-1.5 text-center text-[10px] font-semibold text-emerald-500 bg-emerald-50/30 border-l border-emerald-50">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {MONTHS.map(month => {
                  const row = data.find(d => d.month === month) || {} as MonthlyData;
                  const hasData = allCols.some(c => val((row as any)[c.key]) != null);
                  return (
                    <tr key={month} className={`hover:bg-gray-50 transition-colors ${!hasData ? 'opacity-35' : ''}`}>
                      <td className="px-4 py-2.5 font-bold text-gray-800 sticky left-0 bg-white z-10 border-r border-gray-200">{month}</td>
                      {allCols.map((col, i) => {
                        const cv = (row as any)[col.key];
                        const n = val(cv);
                        const prov = isProv(cv);
                        const sd = steelDetail(cv);
                        const isSteel = col.key.startsWith('steel');
                        const clickable = isSteel && n != null && sd;
                        return (
                          <td key={col.key}
                            className={`px-3 py-2.5 text-center font-mono ${i >= NON_STEEL.length ? 'bg-emerald-50/20 border-l border-emerald-50' : ''} ${prov ? 'text-amber-600 italic' : 'text-gray-700'} ${clickable ? 'cursor-pointer hover:bg-emerald-100/50' : ''}`}
                            title={clickable ? (!subscriptionActive ? '🔒 Click for JPC breakdown' : 'Click for JPC breakdown') : formula(cv) ? `Formula: ${formula(cv)}` : undefined}
                            onClick={clickable ? () => {
                              if (!subscriptionActive) {
                                toast.error("Requires Advanced Feature Subscription (₹99/month). Please subscribe in the Billing panel to access this feature.");
                                return;
                              }
                              setDetail({ month, colName: col.label, city: steelCity === 'Default' ? 'Chennai' : steelCity, value: n!, detail: sd });
                            } : undefined}
                          >
                            {n == null ? <span className="text-gray-300">—</span> : (
                              <span className="flex items-center justify-center gap-1">
                                {fmt(cv)}
                                {prov && <span className="text-[9px] bg-amber-100 text-amber-700 px-1 rounded font-bold">P</span>}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-1.5 text-xs text-gray-400">
            <Info className="h-3 w-3 text-amber-500 flex-shrink-0" />
            Faded rows = no data uploaded. <span className="bg-amber-100 text-amber-700 px-1 rounded font-bold">P</span> = provisional. Click highlighted steel cells for JPC formula breakdown.
            <span className="ml-1 text-emerald-500">*Default = Chennai rates</span>
          </div>
        </div>
      )}

      {/* Glossary */}
      {tab === 'glossary' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {GLOSSARY.map(({ icon: Icon, title, sub, lines }) => (
            <div key={title} className="bg-white border border-gray-200 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="h-4 w-4 text-emerald-500" />
                <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
              </div>
              <p className="text-xs text-gray-400 mb-3">{sub}</p>
              <ul className="space-y-1.5">
                {lines.map((l, i) => (
                  <li key={i} className="text-xs text-gray-600 leading-relaxed">{l}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Steel detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setDetail(null)}>
          <div className="w-full max-w-lg bg-white rounded-xl shadow-xl border border-gray-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-900">JPC Steel Rate Details</h2>
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3 w-3 text-emerald-500" />
                  {detail.city} · {detail.colName} · {detail.month} {year}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-emerald-600 font-mono">₹{Math.round(detail.value).toLocaleString('en-IN')}</p>
                <p className="text-xs text-gray-400">Avg Rate / MT</p>
              </div>
            </div>
            <div className="p-5 space-y-4">
              {detail.detail.items?.length > 0 ? (
                <table className="w-full text-xs border border-gray-100 rounded-lg overflow-hidden">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-gray-600">Item</th>
                      <th className="text-center px-3 py-2 font-semibold text-gray-600">F1</th>
                      <th className="text-center px-3 py-2 font-semibold text-gray-600">F2</th>
                      <th className="text-center px-3 py-2 font-semibold text-emerald-600">Avg</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-mono">
                    {detail.detail.items.map((item: any, i: number) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-sans text-gray-700">{item.name}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{item.f1 != null ? `₹${Math.round(item.f1).toLocaleString('en-IN')}` : '—'}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{item.f2 != null ? `₹${Math.round(item.f2).toLocaleString('en-IN')}` : '—'}</td>
                        <td className="px-3 py-2 text-center text-emerald-600 font-bold">{item.avg != null ? `₹${Math.round(item.avg).toLocaleString('en-IN')}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-gray-400 text-center py-4">No sub-item breakdown available.</p>
              )}
              {detail.detail.formulaDesc && (
                <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                  <Info className="h-3.5 w-3.5 inline mr-1" />{detail.detail.formulaDesc}
                </div>
              )}
              <div className="flex justify-end">
                <button onClick={() => setDetail(null)} className="px-4 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
