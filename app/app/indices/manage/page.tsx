
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getClientRoleInfo } from '@/lib/role-auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StatusMessage } from '@/components/ui/status-message';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { 
  Edit, 
  Trash2, 
  Save, 
  X, 
  Eye, 
  Calendar,
  TrendingUp,
  Filter,
  Download
} from 'lucide-react';
import Link from 'next/link';
import { BackButton } from '@/components/ui/back-button';
import { format } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface PriceIndex {
  id: string;
  name: string;
  baseValue: number;
  description?: string;
}

interface MonthlyIndexValue {
  id: string;
  priceIndexId: string;
  month: string;
  value: number;
  isProvisional: boolean;
  source?: string;
  createdAt: string;
  updatedAt: string;
  priceIndex: PriceIndex;
}

interface EditingValue {
  id: string;
  value: string;
  isProvisional: boolean;
}

export default function ManualIndicesManagePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [monthlyValues, setMonthlyValues] = useState<MonthlyIndexValue[]>([]);
  const [filteredValues, setFilteredValues] = useState<MonthlyIndexValue[]>([]);
  const [priceIndices, setPriceIndices] = useState<PriceIndex[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Check if user is admin
  const { isAdmin } = getClientRoleInfo(session);

  // Redirect non-admin users
  useEffect(() => {
    if (status === 'loading') return;
    
    if (!session) {
      router.push('/auth/signin');
      return;
    }
    
    if (!isAdmin) {
      router.push('/contracts');
      return;
    }
  }, [session, status, isAdmin, router]);
  
  const [editingValue, setEditingValue] = useState<EditingValue | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  // Bulk operations
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  
  // Filters
  const [selectedIndex, setSelectedIndex] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all'); // 'all', 'provisional', 'final'
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    applyFilters();
    // Clear selections when filters change
    setSelectedItems(new Set());
  }, [monthlyValues, selectedIndex, selectedMonth, selectedStatus, searchTerm]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      
      // Fetch all monthly values
      const valuesResponse = await fetch('/api/indices/monthly/all');
      if (!valuesResponse.ok) throw new Error('Failed to fetch monthly values');
      const valuesData = await valuesResponse.json();
      
      // Fetch price indices
      const indicesResponse = await fetch('/api/indices');
      if (!indicesResponse.ok) throw new Error('Failed to fetch indices');
      const indicesData = await indicesResponse.json();
      
      setMonthlyValues(valuesData);
      setPriceIndices(indicesData);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      setError(error.message || 'Failed to fetch data');
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...monthlyValues];
    
    // Filter by price index
    if (selectedIndex !== 'all') {
      filtered = filtered.filter(val => val.priceIndexId === selectedIndex);
    }
    
    // Filter by month
    if (selectedMonth !== 'all') {
      filtered = filtered.filter(val => {
        const month = format(new Date(val.month), 'yyyy-MM');
        return month === selectedMonth;
      });
    }
    
    // Filter by status
    if (selectedStatus !== 'all') {
      filtered = filtered.filter(val => {
        if (selectedStatus === 'provisional') return val.isProvisional;
        if (selectedStatus === 'final') return !val.isProvisional;
        return true;
      });
    }
    
    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(val => 
        val.priceIndex.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Sort by month (newest first)
    filtered.sort((a, b) => new Date(b.month).getTime() - new Date(a.month).getTime());
    
    setFilteredValues(filtered);
  };

  const handleEdit = (value: MonthlyIndexValue) => {
    setEditingValue({
      id: value.id,
      value: value.value.toString(),
      isProvisional: value.isProvisional
    });
  };

  const handleSaveEdit = async () => {
    if (!editingValue) return;
    
    setIsUpdating(true);
    setError('');
    
    try {
      const response = await fetch(`/api/indices/monthly/${editingValue.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          value: parseFloat(editingValue.value),
          isProvisional: editingValue.isProvisional
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update value');
      }
      
      setSuccess('Value updated successfully');
      setEditingValue(null);
      fetchData(); // Refresh data
    } catch (error: any) {
      setError(error.message || 'Failed to update value');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleToggleStatus = async (value: MonthlyIndexValue) => {
    setError('');
    
    try {
      const response = await fetch(`/api/indices/monthly/${value.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          value: value.value,
          isProvisional: !value.isProvisional
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update status');
      }
      
      setSuccess(`Status changed to ${!value.isProvisional ? 'Provisional' : 'Final'}`);
      fetchData(); // Refresh data
    } catch (error: any) {
      setError(error.message || 'Failed to update status');
    }
  };

  const handleDelete = async (id: string) => {
    setIsDeleting(id);
    setError('');
    
    try {
      const response = await fetch(`/api/indices/monthly/${id}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete value');
      }
      
      setSuccess('Value deleted successfully');
      fetchData(); // Refresh data
    } catch (error: any) {
      setError(error.message || 'Failed to delete value');
    } finally {
      setIsDeleting(null);
      setDeleteConfirmId(null);
    }
  };

  // Bulk operations
  const handleSelectAll = () => {
    if (selectedItems.size === filteredValues.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredValues.map(item => item.id)));
    }
  };

  const handleSelectItem = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  const handleBulkDelete = async () => {
    setIsBulkDeleting(true);
    setError('');
    
    try {
      const response = await fetch('/api/indices/monthly/bulk-delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedItems) })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete values');
      }
      
      setSuccess(`Successfully deleted ${selectedItems.size} index values`);
      setSelectedItems(new Set());
      fetchData(); // Refresh data
    } catch (error: any) {
      setError(error.message || 'Failed to delete values');
    } finally {
      setIsBulkDeleting(false);
      setShowBulkDeleteConfirm(false);
    }
  };

  const exportToCsv = () => {
    const headers = ['Index Name', 'Month', 'Value', 'Status', 'Category', 'Source', 'Last Updated'];
    const rows = filteredValues.map(val => [
      val.priceIndex.name,
      format(new Date(val.month), 'yyyy-MM-dd'),
      val.value.toString(),
      val.isProvisional ? 'Provisional' : 'Final',
      val.priceIndex.name.includes('Steel') ? 'Steel' :
      val.priceIndex.name.includes('RBI') ? 'RBI' :
      val.priceIndex.name.includes('MPNG') ? 'Energy' : 'Labour',
      val.source || 'Manual',
      format(toISTDate(new Date(val.updatedAt)), 'yyyy-MM-dd HH:mm')
    ]);
    
    const csvContent = [headers, ...rows]
      .map(row => row.join(','))
      .join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `manual_indices_${format(toISTDate(new Date()), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <LoadingSpinner size="lg" text="Loading manual indices..." />
      </div>
    );
  }

  const uniqueMonths = [...new Set(monthlyValues.map(val => format(new Date(val.month), 'yyyy-MM')))].sort().reverse();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <BackButton href="/indices" label="Back to Price Indices" variant="outline" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Eye className="h-8 w-8 text-blue-600" />
            Manage Manual Indices
          </h1>
          <p className="text-gray-600 mt-2">
            View, edit, and delete manually entered price index values
          </p>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <StatusMessage type="error" title="Error" message={error} />
      )}
      
      {success && (
        <StatusMessage type="success" title="Success" message={success} />
      )}

      {/* Filters */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters & Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
            <div className="space-y-2">
              <Label>Price Index</Label>
              <Select value={selectedIndex} onValueChange={setSelectedIndex}>
                <SelectTrigger>
                  <SelectValue placeholder="All Indices" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Indices</SelectItem>
                  {priceIndices.map(index => (
                    <SelectItem key={index.id} value={index.id}>
                      {index.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Month</Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger>
                  <SelectValue placeholder="All Months" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Months</SelectItem>
                  {uniqueMonths.map(month => (
                    <SelectItem key={month} value={month}>
                      {format(new Date(month + '-01'), 'MMM-yy')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="provisional">Provisional</SelectItem>
                  <SelectItem value="final">Final</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Search</Label>
              <Input
                placeholder="Search index name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <Button onClick={exportToCsv} variant="outline" className="w-full">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
          
          <div className="flex justify-between items-center pt-4 border-t">
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                Showing {filteredValues.length} of {monthlyValues.length} entries
              </span>
              {selectedItems.size > 0 && (
                <span className="text-sm font-medium text-blue-600">
                  {selectedItems.size} selected
                </span>
              )}
            </div>
            <div className="flex items-center space-x-2">
              {filteredValues.length > 0 && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSelectAll}
                  >
                    {selectedItems.size === filteredValues.length ? 'Deselect All' : 'Select All'}
                  </Button>
                  {selectedItems.size > 0 && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setShowBulkDeleteConfirm(true)}
                      disabled={isBulkDeleting}
                    >
                      {isBulkDeleting ? (
                        <LoadingSpinner size="sm" text="Deleting..." />
                      ) : (
                        <>
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete Selected ({selectedItems.size})
                        </>
                      )}
                    </Button>
                  )}
                </>
              )}
              <Button asChild size="sm">
                <Link href="/indices/manual-import">
                  Add New Manual Entries
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Manual Index Values List */}
      <div className="space-y-4">
        {filteredValues.length === 0 ? (
          <Card className="border-0 shadow-lg">
            <CardContent className="text-center py-8">
              <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-600 mb-2">No Manual Indices Found</h3>
              <p className="text-gray-500 mb-4">
                {monthlyValues.length === 0 
                  ? "No manual indices have been added yet."
                  : "No indices match your current filters."
                }
              </p>
              <Button asChild>
                <Link href="/indices/manual-import">
                  Add Manual Indices
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          filteredValues.map((value) => (
            <Card key={value.id} className={`border-0 shadow-lg hover:shadow-xl transition-shadow ${
              selectedItems.has(value.id) ? 'ring-2 ring-blue-500 bg-blue-50' : ''
            }`}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      checked={selectedItems.has(value.id)}
                      onCheckedChange={() => handleSelectItem(value.id)}
                      className="mt-1"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{value.priceIndex.name}</CardTitle>
                        <Badge 
                          variant={value.isProvisional ? "outline" : "default"}
                          className={value.isProvisional ? "bg-yellow-100 text-yellow-800 border-yellow-300" : "bg-green-100 text-green-800 border-green-300"}
                        >
                          {value.isProvisional ? 'Provisional' : 'Final'}
                        </Badge>
                      </div>
                      <CardDescription className="flex items-center gap-4 mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {format(new Date(value.month), 'MMM-yy')}
                        </span>
                        {value.source && (
                          <span className="text-xs text-gray-500">
                            Source: {value.source}
                          </span>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(value)}
                      disabled={editingValue?.id === value.id}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDeleteConfirmId(value.id)}
                      disabled={isDeleting === value.id}
                      className="text-red-600 hover:text-red-700"
                    >
                      {isDeleting === value.id ? (
                        <LoadingSpinner size="sm" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {editingValue?.id === value.id ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Index Value</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={editingValue.value}
                        onChange={(e) => setEditingValue({
                          ...editingValue,
                          value: e.target.value
                        })}
                        placeholder="Enter new value"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="status-toggle">Mark as Final</Label>
                        <Switch
                          id="status-toggle"
                          checked={!editingValue.isProvisional}
                          onCheckedChange={(checked) => setEditingValue({
                            ...editingValue,
                            isProvisional: !checked
                          })}
                        />
                      </div>
                      <p className="text-xs text-gray-500">
                        {editingValue.isProvisional ? 'Currently marked as Provisional' : 'Currently marked as Final'}
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        onClick={handleSaveEdit}
                        disabled={isUpdating || !editingValue.value}
                      >
                        {isUpdating ? (
                          <LoadingSpinner size="sm" text="Saving..." />
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-1" />
                            Save
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingValue(null)}
                        disabled={isUpdating}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Current Value</p>
                        <p className="text-2xl font-bold text-blue-600">
                          {value.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-600">Index Category</p>
                        <p className="text-lg font-medium text-gray-800">
                          {value.priceIndex.name.includes('Steel') ? 'Steel' :
                           value.priceIndex.name.includes('RBI') ? 'RBI' :
                           value.priceIndex.name.includes('MPNG') ? 'Energy' :
                           'Labour'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-600">Last Updated</p>
                        <p className="text-sm text-gray-500">
                          {format(toISTDate(new Date(value.updatedAt)), 'dd MMM yyyy, HH:mm')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-600">Quick Status Toggle:</p>
                        <Badge 
                          variant={value.isProvisional ? "outline" : "default"}
                          className={value.isProvisional ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800"}
                        >
                          {value.isProvisional ? 'Provisional' : 'Final'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`status-${value.id}`} className="text-sm cursor-pointer">
                          Mark as {value.isProvisional ? 'Final' : 'Provisional'}
                        </Label>
                        <Switch
                          id={`status-${value.id}`}
                          checked={!value.isProvisional}
                          onCheckedChange={() => handleToggleStatus(value)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Multiple Manual Index Values</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedItems.size} manually entered index values? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-48 overflow-y-auto my-4">
            <div className="text-sm text-gray-600 mb-2">Selected items:</div>
            <ul className="space-y-1 text-sm">
              {Array.from(selectedItems).map(id => {
                const item = filteredValues.find(v => v.id === id);
                return item ? (
                  <li key={id} className="flex justify-between items-center py-1 px-2 bg-gray-50 rounded">
                    <span>{item.priceIndex.name}</span>
                    <span className="text-gray-500">{format(new Date(item.month), 'MMM-yy')}</span>
                  </li>
                ) : null;
              })}
            </ul>
          </div>
          <div className="flex justify-end space-x-2 mt-4">
            <Button variant="outline" onClick={() => setShowBulkDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
            >
              {isBulkDeleting ? (
                <LoadingSpinner size="sm" text="Deleting..." />
              ) : (
                `Delete ${selectedItems.size} Items`
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Single Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Manual Index Value</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this manually entered index value? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              disabled={!!isDeleting}
            >
              {isDeleting ? <LoadingSpinner size="sm" text="Deleting..." /> : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
