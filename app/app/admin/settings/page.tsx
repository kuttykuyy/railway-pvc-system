
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Settings, 
  Save, 
  RotateCcw,
  DollarSign,
  CreditCard,
  Users,
  AlertTriangle,
  CheckCircle,
  Wrench,
  MessageCircle,
  MessageSquare,
  Info
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getClientRoleInfo } from '@/lib/role-auth';
import { BillAmountCalculator } from '@/components/bill-amount-calculator';
import { Calculator as CalcIcon } from 'lucide-react';

interface AdminSetting {
  id: string;
  key: string;
  value: string;
  description?: string;
  dataType: string;
  createdAt: string;
  updatedAt: string;
  updatedByUserEmail?: string;
}

export default function AdminSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [settings, setSettings] = useState<AdminSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

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
      toast({
        title: 'Access Denied',
        description: 'Admin access required to manage settings.',
        variant: 'destructive',
      });
      router.push('/contracts');
      return;
    }
  }, [session, status, isAdmin, router, toast]);

  useEffect(() => {
    if (isAdmin) {
      fetchSettings();
    }
  }, [isAdmin]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/settings');
      
      if (!response.ok) {
        throw new Error('Failed to fetch settings');
      }
      
      const settingsData = await response.json();
      setSettings(settingsData);
      setHasChanges(false);
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch settings',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSettingChange = (key: string, value: string | boolean) => {
    setSettings(prev => {
      const existingSetting = prev.find(s => s.key === key);
      
      if (existingSetting) {
        // Update existing setting
        return prev.map(setting => 
          setting.key === key 
            ? { ...setting, value: String(value) }
            : setting
        );
      } else {
        // Create new setting
        const newSetting: AdminSetting = {
          id: `temp_${Date.now()}`, // Temporary ID
          key,
          value: String(value),
          description: getDescriptionForKey(key),
          dataType: 'string',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return [...prev, newSetting];
      }
    });
    setHasChanges(true);
  };
  
  const getDescriptionForKey = (key: string): string => {
    const descriptions: Record<string, string> = {
      'razorpay_enabled': 'Enable Razorpay payment gateway for Class Analyzer',
      'razorpay_key_id': 'Razorpay API Key ID',
      'razorpay_key_secret': 'Razorpay API Key Secret',
      'payment_method': 'Payment method for credit top-ups (razorpay or manual)',
    };
    return descriptions[key] || '';
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          settings: settings.map(s => ({
            key: s.key,
            value: s.value,
            description: s.description,
            dataType: s.dataType
          }))
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save settings');
      }

      toast({
        title: 'Success',
        description: 'Settings saved successfully',
      });

      setHasChanges(false);
      // Refresh settings to get updated timestamps
      fetchSettings();
      
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    fetchSettings();
    setHasChanges(false);
  };

  const getSettingValue = (setting: AdminSetting) => {
    switch (setting.dataType) {
      case 'boolean':
        return setting.value.toLowerCase() === 'true';
      case 'number':
        return parseFloat(setting.value) || 0;
      default:
        return setting.value;
    }
  };

  if (status === 'loading' || !isAdmin) {
    return <div>Loading...</div>;
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
          <p className="text-muted-foreground">Configure system-wide billing and payment settings</p>
        </div>
        
        <div className="flex gap-3">
          {hasChanges && (
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          )}
          <Button 
            onClick={handleSave} 
            disabled={!hasChanges || saving}
            className="min-w-[100px]"
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {hasChanges && (
        <Alert className="mb-6 border-yellow-200 bg-yellow-50">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            You have unsaved changes. Don't forget to save your settings.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6">
        {/* Billing Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Billing Configuration
            </CardTitle>
            <CardDescription>
              Configure bill processing costs and payment options
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Payment Processing Toggle */}
            {settings
              .filter(s => s.key === 'PAYMENT_PROCESSING_ENABLED')
              .map(setting => (
                <div key={setting.key} className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Payment Processing</Label>
                    <div className="text-sm text-muted-foreground">
                      {setting.description}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={getSettingValue(setting) as boolean}
                      onCheckedChange={(checked) => handleSettingChange(setting.key, checked)}
                    />
                    <Badge variant={getSettingValue(setting) ? 'default' : 'secondary'}>
                      {getSettingValue(setting) ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                </div>
              ))}

            {/* Payment Method Selection */}
            {settings
              .filter(s => s.key === 'payment_method')
              .map(setting => (
                <div key={setting.key} className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Payment Method</Label>
                    <div className="text-sm text-muted-foreground">
                      {setting.description}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={getSettingValue(setting) === 'razorpay'}
                      onCheckedChange={(checked) => handleSettingChange(setting.key, checked ? 'razorpay' : 'manual')}
                    />
                    <Badge variant={getSettingValue(setting) === 'razorpay' ? 'default' : 'secondary'}>
                      {getSettingValue(setting) === 'razorpay' ? 'Razorpay' : 'Manual'}
                    </Badge>
                  </div>
                </div>
              ))}

            {/* Class Analyzer Payment Toggle */}
            {settings
              .filter(s => s.key === 'pvc_comparison_payment_enabled')
              .map(setting => (
                <div key={setting.key} className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Class Analyzer Payment</Label>
                    <div className="text-sm text-muted-foreground">
                      {setting.description || 'Enable payment for Class Analyzer (250 INR per session for contractor users)'}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={getSettingValue(setting) as boolean}
                      onCheckedChange={(checked) => handleSettingChange(setting.key, checked)}
                    />
                    <Badge variant={getSettingValue(setting) ? 'default' : 'secondary'}>
                      {getSettingValue(setting) ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                </div>
              ))}

            {/* Bill Processing Cost */}
            {settings
              .filter(s => s.key === 'BILL_PROCESSING_COST')
              .map(setting => (
                <div key={setting.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={setting.key} className="text-base">
                      Bill Processing Cost
                    </Label>
                    <BillAmountCalculator
                      onInsertTotal={(total) => {
                        handleSettingChange(setting.key, total.toString());
                      }}
                      label={<><CalcIcon className="h-4 w-4" /></>}
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm">₹</span>
                    <Input
                      id={setting.key}
                      type="number"
                      min="0"
                      step="1"
                      value={getSettingValue(setting) as number}
                      onChange={(e) => handleSettingChange(setting.key, e.target.value)}
                      className="max-w-[200px]"
                    />
                    <span className="text-sm text-muted-foreground">credits per bill</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {setting.description}
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>

        {/* Razorpay Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Razorpay Configuration
            </CardTitle>
            <CardDescription>
              Configure Razorpay payment gateway for Class Analyzer payments
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Razorpay Enabled Toggle */}
            <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
              <div className="space-y-0.5">
                <Label className="text-base font-semibold">Enable Razorpay</Label>
                <div className="text-sm text-muted-foreground">
                  Enable Razorpay payment gateway for Class Analyzer
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  checked={settings.find(s => s.key === 'razorpay_enabled')?.value === 'true'}
                  onCheckedChange={(checked) => handleSettingChange('razorpay_enabled', checked ? 'true' : 'false')}
                />
                <Badge variant={settings.find(s => s.key === 'razorpay_enabled')?.value === 'true' ? 'default' : 'secondary'}>
                  {settings.find(s => s.key === 'razorpay_enabled')?.value === 'true' ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
            </div>

            {/* Razorpay Key ID */}
            <div className="space-y-2">
              <Label htmlFor="razorpay_key_id" className="text-base">
                Razorpay Key ID
              </Label>
              <Input
                id="razorpay_key_id"
                type="text"
                placeholder="rzp_live_..."
                value={settings.find(s => s.key === 'razorpay_key_id')?.value || ''}
                onChange={(e) => handleSettingChange('razorpay_key_id', e.target.value)}
                className="font-mono"
              />
              <div className="text-sm text-muted-foreground">
                Enter your Razorpay Key ID (starts with rzp_test_ or rzp_live_)
              </div>
            </div>

            {/* Razorpay Key Secret */}
            <div className="space-y-2">
              <Label htmlFor="razorpay_key_secret" className="text-base">
                Razorpay Key Secret
              </Label>
              <Input
                id="razorpay_key_secret"
                type="password"
                placeholder="Enter Razorpay Key Secret"
                value={settings.find(s => s.key === 'razorpay_key_secret')?.value || ''}
                onChange={(e) => handleSettingChange('razorpay_key_secret', e.target.value)}
                className="font-mono"
              />
              <div className="text-sm text-muted-foreground">
                Enter your Razorpay Key Secret (will be encrypted and stored securely)
              </div>
            </div>

            {/* Configuration Status */}
            <Alert>
              <AlertDescription>
                {settings.find(s => s.key === 'razorpay_enabled')?.value === 'true' &&
                 settings.find(s => s.key === 'razorpay_key_id')?.value &&
                 settings.find(s => s.key === 'razorpay_key_secret')?.value ? (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span>Razorpay is fully configured and ready to use</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-amber-600">
                    <AlertTriangle className="h-4 w-4" />
                    <span>Razorpay configuration incomplete. Please enable and configure all fields.</span>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* MyDreams WhatsApp API Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              MyDreams WhatsApp API Configuration
            </CardTitle>
            <CardDescription>
              Configure MyDreams WhatsApp Business API for sending bill PDFs
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert>
              <AlertDescription className="space-y-2">
                <p>Configure your MyDreams Technology WhatsApp Business API credentials to enable sending bill PDFs directly to customers via WhatsApp.</p>
                <p className="text-sm">API Endpoint: https://wa.mydreamstechnology.in/api/sendtemplate.php</p>
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mydreams_license_number" className="text-base">
                  License Number *
                </Label>
                <Input
                  id="mydreams_license_number"
                  type="text"
                  placeholder="Enter MyDreams License Number"
                  value={settings.find(s => s.key === 'mydreams_license_number')?.value || ''}
                  onChange={(e) => handleSettingChange('mydreams_license_number', e.target.value)}
                  className="font-mono"
                />
                <div className="text-sm text-muted-foreground">
                  Your MyDreams Technology license number
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mydreams_api_key" className="text-base">
                  API Key *
                </Label>
                <Input
                  id="mydreams_api_key"
                  type="password"
                  placeholder="Enter MyDreams API Key"
                  value={settings.find(s => s.key === 'mydreams_api_key')?.value || ''}
                  onChange={(e) => handleSettingChange('mydreams_api_key', e.target.value)}
                  className="font-mono"
                />
                <div className="text-sm text-muted-foreground">
                  Your MyDreams Technology API key (kept secure)
                </div>
              </div>

              {settings.find(s => s.key === 'mydreams_license_number')?.value &&
               settings.find(s => s.key === 'mydreams_api_key')?.value ? (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    MyDreams WhatsApp API is configured. You can now send bill PDFs via WhatsApp.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <span className="font-semibold">Configuration incomplete</span>
                      <div>Please configure both License Number and API Key to enable WhatsApp bill sharing.</div>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>

        {/* WhatsApp Two-Way Communication */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              WhatsApp Two-Way Communication
            </CardTitle>
            <CardDescription>
              Enable customers to create bills via WhatsApp messages
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-semibold">Enable two-way communication to allow customers to:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Create bills by sending WhatsApp messages</li>
                      <li>Check bill status and recent bills</li>
                      <li>Get guided assistance through conversation</li>
                    </ul>
                    <p className="text-sm mt-3">
                      <strong>Webhook URL:</strong> <code className="bg-muted px-2 py-1 rounded">{process.env.NEXTAUTH_URL}/api/whatsapp/incoming</code>
                    </p>
                    <p className="text-xs mt-2">Configure this webhook URL in your MyDreams WhatsApp dashboard to receive incoming messages.</p>
                  </div>
                </AlertDescription>
              </Alert>

              {/* Enable Webhook Toggle */}
              <div className="flex items-center justify-between space-x-4 border rounded-lg p-4">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="whatsapp_webhook_enabled" className="text-base">
                    Enable Incoming Messages
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Allow the system to receive and process WhatsApp messages
                  </p>
                </div>
                <Switch
                  id="whatsapp_webhook_enabled"
                  checked={settings.find(s => s.key === 'whatsapp_webhook_enabled')?.value === 'true'}
                  onCheckedChange={(checked) => handleSettingChange('whatsapp_webhook_enabled', checked ? 'true' : 'false')}
                />
              </div>

              {/* Test Button */}
              {settings.find(s => s.key === 'whatsapp_webhook_enabled')?.value === 'true' && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(`${process.env.NEXTAUTH_URL}/api/whatsapp/incoming`);
                      toast({ title: 'Copied!', description: 'Webhook URL copied to clipboard' });
                    }}
                  >
                    Copy Webhook URL
                  </Button>
                </div>
              )}

              {settings.find(s => s.key === 'whatsapp_webhook_enabled')?.value === 'true' ? (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <span className="font-semibold">Two-way communication is enabled</span>
                      <div className="text-sm">Customers can now create bills by sending messages to your WhatsApp number.</div>
                      <div className="text-xs mt-2">
                        <strong>Available commands:</strong> CREATE BILL, STATUS, HELP, CANCEL
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Two-way communication is disabled. Enable it to allow customers to create bills via WhatsApp.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Maintenance Mode Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Maintenance Mode
            </CardTitle>
            <CardDescription>
              Control access to bill creation features during maintenance
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Single Bill Maintenance */}
            {settings
              .filter(s => s.key === 'SINGLE_BILL_MAINTENANCE_ENABLED')
              .map(setting => (
                <div key={setting.key} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base">Single Bill Creation</Label>
                      <div className="text-sm text-muted-foreground">
                        {setting.description}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={getSettingValue(setting) as boolean}
                        onCheckedChange={(checked) => handleSettingChange(setting.key, checked)}
                      />
                      <Badge variant={getSettingValue(setting) ? 'destructive' : 'default'}>
                        {getSettingValue(setting) ? 'Under Maintenance' : 'Active'}
                      </Badge>
                    </div>
                  </div>
                  {getSettingValue(setting) && (
                    <Alert className="border-yellow-200 bg-yellow-50">
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                      <AlertDescription className="text-yellow-800">
                        Single bill creation is currently disabled. Users will see a maintenance message.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              ))}

            {/* Bulk Billing Maintenance */}
            {settings
              .filter(s => s.key === 'BULK_BILLING_MAINTENANCE_ENABLED')
              .map(setting => (
                <div key={setting.key} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base">Bulk Billing</Label>
                      <div className="text-sm text-muted-foreground">
                        {setting.description}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={getSettingValue(setting) as boolean}
                        onCheckedChange={(checked) => handleSettingChange(setting.key, checked)}
                      />
                      <Badge variant={getSettingValue(setting) ? 'destructive' : 'default'}>
                        {getSettingValue(setting) ? 'Under Maintenance' : 'Active'}
                      </Badge>
                    </div>
                  </div>
                  {getSettingValue(setting) && (
                    <Alert className="border-yellow-200 bg-yellow-50">
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                      <AlertDescription className="text-yellow-800">
                        Bulk billing is currently disabled. Users will see a maintenance message.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              ))}
          </CardContent>
        </Card>

        {/* System Validation Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Data Validation
            </CardTitle>
            <CardDescription>
              Configure data quality and validation rules
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Provisional Indices Check */}
            {settings
              .filter(s => s.key === 'PROVISIONAL_INDICES_CHECK_ENABLED')
              .map(setting => (
                <div key={setting.key} className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Provisional Indices Validation</Label>
                    <div className="text-sm text-muted-foreground">
                      {setting.description}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={getSettingValue(setting) as boolean}
                      onCheckedChange={(checked) => handleSettingChange(setting.key, checked)}
                    />
                    <Badge variant={getSettingValue(setting) ? 'default' : 'secondary'}>
                      {getSettingValue(setting) ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>

        {/* Admin Permissions Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Admin Permissions
            </CardTitle>
            <CardDescription>
              Configure admin user permissions and access control
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Admin Delete Other Users Bills */}
            {settings
              .filter(s => s.key === 'ADMIN_CAN_DELETE_OTHER_USERS_BILLS')
              .map(setting => (
                <div key={setting.key} className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Admin Can Delete Other Users' Bills</Label>
                    <div className="text-sm text-muted-foreground">
                      {setting.description}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={getSettingValue(setting) as boolean}
                      onCheckedChange={(checked) => handleSettingChange(setting.key, checked)}
                    />
                    <Badge variant={getSettingValue(setting) ? 'default' : 'secondary'}>
                      {getSettingValue(setting) ? 'Allowed' : 'Restricted'}
                    </Badge>
                  </div>
                </div>
              ))}

            {/* Allow Multiple Bill Edits - Removed: All users can now edit bills unlimited times */}
          </CardContent>
        </Card>

        {/* User Management Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              User Management
            </CardTitle>
            <CardDescription>
              Configure user trial and credit warning settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Free Trial Bills */}
            {settings
              .filter(s => s.key === 'FREE_TRIAL_BILLS')
              .map(setting => (
                <div key={setting.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={setting.key} className="text-base">
                      Free Trial Bills
                    </Label>
                    <BillAmountCalculator
                      onInsertTotal={(total) => {
                        handleSettingChange(setting.key, total.toString());
                      }}
                      label={<><CalcIcon className="h-4 w-4" /></>}
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Input
                      id={setting.key}
                      type="number"
                      min="0"
                      step="1"
                      value={getSettingValue(setting) as number}
                      onChange={(e) => handleSettingChange(setting.key, e.target.value)}
                      className="max-w-[200px]"
                    />
                    <span className="text-sm text-muted-foreground">bills per user</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {setting.description}
                  </div>
                </div>
              ))}

            {/* Low Credit Threshold */}
            {settings
              .filter(s => s.key === 'LOW_CREDIT_THRESHOLD')
              .map(setting => (
                <div key={setting.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={setting.key} className="text-base">
                      Low Credit Warning Threshold
                    </Label>
                    <BillAmountCalculator
                      onInsertTotal={(total) => {
                        handleSettingChange(setting.key, total.toString());
                      }}
                      label={<><CalcIcon className="h-4 w-4" /></>}
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm">₹</span>
                    <Input
                      id={setting.key}
                      type="number"
                      min="0"
                      step="1"
                      value={getSettingValue(setting) as number}
                      onChange={(e) => handleSettingChange(setting.key, e.target.value)}
                      className="max-w-[200px]"
                    />
                    <span className="text-sm text-muted-foreground">credits</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {setting.description}
                  </div>
                </div>
              ))}


          </CardContent>
        </Card>

        {/* Settings History */}
        <Card>
          <CardHeader>
            <CardTitle>Settings History</CardTitle>
            <CardDescription>
              View when settings were last updated
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {settings.map(setting => (
                <div key={setting.key} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0">
                  <div>
                    <div className="font-medium">{setting.key.replace(/_/g, ' ')}</div>
                    <div className="text-sm text-muted-foreground">
                      Current value: <span className="font-mono">{setting.value}</span>
                    </div>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <div>
                      Updated: {new Date(setting.updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                    </div>
                    {setting.updatedByUserEmail && (
                      <div>By: {setting.updatedByUserEmail}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
