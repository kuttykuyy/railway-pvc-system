
'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Send, Loader2, Download, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ReportTemplate {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isGlobal?: boolean;
}

interface WhatsAppSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billId: string;
  billNumber: string;
  contractorName?: string | null;
  contractorPhone?: string | null;
}

export function WhatsAppSendDialog({
  open,
  onOpenChange,
  billId,
  billNumber,
  contractorName,
  contractorPhone,
}: WhatsAppSendDialogProps) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  // Fetch templates when dialog opens
  useEffect(() => {
    if (open) {
      fetchTemplates();
    }
  }, [open]);

  const fetchTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const response = await fetch('/api/report-templates');
      
      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
        
        // Set default template if available
        const defaultTemplate = data.find((t: ReportTemplate) => t.isDefault);
        if (defaultTemplate) {
          setSelectedTemplateId(defaultTemplate.id);
        } else if (data.length > 0) {
          // Select first template if no default
          setSelectedTemplateId(data[0].id);
        }
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast({
        title: 'Warning',
        description: 'Could not load report templates. Using default format.',
        variant: 'default',
      });
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleFetchFromContract = () => {
    if (contractorPhone) {
      setPhoneNumber(contractorPhone);
    }
    if (contractorName) {
      setCustomerName(contractorName);
    }
    
    toast({
      title: 'Details Fetched',
      description: 'Phone number and customer name fetched from contract',
    });
  };

  const handleSend = async () => {
    if (!phoneNumber) {
      toast({
        title: 'Phone Number Required',
        description: 'Please enter a phone number to send the bill PDF',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSending(true);

      const response = await fetch('/api/whatsapp/send-bill', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          billId,
          phoneNumber,
          customerName: customerName || 'Customer',
          templateId: selectedTemplateId || undefined,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: 'Bill Sent Successfully',
          description: `Bill PDF sent via WhatsApp to ${phoneNumber}`,
        });
        onOpenChange(false);
        setPhoneNumber('');
        setCustomerName('');
      } else {
        toast({
          title: 'Failed to Send',
          description: data.error || 'Failed to send bill via WhatsApp',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('Error sending WhatsApp:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to send bill via WhatsApp',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Send Bill via WhatsApp</DialogTitle>
          <DialogDescription>
            Send the PDF report for bill {billNumber} to customer via WhatsApp
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Fetch Button */}
          {(contractorPhone || contractorName) && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleFetchFromContract}
                disabled={sending}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Fetch from Contract
              </Button>
            </div>
          )}

          {/* PDF Report Template Selection */}
          <div className="space-y-2">
            <Label htmlFor="template" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              PDF Report Template
            </Label>
            {loadingTemplates ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading templates...
              </div>
            ) : templates.length > 0 ? (
              <>
                <Select
                  value={selectedTemplateId}
                  onValueChange={setSelectedTemplateId}
                  disabled={sending}
                >
                  <SelectTrigger id="template">
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        <div className="flex items-center gap-2">
                          <span>{template.name}</span>
                          {template.isDefault && (
                            <span className="text-xs text-muted-foreground">(Default)</span>
                          )}
                          {template.isGlobal && (
                            <span className="text-xs px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">
                              Global
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTemplateId && templates.find(t => t.id === selectedTemplateId)?.description && (
                  <p className="text-sm text-muted-foreground">
                    {templates.find(t => t.id === selectedTemplateId)?.description}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No templates available. Using default PDF format.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number *</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="+919876543210 or 9876543210"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              disabled={sending}
            />
            <p className="text-sm text-muted-foreground">
              Enter phone number with country code (e.g., +91 for India)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="customerName">Customer Name (Optional)</Label>
            <Input
              id="customerName"
              type="text"
              placeholder="Enter customer name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              disabled={sending}
            />
            <p className="text-sm text-muted-foreground">
              Optional: Customer name for personalization
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send via WhatsApp
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
