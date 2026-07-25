'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

interface Row {
  id: string;
  billNo: string;
  agreementNo: string | null;
  contractorName: string | null;
  zone: string;
  quarter: string;
  dateOfMeasurement: string;
  grossBillAmount: number;
  steelPvc: number;
  totalPvc: number;
  usedCity: string | null;
  correctCity: string;
  billedSteel: boolean;
  status: 'no_steel' | 'wrong_city' | 'steel_zero';
  affected: boolean;
}

const money = (n: number) =>
  (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SteelCityAuditPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/steel-city-audit');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const rows: Row[] = data?.bills || [];
  const affected = rows.filter((r) => r.affected);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" /> Steel city audit
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Bills whose steel PVC used the wrong JPC city, per GCC-2022 Clause 46A.9(2).
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>What changed:</strong> SWR used <b>Mumbai</b> → should be <b>Chennai</b>;
        NER used <b>Kolkata</b> → should be <b>Delhi</b>. Only bills with a steel component are
        affected — no steel means the city choice changed nothing. This page is read-only;
        nothing is recalculated automatically.
      </div>

      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Bills in SWR / NER</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{data.summary.billsInCorrectedZones}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Priced on wrong city</CardTitle></CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${data.summary.wrongCity ? 'text-amber-700' : 'text-emerald-700'}`}>
                {data.summary.wrongCity}
              </div>
            </CardContent>
          </Card>
          <Card className={data.summary.steelZero ? 'border-red-300' : ''}>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Steel billed but ₹0 PVC</CardTitle></CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${data.summary.steelZero ? 'text-red-700' : 'text-emerald-700'}`}>
                {data.summary.steelZero}
              </div>
              <div className="text-xs text-slate-500 mt-1">missing steel index</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">No steel billed</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-slate-700">{data.summary.noSteel}</div></CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Bills</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bill</TableHead>
                <TableHead>Agreement</TableHead>
                <TableHead>Zone</TableHead>
                <TableHead>City used → correct</TableHead>
                <TableHead className="text-right">Steel PVC</TableHead>
                <TableHead className="text-right">Total PVC</TableHead>
                <TableHead>Measured</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-sm text-slate-500 py-8">
                  No bills found in SWR or NER — nothing affected.
                </TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id} className={r.status === 'steel_zero' ? 'bg-red-50/50' : r.status === 'wrong_city' ? 'bg-amber-50/40' : ''}>
                  <TableCell className="font-medium text-sm">{r.billNo}</TableCell>
                  <TableCell className="text-sm">{r.agreementNo || '—'}</TableCell>
                  <TableCell><Badge variant="outline">{r.zone}</Badge></TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {r.usedCity ? <span className="text-red-600">{r.usedCity}</span> : '—'}
                    <span className="text-slate-400"> → </span>
                    <span className="text-emerald-700 font-medium">{r.correctCity}</span>
                  </TableCell>
                  <TableCell className="text-right text-sm">Rs {money(r.steelPvc)}</TableCell>
                  <TableCell className="text-right text-sm">Rs {money(r.totalPvc)}</TableCell>
                  <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                    {format(new Date(r.dateOfMeasurement), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell>
                    {r.status === 'steel_zero' && (
                      <Badge variant="outline" className="text-red-700 border-red-300 bg-red-50">steel billed, ₹0 paid</Badge>
                    )}
                    {r.status === 'wrong_city' && (
                      <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">wrong city</Badge>
                    )}
                    {r.status === 'no_steel' && (
                      <span className="text-xs text-slate-400 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> no steel</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
