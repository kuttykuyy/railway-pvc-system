
'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, Phone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'react-hot-toast';

interface WhatsAppNumberAlertProps {
  userEmail?: string;
  userName?: string;
  hasPhone: boolean;
}

export function WhatsAppNumberAlert({ userEmail, userName, hasPhone }: WhatsAppNumberAlertProps) {
  const [showBanner, setShowBanner] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    console.log('[WhatsAppNumberAlert] Props received:', {
      hasPhone,
      dismissed,
      userName,
      userEmail
    });
    
    // Show banner only if user doesn't have a phone number and hasn't dismissed it
    if (!hasPhone && !dismissed) {
      console.log('[WhatsAppNumberAlert] Showing banner');
      setShowBanner(true);
    } else {
      console.log('[WhatsAppNumberAlert] Not showing banner - hasPhone:', hasPhone, 'dismissed:', dismissed);
    }
  }, [hasPhone, dismissed, userName, userEmail]);

  const handleSave = async () => {
    // Validate phone number format
    const phoneRegex = /^\+[1-9]\d{9,14}$/;
    if (!phoneRegex.test(whatsappNumber)) {
      toast.error('Please enter a valid phone number with country code (e.g., +919876543210)');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/user/update-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: whatsappNumber }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update phone number');
      }

      toast.success('WhatsApp number added successfully!');

      setShowDialog(false);
      setShowBanner(false);
      
      // Refresh the page to update the user data
      window.location.reload();
    } catch (error: any) {
      console.error('Error updating phone:', error);
      toast.error(error.message || 'Failed to update WhatsApp number');
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    setShowBanner(false);
  };

  if (!showBanner) {
    console.log('[WhatsAppNumberAlert] Banner not showing - showBanner:', showBanner);
    return null;
  }

  console.log('[WhatsAppNumberAlert] Rendering banner');
  return (
    <>
      {/* Banner Alert */}
      <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-800">
                WhatsApp Number Required
              </h3>
              <p className="text-sm text-amber-700 mt-1">
                Please add your WhatsApp number to receive important notifications, bill updates, and reports.
              </p>
              <Button
                onClick={() => setShowDialog(true)}
                size="sm"
                className="mt-3 bg-amber-600 hover:bg-amber-700 text-white"
              >
                <Phone className="h-4 w-4 mr-2" />
                Add WhatsApp Number
              </Button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-amber-600 hover:text-amber-800 ml-4"
            aria-label="Dismiss"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Dialog for adding WhatsApp number */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Phone className="h-5 w-5 text-blue-600" />
              <span>Add WhatsApp Number</span>
            </DialogTitle>
            <DialogDescription>
              Enter your WhatsApp number to receive notifications and reports.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="whatsapp-number">WhatsApp Number</Label>
              <Input
                id="whatsapp-number"
                type="tel"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                placeholder="+919876543210"
                className="w-full"
              />
              <p className="text-xs text-gray-500">
                Include country code (e.g., +91 for India)
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-800">
                <strong>Why we need this:</strong>
              </p>
              <ul className="text-xs text-blue-700 mt-1 space-y-1 ml-4 list-disc">
                <li>Receive bill notifications instantly</li>
                <li>Get PDF reports via WhatsApp</li>
                <li>Quick updates on approvals</li>
              </ul>
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !whatsappNumber}
            >
              {saving ? 'Saving...' : 'Save Number'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
