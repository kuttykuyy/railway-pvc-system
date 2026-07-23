'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'react-hot-toast';
import { Trash2, Plus, Search, Loader2, Pencil, X, Check, Package } from 'lucide-react';

interface Coefficient {
  id: string;
  dsrCode: string;
  description: string;
  workUnit: string;
  cementQuantityPerUnit: number;
  cementUnit: string;
  source: string;
  notes: string | null;
  isActive: boolean;
  updatedAt: string;
}

const emptyForm = { dsrCode: '', description: '', workUnit: '', cementQuantityPerUnit: '' };

export default function DsrCementCoefficientsPage() {
  const [rows, setRows] = useState<Coefficient[]>([]);
  const [total, setTotal] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ description: '', workUnit: '', cementQuantityPerUnit: '' });

  const load = useCallback(async (search: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/dsr-cement-coefficients?q=${encodeURIComponent(search)}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not load coefficients.');
        return;
      }
      setRows(data.coefficients || []);
      setTotal(data.total || 0);
      setActiveCount(data.activeCount || 0);
    } catch {
      toast.error('Could not load coefficients.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(q), 300);
    return () => clearTimeout(t);
  }, [q, load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/admin/dsr-cement-coefficients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, cementQuantityPerUnit: Number(form.cementQuantityPerUnit), notes: 'Added by an administrator.' }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not save.');
        return;
      }
      toast.success(`Saved ${data.coefficient.dsrCode}.`);
      setForm(emptyForm);
      void load(q);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (row: Coefficient) => {
    setEditingId(row.id);
    setEditForm({
      description: row.description,
      workUnit: row.workUnit,
      cementQuantityPerUnit: String(row.cementQuantityPerUnit),
    });
  };

  const saveEdit = async (id: string) => {
    const res = await fetch(`/api/admin/dsr-cement-coefficients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...editForm, cementQuantityPerUnit: Number(editForm.cementQuantityPerUnit) }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || 'Could not update.');
      return;
    }
    toast.success('Updated.');
    setEditingId(null);
    void load(q);
  };

  const toggleActive = async (row: Coefficient) => {
    const res = await fetch(`/api/admin/dsr-cement-coefficients/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !row.isActive }),
    });
    if (!res.ok) {
      toast.error('Could not change status.');
      return;
    }
    toast.success(row.isActive ? 'Turned off — it will no longer be used.' : 'Turned on.');
    void load(q);
  };

  const remove = async (row: Coefficient) => {
    if (!window.confirm(`Delete the coefficient for ${row.dsrCode}? Bills will stop deriving cement for this item.`)) return;
    const res = await fetch(`/api/admin/dsr-cement-coefficients/${row.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || 'Could not delete.');
      return;
    }
    toast.success(`Deleted ${row.dsrCode}.`);
    void load(q);
  };

  return (
    <div className="space-y-6 p-6">
      <BackButton />

      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Package className="h-7 w-7 text-emerald-600" /> Cement Coefficients
        </h1>
        <p className="text-muted-foreground mt-1">
          How much cement each DSR item uses. &quot;Derive cement from items&quot; on a bill only finds cement for
          item numbers listed here — {activeCount} of {total} are switched on.
        </p>
      </div>

      {/* Add */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a coefficient</CardTitle>
          <CardDescription>Cement quantity is in <strong>MT per item unit</strong> (e.g. 0.32 MT per cum).</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
            <div>
              <Label className="text-xs">DSR item no. *</Label>
              <Input className="mt-1" required placeholder="e.g. 5.35" value={form.dsrCode}
                onChange={(e) => setForm({ ...form, dsrCode: e.target.value })} />
            </div>
            <div className="lg:col-span-2">
              <Label className="text-xs">Description *</Label>
              <Input className="mt-1" required placeholder="e.g. Cement concrete 1:2:4" value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Work unit *</Label>
              <Input className="mt-1" required placeholder="e.g. Cum or 100 Sqm" value={form.workUnit}
                onChange={(e) => setForm({ ...form, workUnit: e.target.value })} />
              <p className="text-[10px] text-slate-400 mt-0.5">Include the block if the DSR rate is per a block, e.g. &quot;100 Sqm&quot; — cement is then divided by 100.</p>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-xs">Cement (MT per work unit) *</Label>
                <Input className="mt-1" required type="number" step="0.0001" min="0" placeholder="0.32"
                  value={form.cementQuantityPerUnit}
                  onChange={(e) => setForm({ ...form, cementQuantityPerUnit: e.target.value })} />
              </div>
              <Button type="submit" disabled={saving} className="self-end">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" /> Add</>}
              </Button>
            </div>
          </form>
          <p className="text-xs text-slate-500 mt-2">
            Adding an item number that already exists will update it.
          </p>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">All coefficients</CardTitle>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input className="pl-8" placeholder="Search item no. or description…" value={q}
              onChange={(e) => setQ(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              {q ? 'No coefficients match your search.' : 'No coefficients yet — add your first one above.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-slate-500">
                    <th className="py-2 pr-3">Item no.</th>
                    <th className="py-2 pr-3">Description</th>
                    <th className="py-2 pr-3">Unit</th>
                    <th className="py-2 pr-3 text-right">Cement (MT/unit)</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const editing = editingId === row.id;
                    return (
                      <tr key={row.id} className="border-b last:border-0 align-middle">
                        <td className="py-2 pr-3 font-mono font-medium">{row.dsrCode}</td>
                        <td className="py-2 pr-3 max-w-md">
                          {editing ? (
                            <Input value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
                          ) : (
                            <span className="text-slate-700">{row.description}</span>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          {editing ? (
                            <Input className="w-24" value={editForm.workUnit} onChange={(e) => setEditForm({ ...editForm, workUnit: e.target.value })} />
                          ) : row.workUnit}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {editing ? (
                            <Input className="w-28 text-right" type="number" step="0.0001" value={editForm.cementQuantityPerUnit}
                              onChange={(e) => setEditForm({ ...editForm, cementQuantityPerUnit: e.target.value })} />
                          ) : (
                            <span className="font-semibold">{row.cementQuantityPerUnit}</span>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          <button type="button" onClick={() => void toggleActive(row)} title="Click to turn on/off">
                            <Badge variant="outline" className={row.isActive
                              ? 'border-green-300 bg-green-50 text-green-700'
                              : 'border-slate-300 bg-slate-50 text-slate-500'}>
                              {row.isActive ? 'On' : 'Off'}
                            </Badge>
                          </button>
                        </td>
                        <td className="py-2 text-right whitespace-nowrap">
                          {editing ? (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => void saveEdit(row.id)} className="text-green-600">
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="text-slate-500">
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => startEdit(row)} title="Edit">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => void remove(row)} className="text-red-600" title="Delete">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
