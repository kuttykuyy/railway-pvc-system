
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { getClientRoleInfo } from '@/lib/role-auth-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Plus, Edit2, Trash2, Settings, RefreshCw, Search, Filter, BarChart3, CheckCircle2, XCircle, ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface ComponentPercentages {
  fixed: number;
  labour: number;
  steel: number;
  cement: number;
  plantMachinery: number;
  fuel: number;
  otherMaterials: number;
  explosives: number;
}

interface SubClassification {
  id: string;
  code: string;
  name: string;
  description?: string;
  components: ComponentPercentages;
  isActive: boolean;
  isDefault: boolean;
}

interface MainClassification {
  id: string;
  code: string;
  name: string;
  description?: string;
  subClassifications: SubClassification[];
  isActive: boolean;
}

interface SubClassFormData extends ComponentPercentages {
  code: string;
  name: string;
  description: string;
  isActive: boolean;
  isDefault: boolean;
}

const defaultSubClassFormData: SubClassFormData = {
  code: '',
  name: '',
  description: '',
  fixed: 15,
  labour: 20,
  steel: 0,
  cement: 0,
  plantMachinery: 20,
  fuel: 15,
  otherMaterials: 20,
  explosives: 10,
  isActive: true,
  isDefault: false
};

export default function ClassificationsNewPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mainClassifications, setMainClassifications] = useState<MainClassification[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMain, setExpandedMain] = useState<Set<string>>(new Set());
  
  // Dialog states
  const [mainDialogOpen, setMainDialogOpen] = useState(false);
  const [subDialogOpen, setSubDialogOpen] = useState(false);
  const [editingMain, setEditingMain] = useState<MainClassification | null>(null);
  const [editingSub, setEditingSub] = useState<{ main: MainClassification; sub: SubClassification } | null>(null);
  const [selectedMainForNewSub, setSelectedMainForNewSub] = useState<MainClassification | null>(null);
  
  // Form data
  const [mainFormData, setMainFormData] = useState({ code: '', name: '', description: '', isActive: true });
  const [subFormData, setSubFormData] = useState<SubClassFormData>(defaultSubClassFormData);
  
  const [submitting, setSubmitting] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const { toast } = useToast();

  const { isAdmin } = getClientRoleInfo(session);

  // Stats
  const stats = useMemo(() => {
    const totalMain = mainClassifications.length;
    const activeMain = mainClassifications.filter(m => m.isActive).length;
    const totalSub = mainClassifications.reduce((sum, m) => sum + m.subClassifications.length, 0);
    const activeSub = mainClassifications.reduce((sum, m) => 
      sum + m.subClassifications.filter(s => s.isActive).length, 0);
    const defaults = mainClassifications.reduce((sum, m) => 
      sum + m.subClassifications.filter(s => s.isDefault).length, 0);
    
    return { totalMain, activeMain, totalSub, activeSub, defaults };
  }, [mainClassifications]);

  // Filtered main classifications
  const filteredMainClassifications = useMemo(() => {
    return mainClassifications.filter(main => {
      const matchesSearch = 
        main.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        main.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (main.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
        main.subClassifications.some(sub => 
          sub.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
          sub.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
      
      const matchesStatus = 
        filterStatus === 'all' ||
        (filterStatus === 'active' && main.isActive) ||
        (filterStatus === 'inactive' && !main.isActive);
      
      return matchesSearch && matchesStatus;
    });
  }, [mainClassifications, searchQuery, filterStatus]);

  // Redirect non-admin users
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
  }, [session, status, isAdmin, router, toast]);

  useEffect(() => {
    fetchClassifications();
  }, []);

  const fetchClassifications = async () => {
    try {
      const response = await fetch('/api/classifications-new');
      const data = await response.json();
      setMainClassifications(data.mainClassifications || []);
    } catch (error) {
      console.error('Error fetching classifications:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch classifications',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSeedClassifications = async () => {
    setSeeding(true);
    try {
      const response = await fetch('/api/classifications-new/seed', {
        method: 'POST'
      });
      const data = await response.json();
      
      if (response.ok) {
        toast({
          title: 'Success',
          description: data.message
        });
        fetchClassifications();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Error seeding classifications:', error);
      toast({
        title: 'Error',
        description: 'Failed to seed classifications',
        variant: 'destructive'
      });
    } finally {
      setSeeding(false);
    }
  };

  const toggleExpanded = (mainId: string) => {
    const newExpanded = new Set(expandedMain);
    if (newExpanded.has(mainId)) {
      newExpanded.delete(mainId);
    } else {
      newExpanded.add(mainId);
    }
    setExpandedMain(newExpanded);
  };

  const expandAll = () => {
    setExpandedMain(new Set(mainClassifications.map(m => m.id)));
  };

  const collapseAll = () => {
    setExpandedMain(new Set());
  };

  const calculateRemainingPercentage = (components: Partial<ComponentPercentages>) => {
    const totalUsed = (components.labour || 0) + (components.steel || 0) + (components.cement || 0) + 
      (components.plantMachinery || 0) + (components.fuel || 0) + (components.otherMaterials || 0) + 
      (components.explosives || 0);
    return (100 - (components.fixed || 15)) - totalUsed;
  };

  const handleNewSubClassification = (main: MainClassification) => {
    setSelectedMainForNewSub(main);
    setEditingSub(null);
    setSubFormData({ 
      ...defaultSubClassFormData, 
      code: `${main.code}${String.fromCharCode(65 + main.subClassifications.length)}` // Auto-suggest code like 1A, 1B, etc.
    });
    setSubDialogOpen(true);
  };

  const handleEditSubClassification = (main: MainClassification, sub: SubClassification) => {
    setSelectedMainForNewSub(main);
    setEditingSub({ main, sub });
    setSubFormData({
      code: sub.code,
      name: sub.name,
      description: sub.description || '',
      fixed: sub.components.fixed,
      labour: sub.components.labour,
      steel: sub.components.steel,
      cement: sub.components.cement,
      plantMachinery: sub.components.plantMachinery,
      fuel: sub.components.fuel,
      otherMaterials: sub.components.otherMaterials,
      explosives: sub.components.explosives,
      isActive: sub.isActive,
      isDefault: sub.isDefault
    });
    setSubDialogOpen(true);
  };

  const handleSubmitSubClassification = async () => {
    if (!selectedMainForNewSub) return;

    // Validate form
    if (!subFormData.code || !subFormData.name) {
      toast({
        title: 'Error',
        description: 'Code and name are required',
        variant: 'destructive'
      });
      return;
    }

    // Validate percentage sum
    const totalPercentage = subFormData.labour + subFormData.steel + subFormData.cement + 
      subFormData.plantMachinery + subFormData.fuel + subFormData.otherMaterials + subFormData.explosives;
    
    const expectedTotal = 100 - subFormData.fixed;
    if (Math.abs(totalPercentage - expectedTotal) > 0.01) {
      toast({
        title: 'Error',
        description: `Component percentages must sum to ${expectedTotal}% (excluding fixed ${subFormData.fixed}%). Current total: ${totalPercentage}%`,
        variant: 'destructive'
      });
      return;
    }

    setSubmitting(true);
    try {
      const url = editingSub 
        ? `/api/classifications-new/sub/${editingSub.sub.id}`
        : `/api/classifications-new/${selectedMainForNewSub.id}/sub`;
      
      const method = editingSub ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(subFormData)
      });

      const data = await response.json();
      
      if (response.ok) {
        toast({
          title: 'Success',
          description: `Sub-classification ${editingSub ? 'updated' : 'created'} successfully`
        });
        setSubDialogOpen(false);
        setEditingSub(null);
        setSelectedMainForNewSub(null);
        setSubFormData(defaultSubClassFormData);
        fetchClassifications();
        // Expand the main classification to show the new/updated sub
        setExpandedMain(prev => new Set([...prev, selectedMainForNewSub.id]));
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Error saving sub-classification:', error);
      toast({
        title: 'Error',
        description: (error as any)?.message || 'Failed to save sub-classification',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSubClassification = async (mainId: string, subId: string) => {
    try {
      const response = await fetch(`/api/classifications-new/sub/${subId}`, {
        method: 'DELETE'
      });

      const data = await response.json();
      
      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Sub-classification deleted successfully'
        });
        fetchClassifications();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Error deleting sub-classification:', error);
      toast({
        title: 'Error',
        description: (error as any)?.message || 'Failed to delete sub-classification',
        variant: 'destructive'
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading classifications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Work Classifications
          </h1>
          <p className="text-gray-600 mt-1">
            Manage component percentages organized by main categories and sub-classifications
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            onClick={handleSeedClassifications}
            disabled={seeding}
            variant="outline"
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${seeding ? 'animate-spin' : ''}`} />
            {seeding ? 'Seeding...' : 'Seed Defaults'}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {mainClassifications.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-emerald-900">Main Categories</p>
                  <p className="text-3xl font-bold text-emerald-600 mt-1">{stats.totalMain}</p>
                </div>
                <div className="w-12 h-12 bg-emerald-200 rounded-full flex items-center justify-center">
                  <Folder className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-emerald-900">Sub-Classifications</p>
                  <p className="text-3xl font-bold text-emerald-600 mt-1">{stats.totalSub}</p>
                </div>
                <div className="w-12 h-12 bg-emerald-200 rounded-full flex items-center justify-center">
                  <BarChart3 className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-900">Active (Main)</p>
                  <p className="text-3xl font-bold text-green-600 mt-1">{stats.activeMain}</p>
                </div>
                <div className="w-12 h-12 bg-green-200 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-emerald-900">Active (Sub)</p>
                  <p className="text-3xl font-bold text-emerald-600 mt-1">{stats.activeSub}</p>
                </div>
                <div className="w-12 h-12 bg-emerald-200 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-center">
                <div>
                  <p className="text-sm font-medium text-amber-900">Default Templates</p>
                  <p className="text-3xl font-bold text-amber-600 mt-1">{stats.defaults}</p>
                </div>
                <div className="w-12 h-12 bg-amber-200 rounded-full flex items-center justify-center">
                  <Settings className="h-6 w-6 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search, Filter, and Expand/Collapse */}
      {mainClassifications.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Search */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search by code, name, or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Filter */}
              <div className="sm:w-48">
                <Select value={filterStatus} onValueChange={(value: 'all' | 'active' | 'inactive') => setFilterStatus(value)}>
                  <SelectTrigger className="w-full">
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4" />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="active">Active Only</SelectItem>
                    <SelectItem value="inactive">Inactive Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Expand/Collapse All */}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={expandAll}>
                  Expand All
                </Button>
                <Button variant="outline" size="sm" onClick={collapseAll}>
                  Collapse All
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Classifications List */}
      <div className="space-y-4">
        {mainClassifications.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Settings className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Classifications Found</h3>
              <p className="text-gray-600 text-center mb-4">
                Get started by seeding default classifications.
              </p>
              <Button onClick={handleSeedClassifications} disabled={seeding}>
                <RefreshCw className={`h-4 w-4 mr-2 ${seeding ? 'animate-spin' : ''}`} />
                Seed Defaults
              </Button>
            </CardContent>
          </Card>
        ) : filteredMainClassifications.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Search className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Results Found</h3>
              <p className="text-gray-600 text-center mb-4">
                No classifications match your search criteria. Try adjusting your filters.
              </p>
              <Button variant="outline" onClick={() => { setSearchQuery(''); setFilterStatus('all'); }}>
                Clear Filters
              </Button>
            </CardContent>
          </Card>
        ) : (
          filteredMainClassifications.map((main) => (
            <Card key={main.id} className={`hover:shadow-lg transition-shadow duration-200 ${!main.isActive ? 'opacity-60' : ''}`}>
              <CardHeader className="pb-3 cursor-pointer" onClick={() => toggleExpanded(main.id)}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Expand/Collapse Icon */}
                    <div className="flex-shrink-0 mt-1">
                      {expandedMain.has(main.id) ? (
                        <ChevronDown className="h-5 w-5 text-gray-500" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-gray-500" />
                      )}
                    </div>

                    {/* Category Icon */}
                    <div className="flex-shrink-0 mt-0.5">
                      {expandedMain.has(main.id) ? (
                        <FolderOpen className="h-6 w-6 text-emerald-600" />
                      ) : (
                        <Folder className="h-6 w-6 text-emerald-500" />
                      )}
                    </div>

                    {/* Main Classification Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-lg font-bold text-gray-900">
                          {main.code}
                        </h3>
                        <span className="text-gray-400">•</span>
                        <h4 className="text-lg text-gray-700 font-medium">
                          {main.name}
                        </h4>
                        {!main.isActive && (
                          <Badge variant="secondary" className="text-xs">Inactive</Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {main.subClassifications.length} sub-classes
                        </Badge>
                      </div>
                      {main.description && (
                        <p className="text-sm text-gray-600 mt-1">{main.description}</p>
                      )}
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => handleNewSubClassification(main)}
                      className="h-8 px-3"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Sub
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              {/* Collapsible Sub-Classifications */}
              {expandedMain.has(main.id) && (
                <CardContent className="pt-0">
                  <div className="pl-11 space-y-3">
                    {main.subClassifications.length === 0 ? (
                      <div className="text-center py-6 border border-dashed border-gray-300 rounded-lg bg-gray-50">
                        <p className="text-sm text-gray-500 mb-3">
                          No sub-classifications yet. Create one to get started.
                        </p>
                        <Button size="sm" variant="outline" onClick={() => handleNewSubClassification(main)}>
                          <Plus className="h-4 w-4 mr-1" />
                          Add First Sub-Classification
                        </Button>
                      </div>
                    ) : (
                      main.subClassifications.map((sub) => (
                        <Card key={sub.id} className={`border-l-4 ${sub.isDefault ? 'border-l-emerald-500' : 'border-l-gray-300'} ${!sub.isActive ? 'opacity-60' : ''}`}>
                          <CardHeader className="pb-2">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <h5 className="text-base font-bold text-gray-900">
                                    {sub.code}
                                  </h5>
                                  <span className="text-gray-400">•</span>
                                  <h6 className="text-base text-gray-700 font-medium">
                                    {sub.name}
                                  </h6>
                                  {sub.isDefault && (
                                    <Badge variant="default" className="text-xs">Default</Badge>
                                  )}
                                  {!sub.isActive && (
                                    <Badge variant="secondary" className="text-xs">Inactive</Badge>
                                  )}
                                </div>
                                {sub.description && (
                                  <p className="text-sm text-gray-600 mt-1">{sub.description}</p>
                                )}
                              </div>
                              
                              <div className="flex gap-2 flex-shrink-0">
                                <Button size="sm" variant="outline" onClick={() => handleEditSubClassification(main, sub)} className="h-8 w-8 p-0">
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                {!sub.isDefault && (
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                                        <Trash2 className="h-4 w-4 text-red-600" />
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
                                          onClick={() => handleDeleteSubClassification(main.id, sub.id)}
                                          className="bg-red-600 hover:bg-red-700"
                                        >
                                          Delete
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                )}
                              </div>
                            </div>
                          </CardHeader>
                          
                          <CardContent className="pt-0">
                            {/* Component Percentages */}
                            <div className="space-y-2">
                              {Object.entries(sub.components).filter(([_, value]) => value > 0).map(([key, value]) => (
                                <div key={key}>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-medium text-gray-700 capitalize">
                                      {key === 'plantMachinery' ? 'Plant & Machinery' : 
                                       key === 'otherMaterials' ? 'Other Materials' : 
                                       key === 'fuelPower' ? 'Fuel & Power' : key}
                                    </span>
                                    <span className="text-xs font-semibold text-gray-900">{value}%</span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                                    <div 
                                      className={`h-1.5 rounded-full transition-all duration-300 ${
                                        key === 'fixed' ? 'bg-gray-500' :
                                        key === 'labour' ? 'bg-emerald-500' :
                                        key === 'steel' ? 'bg-orange-500' :
                                        key === 'cement' ? 'bg-green-500' :
                                        key === 'plantMachinery' ? 'bg-emerald-500' :
                                        key === 'fuel' ? 'bg-red-500' :
                                        key === 'otherMaterials' ? 'bg-yellow-500' :
                                        key === 'explosives' ? 'bg-pink-500' : 'bg-gray-400'
                                      }`}
                                      style={{ width: `${value}%` }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          ))
        )}
      </div>

      {/* Sub-Classification Dialog */}
      <Dialog open={subDialogOpen} onOpenChange={setSubDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSub ? 'Edit Sub-Classification' : `Add Sub-Classification to ${selectedMainForNewSub?.name}`}
            </DialogTitle>
            <DialogDescription>
              Configure the component percentages for this sub-classification.
              Total percentages must equal {100 - subFormData.fixed}% (excluding fixed {subFormData.fixed}%).
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="sub-code">Sub-Classification Code</Label>
                <Input
                  id="sub-code"
                  placeholder="e.g., 1A, 1B"
                  value={subFormData.code}
                  onChange={(e) => setSubFormData({ ...subFormData, code: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="sub-name">Sub-Classification Name</Label>
                <Input
                  id="sub-name"
                  placeholder="e.g., All Items, Steel Supply"
                  value={subFormData.name}
                  onChange={(e) => setSubFormData({ ...subFormData, name: e.target.value })}
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="sub-description">Description (Optional)</Label>
              <Textarea
                id="sub-description"
                placeholder="Brief description..."
                value={subFormData.description}
                onChange={(e) => setSubFormData({ ...subFormData, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="border rounded-lg p-4">
              <h4 className="font-semibold mb-4">Component Percentages</h4>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {Object.entries({
                  fixed: 'Fixed',
                  labour: 'Labour',
                  steel: 'Steel',
                  cement: 'Cement',
                  plantMachinery: 'Plant Machinery & Spares',
                  fuel: 'Fuel & Lubricants',
                  otherMaterials: 'Other Materials',
                  explosives: 'Explosives'
                }).map(([key, label]) => (
                  <div key={key}>
                    <Label htmlFor={`sub-${key}`}>{label} (%)</Label>
                    <Input
                      id={`sub-${key}`}
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={subFormData[key as keyof ComponentPercentages]}
                      onChange={(e) => setSubFormData({ ...subFormData, [key]: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                ))}
              </div>
              
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <div className="text-sm">
                  <div className="flex justify-between">
                    <span>Variable Components Total:</span>
                    <span className={calculateRemainingPercentage(subFormData) === 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                      {100 - subFormData.fixed - calculateRemainingPercentage(subFormData)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Remaining:</span>
                    <span className={calculateRemainingPercentage(subFormData) === 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                      {calculateRemainingPercentage(subFormData)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sub-isActive"
                  checked={subFormData.isActive}
                  onCheckedChange={(checked) => setSubFormData({ ...subFormData, isActive: checked as boolean })}
                />
                <Label htmlFor="sub-isActive">Active</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sub-isDefault"
                  checked={subFormData.isDefault}
                  onCheckedChange={(checked) => setSubFormData({ ...subFormData, isDefault: checked as boolean })}
                />
                <Label htmlFor="sub-isDefault">Set as Default</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSubDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitSubClassification} disabled={submitting || calculateRemainingPercentage(subFormData) !== 0}>
              {submitting ? 'Saving...' : (editingSub ? 'Update' : 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
