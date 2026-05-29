/**
 * API Keys Management Page
 * Allows users to create and manage API keys for external app integration
 */

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertCircle, Key, Plus, Trash2, Copy, Check, Eye, EyeOff, ExternalLink, Clock, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';

interface ApiKey {
  id: string;
  name: string;
  description?: string;
  scopes: string[];
  isActive: boolean;
  expiresAt?: string;
  lastUsedAt?: string;
  usageCount: number;
  rateLimit: number;
  createdAt: string;
}

const AVAILABLE_SCOPES = [
  { value: '*', label: 'Full Access', description: 'All permissions' },
  { value: 'bills:read', label: 'Read Bills', description: 'View bills and calculations' },
  { value: 'bills:create', label: 'Create Bills', description: 'Create new PVC bills' },
  { value: 'contracts:read', label: 'Read Contracts', description: 'View contracts' },
];

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showNewKeyDialog, setShowNewKeyDialog] = useState(false);
  const [newKey, setNewKey] = useState<{ key: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);
  
  // Form state
  const [keyName, setKeyName] = useState('');
  const [keyDescription, setKeyDescription] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['*']);
  const [expiresInDays, setExpiresInDays] = useState<number | ''>('');
  const [creating, setCreating] = useState(false);
  
  useEffect(() => {
    fetchApiKeys();
  }, []);
  
  const fetchApiKeys = async () => {
    try {
      const res = await fetch('/api/external/api-keys');
      const data = await res.json();
      if (data.success) {
        setApiKeys(data.data);
      } else {
        toast.error(data.error || 'Failed to fetch API keys');
      }
    } catch {
      toast.error('Failed to fetch API keys');
    } finally {
      setLoading(false);
    }
  };
  
  const handleCreateKey = async () => {
    if (!keyName.trim()) {
      toast.error('Please enter a name for the API key');
      return;
    }
    
    setCreating(true);
    try {
      const res = await fetch('/api/external/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: keyName.trim(),
          description: keyDescription.trim() || undefined,
          scopes: selectedScopes,
          expiresInDays: expiresInDays || undefined
        })
      });
      
      const data = await res.json();
      
      if (data.success) {
        setNewKey({ key: data.data.key, name: data.data.name });
        setShowCreateDialog(false);
        setShowNewKeyDialog(true);
        fetchApiKeys();
        
        // Reset form
        setKeyName('');
        setKeyDescription('');
        setSelectedScopes(['*']);
        setExpiresInDays('');
      } else {
        toast.error(data.error || 'Failed to create API key');
      }
    } catch {
      toast.error('Failed to create API key');
    } finally {
      setCreating(false);
    }
  };
  
  const handleDeleteKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to delete this API key? This cannot be undone.')) {
      return;
    }
    
    try {
      const res = await fetch(`/api/external/api-keys?id=${keyId}`, {
        method: 'DELETE'
      });
      
      const data = await res.json();
      
      if (data.success) {
        toast.success('API key deleted');
        fetchApiKeys();
      } else {
        toast.error(data.error || 'Failed to delete API key');
      }
    } catch {
      toast.error('Failed to delete API key');
    }
  };
  
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };
  
  const toggleScope = (scope: string) => {
    if (scope === '*') {
      setSelectedScopes(['*']);
    } else {
      const filtered = selectedScopes.filter(s => s !== '*');
      if (filtered.includes(scope)) {
        setSelectedScopes(filtered.filter(s => s !== scope));
      } else {
        setSelectedScopes([...filtered, scope]);
      }
    }
  };
  
  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">API Keys</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage API keys for external app integration (e.g., primerp.in)
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Create API Key
        </Button>
      </div>
      
      {/* Info Card */}
      <Card className="mb-6 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900 dark:text-blue-100">External API Integration</h3>
              <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
                API keys allow external applications like <strong>primerp.in</strong> to create PVC bills directly.
                Keep your API keys secure and never share them publicly.
              </p>
              <a 
                href="/docs/external-api" 
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline mt-2"
              >
                View API Documentation
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* API Keys List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
        </div>
      ) : apiKeys.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Key className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No API Keys
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Create an API key to allow external apps to access your account.
              </p>
              <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Create Your First API Key
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {apiKeys.map((key) => (
            <Card key={key.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {key.name}
                      </h3>
                      <Badge variant={key.isActive ? 'default' : 'secondary'}>
                        {key.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                      {key.expiresAt && new Date(key.expiresAt) < new Date() && (
                        <Badge variant="destructive">Expired</Badge>
                      )}
                    </div>
                    
                    {key.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {key.description}
                      </p>
                    )}
                    
                    <div className="flex flex-wrap gap-2 mt-3">
                      {(key.scopes as string[]).map((scope) => (
                        <Badge key={scope} variant="outline" className="text-xs">
                          {scope === '*' ? 'Full Access' : scope}
                        </Badge>
                      ))}
                    </div>
                    
                    <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Created {format(toISTDate(new Date(key.createdAt)), 'MMM d, yyyy')}
                      </span>
                      {key.lastUsedAt && (
                        <span className="flex items-center gap-1">
                          <Activity className="h-3 w-3" />
                          Last used {format(toISTDate(new Date(key.lastUsedAt)), 'MMM d, yyyy')}
                        </span>
                      )}
                      <span>
                        {key.usageCount.toLocaleString()} requests
                      </span>
                      {key.expiresAt && (
                        <span>
                          Expires {format(toISTDate(new Date(key.expiresAt)), 'MMM d, yyyy')}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteKey(key.id)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      
      {/* Create API Key Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Create a new API key for external app integration.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="e.g., primerp.in Integration"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Input
                id="description"
                value={keyDescription}
                onChange={(e) => setKeyDescription(e.target.value)}
                placeholder="e.g., Used by primerp.in to create bills"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Permissions</Label>
              <div className="grid gap-2">
                {AVAILABLE_SCOPES.map((scope) => (
                  <label
                    key={scope.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedScopes.includes(scope.value)
                        ? 'bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedScopes.includes(scope.value)}
                      onChange={() => toggleScope(scope.value)}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium text-sm">{scope.label}</div>
                      <div className="text-xs text-gray-500">{scope.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="expires">Expiration (Optional)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="expires"
                  type="number"
                  min="1"
                  max="365"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value ? parseInt(e.target.value) : '')}
                  placeholder="No expiration"
                  className="w-32"
                />
                <span className="text-sm text-gray-500">days</span>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateKey} disabled={creating}>
              {creating ? 'Creating...' : 'Create API Key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* New Key Display Dialog */}
      <Dialog open={showNewKeyDialog} onOpenChange={setShowNewKeyDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <Check className="h-5 w-5" />
              API Key Created
            </DialogTitle>
            <DialogDescription>
              Please copy your API key now. For security reasons, it won&apos;t be shown again.
            </DialogDescription>
          </DialogHeader>
          
          {newKey && (
            <div className="py-4">
              <Label>API Key for &quot;{newKey.name}&quot;</Label>
              <div className="mt-2 flex items-center gap-2">
                <code className={`flex-1 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg font-mono text-sm break-all ${
                  showKey ? '' : 'filter blur-sm'
                }`}>
                  {newKey.key}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(newKey.key)}
                >
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              
              <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>Important:</strong> Store this key securely. You won&apos;t be able to see it again after closing this dialog.
                </p>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button onClick={() => {
              setShowNewKeyDialog(false);
              setNewKey(null);
              setShowKey(false);
            }}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
