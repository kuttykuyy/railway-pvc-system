
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'react-hot-toast';
import { Upload, X, Save, Eye } from 'lucide-react';
import Image from 'next/image';

interface BrandingSettings {
  logoPath: string | null;
  logoUrl: string | null;
  reportHeaderText: string;
  reportHeaderColor: string;
  reportFooterText: string;
  showLogoInReports: boolean;
  companyName: string | null;
}

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [settings, setSettings] = useState<BrandingSettings>({
    logoPath: null,
    logoUrl: null,
    reportHeaderText: 'INDIAN RAILWAY',
    reportHeaderColor: '#000000',
    reportFooterText: '',
    showLogoInReports: true,
    companyName: null,
  });
  const [previewFile, setPreviewFile] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      fetchSettings();
    }
  }, [status, router]);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings/branding');
      if (!response.ok) throw new Error('Failed to fetch settings');
      const data = await response.json();
      setSettings(data);
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Only JPG, PNG, and GIF are allowed.');
      return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('File size exceeds 5MB limit');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);

      const response = await fetch('/api/settings/branding', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload logo');
      }

      const data = await response.json();
      setSettings(data);
      toast.success('Logo uploaded successfully');
    } catch (error: any) {
      console.error('Error uploading logo:', error);
      toast.error(error.message || 'Failed to upload logo');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteLogo = async () => {
    if (!confirm('Are you sure you want to delete your logo?')) return;

    try {
      const response = await fetch('/api/settings/branding', {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete logo');

      setSettings({ ...settings, logoPath: null, logoUrl: null });
      toast.success('Logo deleted successfully');
    } catch (error) {
      console.error('Error deleting logo:', error);
      toast.error('Failed to delete logo');
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/settings/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportHeaderText: settings.reportHeaderText,
          reportHeaderColor: settings.reportHeaderColor,
          reportFooterText: settings.reportFooterText,
          showLogoInReports: settings.showLogoInReports,
        }),
      });

      if (!response.ok) throw new Error('Failed to save settings');

      const data = await response.json();
      setSettings(data);
      toast.success('Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Report Branding Settings</h1>
        <p className="text-muted-foreground mt-2">
          Customize how your PVC reports look with your company logo and branding
        </p>
      </div>

      <div className="space-y-6">
        {/* Logo Upload Card */}
        <Card>
          <CardHeader>
            <CardTitle>Company Logo</CardTitle>
            <CardDescription>
              Upload your company logo to appear in PDF reports. Recommended size: 200x80 pixels (max 5MB)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {settings.logoUrl ? (
              <div className="space-y-4">
                <div className="relative w-full max-w-md border rounded-lg p-4 bg-muted/30">
                  <div className="relative w-full h-24">
                    <Image
                      src={settings.logoUrl}
                      alt="Company Logo"
                      fill
                      className="object-contain"
                      unoptimized
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleDeleteLogo}
                    className="text-destructive hover:text-destructive"
                  >
                    <X className="mr-2 h-4 w-4" />
                    Remove Logo
                  </Button>
                  <Label htmlFor="logo-upload" className="cursor-pointer">
                    <Button variant="outline" asChild>
                      <span>
                        <Upload className="mr-2 h-4 w-4" />
                        Replace Logo
                      </span>
                    </Button>
                  </Label>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-sm text-muted-foreground mb-4">
                    No logo uploaded. Click below to upload your company logo.
                  </p>
                  <Label htmlFor="logo-upload" className="cursor-pointer">
                    <Button variant="outline" asChild disabled={uploading}>
                      <span>
                        {uploading ? 'Uploading...' : 'Upload Logo'}
                      </span>
                    </Button>
                  </Label>
                </div>
              </div>
            )}
            <Input
              id="logo-upload"
              type="file"
              accept="image/jpeg,image/png,image/gif"
              onChange={handleLogoUpload}
              className="hidden"
            />
            <div className="flex items-center space-x-2 pt-2">
              <Switch
                id="show-logo"
                checked={settings.showLogoInReports}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, showLogoInReports: checked })
                }
              />
              <Label htmlFor="show-logo" className="cursor-pointer">
                Show logo in PDF reports
              </Label>
            </div>
          </CardContent>
        </Card>

        {/* Header Customization Card */}
        <Card>
          <CardHeader>
            <CardTitle>Report Header</CardTitle>
            <CardDescription>
              Customize the header text and color for your PDF reports
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="header-text">Header Text</Label>
              <Input
                id="header-text"
                value={settings.reportHeaderText}
                onChange={(e) =>
                  setSettings({ ...settings, reportHeaderText: e.target.value })
                }
                placeholder="INDIAN RAILWAY"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to use default: "INDIAN RAILWAY"
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="header-color">Header Color</Label>
              <div className="flex gap-2">
                <Input
                  id="header-color"
                  type="color"
                  value={settings.reportHeaderColor}
                  onChange={(e) =>
                    setSettings({ ...settings, reportHeaderColor: e.target.value })
                  }
                  className="w-20 h-10"
                />
                <Input
                  value={settings.reportHeaderColor}
                  onChange={(e) =>
                    setSettings({ ...settings, reportHeaderColor: e.target.value })
                  }
                  placeholder="#000000"
                  className="flex-1"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer Customization Card */}
        <Card>
          <CardHeader>
            <CardTitle>Report Footer</CardTitle>
            <CardDescription>
              Add custom footer text to your PDF reports (optional)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="footer-text">Footer Text</Label>
              <Textarea
                id="footer-text"
                value={settings.reportFooterText}
                onChange={(e) =>
                  setSettings({ ...settings, reportFooterText: e.target.value })
                }
                placeholder="Enter custom footer text (optional)"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                This text will appear at the bottom of each page in your reports
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Preview Card */}
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>
              Preview how your branding will look in reports
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg p-6 bg-white">
              <div className="space-y-4">
                {settings.showLogoInReports && settings.logoUrl && (
                  <div className="flex justify-center">
                    <div className="relative w-48 h-20">
                      <Image
                        src={settings.logoUrl}
                        alt="Company Logo Preview"
                        fill
                        className="object-contain"
                        unoptimized
                      />
                    </div>
                  </div>
                )}
                <div
                  className="text-center text-2xl font-bold"
                  style={{ color: settings.reportHeaderColor }}
                >
                  {settings.reportHeaderText || 'INDIAN RAILWAY'}
                </div>
                <div className="text-center text-lg">
                  PRICE VARIATION CALCULATION (PVC) REPORT
                </div>
                <div className="border-t-2 my-4"></div>
                <div className="text-center text-sm text-muted-foreground">
                  [Report Content Here]
                </div>
                {settings.reportFooterText && (
                  <>
                    <div className="border-t my-4"></div>
                    <div className="text-center text-xs text-muted-foreground">
                      {settings.reportFooterText}
                    </div>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end gap-2">
          <Button onClick={() => router.push('/')} variant="outline">
            Cancel
          </Button>
          <Button onClick={handleSaveSettings} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>
    </div>
  );
}
