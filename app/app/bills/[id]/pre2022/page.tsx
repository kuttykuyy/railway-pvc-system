'use client';

/**
 * The price variation statement for a contract under the PRE-2022 GCC.
 *
 * A separate page from the ordinary bill view, for the same reason the calculator is a
 * separate module: almost nothing about this clause matches the current one, and showing
 * both on one screen invites reading a figure computed under the wrong rules. This page
 * says on its face which clause it used.
 *
 * It also carries the one decision the whole statement turns on — which of Clause
 * 46A.6's six work types the contract is. That clause classifies the CONTRACT, not the
 * item, so there is one choice here and no item-by-item classification anywhere.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, RefreshCw, Info } from 'lucide-react';

interface Component {
  name: string;
  appliedTo: number;
  percentage: number;
  baseIndex: number;
  quarterIndex: number;
  amount: number;
}

interface Pricing {
  billNo: string | null;
  contractId: string | null;
  agreementNo: string | null;
  quarter: string;
  baseMonth: string;
  quarterMonths: string[];
  workType: string;
  workTypeProposed: boolean;
  grossValueOfWork: number;
  cementValue: number;
  steelValue: number;
  varyingAmount: number;
  components: Component[];
  totalPvc: number;
  notes: string[];
}

interface WorkTypeOption {
  key: string;
  label: string;
  percentages: { labour: number; otherMaterial: number; plantMachinery: number; fuel: number; explosives: number; fixed: number };
}

const rupees = (value: number) =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const monthName = (ym: string) => {
  const [year, month] = ym.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

export default function Pre2022BillPage() {
  const params = useParams();
  const billId = String(params?.id || '');

  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [workTypes, setWorkTypes] = useState<WorkTypeOption[]>([]);
  const [chosen, setChosen] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bills/${billId}/pre2022-pvc`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not price this bill');
      setPricing(data);

      if (data.contractId) {
        const clauseRes = await fetch(`/api/contracts/${data.contractId}/pvc-clause`);
        const clause = await clauseRes.json();
        if (clauseRes.ok) {
          setWorkTypes(clause.workTypes || []);
          setChosen(clause.setup?.workType || '');
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [billId]);

  useEffect(() => { if (billId) load(); }, [billId, load]);

  const saveWorkType = async (key: string) => {
    if (!pricing?.contractId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/contracts/${pricing.contractId}/pvc-clause`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pre2022WorkType: key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save');
      setChosen(key);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Working out the price variation…</div>;
  }

  if (error && !pricing) {
    return (
      <div className="p-6 max-w-3xl">
        <Card className="border-red-300">
          <CardHeader><CardTitle className="text-red-700 text-base">This bill cannot be priced yet</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-3">
            <p>{error}</p>
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-1" />Try again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!pricing) return null;

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold">Price Variation — older GCC</h1>
        <p className="text-sm text-muted-foreground">
          {pricing.agreementNo} {pricing.billNo ? `· Bill ${pricing.billNo}` : ''}
        </p>
      </div>

      {/* Which clause, said on the face of the page rather than assumed. */}
      <Card className="border-amber-300 bg-amber-50">
        <CardContent className="pt-4 text-sm space-y-2">
          {pricing.notes.map((note, i) => (
            <p key={i} className="flex gap-2">
              <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" />
              <span>{note}</span>
            </p>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Work type (Clause 46A.6)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This clause classifies the whole contract, not each item — so one choice covers every
            schedule in the bill. The percentages differ a great deal between types.
          </p>
          {pricing.workTypeProposed && (
            <p className="text-sm text-amber-800 flex gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              Proposed from the work description. Confirm it against the tender before submitting.
            </p>
          )}
          <div className="space-y-2">
            {workTypes.map(option => {
              const active = chosen === option.key;
              const p = option.percentages;
              return (
                <button
                  key={option.key}
                  onClick={() => saveWorkType(option.key)}
                  disabled={saving}
                  className={`w-full text-left border rounded-md p-3 text-sm transition ${
                    active ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-400'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-medium">{option.label}</span>
                    {active && <Badge variant="secondary">In use</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Labour {p.labour}% · Material {p.otherMaterial}% · Plant {p.plantMachinery}% · Fuel {p.fuel}%
                    {p.explosives > 0 ? ` · Explosives ${p.explosives}%` : ''} · Fixed {p.fixed}%
                  </div>
                </button>
              );
            })}
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Period</CardTitle></CardHeader>
        <CardContent className="text-sm grid sm:grid-cols-3 gap-3">
          <div><div className="text-muted-foreground">Base month</div><div className="font-medium">{monthName(pricing.baseMonth)}</div></div>
          <div><div className="text-muted-foreground">Quarter</div><div className="font-medium">{pricing.quarter}</div></div>
          <div><div className="text-muted-foreground">Months averaged</div><div className="font-medium">{pricing.quarterMonths.map(monthName).join(', ')}</div></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">What the percentages work on</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          <div className="flex justify-between"><span>Gross value of work done</span><span>{rupees(pricing.grossValueOfWork)}</span></div>
          {pricing.cementValue > 0 && (
            <div className="flex justify-between text-muted-foreground"><span>less cement supplied</span><span>− {rupees(pricing.cementValue)}</span></div>
          )}
          {pricing.steelValue > 0 && (
            <div className="flex justify-between text-muted-foreground"><span>less steel supplied</span><span>− {rupees(pricing.steelValue)}</span></div>
          )}
          <div className="flex justify-between font-medium border-t pt-1"><span>Varying amount</span><span>{rupees(pricing.varyingAmount)}</span></div>
          <p className="text-xs text-muted-foreground pt-2">
            Cement and steel come out here and are paid on their own below, in full — this clause has no 85% factor.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Components</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-3 py-2">Component</th>
                  <th className="px-3 py-2 text-right">Applied to (Rs.)</th>
                  <th className="px-3 py-2 text-right">%</th>
                  <th className="px-3 py-2 text-right">Base</th>
                  <th className="px-3 py-2 text-right">Quarter</th>
                  <th className="px-3 py-2 text-right">Amount (Rs.)</th>
                </tr>
              </thead>
              <tbody>
                {pricing.components.map((c, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2">{c.name}</td>
                    <td className="px-3 py-2 text-right">{rupees(c.appliedTo)}</td>
                    <td className="px-3 py-2 text-right">{c.percentage}</td>
                    <td className="px-3 py-2 text-right">{c.baseIndex ? c.baseIndex.toFixed(2) : '—'}</td>
                    <td className="px-3 py-2 text-right">{c.quarterIndex ? c.quarterIndex.toFixed(2) : '—'}</td>
                    <td className={`px-3 py-2 text-right ${c.amount < 0 ? 'text-red-700' : ''}`}>{rupees(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-semibold">
                  <td className="px-3 py-2" colSpan={5}>Total price variation</td>
                  <td className={`px-3 py-2 text-right ${pricing.totalPvc < 0 ? 'text-red-700' : ''}`}>{rupees(pricing.totalPvc)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      <Button variant="outline" size="sm" onClick={load} disabled={loading}>
        <RefreshCw className="h-4 w-4 mr-1" />Recalculate
      </Button>
    </div>
  );
}
