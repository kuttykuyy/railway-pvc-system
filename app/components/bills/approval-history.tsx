
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle2, XCircle, FileEdit, Send, User } from 'lucide-react';
import { format } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';

interface ApprovalHistoryItem {
  id: string;
  action: string;
  comments: string | null;
  previousStatus: string;
  newStatus: string;
  timestamp: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    role: string;
    designation: string | null;
    department: string | null;
  };
}

interface ApprovalHistoryProps {
  billId: string;
}

const actionConfig = {
  submitted: {
    label: 'Submitted for Approval',
    icon: Send,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100'
  },
  approved: {
    label: 'Approved',
    icon: CheckCircle2,
    color: 'text-green-600',
    bgColor: 'bg-green-100'
  },
  rejected: {
    label: 'Rejected',
    icon: XCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-100'
  },
  revision_requested: {
    label: 'Revision Requested',
    icon: FileEdit,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100'
  }
};

export function ApprovalHistory({ billId }: ApprovalHistoryProps) {
  const [history, setHistory] = useState<ApprovalHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, [billId]);

  const fetchHistory = async () => {
    try {
      const res = await fetch(`/api/bills/approval/history?billId=${billId}`);
      const data = await res.json();

      if (res.ok) {
        setHistory(data.history);
      }
    } catch (error) {
      console.error('Failed to fetch approval history:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock size={20} />
            Approval History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading history...</p>
        </CardContent>
      </Card>
    );
  }

  if (history.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock size={20} />
            Approval History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No approval history yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock size={20} />
          Approval History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {history.map((item, index) => {
            const config = actionConfig[item.action as keyof typeof actionConfig];
            const Icon = config?.icon || Clock;

            return (
              <div key={item.id} className="relative">
                {/* Timeline line */}
                {index < history.length - 1 && (
                  <div className="absolute left-4 top-10 bottom-0 w-0.5 bg-gray-200" />
                )}

                <div className="flex gap-4">
                  {/* Icon */}
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full ${config?.bgColor || 'bg-gray-100'} flex items-center justify-center`}>
                    <Icon size={16} className={config?.color || 'text-gray-600'} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-sm">
                          {config?.label || item.action}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(toISTDate(new Date(item.timestamp)), 'MMM dd, yyyy · hh:mm a')}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {item.previousStatus} → {item.newStatus}
                      </Badge>
                    </div>

                    {/* User info */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <User size={12} />
                      <span className="font-medium">{item.user.name || item.user.email}</span>
                      {item.user.designation && (
                        <Badge variant="secondary" className="text-xs">
                          {item.user.designation}
                        </Badge>
                      )}
                      {item.user.department && (
                        <Badge variant="secondary" className="text-xs">
                          {item.user.department}
                        </Badge>
                      )}
                    </div>

                    {/* Comments */}
                    {item.comments && (
                      <div className="bg-muted p-3 rounded-md text-sm">
                        <p className="text-muted-foreground">{item.comments}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
