'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { getClientRoleInfo } from '@/lib/role-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight, FolderOpen, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SubClassification {
  id: string;
  code: string;
  name: string;
  description?: string;
  groupId: string;
  fixed: number;
  labour: number;
  steel: number;
  cement: number;
  plantMachinery: number;
  fuel: number;
  otherMaterials: number;
  explosives: number;
  isActive: boolean;
  isDefault: boolean;
}

interface ClassificationGroup {
  id: string;
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
  subClassifications: SubClassification[];
}

export default function ClassificationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [groups, setGroups] = useState<ClassificationGroup[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Dialog states
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [subClassDialogOpen, setSubClassDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ClassificationGroup | null>(null);
  const [editingSubClass, setEditingSubClass] = useState<SubClassification | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');

  // Form states
  const [groupForm, setGroupForm] = useState({ code: '', name: '', description: '' });
  const [subClassForm, setSubClassForm] = useState({
    code: '',
    name: '',
    description: '',
    fixed: 15,
    labour: 0,
    steel: 0,
    cement: 0,
    plantMachinery: 0,
    fuel: 0,
    otherMaterials: 0,
    explosives: 0,
  });
  const [submitting, setSubmitting] = useState(false);

  // Check if user is admin
  const { isAdmin } = getClientRoleInfo(session);

  useEffect(() => {
    if (status === 'loading') return;
    
    if (!session) {
      router.push('/auth/signin');
      return;
    }
    
    if (!isAdmin) {
      toast({
        title: 'Access Denied',
        description: 'Admin access required to view classifications.',
        variant: 'destructive',
      });
      router.push('/contracts');
      return;
    }

    fetchGroups();
  }, [session, status, isAdmin, router, toast]);

  const fetchGroups = async () => {
    try {
      const response = await fetch('/api/classification-groups');
      const data = await response.json();
      setGroups(data.groups || []);
    } catch (error) {
      console.error('Error fetching groups:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch classification groups',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleGroup = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  // Group handlers
  const handleNewGroup = () => {
    setEditingGroup(null);
    setGroupForm({ code: '', name: '', description: '' });
    setGroupDialogOpen(true);
  };

  const handleEditGroup = (group: ClassificationGroup) => {
    setEditingGroup(group);
    setGroupForm({
      code: group.code,
      name: group.name,
      description: group.description || ''
    });
    setGroupDialogOpen(true);
  };

  const handleSubmitGroup = async () => {
    if (!groupForm.code || !groupForm.name) {
      toast({
        title: 'Error',
        description: 'Code and name are required',
        variant: 'destructive'
      });
      return;
    }

    setSubmitting(true);
    try {
      const url = editingGroup 
        ? `/api/classification-groups/${editingGroup.id}`
        : '/api/classification-groups';
      
      const method = editingGroup ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(groupForm)
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }

      toast({
        title: 'Success',
        description: `Classification group ${editingGroup ? 'updated' : 'created'} successfully`
      });
      setGroupDialogOpen(false);
      fetchGroups();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save classification group',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteGroup = async (id: string) => {
    try {
      const response = await fetch(`/api/classification-groups/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }

      toast({
        title: 'Success',
        description: 'Classification group deleted successfully'
      });
      fetchGroups();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete classification group',
        variant: 'destructive'
      });
    }
  };

  // Sub-classification handlers
  const handleNewSubClass = (groupId: string) => {
    setEditingSubClass(null);
    setSelectedGroupId(groupId);
    setSubClassForm({
      code: '',
      name: '',
      description: '',
      fixed: 15,
      labour: 0,
      steel: 0,
      cement: 0,
      plantMachinery: 0,
      fuel: 0,
      otherMaterials: 0,
      explosives: 0,
    });
    setSubClassDialogOpen(true);
  };

  const handleEditSubClass = (subClass: SubClassification) => {
    setEditingSubClass(subClass);
    setSelectedGroupId(subClass.groupId);
    setSubClassForm({
      code: subClass.code,
      name: subClass.name,
      description: subClass.description || '',
      fixed: subClass.fixed,
      labour: subClass.labour,
      steel: subClass.steel,
      cement: subClass.cement,
      plantMachinery: subClass.plantMachinery,
      fuel: subClass.fuel,
      otherMaterials: subClass.otherMaterials,
      explosives: subClass.explosives,
    });
    setSubClassDialogOpen(true);
  };

  const calculateRemaining = () => {
    const total = subClassForm.labour + subClassForm.steel + subClassForm.cement +
      subClassForm.plantMachinery + subClassForm.fuel + subClassForm.otherMaterials +
      subClassForm.explosives;
    return (100 - subClassForm.fixed) - total;
  };

  const handleSubmitSubClass = async () => {
    if (!subClassForm.code || !subClassForm.name) {
      toast({
        title: 'Error',
        description: 'Code and name are required',
        variant: 'destructive'
      });
      return;
    }

    if (Math.abs(calculateRemaining()) > 0.01) {
      toast({
        title: 'Error',
        description: `Component percentages must sum to ${100 - subClassForm.fixed}%`,
        variant: 'destructive'
      });
      return;
    }

    setSubmitting(true);
    try {
      const url = editingSubClass 
        ? `/api/sub-classifications/${editingSubClass.id}`
        : '/api/sub-classifications';
      
      const method = editingSubClass ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...subClassForm,
          groupId: selectedGroupId
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }

      toast({
        title: 'Success',
        description: `Sub-classification ${editingSubClass ? 'updated' : 'created'} successfully`
      });
      setSubClassDialogOpen(false);
      fetchGroups();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save sub-classification',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSubClass = async (id: string) => {
    try {
      const response = await fetch(`/api/sub-classifications/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }

      toast({
        title: 'Success',
        description: 'Sub-classification deleted successfully'
      });
      fetchGroups();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete sub-classification',
        variant: 'destructive'
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading classifications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Work Classifications</h1>
          <p className="text-gray-600 mt-1">
            Manage classification groups and their sub-classifications with component percentages
          </p>
        </div>
        <Button onClick={handleNewGroup} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Classification Group
        </Button>
      </div>

      {/* Classification Groups */}
      {groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderOpen className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Classification Groups</h3>
            <p className="text-gray-600 text-center mb-4">
              Get started by creating your first classification group.
            </p>
            <Button onClick={handleNewGroup}>
              <Plus className="h-4 w-4 mr-2" />
              Add Classification Group
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const isExpanded = expandedGroups.has(group.id);
            return (
              <Card key={group.id} className="overflow-hidden">
                <CardHeader className="p-4 bg-gradient-to-r from-blue-50 to-blue-100 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => toggleGroup(group.id)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-5 w-5" />
                        ) : (
                          <ChevronRight className="h-5 w-5" />
                        )}
                      </Button>
                      <FolderOpen className="h-5 w-5 text-blue-600" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold text-gray-900">
                            {group.code} - {group.name}
                          </h3>
                          <Badge variant="secondary" className="text-xs">
                            {group.subClassifications?.length || 0} sub-classes
                          </Badge>
                        </div>
                        {group.description && (
                          <p className="text-sm text-gray-600 mt-1">{group.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleNewSubClass(group.id)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Sub
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditGroup(group)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Classification Group</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure? This will also delete all sub-classifications under this group. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteGroup(group.id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="p-4">
                    {(!group.subClassifications || group.subClassifications.length === 0) ? (
                      <div className="text-center py-8">
                        <FileText className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-600 mb-3">No sub-classifications yet</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleNewSubClass(group.id)}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add First Sub-Classification
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {group.subClassifications.map((subClass) => (
                          <Card key={subClass.id} className="bg-white border-l-4 border-l-blue-500">
                            <CardHeader className="p-3">
                              <div className="flex items-start justify-between">
                                <div className="flex items-start gap-3 flex-1">
                                  <FileText className="h-5 w-5 text-blue-600 mt-0.5" />
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <h4 className="font-bold text-gray-900">{subClass.code}</h4>
                                      <span className="text-gray-400">•</span>
                                      <h5 className="font-medium text-gray-700">{subClass.name}</h5>
                                    </div>
                                    {subClass.description && (
                                      <p className="text-sm text-gray-600 mb-2">{subClass.description}</p>
                                    )}
                                    
                                    {/* Component Percentages */}
                                    <div className="mt-3 space-y-2">
                                      {subClass.fixed > 0 && (
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-medium text-gray-700 w-32">Fixed</span>
                                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                                            <div
                                              className="bg-gray-500 h-2 rounded-full"
                                              style={{ width: `${subClass.fixed}%` }}
                                            />
                                          </div>
                                          <span className="text-xs font-semibold text-gray-900 w-12 text-right">
                                            {subClass.fixed}%
                                          </span>
                                        </div>
                                      )}
                                      {subClass.labour > 0 && (
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-medium text-gray-700 w-32">Labour</span>
                                          <div className="flex-1 bg-blue-100 rounded-full h-2">
                                            <div
                                              className="bg-blue-500 h-2 rounded-full"
                                              style={{ width: `${subClass.labour}%` }}
                                            />
                                          </div>
                                          <span className="text-xs font-semibold text-blue-600 w-12 text-right">
                                            {subClass.labour}%
                                          </span>
                                        </div>
                                      )}
                                      {subClass.steel > 0 && (
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-medium text-gray-700 w-32">Steel</span>
                                          <div className="flex-1 bg-orange-100 rounded-full h-2">
                                            <div
                                              className="bg-orange-500 h-2 rounded-full"
                                              style={{ width: `${subClass.steel}%` }}
                                            />
                                          </div>
                                          <span className="text-xs font-semibold text-orange-600 w-12 text-right">
                                            {subClass.steel}%
                                          </span>
                                        </div>
                                      )}
                                      {subClass.cement > 0 && (
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-medium text-gray-700 w-32">Cement</span>
                                          <div className="flex-1 bg-green-100 rounded-full h-2">
                                            <div
                                              className="bg-green-500 h-2 rounded-full"
                                              style={{ width: `${subClass.cement}%` }}
                                            />
                                          </div>
                                          <span className="text-xs font-semibold text-green-600 w-12 text-right">
                                            {subClass.cement}%
                                          </span>
                                        </div>
                                      )}
                                      {subClass.plantMachinery > 0 && (
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-medium text-gray-700 w-32">Plant & Machinery</span>
                                          <div className="flex-1 bg-purple-100 rounded-full h-2">
                                            <div
                                              className="bg-purple-500 h-2 rounded-full"
                                              style={{ width: `${subClass.plantMachinery}%` }}
                                            />
                                          </div>
                                          <span className="text-xs font-semibold text-purple-600 w-12 text-right">
                                            {subClass.plantMachinery}%
                                          </span>
                                        </div>
                                      )}
                                      {subClass.fuel > 0 && (
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-medium text-gray-700 w-32">Fuel</span>
                                          <div className="flex-1 bg-red-100 rounded-full h-2">
                                            <div
                                              className="bg-red-500 h-2 rounded-full"
                                              style={{ width: `${subClass.fuel}%` }}
                                            />
                                          </div>
                                          <span className="text-xs font-semibold text-red-600 w-12 text-right">
                                            {subClass.fuel}%
                                          </span>
                                        </div>
                                      )}
                                      {subClass.otherMaterials > 0 && (
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-medium text-gray-700 w-32">Other Materials</span>
                                          <div className="flex-1 bg-yellow-100 rounded-full h-2">
                                            <div
                                              className="bg-yellow-500 h-2 rounded-full"
                                              style={{ width: `${subClass.otherMaterials}%` }}
                                            />
                                          </div>
                                          <span className="text-xs font-semibold text-yellow-600 w-12 text-right">
                                            {subClass.otherMaterials}%
                                          </span>
                                        </div>
                                      )}
                                      {subClass.explosives > 0 && (
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-medium text-gray-700 w-32">Explosives</span>
                                          <div className="flex-1 bg-pink-100 rounded-full h-2">
                                            <div
                                              className="bg-pink-500 h-2 rounded-full"
                                              style={{ width: `${subClass.explosives}%` }}
                                            />
                                          </div>
                                          <span className="text-xs font-semibold text-pink-600 w-12 text-right">
                                            {subClass.explosives}%
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEditSubClass(subClass)}
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Sub-Classification</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Are you sure you want to delete this sub-classification? This action cannot be undone.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => handleDeleteSubClass(subClass.id)}
                                          className="bg-red-600 hover:bg-red-700"
                                        >
                                          Delete
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </div>
                            </CardHeader>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Group Dialog */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingGroup ? 'Edit Classification Group' : 'Add Classification Group'}
            </DialogTitle>
            <DialogDescription>
              Create a main classification group (e.g., &quot;1 - Earthwork in Formation&quot;)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="group-code">Code</Label>
              <Input
                id="group-code"
                placeholder="e.g., 1, 2, 3"
                value={groupForm.code}
                onChange={(e) => setGroupForm({ ...groupForm, code: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="group-name">Name</Label>
              <Input
                id="group-name"
                placeholder="e.g., Earthwork in Formation"
                value={groupForm.name}
                onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="group-desc">Description (Optional)</Label>
              <Textarea
                id="group-desc"
                placeholder="Brief description..."
                value={groupForm.description}
                onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitGroup} disabled={submitting}>
              {submitting ? 'Saving...' : (editingGroup ? 'Update' : 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sub-Classification Dialog */}
      <Dialog open={subClassDialogOpen} onOpenChange={setSubClassDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSubClass ? 'Edit Sub-Classification' : 'Add Sub-Classification'}
            </DialogTitle>
            <DialogDescription>
              Define component percentages for this sub-classification. Total must equal {100 - subClassForm.fixed}% (excluding fixed {subClassForm.fixed}%).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="sub-code">Code</Label>
                <Input
                  id="sub-code"
                  placeholder="e.g., 1A, 1B"
                  value={subClassForm.code}
                  onChange={(e) => setSubClassForm({ ...subClassForm, code: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="sub-name">Name</Label>
                <Input
                  id="sub-name"
                  placeholder="e.g., Earthwork - All Items"
                  value={subClassForm.name}
                  onChange={(e) => setSubClassForm({ ...subClassForm, name: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="sub-desc">Description (Optional)</Label>
              <Textarea
                id="sub-desc"
                placeholder="Brief description..."
                value={subClassForm.description}
                onChange={(e) => setSubClassForm({ ...subClassForm, description: e.target.value })}
                rows={2}
              />
            </div>

            {/* Component Percentages */}
            <div className="border rounded-lg p-4 space-y-3">
              <h4 className="font-semibold mb-2">Component Percentages</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="fixed">Fixed (%)</Label>
                  <Input
                    id="fixed"
                    type="number"
                    step="0.1"
                    value={subClassForm.fixed}
                    onChange={(e) => setSubClassForm({ ...subClassForm, fixed: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label htmlFor="labour">Labour (%)</Label>
                  <Input
                    id="labour"
                    type="number"
                    step="0.1"
                    value={subClassForm.labour}
                    onChange={(e) => setSubClassForm({ ...subClassForm, labour: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label htmlFor="steel">Steel (%)</Label>
                  <Input
                    id="steel"
                    type="number"
                    step="0.1"
                    value={subClassForm.steel}
                    onChange={(e) => setSubClassForm({ ...subClassForm, steel: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label htmlFor="cement">Cement (%)</Label>
                  <Input
                    id="cement"
                    type="number"
                    step="0.1"
                    value={subClassForm.cement}
                    onChange={(e) => setSubClassForm({ ...subClassForm, cement: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label htmlFor="plant">Plant & Machinery (%)</Label>
                  <Input
                    id="plant"
                    type="number"
                    step="0.1"
                    value={subClassForm.plantMachinery}
                    onChange={(e) => setSubClassForm({ ...subClassForm, plantMachinery: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label htmlFor="fuel">Fuel (%)</Label>
                  <Input
                    id="fuel"
                    type="number"
                    step="0.1"
                    value={subClassForm.fuel}
                    onChange={(e) => setSubClassForm({ ...subClassForm, fuel: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label htmlFor="other">Other Materials (%)</Label>
                  <Input
                    id="other"
                    type="number"
                    step="0.1"
                    value={subClassForm.otherMaterials}
                    onChange={(e) => setSubClassForm({ ...subClassForm, otherMaterials: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label htmlFor="explosives">Explosives (%)</Label>
                  <Input
                    id="explosives"
                    type="number"
                    step="0.1"
                    value={subClassForm.explosives}
                    onChange={(e) => setSubClassForm({ ...subClassForm, explosives: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
              
              <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span>Remaining:</span>
                  <span className={Math.abs(calculateRemaining()) < 0.01 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                    {calculateRemaining().toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubClassDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitSubClass} disabled={submitting || Math.abs(calculateRemaining()) > 0.01}>
              {submitting ? 'Saving...' : (editingSubClass ? 'Update' : 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
