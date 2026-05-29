
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users, 
  Settings, 
  Plus, 
  Search, 
  Eye, 
  Edit, 
  Trash2, 
  FileText, 
  Building2,
  Calendar,
  Shield,
  UserCheck,
  UserX,
  Lock,
  Unlock,
  Layout
} from 'lucide-react';
import { format } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';
import { toast } from 'react-hot-toast';
import { AVAILABLE_PAGES, getPagesByCategory } from '@/lib/page-permissions';

interface User {
  id: string;
  name: string;
  email: string;
  companyName?: string;
  createdAt: string;
  _count: {
    contractAccess: number;
    billAccess: number;
    pageAccess: number;
    contracts: number;
  };
}

interface Contract {
  id: string;
  agreementNo: string;
  contractorName: string;
  workDescription: string;
}

interface Bill {
  id: string;
  billNo: string;
  billAmount: number;
  dateOfMeasurement: string;
  contract: {
    id: string;
    agreementNo: string;
    contractorName: string;
  };
}

interface PageAccess {
  id: string;
  pagePath: string;
  pageName: string;
  pageCategory?: string;
  canAccess: boolean;
  notes?: string;
  expiresAt?: string;
  createdAt: string;
  isActive: boolean;
}

interface UserPermissions {
  id: string;
  name: string;
  email: string;
  contractAccess: Array<{
    id: string;
    canView: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canCreateBills: boolean;
    notes?: string;
    expiresAt?: string;
    createdAt: string;
    contract: Contract;
  }>;
  billAccess: Array<{
    id: string;
    canView: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canDownloadPdf: boolean;
    notes?: string;
    expiresAt?: string;
    createdAt: string;
    bill: Bill;
  }>;
  pageAccess: PageAccess[];
}

export default function UserPermissionsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showGrantDialog, setShowGrantDialog] = useState(false);
  const [grantType, setGrantType] = useState<'contract' | 'bill' | 'page'>('contract');

  // Grant form state
  const [grantForm, setGrantForm] = useState({
    userId: '',
    contractId: '',
    billId: '',
    pagePath: '',
    pageName: '',
    pageCategory: '',
    permissions: {
      canView: true,
      canEdit: false,
      canDelete: false,
      canCreateBills: true,
      canDownloadPdf: true,
      canAccess: true
    },
    notes: '',
    expiresAt: ''
  });

  useEffect(() => {
    fetchUsers();
    fetchContracts();
    fetchBills();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/user-permissions');
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const fetchContracts = async () => {
    try {
      const response = await fetch('/api/contracts');
      if (response.ok) {
        const data = await response.json();
        setContracts(data);
      }
    } catch (error) {
      console.error('Error fetching contracts:', error);
    }
  };

  const fetchBills = async () => {
    try {
      const response = await fetch('/api/bills');
      if (response.ok) {
        const data = await response.json();
        setBills(data);
      }
    } catch (error) {
      console.error('Error fetching bills:', error);
    }
  };

  const fetchUserPermissions = async (userId: string) => {
    try {
      const response = await fetch(`/api/admin/user-permissions?userId=${userId}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedUser(data);
      }
    } catch (error) {
      console.error('Error fetching user permissions:', error);
      toast.error('Failed to fetch user permissions');
    }
  };

  const grantAccess = async () => {
    try {
      const response = await fetch('/api/admin/user-permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...grantForm,
          type: grantType
        })
      });

      if (response.ok) {
        toast.success('Access granted successfully');
        setShowGrantDialog(false);
        fetchUsers();
        if (selectedUser) {
          fetchUserPermissions(selectedUser.id);
        }
        // Reset form
        setGrantForm({
          userId: '',
          contractId: '',
          billId: '',
          pagePath: '',
          pageName: '',
          pageCategory: '',
          permissions: {
            canView: true,
            canEdit: false,
            canDelete: false,
            canCreateBills: true,
            canDownloadPdf: true,
            canAccess: true
          },
          notes: '',
          expiresAt: ''
        });
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to grant access');
      }
    } catch (error) {
      console.error('Error granting access:', error);
      toast.error('Failed to grant access');
    }
  };

  const revokeAccess = async (accessId: string, type: 'contract' | 'bill' | 'page') => {
    if (!confirm('Are you sure you want to revoke this access?')) return;

    try {
      const response = await fetch(`/api/admin/user-permissions?accessId=${accessId}&type=${type}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast.success('Access revoked successfully');
        fetchUsers();
        if (selectedUser) {
          fetchUserPermissions(selectedUser.id);
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to revoke access');
      }
    } catch (error) {
      console.error('Error revoking access:', error);
      toast.error('Failed to revoke access');
    }
  };

  const filteredUsers = users.filter(user =>
    user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.companyName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Shield className="h-8 w-8 text-purple-600" />
            User Permissions
          </h1>
          <p className="text-gray-600 mt-2">
            Manage user access to contracts and bills
          </p>
        </div>

        <div className="flex gap-3">
          <Dialog open={showGrantDialog} onOpenChange={setShowGrantDialog}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700">
                <Plus className="h-4 w-4 mr-2" />
                Grant Access
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>Grant User Access</DialogTitle>
                <DialogDescription>
                  Grant specific contract or bill access to a user
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 overflow-y-auto pr-2">
                {/* Access Type */}
                <div>
                  <Label>Access Type</Label>
                  <Select value={grantType} onValueChange={(value: 'contract' | 'bill' | 'page') => setGrantType(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contract">Contract Access</SelectItem>
                      <SelectItem value="bill">Bill Access</SelectItem>
                      <SelectItem value="page">Page Access</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* User Selection */}
                <div>
                  <Label>User</Label>
                  <Select value={grantForm.userId} onValueChange={(value) => setGrantForm({ ...grantForm, userId: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select user..." />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map(user => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name || user.email} {user.companyName && `(${user.companyName})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Contract/Bill/Page Selection */}
                {grantType === 'contract' ? (
                  <div>
                    <Label>Contract</Label>
                    <Select value={grantForm.contractId} onValueChange={(value) => setGrantForm({ ...grantForm, contractId: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select contract..." />
                      </SelectTrigger>
                      <SelectContent>
                        {contracts.map(contract => (
                          <SelectItem key={contract.id} value={contract.id}>
                            {contract.agreementNo} - {contract.contractorName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : grantType === 'bill' ? (
                  <div>
                    <Label>Bill</Label>
                    <Select value={grantForm.billId} onValueChange={(value) => setGrantForm({ ...grantForm, billId: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select bill..." />
                      </SelectTrigger>
                      <SelectContent>
                        {bills.map(bill => (
                          <SelectItem key={bill.id} value={bill.id}>
                            {bill.billNo} - {bill.contract.agreementNo} (₹{bill.billAmount.toLocaleString('en-IN')})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div>
                    <Label>Page/Route</Label>
                    <Select 
                      value={grantForm.pagePath} 
                      onValueChange={(value) => {
                        const page = AVAILABLE_PAGES.find(p => p.path === value);
                        setGrantForm({ 
                          ...grantForm, 
                          pagePath: value,
                          pageName: page?.name || value,
                          pageCategory: page?.category || 'Other'
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select page..." />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(getPagesByCategory()).map(([category, pages]) => (
                          <div key={category}>
                            <div className="px-2 py-1.5 text-sm font-semibold text-gray-500">{category}</div>
                            {pages.filter(p => !p.adminOnly).map(page => (
                              <SelectItem key={page.path} value={page.path}>
                                {page.name} ({page.path})
                              </SelectItem>
                            ))}
                          </div>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 mt-1">
                      Select a page to control user access
                    </p>
                  </div>
                )}

                {/* Permissions */}
                {grantType === 'page' ? (
                  <div>
                    <Label className="text-base font-medium">Permission</Label>
                    <div className="space-y-3 mt-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="canAccess"
                          checked={grantForm.permissions.canAccess}
                          onCheckedChange={(checked) => 
                            setGrantForm({
                              ...grantForm,
                              permissions: { ...grantForm.permissions, canAccess: checked as boolean }
                            })
                          }
                        />
                        <Label htmlFor="canAccess">Can Access This Page</Label>
                      </div>
                      <p className="text-sm text-gray-500">
                        {grantForm.permissions.canAccess 
                          ? 'User will be able to access this page' 
                          : 'User will be denied access to this page'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <Label className="text-base font-medium">Permissions</Label>
                    <div className="space-y-3 mt-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="canView"
                          checked={grantForm.permissions.canView}
                          onCheckedChange={(checked) => 
                            setGrantForm({
                              ...grantForm,
                              permissions: { ...grantForm.permissions, canView: checked as boolean }
                            })
                          }
                        />
                        <Label htmlFor="canView">Can View</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="canEdit"
                          checked={grantForm.permissions.canEdit}
                          onCheckedChange={(checked) => 
                            setGrantForm({
                              ...grantForm,
                              permissions: { ...grantForm.permissions, canEdit: checked as boolean }
                            })
                          }
                        />
                        <Label htmlFor="canEdit">Can Edit</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="canDelete"
                          checked={grantForm.permissions.canDelete}
                          onCheckedChange={(checked) => 
                            setGrantForm({
                              ...grantForm,
                              permissions: { ...grantForm.permissions, canDelete: checked as boolean }
                            })
                          }
                        />
                        <Label htmlFor="canDelete">Can Delete</Label>
                      </div>
                      {grantType === 'contract' && (
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="canCreateBills"
                            checked={grantForm.permissions.canCreateBills}
                            onCheckedChange={(checked) => 
                              setGrantForm({
                                ...grantForm,
                                permissions: { ...grantForm.permissions, canCreateBills: checked as boolean }
                              })
                            }
                          />
                          <Label htmlFor="canCreateBills">Can Create Bills</Label>
                        </div>
                      )}
                      {grantType === 'bill' && (
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="canDownloadPdf"
                            checked={grantForm.permissions.canDownloadPdf}
                            onCheckedChange={(checked) => 
                              setGrantForm({
                                ...grantForm,
                                permissions: { ...grantForm.permissions, canDownloadPdf: checked as boolean }
                              })
                            }
                          />
                          <Label htmlFor="canDownloadPdf">Can Download PDF</Label>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <Label>Notes (Optional)</Label>
                  <Textarea
                    placeholder="Add notes about why access is being granted..."
                    value={grantForm.notes}
                    onChange={(e) => setGrantForm({ ...grantForm, notes: e.target.value })}
                  />
                </div>

                {/* Expiry */}
                <div>
                  <Label>Expires On (Optional)</Label>
                  <Input
                    type="datetime-local"
                    value={grantForm.expiresAt}
                    onChange={(e) => setGrantForm({ ...grantForm, expiresAt: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t mt-4">
                <Button variant="outline" onClick={() => setShowGrantDialog(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={grantAccess} 
                  disabled={
                    !grantForm.userId || 
                    (grantType === 'contract' && !grantForm.contractId) ||
                    (grantType === 'bill' && !grantForm.billId) ||
                    (grantType === 'page' && !grantForm.pagePath)
                  }
                >
                  Grant Access
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Users List */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Users
              </CardTitle>
              <CardDescription>Click on a user to view their permissions</CardDescription>
              
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-96 overflow-y-auto">
                {filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    className={`p-4 border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors ${
                      selectedUser?.id === user.id ? 'bg-purple-50 border-purple-200' : ''
                    }`}
                    onClick={() => fetchUserPermissions(user.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 truncate">
                          {user.name || 'Unnamed User'}
                        </h3>
                        <p className="text-sm text-gray-600 truncate">{user.email}</p>
                        {user.companyName && (
                          <p className="text-xs text-gray-500 truncate">{user.companyName}</p>
                        )}
                        <div className="flex gap-2 mt-2 flex-wrap">
                          <Badge variant="secondary" className="text-xs">
                            {user._count.contractAccess} contracts
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {user._count.billAccess} bills
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {user._count.pageAccess} pages
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* User Permissions Detail */}
        <div className="lg:col-span-2">
          {selectedUser ? (
            <div className="space-y-6">
              {/* User Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserCheck className="h-5 w-5" />
                    {selectedUser.name || 'Unnamed User'}
                  </CardTitle>
                  <CardDescription>{selectedUser.email}</CardDescription>
                </CardHeader>
              </Card>

              {/* Contract Access */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Contract Access ({selectedUser.contractAccess.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedUser.contractAccess.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No contract access granted</p>
                  ) : (
                    <div className="space-y-4">
                      {selectedUser.contractAccess.map((access) => (
                        <div key={access.id} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900">{access.contract.agreementNo}</h4>
                              <p className="text-sm text-gray-600">{access.contract.contractorName}</p>
                              <p className="text-xs text-gray-500 mt-1">{access.contract.workDescription}</p>
                              
                              <div className="flex gap-2 mt-2">
                                {access.canView && <Badge variant="secondary">View</Badge>}
                                {access.canEdit && <Badge variant="secondary">Edit</Badge>}
                                {access.canDelete && <Badge variant="destructive">Delete</Badge>}
                                {access.canCreateBills && <Badge variant="secondary">Create Bills</Badge>}
                              </div>

                              {access.notes && (
                                <p className="text-sm text-gray-600 mt-2">
                                  <span className="font-medium">Notes:</span> {access.notes}
                                </p>
                              )}

                              <p className="text-xs text-gray-500 mt-2">
                                Granted on {format(toISTDate(new Date(access.createdAt)), 'dd MMM yyyy, HH:mm')}
                                {access.expiresAt && (
                                  <span className="text-orange-600 ml-2">
                                    • Expires: {format(toISTDate(new Date(access.expiresAt)), 'dd MMM yyyy, HH:mm')}
                                  </span>
                                )}
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => revokeAccess(access.id, 'contract')}
                              className="text-red-600 hover:text-red-700"
                            >
                              <UserX className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Bill Access */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Bill Access ({selectedUser.billAccess.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedUser.billAccess.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No bill access granted</p>
                  ) : (
                    <div className="space-y-4">
                      {selectedUser.billAccess.map((access) => (
                        <div key={access.id} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900">{access.bill.billNo}</h4>
                              <p className="text-sm text-gray-600">{access.bill.contract.agreementNo} - {access.bill.contract.contractorName}</p>
                              <p className="text-xs text-gray-500 mt-1">
                                Amount: ₹{access.bill.billAmount.toLocaleString('en-IN')} • 
                                Date: {format(new Date(access.bill.dateOfMeasurement), 'dd MMM yyyy')}
                              </p>
                              
                              <div className="flex gap-2 mt-2">
                                {access.canView && <Badge variant="secondary">View</Badge>}
                                {access.canEdit && <Badge variant="secondary">Edit</Badge>}
                                {access.canDelete && <Badge variant="destructive">Delete</Badge>}
                                {access.canDownloadPdf && <Badge variant="secondary">Download PDF</Badge>}
                              </div>

                              {access.notes && (
                                <p className="text-sm text-gray-600 mt-2">
                                  <span className="font-medium">Notes:</span> {access.notes}
                                </p>
                              )}

                              <p className="text-xs text-gray-500 mt-2">
                                Granted on {format(toISTDate(new Date(access.createdAt)), 'dd MMM yyyy, HH:mm')}
                                {access.expiresAt && (
                                  <span className="text-orange-600 ml-2">
                                    • Expires: {format(toISTDate(new Date(access.expiresAt)), 'dd MMM yyyy, HH:mm')}
                                  </span>
                                )}
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => revokeAccess(access.id, 'bill')}
                              className="text-red-600 hover:text-red-700"
                            >
                              <UserX className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Page Access */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Layout className="h-5 w-5" />
                    Page Access ({selectedUser.pageAccess.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedUser.pageAccess.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No page access restrictions set</p>
                  ) : (
                    <div className="space-y-4">
                      {Object.entries(
                        selectedUser.pageAccess.reduce((acc, access) => {
                          const category = access.pageCategory || 'Other';
                          if (!acc[category]) acc[category] = [];
                          acc[category].push(access);
                          return acc;
                        }, {} as Record<string, PageAccess[]>)
                      ).map(([category, accesses]) => (
                        <div key={category} className="border border-gray-200 rounded-lg p-4">
                          <h4 className="font-medium text-gray-900 mb-3">{category}</h4>
                          <div className="space-y-2">
                            {accesses.map((access) => (
                              <div key={access.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    {access.canAccess ? (
                                      <Unlock className="h-4 w-4 text-green-600" />
                                    ) : (
                                      <Lock className="h-4 w-4 text-red-600" />
                                    )}
                                    <span className="font-medium text-gray-900">{access.pageName}</span>
                                    <Badge variant={access.canAccess ? "secondary" : "destructive"} className="text-xs">
                                      {access.canAccess ? 'Allowed' : 'Denied'}
                                    </Badge>
                                    {!access.isActive && (
                                      <Badge variant="outline" className="text-xs">
                                        Inactive
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-500 mt-1">{access.pagePath}</p>
                                  
                                  {access.notes && (
                                    <p className="text-sm text-gray-600 mt-2">
                                      <span className="font-medium">Notes:</span> {access.notes}
                                    </p>
                                  )}

                                  <p className="text-xs text-gray-500 mt-2">
                                    Set on {format(toISTDate(new Date(access.createdAt)), 'dd MMM yyyy, HH:mm')}
                                    {access.expiresAt && (
                                      <span className="text-orange-600 ml-2">
                                        • Expires: {format(toISTDate(new Date(access.expiresAt)), 'dd MMM yyyy, HH:mm')}
                                      </span>
                                    )}
                                  </p>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => revokeAccess(access.id, 'page')}
                                  className="text-red-600 hover:text-red-700 ml-3"
                                >
                                  <UserX className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Shield className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Select a User</h3>
                <p className="text-gray-600 text-center">
                  Choose a user from the list to view and manage their permissions.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
