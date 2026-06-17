'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getClientRoleInfo } from '@/lib/role-auth';
import { Trash2, Database, AlertTriangle, CheckCircle, CalendarX } from 'lucide-react';
import { BackButton } from '@/components/ui/back-button';

interface PriceIndex {
  id: string;
  name: string;
  description: string;
  baseValue: number;
  _count: { monthlyValues: number };
}

export default function AdminPriceIndicesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [indices, setIndices] = useState<PriceIndex[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [fromYear, setFromYear] = useState('2018');
  const [toYear, setToYear] = useState('2021');
  const [deletingRange, setDeletingRange] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    const roleInfo = getClientRoleInfo(session);
    if (!roleInfo.isAdmin) {
      router.push('/dashboard');
      return;
    }
    fetchIndices();
  }, [session, status]);

  const fetchIndices = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/price-indices');
      const data = await res.json();
      setIndices(data.indices || []);
    } catch {
      setMessage({ type: 'error', text: 'Failed to load indices' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete price index "${name}" and all its monthly data?`)) return;
    setDeleting(name);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/price-indices?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage({ type: 'success', text: `Deleted "${name}" — ${data.deletedMonthlyValues} monthly values removed.` });
      fetchIndices();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Delete failed' });
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteRange = async () => {
    if (!confirm(`Delete ALL monthly index values from ${fromYear} to ${toYear}? This cannot be undone.`)) return;
    setDeletingRange(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/price-indices?fromYear=${fromYear}&toYear=${toYear}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage({ type: 'success', text: `Deleted ${data.deletedMonthlyValues} monthly values from ${fromYear} to ${toYear}.` });
      fetchIndices();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Delete failed' });
    } finally {
      setDeletingRange(false);
    }
  };

  if (status === 'loading' || loading) {
    return <div className="flex items-center justify-center min-h-screen"><p className="text-slate-500">Loading…</p></div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <BackButton />
      <div className="flex items-center gap-3">
        <Database className="h-6 w-6 text-slate-700" />
        <h1 className="text-2xl font-bold text-slate-900">Price Indices</h1>
      </div>

      {message && (
        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {message.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      {/* Bulk delete by year range */}
      <Card className="border-red-100">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarX className="h-4 w-4 text-red-600" />
            Delete Monthly Values by Year Range
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">From Year</Label>
              <Input
                type="number"
                value={fromYear}
                onChange={e => setFromYear(e.target.value)}
                className="w-28"
                min="2000"
                max="2099"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To Year</Label>
              <Input
                type="number"
                value={toYear}
                onChange={e => setToYear(e.target.value)}
                className="w-28"
                min="2000"
                max="2099"
              />
            </div>
            <Button
              variant="destructive"
              onClick={handleDeleteRange}
              disabled={deletingRange}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {deletingRange ? 'Deleting…' : `Delete ${fromYear}–${toYear}`}
            </Button>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Deletes monthly values across all indices for the selected year range. Index records are kept.
          </p>
        </CardContent>
      </Card>

      {/* Per-index management */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Price Indices ({indices.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
            {indices.map(idx => (
              <div key={idx.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex-1">
                  <p className="font-medium text-slate-800 text-sm">{idx.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Base: {idx.baseValue}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={idx._count.monthlyValues === 0 ? 'destructive' : 'secondary'} className="text-xs">
                    {idx._count.monthlyValues} monthly values
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700 h-8 w-8 p-0"
                    disabled={deleting === idx.name}
                    onClick={() => handleDelete(idx.name)}
                    title="Delete index and all its data"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
