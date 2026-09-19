'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toast } from 'react-hot-toast';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';

/**
 * Record which price variation clause governs a contract.
 *
 * A tender that closed around April 2022 cannot be settled by its date, so the app says
 * so — on the contract page, on the bill, and in red on the statement itself: "read
 * Clause 46A in the agreement and record which one it is". There was nowhere to record
 * it. The column and the API route both existed, but no screen ever sent
 * pvcClauseVersion, so the only thing a reader could do with the answer was keep it to
 * themselves while every statement went out on the 2022 rules by default.
 *
 * The answer is usually on the face of the tender: the agreement names the GCC edition
 * it is drawn upon. ECoR/KUR/Civil/2022/0202 closed 18 May 2022 and binds to "Indian
 * Railways Standard General Conditions of Contract July-2020" on nine of its pages,
 * never to GCC April 2022 — the older clause, decided by the document rather than by
 * the date.
 *
 * Only shown where it is the question: a tender in the uncertain window, or one where
 * somebody has already answered and may want to change it.
 */

type ClauseVersion = 'pre-2022' | 'gcc-2022';

export function PvcClauseDecision({
  contractId,
  version,
  versionSource,
}: {
  contractId: string;
  /** What the app is going on now — a recorded answer or the tender date. */
  version: 'pre-2022' | 'gcc-2022' | 'uncertain';
  versionSource: 'recorded' | 'tender-date';
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<ClauseVersion | 'clear' | null>(null);

  const recorded = versionSource === 'recorded';

  const save = async (value: ClauseVersion | null) => {
    setSaving(value ?? 'clear');
    try {
      const res = await fetch(`/api/contracts/${contractId}/pvc-clause`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pvcClauseVersion: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save');
      toast.success(
        value === 'pre-2022'
          ? 'Recorded: this contract is on the older, pre-2022 clause.'
          : value === 'gcc-2022'
            ? 'Recorded: this contract is on GCC April 2022.'
            : 'Cleared. The tender date decides again.',
      );
      router.refresh();
    } catch (e: any) {
      toast.error(e.message || 'Could not save');
    } finally {
      setSaving(null);
    }
  };

  const busy = saving !== null;

  // Red only while it is unanswered. Once somebody has read the agreement this is a
  // settled fact sitting next to the panel that acts on it, and two alarm-coloured boxes
  // in a row read as two problems.
  const tone = recorded
    ? { box: 'border-gray-200 bg-gray-50', head: 'text-gray-900', body: 'text-gray-600' }
    : { box: 'border-red-300 bg-red-50', head: 'text-red-900', body: 'text-red-800' };

  return (
    <div className={`border rounded-lg p-3 space-y-2 ${tone.box}`}>
      <p className={`text-sm font-semibold flex items-center gap-2 ${tone.head}`}>
        {recorded ? <Check className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
        {recorded
          ? `Recorded: ${version === 'pre-2022' ? 'the older, pre-2022 clause' : 'GCC April 2022'}`
          : 'Which price variation clause governs is not settled'}
      </p>
      <p className={`text-sm ${tone.body}`}>
        {recorded
          ? 'Somebody read the agreement and answered this. Clear it to hand the question back to the tender date.'
          : 'This tender closed around the time GCC April 2022 came in, so its date cannot tell us which '
            + 'clause governs. The agreement itself says: look for the GCC edition it is drawn upon, or read '
            + 'Clause 46A — a 46A.6 table of six work types is the older clause, nine groups with A-E '
            + 'sub-classes is GCC April 2022. Until this is answered every statement goes out on the 2022 rules.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={version === 'pre-2022' && recorded ? 'default' : 'outline'}
          disabled={busy}
          onClick={() => save('pre-2022')}
        >
          {saving === 'pre-2022' && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Older clause (before April 2022)
        </Button>
        <Button
          size="sm"
          variant={version === 'gcc-2022' && recorded ? 'default' : 'outline'}
          disabled={busy}
          onClick={() => save('gcc-2022')}
        >
          {saving === 'gcc-2022' && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          GCC April 2022
        </Button>
        {recorded && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => save(null)}>
            {saving === 'clear' && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
