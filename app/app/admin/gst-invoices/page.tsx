
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Download,
  Eye,
  Search,
  Filter,
  Calendar,
  User,
  IndianRupee,
  Receipt,
  AlertCircle,
  FileSpreadsheet,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

interface GstInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerGstin?: string;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalGst: number;
  totalAmount: number;
  description: string;
  isInterstate: boolean;
  status: string;
  razorpayOrderId?: string;
  razorpayTransactionId?: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export default function AdminGstInvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<GstInvoice[]>([]);
  const [filteredInvoices, setFilteredInvoices] = useState<GstInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [exportMonth, setExportMonth] = useState<string>('');
  const [exportYear, setExportYear] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  // The transaction currently being invoiced B2C, so its button alone shows the spinner.
  const [generatingTxId, setGeneratingTxId] = useState<string | null>(null);

  useEffect(() => {
    fetchInvoices();
  }, []);

  useEffect(() => {
    filterInvoicesList();
  }, [searchTerm, filterStatus, invoices]);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      console.log('[Admin GST Page] Fetching invoices...');
      
      const response = await fetch('/api/admin/gst-invoices', {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
        },
      });
      
      console.log('[Admin GST Page] Response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[Admin GST Page] Error response:', errorData);
        
        if (response.status === 403 || response.status === 401) {
          toast.error('Unauthorized. Admin access required.');
          router.push('/dashboard');
          return;
        }
        throw new Error(errorData.error || 'Failed to fetch GST invoices');
      }

      const data = await response.json();
      console.log('[Admin GST Page] Received data:', data);
      console.log('[Admin GST Page] Number of invoices:', data.invoices?.length || 0);
      
      setInvoices(data.invoices || []);
      setFilteredInvoices(data.invoices || []);
    } catch (error: any) {
      console.error('[Admin GST Page] Error fetching GST invoices:', error);
      toast.error(error.message || 'Failed to load GST invoices');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Issue the invoice for a payment whose user never filled the billing dialog —
   * typically an unregistered (non-GST) customer with no GSTIN to give. B2C: the
   * account's own name and email, no GSTIN, the same CGST+SGST split the payment
   * was charged with.
   */
  const handleGenerateB2C = async (transactionId?: string) => {
    if (!transactionId) {
      toast.error('This payment carries no transaction id');
      return;
    }
    setGeneratingTxId(transactionId);
    try {
      const res = await fetch('/api/admin/gst-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      toast.success(`Invoice ${data.invoice.invoiceNumber} generated (B2C, no GSTIN)`);
      // Whether the ledger copy happened is part of the outcome, not a hidden detail.
      if (data.zoho?.detail) {
        (data.zoho.pushed ? toast.success : toast.info)(data.zoho.detail, { duration: 8000 });
      }
      await fetchInvoices();
    } catch (error: any) {
      toast.error(error.message || 'Could not generate the invoice');
    } finally {
      setGeneratingTxId(null);
    }
  };

  const filterInvoicesList = () => {
    let filtered = [...invoices];

    // Apply search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (invoice) =>
          invoice.invoiceNumber.toLowerCase().includes(search) ||
          invoice.customerName.toLowerCase().includes(search) ||
          invoice.customerEmail.toLowerCase().includes(search) ||
          invoice.user.name?.toLowerCase().includes(search) ||
          invoice.user.email.toLowerCase().includes(search)
      );
    }

    // Apply status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter((invoice) => invoice.status === filterStatus);
    }

    setFilteredInvoices(filtered);
  };

  const handleViewInvoice = (invoiceId: string) => {
    window.open(`/api/admin/gst-invoices/${invoiceId}/pdf`, '_blank');
  };

  const handleDownloadInvoice = (invoiceId: string, invoiceNumber: string) => {
    // Open in new tab for download
    window.open(`/api/admin/gst-invoices/${invoiceId}/pdf`, '_blank');
    toast.success(`Opening invoice ${invoiceNumber} for download`);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const getTotalRevenue = () => {
    return filteredInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
  };

  const getTotalGst = () => {
    return filteredInvoices.reduce((sum, invoice) => sum + invoice.totalGst, 0);
  };

  const handleExportToExcel = async () => {
    try {
      setIsExporting(true);
      
      // Build query parameters
      const params = new URLSearchParams();
      if (exportMonth) {
        params.append('month', exportMonth);
      } else if (exportYear) {
        params.append('year', exportYear);
      }
      
      const url = `/api/admin/gst-invoices/export-excel${params.toString() ? '?' + params.toString() : ''}`;
      
      // Fetch the Excel file
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Export failed' }));
        throw new Error(errorData.error || 'Failed to export GST invoices');
      }
      
      // Get the blob
      const blob = await response.blob();
      
      // Create download link
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      
      // Get filename from response headers or create default
      const periodText = exportMonth ? exportMonth : exportYear ? exportYear : 'All';
      a.download = `GST_Report_${periodText}_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
      
      toast.success('GST report exported successfully!');
    } catch (error: any) {
      console.error('Error exporting GST report:', error);
      toast.error(error.message || 'Failed to export GST report');
    } finally {
      setIsExporting(false);
    }
  };

  const getCurrentMonth = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  const getCurrentYear = () => {
    return new Date().getFullYear().toString();
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading GST invoices...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <FileText className="h-8 w-8 text-emerald-600" />
          <h1 className="text-3xl font-bold text-gray-900">GST Invoices Review</h1>
        </div>
        <p className="text-gray-600">
          Review and manage all GST invoices for tax filing purposes
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Invoices
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-emerald-600" />
              <span className="text-2xl font-bold text-gray-900">
                {filteredInvoices.length}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <IndianRupee className="h-5 w-5 text-green-600" />
              <span className="text-2xl font-bold text-gray-900">
                {formatCurrency(getTotalRevenue())}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total GST Collected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-orange-600" />
              <span className="text-2xl font-bold text-gray-900">
                {formatCurrency(getTotalGst())}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Export to Excel */}
      <Card className="mb-6 bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-green-600" />
            <CardTitle className="text-lg">Export GST Report for Filing</CardTitle>
          </div>
          <CardDescription>
            Export GST invoices to Excel format for monthly/yearly GST return filing
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Export by Month
                </label>
                <Input
                  type="month"
                  value={exportMonth}
                  onChange={(e) => {
                    setExportMonth(e.target.value);
                    setExportYear(''); // Clear year when month is selected
                  }}
                  max={getCurrentMonth()}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Or Export by Year
                </label>
                <Input
                  type="number"
                  placeholder="YYYY"
                  value={exportYear}
                  onChange={(e) => {
                    setExportYear(e.target.value);
                    setExportMonth(''); // Clear month when year is entered
                  }}
                  min="2020"
                  max={getCurrentYear()}
                  className="w-full"
                />
              </div>
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleExportToExcel}
                disabled={isExporting}
                className="bg-green-600 hover:bg-green-700 text-white w-full md:w-auto"
                size="lg"
              >
                {isExporting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Exporting...
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Export to Excel
                  </>
                )}
              </Button>
            </div>
          </div>
          <div className="mt-4 p-3 bg-white rounded-lg border border-green-200">
            <p className="text-sm text-gray-600">
              <strong>Note:</strong> The Excel file will include all necessary columns for GST filing:
              Invoice details, GSTIN, taxable value, CGST/SGST/IGST amounts, and totals.
              Leave both fields empty to export all invoices.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search by invoice number, customer name, email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant={filterStatus === 'all' ? 'default' : 'outline'}
                onClick={() => setFilterStatus('all')}
                size="sm"
              >
                All
              </Button>
              <Button
                variant={filterStatus === 'generated' ? 'default' : 'outline'}
                onClick={() => setFilterStatus('generated')}
                size="sm"
              >
                Generated
              </Button>
              <Button
                variant={filterStatus === 'sent' ? 'default' : 'outline'}
                onClick={() => setFilterStatus('sent')}
                size="sm"
              >
                Sent
              </Button>
              <Button
                variant={filterStatus === 'pending_billing_details' ? 'default' : 'outline'}
                onClick={() => setFilterStatus('pending_billing_details')}
                size="sm"
              >
                Pending Details
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoices List */}
      {filteredInvoices.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No invoices found
              </h3>
              <p className="text-gray-600">
                {searchTerm || filterStatus !== 'all'
                  ? 'Try adjusting your filters'
                  : 'No GST invoices have been generated yet'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredInvoices.map((invoice) => (
            <Card key={invoice.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  {/* Invoice Details */}
                  <div className="flex-1 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {invoice.invoiceNumber}
                          </h3>
                          <Badge variant="outline">{invoice.status}</Badge>
                          {invoice.status === 'pending_billing_details' && (
                            <Badge variant="secondary">Paid - Details Pending</Badge>
                          )}
                          {invoice.isInterstate && (
                            <Badge variant="secondary">Interstate</Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">
                          {invoice.description}
                        </p>
                        {invoice.status === 'pending_billing_details' && (
                          <p className="text-sm text-amber-700 mt-1">
                            Payment is successful, but the customer has not submitted GST billing details yet.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-4 w-4 text-gray-400" />
                          <span className="font-medium text-gray-700">
                            Customer:
                          </span>
                          <span className="text-gray-600">
                            {invoice.customerName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-600 ml-6">
                            {invoice.customerEmail}
                          </span>
                        </div>
                        {invoice.customerGstin && (
                          <div className="flex items-center gap-2 text-sm ml-6">
                            <span className="font-medium text-gray-700">
                              GSTIN:
                            </span>
                            <span className="text-gray-600">
                              {invoice.customerGstin}
                            </span>
                          </div>
                        )}
                        {invoice.razorpayOrderId && (
                          <div className="flex items-center gap-2 text-sm ml-6">
                            <span className="font-medium text-gray-700">
                              Order:
                            </span>
                            <span className="text-gray-600">
                              {invoice.razorpayOrderId}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          <span className="font-medium text-gray-700">
                            Invoice Date:
                          </span>
                          <span className="text-gray-600">
                            {formatDate(invoice.invoiceDate)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-4 w-4 text-gray-400" />
                          <span className="font-medium text-gray-700">
                            System User:
                          </span>
                          <span className="text-gray-600">
                            {invoice.user.name || invoice.user.email}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Amount Breakdown */}
                    <div className="flex flex-wrap gap-4 pt-2 border-t">
                      <div className="text-sm">
                        <span className="text-gray-600">Subtotal: </span>
                        <span className="font-semibold text-gray-900">
                          {formatCurrency(invoice.subtotal)}
                        </span>
                      </div>
                      {!invoice.isInterstate ? (
                        <>
                          <div className="text-sm">
                            <span className="text-gray-600">CGST: </span>
                            <span className="font-semibold text-gray-900">
                              {formatCurrency(invoice.cgst)}
                            </span>
                          </div>
                          <div className="text-sm">
                            <span className="text-gray-600">SGST: </span>
                            <span className="font-semibold text-gray-900">
                              {formatCurrency(invoice.sgst)}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="text-sm">
                          <span className="text-gray-600">IGST: </span>
                          <span className="font-semibold text-gray-900">
                            {formatCurrency(invoice.igst)}
                          </span>
                        </div>
                      )}
                      <div className="text-sm">
                        <span className="text-gray-600">Total: </span>
                        <span className="font-bold text-emerald-600 text-base">
                          {formatCurrency(invoice.totalAmount)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex lg:flex-col gap-2">
                    {invoice.status === 'pending_billing_details' ? (
                      // A dead end until now: users without GST registration skip the
                      // billing dialog (nothing to put in it), and their payments sat
                      // "awaiting" forever. The supplier's duty to invoice does not
                      // depend on the customer holding a GSTIN — so issue it B2C from
                      // the account's own details.
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={generatingTxId === invoice.razorpayTransactionId}
                        onClick={() => handleGenerateB2C(invoice.razorpayTransactionId)}
                        className="flex-1 lg:flex-none"
                      >
                        {generatingTxId === invoice.razorpayTransactionId ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <FileText className="h-4 w-4 mr-2" />
                        )}
                        Generate (no GSTIN)
                      </Button>
                    ) : (
                      <>
                        <Button
                          onClick={() => handleViewInvoice(invoice.id)}
                          variant="outline"
                          size="sm"
                          className="flex-1 lg:flex-none"
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View
                        </Button>
                        <Button
                          onClick={() =>
                            handleDownloadInvoice(invoice.id, invoice.invoiceNumber)
                          }
                          size="sm"
                          className="flex-1 lg:flex-none"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                      </>
                    )}
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
