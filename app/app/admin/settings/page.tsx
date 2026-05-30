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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Info,
  Shield,
  History,
  Lock,
  Mail
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
        return prev.map(setting => 
          setting.key === key 
            ? { ...setting, value: String(value) }
            : setting
        );
      } else {
        const newSetting: AdminSetting = {
          id: `temp_${Date.now()}`,
          key,
          value: String(value),
          description: getDescriptionForKey(key),
          dataType: getDataTypeForKey(key),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return [...prev, newSetting];
      }
    });
    setHasChanges(true);
  };
  
  const getDataTypeForKey = (key: string): string => {
    const booleans = [
      'PAYMENT_PROCESSING_ENABLED', 
      'razorpay_enabled', 
      'whatsapp_webhook_enabled', 
      'SINGLE_BILL_MAINTENANCE_ENABLED', 
      'BULK_BILLING_MAINTENANCE_ENABLED', 
      'PROVISIONAL_INDICES_CHECK_ENABLED', 
      'ADMIN_CAN_DELETE_OTHER_USERS_BILLS',
      'EMAIL_VERIFICATION_REQUIRED',
      'pvc_comparison_payment_enabled'
    ];
    if (booleans.includes(key)) return 'boolean';
    
    const numbers = ['BILL_PROCESSING_COST', 'FREE_TRIAL_BILLS', 'LOW_CREDIT_THRESHOLD'];
    if (numbers.includes(key)) return 'number';
    
    return 'string';
  };

  const getDescriptionForKey = (key: string): string => {
    const descriptions: Record<string, string> = {
      'PAYMENT_PROCESSING_ENABLED': 'Enable/disable payment processing for bills',
      'razorpay_enabled': 'Enable Razorpay payment gateway for Class Analyzer and credit top-ups',
      'razorpay_key_id': 'Razorpay API Key ID',
      'razorpay_key_secret': 'Razorpay API Key Secret',
      'payment_method': 'Payment method for credit top-ups (razorpay or manual)',
      'mydreams_license_number': 'Your MyDreams Technology license number',
      'mydreams_api_key': 'Your MyDreams Technology API key (kept secure)',
      'whatsapp_webhook_enabled': 'Allow the system to receive and process WhatsApp messages',
      'pvc_comparison_payment_enabled': 'Enable payment for Class Analyzer (250 INR per session for contractor users)',
      'EMAIL_VERIFICATION_REQUIRED': 'Require users to verify their email before accessing the system. When disabled, users can sign up and access immediately without verification.',
      'ADMIN_CAN_DELETE_OTHER_USERS_BILLS': 'Allow admins to delete bills created by other users. When disabled, admins can only delete their own bills.',
      'SINGLE_BILL_MAINTENANCE_ENABLED': 'Enable maintenance mode for single bill creation. When enabled, users cannot create individual bills.',
      'BULK_BILLING_MAINTENANCE_ENABLED': 'Enable maintenance mode for bulk billing. When enabled, users cannot create bills in bulk.',
      'PROVISIONAL_INDICES_CHECK_ENABLED': 'Enable/disable validation to prevent bill processing if provisional indices match measurement date',
      'BILL_PROCESSING_COST': 'Cost in credits per bill processing',
      'FREE_TRIAL_BILLS': 'Number of free trial bills for new users',
      'LOW_CREDIT_THRESHOLD': 'Credit balance threshold for low credit warning'
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
            description: s.description || getDescriptionForKey(s.key),
            dataType: s.dataType || getDataTypeForKey(s.key)
          }))
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save settings');
      }

      toast({
        title: 'Success',
        description: 'System settings saved successfully',
      });

      setHasChanges(false);
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
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <Settings className="h-8 w-8 text-indigo-600 animate-spin mx-auto" />
          <h2 className="text-xl font-bold text-slate-800">Verifying authorization...</h2>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-20">
          <Settings className="h-8 w-8 text-indigo-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-500">Loading system settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen pb-12 space-y-8 overflow-hidden">
      {/* Background Blurs */}
      <div className="absolute top-0 right-10 w-96 h-96 bg-violet-300/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-1/3 -left-20 w-80 h-80 bg-cyan-300/10 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-20 w-[450px] h-[450px] bg-emerald-300/5 blur-[150px] rounded-full pointer-events-none" />

      {/* Header Container */}
      <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6 p-8 bg-white/80 backdrop-blur-xl border border-slate-200/50 rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="absolute inset-0 bg-grid-slate-900/[0.01] pointer-events-none" />
        <div className="relative space-y-2">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200/50 rounded-full shadow-sm">
            <Settings className="h-3 w-3 text-indigo-600" />
            System Configuration Center
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 bg-clip-text text-transparent">
            System Settings
          </h1>
          <p className="text-sm text-slate-500 max-w-lg font-normal">
            Configure system-wide billing models, API notification gateways, data validation criteria, and administrative permissions.
          </p>
        </div>
        
        <div className="flex gap-3 items-center">
          {hasChanges && (
            <Button variant="outline" onClick={handleReset} className="border-slate-200 text-slate-700 hover:bg-slate-50 h-11 px-5 rounded-2xl transition-colors">
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          )}
          <Button 
            onClick={handleSave} 
            disabled={!hasChanges || saving}
            className="min-w-[120px] h-11 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/10 transition-colors disabled:opacity-50"
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {hasChanges && (
        <Alert className="border-amber-100 bg-amber-50/50 backdrop-blur-md rounded-2xl shadow-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 text-sm font-medium">
            You have unsaved changes. Remember to click 'Save Changes' at the top to apply your modifications.
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs Layout */}
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="flex flex-wrap h-auto bg-slate-100/60 p-1 rounded-2xl border border-slate-200/40 w-fit gap-1 backdrop-blur-md">
          <TabsTrigger value="general" className="flex items-center gap-2 rounded-xl text-xs sm:text-sm font-semibold py-2.5 px-4 transition-all data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm border border-transparent data-[state=active]:border-slate-200/50 text-slate-600 hover:text-slate-900">
            <DollarSign className="h-4 w-4" />
            General & Billing
          </TabsTrigger>
          <TabsTrigger value="gateways" className="flex items-center gap-2 rounded-xl text-xs sm:text-sm font-semibold py-2.5 px-4 transition-all data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm border border-transparent data-[state=active]:border-slate-200/50 text-slate-600 hover:text-slate-900">
            <CreditCard className="h-4 w-4" />
            Gateways & APIs
          </TabsTrigger>
          <TabsTrigger value="controls" className="flex items-center gap-2 rounded-xl text-xs sm:text-sm font-semibold py-2.5 px-4 transition-all data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm border border-transparent data-[state=active]:border-slate-200/50 text-slate-600 hover:text-slate-900">
            <Wrench className="h-4 w-4" />
            System Controls
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2 rounded-xl text-xs sm:text-sm font-semibold py-2.5 px-4 transition-all data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm border border-transparent data-[state=active]:border-slate-200/50 text-slate-600 hover:text-slate-900">
            <History className="h-4 w-4" />
            Audit Log
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: GENERAL & BILLING */}
        <TabsContent value="general" className="space-y-6 outline-none">
          <Card className="border border-slate-100 bg-white/70 backdrop-blur-md shadow-[0_15px_35px_rgba(0,0,0,0.02)] rounded-3xl overflow-hidden">
            <CardHeader className="p-8 border-b border-slate-100 bg-slate-50/30">
              <CardTitle className="text-xl font-bold text-slate-800 flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600">
                  <DollarSign className="h-4.5 w-4.5" />
                </div>
                Billing Configuration
              </CardTitle>
              <CardDescription className="text-slate-500 font-normal">
                Configure bill processing credit deductions, payment methods, and trial accounts.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              {/* Payment Processing Toggle */}
              {settings
                .filter(s => s.key === 'PAYMENT_PROCESSING_ENABLED')
                .map(setting => (
                  <div key={setting.key} className="flex items-center justify-between p-5 border border-slate-100/80 bg-slate-50/20 rounded-2xl hover:bg-slate-50/50 transition-colors">
                    <div className="space-y-1 pr-4">
                      <Label className="text-base font-semibold text-slate-800">Payment Processing</Label>
                      <p className="text-sm text-slate-500 font-light pr-2">
                        {setting.description || 'Enable/disable payment processing credit requirements for bill creation.'}
                      </p>
                    </div>
                    <div className="flex items-center space-x-3 shrink-0">
                      <Switch
                        checked={getSettingValue(setting) as boolean}
                        onCheckedChange={(checked) => handleSettingChange(setting.key, checked)}
                      />
                      <Badge className={`text-xs font-semibold px-2.5 py-0.5 rounded-lg border uppercase tracking-wider ${
                        getSettingValue(setting) 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}>
                        {getSettingValue(setting) ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                  </div>
                ))}

              {/* Payment Method Selection */}
              {settings
                .filter(s => s.key === 'payment_method')
                .map(setting => (
                  <div key={setting.key} className="flex items-center justify-between p-5 border border-slate-100/80 bg-slate-50/20 rounded-2xl hover:bg-slate-50/50 transition-colors">
                    <div className="space-y-1 pr-4">
                      <Label className="text-base font-semibold text-slate-800">Primary Payment Gateway Mode</Label>
                      <p className="text-sm text-slate-500 font-light pr-2">
                        {setting.description || 'Define method for credit deposits (manual invoice approvals or direct Razorpay checkout).'}
                      </p>
                    </div>
                    <div className="flex items-center space-x-3 shrink-0">
                      <Switch
                        checked={getSettingValue(setting) === 'razorpay'}
                        onCheckedChange={(checked) => handleSettingChange(setting.key, checked ? 'razorpay' : 'manual')}
                      />
                      <Badge className={`text-xs font-semibold px-2.5 py-0.5 rounded-lg border uppercase tracking-wider ${
                        getSettingValue(setting) === 'razorpay'
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {getSettingValue(setting) === 'razorpay' ? 'Razorpay' : 'Manual'}
                      </Badge>
                    </div>
                  </div>
                ))}

              {/* Class Analyzer Payment Toggle */}
              {settings
                .filter(s => s.key === 'pvc_comparison_payment_enabled')
                .map(setting => (
                  <div key={setting.key} className="flex items-center justify-between p-5 border border-slate-100/80 bg-slate-50/20 rounded-2xl hover:bg-slate-50/50 transition-colors">
                    <div className="space-y-1 pr-4">
                      <Label className="text-base font-semibold text-slate-800">Class Analyzer Payments</Label>
                      <p className="text-sm text-slate-500 font-light pr-2">
                        {setting.description || 'Require contractor users to pay a flat fee per session for running Class Analyzer tools.'}
                      </p>
                    </div>
                    <div className="flex items-center space-x-3 shrink-0">
                      <Switch
                        checked={getSettingValue(setting) as boolean}
                        onCheckedChange={(checked) => handleSettingChange(setting.key, checked)}
                      />
                      <Badge className={`text-xs font-semibold px-2.5 py-0.5 rounded-lg border uppercase tracking-wider ${
                        getSettingValue(setting) 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}>
                        {getSettingValue(setting) ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                  </div>
                ))}

              <div className="grid gap-6 grid-cols-1 md:grid-cols-3 pt-4">
                {/* Bill Processing Cost */}
                {settings
                  .filter(s => s.key === 'BILL_PROCESSING_COST')
                  .map(setting => (
                    <div key={setting.key} className="p-5 border border-slate-100/80 bg-slate-50/20 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between">
                        <Label htmlFor={setting.key} className="text-base font-semibold text-slate-800">
                          Bill Processing Cost
                        </Label>
                        <BillAmountCalculator
                          onInsertTotal={(total) => {
                            handleSettingChange(setting.key, total.toString());
                          }}
                          label={<div className="p-1.5 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors cursor-pointer"><CalcIcon className="h-3.5 w-3.5" /></div>}
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-slate-400 font-medium">₹</span>
                        <Input
                          id={setting.key}
                          type="number"
                          min="0"
                          step="1"
                          value={getSettingValue(setting) as number}
                          onChange={(e) => handleSettingChange(setting.key, e.target.value)}
                          className="max-w-[120px] bg-white border-slate-200 focus:bg-white text-slate-800 rounded-xl"
                        />
                        <span className="text-xs text-slate-500 font-medium">Credits / bill</span>
                      </div>
                      <p className="text-xs text-slate-400 leading-normal">{setting.description}</p>
                    </div>
                  ))}

                {/* Free Trial Bills */}
                {settings
                  .filter(s => s.key === 'FREE_TRIAL_BILLS')
                  .map(setting => (
                    <div key={setting.key} className="p-5 border border-slate-100/80 bg-slate-50/20 rounded-2xl space-y-3">
                      <Label htmlFor={setting.key} className="text-base font-semibold text-slate-800 block">
                        Free Trial Balance
                      </Label>
                      <div className="flex items-center space-x-2">
                        <Input
                          id={setting.key}
                          type="number"
                          min="0"
                          step="1"
                          value={getSettingValue(setting) as number}
                          onChange={(e) => handleSettingChange(setting.key, e.target.value)}
                          className="max-w-[120px] bg-white border-slate-200 focus:bg-white text-slate-800 rounded-xl"
                        />
                        <span className="text-xs text-slate-500 font-medium">Bills / user</span>
                      </div>
                      <p className="text-xs text-slate-400 leading-normal">{setting.description}</p>
                    </div>
                  ))}

                {/* Low Credit Threshold */}
                {settings
                  .filter(s => s.key === 'LOW_CREDIT_THRESHOLD')
                  .map(setting => (
                    <div key={setting.key} className="p-5 border border-slate-100/80 bg-slate-50/20 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between">
                        <Label htmlFor={setting.key} className="text-base font-semibold text-slate-800">
                          Low Credit Alert
                        </Label>
                        <BillAmountCalculator
                          onInsertTotal={(total) => {
                            handleSettingChange(setting.key, total.toString());
                          }}
                          label={<div className="p-1.5 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors cursor-pointer"><CalcIcon className="h-3.5 w-3.5" /></div>}
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-slate-400 font-medium">₹</span>
                        <Input
                          id={setting.key}
                          type="number"
                          min="0"
                          step="1"
                          value={getSettingValue(setting) as number}
                          onChange={(e) => handleSettingChange(setting.key, e.target.value)}
                          className="max-w-[120px] bg-white border-slate-200 focus:bg-white text-slate-800 rounded-xl"
                        />
                        <span className="text-xs text-slate-500 font-medium">Credits</span>
                      </div>
                      <p className="text-xs text-slate-400 leading-normal">{setting.description}</p>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: GATEWAYS & API CONFIGURATIONS */}
        <TabsContent value="gateways" className="space-y-6 outline-none">
          {/* Razorpay Configuration */}
          <Card className="border border-slate-100 bg-white/70 backdrop-blur-md shadow-[0_15px_35px_rgba(0,0,0,0.02)] rounded-3xl overflow-hidden">
            <CardHeader className="p-8 border-b border-slate-100 bg-slate-50/30">
              <CardTitle className="text-xl font-bold text-slate-800 flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600">
                  <CreditCard className="h-4.5 w-4.5" />
                </div>
                Razorpay Checkout Integration
              </CardTitle>
              <CardDescription className="text-slate-500 font-normal">
                Configure API keys to accept online credit cards and local payment methods via Razorpay.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              {/* Razorpay Toggle */}
              <div className="flex items-center justify-between p-5 border border-slate-100/80 bg-slate-50/20 rounded-2xl">
                <div className="space-y-1 pr-4">
                  <Label className="text-base font-semibold text-slate-800">Enable Razorpay Integration</Label>
                  <p className="text-sm text-slate-500 font-light pr-2">
                    Activate the gateway to allow contractor self-service credit top-ups.
                  </p>
                </div>
                <div className="flex items-center space-x-3 shrink-0">
                  <Switch
                    checked={settings.find(s => s.key === 'razorpay_enabled')?.value === 'true'}
                    onCheckedChange={(checked) => handleSettingChange('razorpay_enabled', checked ? 'true' : 'false')}
                  />
                  <Badge className={`text-xs font-semibold px-2.5 py-0.5 rounded-lg border uppercase tracking-wider ${
                    settings.find(s => s.key === 'razorpay_enabled')?.value === 'true'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-slate-50 text-slate-600 border-slate-200'
                  }`}>
                    {settings.find(s => s.key === 'razorpay_enabled')?.value === 'true' ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>

              <div className="grid gap-6 grid-cols-1 md:grid-cols-2 pt-2">
                {/* Key ID */}
                <div className="space-y-2">
                  <Label htmlFor="razorpay_key_id" className="text-sm font-semibold text-slate-700">Razorpay Key ID</Label>
                  <Input
                    id="razorpay_key_id"
                    type="text"
                    placeholder="rzp_live_..."
                    value={settings.find(s => s.key === 'razorpay_key_id')?.value || ''}
                    onChange={(e) => handleSettingChange('razorpay_key_id', e.target.value)}
                    className="font-mono bg-white border-slate-200 text-slate-800 focus:bg-white rounded-xl h-11"
                  />
                  <p className="text-xs text-slate-400 font-light">Enter public credential key (starts with rzp_test_ or rzp_live_).</p>
                </div>

                {/* Key Secret */}
                <div className="space-y-2">
                  <Label htmlFor="razorpay_key_secret" className="text-sm font-semibold text-slate-700">Razorpay Key Secret</Label>
                  <Input
                    id="razorpay_key_secret"
                    type="password"
                    placeholder="Enter key secret password"
                    value={settings.find(s => s.key === 'razorpay_key_secret')?.value || ''}
                    onChange={(e) => handleSettingChange('razorpay_key_secret', e.target.value)}
                    className="font-mono bg-white border-slate-200 text-slate-800 focus:bg-white rounded-xl h-11"
                  />
                  <p className="text-xs text-slate-400 font-light">Private credentials are encrypted and stored in secure vault environments.</p>
                </div>
              </div>

              {/* Config alert block */}
              {settings.find(s => s.key === 'razorpay_enabled')?.value === 'true' &&
               settings.find(s => s.key === 'razorpay_key_id')?.value &&
               settings.find(s => s.key === 'razorpay_key_secret')?.value ? (
                <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-700 text-sm font-medium">
                  <CheckCircle className="h-4.5 w-4.5 shrink-0 text-emerald-600" />
                  <span>Razorpay client parameters verified. Online billing is operational.</span>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-100 rounded-2xl text-amber-700 text-sm font-medium">
                  <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-amber-600" />
                  <span>Razorpay checkout configurations are incomplete. Payments are disabled until fields are set.</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* WhatsApp API Configuration */}
          <Card className="border border-slate-100 bg-white/70 backdrop-blur-md shadow-[0_15px_35px_rgba(0,0,0,0.02)] rounded-3xl overflow-hidden">
            <CardHeader className="p-8 border-b border-slate-100 bg-slate-50/30">
              <CardTitle className="text-xl font-bold text-slate-800 flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600">
                  <MessageCircle className="h-4.5 w-4.5" />
                </div>
                MyDreams WhatsApp Notification Services
              </CardTitle>
              <CardDescription className="text-slate-500 font-normal">
                Enable automatic delivery of PVC computation logs and bills as PDFs directly to contractors' phone numbers.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              <div className="flex items-center gap-3.5 p-4.5 bg-slate-50/80 border border-slate-150 rounded-2xl text-slate-600 text-sm">
                <Info className="h-5 w-5 shrink-0 text-indigo-600" />
                <div className="space-y-0.5">
                  <span className="font-semibold text-slate-700">Notification Integration Config</span>
                  <p className="text-xs text-slate-500">API Endpoint: <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono font-medium text-slate-600">https://wa.mydreamstechnology.in/api/sendtemplate.php</code></p>
                </div>
              </div>

              <div className="grid gap-6 grid-cols-1 md:grid-cols-2 pt-2">
                {/* License Number */}
                <div className="space-y-2">
                  <Label htmlFor="mydreams_license_number" className="text-sm font-semibold text-slate-700">MyDreams License Number</Label>
                  <Input
                    id="mydreams_license_number"
                    type="text"
                    placeholder="Enter MyDreams license registration"
                    value={settings.find(s => s.key === 'mydreams_license_number')?.value || ''}
                    onChange={(e) => handleSettingChange('mydreams_license_number', e.target.value)}
                    className="font-mono bg-white border-slate-200 text-slate-800 focus:bg-white rounded-xl h-11"
                  />
                  <p className="text-xs text-slate-400 font-light">Provided in MyDreams Dashboard billing profiles.</p>
                </div>

                {/* API Key */}
                <div className="space-y-2">
                  <Label htmlFor="mydreams_api_key" className="text-sm font-semibold text-slate-700">MyDreams API Secret Token</Label>
                  <Input
                    id="mydreams_api_key"
                    type="password"
                    placeholder="Enter MyDreams API Key token"
                    value={settings.find(s => s.key === 'mydreams_api_key')?.value || ''}
                    onChange={(e) => handleSettingChange('mydreams_api_key', e.target.value)}
                    className="font-mono bg-white border-slate-200 text-slate-800 focus:bg-white rounded-xl h-11"
                  />
                  <p className="text-xs text-slate-400 font-light">Private API authorization token (stored securely).</p>
                </div>
              </div>

              {settings.find(s => s.key === 'mydreams_license_number')?.value &&
               settings.find(s => s.key === 'mydreams_api_key')?.value ? (
                <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-700 text-sm font-medium">
                  <CheckCircle className="h-4.5 w-4.5 shrink-0 text-emerald-600" />
                  <span>WhatsApp integration parameters active. Notifications will fire automatically.</span>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-100 rounded-2xl text-amber-700 text-sm font-medium">
                  <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-amber-600" />
                  <span>WhatsApp service credentials missing. Auto-bill deliveries are currently inactive.</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Webhook Settings */}
          <Card className="border border-slate-100 bg-white/70 backdrop-blur-md shadow-[0_15px_35px_rgba(0,0,0,0.02)] rounded-3xl overflow-hidden">
            <CardHeader className="p-8 border-b border-slate-100 bg-slate-50/30">
              <CardTitle className="text-xl font-bold text-slate-800 flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600">
                  <MessageSquare className="h-4.5 w-4.5" />
                </div>
                WhatsApp Webhooks & Two-Way Conversations
              </CardTitle>
              <CardDescription className="text-slate-500 font-normal">
                Configure incoming webhooks to allow contractor users to request status and calculate PVC figures via message queries.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              <div className="space-y-4">
                <div className="p-4.5 bg-slate-50/80 border border-slate-150 rounded-2xl space-y-2">
                  <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                    <Info className="h-4 w-4 text-indigo-600" /> Webhook System Capabilities:
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-xs text-slate-500 font-light">
                    <li>Create single and complex billing computations via chat triggers.</li>
                    <li>Fetch credit reserves status.</li>
                    <li>Check PDF download paths.</li>
                  </ul>
                  <div className="text-xs pt-2 font-medium text-slate-700 flex flex-col gap-1.5 sm:flex-row sm:items-center">
                    <span>Incoming Endpoint:</span>
                    <span className="bg-slate-100 font-mono px-2 py-0.5 rounded border border-slate-200 break-all select-all font-semibold text-slate-600">
                      {typeof window !== 'undefined' ? `${window.location.origin}/api/whatsapp/incoming` : '/api/whatsapp/incoming'}
                    </span>
                  </div>
                </div>

                {/* Webhook Enable Switches */}
                <div className="flex items-center justify-between p-5 border border-slate-100/80 bg-slate-50/20 rounded-2xl">
                  <div className="space-y-1 pr-4">
                    <Label className="text-base font-semibold text-slate-800">Enable Incoming Messages</Label>
                    <p className="text-sm text-slate-500 font-light pr-2">
                      Allow MyDreams webhooks to submit chat triggers to our processing loop.
                    </p>
                  </div>
                  <div className="flex items-center space-x-3 shrink-0">
                    <Switch
                      id="whatsapp_webhook_enabled"
                      checked={settings.find(s => s.key === 'whatsapp_webhook_enabled')?.value === 'true'}
                      onCheckedChange={(checked) => handleSettingChange('whatsapp_webhook_enabled', checked ? 'true' : 'false')}
                    />
                    <Badge className={`text-xs font-semibold px-2.5 py-0.5 rounded-lg border uppercase tracking-wider ${
                      settings.find(s => s.key === 'whatsapp_webhook_enabled')?.value === 'true'
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}>
                      {settings.find(s => s.key === 'whatsapp_webhook_enabled')?.value === 'true' ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>

                {settings.find(s => s.key === 'whatsapp_webhook_enabled')?.value === 'true' && (
                  <div className="flex justify-start">
                    <Button
                      variant="outline"
                      className="border-slate-200 hover:bg-slate-50 text-slate-600 h-10 px-4 rounded-xl text-xs font-semibold cursor-pointer"
                      onClick={() => {
                        const origin = typeof window !== 'undefined' ? window.location.origin : '';
                        navigator.clipboard.writeText(`${origin}/api/whatsapp/incoming`);
                        toast({ title: 'Copied!', description: 'Incoming webhook url copied to clipboard.' });
                      }}
                    >
                      Copy Webhook Endpoint URL
                    </Button>
                  </div>
                )}

                {settings.find(s => s.key === 'whatsapp_webhook_enabled')?.value === 'true' ? (
                  <div className="flex items-start gap-3.5 p-4 bg-indigo-50/50 border border-indigo-100/50 rounded-2xl text-indigo-700 text-sm font-normal">
                    <CheckCircle className="h-4.5 w-4.5 text-indigo-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <span className="font-semibold text-slate-700">Chat calculations are live</span>
                      <p className="text-xs text-slate-500 leading-normal">
                        Webhook responds to triggers. Supported inputs: <code className="bg-white/80 border border-indigo-150 px-1 rounded font-mono font-bold">CREATE BILL</code>, <code className="bg-white/80 border border-indigo-150 px-1 rounded font-mono font-bold">STATUS</code>, <code className="bg-white/80 border border-indigo-150 px-1 rounded font-mono font-bold">HELP</code>, <code className="bg-white/80 border border-indigo-150 px-1 rounded font-mono font-bold">CANCEL</code>.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-100 rounded-2xl text-amber-700 text-sm font-medium">
                    <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-amber-600" />
                    <span>Webhook listeners are inactive. Incoming chat commands are ignored.</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: SYSTEM CONTROLS & MAINTENANCE */}
        <TabsContent value="controls" className="space-y-6 outline-none">
          {/* Maintenance Settings */}
          <Card className="border border-slate-100 bg-white/70 backdrop-blur-md shadow-[0_15px_35px_rgba(0,0,0,0.02)] rounded-3xl overflow-hidden">
            <CardHeader className="p-8 border-b border-slate-100 bg-slate-50/30">
              <CardTitle className="text-xl font-bold text-slate-800 flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600">
                  <Wrench className="h-4.5 w-4.5" />
                </div>
                Feature Maintenance Modes
              </CardTitle>
              <CardDescription className="text-slate-500 font-normal">
                Selectively take features offline to execute index syncs or database patches.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              {/* Single Bill Maintenance */}
              {settings
                .filter(s => s.key === 'SINGLE_BILL_MAINTENANCE_ENABLED')
                .map(setting => (
                  <div key={setting.key} className="p-5 border border-slate-100/80 bg-slate-50/20 rounded-2xl space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1 pr-4">
                        <Label className="text-base font-semibold text-slate-800">Single Bill Wizard Offline</Label>
                        <p className="text-sm text-slate-500 font-light">{setting.description}</p>
                      </div>
                      <div className="flex items-center space-x-3 shrink-0">
                        <Switch
                          checked={getSettingValue(setting) as boolean}
                          onCheckedChange={(checked) => handleSettingChange(setting.key, checked)}
                        />
                        <Badge className={`text-xs font-semibold px-2.5 py-0.5 rounded-lg border uppercase tracking-wider ${
                          getSettingValue(setting) 
                            ? 'bg-rose-50 text-rose-700 border-rose-200' 
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {getSettingValue(setting) ? 'Active Maintenance' : 'Active Feature'}
                        </Badge>
                      </div>
                    </div>
                    {getSettingValue(setting) && (
                      <div className="flex items-center gap-3 p-3 bg-rose-50/50 border border-rose-100 text-rose-700 text-xs rounded-xl font-medium">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
                        <span>Contractors are blocked from running individual bill calculations (error banner displays).</span>
                      </div>
                    )}
                  </div>
                ))}

              {/* Bulk Billing Maintenance */}
              {settings
                .filter(s => s.key === 'BULK_BILLING_MAINTENANCE_ENABLED')
                .map(setting => (
                  <div key={setting.key} className="p-5 border border-slate-100/80 bg-slate-50/20 rounded-2xl space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1 pr-4">
                        <Label className="text-base font-semibold text-slate-800">Bulk Excel Uploader Offline</Label>
                        <p className="text-sm text-slate-500 font-light">{setting.description}</p>
                      </div>
                      <div className="flex items-center space-x-3 shrink-0">
                        <Switch
                          checked={getSettingValue(setting) as boolean}
                          onCheckedChange={(checked) => handleSettingChange(setting.key, checked)}
                        />
                        <Badge className={`text-xs font-semibold px-2.5 py-0.5 rounded-lg border uppercase tracking-wider ${
                          getSettingValue(setting) 
                            ? 'bg-rose-50 text-rose-700 border-rose-200' 
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {getSettingValue(setting) ? 'Active Maintenance' : 'Active Feature'}
                        </Badge>
                      </div>
                    </div>
                    {getSettingValue(setting) && (
                      <div className="flex items-center gap-3 p-3 bg-rose-50/50 border border-rose-100 text-rose-700 text-xs rounded-xl font-medium">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
                        <span>Contractors are blocked from running bulk excel conversions (error banner displays).</span>
                      </div>
                    )}
                  </div>
                ))}
            </CardContent>
          </Card>

          {/* Validation & Permissions settings */}
          <Card className="border border-slate-100 bg-white/70 backdrop-blur-md shadow-[0_15px_35px_rgba(0,0,0,0.02)] rounded-3xl overflow-hidden">
            <CardHeader className="p-8 border-b border-slate-100 bg-slate-50/30">
              <CardTitle className="text-xl font-bold text-slate-800 flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600">
                  <Shield className="h-4.5 w-4.5" />
                </div>
                Access Rules & Data Integrity
              </CardTitle>
              <CardDescription className="text-slate-500 font-normal">
                Enforce registration filters, data validations, and admin-level document deletion capabilities.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              {/* Provisional Indices Check */}
              {settings
                .filter(s => s.key === 'PROVISIONAL_INDICES_CHECK_ENABLED')
                .map(setting => (
                  <div key={setting.key} className="flex items-center justify-between p-5 border border-slate-100/80 bg-slate-50/20 rounded-2xl hover:bg-slate-50/50 transition-colors">
                    <div className="space-y-1 pr-4">
                      <Label className="text-base font-semibold text-slate-800">Provisional Indices Validation</Label>
                      <p className="text-sm text-slate-500 font-light pr-2">
                        {setting.description || 'Block final calculations if active provisional monthly values match the measurement months.'}
                      </p>
                    </div>
                    <div className="flex items-center space-x-3 shrink-0">
                      <Switch
                        checked={getSettingValue(setting) as boolean}
                        onCheckedChange={(checked) => handleSettingChange(setting.key, checked)}
                      />
                      <Badge className={`text-xs font-semibold px-2.5 py-0.5 rounded-lg border uppercase tracking-wider ${
                        getSettingValue(setting) 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}>
                        {getSettingValue(setting) ? 'Enforced' : 'Unchecked'}
                      </Badge>
                    </div>
                  </div>
                ))}

              {/* Email Verification Toggle */}
              {settings
                .filter(s => s.key === 'EMAIL_VERIFICATION_REQUIRED')
                .map(setting => (
                  <div key={setting.key} className="flex items-center justify-between p-5 border border-slate-100/80 bg-slate-50/20 rounded-2xl hover:bg-slate-50/50 transition-colors">
                    <div className="space-y-1 pr-4">
                      <Label className="text-base font-semibold text-slate-800 flex items-center gap-2">
                        <Mail className="h-4.5 w-4.5 text-indigo-600" /> Require Email Verification
                      </Label>
                      <p className="text-sm text-slate-500 font-light pr-2">
                        {setting.description || 'Enforce user signup domain checks and email confirmation links before allowing system access.'}
                      </p>
                    </div>
                    <div className="flex items-center space-x-3 shrink-0">
                      <Switch
                        checked={getSettingValue(setting) as boolean}
                        onCheckedChange={(checked) => handleSettingChange(setting.key, checked)}
                      />
                      <Badge className={`text-xs font-semibold px-2.5 py-0.5 rounded-lg border uppercase tracking-wider ${
                        getSettingValue(setting) 
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {getSettingValue(setting) ? 'Required' : 'Optional'}
                      </Badge>
                    </div>
                  </div>
                ))}

              {/* Admin Deletes other bills */}
              {settings
                .filter(s => s.key === 'ADMIN_CAN_DELETE_OTHER_USERS_BILLS')
                .map(setting => (
                  <div key={setting.key} className="flex items-center justify-between p-5 border border-slate-100/80 bg-slate-50/20 rounded-2xl hover:bg-slate-50/50 transition-colors">
                    <div className="space-y-1 pr-4">
                      <Label className="text-base font-semibold text-slate-800 flex items-center gap-2">
                        <Lock className="h-4.5 w-4.5 text-indigo-600" /> Admin Delete Permissions
                      </Label>
                      <p className="text-sm text-slate-500 font-light pr-2">
                        {setting.description || 'Let administrators wipe contract files or processing records created by regular users.'}
                      </p>
                    </div>
                    <div className="flex items-center space-x-3 shrink-0">
                      <Switch
                        checked={getSettingValue(setting) as boolean}
                        onCheckedChange={(checked) => handleSettingChange(setting.key, checked)}
                      />
                      <Badge className={`text-xs font-semibold px-2.5 py-0.5 rounded-lg border uppercase tracking-wider ${
                        getSettingValue(setting) 
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        {getSettingValue(setting) ? 'Allowed' : 'Restricted'}
                      </Badge>
                    </div>
                  </div>
                ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: AUDIT LOGS & HISTORY */}
        <TabsContent value="history" className="space-y-6 outline-none">
          <Card className="border border-slate-100 bg-white/70 backdrop-blur-md shadow-[0_15px_35px_rgba(0,0,0,0.02)] rounded-3xl overflow-hidden">
            <CardHeader className="p-8 border-b border-slate-100 bg-slate-50/30">
              <CardTitle className="text-xl font-bold text-slate-800 flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600">
                  <History className="h-4.5 w-4.5" />
                </div>
                Settings Alteration Logs
              </CardTitle>
              <CardDescription className="text-slate-500 font-normal">
                Audit trail tracking the configuration parameter states, modifications, and saving accounts.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8">
              <div className="divide-y divide-slate-100 border border-slate-100 bg-white/50 rounded-2xl overflow-hidden shadow-inner">
                {settings.map(setting => (
                  <div key={setting.key} className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-5 hover:bg-slate-50/40 transition-colors">
                    <div className="space-y-1">
                      <div className="font-bold text-slate-800 text-sm tracking-wide font-mono uppercase">{setting.key}</div>
                      <div className="text-xs text-slate-500">
                        Value: <span className="font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200/50 font-semibold">{setting.value}</span>
                      </div>
                    </div>
                    <div className="text-left sm:text-right text-xs text-slate-400 font-medium mt-3 sm:mt-0 space-y-0.5">
                      <div className="text-slate-500">
                        Updated: {new Date(setting.updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}
                      </div>
                      {setting.updatedByUserEmail && (
                        <div className="text-indigo-600">By: {setting.updatedByUserEmail}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
