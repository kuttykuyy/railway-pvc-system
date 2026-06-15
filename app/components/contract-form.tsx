
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
import { BillAmountCalculator } from '@/components/bill-amount-calculator';
import { useLanguage } from './i18n-provider';

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
  const { t, language } = useLanguage();
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
        {/* Basic Information Section */}
        <AccordionItem value="basic" className="border border-slate-200 bg-white rounded-xl shadow-sm hover:shadow transition-all duration-200 px-5">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 text-blue-600 border border-blue-100 rounded-lg">
                <FileText className="h-5 w-5" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-slate-800 text-base">{t('form.contract.basic_info')}</h3>
                <p className="text-xs text-slate-500 font-normal mt-0.5">{t('form.contract.basic_info_desc')}</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-2 pb-5 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="agreementNo" className="text-sm font-semibold text-slate-700">
                  {t('form.contract.agreement_no')} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="agreementNo"
                  name="agreementNo"
                  value={formData.agreementNo}
                  onChange={handleInputChange}
                  placeholder={t('form.contract.agreement_no_placeholder')}
                  required
                  className={`bg-slate-50/50 border-slate-200 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all ${fieldErrors.agreementNo ? 'border-red-500 focus:border-red-500' : ''}`}
                />
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {t('form.contract.agreement_no_desc')}
                </p>
                {fieldErrors.agreementNo && (
                  <p className="text-xs font-medium text-red-600 mt-1">{fieldErrors.agreementNo}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="loaNo" className="text-sm font-semibold text-slate-700">
                  {t('form.contract.loa_no')} <span className="text-xs font-normal text-slate-500">({language === 'hi' ? 'वैकल्पिक' : 'Optional'})</span>
                </Label>
                <Input
                  id="loaNo"
                  name="loaNo"
                  value={formData.loaNo}
                  onChange={handleInputChange}
                  placeholder={t('form.contract.loa_no_placeholder')}
                  className="bg-slate-50/50 border-slate-200 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {t('form.contract.loa_no_desc')}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contractorName" className="text-sm font-semibold text-slate-700">
                {t('form.contract.contractor_name')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="contractorName"
                name="contractorName"
                value={formData.contractorName}
                onChange={handleInputChange}
                placeholder={t('form.contract.contractor_name_placeholder')}
                required
                className={`bg-slate-50/50 border-slate-200 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all ${fieldErrors.contractorName ? 'border-red-500 focus:border-red-500' : ''}`}
              />
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {t('form.contract.contractor_name_desc')}
              </p>
              {fieldErrors.contractorName && (
                <p className="text-xs font-medium text-red-600 mt-1">{fieldErrors.contractorName}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="contractorPhone" className="text-sm font-semibold text-slate-700">
                {t('form.contract.contractor_phone')} <span className="text-xs font-normal text-slate-500">({language === 'hi' ? 'वैकल्पिक' : 'Optional'})</span>
              </Label>
              <Input
                id="contractorPhone"
                name="contractorPhone"
                value={formData.contractorPhone}
                onChange={handleInputChange}
                placeholder={t('form.contract.contractor_phone_placeholder')}
                type="tel"
                maxLength={10}
                className="bg-slate-50/50 border-slate-200 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {t('form.contract.contractor_phone_desc')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="workDescription" className="text-sm font-semibold text-slate-700">
                {t('form.contract.work_desc')} <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="workDescription"
                name="workDescription"
                value={formData.workDescription}
                onChange={handleInputChange}
                placeholder={t('form.contract.work_desc_placeholder')}
                rows={3}
                required
                className={`bg-slate-50/50 border-slate-200 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all resize-none ${fieldErrors.workDescription ? 'border-red-500 focus:border-red-500' : ''}`}
              />
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {t('form.contract.work_desc_desc')}
              </p>
              {fieldErrors.workDescription && (
                <p className="text-xs font-medium text-red-600 mt-1">{fieldErrors.workDescription}</p>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Financial Details Section */}
        <AccordionItem value="financial" className="border border-slate-200 bg-white rounded-xl shadow-sm hover:shadow transition-all duration-200 px-5">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-lg">
                <IndianRupee className="h-5 w-5" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-slate-800 text-base">{t('form.contract.financial_details')}</h3>
                <p className="text-xs text-slate-500 font-normal mt-0.5">{t('form.contract.financial_details_desc')}</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-2 pb-5 space-y-5">
            <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4">
              <div className="flex items-start gap-2.5">
                <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-slate-600 space-y-1">
                  <p className="font-semibold text-slate-800 text-sm">{t('form.contract.pvc_rules_title')}</p>
                  <p className="leading-relaxed">{t('form.contract.pvc_rules_text')}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="tenderAdvertisedValue" className="text-sm font-semibold text-slate-700">
                    {t('form.contract.tender_value')} <span className="text-xs font-normal text-slate-500">({language === 'hi' ? 'वैकल्पिक' : 'Optional'})</span>
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
                  placeholder={t('form.contract.tender_value_placeholder')}
                  className={`bg-slate-50/50 border-slate-200 focus:bg-white focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all ${fieldErrors.tenderAdvertisedValue ? 'border-red-500 focus:border-red-500' : ''}`}
                />
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {t('form.contract.tender_value_desc')}
                </p>
                {fieldErrors.tenderAdvertisedValue && (
                  <p className="text-xs font-medium text-red-600 mt-1">{fieldErrors.tenderAdvertisedValue}</p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="contractValue" className="text-sm font-semibold text-slate-700">
                    {t('form.contract.agreement_value')} <span className="text-xs font-normal text-slate-500">({language === 'hi' ? 'वैकल्पिक' : 'Optional'})</span>
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
                  placeholder={t('form.contract.agreement_value_placeholder')}
                  className={`bg-slate-50/50 border-slate-200 focus:bg-white focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all ${fieldErrors.contractValue ? 'border-red-500 focus:border-red-500' : ''}`}
                />
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {t('form.contract.agreement_value_desc')}
                </p>
                {fieldErrors.contractValue && (
                  <p className="text-xs font-medium text-red-600 mt-1">{fieldErrors.contractValue}</p>
                )}
              </div>
            </div>

            {/* PVC Eligibility Status */}
            {pvcEligibility && (
              <div className={`p-4 rounded-xl border transition-all ${
                pvcEligibility.isEligible 
                  ? 'bg-emerald-50/40 border-emerald-250' 
                  : 'bg-amber-50/40 border-amber-250'
              }`}>
                <div className="flex items-start gap-3">
                  {pvcEligibility.isEligible ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className={`font-semibold text-sm ${
                      pvcEligibility.isEligible ? 'text-emerald-900' : 'text-amber-905'
                    }`}>
                      {pvcEligibility.isEligible 
                        ? t('form.contract.pvc_applicable') 
                        : t('form.contract.pvc_not_applicable')}
                    </p>
                    <p className={`text-xs mt-1 leading-relaxed ${
                      pvcEligibility.isEligible ? 'text-emerald-700' : 'text-amber-700'
                    }`}>
                      {pvcEligibility.reason}
                    </p>
                    {pvcEligibility.warnings.length > 0 && (
                      <ul className="text-xs mt-2 space-y-1">
                        {pvcEligibility.warnings.map((warning: string, idx: number) => (
                          <li key={idx} className="text-amber-800 flex items-start gap-1">
                            <span className="mt-0.5">•</span>
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
        <AccordionItem value="timeline" className="border border-slate-200 bg-white rounded-xl shadow-sm hover:shadow transition-all duration-200 px-5">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-50 text-purple-600 border border-purple-100 rounded-lg">
                <Clock className="h-5 w-5" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-slate-800 text-base">{t('form.contract.timeline')}</h3>
                <p className="text-xs text-slate-500 font-normal mt-0.5">{t('form.contract.timeline_desc')}</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-2 pb-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="completionPeriodMonths" className="text-sm font-semibold text-slate-700">
                {t('form.contract.completion_period')} <span className="text-xs font-normal text-slate-500">({language === 'hi' ? 'वैकल्पिक' : 'Optional'})</span>
              </Label>
              <Input
                id="completionPeriodMonths"
                name="completionPeriodMonths"
                type="number"
                min="1"
                value={formData.completionPeriodMonths}
                onChange={handleInputChange}
                placeholder={t('form.contract.completion_period_placeholder')}
                className={`max-w-sm bg-slate-50/50 border-slate-200 focus:bg-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all ${fieldErrors.completionPeriodMonths ? 'border-red-500 focus:border-red-500' : ''}`}
              />
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {t('form.contract.completion_period_desc')}
              </p>
              {fieldErrors.completionPeriodMonths && (
                <p className="text-xs font-medium text-red-600 mt-1">{fieldErrors.completionPeriodMonths}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="dateOfOpening" className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {t('form.contract.date_opening')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="dateOfOpening"
                name="dateOfOpening"
                type="date"
                value={formData.dateOfOpening}
                onChange={handleInputChange}
                required
                className={`max-w-sm bg-slate-50/50 border-slate-200 focus:bg-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all ${fieldErrors.dateOfOpening ? 'border-red-500 focus:border-red-500' : ''}`}
              />
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {t('form.contract.date_opening_desc')}
              </p>
              {fieldErrors.dateOfOpening && (
                <p className="text-xs font-medium text-red-600 mt-1">{fieldErrors.dateOfOpening}</p>
              )}
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 mt-2">
                <p className="text-xs text-slate-650 leading-relaxed">
                  <span className="font-semibold text-slate-700">{t('form.contract.auto_calc_title')}</span> {t('form.contract.auto_calc_desc')}
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Schedules Section */}
        <AccordionItem value="schedules" className="border border-slate-200 bg-white rounded-xl shadow-sm hover:shadow transition-all duration-200 px-5">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-50 text-violet-600 border border-violet-100 rounded-lg">
                <ListOrdered className="h-5 w-5" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-slate-800 text-base">{t('form.contract.schedules')}</h3>
                <p className="text-xs text-slate-500 font-normal mt-0.5">{t('form.contract.schedules_desc')}</p>
              </div>
              {schedules.length > 0 && (
                <span className="ml-auto mr-2 text-xs bg-violet-50 text-violet-750 px-2.5 py-0.5 rounded-full font-semibold border border-violet-100">
                  {language === 'hi' ? `${schedules.length} आइटम` : `${schedules.length} items`}
                </span>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-2 pb-5 space-y-6">
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 mb-2">
              <div className="flex items-start gap-2.5">
                <Info className="h-5 w-5 text-violet-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-slate-650">
                  <p className="leading-relaxed">{t('form.contract.schedules_help')}</p>
                </div>
              </div>
            </div>

            {/* Schedules */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold text-slate-700">{t('form.contract.schedules')}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSchedules([...schedules, ''])}
                  className="h-8 text-xs bg-white border-slate-200 text-slate-700 hover:bg-violet-50 hover:text-violet-750 transition-colors"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {t('form.contract.add_schedule')}
                </Button>
              </div>
              {schedules.map((schedule, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-xs text-slate-550 w-6 text-right flex-shrink-0">{index + 1}.</span>
                  <Input
                    value={schedule}
                    onChange={(e) => {
                      const newSchedules = [...schedules];
                      newSchedules[index] = e.target.value;
                      setSchedules(newSchedules);
                    }}
                    placeholder={language === 'hi' ? `जैसे, अनुसूची ${String.fromCharCode(65 + index)} - मिट्टी का काम` : `e.g., Schedule ${String.fromCharCode(65 + index)} - Earthwork`}
                    className="bg-slate-50/50 border-slate-200 focus:bg-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all flex-1"
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
                <p className="text-xs text-slate-400 italic text-center py-2">{t('form.contract.no_schedules')}</p>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Covering Letter Details Section */}
        <AccordionItem value="covering-letter" className="border border-slate-200 bg-white rounded-xl shadow-sm hover:shadow transition-all duration-200 px-5">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-teal-50 text-teal-600 border border-teal-100 rounded-lg">
                <Mail className="h-5 w-5" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-slate-800 text-base">{t('form.contract.covering_letter')}</h3>
                <p className="text-xs text-slate-500 font-normal mt-0.5">{t('form.contract.covering_letter_desc')}</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-2 pb-5 space-y-4">
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 mb-4">
              <div className="flex items-start gap-2.5">
                <Info className="h-5 w-5 text-teal-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-slate-650">
                  <p className="font-semibold text-slate-800 mb-0.5">{t('form.contract.cov_letter_help_title')}</p>
                  <p className="leading-relaxed">{t('form.contract.cov_letter_help_text')}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="coveringLetterDesignation" className="text-sm font-semibold text-slate-700">
                  {t('form.contract.designation')} <span className="text-xs font-normal text-slate-500">({language === 'hi' ? 'वैकल्पिक' : 'Optional'})</span>
                </Label>
                <Input
                  id="coveringLetterDesignation"
                  name="coveringLetterDesignation"
                  value={formData.coveringLetterDesignation}
                  onChange={handleInputChange}
                  placeholder={t('form.contract.designation_placeholder')}
                  className="bg-slate-50/50 border-slate-200 focus:bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
                />
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {t('form.contract.designation_desc')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="loaDate" className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {t('form.contract.loa_date')} <span className="text-xs font-normal text-slate-500">({language === 'hi' ? 'वैकल्पिक' : 'Optional'})</span>
                </Label>
                <Input
                  id="loaDate"
                  name="loaDate"
                  type="date"
                  value={formData.loaDate}
                  onChange={handleInputChange}
                  className="bg-slate-50/50 border-slate-200 focus:bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
                />
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {t('form.contract.loa_date_desc')}
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Railway Materials & Compliance Section */}
        <AccordionItem value="materials" className="border border-slate-200 bg-white rounded-xl shadow-sm hover:shadow transition-all duration-200 px-5">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-50 text-orange-600 border border-orange-100 rounded-lg">
                <Package className="h-5 w-5" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-slate-800 text-base">{language === 'hi' ? 'रेलवे सामग्री और अनुपालन' : 'Railway Materials & Compliance'}</h3>
                <p className="text-xs text-slate-500 font-normal mt-0.5">{language === 'hi' ? 'रेलवे द्वारा आपूर्ति की गई सामग्री' : 'Materials supplied by Railway'}</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-2 pb-5 space-y-4">
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 mb-4">
              <div className="flex items-start gap-2.5">
                <Info className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-slate-600">
                  <p className="font-semibold text-slate-800 mb-0.5">{language === 'hi' ? 'जीसीसी क्लॉज 46ए.1 सामग्री बहिष्करण नियम' : 'GCC Clause 46A.1 Material Exclusion Rule'}</p>
                  <p className="leading-relaxed">{language === 'hi' ? 'रेलवे द्वारा आपूर्ति की गई सामग्री की लागत (या तो मुफ्त या निश्चित दरों पर) को पीवीसी गणना के लिए बिलिंग मानों से घटाया/बाहर किया जाना चाहिए।' : 'The cost of materials supplied by the Railway (either free-of-cost or at fixed rates) must be deducted/excluded from billing values for PVC calculation purposes.'}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="hasRailwaySuppliedMaterials"
                  checked={formData.hasRailwaySuppliedMaterials}
                  onCheckedChange={handleCheckboxChange}
                  className="border-slate-300 data-[state=checked]:bg-orange-600 data-[state=checked]:border-orange-600"
                />
                <Label 
                  htmlFor="hasRailwaySuppliedMaterials"
                  className="text-sm font-semibold text-slate-700 cursor-pointer"
                >
                  {language === 'hi' ? 'रेलवे द्वारा आपूर्ति की गई सामग्री (जीसीसी 46ए.1 के अनुसार पीवीसी से बाहर)' : 'Materials supplied by Railway (excluded from PVC as per GCC 46A.1)'}
                </Label>
              </div>

              {formData.hasRailwaySuppliedMaterials && (
                <div className="space-y-2 ml-6 p-4 bg-slate-50/50 rounded-xl border border-slate-150">
                  <Label htmlFor="railwaySuppliedMaterialsNote" className="text-sm font-semibold text-slate-700">
                    {language === 'hi' ? 'रेलवे-आपूर्ति की गई सामग्री का विवरण' : 'Details of Railway-Supplied Materials'}
                  </Label>
                  <Textarea
                    id="railwaySuppliedMaterialsNote"
                    name="railwaySuppliedMaterialsNote"
                    value={formData.railwaySuppliedMaterialsNote}
                    onChange={handleInputChange}
                    placeholder={language === 'hi' ? 'जैसे, स्टील रेल मुफ्त आपूर्ति, निश्चित दर पर सीमेंट' : 'e.g., Steel rails supplied free of cost, Cement at fixed rate'}
                    rows={3}
                    className="text-xs bg-white border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all resize-none"
                  />
                  <p className="text-xs text-slate-500 leading-relaxed mt-1">
                    {language === 'hi' ? 'सटीक ऑडिटिंग सुनिश्चित करने के लिए उन सामग्रियों, मात्राओं या शर्तों का वर्णन करें जिनके तहत रेलवे इन वस्तुओं की आपूर्ति करता है।' : 'Describe the materials, quantities, or conditions under which Railway supplies these items to ensure accurate auditing.'}
                  </p>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Submit Buttons */}
      <div className="flex justify-end space-x-4 pt-6 border-t border-slate-100">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isLoading}
          className="border-slate-250 text-slate-600 hover:bg-slate-50 rounded-xl px-6"
        >
          {t('form.bill.cancel')}
        </Button>
        <Button
          type="submit"
          disabled={isLoading}
          className="bg-blue-600 hover:bg-blue-750 text-white font-semibold shadow-md shadow-blue-500/10 rounded-xl px-6"
        >
          {isLoading ? (
            <LoadingSpinner size="sm" text={isEdit ? (language === 'hi' ? 'अपडेट किया जा रहा है...' : 'Updating...') : (language === 'hi' ? 'बनाया जा रहा है...' : 'Creating...')} />
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              {isEdit ? (language === 'hi' ? 'अनुबंध अपडेट करें' : 'Update Contract') : (language === 'hi' ? 'अनुबंध बनाएं' : 'Create Contract')}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
