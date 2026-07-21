
"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, FileText } from 'lucide-react';
import { toast } from 'sonner';

interface CoveringLetterFieldsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  contractId: string;
  agreementNo: string;
  currentDesignation?: string;
  currentLoaDate?: string;
  onSuccess: () => void;
}

export function CoveringLetterFieldsDialog({
  isOpen,
  onClose,
  contractId,
  agreementNo,
  currentDesignation,
  currentLoaDate,
  onSuccess
}: CoveringLetterFieldsDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [designation, setDesignation] = useState(currentDesignation || '');
  const [loaDate, setLoaDate] = useState(currentLoaDate || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!designation.trim()) {
      toast.error('Please enter designation');
      return;
    }

    if (!loaDate) {
      toast.error('Please select LOA date');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`/api/contracts/${contractId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          coveringLetterDesignation: designation,
          loaDate: loaDate,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update contract');
      }

      toast.success('Contract updated successfully');
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error updating contract:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update contract');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-emerald-600" />
            Add Covering Letter Details
          </DialogTitle>
          <DialogDescription>
            Please provide the following details for contract <strong>{agreementNo}</strong> to generate the covering letter.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="designation" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Designation
            </Label>
            <Input
              id="designation"
              name="designation"
              placeholder="e.g., Sr. DEN/MAS"
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              required
            />
            <p className="text-xs text-gray-500">
              The designation of the railway official to whom the covering letter is addressed
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="loaDate" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              LOA Date
            </Label>
            <Input
              id="loaDate"
              name="loaDate"
              type="date"
              value={loaDate}
              onChange={(e) => setLoaDate(e.target.value)}
              required
            />
            <p className="text-xs text-gray-500">
              The date of the Letter of Acceptance (LOA)
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save and Download'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
