
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StatusMessage } from '@/components/ui/status-message';
import { ValidationMessage } from '@/components/ui/validation-message';
import { Calendar, Save, AlertTriangle, CheckCircle2, Info, FileText, IndianRupee, Clock, Package, Calculator as CalcIcon, Sparkles, Mail, ListOrdered, Plus, Trash2 } from 'lucide-react';
import { checkPvcEligibility, formatContractValue, GCC_PVC_MINIMUM_VALUE, GCC_PVC_MINIMUM_MONTHS } from '@/lib/gcc-compliance';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  validateContractDate,
  validateAmount,
  validatePvcEligibility,
  validateAgreementNumber,
  combineValidationResults,
  type ValidationResult
} from '@/lib/validation';
import { DocumentScanner } from '@/components/document-scanner';
import { BillAmountCalculator } from '@/components/bill-amount-calculator';

interface ContractFormProps {
  initialData?: {
    agreementNo: string;
    loaNo?: string;
    loaDate?: string;
    contractorName: string;
    contractorPhone?: string;
    workDescription: string;
    dateOfOpening: string;
    tenderAdvertisedValue?: number;
    contractValue?: number;
    completionPeriodMonths?: number;
    hasRailwaySuppliedMaterials?: boolean;
    railwaySuppliedMaterialsNote?: string;
    coveringLetterDesignation?: string;
    schedules?: string[];
  };
  isEdit?: boolean;
  contractId?: string;
}

export default function ContractForm({ initialData, isEdit = false, contractId }: ContractFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [pvcEligibility, setPvcEligibility] = useState<any>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    agreementNo: initialData?.agreementNo || '',
    loaNo: initialData?.loaNo || '',
    loaDate: initialData?.loaDate || '',
    contractorName: initialData?.contractorName || '',
    contractorPhone: initialData?.contractorPhone || '',
    workDescription: initialData?.workDescription || '',
    dateOfOpening: initialData?.dateOfOpening || '',
    tenderAdvertisedValue: initialData?.tenderAdvertisedValue?.toString() || '',
    contractValue: initialData?.contractValue?.toString() || '',
    completionPeriodMonths: initialData?.completionPeriodMonths?.toString() || '',
    hasRailwaySuppliedMaterials: initialData?.hasRailwaySuppliedMaterials || false,
    railwaySuppliedMaterialsNote: initialData?.railwaySuppliedMaterialsNote || '',
    coveringLetterDesignation: initialData?.coveringLetterDesignation || ''
  });

  const [schedules, setSchedules] = useState<string[]>(initialData?.schedules || []);

  // Check PVC eligibility when tender advertised value or duration changes
  useEffect(() => {
    const tenderValue = formData.tenderAdvertisedValue ? parseFloat(formData.tenderAdvertisedValue) : undefined;
    const months = formData.completionPeriodMonths ? parseInt(formData.completionPeriodMonths) : undefined;
    
    if (tenderValue || months) {
      const result = checkPvcEligibility(tenderValue, months);
      setPvcEligibility(result);
    } else {
      setPvcEligibility(null);
    }
  }, [formData.tenderAdvertisedValue, formData.completionPeriodMonths]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear field error when user starts typing
    if (fieldErrors[name]) {
      setFieldErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleCheckboxChange = (checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      hasRailwaySuppliedMaterials: checked
    }));
  };

  /**
   * Handle data extracted from document scanner
   */
  const handleDocumentDataExtracted = (data: any) => {
    const updates: any = {};

    // Map extracted data to form fields
    if (data.agreementNo) updates.agreementNo = data.agreementNo;
    if (data.loaNo) updates.loaNo = data.loaNo;
    if (data.contractorName) updates.contractorName = data.contractorName;
    if (data.workDescription) updates.workDescription = data.workDescription;
    if (data.dateOfOpening) updates.dateOfOpening = data.dateOfOpening;
    
    // Map financial values - tender advertised value and agreement amount
    if (data.tenderAdvertisedValue) updates.tenderAdvertisedValue = data.tenderAdvertisedValue.toString();
    if (data.agreementAmount) updates.contractValue = data.agreementAmount.toString();
    
    if (data.completionPeriodMonths) updates.completionPeriodMonths = data.completionPeriodMonths.toString();

    // Update form data with extracted values
    setFormData(prev => ({
      ...prev,
      ...updates
    }));

    // Clear any existing field errors for updated fields
    setFieldErrors(prev => {
      const newErrors = { ...prev };
      Object.keys(updates).forEach(key => {
        delete newErrors[key];
      });
      return newErrors;
    });
  };

  /**
   * Validate form before submission
   */
  const validateForm = (): boolean => {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];
    const newFieldErrors: Record<string, string> = {};

    // Validate agreement number
    const agreementValidation = validateAgreementNumber(formData.agreementNo);
    if (!agreementValidation.isValid) {
      allErrors.push(...agreementValidation.errors);
      newFieldErrors.agreementNo = agreementValidation.errors[0];
    }
    allWarnings.push(...agreementValidation.warnings);

    // Validate contractor name
    if (!formData.contractorName.trim()) {
      allErrors.push('Contractor name is required.');
      newFieldErrors.contractorName = 'Please enter the contractor name';
    }

    // Validate work description
    if (!formData.workDescription.trim()) {
      allErrors.push('Work description is required.');
      newFieldErrors.workDescription = 'Please enter the work description';
    } else if (formData.workDescription.trim().length < 10) {
      allWarnings.push('Work description is very short. Please provide more details for clarity.');
    }

    // Validate date of opening
    if (!formData.dateOfOpening) {
      allErrors.push('Date of opening is required.');
      newFieldErrors.dateOfOpening = 'Please select the date';
    } else {
      const dateValidation = validateContractDate(formData.dateOfOpening);
      if (!dateValidation.isValid) {
        allErrors.push(...dateValidation.errors);
        newFieldErrors.dateOfOpening = dateValidation.errors[0];
      }
      allWarnings.push(...dateValidation.warnings);
    }

    // Validate tender advertised value if provided
    if (formData.tenderAdvertisedValue) {
      const tenderValidation = validateAmount(
        formData.tenderAdvertisedValue,
        'Tender advertised value',
        { isCurrency: true, allowZero: false }
      );
      if (!tenderValidation.isValid) {
        allErrors.push(...tenderValidation.errors);
        newFieldErrors.tenderAdvertisedValue = tenderValidation.errors[0];
      }
      allWarnings.push(...tenderValidation.warnings);
    }

    // Validate contract value if provided
    if (formData.contractValue) {
      const contractValidation = validateAmount(
        formData.contractValue,
        'Agreement value',
        { isCurrency: true, allowZero: false }
      );
      if (!contractValidation.isValid) {
        allErrors.push(...contractValidation.errors);
        newFieldErrors.contractValue = contractValidation.errors[0];
      }
      allWarnings.push(...contractValidation.warnings);
    }

    // Validate completion period if provided
    if (formData.completionPeriodMonths) {
      const months = parseInt(formData.completionPeriodMonths);
      if (isNaN(months) || months < 1) {
        allErrors.push('Completion period must be at least 1 month.');
        newFieldErrors.completionPeriodMonths = 'Please enter a valid number of months';
      } else if (months > 120) {
        allWarnings.push(`Completion period of ${months} months (${Math.floor(months / 12)} years) is very long. Please verify.`);
      }
    }

    // Validate PVC eligibility
    const tenderValue = formData.tenderAdvertisedValue ? parseFloat(formData.tenderAdvertisedValue) : null;
    const contractVal = formData.contractValue ? parseFloat(formData.contractValue) : null;
    const months = formData.completionPeriodMonths ? parseInt(formData.completionPeriodMonths) : null;
    
    const pvcValidation = validatePvcEligibility(tenderValue, contractVal, months);
    allWarnings.push(...pvcValidation.warnings);

    // Validate railway materials note if checkbox is checked
    if (formData.hasRailwaySuppliedMaterials && !formData.railwaySuppliedMaterialsNote?.trim()) {
      allWarnings.push('You indicated materials are supplied by Railway but did not provide details. Please add details or uncheck the option.');
    }

    setValidationErrors(allErrors);
    setValidationWarnings(allWarnings);
    setFieldErrors(newFieldErrors);

    return allErrors.length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear previous validation
    setValidationErrors([]);
    setValidationWarnings([]);
    setFieldErrors({});
    setError('');

    // Validate form
    if (!validateForm()) {
      // Scroll to top to show errors
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setIsLoading(true);

    try {
      const url = isEdit ? `/api/contracts/${contractId}` : '/api/contracts';
      const method = isEdit ? 'PUT' : 'POST';
      
      // Prepare data with proper type conversions
      const submitData = {
        ...formData,
        tenderAdvertisedValue: formData.tenderAdvertisedValue ? parseFloat(formData.tenderAdvertisedValue) : null,
        contractValue: formData.contractValue ? parseFloat(formData.contractValue) : null,
        completionPeriodMonths: formData.completionPeriodMonths ? parseInt(formData.completionPeriodMonths) : null,
        schedules: schedules.filter(s => s.trim() !== ''),
      };
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submitData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save contract');
      }

      const contract = await response.json();
      
      // Redirect to the contract detail page
      router.push(`/contracts/${contract.id}`);
    } catch (error: any) {
      console.error('Error saving contract:', error);
      setError(error.message || 'Failed to save contract');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <ValidationMessage
          type="error"
          messages={validationErrors}
        />
      )}

      {/* Validation Warnings */}
      {validationWarnings.length > 0 && (
        <ValidationMessage
          type="warning"
          messages={validationWarnings}
        />
      )}

      {/* API Errors */}
      {error && (
        <StatusMessage
          type="error"
          title="Error"
          message={error}
        />
      )}

      <Accordion type="multiple" defaultValue={['basic', 'financial', 'timeline', 'materials', 'covering-letter']} className="space-y-4">
        {/* Document Scanner - Only show for new contracts */}
        {!isEdit && (
          <AccordionItem value="scanner" className="border rounded-lg px-4 bg-gradient-to-r from-amber-50 to-orange-50">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-600 rounded-lg">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-gray-900">AI Document Scanner</h3>
                  <p className="text-sm text-gray-600">Auto-fill form by scanning contract documents</p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <DocumentScanner
                documentType="contract"
                onDataExtracted={handleDocumentDataExtracted}
              />
            </AccordionContent>
          </AccordionItem>
        )}
        {/* Basic Information Section */}
        <AccordionItem value="basic" className="border rounded-lg px-4 bg-gradient-to-r from-blue-50 to-indigo-50">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <FileText className="h-5 w-5 text-white" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-gray-900">Basic Information</h3>
                <p className="text-sm text-gray-600">Agreement details and work description</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="agreementNo" className="text-sm font-medium">
                  Agreement Number <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="agreementNo"
                  name="agreementNo"
                  value={formData.agreementNo}
                  onChange={handleInputChange}
                  placeholder="e.g., SR/MAS/Civil/2023/0019"
                  required
                  className={`border-gray-300 focus:border-blue-500 ${fieldErrors.agreementNo ? 'border-red-500 focus:border-red-500' : ''}`}
                />
                {fieldErrors.agreementNo && (
                  <p className="text-sm text-red-600">{fieldErrors.agreementNo}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="loaNo" className="text-sm font-medium">
                  LOA Number <span className="text-xs text-gray-500">(Optional)</span>
                </Label>
                <Input
                  id="loaNo"
                  name="loaNo"
                  value={formData.loaNo}
                  onChange={handleInputChange}
                  placeholder="e.g., LOA/2023/Civil/019"
                  className="border-gray-300 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contractorName" className="text-sm font-medium">
                Contractor Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="contractorName"
                name="contractorName"
                value={formData.contractorName}
                onChange={handleInputChange}
                placeholder="e.g., V R RADHAKRISHNAN"
                required
                className={`border-gray-300 focus:border-blue-500 ${fieldErrors.contractorName ? 'border-red-500 focus:border-red-500' : ''}`}
              />
              {fieldErrors.contractorName && (
                <p className="text-sm text-red-600">{fieldErrors.contractorName}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="contractorPhone" className="text-sm font-medium">
                Contractor Phone (for WhatsApp notifications)
              </Label>
              <Input
                id="contractorPhone"
                name="contractorPhone"
                value={formData.contractorPhone}
                onChange={handleInputChange}
                placeholder="e.g., 9876543210"
                type="tel"
                maxLength={10}
                className="border-gray-300 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500">
                📱 Bill PDFs will be automatically sent to this number via WhatsApp when bills are created
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="workDescription" className="text-sm font-medium">
                Work Description <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="workDescription"
                name="workDescription"
                value={formData.workDescription}
                onChange={handleInputChange}
                placeholder="e.g., MS-VM section (CTR(P)) - 9.065 km"
                rows={3}
                required
                className={`border-gray-300 focus:border-blue-500 resize-none ${fieldErrors.workDescription ? 'border-red-500 focus:border-red-500' : ''}`}
              />
              {fieldErrors.workDescription && (
                <p className="text-sm text-red-600">{fieldErrors.workDescription}</p>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Financial Details Section */}
        <AccordionItem value="financial" className="border rounded-lg px-4 bg-gradient-to-r from-green-50 to-emerald-50">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-600 rounded-lg">
                <IndianRupee className="h-5 w-5 text-white" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-gray-900">Financial Details</h3>
                <p className="text-sm text-gray-600">Contract values and PVC eligibility</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4 space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-900">
                  <p className="font-semibold mb-1">GCC 46A.1 - PVC Applicability Criteria</p>
                  <p className="text-blue-700">PVC applies if tender value exceeds ₹2 Crores and completion period is above 12 months</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="tenderAdvertisedValue" className="text-sm font-medium">
                    Tender Advertised Value (₹) <span className="text-xs text-gray-500">(Optional)</span>
                  </Label>
                  <BillAmountCalculator
                    onInsertTotal={(total) => {
                      setFormData(prev => ({ ...prev, tenderAdvertisedValue: total.toString() }));
                      if (fieldErrors.tenderAdvertisedValue) {
                        setFieldErrors(prev => {
                          const newErrors = { ...prev };
                          delete newErrors.tenderAdvertisedValue;
                          return newErrors;
                        });
                      }
                    }}
                    label={<><CalcIcon className="h-4 w-4" /></>}
                  />
                </div>
                <Input
                  id="tenderAdvertisedValue"
                  name="tenderAdvertisedValue"
                  type="number"
                  step="0.01"
                  value={formData.tenderAdvertisedValue}
                  onChange={handleInputChange}
                  placeholder="e.g., 25000000 (2.5 Crores)"
                  className={`border-gray-300 focus:border-green-500 ${fieldErrors.tenderAdvertisedValue ? 'border-red-500 focus:border-red-500' : ''}`}
                />
                {fieldErrors.tenderAdvertisedValue && (
                  <p className="text-sm text-red-600">{fieldErrors.tenderAdvertisedValue}</p>
                )}
                <p className="text-xs text-gray-600">
                  PVC applies if tender value exceeds ₹2 Crores
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="contractValue" className="text-sm font-medium">
                    AGREEMENT VALUE (₹) <span className="text-xs text-gray-500">(Optional)</span>
                  </Label>
                  <BillAmountCalculator
                    onInsertTotal={(total) => {
                      setFormData(prev => ({ ...prev, contractValue: total.toString() }));
                      if (fieldErrors.contractValue) {
                        setFieldErrors(prev => {
                          const newErrors = { ...prev };
                          delete newErrors.contractValue;
                          return newErrors;
                        });
                      }
                    }}
                    label={<><CalcIcon className="h-4 w-4" /></>}
                  />
                </div>
                <Input
                  id="contractValue"
                  name="contractValue"
                  type="number"
                  step="0.01"
                  value={formData.contractValue}
                  onChange={handleInputChange}
                  placeholder="e.g., 24500000 (2.45 Crores)"
                  className={`border-gray-300 focus:border-green-500 ${fieldErrors.contractValue ? 'border-red-500 focus:border-red-500' : ''}`}
                />
                {fieldErrors.contractValue && (
                  <p className="text-sm text-red-600">{fieldErrors.contractValue}</p>
                )}
                <p className="text-xs text-gray-600">
                  Actual agreement value after tender evaluation
                </p>
              </div>
            </div>

            {/* PVC Eligibility Status */}
            {pvcEligibility && (
              <div className={`p-4 rounded-lg border ${
                pvcEligibility.isEligible 
                  ? 'bg-green-50 border-green-300' 
                  : 'bg-amber-50 border-amber-300'
              }`}>
                <div className="flex items-start gap-3">
                  {pvcEligibility.isEligible ? (
                    <CheckCircle2 className="h-6 w-6 text-green-600 mt-0.5 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="h-6 w-6 text-amber-600 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className={`font-semibold text-base ${
                      pvcEligibility.isEligible ? 'text-green-900' : 'text-amber-900'
                    }`}>
                      {pvcEligibility.isEligible 
                        ? 'PVC Applicable' 
                        : 'PVC May Not Be Applicable'}
                    </p>
                    <p className={`text-sm mt-1 ${
                      pvcEligibility.isEligible ? 'text-green-700' : 'text-amber-700'
                    }`}>
                      {pvcEligibility.reason}
                    </p>
                    {pvcEligibility.warnings.length > 0 && (
                      <ul className="text-sm mt-2 space-y-1">
                        {pvcEligibility.warnings.map((warning: string, idx: number) => (
                          <li key={idx} className="text-amber-700 flex items-start gap-1">
                            <span className="mt-1">•</span>
                            <span>{warning}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Project Timeline Section */}
        <AccordionItem value="timeline" className="border rounded-lg px-4 bg-gradient-to-r from-purple-50 to-pink-50">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-600 rounded-lg">
                <Clock className="h-5 w-5 text-white" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-gray-900">Project Timeline</h3>
                <p className="text-sm text-gray-600">Duration and key dates</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="completionPeriodMonths" className="text-sm font-medium">
                Completion Period (Months) <span className="text-xs text-gray-500">(Optional)</span>
              </Label>
              <Input
                id="completionPeriodMonths"
                name="completionPeriodMonths"
                type="number"
                min="1"
                value={formData.completionPeriodMonths}
                onChange={handleInputChange}
                placeholder="e.g., 18"
                className={`max-w-sm border-gray-300 focus:border-purple-500 ${fieldErrors.completionPeriodMonths ? 'border-red-500 focus:border-red-500' : ''}`}
              />
              {fieldErrors.completionPeriodMonths && (
                <p className="text-sm text-red-600">{fieldErrors.completionPeriodMonths}</p>
              )}
              <p className="text-xs text-gray-600">
                PVC applies to contracts above 12 months
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dateOfOpening" className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Date of Opening <span className="text-red-500">*</span>
              </Label>
              <Input
                id="dateOfOpening"
                name="dateOfOpening"
                type="date"
                value={formData.dateOfOpening}
                onChange={handleInputChange}
                required
                className={`max-w-sm border-gray-300 focus:border-purple-500 ${fieldErrors.dateOfOpening ? 'border-red-500 focus:border-red-500' : ''}`}
              />
              {fieldErrors.dateOfOpening && (
                <p className="text-sm text-red-600">{fieldErrors.dateOfOpening}</p>
              )}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <p className="text-sm text-purple-900">
                  <span className="font-semibold">Auto-calculation:</span> The base month will be automatically set to one month prior to this date (GCC 46A.2).
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Railway Materials & Compliance Section */}
        <AccordionItem value="materials" className="border rounded-lg px-4 bg-gradient-to-r from-orange-50 to-amber-50">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-600 rounded-lg">
                <Package className="h-5 w-5 text-white" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-gray-900">Railway Materials & Compliance</h3>
                <p className="text-sm text-gray-600">Materials supplied by Railway</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4 space-y-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
              <div className="flex items-start gap-2">
                <Info className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-orange-900">
                  <p className="font-semibold mb-1">GCC 46A.1 Compliance</p>
                  <p className="text-orange-700">Materials supplied by Railway are excluded from PVC calculations</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="hasRailwaySuppliedMaterials"
                  checked={formData.hasRailwaySuppliedMaterials}
                  onCheckedChange={handleCheckboxChange}
                />
                <Label 
                  htmlFor="hasRailwaySuppliedMaterials"
                  className="text-sm font-medium cursor-pointer"
                >
                  Materials supplied by Railway (excluded from PVC as per GCC 46A.1)
                </Label>
              </div>

              {formData.hasRailwaySuppliedMaterials && (
                <div className="space-y-2 ml-6 p-4 bg-white rounded-lg border border-orange-200">
                  <Label htmlFor="railwaySuppliedMaterialsNote" className="text-sm font-medium">
                    Details of Railway-Supplied Materials
                  </Label>
                  <Textarea
                    id="railwaySuppliedMaterialsNote"
                    name="railwaySuppliedMaterialsNote"
                    value={formData.railwaySuppliedMaterialsNote}
                    onChange={handleInputChange}
                    placeholder="e.g., Steel rails supplied free of cost, Cement at fixed rate"
                    rows={3}
                    className="text-sm border-gray-300 focus:border-orange-500 resize-none"
                  />
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Schedules Section */}
        <AccordionItem value="schedules" className="border rounded-lg px-4 bg-gradient-to-r from-violet-50 to-purple-50">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-600 rounded-lg">
                <ListOrdered className="h-5 w-5 text-white" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-gray-900">Schedules</h3>
                <p className="text-sm text-gray-600">Add schedule items for this contract</p>
              </div>
              {schedules.length > 0 && (
                <span className="ml-auto mr-2 text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                  {schedules.length} items
                </span>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4 space-y-6">
            <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 mb-2">
              <div className="flex items-start gap-2">
                <Info className="h-5 w-5 text-violet-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-violet-900">
                  <p className="text-violet-700">Add contract schedules here. These will appear as a dropdown when creating bills, so you can link each bill classification entry to a specific schedule.</p>
                </div>
              </div>
            </div>

            {/* Schedules */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold text-gray-900">Schedules</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSchedules([...schedules, ''])}
                  className="h-8 text-xs bg-white hover:bg-violet-100"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Schedule
                </Button>
              </div>
              {schedules.map((schedule, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-6 text-right flex-shrink-0">{index + 1}.</span>
                  <Input
                    value={schedule}
                    onChange={(e) => {
                      const newSchedules = [...schedules];
                      newSchedules[index] = e.target.value;
                      setSchedules(newSchedules);
                    }}
                    placeholder={`e.g., Schedule ${String.fromCharCode(65 + index)} - Earthwork`}
                    className="border-gray-300 focus:border-violet-500 flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSchedules(schedules.filter((_, i) => i !== index))}
                    className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {schedules.length === 0 && (
                <p className="text-xs text-gray-500 italic text-center py-2">No schedules added yet</p>
              )}
            </div>


          </AccordionContent>
        </AccordionItem>

        {/* Covering Letter Details Section */}
        <AccordionItem value="covering-letter" className="border rounded-lg px-4 bg-gradient-to-r from-teal-50 to-cyan-50">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-teal-600 rounded-lg">
                <Mail className="h-5 w-5 text-white" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-gray-900">Covering Letter Details</h3>
                <p className="text-sm text-gray-600">Information for covering letter generation</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4 space-y-4">
            <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 mb-4">
              <div className="flex items-start gap-2">
                <Info className="h-5 w-5 text-teal-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-teal-900">
                  <p className="font-semibold mb-1">Covering Letter Information</p>
                  <p className="text-teal-700">Organization and division details will be automatically extracted from the agreement number</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="coveringLetterDesignation" className="text-sm font-medium">
                  Designation <span className="text-xs text-gray-500">(Optional)</span>
                </Label>
                <Input
                  id="coveringLetterDesignation"
                  name="coveringLetterDesignation"
                  value={formData.coveringLetterDesignation}
                  onChange={handleInputChange}
                  placeholder="e.g., Sr. Divisional Engineer/Con/MAS"
                  className="border-gray-300 focus:border-teal-500"
                />
                <p className="text-xs text-gray-600">
                  Designation of the official for covering letter
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="loaDate" className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  LOA Date <span className="text-xs text-gray-500">(Optional)</span>
                </Label>
                <Input
                  id="loaDate"
                  name="loaDate"
                  type="date"
                  value={formData.loaDate}
                  onChange={handleInputChange}
                  className="border-gray-300 focus:border-teal-500"
                />
                <p className="text-xs text-gray-600">
                  Date of Letter of Acceptance (LOA)
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Submit Buttons */}
      <div className="flex justify-end space-x-4 pt-6 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isLoading}
          className="px-6"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isLoading}
          className="bg-gradient-to-r from-blue-600 to-orange-600 hover:from-blue-700 hover:to-orange-700 px-6"
        >
          {isLoading ? (
            <LoadingSpinner size="sm" text={isEdit ? "Updating..." : "Creating..."} />
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              {isEdit ? 'Update Contract' : 'Create Contract'}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
