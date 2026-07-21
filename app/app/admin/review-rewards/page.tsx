'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, ExternalLink, Gift, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface Submission {
  id: string;
  platform: string;
  reviewText: string;
  proofUrl: string;
  status: string;
  rewardAmount: number | null;
  submittedAt: string;
  rejectionReason: string | null;
  user: {
    name: string | null;
    email: string;
    phone: string | null;
    customerAccount: { creditBalance: number } | null;
  };
}

export default function AdminReviewRewardsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [status, setStatus] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});

  const loadSubmissions = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/review-rewards?status=${status}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load review submissions');
      setSubmissions(data.submissions || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load review submissions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubmissions();
  }, [status]);

  const updateSubmission = async (id: string, action: 'approve' | 'reject') => {
    setProcessingId(id);
    try {
      const response = await fetch(`/api/admin/review-rewards/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          rejectionReason: rejectionReasons[id] || '',
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update submission');
      toast.success(action === 'approve' ? `Approved. Rs. ${data.rewardAmount} credited.` : 'Submission rejected');
      await loadSubmissions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update submission');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Gift className="h-6 w-6 text-emerald-600" />
            <h1 className="text-2xl font-bold text-slate-900">Review Rewards</h1>
          </div>
          <p className="mt-1 text-sm text-slate-600">Verify public review proof before issuing one bill credit.</p>
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="all">All submissions</SelectItem>
          </SelectContent>
        </Select>
      </header>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : submissions.length === 0 ? (
        <div className="border-b border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">
          No {status === 'all' ? '' : status} review submissions found.
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {submissions.map((submission) => (
            <article key={submission.id} className="grid gap-5 py-6 lg:grid-cols-[220px_1fr_280px]">
              <div>
                <p className="font-semibold text-slate-900">{submission.user.name || 'Unnamed user'}</p>
                <p className="mt-1 text-xs text-slate-500">{submission.user.email}</p>
                <p className="text-xs text-slate-500">{submission.user.phone || 'No phone'}</p>
                <p className="mt-2 text-xs text-slate-500">
                  Wallet: Rs. {(submission.user.customerAccount?.creditBalance || 0).toLocaleString('en-IN')}
                </p>
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="capitalize">{submission.platform}</Badge>
                  <Badge variant={submission.status === 'rejected' ? 'destructive' : 'secondary'} className="capitalize">
                    {submission.status}
                  </Badge>
                  <span className="text-xs text-slate-500">
                    {new Date(submission.submittedAt).toLocaleString('en-IN')}
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{submission.reviewText}</p>
                <a
                  href={submission.proofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center text-sm font-medium text-emerald-700 hover:underline"
                >
                  Open proof <ExternalLink className="ml-1 h-3.5 w-3.5" />
                </a>
                {submission.rejectionReason && (
                  <p className="mt-3 text-sm text-red-700">Reason: {submission.rejectionReason}</p>
                )}
              </div>

              <div>
                {submission.status === 'pending' ? (
                  <div className="space-y-3">
                    <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                      disabled={processingId === submission.id}
                      onClick={() => updateSubmission(submission.id, 'approve')}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Approve and Credit
                    </Button>
                    <Input
                      value={rejectionReasons[submission.id] || ''}
                      onChange={(event) =>
                        setRejectionReasons((current) => ({
                          ...current,
                          [submission.id]: event.target.value,
                        }))
                      }
                      placeholder="Reason for rejection"
                    />
                    <Button
                      variant="outline"
                      className="w-full text-red-700"
                      disabled={processingId === submission.id}
                      onClick={() => updateSubmission(submission.id, 'reject')}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">
                    {submission.status === 'approved'
                      ? `Reward: Rs. ${(submission.rewardAmount || 0).toLocaleString('en-IN')}`
                      : 'No credit issued'}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
