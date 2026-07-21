'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Key, Copy, Trash2, Plus, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';
import toast from 'react-hot-toast';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  description: string | null;
  scopes: string[];
  isActive: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  usageCount: number;
  rateLimit: number;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
  };
}

interface User {
  id: string;
  name: string | null;
  email: string;
}

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewKeyDialog, setShowNewKeyDialog] = useState(false);
  const [newApiKey, setNewApiKey] = useState<any>(null);
  const [showPlainKey, setShowPlainKey] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    userId: '',
    rateLimit: 100,
    expiresInDays: 0 // 0 = never expires
  });

  // Fetch API keys and users
  useEffect(() => {
    fetchApiKeys();
    fetchUsers();
  }, []);

  const fetchApiKeys = async () => {
    try {
      const response = await fetch('/api/admin/api-keys');
      if (!response.ok) throw new Error('Failed to fetch API keys');
      const data = await response.json();
      setApiKeys(data);
    } catch (error) {
      toast.error('Failed to load API keys');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/users');
      if (!response.ok) throw new Error('Failed to fetch users');
      const data = await response.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const expiresAt = formData.expiresInDays > 0
        ? new Date(Date.now() + formData.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const response = await fetch('/api/admin/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
          userId: formData.userId,
          rateLimit: formData.rateLimit,
          expiresAt,
          scopes: [] // Allow all by default
        })
      });

      if (!response.ok) throw new Error('Failed to create API key');
      const data = await response.json();

      setNewApiKey(data);
      setShowNewKeyDialog(true);
      fetchApiKeys();

      // Reset form
      setFormData({
        name: '',
        description: '',
        userId: '',
        rateLimit: 100,
        expiresInDays: 0
      });

      toast.success('API key created successfully');
    } catch (error) {
      toast.error('Failed to create API key');
      console.error(error);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/admin/api-keys/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentStatus })
      });

      if (!response.ok) throw new Error('Failed to update API key');
      fetchApiKeys();
      toast.success(`API key ${!currentStatus ? 'activated' : 'deactivated'}`);
    } catch (error) {
      toast.error('Failed to update API key');
      console.error(error);
    }
  };

  const handleDeleteKey = async (id: string) => {
    if (!confirm('Are you sure you want to delete this API key? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/api-keys/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete API key');
      fetchApiKeys();
      toast.success('API key deleted successfully');
    } catch (error) {
      toast.error('Failed to delete API key');
      console.error(error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">API Keys Management</h1>
          <p className="text-muted-foreground mt-2">
            Create and manage API keys for external application access
          </p>
        </div>
      </div>

      {/* Create New API Key Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Create New API Key
          </CardTitle>
          <CardDescription>
            Generate a new API key for external applications to access your data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateKey} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Key Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Mobile App API Key"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="userId">User *</Label>
                <Select
                  value={formData.userId}
                  onValueChange={(value) => setFormData({ ...formData, userId: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map(user => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name || user.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rateLimit">Rate Limit (requests/min)</Label>
                <Input
                  id="rateLimit"
                  type="number"
                  min="1"
                  max="1000"
                  value={formData.rateLimit}
                  onChange={(e) => setFormData({ ...formData, rateLimit: parseInt(e.target.value) })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="expiresIn">Expires In (days, 0 = never)</Label>
                <Input
                  id="expiresIn"
                  type="number"
                  min="0"
                  max="3650"
                  value={formData.expiresInDays}
                  onChange={(e) => setFormData({ ...formData, expiresInDays: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="What will this API key be used for?"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <Button type="submit" className="w-full md:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Generate API Key
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* API Keys List */}
      <Card>
        <CardHeader>
          <CardTitle>Existing API Keys</CardTitle>
          <CardDescription>
            Manage your active API keys and monitor their usage
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Loading API keys...</p>
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="text-center py-12">
              <Key className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No API Keys Yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first API key to enable external application access
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiKeys.map(key => (
                    <TableRow key={key.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{key.name}</p>
                          {key.description && (
                            <p className="text-sm text-muted-foreground truncate max-w-xs">
                              {key.description}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p className="font-medium">{key.user.name || 'No name'}</p>
                          <p className="text-muted-foreground">{key.user.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                            {key.key}
                          </code>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2">
                          <Badge variant={key.isActive ? 'default' : 'secondary'}>
                            {key.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                          {key.lastUsedAt && (
                            <span className="text-xs text-muted-foreground">
                              Last used: {format(toISTDate(new Date(key.lastUsedAt)), 'MMM d, HH:mm')}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p className="font-medium">{key.usageCount.toLocaleString()} calls</p>
                          <p className="text-muted-foreground">{key.rateLimit}/min limit</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {format(toISTDate(new Date(key.createdAt)), 'MMM d, yyyy')}
                        </span>
                      </TableCell>
                      <TableCell>
                        {key.expiresAt ? (
                          <span className="text-sm">
                            {format(toISTDate(new Date(key.expiresAt)), 'MMM d, yyyy')}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">Never</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleActive(key.id, key.isActive)}
                          >
                            {key.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteKey(key.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New API Key Dialog */}
      <Dialog open={showNewKeyDialog} onOpenChange={setShowNewKeyDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              API Key Created Successfully
            </DialogTitle>
            <DialogDescription>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-900">Important: Save this key now!</p>
                    <p className="text-sm text-amber-700 mt-1">
                      This is the only time you'll see the full API key. Store it securely.
                    </p>
                  </div>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>

          {newApiKey && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Key Name</Label>
                <p className="text-sm font-medium">{newApiKey.name}</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>API Key</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPlainKey(!showPlainKey)}
                  >
                    {showPlainKey ? (
                      <><EyeOff className="h-4 w-4 mr-2" /> Hide</>
                    ) : (
                      <><Eye className="h-4 w-4 mr-2" /> Show</>
                    )}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm bg-gray-100 p-3 rounded border overflow-x-auto">
                    {showPlainKey ? newApiKey.plainKey : '••••••••••••••••••••••••••••••••'}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(newApiKey.plainKey)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <h4 className="font-semibold text-emerald-900 mb-2">How to use this API key:</h4>
                <ol className="text-sm text-emerald-800 space-y-1 list-decimal list-inside">
                  <li>Store the API key securely in your application</li>
                  <li>Include it in the Authorization header: <code className="bg-emerald-100 px-1 rounded">Bearer YOUR_API_KEY</code></li>
                  <li>Or use the X-API-Key header: <code className="bg-emerald-100 px-1 rounded">X-API-Key: YOUR_API_KEY</code></li>
                  <li>Make requests to endpoints starting with /api/v1/</li>
                </ol>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setShowNewKeyDialog(false)}>
              I've Saved the Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
