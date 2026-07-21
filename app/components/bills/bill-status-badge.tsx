
'use client';

import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle2, XCircle, FileEdit, FileClock } from 'lucide-react';

interface BillStatusBadgeProps {
  status: string;
  size?: 'sm' | 'md' | 'lg';
}

const statusConfig = {
  draft: {
    label: 'Draft',
    variant: 'secondary' as const,
    icon: FileEdit,
    color: 'text-gray-600'
  },
  submitted: {
    label: 'Pending Approval',
    variant: 'default' as const,
    icon: Clock,
    color: 'text-emerald-600'
  },
  approved: {
    label: 'Approved',
    variant: 'default' as const,
    icon: CheckCircle2,
    color: 'text-green-600'
  },
  rejected: {
    label: 'Rejected',
    variant: 'destructive' as const,
    icon: XCircle,
    color: 'text-red-600'
  },
  revision_requested: {
    label: 'Revision Required',
    variant: 'default' as const,
    icon: FileClock,
    color: 'text-orange-600'
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
      variant={config.variant} 
      className={`${sizeClasses[size]} flex items-center gap-1.5 ${config.color}`}
    >
      <Icon size={iconSizes[size]} />
      {config.label}
    </Badge>
  );
}
