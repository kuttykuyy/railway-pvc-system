'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'react-hot-toast';
import { KeyRound, User, Mail, Calendar, Shield, Loader2, Settings, MessageSquare } from 'lucide-react';
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
          <Loader2 className="h-12 w-12 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-slate-500 text-sm font-medium">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="mb-8">
        <BackButton href="/dashboard" className="mb-4" />
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
          <User className="h-8 w-8 text-purple-600" />
          Profile & Settings
        </h1>
        <p className="text-slate-500 mt-1.5">
          Manage your personal account details, security credentials, and WhatsApp configurations.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Account Details & WhatsApp */}
        <div className="lg:col-span-7 space-y-6">
          {/* Account Information Card */}
          <Card className="border border-slate-100 shadow-sm bg-white rounded-2xl overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-5">
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <User className="h-5 w-5 text-purple-600" />
                Account Information
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Your personal account details
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Full Name</span>
                  <span className="font-semibold text-slate-800 text-sm">{userData?.name || 'Not provided'}</span>
                </div>
                
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Email Address</span>
                  <span className="font-semibold text-slate-800 text-sm break-all">{userData?.email}</span>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Account Role</span>
                  <span className="font-semibold text-slate-800 text-sm capitalize">{userData?.role || 'user'}</span>
                </div>
                
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Member Since</span>
                  <span className="font-semibold text-slate-800 text-sm">
                    {userData?.createdAt ? format(toISTDate(new Date(userData.createdAt)), 'MMMM dd, yyyy') : 'N/A'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Phone Number & WhatsApp Card */}
          <Card className="border border-slate-100 shadow-sm bg-white rounded-2xl overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-5">
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                📱 Phone Number & WhatsApp
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Link your phone to receive automated dispatch alerts and interact with the AI chat bot
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              {!editingPhone ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-xl gap-4">
                  <div className="flex-1">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Registered Phone</span>
                    <span className="font-bold text-slate-800 text-base">
                      {userData?.phone || 'Not provided'}
                    </span>
                    {userData?.phone && (
                      <span className="text-xs text-green-600 block mt-1 font-semibold">
                        ✓ WhatsApp Notifications Active
                      </span>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setEditingPhone(true)}
                    className="border-slate-200 text-slate-600 bg-white hover:bg-slate-50 h-9 rounded-xl text-xs font-semibold shrink-0"
                  >
                    {userData?.phone ? 'Update Number' : 'Add Phone'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 p-4 border border-purple-100 rounded-xl bg-purple-50/20">
                  <div className="space-y-2">
                    <Label htmlFor="phoneNumber" className="text-sm font-semibold text-slate-700">Phone Number with Country Code</Label>
                    <Input
                      id="phoneNumber"
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+919876543210"
                      className="bg-white rounded-xl h-10 border-slate-200"
                    />
                    <p className="text-[11px] text-slate-500 leading-normal">
                      Must start with + and include country code (e.g., +919876543210 for India)
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
                      className="border-slate-200 text-slate-600 bg-white h-9 text-xs rounded-xl"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handlePhoneUpdate}
                      disabled={savingPhone}
                      className="bg-purple-600 hover:bg-purple-700 text-white h-9 text-xs rounded-xl"
                    >
                      {savingPhone ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
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
                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-600 space-y-2 leading-relaxed">
                  <p className="font-semibold text-slate-700">💬 Active WhatsApp Alerts:</p>
                  <ul className="list-disc list-inside space-y-1 pl-1 text-[11px]">
                    <li>Instant notifications when a new PVC bill is processed</li>
                    <li>Official approvals, remarks, and audit trail updates</li>
                    <li>Milestone completions and contract revisions</li>
                  </ul>
                </div>
              )}

              <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl">
                <h4 className="font-bold text-blue-900 text-sm flex items-center gap-1.5 mb-1.5">
                  <MessageSquare className="h-4 w-4 text-blue-600" />
                  WhatsApp Assistant Commands
                </h4>
                <p className="text-xs text-blue-700 leading-relaxed mb-3">
                  You can text the system's registered WhatsApp number to fetch real-time data:
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white p-2.5 rounded-lg border border-blue-50">
                    <code className="text-purple-600 font-bold">help</code>
                    <span className="text-slate-500 block mt-0.5 text-[10px]">Show commands list</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-blue-50">
                    <code className="text-purple-600 font-bold">status</code>
                    <span className="text-slate-500 block mt-0.5 text-[10px]">Check credit details</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-blue-50">
                    <code className="text-purple-600 font-bold">bills</code>
                    <span className="text-slate-500 block mt-0.5 text-[10px]">List recent PVC bills</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-blue-50">
                    <code className="text-purple-600 font-bold">contracts</code>
                    <span className="text-slate-500 block mt-0.5 text-[10px]">List active projects</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Railway Posting Details (only for railway officials) */}
          {userData?.role === 'railway_official' && (
            <RailwayPostingForm userData={userData} onUpdate={fetchUserData} />
          )}
        </div>

        {/* Right Column: Password Change & Branding Settings */}
        <div className="lg:col-span-5 space-y-6">
          {/* Password Change Card */}
          <Card className="border border-slate-100 shadow-sm bg-white rounded-2xl overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-5">
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-purple-600" />
                Change Password
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Update your login credentials regularly to keep your account secure
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              <form onSubmit={handlePasswordChange} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="currentPassword" className="text-xs font-semibold text-slate-700">Current Password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={passwords.currentPassword}
                    onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
                    required
                    placeholder="Enter current password"
                    className="bg-white h-10 rounded-xl border-slate-200"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <Label htmlFor="newPassword" className="text-xs font-semibold text-slate-700">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={passwords.newPassword}
                    onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                    required
                    placeholder="Min 6 characters"
                    className="bg-white h-10 rounded-xl border-slate-200"
                    minLength={6}
                  />
                </div>
                
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-xs font-semibold text-slate-700">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={passwords.confirmPassword}
                    onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                    required
                    placeholder="Re-enter new password"
                    className="bg-white h-10 rounded-xl border-slate-200"
                    minLength={6}
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' })}
                    disabled={changingPassword}
                    className="border-slate-200 text-slate-600 bg-white h-9 text-xs rounded-xl"
                  >
                    Reset Form
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={changingPassword}
                    className="bg-purple-600 hover:bg-purple-700 text-white h-9 text-xs rounded-xl"
                  >
                    {changingPassword ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Changing...
                      </>
                    ) : (
                      'Update Password'
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Report Branding Settings Card */}
          <Card className="border border-slate-100 shadow-sm bg-white rounded-2xl overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-5">
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Settings className="h-5 w-5 text-purple-600" />
                Report Branding
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Branding configurations for generated PDF abstracts
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                Add your company logo, official letterhead headers, and regulatory footer clauses to be automatically embedded in your generated PDF abstract reports.
              </p>
              <Button
                onClick={() => router.push('/settings')}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-xl h-10 font-semibold text-xs"
              >
                Configure Branding Settings
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
