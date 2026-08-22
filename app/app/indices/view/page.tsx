'use client';

/**
 * The published price indices, as the PVC clause uses them.
 *
 * Three things a person comes here for, in the order they are answered: what is the
 * latest month and is it still provisional (the status line and the trend cards); what
 * were the indices in MY base month and MY measurement quarter (the base → quarter
 * box, which applies the same WPI bridge the calculation does); and the full sheet,
 * with the quarter averages the PVC actually uses shown as rows of their own, and a
 * legend that explains the P marks and the link factors instead of leaving them to be
 * guessed at.
 */

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Download, Database, Info, TrendingUp, Flame, Construction, Hammer, Layers, MapPin, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { OfficialSheetViewer } from '@/components/official-sheet-viewer';
import { DEFAULT_WPI_LINKING_FACTORS, WPI_NEW_SERIES_FROM } from '@/lib/wpi-series';

interface IndexValue { value: number | null; isProvisional?: boolean; formula?: string | null; steelDetail?: any }
interface MonthlyData { month: string; [key: string]: IndexValue | number | string | null }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const STEEL_CITIES = ['Default','Delhi','Mumbai','Chennai','Kolkata'] as const;
const QUARTERS = ['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'];

/**
 * Each index with the base it is published on, and the factor that bridges a rebasing.
 *
 * A number means nothing without its base: 151.9 on CPI-IW 2016 and 137.5 on WPI
 * 2011-12 are not comparable quantities, and a reader checking a statement against the
 * published index needs to know which series they are looking at. Where a series has
 * been rebased, the factor that carries the old and new sides onto one scale is shown
 * with it — taken from lib/wpi-series, the same constants the PVC calculation applies.
 */
const NON_STEEL = [
  { key: 'labour',           label: 'Labour',       sub: 'CPI-IW',   base: '2016=100',    factor: null as number | null, indexName: 'Labour' },
  { key: 'mpngFuel',         label: 'Fuel',         sub: 'PPAC',     base: '₹/litre',     factor: null as number | null, indexName: 'MPNG Fuel' },
  { key: 'rbiCite',          label: 'Cement',       sub: 'WPI',      base: '2022-23=100', factor: DEFAULT_WPI_LINKING_FACTORS['RBI Cement'],          indexName: 'RBI Cement' },
  { key: 'rbiExplosives',    label: 'Explosives',   sub: 'WPI',      base: '2022-23=100', factor: DEFAULT_WPI_LINKING_FACTORS['RBI Explosives'],      indexName: 'RBI Explosives' },
  { key: 'rbiOtherMaterials',label: 'Materials',    sub: 'WPI All',  base: '2022-23=100', factor: DEFAULT_WPI_LINKING_FACTORS['RBI Other Materials'], indexName: 'RBI Other Materials' },
  { key: 'rbiPlantMachinery',label: 'Plant',        sub: 'WPI',      base: '2022-23=100', factor: DEFAULT_WPI_LINKING_FACTORS['RBI Plant Machinery'], indexName: 'RBI Plant Machinery' },
];
const WPI_KEYS = new Set(['rbiCite', 'rbiExplosives', 'rbiOtherMaterials', 'rbiPlantMachinery']);

const STEEL_BY_CITY: Record<string, { key: string; label: string }[]> = {
  Default:  [{ key:'steelTMTBars', label:'TMT Bars' },{ key:'steelAngleChannel', label:'Angle/Ch' },{ key:'steelPlates', label:'Plates' },{ key:'steelOtherSections', label:'Other Sec' }],
  Delhi:    [{ key:'steelTMTBars_Delhi', label:'TMT Bars' },{ key:'steelAngleChannel_Delhi', label:'Angle/Ch' },{ key:'steelPlates_Delhi', label:'Plates' },{ key:'steelOtherSections_Delhi', label:'Other Sec' }],
  Mumbai:   [{ key:'steelTMTBars_Mumbai', label:'TMT Bars' },{ key:'steelAngleChannel_Mumbai', label:'Angle/Ch' },{ key:'steelPlates_Mumbai', label:'Plates' },{ key:'steelOtherSections_Mumbai', label:'Other Sec' }],
  Chennai:  [{ key:'steelTMTBars_Chennai', label:'TMT Bars' },{ key:'steelAngleChannel_Chennai', label:'Angle/Ch' },{ key:'steelPlates_Chennai', label:'Plates' },{ key:'steelOtherSections_Chennai', label:'Other Sec' }],
  Kolkata:  [{ key:'steelTMTBars_Kolkata', label:'TMT Bars' },{ key:'steelAngleChannel_Kolkata', label:'Angle/Ch' },{ key:'steelPlates_Kolkata', label:'Plates' },{ key:'steelOtherSections_Kolkata', label:'Other Sec' }],
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
    'RBI Cement: WPI Manufacture of Cement, Lime & Plaster. RBI Plant Machinery: WPI machinery for mining, quarrying and construction. RBI Explosives: WPI Explosives. RBI Other Materials: WPI All Commodities.',
    'Base Year: re-based to 2022-23 = 100 on 15.06.2026. The old 2011-12 series ended with April 2026; May 2026 onward is the new series.',
    `Link factors, per commodity: Cement ×${DEFAULT_WPI_LINKING_FACTORS['RBI Cement']}, Plant Machinery ×${DEFAULT_WPI_LINKING_FACTORS['RBI Plant Machinery']}, Explosives ×${DEFAULT_WPI_LINKING_FACTORS['RBI Explosives']}, Other Materials ×${DEFAULT_WPI_LINKING_FACTORS['RBI Other Materials']}.`,
    'DPIIT publishes factors only for the major groups and warns they may not hold at commodity level, prescribing no method. These are derived by its own definition — the ratio of the geometric means of both series over FY 2024-25 — applied to each commodity from the two published workbooks. Machinery is below 1 because that index reads higher on the new base; using the group figure of 1.44 for it overstated a bill by 75%.',
    'A contract based before May 2026 has its new-series months multiplied by the factor so the comparison stays like with like. Contracts based after it use the new series throughout, unconverted.',
  ]},
];

const val = (v: any): number | null => {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && 'value' in v) return v.value;
  return null;
};
const isProv = (v: any) => typeof v === 'object' && !!v?.isProvisional;
const formula = (v: any) => typeof v === 'object' ? v?.formula ?? null : null;
const steelDetail = (v: any) => typeof v === 'object' ? v?.steelDetail ?? null : null;
const fmt2 = (n: number | null) => n == null ? '—' : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtRs = (n: number | null) => n == null ? '—' : `₹${Math.round(n).toLocaleString('en-IN')}`;

/** The same WPI bridge getQuarterlyAverages applies: a contract based on the old series
 *  sees new-series months multiplied by the link factor. Inline rather than imported
 *  from the server helper, so this client page pulls in nothing it cannot run. */
function bridge(indexName: string, baseDate: Date, month: Date, value: number): { v: number; bridged: boolean } {
  const factor = DEFAULT_WPI_LINKING_FACTORS[indexName];
  if (!factor) return { v: value, bridged: false };
  const baseIsOld = baseDate.getTime() < WPI_NEW_SERIES_FROM.getTime();
  const monthIsNew = month.getTime() >= WPI_NEW_SERIES_FROM.getTime();
  return baseIsOld && monthIsNew ? { v: value * factor, bridged: true } : { v: value, bridged: false };
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || 1;
  const pts = points.map((p, i) => `${(i / (points.length - 1)) * 80},${28 - ((p - min) / span) * 24 + 2}`).join(' ');
  return (
    <svg viewBox="0 0 80 32" className="h-8 w-20 text-emerald-600/70" aria-hidden>
      <polyline fill="none" stroke="currentColor" strokeWidth="1.75" points={pts} />
    </svg>
  );
}

const P = () => <span className="text-[9px] bg-amber-100 text-amber-700 px-1 rounded font-bold align-middle">P</span>;

export default function IndicesViewPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [years, setYears] = useState<Record<number, MonthlyData[]>>({});
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [steelCity, setSteelCity] = useState('Default');
  const [tab, setTab] = useState<'sheet'|'glossary'>('sheet');
  const [detail, setDetail] = useState<{ month: string; colName: string; city: string; value: number; detail: any } | null>(null);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [checkingSub, setCheckingSub] = useState(true);

  // Base month → measurement quarter.
  const [baseY, setBaseY] = useState(thisYear - 1);
  const [baseM, setBaseM] = useState(0);
  const [qY, setQY] = useState(thisYear);
  const [qIdx, setQIdx] = useState<number | null>(null);

  const data = years[year] || [];
  const steelCols = STEEL_BY_CITY[steelCity] || STEEL_BY_CITY.Default;
  const allCols = [...NON_STEEL, ...steelCols];
  const cityName = steelCity === 'Default' ? 'Chennai' : steelCity;

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) { router.push('/auth/signin'); return; }
    (async () => {
      try {
        const res = await fetch('/api/credits/balance');
        if (res.ok) {
          const d = await res.json();
          const isExempt =
            d.accountInfo?.tier === 'Superadmin' || d.accountInfo?.tier === 'Admin' ||
            d.accountInfo?.tier === 'Railway Department' || d.accountInfo?.tier === 'Free Tier' ||
            d.accountInfo?.tier === 'Unlimited' || !d.paymentProcessingEnabled;
          setSubscriptionActive(isExempt || !!d.subscription?.isActive);
        }
      } catch (err) {
        console.error('Error checking subscription for indices view:', err);
      } finally {
        setCheckingSub(false);
      }
    })();
  }, [session, status, router]);

  /** One fetch per year, kept; the sheet, the cards and the comparison all read from it. */
  const ensureYear = async (y: number) => {
    if (years[y]) return;
    try {
      const r = await fetch(`/api/indices/yearly-view?year=${y}`);
      const d = await r.json();
      setYears(prev => (prev[y] ? prev : { ...prev, [y]: d.data || [] }));
    } catch { /* the sheet simply shows no data for that year */ }
  };

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) { router.push('/auth/signin'); return; }
    setLoading(true);
    ensureYear(year).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, status, year, router]);

  useEffect(() => {
    if (!session) return;
    void ensureYear(baseY);
    void ensureYear(qY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, baseY, qY]);

  const rowOf = (rows: MonthlyData[] | undefined, m: number) => rows?.find(d => d.month === MONTHS[m]);

  // Latest month with a value, per key, within the displayed year.
  const latest = (key: string) => {
    for (let i = 11; i >= 0; i--) {
      const n = val((rowOf(data, i) as any)?.[key]);
      if (n != null) return { m: i, value: n, prov: isProv((rowOf(data, i) as any)?.[key]) };
    }
    return null;
  };
  const seriesOf = (key: string) => MONTHS.map((_, i) => val((rowOf(data, i) as any)?.[key])).filter((n): n is number => n != null);
  const prevOf = (key: string, m: number) => {
    for (let i = m - 1; i >= 0; i--) { const n = val((rowOf(data, i) as any)?.[key]); if (n != null) return n; }
    return null;
  };

  // Default the quarter to the latest one with any index data, once the year is in.
  useEffect(() => {
    if (qIdx != null || !years[thisYear]) return;
    const rows = years[thisYear];
    for (let q = 3; q >= 0; q--) {
      if ([0, 1, 2].some(k => val((rowOf(rows, q * 3 + k) as any)?.labour) != null)) { setQIdx(q); return; }
    }
    setQIdx(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years, thisYear]);

  /** The status line: latest index month, which series are still provisional. */
  const statusLine = useMemo(() => {
    const idxKeys = ['labour', 'rbiCite', 'rbiExplosives', 'rbiOtherMaterials', 'rbiPlantMachinery'];
    let latestM = -1;
    for (let i = 11; i >= 0; i--) {
      if (idxKeys.some(k => val((rowOf(data, i) as any)?.[k]) != null)) { latestM = i; break; }
    }
    if (latestM < 0) return null;
    const row = rowOf(data, latestM) as any;
    const provNames = NON_STEEL.filter(c => idxKeys.includes(c.key) && isProv(row?.[c.key])).map(c => c.label);
    const steelKey = steelCols[0].key;
    const steelThere = val(row?.[steelKey]) != null;
    const fuelLatest = latest('mpngFuel');
    return { latestM, provNames, steelThere, steelProv: isProv(row?.[steelKey]), fuelLatest };
  }, [data, steelCols]);

  /** Base month → quarter comparison, bridged like the calculation. */
  const comparison = useMemo(() => {
    if (qIdx == null) return null;
    const baseRows = years[baseY], qRows = years[qY];
    if (!baseRows || !qRows) return null;
    const baseDate = new Date(Date.UTC(baseY, baseM, 1));
    const keys = [
      ...NON_STEEL.map(c => ({ key: c.key, label: c.label, indexName: c.indexName, money: c.key === 'mpngFuel' })),
      { key: steelCols[0].key, label: `Steel TMT · ${cityName}`, indexName: 'Steel', money: true },
    ];
    const baseRow = rowOf(baseRows, baseM) as any;
    return keys.map(k => {
      const base = val(baseRow?.[k.key]);
      const baseProv = isProv(baseRow?.[k.key]);
      let sum = 0, n = 0, anyProv = false, anyBridged = false;
      for (let i = 0; i < 3; i++) {
        const m = qIdx * 3 + i;
        const cell = (rowOf(qRows, m) as any)?.[k.key];
        const v = val(cell);
        if (v == null) continue;
        const b = bridge(k.indexName, baseDate, new Date(Date.UTC(qY, m, 1)), v);
        sum += b.v; n++;
        if (isProv(cell)) anyProv = true;
        if (b.bridged) anyBridged = true;
      }
      const avg = n ? sum / n : null;
      const change = base != null && avg != null && base !== 0 ? ((avg / base) - 1) * 100 : null;
      return { ...k, base, baseProv, avg, months: n, anyProv, anyBridged, change };
    });
  }, [years, baseY, baseM, qY, qIdx, steelCols, cityName]);

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

  const locked = () => toast.error('Requires Advanced Feature Subscription (₹99/month). Please subscribe in the Billing panel to access this feature.');

  if (status === 'loading' || (loading && !years[year])) {
    return <div className="flex justify-center py-20"><LoadingSpinner size="lg" text="Loading price indices..." /></div>;
  }

  const lLabour = latest('labour'), lFuel = latest('mpngFuel'), lCement = latest('rbiCite'), lSteel = latest(steelCols[0].key);
  const cards = [
    { key: 'labour', label: 'Labour · CPI-IW', info: lLabour, f: fmt2, icon: Hammer },
    { key: steelCols[0].key, label: `Steel TMT · JPC ${cityName}`, info: lSteel, f: fmtRs, icon: TrendingUp },
    { key: 'rbiCite', label: 'Cement · WPI 2022-23', info: lCement, f: fmt2, icon: Construction },
    { key: 'mpngFuel', label: 'Fuel · PPAC diesel ₹/l', info: lFuel, f: (n: number | null) => n == null ? '—' : `₹${n.toFixed(2)}`, icon: Flame },
  ];
  const yearChips = Array.from({ length: 6 }, (_, i) => thisYear - i);
  if (!yearChips.includes(year)) yearChips.push(year);

  const quarterAvg = (q: number, key: string) => {
    const vals = [0, 1, 2].map(i => (rowOf(data, q * 3 + i) as any)?.[key]).filter(c => val(c) != null);
    if (!vals.length) return null;
    return { avg: vals.reduce((s, c) => s + (val(c) as number), 0) / vals.length, n: vals.length, prov: vals.some(isProv) };
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">PVC Price Indices</h1>
          <p className="text-sm text-gray-500 mt-0.5">The official monthly indices used in every PVC calculation.</p>
        </div>
        <div className="flex items-center gap-2">
          {checkingSub ? (
            <>
              <div className="h-9 w-32 bg-gray-200 animate-pulse rounded-lg" />
              <div className="h-9 w-20 bg-gray-200 animate-pulse rounded-lg" />
            </>
          ) : !subscriptionActive ? (
            <>
              <button onClick={locked} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"><span className="text-[10px]">🔒</span> View official sheet</button>
              <button onClick={locked} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"><span className="text-[10px]">🔒</span> JPC Raw Rates</button>
              <button onClick={locked} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"><span className="text-[10px]">🔒</span> Excel</button>
            </>
          ) : (
            <>
              {/* The sheet itself, sliced to the month being read — rate matching
                  without leaving the indices table. Opens on the current month for the
                  current year, January for a past one; months switch inside. */}
              <OfficialSheetViewer year={year} initialMonth={year === thisYear ? new Date().getMonth() + 1 : 1} />
              <Link href="/indices/jpc-view" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
                <Database className="h-4 w-4" /> JPC Raw Rates
              </Link>
              <button onClick={download} disabled={downloading} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60">
                <Download className="h-4 w-4" /> {downloading ? 'Downloading...' : 'Download Excel'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Status line — what is published, and what may still move. */}
      {statusLine && year === thisYear && (
        <div className="flex gap-3 items-start bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm">
          <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-600 shrink-0" />
          <p className="text-gray-700">
            <b className="text-gray-900">{MONTHS_LONG[statusLine.latestM]} {year} is the latest month.</b>{' '}
            {statusLine.provNames.length > 0
              ? <>{statusLine.provNames.join(', ')} {statusLine.provNames.length === 1 ? 'is' : 'are'} still <P /> provisional — the publishing office may revise them, and they go final later.</>
              : <>All indices for it are final.</>}
            {' '}
            {statusLine.steelThere && !statusLine.steelProv && <>Steel (JPC) is final.</>}
            {statusLine.fuelLatest && statusLine.fuelLatest.m > statusLine.latestM && <> Fuel (PPAC) is in up to {MONTHS_LONG[statusLine.fuelLatest.m]}.</>}
          </p>
        </div>
      )}

      {/* Trend cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(({ key, label, info, f, icon: Icon }) => {
          const prev = info ? prevOf(key, info.m) : null;
          const delta = info && prev != null && prev !== 0 ? ((info.value / prev) - 1) * 100 : null;
          return (
            <div key={key} className="bg-white border border-gray-200 rounded-xl px-4 py-3 relative">
              <div className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-[11px] text-gray-500 uppercase tracking-wide font-semibold">{label}</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 font-mono tabular-nums mt-1">
                {info ? f(info.value) : '—'}{info?.prov && <> <P /></>}
              </p>
              <p className="text-xs mt-0.5">
                {info ? <span className="text-gray-400">{MONTHS[info.m]} {year}</span> : <span className="text-gray-400">No data</span>}
                {delta != null && (
                  <span className={`ml-2 font-semibold ${delta > 0 ? 'text-red-700' : delta < 0 ? 'text-emerald-700' : 'text-gray-500'}`}>
                    {delta > 0 ? '▲' : delta < 0 ? '▼' : '■'} {Math.abs(delta).toFixed(1)}% vs {info && prevOf(key, info.m) != null ? 'previous month' : ''}
                  </span>
                )}
              </p>
              <div className="absolute right-3 top-3"><Sparkline points={seriesOf(key)} /></div>
            </div>
          );
        })}
      </div>

      {/* Base month → measurement quarter */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-gray-500">Base month → measurement quarter</h2>
            <p className="text-sm text-gray-600 mt-0.5">The two numbers a PVC statement compares: your contract&apos;s base month against the average of the quarter the bill was measured in.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1.5">
              <span className="text-gray-500">Base</span>
              <select value={baseM} onChange={e => setBaseM(Number(e.target.value))} className="border border-gray-200 rounded-md px-2 py-1.5 bg-white">
                {MONTHS_LONG.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
              <select value={baseY} onChange={e => setBaseY(Number(e.target.value))} className="border border-gray-200 rounded-md px-2 py-1.5 bg-white">
                {Array.from({ length: 12 }, (_, i) => thisYear - i).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <ArrowRight className="h-4 w-4 text-gray-400" />
            <label className="flex items-center gap-1.5">
              <span className="text-gray-500">Quarter</span>
              <select value={qIdx ?? 0} onChange={e => setQIdx(Number(e.target.value))} className="border border-gray-200 rounded-md px-2 py-1.5 bg-white">
                {QUARTERS.map((q, i) => <option key={q} value={i}>{q}</option>)}
              </select>
              <select value={qY} onChange={e => setQY(Number(e.target.value))} className="border border-gray-200 rounded-md px-2 py-1.5 bg-white">
                {Array.from({ length: 12 }, (_, i) => thisYear - i).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
          </div>
        </div>

        {comparison ? (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-200">
                  <th className="text-left font-semibold py-2 pr-3">Series</th>
                  <th className="text-right font-semibold py-2 px-3">{MONTHS[baseM]} {baseY}</th>
                  <th className="text-right font-semibold py-2 px-3">{QUARTERS[qIdx ?? 0]} {qY} average</th>
                  <th className="text-right font-semibold py-2 pl-3">Change</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {comparison.map(r => (
                  <tr key={r.key} className="border-b border-gray-100">
                    <td className="py-2 pr-3 font-sans text-gray-800">{r.label}{r.anyBridged && <span className="ml-1.5 text-[10px] font-sans text-violet-600" title="New-series WPI months multiplied by the link factor, because the base month is on the old series">linked</span>}</td>
                    <td className="py-2 px-3 text-right">{r.money ? fmtRs(r.base) : fmt2(r.base)}{r.baseProv && <> <P /></>}</td>
                    <td className="py-2 px-3 text-right">
                      {r.money ? fmtRs(r.avg) : fmt2(r.avg)}{r.anyProv && <> <P /></>}
                      {r.avg != null && r.months < 3 && <span className="ml-1 text-[10px] font-sans text-gray-400">({r.months} of 3 months)</span>}
                    </td>
                    <td className={`py-2 pl-3 text-right font-semibold ${r.change == null ? 'text-gray-400' : r.change > 0 ? 'text-red-700' : r.change < 0 ? 'text-emerald-700' : 'text-gray-600'}`}>
                      {r.change == null ? '—' : `${r.change > 0 ? '+' : ''}${r.change.toFixed(2)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-500 mt-2">
              These are the figures a PVC statement for a bill measured in that quarter would use, for a contract based in that month. Quarter averages marked <P /> contain a provisional month and may still change.
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-400 mt-4">Loading the two years…</p>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          <button onClick={() => setTab('sheet')} className={`px-4 py-1.5 text-sm font-medium transition-colors ${tab === 'sheet' ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Data Sheet</button>
          <button onClick={() => setTab('glossary')} className={`px-4 py-1.5 text-sm font-medium transition-colors ${tab === 'glossary' ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Glossary</button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 flex-wrap">
            {yearChips.sort((a, b) => b - a).map(y => (
              <button key={y} onClick={() => setYear(y)} className={`px-2.5 py-1 text-xs rounded-full border font-semibold transition-colors ${year === y ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{y}</button>
            ))}
            <button onClick={() => setYear(y => y - 1)} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-800" title="Earlier years">‹ older</button>
          </div>
          <div className="flex items-center gap-1 border border-gray-200 rounded-lg p-1">
            <span className="text-xs text-gray-400 px-1 font-medium">Steel city</span>
            {STEEL_CITIES.map(c => (
              <button key={c} onClick={() => setSteelCity(c)} className={`px-2 py-1 text-xs rounded font-medium transition-colors ${steelCity === c ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                {c === 'Default' ? 'Chennai*' : c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Data Sheet */}
      {tab === 'sheet' && (
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[11px]">
                  <th className="sticky left-0 bg-gray-50 z-20 border-r border-gray-200" />
                  <th colSpan={2} className="px-3 py-1.5 text-center font-semibold text-gray-700 border-r border-gray-200">Labour &amp; fuel</th>
                  <th colSpan={4} className="px-3 py-1.5 text-center font-semibold text-gray-700 border-r border-gray-200">WPI series (2022-23 = 100, linked for old-base contracts)</th>
                  <th colSpan={4} className="px-3 py-1.5 text-center font-semibold text-emerald-700 bg-emerald-50/60">Steel (JPC) — {cityName} · ₹/MT</th>
                </tr>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-2 text-left font-semibold text-gray-500 sticky left-0 bg-gray-50 z-20 border-r border-gray-200 w-16">Month</th>
                  {NON_STEEL.map(c => (
                    <th key={c.key} className="px-3 py-2 text-center font-semibold text-gray-600 border-r border-gray-100 whitespace-nowrap">
                      <div>{c.label}</div>
                      <div className="text-gray-400 font-normal text-[10px]">{c.sub} · {c.base}</div>
                      {c.factor != null && (
                        <div className="text-violet-500 font-normal text-[10px]" title={`Values from May 2026 are on base 2022-23=100. For a contract based before that, they are multiplied by ${c.factor} to compare with its base month — see the note on the statement.`}>
                          link ×{c.factor}
                        </div>
                      )}
                    </th>
                  ))}
                  {steelCols.map(c => (
                    <th key={c.key} className="px-3 py-2 text-center text-[11px] font-semibold text-emerald-700 bg-emerald-50/40 border-l border-emerald-50 align-bottom">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {MONTHS.map((month, mi) => {
                  const row = rowOf(data, mi) || ({} as MonthlyData);
                  const hasData = allCols.some(c => val((row as any)[c.key]) != null);
                  const endOfQuarter = mi % 3 === 2;
                  const q = Math.floor(mi / 3);
                  const quarterHasData = endOfQuarter && allCols.some(c => quarterAvg(q, c.key));
                  return (
                    <FragmentRow key={month}>
                      <tr className={`hover:bg-gray-50 transition-colors ${!hasData ? 'opacity-35' : ''}`}>
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
                              className={`px-3 py-2.5 text-center font-mono tabular-nums ${i >= NON_STEEL.length ? 'bg-emerald-50/20 border-l border-emerald-50' : ''} ${prov ? 'text-amber-700 bg-amber-50/60' : 'text-gray-700'} ${clickable ? 'cursor-pointer hover:bg-emerald-100/50' : ''}`}
                              title={clickable ? (!subscriptionActive ? '🔒 Click for JPC breakdown' : 'Click for JPC breakdown') : formula(cv) ? `Formula: ${formula(cv)}` : undefined}
                              onClick={clickable ? () => {
                                if (!subscriptionActive) { locked(); return; }
                                setDetail({ month, colName: col.label, city: cityName, value: n!, detail: sd });
                              } : undefined}
                            >
                              {n == null ? <span className="text-gray-300">—</span> : (
                                <span className="inline-flex items-center justify-center gap-1">
                                  {isSteel ? fmtRs(n).replace('₹', '') : fmt2(n)}
                                  {prov && <P />}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                      {quarterHasData && (
                        <tr className="bg-emerald-50/70">
                          <td className="px-4 py-2 font-semibold text-emerald-800 sticky left-0 bg-emerald-50 z-10 border-r border-gray-200 whitespace-nowrap text-[11px]">Q{q + 1} avg</td>
                          {allCols.map((col, i) => {
                            const qa = quarterAvg(q, col.key);
                            const isSteel = col.key.startsWith('steel');
                            return (
                              <td key={col.key} className={`px-3 py-2 text-center font-mono tabular-nums font-semibold text-emerald-800 ${i >= NON_STEEL.length ? 'border-l border-emerald-100' : ''}`}
                                title={qa && qa.n < 3 ? `Average of ${qa.n} of 3 months so far` : 'Average of the three months — what the PVC uses'}>
                                {qa == null ? <span className="text-emerald-300">—</span> : (
                                  <span className="inline-flex items-center justify-center gap-1">
                                    {isSteel ? fmtRs(qa.avg).replace('₹', '') : fmt2(qa.avg)}
                                    {qa.prov && <P />}
                                    {qa.n < 3 && <span className="text-[9px] font-normal text-emerald-600">{qa.n}/3</span>}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      )}
                    </FragmentRow>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-gray-100 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1"><P /> provisional — the office may still revise it</span>
            <span><b className="text-emerald-800">Q avg</b> rows are the quarter averages the PVC uses ({'n'}/3 = months in so far)</span>
            <span><span className="text-violet-500">link ×</span> = factor applied to new-series WPI months for contracts based before May 2026</span>
            <span>Steel cells open the JPC working</span>
            <span className="text-emerald-600">*Chennai is the default steel city</span>
          </div>
        </div>
      )}

      {/* Glossary */}
      {tab === 'glossary' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {GLOSSARY.map(({ icon: Icon, title, sub, lines }) => (
            <div key={title} className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="h-4 w-4 text-emerald-500" />
                <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
              </div>
              <p className="text-xs text-gray-400 mb-3">{sub}</p>
              <ul className="space-y-1.5">
                {lines.map((l, i) => <li key={i} className="text-xs text-gray-600 leading-relaxed">{l}</li>)}
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

/** A keyed fragment for a month row plus its optional quarter row. */
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
