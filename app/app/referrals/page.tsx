'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Check,
  Copy,
  Gift,
  IndianRupee,
  MessageCircle,
  Send,
  UserPlus,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ReferralData {
  referralCode: string;
  referralLink: string;
  rules: {
    reward: number;
    minimumTopup: number;
    monthlyLimit: number;
  };
  stats: {
    totalInvited: number;
    pending: number;
    rewarded: number;
    rejected: number;
    totalEarned: number;
    rewardedThisMonth: number;
  };
  referrals: Array<{
    id: string;
    name: string;
    email: string;
    status: string;
    joinedAt: string;
    rewardedAt: string | null;
    reward: number;
    rejectionReason: string | null;
  }>;
}

const currency = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);

export default function ReferralsPage() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/referrals')
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Failed to load referrals');
        setData(payload);
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to load referrals');
      })
      .finally(() => setLoading(false));
  }, []);

  const copyLink = async () => {
    if (!data) return;
    await navigator.clipboard.writeText(data.referralLink);
    setCopied(true);
    toast.success('Referral link copied');
    window.setTimeout(() => setCopied(false), 2000);
  };

  const shareWhatsApp = () => {
    if (!data) return;
    const message = [
      'Create your IR-PVC contractor account using my referral link.',
      `After your first ${currency(data.rules.minimumTopup)} top-up, both accounts receive ${currency(data.rules.reward)} credit.`,
      data.referralLink,
    ].join('\n\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-sm text-red-600">Referral information could not be loaded.</p>
      </div>
    );
  }

  const statusBadge = (status: string) => {
    if (status === 'rewarded') return <Badge className="bg-emerald-600">Rewarded</Badge>;
    if (status === 'rejected') return <Badge variant="destructive">Not eligible</Badge>;
    return <Badge variant="secondary">Pending top-up</Badge>;
  };

  return (
    <main className="mx-auto max-w-6xl space-y-7 px-4 py-8 sm:px-6">
      <header>
        <div className="flex items-center gap-3">
          <Gift className="h-7 w-7 text-emerald-600" />
          <h1 className="text-2xl font-bold text-slate-900">Referral Program</h1>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Invite a contractor. After their first qualifying top-up, both accounts receive one bill credit.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium text-slate-500">Invited</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{data.stats.totalInvited}</p>
            </div>
            <Users className="h-5 w-5 text-emerald-600" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium text-slate-500">Pending</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{data.stats.pending}</p>
            </div>
            <UserPlus className="h-5 w-5 text-amber-600" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium text-slate-500">Rewarded</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{data.stats.rewarded}</p>
            </div>
            <Check className="h-5 w-5 text-emerald-600" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium text-slate-500">Credits Earned</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{currency(data.stats.totalEarned)}</p>
            </div>
            <IndianRupee className="h-5 w-5 text-emerald-600" />
          </CardContent>
        </Card>
      </section>

      <section className="border-y border-slate-200 py-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Your referral link</h2>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input value={data.referralLink} readOnly className="font-mono text-xs" />
              <Button onClick={copyLink} variant="outline" className="shrink-0">
                {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button onClick={shareWhatsApp} className="shrink-0 bg-emerald-600 hover:bg-emerald-700">
                <MessageCircle className="mr-2 h-4 w-4" />
                WhatsApp
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Referral code: <span className="font-mono font-semibold text-slate-800">{data.referralCode}</span>
            </p>
          </div>

          <div className="border-l-0 border-slate-200 lg:border-l lg:pl-6">
            <h2 className="text-base font-semibold text-slate-900">Qualification rules</h2>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <p>Minimum first qualifying top-up: <strong>{currency(data.rules.minimumTopup)}</strong></p>
              <p>Reward to each account: <strong>{currency(data.rules.reward)}</strong></p>
              <p>
                Monthly limit: <strong>{data.stats.rewardedThisMonth}/{data.rules.monthlyLimit}</strong> rewarded referrals
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Send className="h-4 w-4 text-slate-500" />
          <h2 className="text-base font-semibold text-slate-900">Referral history</h2>
        </div>

        {data.referrals.length === 0 ? (
          <div className="border-y border-dashed border-slate-300 py-10 text-center">
            <p className="text-sm font-medium text-slate-700">No referrals yet</p>
            <p className="mt-1 text-xs text-slate-500">Share your link to invite another contractor.</p>
          </div>
        ) : (
          <div className="overflow-x-auto border-y border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Contractor</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Reward</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.referrals.map((referral) => (
                  <tr key={referral.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{referral.name}</p>
                      <p className="text-xs text-slate-500">{referral.email}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(referral.joinedAt).toLocaleDateString('en-IN')}
                    </td>
                    <td className="px-4 py-3">{statusBadge(referral.status)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {referral.reward ? currency(referral.reward) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
