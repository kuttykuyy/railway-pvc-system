'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TryBillForm } from '@/try-bill/components/try-bill-form';
import { PreviewCard } from '@/try-bill/components/preview-card';
import type { GuestBillDraft, GuestPreviewResult } from '@/try-bill/types';
import { GUEST_DRAFT_STORAGE_KEY } from '@/try-bill/types';
import { toast } from 'react-hot-toast';

export default function TryBillPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<Partial<GuestBillDraft>>({});
  const [preview, setPreview] = useState<GuestPreviewResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(GUEST_DRAFT_STORAGE_KEY);
      if (saved) {
        setDraft(JSON.parse(saved));
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  const handleSubmit = async (values: GuestBillDraft) => {
    setIsLoading(true);
    setPreview(null);

    try {
      const response = await fetch('/api/try-bill/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || 'Failed to calculate preview');
        return;
      }

      setPreview(data.preview);
      localStorage.setItem(GUEST_DRAFT_STORAGE_KEY, JSON.stringify(values));
    } catch (error) {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = () => {
    const saved = localStorage.getItem(GUEST_DRAFT_STORAGE_KEY);
    if (saved) {
      router.push(`/auth/signup?tryBillDraft=local:${encodeURIComponent(saved)}`);
    } else {
      router.push('/auth/signup');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-slate-900">Try IR-PVC for free</h1>
          <p className="text-slate-600">
            Enter a few details and see your PVC calculation instantly. Sign up only when you want to download the PDF.
          </p>
        </div>
        <TryBillForm initialDraft={draft} onSubmit={handleSubmit} isLoading={isLoading} />
        {preview && <PreviewCard preview={preview} onSignup={handleSignup} />}
      </div>
    </div>
  );
}
