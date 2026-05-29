/**
 * Bills table view component
 */

'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SortAsc, SortDesc, MoreHorizontal, Eye, FileText, Trash2, MessageCircle, User } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { BillStatusBadge } from '@/components/bills/bill-status-badge';
import { WhatsAppSendDialog } from '@/components/whatsapp-send-dialog';
import type { Bill, SortField, SortDirection } from './types';

interface BillsTableProps {
  bills: Bill[];
  selectedBills: string[];
  sortField: SortField;
  sortDirection: SortDirection;
  onSelectBill: (billId: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onSort: (field: SortField) => void;
  onDeleteBill: (billId: string) => void;
}

export function BillsTable({
  bills,
  selectedBills,
  sortField,
  sortDirection,
  onSelectBill,
  onSelectAll,
  onSort,
  onDeleteBill,
}: BillsTableProps) {
  const [whatsAppDialogOpen, setWhatsAppDialogOpen] = useState(false);
  const [selectedBillForWhatsApp, setSelectedBillForWhatsApp] = useState<Bill | null>(null);
  
  const allSelected = bills.length > 0 && selectedBills.length === bills.length;
  const someSelected = selectedBills.length > 0 && selectedBills.length < bills.length;

  const SortIcon = sortDirection === 'asc' ? SortAsc : SortDesc;

  const handleWhatsAppClick = (bill: Bill) => {
    setSelectedBillForWhatsApp(bill);
    setWhatsAppDialogOpen(true);
  };

  const renderSortButton = (field: SortField, label: string) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onSort(field)}
      className="h-8 flex items-center gap-1 hover:bg-transparent"
    >
      {label}
      {sortField === field && <SortIcon className="h-3.5 w-3.5" />}
    </Button>
  );

  if (bills.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg">
        <p className="text-muted-foreground">No bills found</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">
              <Checkbox
                checked={allSelected || someSelected}
                onCheckedChange={onSelectAll}
              />
            </TableHead>
            <TableHead>{renderSortButton('billNumber', 'Bill Number')}</TableHead>
            <TableHead>{renderSortButton('contractName', 'Contract')}</TableHead>
            <TableHead>{renderSortButton('billDate', 'Bill Date')}</TableHead>
            <TableHead className="text-right">{renderSortButton('totalAmount', 'Amount')}</TableHead>
            <TableHead className="text-right">PVC Amount</TableHead>
            <TableHead>Created By</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="w-[80px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bills.map((bill) => {
            const totalPVC = bill.pvcCalculations?.[0]?.totalPvc || 0;
            const billDate = typeof bill.billDate === 'string' ? new Date(bill.billDate) : bill.billDate;
            const isSelected = selectedBills.includes(bill.id);

            return (
              <TableRow key={bill.id} className={isSelected ? 'bg-muted/50' : ''}>
                <TableCell>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) => onSelectBill(bill.id, checked as boolean)}
                  />
                </TableCell>
                <TableCell className="font-medium">
                  <Link href={`/bills/${bill.id}`} className="hover:underline">
                    {bill.billNumber}
                  </Link>
                </TableCell>
                <TableCell>
                  <div className="max-w-[200px]">
                    <div className="font-medium truncate">{bill.contract.agreementNo}</div>
                    <div className="text-sm text-muted-foreground truncate">
                      {bill.contract.contractorName}
                    </div>
                  </div>
                </TableCell>
                <TableCell>{format(billDate, 'dd MMM yyyy')}</TableCell>
                <TableCell className="text-right font-medium">
                  ₹{bill.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell className={`text-right font-medium ${
                  totalPVC >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  ₹{Math.abs(totalPVC).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-gray-500" />
                    <span className="text-sm text-gray-700 truncate max-w-[120px]">
                      {bill.contract.user?.name || bill.contract.user?.email || 'Unknown'}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {bill.approvalStatus ? (
                    <BillStatusBadge status={bill.approvalStatus} />
                  ) : (
                    <span className="text-sm text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {bill.isExtension && <Badge variant="secondary">Extension</Badge>}
                    {bill.isFreeTrial && <Badge variant="outline">Trial</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/bills/${bill.id}`}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => window.open(`/api/bills/${bill.id}/pdf-report`, '_blank')}>
                        <FileText className="h-4 w-4 mr-2" />
                        Download PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleWhatsAppClick(bill)}>
                        <MessageCircle className="h-4 w-4 mr-2" />
                        Send via WhatsApp
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDeleteBill(bill.id)} className="text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      
      {/* WhatsApp Send Dialog */}
      {selectedBillForWhatsApp && (
        <WhatsAppSendDialog
          open={whatsAppDialogOpen}
          onOpenChange={setWhatsAppDialogOpen}
          billId={selectedBillForWhatsApp.id}
          billNumber={selectedBillForWhatsApp.billNumber}
          contractorName={selectedBillForWhatsApp.contract.contractorName}
          contractorPhone={selectedBillForWhatsApp.contract.contractorPhone}
        />
      )}
    </div>
  );
}
