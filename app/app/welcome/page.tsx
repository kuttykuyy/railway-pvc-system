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
 *
 * The page is deliberately bare: no navigation, no side panels, no stats. Just the two
 * things a new user has to do, one under the other.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { FileUp, Receipt, CheckCircle2, Loader2, AlertTriangle, Lock } from 'lucide-react';
import { normalizeSchedules } from '@/lib/contract-schedules';
import { shortScheduleName } from '@/lib/bill-schedule-matching';
import { SampleDocumentDialog } from '@/components/onboarding/sample-document-dialog';
import { AgreementReadingInfographic } from '@/components/onboarding/agreement-reading-infographic';

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

const SAMPLE_BUTTON =
  'inline-flex items-center gap-2 px-3.5 py-2 rounded-md border border-emerald-300 bg-emerald-50 text-sm font-semibold text-emerald-800 hover:bg-emerald-100';

export default function WelcomePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const fileInput = useRef<HTMLInputElement>(null);
  const [hasContract, setHasContract] = useState<boolean | null>(null);
  const [hasBill, setHasBill] = useState(false);
  const [agreement, setAgreement] = useState<AgreementStage>({ step: 'idle' });
  /** The kept copy of the uploaded LOA, claimed by the contract when it is saved. */
  const [loaDocumentId, setLoaDocumentId] = useState<number | null>(null);

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
      setLoaDocumentId(typeof extracted.documentId === 'number' ? extracted.documentId : null);
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
          // The LOA PDF this contract was read from, kept with it for 90 days.
          uploadedDocumentId: loaDocumentId,
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
  const firstName = (session?.user?.name || '').trim().split(/\s+/)[0] || '';

  return (
    <div className="px-4 sm:px-6 py-10 max-w-2xl mx-auto">
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

      {/* Heading — one line on what to do, one chip on the free bill. */}
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-balance">
        {firstName ? `Welcome, ${firstName}. ` : ''}Two PDFs, one PVC report.
      </h1>
      <p className="text-muted-foreground mt-2">
        Upload your LOA, then a signed bill. The report is prepared for you.
      </p>
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold text-sm mt-4">
        <CheckCircle2 className="h-4 w-4" /> Your first bill is free
      </div>

      {/* ───── Step 1 — the LOA ───── */}
      <div className="grid grid-cols-[36px_1fr] gap-3 mt-8">
        <div className="flex flex-col items-center">
          <div className={`h-9 w-9 rounded-full grid place-items-center font-extrabold text-white ${
            agreementDone ? 'bg-emerald-600' : 'bg-emerald-600 ring-[5px] ring-emerald-100'
          }`}>
            {agreementDone ? <CheckCircle2 className="h-5 w-5" /> : '1'}
          </div>
          <div className="flex-1 w-0.5 bg-slate-200 mt-2 min-h-[28px]" />
        </div>
        <div className={`bg-white rounded-2xl border p-5 shadow-sm ${
          agreementDone ? 'border-emerald-200 bg-emerald-50/40' : 'border-emerald-200 ring-[3px] ring-emerald-50'
        }`}>
          <h2 className="text-lg font-bold">Upload the LOA</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {agreement.step === 'done'
              ? `Done — ${agreement.agreementNo} is in.`
              : agreementDone
                ? 'Done — your contract is in.'
                : 'The Letter of Acceptance from IREPS. The app reads it and fills the contract in for you.'}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            {!agreementDone ? <SampleDocumentDialog kind="loa" className={SAMPLE_BUTTON} /> : <span />}
            <Button
              size="lg"
              onClick={() => fileInput.current?.click()}
              disabled={agreementBusy}
              variant={agreementDone ? 'outline' : 'default'}
            >
              {agreementBusy
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{agreement.step === 'reading' ? 'Reading…' : 'Saving…'}</>
                : <><FileUp className="h-4 w-4 mr-2" />{agreementDone ? 'Add another' : 'Choose the LOA PDF'}</>}
            </Button>
          </div>

          {/* While the LOA is being read, show what's happening instead of a bare spinner. */}
          {agreement.step === 'reading' && <AgreementReadingInfographic />}

          {agreement.step === 'confirm' && (
            <div className="border border-emerald-300 bg-emerald-50 rounded-md p-3 space-y-2 mt-4">
              <p className="text-sm font-medium">The agreement number — type it if you know it</p>
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
            <div className="border border-red-300 bg-red-50 rounded-md p-3 space-y-2 mt-4">
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
        </div>
      </div>

      {/* ───── Step 2 — the bill ───── */}
      <div className="grid grid-cols-[36px_1fr] gap-3 mt-4">
        <div className="flex flex-col items-center">
          <div className={`h-9 w-9 rounded-full grid place-items-center font-extrabold ${
            agreementDone
              ? 'bg-emerald-600 text-white ring-[5px] ring-emerald-100'
              : 'bg-slate-50 text-slate-400 border-2 border-slate-200'
          }`}>2</div>
        </div>
        <div className={`bg-white rounded-2xl border p-5 shadow-sm ${
          agreementDone ? 'border-emerald-200 ring-[3px] ring-emerald-50' : 'border-slate-200 opacity-90'
        }`}>
          <h2 className="text-lg font-bold">Upload the signed bill</h2>
          <p className="text-muted-foreground text-sm mt-1">
            The signed bill PDF from IREPS. Every item is read, the total is checked against the
            bill&apos;s own figure, and your PVC report downloads.
          </p>
          {!agreementDone && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground mt-3">
              <Lock className="h-4 w-4" /> Unlocks once the LOA is in — a bill needs a contract to attach to.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <SampleDocumentDialog kind="bill" className={SAMPLE_BUTTON} />
            {agreementDone ? (
              <Button size="lg" asChild>
                <Link href="/bills/new?instant=1">
                  <Receipt className="h-4 w-4 mr-2" /> Upload bill
                </Link>
              </Button>
            ) : (
              <Button size="lg" variant="outline" disabled>
                <Receipt className="h-4 w-4 mr-2" /> Upload bill
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* One quiet way out, and a word that nothing is lost. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm mt-7 pl-[48px]">
        <Link href="/contracts/new" className="text-muted-foreground hover:underline">
          Type the contract in instead
        </Link>
        <Link href="/contracts" className="text-muted-foreground hover:underline">
          I&apos;ll do this later
        </Link>
      </div>
      <p className="text-xs text-muted-foreground mt-4 pl-[48px] max-w-[60ch]">
        If a PDF will not read, nothing is lost — your account and your free bill stay exactly as
        they are, and you can type the details in instead.
      </p>
    </div>
  );
}
