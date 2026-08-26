
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StatusMessage } from '@/components/ui/status-message';
import { ValidationMessage } from '@/components/ui/validation-message';
import { Calendar, Save, AlertTriangle, CheckCircle2, Info, FileText, IndianRupee, Clock, Package, Calculator as CalcIcon, Sparkles, Mail, ListOrdered, Plus, Trash2, Loader2 } from 'lucide-react';
import { checkPvcEligibility, formatContractValue, GCC_PVC_MINIMUM_VALUE, GCC_PVC_MINIMUM_MONTHS } from '@/lib/gcc-compliance';
import { Checkbox } from '@/components/ui/checkbox';
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
import { normalizeSchedules, emptySchedule, type ContractSchedule } from '@/lib/contract-schedules';
import { shortScheduleName } from '@/lib/bill-schedule-matching';

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
    rebatePercentage?: number;
    acceptedPercentage?: number;
    contractValue?: number;
    completionPeriodMonths?: number;
    hasRailwaySuppliedMaterials?: boolean;
    railwaySuppliedMaterialsNote?: string;
    coveringLetterDesignation?: string;
    /** "four_city_avg" (PPAC average) or "zone_city" (the zone's own city). */
    fuelPriceType?: string;
    /** Legacy string[] or the newer ContractSchedule[]; both are read. */
    schedules?: unknown;
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
  const [agreementAvailability, setAgreementAvailability] = useState<'idle' | 'checking' | 'available' | 'duplicate' | 'error'>('idle');
  // Horizontal tabs: the form is split into sections shown one at a time.
  const [activeTab, setActiveTab] = useState('basic');
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
    // Agreed once for the whole agreement (not per schedule).
    rebatePercentage: initialData?.rebatePercentage?.toString() || '',
    contractValue: initialData?.contractValue?.toString() || '',
    completionPeriodMonths: initialData?.completionPeriodMonths?.toString() || '',
    hasRailwaySuppliedMaterials: initialData?.hasRailwaySuppliedMaterials || false,
    railwaySuppliedMaterialsNote: initialData?.railwaySuppliedMaterialsNote || '',
    coveringLetterDesignation: initialData?.coveringLetterDesignation || '',
    // Which diesel price this agreement's PVC uses; bills inherit it. New contracts
    // default to the zone's own city — the basis most railways here actually direct.
    fuelPriceType: initialData?.fuelPriceType || 'zone_city'
  });

  const [schedules, setSchedules] = useState<ContractSchedule[]>(normalizeSchedules(initialData?.schedules));

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

  useEffect(() => {
    const agreementNo = formData.agreementNo.trim();
    const validation = validateAgreementNumber(agreementNo);

    if (!agreementNo || !validation.isValid) {
      setAgreementAvailability('idle');
      return;
    }

    const controller = new AbortController();
    setAgreementAvailability('checking');

    const timeout = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ agreementNo });
        if (isEdit && contractId) params.set('excludeContractId', contractId);

        const response = await fetch(`/api/contracts/check-agreement?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Agreement number check failed');

        const data = await response.json();
        setAgreementAvailability(data.available ? 'available' : 'duplicate');
      } catch (checkError: any) {
        if (checkError.name !== 'AbortError') setAgreementAvailability('error');
      }
    }, 500);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [contractId, formData.agreementNo, isEdit]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    if (name === 'agreementNo') {
      setAgreementAvailability('idle');
    }
    
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
    if (data.loaDate) updates.loaDate = data.loaDate;
    if (data.contractorName) updates.contractorName = data.contractorName;
    if (data.contractorPhone) updates.contractorPhone = data.contractorPhone;
    if (data.workDescription) updates.workDescription = data.workDescription;
    // dateOfOpening carries the tender closing date, so the server derives
    // baseMonth = one month before it (the correct PVC base month).
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

    // A separately stated rebate, if the letter carries one.
    if (typeof data.rebatePercentage === 'number') {
      updates.rebatePercentage = String(data.rebatePercentage);
    }

    // Fill the schedule rows from the agreement (name + per-schedule escalation/bid).
    if (Array.isArray(data.schedules) && data.schedules.length > 0) {
      // A tender writes each schedule as a paragraph — which rate book, which division,
      // what it excludes, on what terms the tenderer quotes — repeated almost word for
      // word on every schedule. Stored whole, the rows are indistinguishable and each
      // overflows its box. Kept as the tag and the work it covers; matching a bill goes
      // by the tag, so nothing downstream depends on the rest.
      const filled = normalizeSchedules(data.schedules)
        .map(schedule => ({ ...schedule, name: shortScheduleName(schedule.name) }));
      // An LOA states ONE accepted percentage in a sentence instead of a per-schedule
      // table, so a schedule row can arrive with a name and no figure. Give those rows
      // the overall percentage rather than leaving the reader to copy it in by hand.
      if (typeof data.acceptedPercentage === 'number') {
        for (const row of filled) {
          if (!row.bidRate?.trim()) row.bidRate = String(data.acceptedPercentage);
        }
      }
      setSchedules(filled);
    } else if (typeof data.acceptedPercentage === 'number') {
      // No schedule table at all — the usual shape of a Letter of Acceptance. Carry the
      // accepted percentage on a single row so it is not silently dropped.
      setSchedules([{ ...emptySchedule('As per LOA'), bidRate: String(data.acceptedPercentage) }]);
    }

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
   * Upload an agreement PDF and let AI pre-fill the form. Free, but the user
   * reviews and edits everything before saving.
   */
  const agreementFileRef = useRef<HTMLInputElement>(null);
  const [extractingAgreement, setExtractingAgreement] = useState(false);
  /** Set once the agreement PDF fills the form, so the record remembers its origin. */
  const [filledFromPdf, setFilledFromPdf] = useState(false);
  /** The kept copy of the uploaded LOA, claimed by the contract when it is saved. */
  const [uploadedDocumentId, setUploadedDocumentId] = useState<number | null>(null);

  const handleAgreementUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast.error('Please choose the agreement as a PDF file.');
      return;
    }
    setExtractingAgreement(true);
    const toastId = toast.loading('Reading the agreement…');
    try {
      // Trim to the opening pages in the BROWSER: the host refuses request bodies over
      // ~4.5 MB, so a scanned agreement was rejected with a bare 413 before any of our
      // code ran. Shared with the onboarding upload so both behave identically.
      const { trimAgreementForUpload, tooLargeMessage } = await import('@/lib/pdf/trim-agreement-client');
      const prepared = await trimAgreementForUpload(file);
      if (prepared.stillTooLarge) {
        toast.error(tooLargeMessage(prepared), { id: toastId, duration: 8000 });
        return;
      }
      const body = new FormData();
      body.append('file', prepared.file, file.name);
      const res = await fetch('/api/contracts/extract-agreement', { method: 'POST', body });
      if (res.status === 413) {
        toast.error(tooLargeMessage(prepared), { id: toastId, duration: 8000 });
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.data) {
        toast.error(json.error || 'Could not read the agreement.', { id: toastId });
        return;
      }
      handleDocumentDataExtracted(json.data);
      setFilledFromPdf(true);
      // The server keeps the LOA for 90 days. Hold its id so the contract claims it on
      // save -- an upload nobody claims is swept after a week.
      setUploadedDocumentId(typeof json.documentId === 'number' ? json.documentId : null);
      toast.success('Form filled from the agreement. Please review before saving.', { id: toastId });
    } catch {
      toast.error('The upload failed. Please try again.', { id: toastId });
    } finally {
      setExtractingAgreement(false);
    }
  };

  /**
   * Validate form before submission
   */
  const validateForm = (): boolean => {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];
    const newFieldErrors: Record<string, string> = {};

    // Only when the form was filled by uploading a document. An LOA is issued weeks
    // before the agreement is signed, so a contract read out of one has no agreement
    // number to give and the LOA number stands in until there is one. Typing a contract
    // in by hand is a different act — the agreement number is still asked for there,
    // because nothing else was read to stand in for it.
    const hasLoaNumber = filledFromPdf && Boolean(String(formData.loaNo || '').trim());
    const agreementValidation = validateAgreementNumber(formData.agreementNo);
    if (!agreementValidation.isValid && !(hasLoaNumber && !formData.agreementNo.trim())) {
      allErrors.push(...agreementValidation.errors);
      newFieldErrors.agreementNo = agreementValidation.errors[0];
    }
    if (formData.agreementNo.trim()) allWarnings.push(...agreementValidation.warnings);
    if (agreementAvailability === 'duplicate') {
      const duplicateMessage = 'This agreement number already exists. Enter a different agreement number.';
      allErrors.push(duplicateMessage);
      newFieldErrors.agreementNo = duplicateMessage;
    }

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
    if (allErrors.length > 0) jumpToFirstError(newFieldErrors);

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
        rebatePercentage: formData.rebatePercentage ? parseFloat(formData.rebatePercentage) : null,
        contractValue: formData.contractValue ? parseFloat(formData.contractValue) : null,
        completionPeriodMonths: formData.completionPeriodMonths ? parseInt(formData.completionPeriodMonths) : null,
        schedules: schedules.filter(s => s.name.trim() !== ''),
      };
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...submitData,
          createdVia: filledFromPdf ? 'pdf' : 'manual',
          // The LOA PDF this form was read from, kept with the contract.
          uploadedDocumentId,
        }),
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

  // Tab definitions for the horizontal section navigation.
  const TABS = [
    { id: 'basic', label: t('form.contract.basic_info'), icon: FileText, color: 'blue' },
    { id: 'financial', label: t('form.contract.financial_details'), icon: IndianRupee, color: 'emerald' },
    { id: 'timeline', label: t('form.contract.timeline'), icon: Clock, color: 'purple' },
    { id: 'schedules', label: t('form.contract.schedules'), icon: ListOrdered, color: 'violet' },
    { id: 'covering-letter', label: t('form.contract.covering_letter'), icon: Mail, color: 'teal' },
    { id: 'materials', label: language === 'hi' ? 'रेलवे सामग्री' : 'Railway Materials', icon: Package, color: 'orange' },
  ];
  const activeIndex = Math.max(0, TABS.findIndex(tb => tb.id === activeTab));
  const panelCls = (id: string) =>
    `border border-slate-200 bg-white rounded-xl shadow-sm px-5 py-5 ${activeTab === id ? 'block' : 'hidden'}`;
  // Which tab each validated field lives on, so a failed submit jumps to it.
  const fieldTab: Record<string, string> = {
    agreementNo: 'basic', contractorName: 'basic', workDescription: 'basic',
    dateOfOpening: 'timeline', tenderAdvertisedValue: 'financial', contractValue: 'financial',
  };
  const jumpToFirstError = (errs: Record<string, string>) => {
    const first = Object.keys(errs).find(k => fieldTab[k]);
    if (first) setActiveTab(fieldTab[first]);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
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

      {/* Auto-fill from agreement PDF (new contracts only) */}
      {!isEdit && (
        <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/60 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-900 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4" /> Fill from LOA (AI)
            </p>
            <p className="text-xs text-emerald-700/80 mt-0.5">
              Upload the LOA (Letter of Acceptance) PDF and we'll fill this form for you — free. The agreement works too. You review everything before saving.
            </p>
          </div>
          <input
            ref={agreementFileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={handleAgreementUpload}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => agreementFileRef.current?.click()}
            disabled={extractingAgreement}
            className="shrink-0 border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100"
          >
            {extractingAgreement ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Reading…</>
            ) : (
              <><FileText className="mr-2 h-4 w-4" /> Upload LOA PDF</>
            )}
          </Button>
        </div>
      )}

      {/* Horizontal tab strip */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex gap-1 border-b border-slate-200 min-w-max">
          {TABS.map((tb) => {
            const Icon = tb.icon;
            const isActive = activeTab === tb.id;
            return (
              <button
                key={tb.id}
                type="button"
                onClick={() => setActiveTab(tb.id)}
                className={`flex items-center gap-2 whitespace-nowrap px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  isActive
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tb.label}
                {tb.id === 'schedules' && schedules.length > 0 && (
                  <span className="ml-1 text-xs bg-emerald-50 text-emerald-750 px-1.5 py-0.5 rounded-full font-semibold border border-emerald-100">
                    {schedules.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        {/* Basic Information Section */}
        <div className={panelCls('basic')}>
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="agreementNo" className="text-sm font-semibold text-slate-700">
                  {t('form.contract.agreement_no')}
                  {filledFromPdf && String(formData.loaNo || '').trim()
                    ? <span className="ml-1 text-xs font-normal text-slate-500">— optional, the LOA number stands in until the agreement is signed</span>
                    : <span className="text-red-500"> *</span>}
                </Label>
                <Input
                  id="agreementNo"
                  name="agreementNo"
                  value={formData.agreementNo}
                  onChange={handleInputChange}
                  placeholder={t('form.contract.agreement_no_placeholder')}
                  required={!(filledFromPdf && String(formData.loaNo || '').trim())}
                  aria-invalid={Boolean(fieldErrors.agreementNo) || agreementAvailability === 'duplicate'}
                  aria-describedby="agreementNo-help agreementNo-status"
                  className={`bg-slate-50/50 border-slate-200 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all ${fieldErrors.agreementNo || agreementAvailability === 'duplicate' ? 'border-red-500 focus:border-red-500' : agreementAvailability === 'available' ? 'border-emerald-500 focus:border-emerald-500' : ''}`}
                />
                <p id="agreementNo-help" className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {t('form.contract.agreement_no_desc')}
                </p>
                <div id="agreementNo-status" aria-live="polite">
                  {agreementAvailability === 'checking' && (
                    <p className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking agreement number...
                    </p>
                  )}
                  {agreementAvailability === 'available' && (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 mt-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Agreement number is available
                    </p>
                  )}
                  {agreementAvailability === 'duplicate' && (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-red-600 mt-1">
                      <AlertTriangle className="h-3.5 w-3.5" /> This agreement number already exists
                    </p>
                  )}
                </div>
                {fieldErrors.agreementNo && agreementAvailability !== 'duplicate' && (
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
                  className="bg-slate-50/50 border-slate-200 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
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
                className={`bg-slate-50/50 border-slate-200 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all ${fieldErrors.contractorName ? 'border-red-500 focus:border-red-500' : ''}`}
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
                className="bg-slate-50/50 border-slate-200 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
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
                className={`bg-slate-50/50 border-slate-200 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all resize-none ${fieldErrors.workDescription ? 'border-red-500 focus:border-red-500' : ''}`}
              />
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {t('form.contract.work_desc_desc')}
              </p>
              {fieldErrors.workDescription && (
                <p className="text-xs font-medium text-red-600 mt-1">{fieldErrors.workDescription}</p>
              )}
            </div>
          </div>
        </div>

        {/* Financial Details Section */}
        <div className={panelCls('financial')}>
          <div className="space-y-5">
            <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4">
              <div className="flex items-start gap-2.5">
                <Info className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
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

              {/* Rebate is agreed ONCE for the whole agreement (per-schedule escalation and
                  bid rate live in the Schedules section). Bills reuse this automatically. */}
              <div className="space-y-2">
                <Label htmlFor="rebatePercentage" className="text-sm font-semibold text-slate-700">
                  Rebate %
                </Label>
                <Input
                  id="rebatePercentage"
                  name="rebatePercentage"
                  type="number"
                  step="0.01"
                  min="0"
                  max="99"
                  value={formData.rebatePercentage}
                  onChange={handleInputChange}
                  placeholder="e.g. 30.01"
                  className="bg-slate-50/50 border-slate-200 focus:bg-white focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all"
                />
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  From the agreement (0 if none). Agreed once for the whole agreement — bills apply it
                  automatically, so you won&apos;t be asked again.
                </p>
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

            {/* Fuel price basis — set once per agreement; every bill inherits it. Railways
                differ: some direct the PPAC four-city average, others the zone's own city. */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">Fuel price basis</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { value: 'four_city_avg', title: 'Four-city average', desc: 'PPAC average of Delhi, Kolkata, Mumbai & Chennai (GCC-2022 Cl.46A.7)' },
                  { value: 'zone_city', title: "Zone's own city", desc: 'The diesel rate of this zone’s city' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, fuelPriceType: opt.value }))}
                    className={`text-left rounded-xl border px-4 py-3 transition-all ${
                      formData.fuelPriceType === opt.value
                        ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-300'
                        : 'border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300'
                    }`}
                  >
                    <span className={`block text-sm font-semibold ${formData.fuelPriceType === opt.value ? 'text-emerald-800' : 'text-slate-700'}`}>
                      {opt.title}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{opt.desc}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Chosen once for the whole agreement — new bills use it automatically, so you won&apos;t be asked per bill.
              </p>
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
          </div>
        </div>

        {/* Project Timeline Section */}
        <div className={panelCls('timeline')}>
          <div className="space-y-4">
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
                className={`max-w-sm bg-slate-50/50 border-slate-200 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all ${fieldErrors.completionPeriodMonths ? 'border-red-500 focus:border-red-500' : ''}`}
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
                className={`max-w-sm bg-slate-50/50 border-slate-200 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all ${fieldErrors.dateOfOpening ? 'border-red-500 focus:border-red-500' : ''}`}
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
          </div>
        </div>

        {/* Schedules Section */}
        <div className={panelCls('schedules')}>
          <div className="space-y-6">
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 mb-2">
              <div className="flex items-start gap-2.5">
                <Info className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
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
                  onClick={() => setSchedules([...schedules, emptySchedule()])}
                  className="h-8 text-xs bg-white border-slate-200 text-slate-700 hover:bg-emerald-50 hover:text-emerald-750 transition-colors"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {t('form.contract.add_schedule')}
                </Button>
              </div>
              {/* Escalation / bid rate / rebate belong to the agreement, so they are
                  captured once here and reused by every bill's cement calculation. */}
              {schedules.length > 0 && (
                <p className="text-xs text-slate-500">
                  Enter each schedule&apos;s escalation and bid rate from the agreement. Bills reuse these
                  automatically — you won&apos;t be asked again. (Rebate is agreed once for the whole agreement
                  and is entered under Financial Details.)
                </p>
              )}
              {schedules.map((schedule, index) => {
                const update = (patch: Partial<ContractSchedule>) => {
                  const next = [...schedules];
                  next[index] = { ...next[index], ...patch };
                  setSchedules(next);
                };
                return (
                  <div key={index} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-550 w-6 text-right flex-shrink-0">{index + 1}.</span>
                      <Input
                        value={schedule.name}
                        onChange={(e) => update({ name: e.target.value })}
                        placeholder={language === 'hi' ? `जैसे, अनुसूची ${String.fromCharCode(65 + index)} - मिट्टी का काम` : `e.g., A1 - All items covered by CPWD-DSR 2021`}
                        className="bg-white border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all flex-1"
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-8">
                      {(schedule.subWorks?.length ?? 0) > 0 && (
                        <div className="sm:col-span-2 rounded-md border border-emerald-100 bg-emerald-50/50 p-2">
                          <p className="text-[11px] font-medium text-emerald-900">
                            Sub-works awarded under this schedule, each at its own rates:
                          </p>
                          <ul className="mt-1 space-y-0.5 text-[11px] text-emerald-800">
                            {schedule.subWorks!.map((w, wi) => (
                              <li key={wi} className="flex justify-between gap-2">
                                <span className="truncate">{w.name}</span>
                                <span className="shrink-0 text-emerald-700">
                                  bid {w.bidRate || '—'}% · escl {w.escalation === '0' ? 'at par' : (w.escalation ? w.escalation + '%' : '—')}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div>
                        <Label className="text-xs text-slate-600">Escalation %</Label>
                        <Input type="number" step="0.01" className="mt-1 bg-white" placeholder="e.g. -25.00"
                          value={schedule.escalation} onChange={(e) => update({ escalation: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-600">Bid Rate % (+/-)</Label>
                        <Input type="number" step="0.01" className="mt-1 bg-white" placeholder="e.g. 3.80"
                          value={schedule.bidRate} onChange={(e) => update({ bidRate: e.target.value })} />
                      </div>
                    </div>
                  </div>
                );
              })}
              {schedules.length === 0 && (
                <p className="text-xs text-slate-400 italic text-center py-2">{t('form.contract.no_schedules')}</p>
              )}
            </div>
          </div>
        </div>

        {/* Covering Letter Details Section */}
        <div className={panelCls('covering-letter')}>
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 mb-4">
              <div className="flex items-start gap-2.5">
                <Info className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
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
                  className="bg-slate-50/50 border-slate-200 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
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
                  className="bg-slate-50/50 border-slate-200 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                />
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {t('form.contract.loa_date_desc')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Railway Materials & Compliance Section */}
        <div className={panelCls('materials')}>
          <div className="space-y-4">
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
          </div>
        </div>
      </div>

      {/* Tab step navigation */}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={() => setActiveTab(TABS[Math.max(0, activeIndex - 1)].id)}
          disabled={activeIndex === 0}
          className="border-slate-250 text-slate-600 hover:bg-slate-50 rounded-xl px-5"
        >
          {language === 'hi' ? 'पिछला' : 'Back'}
        </Button>
        <div className="flex items-center gap-1.5">
          {TABS.map((tb, i) => (
            <span
              key={tb.id}
              className={`h-1.5 rounded-full transition-all ${i === activeIndex ? 'w-5 bg-emerald-600' : 'w-1.5 bg-slate-300'}`}
            />
          ))}
        </div>
        {activeIndex < TABS.length - 1 ? (
          <Button
            type="button"
            onClick={() => setActiveTab(TABS[Math.min(TABS.length - 1, activeIndex + 1)].id)}
            className="bg-slate-800 hover:bg-slate-900 text-white rounded-xl px-5"
          >
            {language === 'hi' ? 'अगला' : 'Next'}
          </Button>
        ) : (
          <span className="w-[72px]" />
        )}
      </div>

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
          disabled={isLoading || agreementAvailability === 'duplicate'}
          className="bg-emerald-600 hover:bg-emerald-750 text-white font-semibold shadow-md shadow-emerald-500/10 rounded-xl px-6"
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
