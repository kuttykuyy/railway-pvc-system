'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { getClientRoleInfo } from '@/lib/role-auth-client';
import { useToast } from '@/hooks/use-toast';

interface SubClassification {
  id: string; code: string; name: string; description?: string; groupId: string;
  fixed: number; labour: number; steel: number; cement: number;
  plantMachinery: number; fuel: number; otherMaterials: number; explosives: number;
  isActive: boolean; isDefault: boolean;
}

interface ClassificationGroup {
  id: string; code: string; name: string; description?: string;
  isActive: boolean; subClassifications: SubClassification[];
}

const COMPONENTS: { key: keyof SubClassification; label: string; color: string }[] = [
  { key: 'fixed',          label: 'Fixed',         color: 'bg-gray-400' },
  { key: 'labour',         label: 'Labour',        color: 'bg-emerald-500' },
  { key: 'steel',          label: 'Steel',         color: 'bg-orange-500' },
  { key: 'cement',         label: 'Cement',        color: 'bg-green-500' },
  { key: 'plantMachinery', label: 'Plant',         color: 'bg-emerald-500' },
  { key: 'fuel',           label: 'Fuel',          color: 'bg-red-500' },
  { key: 'otherMaterials', label: 'Materials',     color: 'bg-yellow-500' },
  { key: 'explosives',     label: 'Explosives',    color: 'bg-pink-500' },
];

const DEFAULT_FORM = { code: '', name: '', description: '', fixed: 15, labour: 0, steel: 0, cement: 0, plantMachinery: 0, fuel: 0, otherMaterials: 0, explosives: 0 };

export default function ClassificationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const { isAdmin } = getClientRoleInfo(session);

  const [groups, setGroups] = useState<ClassificationGroup[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [groupDialog, setGroupDialog] = useState(false);
  const [subDialog, setSubDialog] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ClassificationGroup | null>(null);
  const [editingSubClass, setEditingSubClass] = useState<SubClassification | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupForm, setGroupForm] = useState({ code: '', name: '', description: '' });
  const [subForm, setSubForm] = useState(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) { router.push('/auth/signin'); return; }
    if (!isAdmin) { router.push('/contracts'); return; }
    fetch('/api/classification-groups')
      .then(r => r.json())
      .then(d => setGroups(d.groups || []))
      .catch(() => toast({ title: 'Error', description: 'Failed to load classifications', variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [session, status, isAdmin]);

  const refresh = () => fetch('/api/classification-groups').then(r => r.json()).then(d => setGroups(d.groups || []));

  const toggle = (id: string) => {
    const s = new Set(expanded);
    s.has(id) ? s.delete(id) : s.add(id);
    setExpanded(s);
  };

  const remaining = () => {
    const total = subForm.labour + subForm.steel + subForm.cement + subForm.plantMachinery + subForm.fuel + subForm.otherMaterials + subForm.explosives;
    return (100 - subForm.fixed) - total;
  };

  const saveGroup = async () => {
    if (!groupForm.code || !groupForm.name) return toast({ title: 'Code and name required', variant: 'destructive' });
    setSubmitting(true);
    const url = editingGroup ? `/api/classification-groups/${editingGroup.id}` : '/api/classification-groups';
    const res = await fetch(url, { method: editingGroup ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(groupForm) });
    setSubmitting(false);
    if (!res.ok) { const d = await res.json(); return toast({ title: d.error, variant: 'destructive' }); }
    setGroupDialog(false);
    refresh();
  };

  const saveSubClass = async () => {
    if (!subForm.code || !subForm.name) return toast({ title: 'Code and name required', variant: 'destructive' });
    if (Math.abs(remaining()) > 0.01) return toast({ title: `Components must sum to ${100 - subForm.fixed}%`, variant: 'destructive' });
    setSubmitting(true);
    const url = editingSubClass ? `/api/sub-classifications/${editingSubClass.id}` : '/api/sub-classifications';
    const res = await fetch(url, { method: editingSubClass ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...subForm, groupId: selectedGroupId }) });
    setSubmitting(false);
    if (!res.ok) { const d = await res.json(); return toast({ title: d.error, variant: 'destructive' }); }
    setSubDialog(false);
    refresh();
  };

  const deleteGroup = async (id: string) => {
    const res = await fetch(`/api/classification-groups/${id}`, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json(); return toast({ title: d.error, variant: 'destructive' }); }
    refresh();
  };

  const deleteSub = async (id: string) => {
    const res = await fetch(`/api/sub-classifications/${id}`, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json(); return toast({ title: d.error, variant: 'destructive' }); }
    refresh();
  };

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" /></div>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Work Classifications</h1>
          <p className="text-sm text-gray-500 mt-0.5">Classification groups and component percentages for PVC calculations</p>
        </div>
        <button
          onClick={() => { setEditingGroup(null); setGroupForm({ code: '', name: '', description: '' }); setGroupDialog(true); }}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" /> Add Group
        </button>
      </div>

      {/* Groups */}
      {groups.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-200 rounded-lg">
          <p className="font-medium text-gray-600">No classification groups yet</p>
          <button onClick={() => { setEditingGroup(null); setGroupForm({ code: '', name: '', description: '' }); setGroupDialog(true); }}
            className="mt-3 inline-flex items-center gap-1 text-sm text-emerald-600 hover:underline">
            <Plus className="h-4 w-4" /> Add first group
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map(group => {
            const isOpen = expanded.has(group.id);
            return (
              <div key={group.id} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                {/* Group row */}
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <button onClick={() => toggle(group.id)} className="text-gray-500 hover:text-gray-800">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-gray-900">{group.code}</span>
                    <span className="text-gray-400 mx-2">—</span>
                    <span className="font-medium text-gray-700">{group.name}</span>
                    <span className="ml-2 text-xs text-gray-400">{group.subClassifications?.length || 0} sub-classes</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setEditingSubClass(null); setSelectedGroupId(group.id); setSubForm(DEFAULT_FORM); setSubDialog(true); }}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-gray-200 rounded text-gray-600 hover:bg-white">
                      <Plus className="h-3.5 w-3.5" /> Add Sub
                    </button>
                    <button onClick={() => { setEditingGroup(group); setGroupForm({ code: group.code, name: group.name, description: group.description || '' }); setGroupDialog(true); }}
                      className="p-1.5 rounded text-gray-400 hover:text-emerald-600 hover:bg-emerald-50">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Group</AlertDialogTitle>
                          <AlertDialogDescription>This will delete "{group.code} — {group.name}" and all its sub-classifications. Cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteGroup(group.id)} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                {/* Sub-classifications */}
                {isOpen && (
                  <div>
                    {!group.subClassifications?.length ? (
                      <div className="px-4 py-6 text-center text-sm text-gray-400">
                        No sub-classifications yet.{' '}
                        <button onClick={() => { setEditingSubClass(null); setSelectedGroupId(group.id); setSubForm(DEFAULT_FORM); setSubDialog(true); }}
                          className="text-emerald-600 hover:underline">Add one</button>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100">
                          <tr>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Code</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Name</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Components</th>
                            <th className="px-4 py-2"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {group.subClassifications.map(sub => (
                            <tr key={sub.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">{sub.code}</td>
                              <td className="px-4 py-3 text-gray-700">
                                <div>{sub.name}</div>
                                {sub.description && <div className="text-xs text-gray-400 mt-0.5">{sub.description}</div>}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-1">
                                  {COMPONENTS.filter(c => (sub[c.key] as number) > 0).map(c => (
                                    <span key={c.key} className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded text-white font-medium ${c.color}`}>
                                      {c.label} {sub[c.key]}%
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1 justify-end">
                                  <button onClick={() => {
                                    setEditingSubClass(sub); setSelectedGroupId(sub.groupId);
                                    setSubForm({ code: sub.code, name: sub.name, description: sub.description || '', fixed: sub.fixed, labour: sub.labour, steel: sub.steel, cement: sub.cement, plantMachinery: sub.plantMachinery, fuel: sub.fuel, otherMaterials: sub.otherMaterials, explosives: sub.explosives });
                                    setSubDialog(true);
                                  }} className="p-1.5 rounded text-gray-400 hover:text-emerald-600 hover:bg-emerald-50">
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <button className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Sub-Classification</AlertDialogTitle>
                                        <AlertDialogDescription>Delete "{sub.code} — {sub.name}"? Cannot be undone.</AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => deleteSub(sub.id)} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Group Dialog */}
      <Dialog open={groupDialog} onOpenChange={setGroupDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingGroup ? 'Edit Group' : 'Add Classification Group'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Code</Label>
                <Input placeholder="e.g., 1, 2A" value={groupForm.code} onChange={e => setGroupForm({ ...groupForm, code: e.target.value })} />
              </div>
              <div>
                <Label>Name</Label>
                <Input placeholder="e.g., Earthwork in Formation" value={groupForm.name} onChange={e => setGroupForm({ ...groupForm, name: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Description <span className="text-gray-400">(optional)</span></Label>
              <Textarea rows={2} value={groupForm.description} onChange={e => setGroupForm({ ...groupForm, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialog(false)}>Cancel</Button>
            <Button onClick={saveGroup} disabled={submitting}>{submitting ? 'Saving...' : editingGroup ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sub-Classification Dialog */}
      <Dialog open={subDialog} onOpenChange={setSubDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSubClass ? 'Edit Sub-Classification' : 'Add Sub-Classification'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Code</Label>
                <Input placeholder="e.g., 1A, 1B" value={subForm.code} onChange={e => setSubForm({ ...subForm, code: e.target.value })} />
              </div>
              <div>
                <Label>Name</Label>
                <Input placeholder="e.g., Earthwork - All Items" value={subForm.name} onChange={e => setSubForm({ ...subForm, name: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Description <span className="text-gray-400">(optional)</span></Label>
              <Textarea rows={2} value={subForm.description} onChange={e => setSubForm({ ...subForm, description: e.target.value })} />
            </div>

            {/* Component percentages */}
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">Component Percentages</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { key: 'fixed' as const, label: 'Fixed (%)' },
                  { key: 'labour' as const, label: 'Labour (%)' },
                  { key: 'steel' as const, label: 'Steel (%)' },
                  { key: 'cement' as const, label: 'Cement (%)' },
                  { key: 'plantMachinery' as const, label: 'Plant (%)' },
                  { key: 'fuel' as const, label: 'Fuel (%)' },
                  { key: 'otherMaterials' as const, label: 'Materials (%)' },
                  { key: 'explosives' as const, label: 'Explosives (%)' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <Label className="text-xs">{label}</Label>
                    <Input type="number" step="0.1" min="0" max="100"
                      value={subForm[key]}
                      onChange={e => setSubForm({ ...subForm, [key]: parseFloat(e.target.value) || 0 })}
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
              </div>
              <div className={`mt-3 flex items-center justify-between text-sm px-2 py-1.5 rounded ${Math.abs(remaining()) < 0.01 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                <span>Remaining (must be 0)</span>
                <span className="font-bold">{remaining().toFixed(1)}%</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubDialog(false)}>Cancel</Button>
            <Button onClick={saveSubClass} disabled={submitting || Math.abs(remaining()) > 0.01}>
              {submitting ? 'Saving...' : editingSubClass ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
