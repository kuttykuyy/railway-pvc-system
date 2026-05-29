
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { BillStatusBadge } from '@/components/bills/bill-status-badge';
import { 
  Clock, 
  CheckCircle2, 
  XCircle, 
  FileEdit,
  Search,
  Building,
  Calendar,
  IndianRupee,
  FileText,
  ArrowRight
} from 'lucide-react';
import { format } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';
import Link from 'next/link';

interface Bill {
  id: string;
  billNo: string | null;
  billAmount: number | null;
  dateOfMeasurement: string | null;
  submittedAt: string | null;
  status: string | null;
  contract?: {
    agreementNo?: string;
    workDescription?: string;
    user?: {
      name?: string | null;
      email?: string;
      companyName?: string | null;
    };
  };
  pvcCalculation?: {
    totalPvcAmount?: number;
  } | null;
}

interface ApprovalsPageClientProps {
  bills: Bill[];
  counts: {
    draft: number;
    submitted: number;
    approved: number;
    rejected: number;
    revision_requested: number;
  };
  user: {
    name: string | null;
    designation: string | null;
    department: string | null;
  };
}

export function ApprovalsPageClient({ bills, counts, user }: ApprovalsPageClientProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredBills = bills.filter(bill => {
    const query = searchQuery.toLowerCase();
    return (
      bill.billNo?.toLowerCase().includes(query) ||
      bill.contract?.agreementNo?.toLowerCase().includes(query) ||
      bill.contract?.workDescription?.toLowerCase().includes(query) ||
      bill.contract?.user?.companyName?.toLowerCase().includes(query) ||
      bill.contract?.user?.name?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Bill Approvals</h1>
        <p className="text-muted-foreground">
          Review and approve contractor PVC bills
          {user.designation && ` · ${user.designation}`}
          {user.department && ` · ${user.department}`}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="text-blue-600" size={20} />
              <span className="text-2xl font-bold">{counts.submitted}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Approved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="text-green-600" size={20} />
              <span className="text-2xl font-bold">{counts.approved}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Rejected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <XCircle className="text-red-600" size={20} />
              <span className="text-2xl font-bold">{counts.rejected}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Revision Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <FileEdit className="text-orange-600" size={20} />
              <span className="text-2xl font-bold">{counts.revision_requested}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Draft
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <FileText className="text-gray-600" size={20} />
              <span className="text-2xl font-bold">{counts.draft}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
        <Input
          placeholder="Search by bill number, agreement number, work title, or contractor..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Bills List */}
      {filteredBills.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock size={48} className="mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Pending Bills</h3>
            <p className="text-muted-foreground">
              {searchQuery ? 'No bills match your search.' : 'All bills have been reviewed.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredBills.map((bill) => (
            <Card key={bill.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  {/* Left: Bill Info */}
                  <div className="space-y-3 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-lg font-semibold">{bill.billNo || 'N/A'}</h3>
                      <BillStatusBadge status={bill.status || 'draft'} size="sm" />
                    </div>

                    <div className="grid gap-2 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <FileText size={16} />
                        <span className="font-medium">Agreement:</span>
                        <span>{bill.contract?.agreementNo || 'N/A'}</span>
                      </div>

                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Building size={16} />
                        <span className="font-medium">Work:</span>
                        <span className="line-clamp-1">{bill.contract?.workDescription || 'N/A'}</span>
                      </div>

                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Building size={16} />
                        <span className="font-medium">Contractor:</span>
                        <span>{bill.contract?.user?.companyName || bill.contract?.user?.name || bill.contract?.user?.email || 'N/A'}</span>
                      </div>

                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar size={16} />
                        <span className="font-medium">Measurement Date:</span>
                        <span>
                          {bill.dateOfMeasurement 
                            ? format(new Date(bill.dateOfMeasurement), 'dd MMM yyyy')
                            : 'N/A'}
                        </span>
                      </div>

                      {bill.submittedAt && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock size={16} />
                          <span className="font-medium">Submitted:</span>
                          <span>{format(toISTDate(new Date(bill.submittedAt)), 'dd MMM yyyy, hh:mm a')}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Amounts & Action */}
                  <div className="flex flex-col items-end gap-3 lg:min-w-[200px]">
                    <div className="text-right space-y-1">
                      <p className="text-sm text-muted-foreground">Bill Amount</p>
                      <p className="text-xl font-bold flex items-center gap-1">
                        <IndianRupee size={18} />
                        {bill.billAmount != null ? bill.billAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '0.00'}
                      </p>
                    </div>

                    {bill.pvcCalculation?.totalPvcAmount != null && (
                      <div className="text-right space-y-1">
                        <p className="text-sm text-muted-foreground">PVC Amount</p>
                        <p className="text-lg font-semibold text-blue-600 flex items-center gap-1">
                          <IndianRupee size={16} />
                          {typeof bill.pvcCalculation.totalPvcAmount === 'number' 
                            ? bill.pvcCalculation.totalPvcAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 }) 
                            : '0.00'}
                        </p>
                      </div>
                    )}

                    <Link href={`/bills/${bill.id}`}>
                      <Button className="gap-2">
                        Review Bill
                        <ArrowRight size={16} />
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
