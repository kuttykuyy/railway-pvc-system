'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { FileText, Save, ArrowLeft, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Contract {
  id: string;
  agreementNo: string;
  contractorName: string;
  workDescription: string;
}

interface Classification {
  id: string;
  code: string;
  name: string;
}

interface MobileBillFormProps {
  mode?: 'create' | 'edit';
  billId?: string;
}

export default function MobileBillForm({ mode = 'create', billId }: MobileBillFormProps) {
  const router = useRouter();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  const [formData, setFormData] = useState({
    contractId: '',
    billNo: '',
    grossBillAmount: '',
    billAmount: '',
    dateOfMeasurement: '',
    workClassification: '',
    zone: '',
    cementAmount: '',
    steelTmtBarsAmount: '',
    steelAngleChannelAmount: '',
    steelPlatesAmount: '',
    steelOtherSectionsAmount: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      
      // Load contracts
      const contractsRes = await fetch('/api/contracts');
      if (contractsRes.ok) {
        const contractsData = await contractsRes.json();
        setContracts(contractsData);
      }

      // Load classifications
      const classificationsRes = await fetch('/api/classifications');
      if (classificationsRes.ok) {
        const classificationsData = await classificationsRes.json();
        setClassifications(classificationsData);
      }

      // Load bill data if editing
      if (mode === 'edit' && billId) {
        const billRes = await fetch(`/api/bills/${billId}`);
        if (billRes.ok) {
          const billData = await billRes.json();
          setFormData({
            contractId: billData.contractId,
            billNo: billData.billNo,
            grossBillAmount: billData.grossBillAmount?.toString() || billData.billAmount.toString(),
            billAmount: billData.billAmount.toString(),
            dateOfMeasurement: billData.dateOfMeasurement.split('T')[0],
            workClassification: billData.workClassificationId || '',
            zone: billData.zone || '',
            cementAmount: billData.cementAmount?.toString() || '',
            steelTmtBarsAmount: billData.steelTmtBarsAmount?.toString() || '',
            steelAngleChannelAmount: billData.steelAngleChannelAmount?.toString() || '',
            steelPlatesAmount: billData.steelPlatesAmount?.toString() || '',
            steelOtherSectionsAmount: billData.steelOtherSectionsAmount?.toString() || '',
          });
        }
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load form data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const payload = {
        contractId: formData.contractId,
        billNo: formData.billNo,
        grossBillAmount: parseFloat(formData.grossBillAmount) || parseFloat(formData.billAmount),
        billAmount: parseFloat(formData.billAmount),
        dateOfMeasurement: formData.dateOfMeasurement,
        workClassificationId: formData.workClassification || null,
        zone: formData.zone,
        cementAmount: formData.cementAmount ? parseFloat(formData.cementAmount) : null,
        steelTmtBarsAmount: formData.steelTmtBarsAmount ? parseFloat(formData.steelTmtBarsAmount) : null,
        steelAngleChannelAmount: formData.steelAngleChannelAmount ? parseFloat(formData.steelAngleChannelAmount) : null,
        steelPlatesAmount: formData.steelPlatesAmount ? parseFloat(formData.steelPlatesAmount) : null,
        steelOtherSectionsAmount: formData.steelOtherSectionsAmount ? parseFloat(formData.steelOtherSectionsAmount) : null,
      };

      const endpoint = mode === 'edit' ? `/api/bills/${billId}` : '/api/bills';
      const method = mode === 'edit' ? 'PUT' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setSuccess(true);
        setTimeout(() => {
          router.push('/bills');
        }, 1500);
      } else {
        const errorData = await response.json();
        setError(errorData.error || `Failed to ${mode} bill`);
      }
    } catch (err) {
      console.error('Error submitting bill:', err);
      setError('An error occurred while saving the bill');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  const selectedContract = contracts.find(c => c.id === formData.contractId);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="h-8 w-8 p-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-purple-600" />
            <h1 className="text-lg font-semibold">
              {mode === 'edit' ? 'Edit Bill' : 'New Bill'}
            </h1>
          </div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="mx-4 mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-800">
            Bill {mode === 'edit' ? 'updated' : 'created'} successfully!
          </p>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-4 space-y-4 pb-24">
        {/* Contract */}
        <div className="space-y-2">
          <Label htmlFor="contractId" className="text-sm font-medium">Contract *</Label>
          <Select 
            value={formData.contractId} 
            onValueChange={(value) => handleSelectChange('contractId', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select contract" />
            </SelectTrigger>
            <SelectContent>
              {contracts.map((contract) => (
                <SelectItem key={contract.id} value={contract.id}>
                  {contract.agreementNo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedContract && (
            <p className="text-xs text-gray-600">{selectedContract.contractorName}</p>
          )}
        </div>

        {/* Bill Number */}
        <div className="space-y-2">
          <Label htmlFor="billNo" className="text-sm font-medium">Bill Number *</Label>
          <Input
            id="billNo"
            name="billNo"
            value={formData.billNo}
            onChange={handleInputChange}
            placeholder="Enter bill number"
            required
          />
        </div>

        {/* Zone */}
        <div className="space-y-2">
          <Label htmlFor="zone" className="text-sm font-medium">Zone *</Label>
          <Select 
            value={formData.zone} 
            onValueChange={(value) => handleSelectChange('zone', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select zone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Chennai">Chennai</SelectItem>
              <SelectItem value="Mumbai">Mumbai</SelectItem>
              <SelectItem value="Delhi">Delhi</SelectItem>
              <SelectItem value="Kolkata">Kolkata</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bill Amount */}
        <div className="space-y-2">
          <Label htmlFor="billAmount" className="text-sm font-medium">Bill Amount (₹) *</Label>
          <Input
            id="billAmount"
            name="billAmount"
            type="number"
            step="0.01"
            value={formData.billAmount}
            onChange={handleInputChange}
            placeholder="0.00"
            required
          />
        </div>

        {/* Date of Measurement */}
        <div className="space-y-2">
          <Label htmlFor="dateOfMeasurement" className="text-sm font-medium">Date of Measurement *</Label>
          <Input
            id="dateOfMeasurement"
            name="dateOfMeasurement"
            type="date"
            value={formData.dateOfMeasurement}
            onChange={handleInputChange}
            required
          />
        </div>

        {/* Work Classification */}
        <div className="space-y-2">
          <Label htmlFor="workClassification" className="text-sm font-medium">Classification</Label>
          <Select 
            value={formData.workClassification} 
            onValueChange={(value) => handleSelectChange('workClassification', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select classification" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {classifications.map((classification) => (
                <SelectItem key={classification.id} value={classification.id}>
                  {classification.code} - {classification.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Optional: Component Amounts */}
        <div className="pt-4 border-t space-y-4">
          <p className="text-sm font-medium text-gray-700">Optional Component Amounts</p>
          
          <div className="space-y-2">
            <Label htmlFor="cementAmount" className="text-sm">Cement (₹)</Label>
            <Input
              id="cementAmount"
              name="cementAmount"
              type="number"
              step="0.01"
              value={formData.cementAmount}
              onChange={handleInputChange}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="steelTmtBarsAmount" className="text-sm">Steel TMT Bars (₹)</Label>
            <Input
              id="steelTmtBarsAmount"
              name="steelTmtBarsAmount"
              type="number"
              step="0.01"
              value={formData.steelTmtBarsAmount}
              onChange={handleInputChange}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="steelAngleChannelAmount" className="text-sm">Steel Angle/Channel (₹)</Label>
            <Input
              id="steelAngleChannelAmount"
              name="steelAngleChannelAmount"
              type="number"
              step="0.01"
              value={formData.steelAngleChannelAmount}
              onChange={handleInputChange}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="steelPlatesAmount" className="text-sm">Steel Plates (₹)</Label>
            <Input
              id="steelPlatesAmount"
              name="steelPlatesAmount"
              type="number"
              step="0.01"
              value={formData.steelPlatesAmount}
              onChange={handleInputChange}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="steelOtherSectionsAmount" className="text-sm">Steel Other Sections (₹)</Label>
            <Input
              id="steelOtherSectionsAmount"
              name="steelOtherSectionsAmount"
              type="number"
              step="0.01"
              value={formData.steelOtherSectionsAmount}
              onChange={handleInputChange}
              placeholder="0.00"
            />
          </div>
        </div>
      </form>

      {/* Submit Button - Fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4">
        <Button
          onClick={handleSubmit}
          disabled={!formData.contractId || !formData.billNo || !formData.billAmount || !formData.dateOfMeasurement || isSubmitting}
          className="w-full h-12 text-base font-medium"
          size="lg"
        >
          {isSubmitting ? (
            <>
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              {mode === 'edit' ? 'Update Bill' : 'Create Bill'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
