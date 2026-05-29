
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BackButton } from '@/components/ui/back-button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'react-hot-toast';
import { KeyRound, User, Mail, Calendar, Shield, Loader2, Key, Clock, AlertTriangle, Settings } from 'lucide-react';
import { format } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';
import { RailwayPostingForm } from '@/components/railway-posting-form';

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [changingPassword, setChangingPassword] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      fetchUserData();
    }
  }, [status, router]);

  const fetchUserData = async () => {
    try {
      const response = await fetch('/api/auth/profile');
      if (!response.ok) throw new Error('Failed to fetch user data');
      const data = await response.json();
      setUserData(data);
      setPhoneNumber(data.phone || '');
    } catch (error) {
      console.error('Error fetching user data:', error);
      toast.error('Failed to load user data');
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneUpdate = async () => {
    // Validate phone number format
    const phoneRegex = /^\+[1-9]\d{9,14}$/;
    if (phoneNumber && !phoneRegex.test(phoneNumber)) {
      toast.error('Please enter a valid phone number with country code (e.g., +919876543210)');
      return;
    }

    setSavingPhone(true);
    try {
      const response = await fetch('/api/user/update-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneNumber }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update phone number');
      }

      toast.success('Phone number updated successfully');
      setEditingPhone(false);
      await fetchUserData();
    } catch (error: any) {
      console.error('Error updating phone:', error);
      toast.error(error.message || 'Failed to update phone number');
    } finally {
      setSavingPhone(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (passwords.newPassword !== passwords.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    if (passwords.newPassword.length < 6) {
      toast.error('New password must be at least 6 characters long');
      return;
    }

    setChangingPassword(true);
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwords.currentPassword,
          newPassword: passwords.newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to change password');
      }

      toast.success('Password changed successfully');
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error: any) {
      console.error('Error changing password:', error);
      toast.error(error.message || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-6">
        <BackButton href="/dashboard" className="mb-4" />
        <h1 className="text-3xl font-bold">Profile & Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your account information, security, and report branding
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="branding" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Branding
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          {/* User Information Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Account Information
              </CardTitle>
              <CardDescription>
                Your personal account details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                  <User className="h-5 w-5 mt-0.5 text-muted-foreground" />
                  <div className="flex-1">
                    <Label className="text-sm font-medium">Full Name</Label>
                    <p className="text-base mt-1">{userData?.name || 'Not provided'}</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                  <Mail className="h-5 w-5 mt-0.5 text-muted-foreground" />
                  <div className="flex-1">
                    <Label className="text-sm font-medium">Email Address</Label>
                    <p className="text-base mt-1">{userData?.email}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                  <Shield className="h-5 w-5 mt-0.5 text-muted-foreground" />
                  <div className="flex-1">
                    <Label className="text-sm font-medium">Account Role</Label>
                    <p className="text-base mt-1 capitalize">{userData?.role || 'user'}</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                  <Calendar className="h-5 w-5 mt-0.5 text-muted-foreground" />
                  <div className="flex-1">
                    <Label className="text-sm font-medium">Member Since</Label>
                    <p className="text-base mt-1">
                      {userData?.createdAt ? format(toISTDate(new Date(userData.createdAt)), 'MMMM dd, yyyy') : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Phone Number & WhatsApp Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                📱 Phone Number & WhatsApp
              </CardTitle>
              <CardDescription>
                Add your phone number to receive WhatsApp notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!editingPhone ? (
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div className="flex-1">
                    <Label className="text-sm font-medium">Phone Number</Label>
                    <p className="text-base mt-1">
                      {userData?.phone || 'Not provided'}
                    </p>
                    {userData?.phone && (
                      <p className="text-xs text-muted-foreground mt-1">
                        ✅ WhatsApp notifications enabled
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setEditingPhone(true)}
                  >
                    {userData?.phone ? 'Update' : 'Add Phone'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phoneNumber">Phone Number with Country Code</Label>
                    <Input
                      id="phoneNumber"
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+919876543210"
                    />
                    <p className="text-xs text-muted-foreground">
                      Format: +[country code][phone number] (e.g., +919876543210 for India)
                    </p>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditingPhone(false);
                        setPhoneNumber(userData?.phone || '');
                      }}
                      disabled={savingPhone}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handlePhoneUpdate}
                      disabled={savingPhone}
                    >
                      {savingPhone ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save Phone Number'
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {userData?.phone && (
                <Alert>
                  <AlertDescription>
                    💬 You'll receive WhatsApp notifications for:
                    <ul className="list-disc list-inside mt-2 text-sm space-y-1">
                      <li>New bill creation</li>
                      <li>Bill approvals and updates</li>
                      <li>Contract updates</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-medium text-sm mb-2">📱 Interactive Commands</h4>
                <p className="text-sm text-gray-600 mb-2">
                  Send these commands via WhatsApp:
                </p>
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                  <li><code>help</code> - Show available commands</li>
                  <li><code>status</code> - Check your account status</li>
                  <li><code>bills</code> - View recent bills</li>
                  <li><code>contracts</code> - View your contracts</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Railway Posting Details (only for railway officials) */}
          {userData?.role === 'railway_official' && (
            <RailwayPostingForm userData={userData} onUpdate={fetchUserData} />
          )}
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          {/* Security Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Security Status</CardTitle>
              <CardDescription>Overview of your account security</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                  <Key className="h-8 w-8 text-blue-500 flex-shrink-0" />
                  <div>
                    <div className="font-medium text-sm">Password</div>
                    <div className="text-xs text-gray-600">
                      Strong encryption
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                  <Clock className="h-8 w-8 text-purple-500 flex-shrink-0" />
                  <div>
                    <div className="font-medium text-sm">Session Timeout</div>
                    <div className="text-xs text-gray-600">
                      30 minutes
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Password Change Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                Change Password
              </CardTitle>
              <CardDescription>
                Update your password to keep your account secure
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={passwords.currentPassword}
                    onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
                    required
                    placeholder="Enter your current password"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={passwords.newPassword}
                    onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                    required
                    placeholder="Enter your new password"
                    minLength={6}
                  />
                  <p className="text-xs text-muted-foreground">
                    Password must be at least 6 characters long
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={passwords.confirmPassword}
                    onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                    required
                    placeholder="Confirm your new password"
                    minLength={6}
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' })}
                    disabled={changingPassword}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={changingPassword}>
                    {changingPassword ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Changing Password...
                      </>
                    ) : (
                      'Change Password'
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Password Security */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5 text-blue-600" />
                Password Requirements
              </CardTitle>
              <CardDescription>
                Keep your password strong and secure
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Your password should include:</h4>
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                  <li>Minimum 8 characters</li>
                  <li>At least one uppercase letter</li>
                  <li>At least one lowercase letter</li>
                  <li>At least one number</li>
                  <li>At least one special character</li>
                </ul>
              </div>

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Change your password regularly and never share it with anyone. Avoid using the
                  same password across multiple services.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Session Security */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" />
                Session Security
              </CardTitle>
              <CardDescription>
                Automatic session timeout for your protection
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium">Session Timeout</div>
                  <div className="text-sm text-gray-600">
                    You'll be automatically logged out after 30 minutes of inactivity
                  </div>
                </div>
                <Badge>Active</Badge>
              </div>

              <p className="text-sm text-gray-600">
                For your security, you'll receive a warning 5 minutes before your session expires
                due to inactivity. Any activity will extend your session.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Branding Tab */}
        <TabsContent value="branding" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Report Branding
              </CardTitle>
              <CardDescription>
                Customize how your PVC reports look with your company logo and branding
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium">Report Branding Settings</p>
                  <p className="text-sm text-muted-foreground">
                    Customize company logo, header, and footer for PDF reports
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => router.push('/settings')}
                >
                  Configure Branding
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
