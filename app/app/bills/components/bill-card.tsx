
/**
 * Individual bill card component (for grid view)
 */

'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Calendar, Building2, IndianRupee, MoreHorizontal, Eye, FileText, Trash2, Clock, User, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { BillStatusBadge } from '@/components/bills/bill-status-badge';
import { WhatsAppSendDialog } from '@/components/whatsapp-send-dialog';
import type { Bill } from './types';

interface BillCardProps {
  bill: Bill;
  isSelected: boolean;
  onSelect: (billId: string, selected: boolean) => void;
  onDelete: (billId: string) => void;
}

export function BillCard({ bill, isSelected, onSelect, onDelete }: BillCardProps) {
  const [whatsAppDialogOpen, setWhatsAppDialogOpen] = useState(false);
  const totalPVC = bill.pvcCalculations?.[0]?.totalPvc || 0;
  const billDate = typeof bill.billDate === 'string' ? new Date(bill.billDate) : bill.billDate;
  const measurementDate = typeof bill.measurementDate === 'string' ? new Date(bill.measurementDate) : bill.measurementDate;

  return (
    <Card className={`relative hover:shadow-lg transition-shadow ${isSelected ? 'ring-2 ring-primary' : ''}`}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onSelect(bill.id, checked as boolean)}
            className="mt-1"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg">{bill.billNumber}</h3>
              {bill.isExtension && (
                <Badge variant="secondary">Extension</Badge>
              )}
              {bill.isFreeTrial && (
                <Badge variant="outline">Trial</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {bill.contract.agreementNo}
            </p>
          </div>
        </div>

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
            <DropdownMenuItem onClick={() => setWhatsAppDialogOpen(true)}>
              <MessageCircle className="h-4 w-4 mr-2" />
              Send via WhatsApp
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete(bill.id)} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent>
        <div className="space-y-3">
          {/* Amount */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div className="flex items-center gap-2 text-sm">
              <IndianRupee className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Bill Amount</span>
            </div>
            <span className="font-semibold">
              ₹{bill.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>

          {/* PVC */}
          <div className={`flex items-center justify-between p-3 rounded-lg ${
            totalPVC >= 0 ? 'bg-green-50' : 'bg-red-50'
          }`}>
            <span className="text-sm text-muted-foreground">PVC Amount</span>
            <span className={`font-semibold ${totalPVC >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ₹{Math.abs(totalPVC).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>

          {/* Dates */}
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span>Bill Date: {format(billDate, 'dd MMM yyyy')}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>Measurement: {format(measurementDate, 'dd MMM yyyy')}</span>
            </div>
          </div>

          {/* Creator */}
          {bill.contract.user && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2 border-t">
              <User className="h-3.5 w-3.5" />
              <span>Created by: {bill.contract.user.name || bill.contract.user.email}</span>
            </div>
          )}

          {/* Approval Status */}
          {bill.approvalStatus && (
            <div className="pt-2 border-t">
              <BillStatusBadge status={bill.approvalStatus} />
            </div>
          )}
        </div>
      </CardContent>

      {/* WhatsApp Send Dialog */}
      <WhatsAppSendDialog
        open={whatsAppDialogOpen}
        onOpenChange={setWhatsAppDialogOpen}
        billId={bill.id}
        billNumber={bill.billNumber}
        contractorName={bill.contract?.contractorName}
        contractorPhone={bill.contract?.contractorPhone}
      />
    </Card>
  );
}
