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
  /**
   * The one thing typed by hand. An LOA usually carries no agreement number — it is
   * issued weeks before the agreement is signed — and the bill will name one, so a
   * contract saved without it cannot be matched to its own bills and the instant flow
   * stalls at "select a contract". Asked here, once, pre-filled when the PDF had it.
   */
  | { step: 'confirm'; extracted: any; agreementNo: string }
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
        const [contractsRes, billsRes] = await Promise.all([fetch('/api/contracts?lean=1'), fetch('/api/bills')]);
        if (contractsRes.status === 401) {
          router.replace('/auth/signin');
          return;
        }
        const contracts = await contractsRes.json().catch(() => null);
        const bills = await billsRes.json().catch(() => null);
        const contractList = Array.isArray(contracts) ? contracts : contracts?.contracts || [];
        // GET /api/bills answers { data, pagination } — reading a nonexistent `bills`
      // key made hasBill permanently false, so returning users were shown first-run
      // onboarding forever instead of being sent to their bills.
      const billList = Array.isArray(bills) ? bills : bills?.data || [];
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
      // Trim to the opening pages before sending. A scanned agreement is easily over
      // the ~4.5 MB the platform accepts, and the upload was refused outright with a
      // bare 413 before any of our code ran. These are the same pages the server keeps.
      const { trimAgreementForUpload, tooLargeMessage } = await import('@/lib/pdf/trim-agreement-client');
      const prepared = await trimAgreementForUpload(file);
      if (prepared.stillTooLarge) {
        setAgreement({ step: 'failed', message: tooLargeMessage(prepared) });
        return;
      }
      const body = new FormData();
      body.append('file', prepared.file, prepared.file.name);
      const extractRes = await fetch('/api/contracts/extract-agreement', { method: 'POST', body });
      if (extractRes.status === 413) {
        setAgreement({ step: 'failed', message: tooLargeMessage(prepared) });
        return;
      }
      const extracted = await extractRes.json().catch(() => ({}));
      if (!extractRes.ok || !extracted.data) {
        setAgreement({ step: 'failed', message: extracted.error || 'The agreement could not be read.' });
        return;
      }
      // Stop for the agreement number before saving anything. The bill matches its
      // contract by this number, so getting it right here is what lets the bill upload
      // run start to finish without showing a form.
      setAgreement({
        step: 'confirm',
        extracted: extracted.data,
        agreementNo: String(extracted.data.agreementNo || '').trim(),
      });
    } catch {
      setAgreement({ step: 'failed', message: 'The upload failed. Check the connection and try again.' });
    }
  };

  /** Save the contract: everything the PDF gave, plus the confirmed agreement number. */
  const saveContract = async (d: any, agreementNo: string) => {
    setAgreement({ step: 'saving' });
    try {
      const createRes = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agreementNo,
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
      setAgreement({ step: 'done', agreementNo: created.agreementNo || agreementNo || d.loaNo || 'your contract' });
      setHasContract(true);
    } catch {
      setAgreement({ step: 'failed', message: 'The save failed. Check the connection and try again.' });
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
          Upload the LOA, upload the bill, and the finished report is yours. Your first bills are free.
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
                <h2 className="font-semibold">Upload the LOA (Letter of Acceptance)</h2>
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

          {agreement.step === 'confirm' && (
            <div className="border border-emerald-300 bg-emerald-50 rounded-md p-3 space-y-2">
              <p className="text-sm font-medium">
                The agreement number — type it if you know it
              </p>
              <p className="text-xs text-muted-foreground">
                It looks like SCR/GNT/Civil/2022/0012. The LOA usually does not carry it —
                if you don&apos;t have it yet, just skip: your first bill PDF prints it, and
                we&apos;ll take it from there automatically.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={agreement.agreementNo}
                  onChange={e => setAgreement({ ...agreement, agreementNo: e.target.value })}
                  placeholder="e.g. SR/MDU/Civil/2024/0037 — or leave blank"
                  className="flex-1 border rounded-md px-3 py-2 text-sm font-mono"
                  autoFocus
                />
                <Button
                  onClick={() => saveContract(agreement.extracted, agreement.agreementNo.trim())}
                  disabled={!agreement.agreementNo.trim() && !String(agreement.extracted?.loaNo || '').trim()}
                >
                  {agreement.agreementNo.trim() ? 'Save contract' : 'Save — number comes from the bill'}
                </Button>
              </div>
              {/* Skipping works by falling back to the LOA number read off the PDF. When
                  that was not found either, there is nothing to name the contract by and
                  the button greys out — which read as the page contradicting the advice
                  it had just given, because nothing said why. */}
              {!agreement.agreementNo.trim() && !String(agreement.extracted?.loaNo || '').trim() && (
                <p className="text-xs text-amber-700">
                  We could not find an LOA number in the PDF, so we need one number to file
                  this contract under. Type the LOA number or the agreement number above —
                  either will do, and the bill can correct it later.
                </p>
              )}
            </div>
          )}

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
              {agreementDone
                ? <>It reads every item, checks the total against the bill&apos;s own figure, and hands you the report.</>
                : <>Finish step 1 first — the bill needs a contract to attach to.</>}
            </p>
          </div>
          {/* Locked until the LOA is in. This button used to be live from the start,
              and a new user who tapped it first had their bill read and THEN hit
              "select a contract" with no contract to select. */}
          {agreementDone ? (
            <Button asChild>
              <Link href="/bills/new?instant=1">
                <Receipt className="h-4 w-4 mr-2" />
                Upload bill
              </Link>
            </Button>
          ) : (
            <Button variant="outline" disabled>
              <Receipt className="h-4 w-4 mr-2" />
              Upload bill
            </Button>
          )}
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
