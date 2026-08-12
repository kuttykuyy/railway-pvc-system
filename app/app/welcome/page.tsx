'use client';

/**
 * Where a new user lands after signing up.
 *
 * The point is to get them to a real price variation statement from their own agreement
 * and bill, in one sitting. That is the only demonstration worth anything here, and it
 * also ties the free trial to a genuine agreement number, which is what deters trial
 * farming far better than anything done with email addresses.
 *
 * It is a strong default, NOT a gate, and that is deliberate. The PDF reader still fails
 * on real bills in ways only a real bill reveals — a minus-rate row, a unit whose spaces
 * were lost, an item number wide enough to overflow its column. Today each of those
 * costs a support message. Behind a locked door each would cost the customer instead,
 * before they had seen anything work at all. People also sign up on a phone, on a train,
 * at home, with the bill sitting on an office computer.
 *
 * So the upload is the loud path and the ways past it are quiet, but they are always
 * there.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileUp, Receipt, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';

export default function WelcomePage() {
  const router = useRouter();
  const [hasContract, setHasContract] = useState<boolean | null>(null);
  const [hasBill, setHasBill] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      try {
        const [contractsRes, billsRes] = await Promise.all([
          fetch('/api/contracts'),
          fetch('/api/bills'),
        ]);
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
        // Never strand someone here because a count could not be fetched. The steps
        // below work whether or not we know what they already have.
        setHasContract(false);
      }
    })();
  }, [router]);

  // Someone who already has a bill has finished this; sending them here again is noise.
  useEffect(() => {
    if (hasContract && hasBill) router.replace('/bills');
  }, [hasContract, hasBill, router]);

  if (hasContract === null) {
    return (
      <div className="p-8 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Getting things ready…
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Let&apos;s price your first bill</h1>
        <p className="text-muted-foreground">
          Two uploads and you&apos;ll have a full price variation statement from your own documents.
          Your first bills are free.
        </p>
      </div>

      {/* Step 1 — the agreement. Everything else needs the tender date, which only this
          document carries, so it genuinely has to come first. */}
      <Card className={hasContract ? 'border-emerald-300 bg-emerald-50/50' : 'border-emerald-400 border-2'}>
        <CardContent className="pt-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              {hasContract
                ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                : <span className="h-6 w-6 rounded-full bg-emerald-600 text-white text-xs grid place-items-center font-bold">1</span>}
              <h2 className="font-semibold">Add your contract</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              {hasContract
                ? 'Done — your contract is in.'
                : 'Upload the LOA or the agreement PDF. It reads the agreement number, the tender date and the schedules for you.'}
            </p>
          </div>
          <Button asChild variant={hasContract ? 'outline' : 'default'}>
            <Link href="/contracts/new">
              <FileUp className="h-4 w-4 mr-2" />
              {hasContract ? 'Add another' : 'Upload agreement'}
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Step 2 — the bill. Deliberately not disabled before step 1: the bill page can
          create its own contract, and a dead button teaches people the app is fussy. */}
      <Card className={hasContract ? 'border-emerald-400 border-2' : ''}>
        <CardContent className="pt-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className={`h-6 w-6 rounded-full text-xs grid place-items-center font-bold ${
                hasContract ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
              }`}>2</span>
              <h2 className="font-semibold">Upload your bill</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              The signed RA bill PDF. It reads every item and checks the total against the bill&apos;s own
              figure before it prices anything.
            </p>
          </div>
          <Button asChild variant={hasContract ? 'default' : 'outline'}>
            <Link href="/bills/new">
              <Receipt className="h-4 w-4 mr-2" />
              Upload bill
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* The quiet ways past. Always present: the reader can fail on a real bill, and a
          new user must never be left with nothing to do about it. */}
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
        are, you can type the details in instead, and the file helps us fix the reader.
      </p>
    </div>
  );
}
