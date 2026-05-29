
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle, CalendarClock, Calculator as CalcIcon } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { BillAmountCalculator } from '@/components/bill-amount-calculator';

interface ExtensionSubcategory {
  id: string;
  code: string;
  name: string;
  description: string;
  displayOrder: number;
  isActive: boolean;
}

interface ExtensionFormDialogProps {
  contractId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originalCompletionDate?: Date | null;
}

export function ExtensionFormDialog({
  contractId,
  open,
  onOpenChange,
  originalCompletionDate
}: ExtensionFormDialogProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [subcategories, setSubcategories] = useState<ExtensionSubcategory[]>([]);
  const [formData, setFormData] = useState({
    extensionType: '17A',
    extensionSubcategory: 'I',
    originalCompletionDate: originalCompletionDate 
      ? format(new Date(originalCompletionDate), 'yyyy-MM-dd')
      : '',
    extendedCompletionDate: '',
    liquidatedDamagesRate: ''
  });

  // Fetch subcategories when dialog opens
  useEffect(() => {
    if (open) {
      fetchSubcategories();
    }
  }, [open]);

  const fetchSubcategories = async () => {
    try {
      const response = await fetch('/api/extensions/subcategories');
      if (response.ok) {
        const data = await response.json();
        setSubcategories(data.subcategories.filter((s: ExtensionSubcategory) => s.isActive));
      }
    } catch (error) {
      console.error('Error fetching subcategories:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch(`/api/contracts/${contractId}/extensions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          liquidatedDamagesRate: formData.liquidatedDamagesRate 
            ? parseFloat(formData.liquidatedDamagesRate) 
            : null
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create extension');
      }

      toast.success('Contract extension added successfully!');
      onOpenChange(false);
      router.refresh();
      
      // Reset form
      setFormData({
        extensionType: '17A',
        extensionSubcategory: 'I',
        originalCompletionDate: originalCompletionDate 
          ? format(new Date(originalCompletionDate), 'yyyy-MM-dd')
          : '',
        extendedCompletionDate: '',
        liquidatedDamagesRate: ''
      });
    } catch (error: any) {
      console.error('Error creating extension:', error);
      toast.error(error.message || 'Failed to create extension');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-blue-600" />
            Add Contract Extension
          </DialogTitle>
          <DialogDescription>
            Record a contract time extension as per GCC Clauses 17A or 17B
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Extension Type */}
          <div className="space-y-2">
            <Label htmlFor="extensionType">Extension Type (GCC Clause) *</Label>
            <Select
              value={formData.extensionType}
              onValueChange={(value) =>
                setFormData({ ...formData, extensionType: value, extensionSubcategory: value === '17A' ? 'I' : '' })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select extension type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="17A">
                  17A - Extension Without Liquidated Damages (No PVC Restriction)
                </SelectItem>
                <SelectItem value="17B">
                  17B - Extension With Liquidated Damages (PVC Indices Capped)
                </SelectItem>
              </SelectContent>
            </Select>
            
            {formData.extensionType === '17B' && (
              <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-md">
                <AlertCircle className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-orange-800">
                  <strong>PVC Restriction:</strong> For Clause 17B extensions, PVC indices will be 
                  capped at the original completion date values. Future bills during the extension 
                  period will use these capped indices.
                </p>
              </div>
            )}
          </div>

          {/* Extension Subcategory (only for 17A) */}
          {formData.extensionType === '17A' && (
            <div className="space-y-2">
              <Label htmlFor="extensionSubcategory">Subcategory *</Label>
              <Select
                value={formData.extensionSubcategory}
                onValueChange={(value) =>
                  setFormData({ ...formData, extensionSubcategory: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select subcategory" />
                </SelectTrigger>
                <SelectContent>
                  {subcategories.map((subcategory) => (
                    <SelectItem key={subcategory.id} value={subcategory.code}>
                      {subcategory.code} - {subcategory.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.extensionSubcategory && subcategories.find(s => s.code === formData.extensionSubcategory) && (
                <p className="text-xs text-gray-600">
                  {subcategories.find(s => s.code === formData.extensionSubcategory)?.description}
                </p>
              )}
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="originalCompletionDate">Original Completion Date *</Label>
              <Input
                id="originalCompletionDate"
                type="date"
                value={formData.originalCompletionDate}
                onChange={(e) =>
                  setFormData({ ...formData, originalCompletionDate: e.target.value })
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="extendedCompletionDate">Extended Completion Date *</Label>
              <Input
                id="extendedCompletionDate"
                type="date"
                value={formData.extendedCompletionDate}
                onChange={(e) =>
                  setFormData({ ...formData, extendedCompletionDate: e.target.value })
                }
                required
                min={formData.originalCompletionDate}
              />
            </div>
          </div>



          {/* Liquidated Damages (only for 17B) */}
          {formData.extensionType === '17B' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="liquidatedDamagesRate">
                  Liquidated Damages Rate (% per week)
                </Label>
                <BillAmountCalculator
                  onInsertTotal={(total) => {
                    setFormData({ ...formData, liquidatedDamagesRate: total.toString() });
                  }}
                  label={<><CalcIcon className="h-4 w-4" /></>}
                />
              </div>
              <Input
                id="liquidatedDamagesRate"
                type="number"
                step="0.01"
                placeholder="e.g., 0.5"
                value={formData.liquidatedDamagesRate}
                onChange={(e) =>
                  setFormData({ ...formData, liquidatedDamagesRate: e.target.value })
                }
              />
              <p className="text-xs text-gray-500">
                Enter the weekly rate of liquidated damages as per contract terms
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Adding Extension...' : 'Add Extension'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
