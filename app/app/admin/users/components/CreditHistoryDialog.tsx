
/**
 * Credit History Dialog Component
 */

'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { History, TrendingUp, TrendingDown } from 'lucide-react';
import type { User, CreditTransaction } from '../types';
import { formatCurrency, formatDate } from '../utils/userUtils';

interface CreditHistoryDialogProps {
  user: User | null;
  transactions: CreditTransaction[];
  loading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreditHistoryDialog({
  user,
  transactions,
  loading,
  open,
  onOpenChange
}: CreditHistoryDialogProps) {
  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Credit History
          </DialogTitle>
          <DialogDescription>
            {user.name || user.email}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[500px] overflow-y-auto">
          {loading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Loading transactions...</p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No transactions found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-start justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      {transaction.amount > 0 ? (
                        <TrendingUp className="h-4 w-4 text-green-600" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-600" />
                      )}
                      <span className={`font-semibold ${
                        transaction.amount > 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {transaction.amount > 0 ? '+' : ''}{formatCurrency(transaction.amount)}
                      </span>
                      <Badge variant="outline">
                        {transaction.type}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{transaction.reason}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{formatDate(transaction.createdAt)}</span>
                      {transaction.adminUserEmail && (
                        <span>By: {transaction.adminUserEmail}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-sm space-y-1">
                    <p className="text-muted-foreground">
                      Balance: {formatCurrency(transaction.balanceAfter)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
