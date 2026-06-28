'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, Clock3, Gift, Loader2, Star, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface Submission {
  platform: string;
  reviewText: string;
  proofUrl: string;
  status: 'pending' | 'approved' | 'rejected';
  rewardAmount: number | null;
  submittedAt: string;
  rejectionReason: string | null;
}

export default function ReviewRewardPage() {
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [platform, setPlatform] = useState('google');
  const [reviewText, setReviewText] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadSubmission = async () => {
    try {
      const response = await fetch('/api/review-reward');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load review reward');
      setSubmission(data.submission);
      if (data.submission?.status === 'rejected') {
        setPlatform(data.submission.platform);
        setReviewText(data.submission.reviewText);
        setProofUrl(data.submission.proofUrl);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load review reward');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubmission();
  }, []);

  const submitReview = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await fetch('/api/review-reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, reviewText, proofUrl }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to submit review');
      setSubmission(data.submission);
      toast.success('Review submitted for approval');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }

  const locked = submission?.status === 'pending' || submission?.status === 'approved';

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <header className="border-b border-slate-200 pb-6">
        <div className="flex items-center gap-3">
          <Gift className="h-7 w-7 text-emerald-600" />
          <h1 className="text-2xl font-bold text-slate-900">Review Reward</h1>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Publish an honest review, submit the public link or screenshot proof, and receive one free bill credit after approval.
        </p>
      </header>

      {submission && (
        <section className="border-b border-slate-200 py-6">
          {submission.status === 'pending' && (
            <div className="flex gap-3 bg-amber-50 p-4 text-amber-900">
              <Clock3 className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Awaiting admin approval</p>
                <p className="mt-1 text-sm">Your proof has been submitted. Credit is issued only after verification.</p>
              </div>
            </div>
          )}
          {submission.status === 'approved' && (
            <div className="flex gap-3 bg-emerald-50 p-4 text-emerald-900">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Reward approved</p>
                <p className="mt-1 text-sm">
                  Rs. {submission.rewardAmount?.toLocaleString('en-IN')} has been added to your wallet.
                </p>
              </div>
            </div>
          )}
          {submission.status === 'rejected' && (
            <div className="flex gap-3 bg-red-50 p-4 text-red-900">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Proof needs correction</p>
                <p className="mt-1 text-sm">{submission.rejectionReason || 'Please update and resubmit your proof.'}</p>
              </div>
            </div>
          )}
        </section>
      )}

      <form onSubmit={submitReview} className="space-y-5 py-6">
        <div className="space-y-2">
          <Label htmlFor="platform">Review platform</Label>
          <Select value={platform} onValueChange={setPlatform} disabled={locked}>
            <SelectTrigger id="platform">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="google">Google</SelectItem>
              <SelectItem value="facebook">Facebook</SelectItem>
              <SelectItem value="linkedin">LinkedIn</SelectItem>
              <SelectItem value="other">Other public platform</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reviewText">Review text</Label>
          <Textarea
            id="reviewText"
            value={reviewText}
            onChange={(event) => setReviewText(event.target.value)}
            placeholder="Paste the review you published..."
            rows={6}
            minLength={20}
            maxLength={2000}
            required
            disabled={locked}
          />
          <p className="text-xs text-slate-500">{reviewText.length}/2,000 characters</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="proofUrl">Public review or screenshot URL</Label>
          <Input
            id="proofUrl"
            type="url"
            value={proofUrl}
            onChange={(event) => setProofUrl(event.target.value)}
            placeholder="https://..."
            required
            disabled={locked}
          />
        </div>

        {!locked && (
          <Button type="submit" disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Star className="mr-2 h-4 w-4" />}
            {submission?.status === 'rejected' ? 'Resubmit Proof' : 'Submit for Approval'}
          </Button>
        )}
      </form>

      <footer className="border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500">
        One reward per account. Reviews must be genuine and publicly verifiable. Duplicate, removed, or misleading submissions can be rejected.
      </footer>
    </main>
  );
}
