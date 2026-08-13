'use client';

/**
 * Where a new user lands after signing up: two uploads, one result.
 *
 * Upload the LOA or agreement, upload the signed bill, and the finished PVC report
 * arrives — no contract form, no bill form, no screens in between. The agreement upload
 * here reads the PDF and creates the contract in one motion; the bill upload hands over
 * to the bill page's instant mode, which reads, saves and opens the report itself.
 *
 * When a PDF will not read, the way out is always visible: try another file, or type it
 * in on the ordinary forms. Nothing is lost on failure — account and free bills stay.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileUp, Receipt, CheckCircle2, ArrowRight, Loader2, AlertTriangle } from 'lucide-react';
import { normalizeSchedules } from '@/lib/contract-schedules';
import { shortScheduleName } from '@/lib/bill-schedule-matching';

type AgreementStage =
  | { step: 'idle' }
  | { step: 'reading' }
  | { step: 'saving' }
  | { step: 'done'; agreementNo: string }
  | { step: 'failed'; message: string };

export default function WelcomePage() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [hasContract, setHasContract] = useState<boolean | null>(null);
  const [hasBill, setHasBill] = useState(false);
  const [agreement, setAgreement] = useState<AgreementStage>({ step: 'idle' });

  useEffect(() => {
    (async () => {
      try {
        const [contractsRes, billsRes] = await Promise.all([fetch('/api/contracts'), fetch('/api/bills')]);
        if (contractsRes.status === 401) {
          router.replace('/auth/signin');
          return;
        }
        const contracts = await contractsRes.json().catch(() => null);
        const bills = await billsRes.json().catch(() => null);
        const contractList = Array.isArray(contracts) ? contracts : contracts?.contracts || [];
        const billList = Array.isArray(bills) ? bills : bills?.bills || [];
        setHasContract(contractList.length > 0);
        setHasBill(billList.length > 0);
      } catch {
        // Never strand someone because a count could not be fetched.
        setHasContract(false);
      }
    })();
  }, [router]);

  // Someone with a bill already has what this page produces.
  useEffect(() => {
    if (hasContract && hasBill) router.replace('/bills');
  }, [hasContract, hasBill, router]);

  /**
   * Read the agreement and create the contract, with nothing to review in between.
   *
   * The same two calls the contract form makes, joined: extraction fills what a person
   * would have typed, and what it read is saved as-is. The form's review step exists for
   * correcting a bad read — here the correction path is the Edit button on the contract,
   * which the app already has, rather than a form standing in front of every new user.
   */
  const handleAgreementFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      setAgreement({ step: 'failed', message: 'Please choose a PDF file.' });
      return;
    }
    setAgreement({ step: 'reading' });
    try {
      const body = new FormData();
      body.append('file', file, file.name);
      const extractRes = await fetch('/api/contracts/extract-agreement', { method: 'POST', body });
      const extracted = await extractRes.json().catch(() => ({}));
      if (!extractRes.ok || !extracted.data) {
        setAgreement({ step: 'failed', message: extracted.error || 'The agreement could not be read.' });
        return;
      }
      const d = extracted.data;

      setAgreement({ step: 'saving' });
      const createRes = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agreementNo: d.agreementNo || '',
          loaNo: d.loaNo || null,
          loaDate: d.loaDate || null,
          contractorName: d.contractorName || '',
          contractorPhone: d.contractorPhone || null,
          workDescription: d.workDescription || '',
          dateOfOpening: d.dateOfOpening || null,
          tenderAdvertisedValue: d.tenderAdvertisedValue ?? null,
          contractValue: d.agreementAmount ?? null,
          completionPeriodMonths: d.completionPeriodMonths ?? null,
          rebatePercentage: typeof d.rebatePercentage === 'number' ? d.rebatePercentage : null,
          schedules: Array.isArray(d.schedules) && d.schedules.length
            ? normalizeSchedules(d.schedules).map(s => ({ ...s, name: shortScheduleName(s.name) }))
            : [],
          createdVia: 'pdf',
        }),
      });
      const created = await createRes.json().catch(() => ({}));
      if (!createRes.ok) {
        setAgreement({
          step: 'failed',
          message: created.error
            ? `The agreement was read, but the contract could not be saved: ${created.error}`
            : 'The agreement was read, but the contract could not be saved.',
        });
        return;
      }
      setAgreement({ step: 'done', agreementNo: created.agreementNo || d.agreementNo || d.loaNo || 'your contract' });
      setHasContract(true);
    } catch {
      setAgreement({ step: 'failed', message: 'The upload failed. Check the connection and try again.' });
    }
  };

  if (hasContract === null) {
    return (
      <div className="p-8 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Getting things ready…
      </div>
    );
  }

  const agreementBusy = agreement.step === 'reading' || agreement.step === 'saving';
  const agreementDone = hasContract || agreement.step === 'done';

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto space-y-6">
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (e.target) e.target.value = '';
          if (file) handleAgreementFile(file);
        }}
      />

      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Get your PVC report in two uploads</h1>
        <p className="text-muted-foreground">
          Upload the agreement, upload the bill, and the finished report is yours. Your first bills are free.
        </p>
      </div>

      {/* Step 1 — the agreement, read and saved in one motion. */}
      <Card className={agreementDone ? 'border-emerald-300 bg-emerald-50/50' : 'border-emerald-400 border-2'}>
        <CardContent className="pt-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                {agreementDone
                  ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  : <span className="h-6 w-6 rounded-full bg-emerald-600 text-white text-xs grid place-items-center font-bold">1</span>}
                <h2 className="font-semibold">Upload the LOA or agreement</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {agreement.step === 'done'
                  ? `Done — ${agreement.agreementNo} is in.`
                  : agreementDone
                    ? 'Done — your contract is in.'
                    : 'It reads the agreement number, tender date, schedules and rates by itself.'}
              </p>
            </div>
            <Button
              onClick={() => fileInput.current?.click()}
              disabled={agreementBusy}
              variant={agreementDone ? 'outline' : 'default'}
            >
              {agreementBusy
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{agreement.step === 'reading' ? 'Reading…' : 'Saving…'}</>
                : <><FileUp className="h-4 w-4 mr-2" />{agreementDone ? 'Add another' : 'Choose PDF'}</>}
            </Button>
          </div>

          {agreement.step === 'failed' && (
            <div className="border border-red-300 bg-red-50 rounded-md p-3 space-y-2">
              <p className="text-sm text-red-800 flex gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                {agreement.message}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
                  Try another PDF
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/contracts/new">Type it in instead</Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2 — the bill. The bill page's instant mode reads it, saves it and opens
          the report; this page only needs to send them there. */}
      <Card className={agreementDone ? 'border-emerald-400 border-2' : ''}>
        <CardContent className="pt-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className={`h-6 w-6 rounded-full text-xs grid place-items-center font-bold ${
                agreementDone ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
              }`}>2</span>
              <h2 className="font-semibold">Upload the signed bill</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              It reads every item, checks the total against the bill&apos;s own figure, and hands you the
              report.
            </p>
          </div>
          <Button asChild variant={agreementDone ? 'default' : 'outline'}>
            <Link href="/bills/new?instant=1">
              <Receipt className="h-4 w-4 mr-2" />
              Upload bill
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm pt-2">
        <Link href="/try-bill" className="text-emerald-700 hover:underline font-medium inline-flex items-center gap-1">
          See a worked example first <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link href="/contracts" className="text-muted-foreground hover:underline">
          I&apos;ll do this later
        </Link>
      </div>

      <p className="text-xs text-muted-foreground border-t pt-4">
        If a PDF will not read, nothing is lost — your account and your free bills stay exactly as they
        are, and you can type the details in instead.
      </p>
    </div>
  );
}
