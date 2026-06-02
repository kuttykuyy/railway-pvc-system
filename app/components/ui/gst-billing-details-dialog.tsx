
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, FileText, Download } from 'lucide-react';
import { toast } from 'sonner';

interface GstBillingDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactionId: string;
  creditAmount: number;
  invoiceNumber: string;
}

export function GstBillingDetailsDialog({
  open,
  onOpenChange,
  transactionId,
  creditAmount,
  invoiceNumber,
}: GstBillingDetailsDialogProps) {
  const { data: session } = useSession();
  
  const [formData, setFormData] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    customerGstin: '',
    customerAddress: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && session?.user) {
      setFormData(prev => ({
        ...prev,
        customerName: prev.customerName || session.user?.name || '',
        customerEmail: prev.customerEmail || session.user?.email || '',
      }));
    }
  }, [open, session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (!formData.customerName.trim()) {
      toast.error('Please enter customer/company name');
      return;
    }

    if (!formData.customerEmail.trim()) {
      toast.error('Please enter email address');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.customerEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }

    // GSTIN validation if provided
    if (formData.customerGstin.trim()) {
      const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstinRegex.test(formData.customerGstin.trim().toUpperCase())) {
        toast.error('Please enter a valid 15-character GSTIN (e.g., 22AAAAA0000A1Z5)');
        return;
      }
    }

    setLoading(true);

    try {
      // Generate GST invoice with billing details
      const response = await fetch('/api/gst-invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId,
          ...formData,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to generate invoice' }));
        throw new Error(errorData.error || 'Failed to generate invoice');
      }

      const data = await response.json();
      console.log('GST Invoice generated:', data);

      toast.success('GST invoice generated successfully!', { duration: 3000 });

      // Download PDF
      const pdfUrl = `/api/gst-invoices/${data.id}/pdf`;
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = `GST_Invoice_${invoiceNumber}.pdf`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success('GST invoice PDF downloaded!', { duration: 3000 });

      // Close dialog
      onOpenChange(false);

      // Reload page after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error: any) {
      console.error('Error generating GST invoice:', error);
      toast.error(error.message || 'Failed to generate GST invoice');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    toast.info('You can generate the GST invoice later from the Billing page');
    onOpenChange(false);
    window.location.reload();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            GST Invoice Billing Details
          </DialogTitle>
          <DialogDescription>
            Payment successful! Enter your billing details to generate GST invoice.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* Customer/Company Name */}
            <div className="space-y-2">
              <Label htmlFor="customerName">
                Customer/Company Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="customerName"
                value={formData.customerName}
                onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                placeholder="Enter name or company name"
                required
                disabled={loading}
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="customerEmail">
                Email Address <span className="text-red-500">*</span>
              </Label>
              <Input
                id="customerEmail"
                type="email"
                value={formData.customerEmail}
                onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
                placeholder="email@example.com"
                required
                disabled={loading}
              />
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label htmlFor="customerPhone">Phone Number (Optional)</Label>
              <Input
                id="customerPhone"
                type="tel"
                value={formData.customerPhone}
                onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                placeholder="Enter phone number"
                disabled={loading}
              />
            </div>

            {/* GSTIN */}
            <div className="space-y-2">
              <Label htmlFor="customerGstin">GSTIN (Optional)</Label>
              <Input
                id="customerGstin"
                value={formData.customerGstin}
                onChange={(e) => setFormData({ ...formData, customerGstin: e.target.value.toUpperCase() })}
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
                disabled={loading}
              />
              <p className="text-xs text-gray-500">
                15-character GST Identification Number (if applicable)
              </p>
            </div>

            {/* Address */}
            <div className="space-y-2">
              <Label htmlFor="customerAddress">Billing Address (Optional)</Label>
              <Textarea
                id="customerAddress"
                value={formData.customerAddress}
                onChange={(e) => setFormData({ ...formData, customerAddress: e.target.value })}
                placeholder="Enter full billing address"
                rows={3}
                disabled={loading}
              />
            </div>

            {/* Invoice Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">Invoice Number:</span>
                <span className="font-medium">{invoiceNumber}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">Credit Amount:</span>
                <span className="font-medium">₹{creditAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">GST (18%):</span>
                <span className="font-medium">₹{(creditAmount * 0.18).toFixed(2)}</span>
              </div>
              <div className="border-t border-blue-300 pt-1 flex justify-between text-base font-semibold">
                <span className="text-gray-900">Total:</span>
                <span className="text-blue-600">₹{(creditAmount * 1.18).toFixed(2)}</span>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleSkip}
              disabled={loading}
              className="w-full sm:w-auto"
            >
              Skip for Now
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Generate & Download Invoice
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
