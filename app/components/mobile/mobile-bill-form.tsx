'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { FileText, Save, ArrowLeft, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/components/i18n-provider';

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
  const { t, language } = useLanguage();
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
      setError(language === 'hi' ? 'फ़ॉर्म डेटा लोड करने में विफल' : 'Failed to load form data');
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
        setError(errorData.error || (language === 'hi' ? `बिल ${mode === 'edit' ? 'अपडेट' : 'बनाने'} करने में विफल` : `Failed to ${mode} bill`));
      }
    } catch (err) {
      console.error('Error submitting bill:', err);
      setError(language === 'hi' ? 'बिल सहेजते समय एक त्रुटि हुई' : 'An error occurred while saving the bill');
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
              {mode === 'edit' ? t('form.bill.edit_title') : t('form.bill.add_title')}
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
            {language === 'hi' ? `बिल सफलतापूर्वक ${mode === 'edit' ? 'अपडेट' : 'बनाया'} किया गया!` : `Bill ${mode === 'edit' ? 'updated' : 'created'} successfully!`}
          </p>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-4 space-y-4 pb-24">
        {/* Contract */}
        <div className="space-y-2">
          <Label htmlFor="contractId" className="text-sm font-medium">{t('form.bill.contract')} *</Label>
          <Select 
            value={formData.contractId} 
            onValueChange={(value) => handleSelectChange('contractId', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('form.bill.select_contract')} />
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
          <Label htmlFor="billNo" className="text-sm font-medium">{t('form.bill.bill_no')} *</Label>
          <Input
            id="billNo"
            name="billNo"
            value={formData.billNo}
            onChange={handleInputChange}
            placeholder={language === 'hi' ? 'बिल संख्या दर्ज करें' : 'Enter bill number'}
            required
          />
        </div>

        {/* Zone */}
        <div className="space-y-2">
          <Label htmlFor="zone" className="text-sm font-medium">{t('form.bill.zone')} *</Label>
          <Select 
            value={formData.zone} 
            onValueChange={(value) => handleSelectChange('zone', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('form.bill.select_zone')} />
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
          <Label htmlFor="billAmount" className="text-sm font-medium">{language === 'hi' ? 'बिल राशि (₹) *' : 'Bill Amount (₹) *'}</Label>
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
          <Label htmlFor="dateOfMeasurement" className="text-sm font-medium">{t('form.bill.date_measurement')} *</Label>
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
          <Label htmlFor="workClassification" className="text-sm font-medium">{language === 'hi' ? 'वर्गीकरण' : 'Classification'}</Label>
          <Select 
            value={formData.workClassification} 
            onValueChange={(value) => handleSelectChange('workClassification', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder={language === 'hi' ? 'वर्गीकरण चुनें' : 'Select classification'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{language === 'hi' ? 'कोई नहीं' : 'None'}</SelectItem>
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
          <p className="text-sm font-medium text-gray-700">{t('form.bill.optional_components')}</p>
          
          <div className="space-y-2">
            <Label htmlFor="cementAmount" className="text-sm">{t('form.bill.cement')}</Label>
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
            <Label htmlFor="steelTmtBarsAmount" className="text-sm">{t('form.bill.steel_tmt')}</Label>
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
            <Label htmlFor="steelAngleChannelAmount" className="text-sm">{t('form.bill.steel_angle')}</Label>
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
            <Label htmlFor="steelPlatesAmount" className="text-sm">{t('form.bill.steel_plates')}</Label>
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
            <Label htmlFor="steelOtherSectionsAmount" className="text-sm">{t('form.bill.steel_other')}</Label>
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
              {t('form.bill.saving')}
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              {mode === 'edit'
                ? (language === 'hi' ? 'बिल अपडेट करें' : 'Update Bill')
                : (language === 'hi' ? 'बिल बनाएं' : 'Create Bill')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
