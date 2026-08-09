'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, AlertTriangle, Loader2, ShieldQuestion } from 'lucide-react';
import { toast } from 'react-hot-toast';

/**
 * Verifies the hand-entered JPC rates against the uploaded official sheets.
 *
 * Years of steel rates were typed in by hand before the sheet reader existed. This
 * walks a year month by month: each month's two fortnight price pages are read out of
 * the stored year document and compared, cell by cell, with the database. It reports —
 * it never writes. A mismatch is a question (typo in the entry, or misread on the
 * scan?) whose answer belongs to the admin, on the steel-import screen, with the sheet
 * open beside it.
 *
 * One month per request, because each fortnight page costs an AI reading and a whole
 * year would not fit a serverless clock — the walk happens here, with progress shown.
 */

interface Mismatch {
  item: string;
  itemCode: string;
  city: string;
  dbValue: number;
  sheetValue: number;
}

interface FortnightResult {
  fortnight: 'f1' | 'f2';
  pageIndex: number;
  priceDate?: string | null;
  monthMismatch?: boolean;
  error?: string;
  matched?: number;
  mismatched?: Mismatch[];
  sheetOnly?: { item: string; city: string; sheetValue: number }[];
  dbOnly?: number;
  unreadableCells?: number;
}

interface MonthResult {
  month: number;
  error?: string;
  fortnights?: FortnightResult[];
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function JpcCrossCheckPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear - 1));
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [results, setResults] = useState<MonthResult[]>([]);
  /** Rows already corrected this session, keyed month|fortnight|itemCode|city. */
  const [fixedKeys, setFixedKeys] = useState<Set<string>>(new Set());
  const [fixingKey, setFixingKey] = useState<string | null>(null);
  /** Manual overrides typed into a row's input, same key. */
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  /**
   * Which bills a correction has moved.
   *
   * A bill's PVC is stored, not recomputed on the fly — so correcting a rate leaves
   * existing bills quietly disagreeing with the indices they cite, and nothing says
   * which. This asks.
   */
  const [impact, setImpact] = useState<any>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [recalcId, setRecalcId] = useState<string | null>(null);
  const [recalcResults, setRecalcResults] = useState<Record<string, { difference: number }>>({});

  const loadImpact = async () => {
    setImpactLoading(true);
    try {
      const res = await fetch('/api/admin/jpc-impact');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not check');
      setImpact(data);
      if ((data.bills || []).length === 0) toast.success(data.note || 'No bills depend on a corrected rate.');
    } catch (err: any) {
      toast.error(err.message || 'Could not check affected bills');
    } finally {
      setImpactLoading(false);
    }
  };

  /** Recalculate one bill, showing what the stored figure becomes. */
  const recalcBill = async (billId: string, billNo: string) => {
    setRecalcId(billId);
    try {
      const res = await fetch('/api/admin/jpc-impact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Recalculation failed');
      setRecalcResults(prev => ({ ...prev, [billId]: { difference: data.difference } }));
      const delta = data.difference;
      toast.success(
        `${billNo}: PVC ${delta === 0 ? 'unchanged' : (delta > 0 ? 'up ' : 'down ') + Math.abs(delta).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
        { duration: 7000 },
      );
    } catch (err: any) {
      toast.error(err.message || 'Recalculation failed');
    } finally {
      setRecalcId(null);
    }
  };

  /**
   * Apply one correction — the sheet's figure, or whatever the admin typed over it
   * after checking the scan by eye. The endpoint updates the cell AND recomputes the
   * month's steel indices through the same formulas the import uses, so nothing
   * downstream is left stale.
   */
  const applyFix = async (monthNum: number, fortnight: string, itemCode: string, city: string, value: number) => {
    const key = `${monthNum}|${fortnight}|${itemCode}|${city}`;
    if (!isFinite(value) || value <= 0) {
      toast.error('Enter the value to save first');
      return;
    }
    setFixingKey(key);
    try {
      const res = await fetch('/api/admin/jpc-cross-check/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemCode,
          city,
          month: `${year}-${String(monthNum).padStart(2, '0')}`,
          fortnight,
          value,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      setFixedKeys(prev => new Set(prev).add(key));
      const indices = Object.entries(data.indices || {}).map(([k, v]) => `${k}=${v}`).join(', ');
      toast.success(`Saved ${value.toLocaleString('en-IN')} — indices recomputed (${indices})`, { duration: 6000 });
    } catch (err: any) {
      toast.error(err.message || 'Update failed');
    } finally {
      setFixingKey(null);
    }
  };

  /**
   * Walks a document page by page when it doesn't follow the six-pages-per-month
   * rhythm (the 2026 production is 16 pages for 3 months). Each page identifies
   * ITSELF by its printed date; pages that aren't 24-item price tables say so and
   * are skipped. Results regroup into months exactly as the rhythm mode reports.
   */
  const runScanMode = async (
    docs: { docId: string; fileName?: string }[],
    collected: MonthResult[],
  ) => {
    const byMonth = new Map<number, FortnightResult[]>();
    for (let d = 0; d < docs.length; d++) {
      const { docId } = docs[d];
      // The page count comes back with the first page; walking past the end simply
      // reports done, so no document needs measuring in advance.
      let pageCount = Infinity;
      for (let page = 1; page <= pageCount; page++) {
        const ofDocs = docs.length > 1 ? ` (file ${d + 1} of ${docs.length})` : '';
        setProgress(`Reading page ${page}${isFinite(pageCount) ? ` of ${pageCount}` : ''}${ofDocs} — pages identify themselves by their printed date...`);
        try {
          const res = await fetch(`/api/admin/jpc-cross-check?year=${year}&docId=${docId}&page=${page}`, { method: 'POST' });
          const data = await res.json();
          if (typeof data.pageCount === 'number') pageCount = data.pageCount;
          if (data.done) break;
          if (!res.ok || data.skipped) continue;
          const monthNum = parseInt(String(data.month).split('-')[1], 10);
          if (!monthNum) continue;
          const list = byMonth.get(monthNum) || [];
          list.push({
            fortnight: data.fortnight,
            pageIndex: data.page,
            priceDate: data.priceDate,
            matched: data.matched,
            mismatched: data.mismatched,
            sheetOnly: data.sheetOnly,
            dbOnly: data.dbOnly,
            unreadableCells: data.unreadableCells,
          });
          byMonth.set(monthNum, list);
        } catch {
          // A failed page read is a skipped page; the summary counts what was verified.
        }
        const merged = [...byMonth.entries()].sort((a, b) => a[0] - b[0]).map(([m, f]) => ({ month: m, fortnights: f }));
        setResults([...collected, ...merged]);
      }
    }
    const merged = [...byMonth.entries()].sort((a, b) => a[0] - b[0]).map(([m, f]) => ({ month: m, fortnights: f }));
    collected.push(...merged);
    setResults([...collected]);
  };

  const run = async () => {
    setRunning(true);
    setResults([]);
    const collected: MonthResult[] = [];
    try {
      for (let month = 1; month <= 12; month++) {
        setProgress(`Checking ${MONTH_NAMES[month - 1]} ${year} — reading both fortnight pages...`);
        try {
          const res = await fetch(`/api/admin/jpc-cross-check?year=${year}&month=${month}`, { method: 'POST' });
          const data = await res.json();
          if (res.status === 422 && data.scanMode) {
            // A document that doesn't follow the rhythm turns the whole year over to the
            // page walk, across EVERY file the year holds — a second upload was being
            // left unread entirely. Anything the month loop had already gathered is
            // discarded first: the walk covers those months too, and keeping both would
            // report the same fortnight twice.
            collected.length = 0;
            setResults([]);
            await runScanMode(
              data.scanMode.docs || [{ docId: data.scanMode.docId }],
              collected,
            );
            break;
          }
          if (!res.ok) {
            collected.push({ month, error: data.error || `HTTP ${res.status}` });
          } else {
            collected.push({ month, fortnights: data.fortnights });
          }
        } catch (err: any) {
          collected.push({ month, error: err?.message || 'request failed' });
        }
        setResults([...collected]);
      }
      const mismatchTotal = collected.reduce(
        (n, m) => n + (m.fortnights || []).reduce((k, f) => k + (f.mismatched?.length || 0), 0),
        0,
      );
      toast[mismatchTotal === 0 ? 'success' : 'error'](
        mismatchTotal === 0
          ? `Cross-check complete — no mismatches found in ${year}.`
          : `Cross-check complete — ${mismatchTotal} mismatch(es) need a look.`,
        { duration: 8000 },
      );
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const totals = results.reduce(
    (t, m) => {
      for (const f of m.fortnights || []) {
        t.matched += f.matched || 0;
        t.mismatched += f.mismatched?.length || 0;
        t.sheetOnly += f.sheetOnly?.length || 0;
        t.unreadable += f.unreadableCells || 0;
      }
      if (m.error) t.monthErrors++;
      return t;
    },
    { matched: 0, mismatched: 0, sheetOnly: 0, unreadable: 0, monthErrors: 0 },
  );

  return (
    <div className="container mx-auto p-4 max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">JPC Rate Cross-check</h1>
        <p className="text-sm text-gray-500 mt-1">
          Reads each month&apos;s official sheet pages from the uploaded year document and compares
          them, cell by cell, with the rates in the database. Nothing is changed — mismatches are
          yours to judge on the steel-import screen with the sheet open beside you.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Select value={year} onValueChange={setYear} disabled={running}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Array.from({ length: 8 }, (_, i) => currentYear - i).map(y => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={run} disabled={running} className="gap-2">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldQuestion className="h-4 w-4" />}
          {running ? 'Checking...' : `Check ${year}`}
        </Button>
        {progress && <span className="text-sm text-gray-500">{progress}</span>}
        <Button onClick={loadImpact} variant="outline" disabled={impactLoading || running} className="gap-2">
          {impactLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
          Which bills are affected?
        </Button>
      </div>

      {impact && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {impact.bills.length === 0 ? (
                <span className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="h-5 w-5" />
                  {impact.corrections.length} rate correction(s) — no existing bill draws on them
                </span>
              ) : (
                <span className="flex items-center gap-2 text-amber-700">
                  <AlertTriangle className="h-5 w-5" />
                  {impact.bills.length} bill(s) use a corrected rate
                  {impact.summary?.needingDecision ? ` · ${impact.summary.needingDecision} already submitted or approved` : ''}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {impact.corrections.length > 0 && (
              <p className="text-xs text-gray-500">
                Corrected so far:{' '}
                {impact.touched.map((t: any) => `${t.city} ${t.monthKey} (${t.items.join(', ')})`).join(' · ')}
              </p>
            )}
            {impact.bills.length > 0 && (
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead><tr className="text-left text-gray-500">
                    <th className="pr-3 py-1">Bill</th><th className="pr-3">Agreement</th><th className="pr-3">Steel city</th>
                    <th className="pr-3">Months used</th><th className="pr-3">Status</th>
                    <th className="pr-3 text-right">Stored PVC</th><th className="pr-3">Recalculate</th>
                  </tr></thead>
                  <tbody>
                    {impact.bills.map((b: any) => {
                      const done = recalcResults[b.billId];
                      const signed = ['approved', 'paid', 'submitted'].includes(String(b.status).toLowerCase());
                      return (
                        <tr key={b.billId} className="border-t border-gray-200">
                          <td className="pr-3 py-1 font-medium">{b.billNo}</td>
                          <td className="pr-3">{b.agreementNo}</td>
                          <td className="pr-3">{b.steelCity}</td>
                          <td className="pr-3">{b.months.join(', ')}</td>
                          <td className={`pr-3 ${signed ? 'text-amber-700 font-medium' : 'text-gray-500'}`}>{b.status}</td>
                          <td className="pr-3 text-right font-mono">{b.storedTotalPvc.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                          <td className="pr-3 py-0.5">
                            {done ? (
                              <span className={done.difference === 0 ? 'text-gray-500' : 'text-green-700 font-medium'}>
                                {done.difference === 0
                                  ? 'unchanged'
                                  : `${done.difference > 0 ? '+' : ''}${done.difference.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                variant={signed ? 'outline' : 'default'}
                                className="h-6 px-2 text-[11px]"
                                disabled={recalcId === b.billId}
                                onClick={() => recalcBill(b.billId, b.billNo)}
                              >
                                {recalcId === b.billId ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Recalculate'}
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] text-gray-400">
              A bill&apos;s PVC is stored as it was computed, so a corrected rate does not reach it by
              itself. Recalculating rewrites that figure — for a bill already submitted or approved
              (marked above), decide first whether a revised statement is the right thing to issue.
            </p>
          </CardContent>
        </Card>
      )}

      {results.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {totals.mismatched === 0 && totals.monthErrors === 0 ? (
                <span className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="h-5 w-5" /> {totals.matched} cells verified against the sheets — all match
                </span>
              ) : (
                <span className="flex items-center gap-2 text-amber-700">
                  <AlertTriangle className="h-5 w-5" />
                  {totals.matched} match · {totals.mismatched} differ
                  {totals.sheetOnly ? ` · ${totals.sheetOnly} on sheet but not in DB` : ''}
                  {totals.unreadable ? ` · ${totals.unreadable} unverifiable (NA/unreadable on sheet)` : ''}
                  {totals.monthErrors ? ` · ${totals.monthErrors} month(s) could not be checked` : ''}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {results.map((m) => {
              const mismatches = (m.fortnights || []).flatMap(f =>
                (f.mismatched || []).map(x => ({ ...x, fortnight: f.fortnight })));
              const sheetOnly = (m.fortnights || []).flatMap(f =>
                (f.sheetOnly || []).map(x => ({ ...x, fortnight: f.fortnight })));
              const pageErrors = (m.fortnights || []).filter(f => f.error);
              const monthShift = (m.fortnights || []).filter(f => f.monthMismatch);
              const clean = !m.error && mismatches.length === 0 && sheetOnly.length === 0 && pageErrors.length === 0 && monthShift.length === 0;
              if (clean) return (
                <div key={m.month} className="text-sm text-gray-500 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" /> {MONTH_NAMES[m.month - 1]}: all stored values match the sheet
                </div>
              );
              return (
                <div key={m.month} className="border border-amber-200 bg-amber-50/50 rounded-lg p-3 space-y-2">
                  <p className="font-semibold text-sm">{MONTH_NAMES[m.month - 1]} {year}</p>
                  {m.error && <p className="text-sm text-red-700">{m.error}</p>}
                  {pageErrors.map(f => (
                    <p key={f.fortnight} className="text-sm text-red-700">
                      {f.fortnight.toUpperCase()} page could not be read: {f.error}
                    </p>
                  ))}
                  {monthShift.map(f => (
                    <p key={`shift-${f.fortnight}`} className="text-sm text-red-700 font-medium">
                      ⚠ The {f.fortnight.toUpperCase()} page&apos;s own printed date is for a different month —
                      the {year} document may be assembled out of order. Check the upload.
                    </p>
                  ))}
                  {mismatches.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="text-xs w-full">
                        <thead><tr className="text-left text-gray-500">
                          <th className="pr-3 py-1">Item</th><th className="pr-3">City</th><th className="pr-3">Fortnight</th>
                          <th className="pr-3 text-right">In database</th><th className="pr-3 text-right">On sheet</th>
                          <th className="pr-3">Correct to</th>
                        </tr></thead>
                        <tbody>
                          {mismatches.map((x, i) => {
                            const key = `${m.month}|${x.fortnight}|${x.itemCode}|${x.city}`;
                            const fixed = fixedKeys.has(key);
                            return (
                              <tr key={i} className={`border-t border-amber-200 ${fixed ? 'opacity-60' : ''}`}>
                                <td className="pr-3 py-1">{x.item}</td>
                                <td className="pr-3">{x.city}</td>
                                <td className="pr-3">{x.fortnight.toUpperCase()}</td>
                                <td className="pr-3 text-right font-mono text-red-700">{x.dbValue.toLocaleString('en-IN')}</td>
                                <td className="pr-3 text-right font-mono text-green-700">{x.sheetValue.toLocaleString('en-IN')}</td>
                                <td className="pr-3 py-0.5">
                                  {fixed ? (
                                    <span className="text-green-700 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> saved</span>
                                  ) : (
                                    <span className="flex items-center gap-1">
                                      {/* Pre-filled with the sheet's figure; type over it when the
                                          scan misled the reader and your eye knows better. */}
                                      <input
                                        type="number"
                                        className="w-24 border rounded px-1.5 py-0.5 text-right font-mono"
                                        value={manualValues[key] ?? String(x.sheetValue)}
                                        onChange={(e) => setManualValues(prev => ({ ...prev, [key]: e.target.value }))}
                                        disabled={fixingKey === key}
                                      />
                                      <Button
                                        size="sm"
                                        className="h-6 px-2 text-[11px]"
                                        disabled={fixingKey === key}
                                        onClick={() => applyFix(m.month, x.fortnight, x.itemCode, x.city, Number(manualValues[key] ?? x.sheetValue))}
                                      >
                                        {fixingKey === key ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                                      </Button>
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {sheetOnly.length > 0 && (
                    <div className="text-xs text-gray-600 space-y-1">
                      <p className="font-medium">On the sheet but missing in the database:</p>
                      {sheetOnly.map((x: any, i) => {
                        const key = `${m.month}|${x.fortnight}|${x.itemCode}|${x.city}`;
                        const fixed = fixedKeys.has(key);
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <span className="min-w-[16rem]">{x.item} · {x.city} · {x.fortnight.toUpperCase()}</span>
                            {fixed ? (
                              <span className="text-green-700 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> saved</span>
                            ) : (
                              <>
                                <input
                                  type="number"
                                  className="w-24 border rounded px-1.5 py-0.5 text-right font-mono"
                                  value={manualValues[key] ?? String(x.sheetValue)}
                                  onChange={(e) => setManualValues(prev => ({ ...prev, [key]: e.target.value }))}
                                  disabled={fixingKey === key}
                                />
                                <Button
                                  size="sm"
                                  className="h-6 px-2 text-[11px]"
                                  disabled={fixingKey === key}
                                  onClick={() => applyFix(m.month, x.fortnight, x.itemCode, x.city, Number(manualValues[key] ?? x.sheetValue))}
                                >
                                  {fixingKey === key ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}
                                </Button>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            <p className="text-[11px] text-gray-400">
              Sheet values are read by AI from scans — treat a mismatch as a question, not a verdict.
              Fix confirmed entry errors on the Steel Import screen; a misread sheet cell needs no action.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
