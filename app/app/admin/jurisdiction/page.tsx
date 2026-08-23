'use client';

/**
 * Transfer the administration of contracts from one railway zone to another.
 *
 * Built for Railway Board order 2025/E&R/1(3)/1 (21 Aug 2026): the Mangaluru area moves
 * from SR/Palakkad to SWR/Mysuru from 1 Oct 2026, and the agreement numbers do not
 * change. Which contracts are in that area is something only the person knows — the
 * app has no station geography — so this is a pick-list, not a rule.
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowRight, RefreshCw, Landmark, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface ContractRow {
  id: string; agreementNo: string; contractorName: string; workDescription: string; bills: number;
  agreementZone: string | null; administeringZone: string | null;
}
interface Transfer { at: string; fromZone: string | null; toZone: string; toDivision?: string | null; orderRef: string; effectiveDate?: string | null; note?: string | null; byUserEmail: string | null; billsRestamped: number }
interface Transferred { id: string; agreementNo: string; contractorName: string; administeringZone: string; jurisdictionTransfers: Transfer[] }

export default function JurisdictionPage() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [transferred, setTransferred] = useState<Transferred[]>([]);
  const [zones, setZones] = useState<Array<{ code: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [toZone, setToZone] = useState('SWR');
  const [toDivision, setToDivision] = useState('Mysuru (MYS)');
  const [orderRef, setOrderRef] = useState('Railway Board No. 2025/E&R/1(3)/1 dtd 21-8-2026');
  const [effectiveDate, setEffectiveDate] = useState('2026-10-01');
  const [note, setNote] = useState('Mangaluru area (up to Ullal) transferred from Palakkad division of SR to Mysuru division of SWR.');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/jurisdiction');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load');
      setReady(!!data.ready);
      setContracts(data.contracts || []);
      setTransferred(data.transferred || []);
      setZones(data.zones || []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contracts;
    return contracts.filter(c =>
      c.agreementNo.toLowerCase().includes(q) ||
      c.contractorName.toLowerCase().includes(q) ||
      c.workDescription.toLowerCase().includes(q),
    );
  }, [contracts, query]);

  const toggle = (id: string) => setPicked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const pickAllVisible = () => setPicked(new Set(visible.map(c => c.id)));

  const transfer = async () => {
    if (picked.size === 0) return;
    const list = contracts.filter(c => picked.has(c.id)).map(c => c.agreementNo).slice(0, 8).join(', ');
    if (!confirm(`Transfer ${picked.size} contract(s) to ${toZone}?\n\n${list}${picked.size > 8 ? ', …' : ''}\n\nTheir bills will be restamped to ${toZone}. This is recorded and can be reversed by transferring back.`)) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/jurisdiction', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractIds: [...picked], toZone, toDivision, orderRef, effectiveDate, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Transfer failed');
      if (data.failed > 0) {
        const firstErr = data.results.find((r: any) => !r.ok)?.error;
        toast(`${data.moved} moved, ${data.failed} not: ${firstErr}`, { icon: '⚠️', duration: 9000 });
      } else {
        toast.success(`${data.moved} contract(s) now administered by ${toZone}.`);
      }
      setPicked(new Set());
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Landmark className="h-6 w-6 text-emerald-600" /> Jurisdiction transfers</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-[78ch]">
          When an area moves from one railway zone to another, its contracts keep their agreement numbers but
          are run by the new zone. Transferring a contract here makes the new zone&apos;s officials see it — and its bills —
          and the old zone&apos;s stop. The PVC figures do not change. Every transfer is recorded with the order it was made under.
          The app cannot tell which contracts are in the moved area; that is for you to pick.
        </p>
      </div>

      {ready === false && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          The database columns for this are not applied yet. Go to <b>Admin → System → Pending DB changes</b> and press Apply, then come back.
          Until then nothing here can be saved, and the app behaves exactly as before.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] items-start">
        {/* Pick contracts */}
        <section className="rounded-xl border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center gap-2 p-3 border-b border-gray-100">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-gray-400" />
              <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search agreement, contractor or work — e.g. PGT, Mangaluru" className="pl-8" />
            </div>
            <Button variant="outline" size="sm" onClick={pickAllVisible} disabled={visible.length === 0}>Pick all {visible.length}</Button>
            <Button variant="outline" size="sm" onClick={() => setPicked(new Set())} disabled={picked.size === 0}>Clear</Button>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-100">
            {visible.map(c => (
              <label key={c.id} className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50">
                <input type="checkbox" className="mt-1" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <b className="text-sm">{c.agreementNo}</b>
                    <span className="text-[11px] rounded-full px-2 py-0.5 bg-gray-100 text-gray-600">{c.bills} {c.bills === 1 ? 'bill' : 'bills'}</span>
                    {c.administeringZone && (
                      <span className="text-[11px] rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-800 font-semibold">
                        administered by {c.administeringZone}{c.agreementZone && c.agreementZone !== c.administeringZone ? ` (number says ${c.agreementZone})` : ''}
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-gray-500 truncate">{c.contractorName} · {c.workDescription}</span>
                </span>
              </label>
            ))}
            {!loading && visible.length === 0 && <p className="p-6 text-sm text-gray-400 text-center">No contracts match.</p>}
          </div>
        </section>

        {/* The transfer */}
        <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <h2 className="font-bold">Transfer {picked.size > 0 ? `${picked.size} contract${picked.size === 1 ? '' : 's'}` : '…'}</h2>
          <label className="block text-sm">
            <span className="text-gray-600">To zone</span>
            <select value={toZone} onChange={e => setToZone(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-md px-2 py-2 bg-white">
              {zones.map(z => <option key={z.code} value={z.code}>{z.code} — {z.name}</option>)}
            </select>
          </label>
          <label className="block text-sm"><span className="text-gray-600">Division (for the record)</span><Input className="mt-1" value={toDivision} onChange={e => setToDivision(e.target.value)} /></label>
          <label className="block text-sm"><span className="text-gray-600">Order reference <span className="text-red-600">*</span></span><Input className="mt-1" value={orderRef} onChange={e => setOrderRef(e.target.value)} /></label>
          <label className="block text-sm"><span className="text-gray-600">Effective date (as in the order)</span><Input className="mt-1" type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} /></label>
          <label className="block text-sm"><span className="text-gray-600">Note</span><Input className="mt-1" value={note} onChange={e => setNote(e.target.value)} /></label>
          <Button className="w-full" onClick={transfer} disabled={saving || picked.size === 0 || !orderRef.trim() || ready === false}>
            {saving ? 'Transferring…' : <>Transfer to {toZone} <ArrowRight className="h-4 w-4 ml-1.5" /></>}
          </Button>
          <p className="text-xs text-gray-500">
            Bills on the picked contracts are restamped to the new zone so the new zone&apos;s officials can see them.
            Reversible: transfer back the same way. The agreement numbers are never touched.
          </p>
        </section>
      </div>

      {/* History */}
      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="px-4 py-3 border-b border-gray-100"><h2 className="font-bold">Transferred contracts</h2></div>
        {transferred.length === 0 ? (
          <p className="p-6 text-sm text-gray-400 text-center">None yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {transferred.map(t => (
              <div key={t.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <b>{t.agreementNo}</b>
                  <span className="text-gray-500">{t.contractorName}</span>
                  <span className="ml-auto text-[11px] rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-800 font-semibold">administered by {t.administeringZone}</span>
                </div>
                <ul className="mt-1.5 space-y-1 text-xs text-gray-600">
                  {t.jurisdictionTransfers.slice().reverse().map((h, i) => (
                    <li key={i}>
                      {new Date(h.at).toLocaleString('en-IN')} · {h.fromZone || '?'} → <b>{h.toZone}</b>{h.toDivision ? ` (${h.toDivision})` : ''} · {h.orderRef}
                      {h.effectiveDate ? ` · effective ${h.effectiveDate}` : ''} · {h.billsRestamped} bills · by {h.byUserEmail || '—'}
                      {h.note ? <span className="block text-gray-500">{h.note}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
