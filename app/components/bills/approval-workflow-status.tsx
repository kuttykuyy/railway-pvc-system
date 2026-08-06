'use client';

import { CheckCircle2, Circle, Clock, XCircle, FileEdit, Undo2, Send, User } from 'lucide-react';
import { format } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';

export interface ApprovalHistoryEntry {
  id: string;
  action: string;
  comments: string | null;
  previousStatus: string;
  newStatus: string;
  timestamp: string;
  user?: { name: string | null; email: string; designation?: string | null; role?: string | null } | null;
}

/**
 * Where a PVC proposal has got to, and how it got there.
 *
 * Two stages, because two desks answer for different things: the executive approves
 * the work and the figures, then accounts vet the calculation and pass it for payment.
 * The chain was recorded from the start but never shown, so a contractor could see
 * "approved" without knowing that a second desk still had it.
 */
const STAGES = [
  { key: 'draft', label: 'Draft', hint: 'With the contractor' },
  { key: 'submitted', label: 'Submitted', hint: 'Awaiting the executive' },
  { key: 'approved', label: 'Approved', hint: 'With accounts / audit' },
  { key: 'passed_for_payment', label: 'Passed for payment', hint: 'Vetted by accounts' },
] as const;

const STAGE_INDEX: Record<string, number> = {
  draft: 0,
  submitted: 1,
  revision_requested: 1,
  rejected: 1,
  approved: 2,
  passed_for_payment: 3,
};

const ACTION_LOOK: Record<string, { icon: any; classes: string; label: string }> = {
  submitted: { icon: Send, classes: 'text-sky-600 bg-sky-50 border-sky-200', label: 'Submitted' },
  approved: { icon: CheckCircle2, classes: 'text-emerald-600 bg-emerald-50 border-emerald-200', label: 'Approved by the executive' },
  rejected: { icon: XCircle, classes: 'text-red-600 bg-red-50 border-red-200', label: 'Rejected' },
  revision_requested: { icon: FileEdit, classes: 'text-amber-600 bg-amber-50 border-amber-200', label: 'Revision requested' },
  passed_for_payment: { icon: CheckCircle2, classes: 'text-emerald-600 bg-emerald-50 border-emerald-200', label: 'Passed for payment by accounts' },
  returned_by_accounts: { icon: Undo2, classes: 'text-amber-600 bg-amber-50 border-amber-200', label: 'Returned by accounts' },
};

function actionLook(action: string) {
  return ACTION_LOOK[action] || { icon: Circle, classes: 'text-slate-500 bg-slate-50 border-slate-200', label: action.replace(/_/g, ' ') };
}

export function ApprovalWorkflowStatus({
  status,
  history = [],
}: {
  status: string;
  history?: ApprovalHistoryEntry[];
}) {
  const current = STAGE_INDEX[status] ?? 0;
  const isRejected = status === 'rejected';
  const isRevision = status === 'revision_requested';
  const stalled = isRejected || isRevision;

  // Oldest first: this reads as a story of what happened, not a feed.
  const ordered = [...history].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  return (
    <div className="space-y-5">
      {/* Stage strip */}
      <div className="grid grid-cols-4 gap-1">
        {STAGES.map((stage, index) => {
          const done = index < current;
          const here = index === current;
          const tone = stalled && here
            ? (isRejected ? 'text-red-700' : 'text-amber-700')
            : done || here ? 'text-emerald-700' : 'text-slate-400';
          const bar = stalled && here
            ? (isRejected ? 'bg-red-500' : 'bg-amber-500')
            : done || here ? 'bg-emerald-500' : 'bg-slate-200';
          return (
            <div key={stage.key} className="space-y-1.5">
              <div className={`h-1.5 rounded-full ${bar}`} />
              <p className={`text-[11px] font-semibold leading-tight ${tone}`}>{stage.label}</p>
              <p className="text-[10px] text-slate-400 leading-tight">
                {here && stalled
                  ? (isRejected ? 'Rejected — see below' : 'Sent back for revision')
                  : stage.hint}
              </p>
            </div>
          );
        })}
      </div>

      {/* What actually happened, and who did it */}
      {ordered.length === 0 ? (
        <p className="text-xs text-slate-400">
          Nothing recorded yet — the trail starts when the bill is submitted.
        </p>
      ) : (
        <ol className="space-y-3">
          {ordered.map((entry) => {
            const look = actionLook(entry.action);
            const Icon = look.icon;
            return (
              <li key={entry.id} className="flex gap-3">
                <div className={`h-7 w-7 rounded-lg border flex items-center justify-center shrink-0 ${look.classes}`}>
                  <Icon size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <p className="text-sm font-medium text-slate-800">{look.label}</p>
                    <p className="text-[11px] text-slate-400">
                      {format(toISTDate(new Date(entry.timestamp)), 'dd MMM yyyy, hh:mm a')}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                    <User size={11} className="shrink-0" />
                    {entry.user?.name || entry.user?.email || 'Unknown user'}
                    {entry.user?.designation ? ` · ${entry.user.designation}` : ''}
                  </p>
                  {entry.comments && (
                    <p className="text-xs text-slate-600 mt-1 bg-slate-50 border border-slate-100 rounded-md px-2.5 py-1.5">
                      {entry.comments}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {status === 'approved' && (
        <p className="text-xs text-sky-700 flex items-center gap-1.5">
          <Clock size={12} />
          Waiting with the accounts / audit office.
        </p>
      )}
    </div>
  );
}
