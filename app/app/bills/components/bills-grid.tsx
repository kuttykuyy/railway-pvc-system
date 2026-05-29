
/**
 * Bills grid view component
 */

'use client';

import { BillCard } from './bill-card';
import type { Bill } from './types';

interface BillsGridProps {
  bills: Bill[];
  selectedBills: string[];
  onSelectBill: (billId: string, selected: boolean) => void;
  onDeleteBill: (billId: string) => void;
}

export function BillsGrid({ bills, selectedBills, onSelectBill, onDeleteBill }: BillsGridProps) {
  if (bills.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No bills found</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {bills.map((bill) => (
        <BillCard
          key={bill.id}
          bill={bill}
          isSelected={selectedBills.includes(bill.id)}
          onSelect={onSelectBill}
          onDelete={onDeleteBill}
        />
      ))}
    </div>
  );
}
