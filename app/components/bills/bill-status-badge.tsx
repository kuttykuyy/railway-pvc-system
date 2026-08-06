
'use client';

import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle2, XCircle, FileEdit, FileClock } from 'lucide-react';

interface BillStatusBadgeProps {
  status: string;
  size?: 'sm' | 'md' | 'lg';
}

// Light tinted background + dark text of the same hue, so the label always reads.
// (The previous config put dark emerald text on the Badge's solid dark 'default'
// background — dark on dark, unreadable.)
const statusConfig = {
  draft: {
    label: 'Draft',
    icon: FileEdit,
    classes: 'bg-slate-100 text-slate-700 border-slate-200'
  },
  submitted: {
    label: 'Pending Approval',
    icon: Clock,
    classes: 'bg-amber-50 text-amber-700 border-amber-200'
  },
  // Approved by the executive side — the proposal now sits with accounts, which is a
  // different desk and a different wait, so it does not read as finished.
  approved: {
    label: 'With Accounts',
    icon: FileClock,
    classes: 'bg-sky-50 text-sky-700 border-sky-200'
  },
  passed_for_payment: {
    label: 'Passed for Payment',
    icon: CheckCircle2,
    classes: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  },
  rejected: {
    label: 'Rejected',
    icon: XCircle,
    classes: 'bg-red-50 text-red-700 border-red-200'
  },
  revision_requested: {
    label: 'Revision Required',
    icon: FileClock,
    classes: 'bg-orange-50 text-orange-700 border-orange-200'
  }
};

export function BillStatusBadge({ status, size = 'md' }: BillStatusBadgeProps) {
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-1.5'
  };

  const iconSizes = {
    sm: 12,
    md: 14,
    lg: 16
  };

  return (
    <Badge
      variant="outline"
      className={`${sizeClasses[size]} flex items-center gap-1.5 ${config.classes}`}
    >
      <Icon size={iconSizes[size]} />
      {config.label}
    </Badge>
  );
}
