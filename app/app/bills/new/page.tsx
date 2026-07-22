
'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StatusMessage } from '@/components/ui/status-message';
import { Badge } from '@/components/ui/badge';
// Removed payment modal import
import { 
  FileText, 
  Save, 
  Calculator, 
  Calendar, 
  AlertTriangle,
  Building2,
  ClipboardList,
  Package,
  Layers,
  TrendingUp,
  CheckCircle2,
  Info,
  ChevronRight,
  ArrowRight,
  Edit,
  Sparkles,
  Loader2
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { STEEL_COMPONENT_OPTIONS } from '@/lib/types';
import { getRailwayZoneOptions, getSteelCityForZone } from '@/lib/zone-steel-city-mapping';
import { ProvisionalDateNotification } from '@/components/ui/provisional-date-notification';
import { BackButton } from '@/components/ui/back-button';
import { BillClassificationEntries } from '@/components/bill-classification-entries';
import { calculateTotalPvc, formatPvcAmount, pvcComparisonAllowsSuffix } from '@/lib/classification-pvc';
import { InsufficientCreditDialog } from '@/components/ui/insufficient-credit-dialog';
import { BillPdfCementAnalyzer, type CementAnalysisData, type ExtractedBillItem } from '@/components/bills/bill-pdf-cement-analyzer';
import { useLanguage } from '@/components/i18n-provider';
import { BillAmountCalculator } from '@/components/bill-amount-calculator';
import { scheduleNames, normalizeSchedules } from '@/lib/contract-schedules';
import { DsrCementCalculator, type CementSchedule } from '@/components/bills/dsr-cement-calculator';
import { ContextualHelp } from '@/components/contextual-help';
import { validateDate, validateDateForApi } from '@/lib/date-validation';
import { matchExtractedSchedule } from '@/lib/bill-schedule-matching';
import { computeRebateFactor, scaleComponentsWithRebate } from '@/lib/rebate';
import { inferMainClassification } from '@/lib/work-classification';
import { applyCementSplit, type CementBreakdownItem } from '@/lib/cement-split';


interface Contract {
  id: string;
  agreementNo: string;
  contractorName: string;
  workDescription: string;
  workClassification?: string;
  dateOfOpening: string;
  baseMonth: string;
  /** Legacy string[] or ContractSchedule[] (per-schedule escalation/bid rate).
   *  Always read via scheduleNames() / findScheduleRates(). */
  schedules?: unknown;
  /** Agreement-level rebate %, agreed once and reused by every bill. */
  rebatePercentage?: number | null;
}

interface SubClassification {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  groupId: string;
  fixed: number;
  labour: number;
  steel: number;
  cement: number;
  plantMachinery: number;
  fuel: number;
  otherMaterials: number;
  explosives: number;
  isActive?: boolean;
  isDefault?: boolean;
}

interface ClassificationGroup {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
  subClassifications: SubClassification[];
}

interface ItemRow {
  itemNumber: string;
  quantity: number | string | '';
  agreementRate: number | string | '';
}

interface ClassificationEntry {
  id?: string;
  mainClassificationGroupId?: string;
  subClassificationId: string;
  subClassification?: SubClassification;
  amount: number | string | '';  // Allow blank values
  description?: string;
  classificationJustification?: string;
  steelTypes?: string[];  // Array of selected steel types
  scheduleItem?: string;
  itemNumber?: string;
  quantity?: number | string | '';
  agreementRate?: number | string | '';
  itemRows?: ItemRow[];
  aiReviewed?: boolean;
  manualClassification?: boolean;
  isDerivedCement?: boolean;
}

function classificationEntryKey(entry: ClassificationEntry): string {
  const rowNumbers = (entry.itemRows || [])
    .map(row => String(row.itemNumber || '').trim().toUpperCase())
    .filter(Boolean);
  const itemNumbers = rowNumbers.length
    ? rowNumbers
    : [String(entry.itemNumber || '').trim().toUpperCase()].filter(Boolean);

  if (itemNumbers.length) return `items:${itemNumbers.join('|')}`;
  return `description:${(entry.description || '').trim().toUpperCase().slice(0, 160)}`;
}


function NewBillPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, language } = useLanguage();
  const preselectedContractId = searchParams?.get('contractId');

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [classificationGroups, setClassificationGroups] = useState<ClassificationGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<ClassificationGroup | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const [showProvisionalNotification, setShowProvisionalNotification] = useState(false);
  
  // Ref for error message to enable scroll-to-error
  const errorRef = useRef<HTMLDivElement>(null);
  
  // Date range validation state
  const [availableDateRange, setAvailableDateRange] = useState<{
    minDate: string | null;
    maxDate: string | null;
    lastCompleteDate: string | null;
    allowProvisional: boolean;
    availableMonths: string[];
  } | null>(null);
  const [isLoadingDateRange, setIsLoadingDateRange] = useState(true);
  
  // Previous bills state
  const [previousBills, setPreviousBills] = useState<any[]>([]);
  const [isLoadingPreviousBills, setIsLoadingPreviousBills] = useState(false);
  const [isFetchingClassification, setIsFetchingClassification] = useState(false);
  
  // Step tracking for visual feedback
  const [completedSections, setCompletedSections] = useState({
    basic: false,
    classification: false,
    amounts: false,
    optional: false
  });
  
  // Removed payment-related state
  const [formData, setFormData] = useState({
    contractId: preselectedContractId || '',
    billNo: '',
    grossBillAmount: '', // Gross bill amount (before non-scheduled items deduction)
    cementAmount: '', // Amount allocated for cement work (85% calculation)
    
    // Dedicated steel components used by the JPC index calculation.
    steelTmtBarsAmount: '',
    steelAngleChannelAmount: '',
    steelPlatesAmount: '',
    steelOtherSectionsAmount: '',
    
    dateOfMeasurement: '',
    workClassification: '', // Will be set to default classification when loaded
    zone: '', // Railway zone (PVC Number will be auto-generated)
    fuelPriceType: 'four_city_avg', // 'four_city_avg' or 'zone_city'
    isFinalPvc: false, // Is this final PVC
    dateOfCompletion: '', // Date of completion (only for final PVC)
  });
  
  // Classification entries state - array of { subClassificationId, amount, description }
  const [classificationEntries, setClassificationEntries] = useState<ClassificationEntry[]>([]);
  const manualClassificationOverridesRef = useRef<Map<string, ClassificationEntry>>(new Map());
  const extractedBillIdentityRef = useRef('');
  
  // Sub-classifications state - array of { code, name, amount }
  const [subClassifications, setSubClassifications] = useState<Array<{ code: string; name: string; amount: string }>>([]);
  
  // Non-schedule items state - array of { description, amount }
  const [nonScheduleItems, setNonScheduleItems] = useState<Array<{ description: string; amount: string }>>([]);
  
  // Accordion state - start with basic info open
  const [openAccordion, setOpenAccordion] = useState<string[]>(['basic']);
  // Horizontal tabs for the bill form sections.
  const [activeBillTab, setActiveBillTab] = useState('basic');
  // How the user wants to create the bill: pick first, then show the form.
  const [billMode, setBillMode] = useState<'choose' | 'manual' | 'ai'>('choose');

  // Insufficient credit dialog state
  const [showInsufficientCredit, setShowInsufficientCredit] = useState(false);
  const [creditInfo, setCreditInfo] = useState({
    currentBalance: 0,
    requiredAmount: 0,
    shortfall: 0
  });

  // Tools subscription states
  const [subscriptionActive, setSubscriptionActive] = useState<boolean>(true); // Default to true to avoid flash
  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [subscribing, setSubscribing] = useState<boolean>(false);
  const [showSubscribeModal, setShowSubscribeModal] = useState<boolean>(false);
  const [isAiUploaded, setIsAiUploaded] = useState(false);
  // DSR cement derivation: schedules (with cement MT) worked out from the entered items.
  const [cementSchedules, setCementSchedules] = useState<CementSchedule[]>([]);
  const [derivingCement, setDerivingCement] = useState(false);
  // Item numbers that had no cement coefficient — shown so the gap is actionable.
  const [cementUnmatched, setCementUnmatched] = useState<string[]>([]);
  // True when an AI extraction has cement items whose derived cost has NOT yet been
  // applied. PVC check / bill creation is blocked until the user applies it.
  const [cementCostPending, setCementCostPending] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [hasFreeTrial, setHasFreeTrial] = useState<boolean | null>(null);
  const [roQuota, setRoQuota] = useState<{
    applicable: boolean;
    zone?: string | null;
    postingComplete?: boolean;
    missingPostingFields?: string[];
    bills?: { used: number; limit: number; remaining: number; allowed: boolean };
  } | null>(null);

  const selectedContract = contracts.find(c => c.id === formData.contractId);

  useEffect(() => {
    fetch('/api/user/profile')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setHasFreeTrial(!!data.hasFreeTrial); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/user/quota')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        setRoQuota(data);
        // Auto-fill and lock zone for railway officials
        if (data.applicable && data.zone) {
          setFormData((prev) => ({ ...prev, zone: data.zone }));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    checkMaintenanceMode();
    fetchContracts();
    fetchClassificationGroups();
    fetchAvailableDateRange();
  }, []);

  useEffect(() => {
    checkSubscriptionStatus();
  }, [isAiUploaded]);

  const checkSubscriptionStatus = async () => {
    try {
      const response = await fetch(`/api/credits/balance?isAiUploaded=${isAiUploaded}`);
      if (response.ok) {
        const data = await response.json();
        // Check if user is exempt (has a free/official/admin role) or has an active subscription
        const isExempt = 
          data.accountInfo?.tier === 'Superadmin' || 
          data.accountInfo?.tier === 'Admin' || 
          data.accountInfo?.tier === 'Railway Department' || 
          data.accountInfo?.tier === 'Free Tier' || 
          data.accountInfo?.tier === 'Unlimited' || 
          !data.paymentProcessingEnabled;
        
        const hasSub = !!data.subscription?.isActive;
        setSubscriptionActive(isExempt || hasSub);
        setCreditBalance(data.balance || 0);
      }
    } catch (error) {
      console.error('Error checking subscription status:', error);
    }
  };

  const handleSubscribeTools = async () => {
    if (subscribing) return;
    setSubscribing(true);
    try {
      const response = await fetch('/api/billing/subscribe-tools', {
        method: 'POST',
      });
      const data = await response.json();
      if (response.ok) {
        toast.success(data.message || 'Subscription activated successfully!', { duration: 4000 });
        setSubscriptionActive(true);
        setShowSubscribeModal(false);
      } else {
        toast.error(data.error || 'Failed to activate subscription.');
      }
    } catch (error) {
      console.error('Error activating subscription:', error);
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setSubscribing(false);
    }
  };

  // Scroll to error when it appears
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [error]);

  const checkMaintenanceMode = async () => {
    try {
      const response = await fetch('/api/settings/maintenance-status');
      if (response.ok) {
        const data = await response.json();
        if (data.maintenanceStatus?.singleBillMaintenance) {
          setIsMaintenanceMode(true);
          // Show error message
          toast.error('Single bill creation is currently under maintenance. Please try again later.');
          // Redirect to bills page after 2 seconds
          setTimeout(() => {
            router.push('/bills');
          }, 2000);
        }
      }
    } catch (error) {
      console.error('Error checking maintenance mode:', error);
    }
  };
  
  // Set default sub-classification after groups and contract are loaded
  useEffect(() => {
    if (classificationGroups.length > 0 && selectedContract) {
      const inferred = inferMainClassification(selectedContract.workDescription);
      const matchedGroup = classificationGroups.find(g => g.code.toUpperCase() === inferred.code.toUpperCase());
      
      if (matchedGroup && matchedGroup.subClassifications.length > 0) {
        const defaultSub = matchedGroup.subClassifications.find(s => s.isDefault) || matchedGroup.subClassifications[0];
        setFormData(prev => ({ ...prev, workClassification: defaultSub.id }));
        setSelectedGroup(matchedGroup);
      } else {
        const firstGroup = classificationGroups.find(g => g.subClassifications.length > 0);
        if (firstGroup && firstGroup.subClassifications.length > 0) {
          const defaultSub = firstGroup.subClassifications.find(s => s.isDefault) || firstGroup.subClassifications[0];
          setFormData(prev => ({ ...prev, workClassification: defaultSub.id }));
          setSelectedGroup(firstGroup);
        }
      }
    } else if (classificationGroups.length > 0 && !formData.workClassification) {
      // Set default sub-classification (first sub of first group)
      const firstGroup = classificationGroups.find(g => g.subClassifications.length > 0);
      if (firstGroup && firstGroup.subClassifications.length > 0) {
        const defaultSub = firstGroup.subClassifications.find(s => s.isDefault) || firstGroup.subClassifications[0];
        setFormData(prev => ({ ...prev, workClassification: defaultSub.id }));
        setSelectedGroup(firstGroup);
      }
    }
  }, [classificationGroups, selectedContract]);

  // Update selected group when work classification changes
  useEffect(() => {
    if (formData.workClassification && classificationGroups.length > 0) {
      const group = classificationGroups.find(g => 
        g.subClassifications.some(s => s.id === formData.workClassification)
      );
      if (group) {
        setSelectedGroup(group);
      }
    }
  }, [formData.workClassification, classificationGroups]);

  const fetchContracts = async () => {
    try {
      const response = await fetch('/api/contracts');
      if (!response.ok) throw new Error('Failed to fetch contracts');
      
      const data = await response.json();
      setContracts(data);
      
      // If there's a preselected contract, set it in form data
      if (preselectedContractId) {
        setFormData(prev => ({ ...prev, contractId: preselectedContractId }));
      }
    } catch (error: any) {
      console.error('Error fetching contracts:', error);
      setError(error.message || 'Failed to fetch contracts');
    }
  };

  const fetchClassificationGroups = async () => {
    try {
      const response = await fetch('/api/classification-groups');
      if (!response.ok) throw new Error('Failed to fetch classification groups');
      
      const data = await response.json();
      setClassificationGroups(data.groups || []);
    } catch (error: any) {
      console.error('Error fetching classification groups:', error);
      setError(error.message || 'Failed to fetch classification groups');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAvailableDateRange = async () => {
    try {
      setIsLoadingDateRange(true);
      const response = await fetch('/api/indices/available-date-range?isFinal=false');
      if (!response.ok) {
        console.error('Failed to fetch available date range');
        return;
      }
      
      const data = await response.json();
      setAvailableDateRange({
        minDate: data.minDate,
        maxDate: data.maxDate,
        lastCompleteDate: data.lastCompleteDate ?? null,
        allowProvisional: !!data.allowProvisional,
        availableMonths: data.availableMonths || []
      });
    } catch (error) {
      console.error('Error fetching available date range:', error);
    } finally {
      setIsLoadingDateRange(false);
    }
  };



  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    // Validate date fields
    if ((name === 'dateOfMeasurement' || name === 'dateOfCompletion') && value) {
      const validation = validateDate(value);
      if (!validation.isValid) {
        console.error(`Invalid ${name}:`, validation.error);
        toast.error(validation.error || 'Invalid date');
        return;
      }
      
      // Check if date is within available range (only for dateOfMeasurement)
      if (name === 'dateOfMeasurement' && availableDateRange) {
        const selectedDate = new Date(value);
        const minDate = availableDateRange.minDate ? new Date(availableDateRange.minDate) : null;
        const maxDate = availableDateRange.maxDate ? new Date(availableDateRange.maxDate) : null;
        
        if (minDate && selectedDate < minDate) {
          toast.error(`Indices are not available before ${availableDateRange.minDate}. Please select a later date.`);
          return;
        }
        
        if (maxDate && selectedDate > maxDate) {
          toast.error(`Indices are not available after ${availableDateRange.maxDate}. Please select an earlier date.`);
          return;
        }
        
        // Check if the specific month has indices
        const yearMonth = value.substring(0, 7); // Extract YYYY-MM
        if (!availableDateRange.availableMonths.includes(yearMonth)) {
          toast.error(`Indices are not available for ${yearMonth}. Please select a date in an available month.`);
          return;
        }
      }
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Check for provisional data when date of measurement changes
    if (name === 'dateOfMeasurement' && value) {
      checkProvisionalData(value);
    }
  };

  const checkProvisionalData = async (date: string) => {
    // Validate date before making API call
    const validatedDate = validateDateForApi(date, 'checkProvisionalData');
    if (!validatedDate) {
      console.warn('Skipping provisional check - invalid date:', date);
      return;
    }
    
    try {
      const response = await fetch(`/api/indices/check-provisional?date=${validatedDate}`);
      if (response.ok) {
        const data = await response.json();
        if (data.hasProvisionalData) {
          setShowProvisionalNotification(true);
        }
      }
    } catch (error) {
      console.error('Error checking provisional data:', error);
    }
  };

  const handleDateChange = (newDate: string) => {
    setFormData(prev => ({
      ...prev,
      dateOfMeasurement: newDate
    }));
  };

  const normalizeExtractedDate = (value?: string) => {
    if (!value) return '';
    const isoMatch = value.match(/\d{4}-\d{2}-\d{2}/);
    if (isoMatch) return isoMatch[0];
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
  };

  const findSubClassificationForExtractedItem = (item: ExtractedBillItem) => {
    const code = (item.suggestedClassificationCode || '').trim().toUpperCase();
    if (!code) return null;
    const allSubs = classificationGroups.flatMap(group => group.subClassifications);
    // 1. Exact code (e.g. "9A").
    const exact = allSubs.find(sub => sub.code.toUpperCase() === code);
    if (exact) return exact;
    // 2. Same main group — prefer "<digit>A", else the group's default/first sub. This
    // keeps an item mapped to a valid sub-class even when its exact suffix has no
    // matching row (e.g. a single-class group, or a bare "5"), so it is never dropped
    // or left without a sub-classification id.
    const digit = code.match(/^\d+/)?.[0];
    const group = digit ? classificationGroups.find(g => g.code.toUpperCase() === digit) : undefined;
    if (group && group.subClassifications.length) {
      return group.subClassifications.find(sub => sub.code.toUpperCase() === `${digit}A`)
        || group.subClassifications.find(sub => sub.isDefault)
        || group.subClassifications[0];
    }
    return null;
  };

  const buildClassificationEntriesFromExtractedBill = (data: CementAnalysisData): ClassificationEntry[] => {
    const items = data.billDetails?.items || data.extractedItems || [];
    const allSubClassifications = classificationGroups.flatMap(group => group.subClassifications);

    // Items sharing the same printed "Group Name" and classification are combined into a
    // single section (one entry with multiple item rows) instead of a separate section per item.
    let ungroupedCounter = 0;

    const rawEntries: Array<{ groupKey: string; entry: ClassificationEntry }> = items.flatMap((item) => {
      const subClassification = findSubClassificationForExtractedItem(item);
      if (!subClassification) return [];
      const qtySinceLast = Number(item.quantitySinceLastBill || 0);
      const specialConditionOnly = qtySinceLast === 0
        && Number(item.amountAtAgreementRateSinceLastBill || 0) === 0
        && Number(item.amountIncludingSpecialConditionSinceLastBill || item.amountSinceLastBill || 0) > 0;

      const groupName = (item.groupName || '').trim();
      const baseKey = groupName || `__standalone_${ungroupedCounter++}`;

      const originalAmount = (item as any).originalAmount;
      const netAmount = Number(item.amountSinceLastBill || 0);
      const hasDeduction = typeof originalAmount === 'number' && originalAmount > netAmount;

      if (hasDeduction) {
        const cementCost = (item as any).cementDeduction || (originalAmount - netAmount);
        const cementQty = (item as any).cementQuantityQuintals || 0;
        const cementRate = (item as any).cementRatePerQuintal || '';

        const mainCode = subClassification.code.charAt(0);
        const cementSub = allSubClassifications.find(sub => sub.code.toUpperCase() === `${mainCode}C`);

        if (cementSub) {
          const scheduleItem = matchExtractedSchedule(
            scheduleNames(selectedContract?.schedules),
            [item.schedule, item.scheduleGroup, item.chapter],
          );

          const qty = Number(item.quantitySinceLastBill || 0);
          const netRate = qty > 0 ? Number((netAmount / qty).toFixed(6)) : '';

          return [
            {
              groupKey: `${subClassification.id}::${baseKey}`,
              entry: {
                subClassificationId: subClassification.id,
                subClassification,
                amount: netAmount,
                description: groupName ? groupName : `${item.description || ''} (Excluding Cement)`,
                steelTypes: item.isSteelItem && item.steelType ? [item.steelType] : [],
                scheduleItem,
                itemNumber: item.itemNo || '',
                quantity: qty || '',
                agreementRate: netRate,
                itemRows: [{
                  itemNumber: item.itemNo || '',
                  quantity: qty || '',
                  agreementRate: netRate,
                }],
                classificationJustification: item.suggestedClassificationReason || '',
                aiReviewed: !!item.classificationReviewedByAi,
              },
            },
            {
              groupKey: `${cementSub.id}::${baseKey}`,
              entry: {
                subClassificationId: cementSub.id,
                subClassification: cementSub,
                amount: cementCost,
                description: groupName ? `${groupName} (Cement Portion)` : `${item.description || ''} (Cement Portion)`,
                steelTypes: [],
                scheduleItem,
                itemNumber: item.itemNo ? `${item.itemNo}-CEM` : 'CEM',
                quantity: cementQty || '',
                agreementRate: cementRate,
                itemRows: [{
                  itemNumber: item.itemNo ? `${item.itemNo}-CEM` : 'CEM',
                  quantity: cementQty || '',
                  agreementRate: cementRate,
                }],
                classificationJustification: `Under GCC Clause 46A, this is the cement portion of item ${item.itemNo || ''} (${item.description || ''}). Its cement cost is derived from the DSR cement coefficient and classified under Sub-classification ${cementSub.code}${cementSub.name ? ` (${cementSub.name})` : ''} so that the cement price index is applied to this value.`,
              },
            },
          ];
        }
      }

      // Default: single entry
      const itemQuantity = specialConditionOnly ? '' : (item.quantitySinceLastBillRaw || item.quantitySinceLastBill || '');
      const itemRate = specialConditionOnly ? '' : (item.agreementRateRaw || item.agreementRate || '');
      return [{
        groupKey: `${subClassification.id}::${baseKey}`,
        entry: {
          subClassificationId: subClassification.id,
          subClassification,
          amount: Number(item.amountSinceLastBill || 0),
          description: groupName
            ? groupName
            : (specialConditionOnly
              ? `${item.description || ''} (Special condition amount; printed Qty since last Bill is 0)`
              : item.description || ''),
          steelTypes: item.isSteelItem && item.steelType ? [item.steelType] : [],
          scheduleItem: matchExtractedSchedule(
            scheduleNames(selectedContract?.schedules),
            [item.schedule, item.scheduleGroup, item.chapter],
          ),
          itemNumber: item.itemNo || '',
          quantity: itemQuantity,
          agreementRate: itemRate,
          itemRows: specialConditionOnly ? [] : [{
            itemNumber: item.itemNo || '',
            quantity: itemQuantity,
            agreementRate: itemRate,
          }],
          classificationJustification: item.suggestedClassificationReason || '',
          aiReviewed: !!item.classificationReviewedByAi,
        },
      }];
    });

    const merged = new Map<string, ClassificationEntry>();
    const order: string[] = [];
    for (const { groupKey, entry } of rawEntries) {
      const existing = merged.get(groupKey);
      if (!existing) {
        merged.set(groupKey, { ...entry, itemRows: [...(entry.itemRows || [])] });
        order.push(groupKey);
        continue;
      }
      existing.itemRows = [...(existing.itemRows || []), ...(entry.itemRows || [])];
      existing.amount = (Number(existing.amount) || 0) + (Number(entry.amount) || 0);
      const steelSet = new Set([...(existing.steelTypes || []), ...(entry.steelTypes || [])]);
      existing.steelTypes = Array.from(steelSet);
      existing.aiReviewed = existing.aiReviewed || entry.aiReviewed;
      if (!existing.classificationJustification) {
        existing.classificationJustification = entry.classificationJustification || '';
      }
    }

    return order.map(key => {
      const entry = merged.get(key)!;
      const firstRow = entry.itemRows?.[0];
      if (firstRow) {
        entry.itemNumber = firstRow.itemNumber;
        entry.quantity = firstRow.quantity;
        entry.agreementRate = firstRow.agreementRate;
      }
      return entry;
    });
  };

  // Compares PVC across the sub-classifications of the entry's group and keeps the one
  // with the least negative PVC, recording the comparison in the justification.
  // Supply classifications (B/C) are never switched away from or into automatically.
  const applyPvcComparisonToEntries = async (
    mappedEntries: ClassificationEntry[],
    measurementDate: string,
  ): Promise<ClassificationEntry[]> => {
    if (!selectedContract?.id || !measurementDate || mappedEntries.length === 0) return mappedEntries;
    try {
      const response = await fetch(
        `/api/indices/comparison?contractId=${selectedContract.id}&measurementDate=${measurementDate}`,
      );
      if (!response.ok) return mappedEntries;
      const indices = await response.json();
      if (!indices.base || !indices.current) return mappedEntries;
      const indicesData = { base: indices.base, current: indices.current };

      return mappedEntries.map(entry => {
        // Never second-guess a classification the user picked by hand.
        if (entry.manualClassification) return entry;
        const currentSub = entry.subClassification;
        const amount = Number(entry.amount) || 0;
        if (!currentSub || amount <= 0) return entry;
        const currentSuffix = currentSub.code.slice(-1).toUpperCase();
        if (currentSuffix === 'B' || currentSuffix === 'C') return entry;

        const group = classificationGroups.find(item => item.id === currentSub.groupId);
        if (!group) return entry;
        // Compare across all non-supply sub-classes (A/D/E) so the justification stays
        // transparent about what each option would pay. Selection still follows the
        // actual nature of the work: we only switch to a higher-paying class when it is
        // the same kind of work — never turn a general item into Fabrication & Erection
        // just for a bigger PVC.
        const compareSet = group.subClassifications.filter(sub => {
          const suffix = sub.code.slice(-1).toUpperCase();
          return sub.id === currentSub.id || !['B', 'C'].includes(suffix);
        });
        if (compareSet.length < 2) return entry;

        const results = compareSet
          .map(sub => ({ sub, pvc: calculateTotalPvc(sub, amount, indicesData) }))
          .sort((left, right) => right.pvc - left.pvc);
        if (results.every(result => result.pvc === 0)) return entry;

        const best = results[0];
        const canSwitch = best.sub.id !== currentSub.id
          && pvcComparisonAllowsSuffix(currentSuffix, best.sub.code.slice(-1));
        const selected = canSwitch ? best.sub : currentSub;

        const comparisonText = results.map(result => `${result.sub.code} → ${formatPvcAmount(result.pvc)}`).join(', ');
        const note = selected.id === best.sub.id
          ? `${selected.code} matches the nature of the work.`
          : `${best.sub.code} would yield a higher PVC, but classification follows the nature of the work rather than the payout, so this item stays ${selected.code}.`;
        const amountLabel = amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const justification = [
          entry.classificationJustification || '',
          `Checking the price variation on Rs ${amountLabel}: ${comparisonText}. ${note}`,
        ].filter(Boolean).join(' ');

        if (canSwitch) {
          return {
            ...entry,
            subClassificationId: best.sub.id,
            subClassification: best.sub,
            classificationJustification: justification,
          };
        }
        return { ...entry, classificationJustification: justification };
      });
    } catch {
      return mappedEntries;
    }
  };

  const applyExtractedBillDetails = async (data: CementAnalysisData) => {
    setIsAiUploaded(true);
    // Block PVC check / create until the derived cement cost is applied: there are
    // cement items (rows with a coefficient) but the cost hasn't been calculated and
    // applied yet (no cementAmountSource / cement amount on the result).
    const cementItemsPresent = (data.results || []).some(
      row => (row.coefficient ?? 0) > 0 && (row.cementQuantity ?? 0) > 0,
    );
    const cementCostApplied = !!data.cementAmountSource || (data.summary?.cementAmount ?? 0) > 0;
    setCementCostPending(cementItemsPresent && !cementCostApplied);
    const billDetails = data.billDetails;
    const extractedBillIdentity = [
      billDetails?.agreementNo,
      billDetails?.billNo,
      normalizeExtractedDate(billDetails?.measurementDate),
    ].map(value => String(value || '').trim().toUpperCase()).join('|');
    if (extractedBillIdentity && extractedBillIdentityRef.current !== extractedBillIdentity) {
      manualClassificationOverridesRef.current.clear();
      extractedBillIdentityRef.current = extractedBillIdentity;
    }

    // Auto-select the contract from the extracted Agreement No. when none is chosen yet.
    // Selecting it also carries forward the railway zone from that contract's latest bill.
    const extractedAgreementNo = (billDetails?.agreementNo || '').trim();
    if (extractedAgreementNo && !formData.contractId) {
      const normalize = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const target = normalize(extractedAgreementNo);
      const matchedContract = contracts.find(contract => normalize(contract.agreementNo) === target)
        || contracts.find(contract => {
          const code = normalize(contract.agreementNo);
          return code.length > 0 && (code.includes(target) || target.includes(code));
        });
      if (matchedContract) {
        setFormData(prev => ({ ...prev, contractId: matchedContract.id }));
        await fetchPreviousBills(matchedContract.id);
        toast.success(`Matched contract ${matchedContract.agreementNo} from the bill`, { icon: '🔗' });
      }
    }

    let mappedEntries = buildClassificationEntriesFromExtractedBill(data);

    // Entries are rebuilt from the extracted items every time the analyzer changes
    // (item deleted, cement cost applied, ...). Carry the user's manual classification
    // choices over from the current entries so a rebuild never undoes a hand edit.
    const preserveManualClassifications = (
      nextEntries: ClassificationEntry[],
      currentEntries: ClassificationEntry[],
    ) => {
      const manualByKey = new Map(manualClassificationOverridesRef.current);
      currentEntries
        .filter(entry => entry.manualClassification && entry.subClassificationId)
        .forEach(entry => manualByKey.set(classificationEntryKey(entry), entry));
      if (manualByKey.size === 0) return nextEntries;

      return nextEntries.map(entry => {
        const manual = manualByKey.get(classificationEntryKey(entry));
        if (!manual) return entry;
        return {
          ...entry,
          mainClassificationGroupId: manual.mainClassificationGroupId || manual.subClassification?.groupId,
          subClassificationId: manual.subClassificationId,
          subClassification: manual.subClassification,
          manualClassification: true,
          classificationJustification: manual.classificationJustification || entry.classificationJustification,
        };
      });
    };
    mappedEntries = preserveManualClassifications(mappedEntries, classificationEntries);

    const extractedMeasurementDate = normalizeExtractedDate(billDetails?.measurementDate)
      || formData.dateOfMeasurement;
    mappedEntries = await applyPvcComparisonToEntries(mappedEntries, extractedMeasurementDate);

    // Rebate handling: when the work was awarded below the estimate, the printed
    // gross "Total Amount" is reduced to the net "Bill Amount (Incl GST)". Scale
    // every component down by the same factor so the stored bill amount and the
    // per-component PVC are computed on the post-rebate (payable) value.
    const rebateFactor = computeRebateFactor({
      grossTotal: billDetails?.grossBillAmount,
      netBillAmount: billDetails?.netBillAmount,
      rebatePercentage: billDetails?.rebatePercentage,
    });
    if (rebateFactor < 1) {
      // Scale as a group so the components tie exactly to the net (no paise drift).
      const scaledAmounts = scaleComponentsWithRebate(
        mappedEntries.map(entry => Number(entry.amount || 0)),
        rebateFactor,
      );
      mappedEntries = mappedEntries.map((entry, index) => ({
        ...entry,
        amount: scaledAmounts[index],
      }));
      const netFigure = billDetails?.netBillAmount;
      const pct = billDetails?.rebatePercentage;
      toast.success(
        `Rebate${pct ? ` of ${pct}%` : ''} applied — components scaled to the net Bill Amount`
        + (netFigure ? ` ₹${netFigure.toLocaleString('en-IN')}` : ''),
        { icon: '↓', duration: 4000 },
      );
    }

    setFormData(prev => ({
      ...prev,
      billNo: billDetails?.billNo || prev.billNo,
      dateOfMeasurement: normalizeExtractedDate(billDetails?.measurementDate) || prev.dateOfMeasurement,
      // Post-rebate: components are scaled to the net Bill Amount, so the gross field
      // (pre-non-schedule deduction) reflects the same rebate factor. No rebate → factor 1.
      grossBillAmount: billDetails?.grossBillAmount ? (billDetails.grossBillAmount * rebateFactor).toFixed(2) : prev.grossBillAmount,
      // Extracted items are already represented in classification entries. Dedicated
      // inputs are reserved for additional components entered manually.
      cementAmount: '',
      steelTmtBarsAmount: '',
      steelAngleChannelAmount: '',
      steelPlatesAmount: '',
      steelOtherSectionsAmount: '',
    }));

    if (mappedEntries.length > 0) {
      // The extraction pipeline is asynchronous. A user may change a classification while
      // indices/rebate processing is still finishing, so merge against the latest state at
      // commit time instead of overwriting that manual choice with an older extraction.
      setClassificationEntries(currentEntries =>
        preserveManualClassifications(mappedEntries, currentEntries));
      setOpenAccordion(prev => Array.from(new Set([...prev, 'basic', 'classification', 'optional'])));
      toast.success(`Applied ${mappedEntries.length} mapped bill item(s)`);
    } else {
      setOpenAccordion(prev => Array.from(new Set([...prev, 'basic'])));
      toast('Bill details extracted. Classification mapping needs review.');
    }
  };

  const handleClassificationEntriesChange = (entries: ClassificationEntry[]) => {
    entries
      .filter(entry => entry.manualClassification)
      .forEach(entry => {
        const key = classificationEntryKey(entry);
        if (entry.subClassificationId) {
          manualClassificationOverridesRef.current.set(key, entry);
        } else {
          // The user cleared this entry's classification — drop any remembered
          // override so a rebuild doesn't resurrect the classification they removed.
          manualClassificationOverridesRef.current.delete(key);
        }
      });
    setClassificationEntries(entries);
  };

  const handleContractChange = async (value: string) => {
    setIsAiUploaded(false);
    setFormData(prev => ({
      ...prev,
      contractId: value
    }));
    
    // Fetch previous bills for this contract to display them
    if (value) {
      await fetchPreviousBills(value);
    } else {
      setPreviousBills([]);
    }
  };

  const fetchPreviousBills = async (contractId: string) => {
    setIsLoadingPreviousBills(true);
    try {
      const response = await fetch(`/api/bills?contractId=${contractId}`);
      if (!response.ok) {
        console.error('Failed to fetch previous bills');
        setPreviousBills([]);
        return;
      }

      const result = await response.json();
      const bills = result.data || [];
      setPreviousBills(bills);

      // Auto carry-forward zone, fuel, and suggested bill number from the latest bill
      if (bills.length > 0) {
        const latest = bills[0];
        setFormData(prev => ({
          ...prev,
          zone: latest.zone || prev.zone,
          fuelPriceType: latest.fuelPriceType || prev.fuelPriceType,
          billNo: suggestNextBillNo(latest.billNo),
        }));
        toast.success(`Carried forward zone, fuel & bill number from ${latest.billNo || 'previous bill'}`, { duration: 3000, icon: '📋' });
      }
    } catch (error) {
      console.error('Error fetching previous bills:', error);
      setPreviousBills([]);
    } finally {
      setIsLoadingPreviousBills(false);
    }
  };

  const suggestNextBillNo = (prevBillNo: string): string => {
    if (!prevBillNo) return '';
    // Increment trailing integer: "RA/001/2024" → "RA/002/2024", "Bill-5" → "Bill-6"
    const match = prevBillNo.match(/^(.*?)(\d+)(\D*)$/);
    if (match) {
      const [, prefix, numStr, suffix] = match;
      const next = String(parseInt(numStr, 10) + 1).padStart(numStr.length, '0');
      return `${prefix}${next}${suffix}`;
    }
    return '';
  };

  const fetchPreviousBillClassification = async () => {
    if (!formData.contractId) {
      toast.error('Please select a contract first');
      return;
    }

    if (classificationGroups.length === 0) {
      toast.error('Classification groups not loaded yet');
      return;
    }

    setIsFetchingClassification(true);
    try {
      // Use the already fetched previous bills
      if (previousBills && previousBills.length > 0) {
        const previousBill = previousBills[0];
        
        // Pre-populate work classification if available
        if (previousBill.workClassification?.id) {
          setFormData(prev => ({
            ...prev,
            workClassification: previousBill.workClassification.id
          }));
          
          // Update selected group
          const group = classificationGroups.find(g => 
            g.subClassifications.some(s => s.id === previousBill.workClassification.id)
          );
          if (group) {
            setSelectedGroup(group);
          }
        }
        
        // Pre-populate classification entries if available
        if (previousBill.classificationEntries && previousBill.classificationEntries.length > 0) {
          const entries = previousBill.classificationEntries.map((entry: any) => ({
            subClassificationId: entry.subClassificationId,
            subClassification: entry.subClassification,
            amount: 0, // Start with 0 amount, user will update
            description: entry.description || '',
            scheduleItem: entry.scheduleItem || '',
            itemNumber: entry.itemNumber || '',
            quantity: '',  // Reset qty for new bill
            agreementRate: entry.agreementRate || '' // Keep rate from previous bill
          }));
          setClassificationEntries(entries);
          
          // Show success message
          toast.success(`Loaded classification from previous bill (${previousBill.billNo || 'Latest'})`, {
            duration: 3000,
            icon: '📋'
          });
        } else {
          toast.error('No classification entries found in previous bill');
        }
      } else {
        toast.error('No previous bills found for this contract');
      }
    } catch (error) {
      console.error('Error fetching previous bill classification:', error);
      toast.error('Failed to load previous classification');
    } finally {
      setIsFetchingClassification(false);
    }
  };

  const handleGroupChange = (groupId: string) => {
    const group = classificationGroups.find(g => g.id === groupId);
    if (group) {
      setSelectedGroup(group);
      // Auto-select first sub-classification in the new group
      if (group.subClassifications.length > 0) {
        const defaultSub = group.subClassifications.find(s => s.isDefault) || group.subClassifications[0];
        setFormData(prev => ({
          ...prev,
          workClassification: defaultSub.id
        }));
      }
    }
  };

  const handleSubClassificationChange = (subClassId: string) => {
    setFormData(prev => ({
      ...prev,
      workClassification: subClassId
    }));
  };
  // Work out the cement-affected schedules (and their cement MT) from the item numbers
  // and quantities already entered, so the DSR calculator can derive the cement cost
  // without needing a PDF upload or a hand-typed quantity.
  const deriveCementFromItems = async () => {
    const items: Array<{ dsrCode: string; description: string; unit: string; quantity: number; schedule: string }> = [];
    for (const entry of classificationEntries) {
      const schedule = entry.scheduleItem || 'Default';
      const rows = entry.itemRows && entry.itemRows.length > 0
        ? entry.itemRows
        : [{ itemNumber: entry.itemNumber, quantity: entry.quantity }];
      for (const row of rows) {
        const qty = Number(row.quantity) || 0;
        const code = String(row.itemNumber || '').trim();
        if (code && qty > 0) {
          items.push({ dsrCode: code, description: entry.description || '', unit: '', quantity: qty, schedule });
        }
      }
    }
    if (items.length === 0) {
      toast.error('Add item numbers and quantities to your classification items first.');
      return;
    }
    setDerivingCement(true);
    try {
      const res = await fetch('/api/bills/cement-from-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Could not derive cement.');
        return;
      }
      setCementUnmatched(data.unmatchedCodes || []);
      if (!data.schedules?.length) {
        setCementSchedules([]);
        toast.error('No cement found — none of these item numbers are in the cement coefficient list.', { duration: 5000 });
        return;
      }
      setCementSchedules(data.schedules);
      toast.success(
        `Found ${data.matchedCount} cement item(s) across ${data.schedules.length} schedule(s).`
        + (data.unmatchedCount ? ` ${data.unmatchedCount} item(s) had no coefficient.` : ''),
      );
    } catch {
      toast.error('The request failed. Please try again.');
    } finally {
      setDerivingCement(false);
    }
  };

  // Split derived cement out of the work items into a "Cement (derived)" classification
  // row (like the AI upload) instead of the single dedicated field, keeping the total same.
  const applyDerivedCement = (total: number, breakdown: CementBreakdownItem[]) => {
    const allSubs = classificationGroups.flatMap((g: any) => g.subClassifications);
    const mainCode = (classificationEntries[0]?.subClassification?.code
      || (selectedContract?.workDescription ? inferMainClassification(selectedContract.workDescription).code : '')
      || '').charAt(0).toUpperCase();
    const cementSub = allSubs.find((s: any) => s.code?.toUpperCase() === `${mainCode}C`)
      || allSubs.find((s: any) => /c$/i.test(s.code || ''));
    if (!cementSub) {
      // No cement classification exists — fall back to the dedicated field.
      setFormData(p => ({ ...p, cementAmount: total.toFixed(2) }));
      toast.success(`Cement cost applied to the dedicated field: ₹${total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
      return;
    }
    const makeCementEntry = (item: CementBreakdownItem, amount: number): ClassificationEntry => {
      const qty = item.cementQtyMT ?? 0;
      const rate = item.ratePerMt ?? 0;
      const breakup = qty > 0 && rate > 0
        ? ` · ${qty.toLocaleString('en-IN', { maximumFractionDigits: 3 })} MT × ₹${rate.toLocaleString('en-IN', { maximumFractionDigits: 2 })}/MT`
          + (item.affectedItemCount ? ` (${item.affectedItemCount} items)` : '')
        : '';
      return {
        subClassificationId: cementSub.id,
        subClassification: cementSub,
        amount,
        description: `Cement (derived) — ${item.schedule}${breakup}`,
        scheduleItem: item.schedule === 'Default' ? '' : item.schedule,
        isDerivedCement: true,
        manualClassification: true,
        classificationJustification: `Cement portion split from the work items using DSR 2021 cement coefficients${breakup ? `:${breakup.replace(' · ', ' ')} = ₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '.'}`,
      };
    };
    const next = applyCementSplit(classificationEntries, breakdown, makeCementEntry);
    setClassificationEntries(next);
    // Cement now lives in the classification rows, so clear the dedicated field to avoid double-counting.
    setFormData(p => ({ ...p, cementAmount: '' }));
    toast.success(`Cement split into ${breakdown.filter(b => b.amount > 0).length} classification row(s): ₹${total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
  };

  const handlePreview = async () => {
    if (!formData.contractId || !formData.zone || !formData.dateOfMeasurement) {
      toast.error('Please fill Contract, Zone, and Date of Measurement before previewing');
      return;
    }
    if (cementCostPending) {
      toast.error('Apply the derived cement cost (enter the rate settings and apply) before checking PVC.');
      return;
    }
    setIsPreviewLoading(true);
    try {
      const grossAmount = classificationEntries.reduce((sum, e) => {
        const amt = e.amount === '' || e.amount == null ? 0 : typeof e.amount === 'string' ? parseFloat(e.amount) || 0 : e.amount;
        return sum + amt;
      }, 0);
      const nonScheduleTotal = nonScheduleItems
        .filter(i => i.description && i.amount)
        .reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);
      const res = await fetch('/api/bills/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId: formData.contractId,
          grossBillAmount: grossAmount,
          billAmount: grossAmount - nonScheduleTotal,
          dateOfMeasurement: formData.dateOfMeasurement,
          zone: formData.zone,
          fuelPriceType: formData.fuelPriceType,
          calculationMethod: (formData as any).calculationMethod || 'auto',
          classificationEntries,
          isAiUploaded,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Preview failed'); return; }
      setPreviewResult(data);
      setShowPreviewModal(true);
    } catch {
      toast.error('Preview failed. Please try again.');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleConfirmAndSubmit = async () => {
    setShowConfirmDialog(false);
    await handleSubmit();
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowConfirmDialog(true);
  };

  const handleSubmit = async () => {
    if (cementCostPending) {
      toast.error('Apply the derived cement cost (enter the rate settings and apply) before creating the bill.');
      return;
    }
    setSaving(true);
    setError('');

    try {
      // Recover the sub-classification id from the entry's classification object when
      // the id string is missing (an intermediate transform can carry the object but
      // drop the id), and drop rows that are entirely empty — so a validly-classified
      // uploaded row is never rejected by the check below.
      const amountOf = (value: ClassificationEntry['amount']) =>
        value === '' || value === null || value === undefined
          ? 0
          : typeof value === 'string' ? parseFloat(value) || 0 : value;
      const isEmptyEntry = (entry: ClassificationEntry) =>
        !entry.subClassificationId && !(entry.subClassification as any)?.id
        && amountOf(entry.amount) === 0 && !(entry.description || '').trim();
      // Resolve each entry to a currently-valid sub-classification id: keep the stored
      // id when it exists in the loaded groups; otherwise re-resolve by the attached
      // classification's CODE (stable across re-seeds); otherwise fall back to the raw id.
      const allSubs = classificationGroups.flatMap(group => group.subClassifications);
      const resolveSubId = (entry: ClassificationEntry): string => {
        const raw = entry.subClassificationId || (entry.subClassification as any)?.id || '';
        if (raw && allSubs.some(sub => sub.id === raw)) return raw;
        const code = String((entry.subClassification as any)?.code || '').toUpperCase();
        if (code) {
          const byCode = allSubs.find(sub => sub.code.toUpperCase() === code);
          if (byCode) return byCode.id;
        }
        return raw;
      };
      const cleanedEntries = classificationEntries
        .filter(entry => !isEmptyEntry(entry))
        .map(entry => ({
          ...entry,
          subClassificationId: resolveSubId(entry),
        }));
      if (cleanedEntries.length !== classificationEntries.length) {
        setClassificationEntries(cleanedEntries);
      }

      // Validate that all remaining entries have a sub-classification and non-negative amount
      if (cleanedEntries.length > 0) {
        const invalidIndex = cleanedEntries.findIndex(entry => !entry.subClassificationId || amountOf(entry.amount) < 0);
        if (invalidIndex >= 0) {
          toast.error(`Entry ${invalidIndex + 1} needs a valid sub-classification and a non-negative amount.`);
          setSaving(false);
          return;
        }
      }

      // Calculate total classification amount, treating blank/undefined/null as 0
      const totalClassificationAmount = cleanedEntries.reduce((sum, entry) => sum + amountOf(entry.amount), 0);

      // Convert sub-classifications to proper format with numeric amounts (legacy support)
      const formattedSubClassifications = subClassifications
        .filter(sc => sc.code && sc.amount) // Only include complete entries
        .map(sc => ({
          code: sc.code,
          name: sc.name,
          amount: parseFloat(sc.amount) || 0
        }));
      
      // Convert non-schedule items to proper format with numeric amounts
      const formattedNonScheduleItems = nonScheduleItems
        .filter(item => item.description && item.amount) // Only include complete entries
        .map(item => ({
          description: item.description.trim(),
          amount: parseFloat(item.amount) || 0
        }));
      
      // Use total classification amount as gross bill amount
      const grossAmount = totalClassificationAmount;
      const nonScheduleTotal = formattedNonScheduleItems.reduce((sum, item) => sum + item.amount, 0);
      const netBillAmount = grossAmount - nonScheduleTotal;

      // Submit bill with classification entries
      const response = await fetch('/api/bills', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          grossBillAmount: grossAmount,
          billAmount: netBillAmount, // Calculated net amount
          classificationEntries: cleanedEntries.map(entry => ({
            subClassificationId: entry.subClassificationId,
            amount: entry.amount === '' || entry.amount === null || entry.amount === undefined
              ? 0
              : typeof entry.amount === 'string'
                ? parseFloat(entry.amount) || 0
                : entry.amount,
            description: entry.description || '',
            classificationJustification: entry.classificationJustification || null,
            steelTypes: entry.steelTypes || [],
            scheduleItem: entry.scheduleItem || null,
            itemNumber: entry.itemNumber || null,
            quantity: entry.quantity === '' || entry.quantity === null || entry.quantity === undefined ? null : parseFloat(String(entry.quantity)) || null,
            agreementRate: entry.agreementRate === '' || entry.agreementRate === null || entry.agreementRate === undefined ? null : parseFloat(String(entry.agreementRate)) || null,
            itemRows: entry.itemRows && entry.itemRows.length > 0 ? entry.itemRows.map(r => ({
              itemNumber: r.itemNumber || '',
              quantity: r.quantity === '' ? null : parseFloat(String(r.quantity)) || null,
              agreementRate: r.agreementRate === '' ? null : parseFloat(String(r.agreementRate)) || null,
            })) : null
          })),
          subClassifications: formattedSubClassifications, // Legacy support
          nonScheduleItems: formattedNonScheduleItems,
          paymentConfirmed: true, // Always set as confirmed since we removed payments
          paymentMethod: 'free',
          paymentReference: null,
          isAiUploaded,
        }),
      });

      const responseData = await response.json();

      if (response.ok) {
        // Bill created successfully
        if (responseData.appliedPvcCheckCredit && responseData.pvcCheckCredit) {
          toast.success(`Bill ${responseData.billNo} created! ₹${responseData.pvcCheckCredit} PVC check credit applied.`, {
            duration: 4000,
            icon: '✨'
          });
        } else {
          toast.success(`Bill ${responseData.billNo} created successfully!`);
        }
        
        // Navigate to bills page after successful creation
        router.push('/bills');
        return;
      }

      // Handle errors
      const errorMessage = responseData.error || 'Failed to create bill';
      
      // Check if this is an insufficient credit error
      if (errorMessage.includes('Insufficient balance') || errorMessage.includes('insufficient credit')) {
        // Parse credit information from error message
        // Format: "Insufficient balance. Required: ₹X, Available: ₹Y. Please add credits to continue."
        const requiredMatch = errorMessage.match(/Required:\s*₹?([\d,]+\.?\d*)/);
        const availableMatch = errorMessage.match(/Available:\s*₹?([\d,]+\.?\d*)/);
        
        if (requiredMatch && availableMatch) {
          const required = parseFloat(requiredMatch[1].replace(/,/g, ''));
          const available = parseFloat(availableMatch[1].replace(/,/g, ''));
          
          setCreditInfo({
            currentBalance: available,
            requiredAmount: required,
            shortfall: required - available
          });
          setShowInsufficientCredit(true);
          return;
        }
      }
      
      throw new Error(errorMessage);

    } catch (error: any) {
      console.error('Error creating bill:', error);
      setError(error.message || 'Failed to create bill');
      toast.error(error.message || 'Failed to create bill');
    } finally {
      setSaving(false);
    }
  };



  // Removed payment confirmation function

  // Find the selected sub-classification across all groups
  const selectedSubClassification = classificationGroups
    .flatMap(g => g.subClassifications)
    .find(s => s.id === formData.workClassification) || null;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <LoadingSpinner size="lg" text={language === 'hi' ? 'अनुबंध लोड किए जा रहे हैं...' : 'Loading contracts...'} />
      </div>
    );
  }

  const BILL_TABS = [
    { id: 'basic', label: t('form.bill.basic_info'), icon: Building2 },
    { id: 'classification', label: t('form.bill.classifications'), icon: ClipboardList },
    { id: 'cement', label: language === 'hi' ? 'सीमेंट' : 'Cement', icon: Package },
    { id: 'optional', label: t('form.bill.non_schedule'), icon: Layers },
  ];
  const billTabIndex = Math.max(0, BILL_TABS.findIndex(tb => tb.id === activeBillTab));
  const billPanelCls = (id: string) => (activeBillTab === id ? 'block' : 'hidden');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <BackButton href="/bills" label={t('form.bill.back')} variant="outline" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <FileText className="h-8 w-8 text-emerald-600" />
            {t('form.bill.add_title')}
          </h1>
          <p className="text-gray-600 mt-2">
            {language === 'hi' ? 'स्वचालित पीवीसी गणना के साथ एक नया रनिंग अकाउंट बिल जोड़ें' : 'Add a new running account bill with automatic PVC calculation'}
          </p>
        </div>
      </div>

      {/* Railway Official — Incomplete Posting Details Block */}
      {roQuota?.applicable && roQuota.postingComplete === false && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-red-100 p-1.5 mt-0.5">
              <svg className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">
                {language === 'hi' ? 'रेलवे पोस्टिंग विवरण अपूर्ण' : 'Railway Posting Details incomplete'}
              </p>
              <p className="mt-0.5 text-xs text-red-600">
                {language === 'hi'
                  ? 'बिल बनाने से पहले आपको अपना पोस्टिंग विवरण पूरा करना होगा। गायब फ़ील्ड: '
                  : 'You must complete your posting details before creating a bill. Missing: '}
                <strong>{roQuota.missingPostingFields?.join(', ')}</strong>.
              </p>
              <a
                href="/profile#posting"
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
              >
                {language === 'hi' ? 'पोस्टिंग विवरण पूरा करें →' : 'Complete Posting Details →'}
              </a>
            </div>
          </div>
        </div>
      )}


      {/* Free Trial Banner */}
      {hasFreeTrial && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-3">
          <span className="text-2xl">🎉</span>
          <div>
            <p className="text-sm font-bold text-green-800">
              {language === 'hi' ? 'आपका पहला बिल मुफ़्त है — मुफ़्त परीक्षण सक्रिय' : 'Your first bill is FREE — Free Trial Active'}
            </p>
            <p className="text-xs text-green-700 mt-0.5">
              {language === 'hi'
                ? 'बिना किसी लागत के अपना पहला बिल बनाएं। किसी क्रेडिट की आवश्यकता नहीं है। पीडीएफ में वॉटरमार्क जोड़ा जाएगा।'
                : 'Create your first bill at no cost. No credits needed. Watermark will be added to the PDF.'}
            </p>
          </div>
        </div>
      )}

      {/* Maintenance Mode Alert */}
      {isMaintenanceMode && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg">
          <div className="flex items-start">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-medium text-yellow-800">
                {language === 'hi' ? 'एकल बिल निर्माण रखरखाव के अंतर्गत है' : 'Single Bill Creation Under Maintenance'}
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>
                  {language === 'hi'
                    ? 'सिस्टम रखरखाव के कारण वर्तमान में एकल बिल निर्माण अनुपलब्ध है। कृपया बाद में पुनः प्रयास करें या अधिक जानकारी के लिए अपने व्यवस्थापक से संपर्क करें।'
                    : 'Single bill creation is currently unavailable due to system maintenance. Please try again later or contact your administrator for more information.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 0 — choose how to create the bill */}
      {billMode === 'choose' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 md:p-8">
          <h2 className="text-lg font-bold text-slate-900 text-center">
            {language === 'hi' ? 'बिल कैसे बनाना है?' : 'How do you want to create this bill?'}
          </h2>
          <p className="text-sm text-slate-500 text-center mt-1">
            {language === 'hi' ? 'एक विकल्प चुनें। आप बाद में बदल सकते हैं।' : 'Pick one option. You can change it later.'}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 max-w-3xl mx-auto">
            <button
              type="button"
              onClick={() => setBillMode('manual')}
              className="text-left rounded-2xl border-2 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/40 transition-all p-5 group"
            >
              <div className="flex items-center gap-3">
                <div className="bg-slate-100 group-hover:bg-emerald-100 text-slate-600 group-hover:text-emerald-600 p-2.5 rounded-xl transition-colors">
                  <Edit className="h-6 w-6" />
                </div>
                <div className="font-bold text-slate-900">
                  {language === 'hi' ? 'मैन्युअल रूप से भरें' : 'Enter details manually'}
                </div>
              </div>
              <p className="text-sm text-slate-500 mt-3">
                {language === 'hi'
                  ? 'फ़ॉर्म को चरण-दर-चरण स्वयं भरें।'
                  : 'Fill the form yourself, step by step.'}
              </p>
            </button>

            <button
              type="button"
              onClick={() => setBillMode('ai')}
              className="text-left rounded-2xl border-2 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/40 transition-all p-5 group"
            >
              <div className="flex items-center gap-3">
                <div className="bg-emerald-50 group-hover:bg-emerald-100 text-emerald-600 p-2.5 rounded-xl transition-colors">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div className="font-bold text-slate-900">
                  {language === 'hi' ? 'साइन किया हुआ बिल PDF अपलोड करें' : 'Upload signed bill PDF'}
                </div>
              </div>
              <p className="text-sm text-slate-500 mt-3">
                {language === 'hi'
                  ? 'AI PDF पढ़कर फ़ॉर्म भर देगा। सहेजने पर ही AI दर लगेगी।'
                  : 'Let AI read the PDF and fill the form. Charged the AI rate only when you save.'}
              </p>
            </button>
          </div>
        </div>
      )}

      {billMode !== 'choose' && (
        <div className="flex items-center justify-between bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-2.5">
          <span className="text-sm text-slate-600">
            {language === 'hi' ? 'तरीका: ' : 'Method: '}
            <span className="font-semibold text-slate-900">
              {billMode === 'ai'
                ? (language === 'hi' ? 'PDF अपलोड (AI)' : 'PDF upload (AI)')
                : (language === 'hi' ? 'मैन्युअल' : 'Manual')}
            </span>
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setBillMode('choose')} className="text-slate-500 hover:text-slate-700">
            {language === 'hi' ? 'बदलें' : 'Change'}
          </Button>
        </div>
      )}

      {/* Progress indicator */}
      {billMode !== 'choose' && (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-6">
        <div className="flex items-center justify-between text-sm overflow-x-auto gap-4">
          <div className={`flex items-center gap-2 flex-shrink-0 ${formData.contractId && formData.billNo && formData.zone && formData.dateOfMeasurement ? 'text-green-600 font-semibold' : 'text-slate-400'}`}>
            {formData.contractId && formData.billNo && formData.zone && formData.dateOfMeasurement ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <div className="h-5 w-5 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold">1</div>
            )}
            <span>{language === 'hi' ? 'बुनियादी जानकारी' : 'Basic Info'}</span>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0" />
          <div className={`flex items-center gap-2 flex-shrink-0 ${classificationEntries.length > 0 ? 'text-green-600 font-semibold' : 'text-slate-400'}`}>
            {classificationEntries.length > 0 ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <div className="h-5 w-5 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold">2</div>
            )}
            <span>{language === 'hi' ? 'वर्गीकरण' : 'Classifications'}</span>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0" />
          <div className="flex items-center gap-2 text-slate-400 flex-shrink-0">
            <div className="h-5 w-5 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold">3</div>
            <span>{language === 'hi' ? 'वैकल्पिक विवरण' : 'Optional Details'}</span>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0" />
          <div className="flex items-center gap-2 text-slate-400 flex-shrink-0">
            <div className="h-5 w-5 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold">4</div>
            <span>{language === 'hi' ? 'समीक्षा करें और सबमिट करें' : 'Review & Submit'}</span>
          </div>
        </div>
      </div>
      )}

      {/* Contract and Quarter Info Cards - Displayed at top when selected */}
      {billMode !== 'choose' && (selectedContract || formData.dateOfMeasurement) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Contract Info */}
          {selectedContract && (
            <Card className="border border-slate-100 shadow-sm bg-white rounded-2xl overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-5">
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-emerald-600" />
                  {language === 'hi' ? 'चयनित अनुबंध' : 'Selected Contract'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">{language === 'hi' ? 'अनुबंध संख्या:' : 'Agreement No:'}</span>
                  <span className="font-semibold text-slate-800">{selectedContract.agreementNo}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">{language === 'hi' ? 'ठेकेदार:' : 'Contractor:'}</span>
                  <span className="font-semibold text-slate-800">{selectedContract.contractorName}</span>
                </div>
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    {language === 'hi' ? 'कार्य का विवरण' : 'Work Description'}
                  </span>
                  <p className="text-slate-700 font-medium text-xs leading-relaxed">{selectedContract.workDescription}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quarter Info */}
          {formData.dateOfMeasurement && (
            <Card className="border border-slate-100 shadow-sm bg-white rounded-2xl overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-5">
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-green-600" />
                  {language === 'hi' ? 'त्रैमासिक जानकारी' : 'Quarter Information'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 flex flex-col justify-center items-center text-center min-h-[160px]">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">
                  {language === 'hi' ? 'माप की तिथि' : 'Measurement Date'}
                </p>
                <p className="font-bold text-slate-800 text-lg">
                  {new Date(formData.dateOfMeasurement).toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                </p>
                <div className="mt-4 px-4 py-2 bg-green-50 text-green-700 rounded-xl border border-green-100 font-semibold text-sm">
                  {language === 'hi' ? 'सक्रिय पीवीसी तिमाही' : 'Active PVC Quarter'}: Q{Math.floor((new Date(formData.dateOfMeasurement).getMonth()) / 3) + 1}-{new Date(formData.dateOfMeasurement).getFullYear()}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Bill Form - Full Width */}
      {billMode !== 'choose' && (
      <div className="grid grid-cols-1 gap-6">
        <div className="w-full">
          <Card className="border border-slate-100 shadow-sm bg-white rounded-2xl overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-6">
              <CardTitle className="flex items-center gap-3 text-lg font-bold text-slate-900">
                <div className="bg-emerald-50 p-2 rounded-xl text-emerald-600">
                  <FileText className="h-6 w-6" />
                </div>
                {language === 'hi' ? 'बिल विवरण' : 'Bill Details'}
              </CardTitle>
              <CardDescription className="text-sm text-slate-500 mt-1">
                {language === 'hi'
                  ? 'बिल की जानकारी दर्ज करें। तिमाही के आधार पर पीवीसी की गणना स्वचालित रूप से की जाएगी।'
                  : 'Enter the bill information. PVC will be calculated automatically based on the quarter.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleFormSubmit} className="space-y-4" noValidate>
                {error && (
                  <div ref={errorRef}>
                    <StatusMessage type="error" title="Error" message={error} />
                  </div>
                )}

                {billMode === 'ai' && (
                  <BillPdfCementAnalyzer
                    title="Direct PDF Bill Extraction"
                    contractId={formData.contractId}
                    onApplyBillDetails={applyExtractedBillDetails}
                  />
                )}

                {/* Accordion for organized sections */}
                <div className="overflow-x-auto -mx-1 px-1 mb-4">
                  <div className="flex gap-1 border-b border-slate-200 min-w-max">
                    {BILL_TABS.map((tb) => {
                      const Icon = tb.icon;
                      const isActive = activeBillTab === tb.id;
                      return (
                        <button
                          key={tb.id}
                          type="button"
                          onClick={() => setActiveBillTab(tb.id)}
                          className={`flex items-center gap-2 whitespace-nowrap px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                            isActive
                              ? 'border-emerald-600 text-emerald-700'
                              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {tb.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-4">
                  
                  {/* SECTION 1: Basic Information */}
                  <div className={billPanelCls('basic')}>
                    <div className="border border-slate-200 rounded-xl bg-white px-4 py-4 space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="contractId" className="flex items-center gap-2">
                          {t('form.bill.contract')} <span className="text-red-500">*</span>
                        </Label>
                        <Select value={formData.contractId} onValueChange={handleContractChange}>
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder={t('form.bill.select_contract')} />
                          </SelectTrigger>
                          <SelectContent>
                            {contracts.map((contract) => (
                              <SelectItem key={contract.id} value={contract.id}>
                                {contract.agreementNo} - {contract.contractorName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                          {t('form.bill.contract_desc')}
                        </p>
                      </div>

                      {/* Carry-forward summary banner */}
                      {previousBills.length > 0 && (() => {
                        const latest = previousBills[0];
                        const cumPvc = latest.pvcCalculation?.cumulativePvc;
                        return (
                          <div className="flex items-start gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <p className="font-semibold text-emerald-900">{t('form.bill.carry_forward')}{latest.billNo || (language === 'hi' ? 'पिछला बिल' : 'previous bill')}</p>
                              <p className="text-emerald-700">{t('form.bill.auto_fill_msg')}</p>
                              {cumPvc != null && (
                                <p className="text-emerald-800 font-medium">
                                  {t('form.bill.prev_cumulative')}₹{cumPvc.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      <div className="space-y-2">
                        <Label htmlFor="billNo">
                          {t('form.bill.bill_no')} <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="billNo"
                          name="billNo"
                          value={formData.billNo}
                          onChange={handleInputChange}
                          placeholder={t('form.bill.bill_no_placeholder')}
                          required
                          className="bg-white"
                        />
                        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                          {t('form.bill.bill_no_desc')}
                        </p>
                        
                        {/* Previous Bills Display */}
                        {formData.contractId && (
                          <div className="mt-3">
                            {isLoadingPreviousBills ? (
                              <div className="text-xs text-gray-600 italic">
                                {language === 'hi' ? 'पिछले बिल लोड हो रहे हैं...' : 'Loading previous bills...'}
                              </div>
                            ) : previousBills.length > 0 ? (
                              <Accordion type="single" collapsible className="border rounded-lg">
                                <AccordionItem value="previous-bills" className="border-0">
                                  <AccordionTrigger className="px-3 py-2 hover:no-underline text-xs">
                                    <div className="flex items-center gap-2">
                                      <FileText className="h-3 w-3 text-emerald-600" />
                                      <span className="font-medium">{t('form.bill.prev_bills')} ({previousBills.length})</span>
                                    </div>
                                  </AccordionTrigger>
                                  <AccordionContent className="px-3 pb-3">
                                    <div className="space-y-1.5">
                                      {previousBills.map((bill: any, index: number) => (
                                        <div 
                                          key={bill.id}
                                          className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs"
                                        >
                                          <div className="flex-1">
                                            <span className="font-medium text-gray-900">{bill.billNo || (language === 'hi' ? `बिल ${index + 1}` : `Bill ${index + 1}`)}</span>
                                            <span className="text-gray-500 ml-2">
                                              ({new Date(bill.dateOfMeasurement).toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN', { 
                                                day: '2-digit', 
                                                month: 'short', 
                                                year: 'numeric' 
                                              })})
                                            </span>
                                          </div>
                                          <div className="font-semibold text-gray-900">
                                            ₹{bill.billAmount?.toLocaleString('en-IN') || '0'}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </AccordionContent>
                                </AccordionItem>
                              </Accordion>
                            ) : (
                              <div className="text-xs text-gray-600 italic">
                                {t('form.bill.no_prev_bills')}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="zone">
                          {t('form.bill.zone')} <span className="text-red-500">*</span>
                        </Label>
                        {roQuota?.applicable && roQuota.zone ? (
                          // Railway Official — zone is locked to their account zone
                          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                            <svg className="h-4 w-4 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-emerald-900">
                                {getRailwayZoneOptions().find((z) => z.value === roQuota.zone)?.label ?? roQuota.zone}
                              </p>
                              <p className="text-xs text-emerald-600">{t('form.bill.zone_locked')}</p>
                            </div>
                          </div>
                        ) : (
                          <Select value={formData.zone} onValueChange={(value) => setFormData(prev => ({ ...prev, zone: value }))}>
                            <SelectTrigger className="bg-white">
                              <SelectValue placeholder={t('form.bill.select_zone')} />
                            </SelectTrigger>
                            <SelectContent>
                              {getRailwayZoneOptions().map(zone => (
                                <SelectItem key={zone.value} value={zone.value}>
                                  {zone.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                          {t('form.bill.zone_desc')} {language === 'hi' ? '(सक्रिय स्टील सिटी का पूर्वावलोकन करने के लिए ज़ोन चुनें: ' : '(Select zone to preview active Steel City: '}
                          <span className="font-semibold text-slate-700">{formData.zone ? getSteelCityForZone(formData.zone) : (language === 'hi' ? 'कोई नहीं' : 'None')}</span>)
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="fuelPriceType">
                          {t('form.bill.fuel_basis')}
                        </Label>
                        <Select value={formData.fuelPriceType} onValueChange={(value) => setFormData(prev => ({ ...prev, fuelPriceType: value }))}>
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder={t('form.bill.select_fuel_basis')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="four_city_avg">{t('form.bill.four_city_avg')}</SelectItem>
                            <SelectItem value="zone_city">{t('form.bill.zone_city')} ({formData.zone ? getSteelCityForZone(formData.zone) : '...'})</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-600 flex items-center gap-1">
                          <Info className="h-3 w-3" />
                          {formData.fuelPriceType === 'zone_city' && formData.zone
                            ? (language === 'hi'
                                ? `एमपीएनजी ईंधन सूचकांक के लिए ${getSteelCityForZone(formData.zone)} से डीजल की कीमतों का उपयोग किया जाएगा`
                                : `Diesel prices from ${getSteelCityForZone(formData.zone)} will be used for MPNG Fuel index`)
                            : (language === 'hi'
                                ? 'दिल्ली, मुंबई, चेन्नई और कोलकाता की औसत डीजल कीमतों का उपयोग किया जाएगा'
                                : 'Average diesel prices of Delhi, Mumbai, Chennai & Kolkata will be used')}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="dateOfMeasurement" className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          {t('form.bill.date_measurement')} <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="dateOfMeasurement"
                          name="dateOfMeasurement"
                          type="date"
                          min={availableDateRange?.minDate || "2000-01-01"}
                          max={availableDateRange?.maxDate || "2099-12-31"}
                          value={formData.dateOfMeasurement}
                          onChange={handleInputChange}
                          onKeyDown={(e) => e.preventDefault()}
                          required
                          disabled={isLoadingDateRange}
                          className="bg-white cursor-pointer"
                        />
                        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                          {t('form.bill.date_measurement_desc')}
                        </p>
                        {availableDateRange && availableDateRange.minDate && availableDateRange.maxDate ? (
                          <p className="text-xs text-emerald-600 font-bold flex items-center gap-1.5 animate-blink mt-1">
                            <Info className="h-3.5 w-3.5 text-emerald-500 animate-pulse flex-shrink-0" />
                            <span>
                              {language === 'hi' ? 'सूचकांक उपलब्ध हैं ' : 'Indices available from '}
                              {new Date(availableDateRange.minDate).toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-GB', { timeZone: 'Asia/Kolkata' })}
                              {language === 'hi' ? ' से ' : ' to '}
                              {new Date(availableDateRange.maxDate).toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-GB', { timeZone: 'Asia/Kolkata' })}
                              {availableDateRange.lastCompleteDate && (
                                <span className="ml-1.5 bg-emerald-50 border border-emerald-150 text-emerald-700 px-1.5 py-0.5 rounded font-black whitespace-nowrap">
                                  ({language === 'hi' ? 'सभी सूचकांक अद्यतित हैं: ' : 'All indices final up to: '}
                                  {new Date(availableDateRange.lastCompleteDate).toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })})
                                </span>
                              )}
                              {availableDateRange.allowProvisional && availableDateRange.lastCompleteDate && availableDateRange.maxDate > availableDateRange.lastCompleteDate && (
                                <span className="ml-1.5 bg-amber-50 border border-amber-200 text-amber-700 px-1.5 py-0.5 rounded font-semibold whitespace-nowrap">
                                  {language === 'hi' ? 'बाद की तारीखें अनंतिम होंगी' : 'later dates = Provisional bill'}
                                </span>
                              )}
                            </span>
                          </p>
                        ) : isLoadingDateRange ? (
                          <p className="text-xs text-gray-500 flex items-center gap-1">
                            <LoadingSpinner className="h-3 w-3" />
                            {t('form.bill.loading_dates')}
                          </p>
                        ) : (
                          <p className="text-xs text-amber-600 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {t('form.bill.no_indices_warn')}
                          </p>
                        )}
                      </div>

                      <div className="space-y-3 pt-2">
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="isFinalPvc"
                            checked={formData.isFinalPvc}
                            onChange={(e) => setFormData(prev => ({ ...prev, isFinalPvc: e.target.checked }))}
                            className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <Label htmlFor="isFinalPvc" className="cursor-pointer font-medium">
                            {t('form.bill.final_pvc')}
                          </Label>
                        </div>
                        
                        {/* Conditional Date of Completion field */}
                        {formData.isFinalPvc && (
                          <div className="space-y-2 p-3 border border-green-200 rounded-lg bg-green-50 ml-6">
                            <Label htmlFor="dateOfCompletion" className="flex items-center gap-2 text-green-900 font-medium">
                              <Calendar className="h-4 w-4" />
                              {t('form.bill.date_completion')} <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              id="dateOfCompletion"
                              name="dateOfCompletion"
                              type="date"
                              min="2000-01-01"
                              max="2099-12-31"
                              value={formData.dateOfCompletion}
                              onChange={handleInputChange}
                              onKeyDown={(e) => e.preventDefault()}
                              required={formData.isFinalPvc}
                              className="bg-white cursor-pointer"
                            />
                            <p className="text-xs text-green-700">
                              {t('form.bill.final_pvc_req')}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* SECTION 2: Work Classifications */}
                  <div className={billPanelCls('classification')}>
                    <div className="border border-slate-200 rounded-xl bg-white px-4 py-4 space-y-4">
                      <p className="text-xs text-slate-500 leading-relaxed mb-2">
                        {t('form.bill.classifications_help')}
                      </p>
                      {/* Fetch Previous Classification Button */}
                      {formData.contractId && previousBills.length > 0 && (
                        <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg border border-emerald-200 mb-4">
                          <div className="flex items-center gap-2">
                            <Info className="h-4 w-4 text-emerald-600" />
                            <span className="text-sm text-emerald-900">
                              {t('form.bill.load_prev_classification')}
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={fetchPreviousBillClassification}
                            disabled={isFetchingClassification}
                            className="bg-white hover:bg-emerald-100"
                          >
                            {isFetchingClassification ? (
                              <LoadingSpinner size="sm" text={language === 'hi' ? 'लोड हो रहा है...' : 'Loading...'} />
                            ) : (
                              <>
                                <ArrowRight className="h-4 w-4 mr-1" />
                                {t('form.bill.fetch_classification')}
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                      
                      {/* Multi-Classification Entries Component */}
                      <BillClassificationEntries
                        value={classificationEntries}
                        onChange={handleClassificationEntriesChange}
                        classificationGroups={classificationGroups}
                        workDescription={selectedContract?.workDescription}
                        contractSchedules={scheduleNames(selectedContract?.schedules)}
                        scheduleRates={normalizeSchedules(selectedContract?.schedules)}
                        contractId={formData.contractId || undefined}
                        measurementDate={formData.dateOfMeasurement || undefined}
                        lockEntries={isAiUploaded}
                        aiJustificationFee={99}
                      />
                    </div>
                  </div>

                  {/* SECTION 2b: Cement (derived from the entered items via DSR) */}
                  <div className={billPanelCls('cement')}>
                    <div className="border border-slate-200 rounded-xl bg-white px-4 py-4 space-y-4">
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold text-slate-700">No direct cement item? Derive it from your items.</p>
                            <p className="text-[11px] text-slate-500">Uses the item numbers &amp; quantities entered above + DSR 2021 cement coefficients.</p>
                          </div>
                          <Button type="button" variant="outline" size="sm" disabled={derivingCement}
                            onClick={deriveCementFromItems}
                            className="border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100">
                            {derivingCement ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deriving…</>) : (<><ClipboardList className="mr-2 h-4 w-4" /> Derive cement from items</>)}
                          </Button>
                        </div>
                        {cementUnmatched.length > 0 && (
                          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs">
                            <p className="font-semibold text-amber-900">
                              No cement coefficient for {cementUnmatched.length} item number{cementUnmatched.length > 1 ? 's' : ''}:
                            </p>
                            <p className="mt-1 font-mono text-amber-800">{cementUnmatched.join(', ')}</p>
                            <p className="mt-1.5 text-amber-700">
                              Cement is only worked out for item numbers listed in the cement coefficient library.
                              Add them in{' '}
                              <Link href="/admin/dsr-cement-coefficients" target="_blank" className="underline font-medium">
                                Admin → Cement Coefficients
                              </Link>
                              , then press Derive again.
                            </p>
                          </div>
                        )}
                        {cementSchedules.length > 0 && (
                          <DsrCementCalculator
                            schedules={cementSchedules}
                            contractId={formData.contractId || undefined}
                            contractSchedules={selectedContract?.schedules}
                            contractRebate={selectedContract?.rebatePercentage}
                            onApply={applyDerivedCement}
                          />
                        )}
                      </div>
                      {Number(formData.cementAmount) > 0 && (
                        <p className="text-xs text-emerald-700">
                          Applied cement amount: <strong>₹{Number(formData.cementAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong> — included in this bill&apos;s PVC.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* SECTION 3: Non-Schedule Items (Optional) */}
                  <div className={billPanelCls('optional')}>
                    <div className="border border-slate-200 rounded-xl bg-white px-4 py-4 space-y-4">
                      {/* Non-Schedule Items Section */}
                      <div className="space-y-3 p-3 border border-orange-200 rounded-lg bg-orange-50 mt-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-sm font-semibold text-orange-900">
                              {t('form.bill.non_schedule')}
                            </Label>
                            <p className="text-xs text-orange-700 mt-0.5">
                              {t('form.bill.non_schedule_help')}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setNonScheduleItems([...nonScheduleItems, { description: '', amount: '' }])}
                            className="bg-white hover:bg-orange-100 h-8 text-xs"
                          >
                            {language === 'hi' ? '+ जोड़ें' : '+ Add'}
                          </Button>
                        </div>
                        
                        {nonScheduleItems.map((item, index) => (
                          <div key={index} className="grid grid-cols-12 gap-2 items-start p-2 bg-white rounded border border-gray-200">
                            <div className="col-span-7">
                              <Label className="text-xs text-gray-600 mb-1">{language === 'hi' ? 'विवरण' : 'Description'}</Label>
                              <Input
                                value={item.description}
                                onChange={(e) => {
                                  const newItems = [...nonScheduleItems];
                                  newItems[index].description = e.target.value;
                                  setNonScheduleItems(newItems);
                                }}
                                placeholder={language === 'hi' ? 'जैसे, विशेष सामग्री...' : 'e.g., Special materials...'}
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="col-span-4">
                              <Label className="text-xs text-gray-600 mb-1">{language === 'hi' ? 'राशि (₹)' : 'Amount (₹)'}</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={item.amount}
                                onChange={(e) => {
                                  const newItems = [...nonScheduleItems];
                                  newItems[index].amount = e.target.value;
                                  setNonScheduleItems(newItems);
                                }}
                                placeholder="0.00"
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="col-span-1 flex items-end">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const newItems = nonScheduleItems.filter((_, i) => i !== index);
                                  setNonScheduleItems(newItems);
                                }}
                                className="h-8 px-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                ×
                              </Button>
                            </div>
                          </div>
                        ))}
                        
                        {nonScheduleItems.length === 0 && (
                          <p className="text-xs text-gray-600 italic text-center py-2">
                            {t('form.bill.no_non_schedule')}
                          </p>
                        )}
                        
                        {nonScheduleItems.length > 0 && (
                          <div className="flex justify-end pt-2 border-t border-orange-200">
                            <div className="text-right">
                              <span className="text-xs font-medium text-orange-900">{t('form.bill.total_deduction')}</span>
                              <span className="text-sm font-bold text-orange-700">
                                -₹{nonScheduleItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tab step navigation */}
                <div className="flex items-center justify-between mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setActiveBillTab(BILL_TABS[Math.max(0, billTabIndex - 1)].id)}
                    disabled={billTabIndex === 0}
                    className="rounded-xl px-5"
                  >
                    {language === 'hi' ? 'पिछला' : 'Back'}
                  </Button>
                  <div className="flex items-center gap-1.5">
                    {BILL_TABS.map((tb, i) => (
                      <span
                        key={tb.id}
                        className={`h-1.5 rounded-full transition-all ${i === billTabIndex ? 'w-5 bg-emerald-600' : 'w-1.5 bg-slate-300'}`}
                      />
                    ))}
                  </div>
                  {billTabIndex < BILL_TABS.length - 1 ? (
                    <Button
                      type="button"
                      onClick={() => setActiveBillTab(BILL_TABS[Math.min(BILL_TABS.length - 1, billTabIndex + 1)].id)}
                      className="bg-slate-800 hover:bg-slate-900 text-white rounded-xl px-5"
                    >
                      {language === 'hi' ? 'अगला' : 'Next'}
                    </Button>
                  ) : (
                    <span className="w-[72px]" />
                  )}
                </div>

                {/* Submit Section */}
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 mt-6 border-t border-slate-200">
                  <div className="text-sm text-slate-500">
                    <p className="flex items-center gap-1.5">
                      <Info className="h-4 w-4 text-slate-400" />
                      {t('form.bill.required_fields_info')}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-start gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => router.back()}
                      disabled={isSaving}
                      className="min-w-[100px] rounded-xl h-10 border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                      {t('form.bill.cancel')}
                    </Button>
                    <div className="flex flex-col items-center gap-1">
                      <Button
                        type="button"
                        onClick={handlePreview}
                        disabled={isPreviewLoading || isSaving || !formData.contractId || !formData.zone || !formData.dateOfMeasurement || classificationEntries.length === 0}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[160px] rounded-xl shadow-sm shadow-emerald-500/10 font-semibold h-10"
                      >
                        {isPreviewLoading ? (
                          <LoadingSpinner size="sm" text={t('form.bill.calculating')} />
                        ) : (
                          <>
                            <Calculator className="h-4 w-4 mr-2" />
                            {t('form.bill.preview_pvc')}
                          </>
                        )}
                      </Button>
                      <p className="text-[10px] text-slate-400 text-center max-w-[160px]">
                        {t('form.bill.preview_free_info')}
                      </p>
                    </div>
                    <Button
                      type="submit"
                      disabled={isSaving || !formData.contractId || !formData.billNo || !formData.zone || !formData.dateOfMeasurement || (roQuota?.applicable === true && roQuota.postingComplete === false)}
                      title={roQuota?.applicable && roQuota.postingComplete === false ? (language === 'hi' ? 'पहले अपनी रेलवे पोस्टिंग विवरण पूरा करें' : 'Complete your Railway Posting Details first') : undefined}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[160px] rounded-xl shadow-sm shadow-emerald-500/10 font-semibold h-10 disabled:opacity-50"
                    >
                      {isSaving ? (
                        <LoadingSpinner size="sm" text={t('form.bill.processing')} />
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          {t('form.bill.process_bill')}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
      )}

      {/* Bill Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-250">
            {/* Header */}
            <div className="bg-amber-50 border-b border-amber-100 px-6 py-5 flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-amber-100 shrink-0">
                <AlertTriangle className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">{t('form.bill.confirm_title')}</h2>
                <p className="text-sm text-slate-500 mt-0.5">{t('form.bill.confirm_desc')}</p>
              </div>
            </div>

            {/* Checklist */}
            <div className="px-6 py-5 space-y-3">
              {[
                { label: language === 'hi' ? 'अनुबंध' : 'Contract', value: contracts.find(c => c.id === formData.contractId)?.agreementNo || '—' },
                { label: language === 'hi' ? 'बिल संख्या' : 'Bill No', value: formData.billNo || '—' },
                { label: language === 'hi' ? 'क्षेत्र' : 'Zone', value: formData.zone || '—' },
                { label: language === 'hi' ? 'माप की तिथि' : 'Date of Measurement', value: formData.dateOfMeasurement || '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between text-sm py-2 border-b border-slate-100 last:border-0">
                  <span className="text-slate-500 font-medium">{label}</span>
                  <span className="font-bold text-slate-800">{value}</span>
                </div>
              ))}
              <p className="text-xs text-red-600 font-semibold pt-1">
                {t('form.bill.confirm_warning')}
              </p>
            </div>

            {/* Actions */}
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setShowConfirmDialog(false)}
                className="flex-1 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold py-2.5 transition-colors"
              >
                {t('form.bill.go_back_review')}
              </button>
              <button
                onClick={handleConfirmAndSubmit}
                className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold py-2.5 transition-colors"
              >
                {t('form.bill.yes_submit')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Provisional Date Notification */}
      <ProvisionalDateNotification
        selectedDate={formData.dateOfMeasurement}
        onDateChange={handleDateChange}
        open={showProvisionalNotification}
        onOpenChange={setShowProvisionalNotification}
      />

      {/* Insufficient Credit Dialog */}
      <InsufficientCreditDialog
        open={showInsufficientCredit}
        onClose={() => setShowInsufficientCredit(false)}
        currentBalance={creditInfo.currentBalance}
        requiredAmount={creditInfo.requiredAmount}
        shortfall={creditInfo.shortfall}
      />

      {/* Subscription Dialog */}
      {/* Validation and Error Modal Popup */}
      {error && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-md bg-white border border-slate-100 rounded-3xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-250">
            <div className="text-center space-y-4">
              <div className="relative inline-flex items-center justify-center p-4 bg-red-50 rounded-2xl text-red-600 shadow-sm animate-bounce">
                <AlertTriangle className="h-8 w-8 animate-pulse" />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">{language === 'hi' ? 'सत्यापन त्रुटि' : 'Validation Error'}</h2>
                <div className="text-sm text-slate-700 max-h-[30vh] overflow-y-auto leading-relaxed text-left bg-slate-50 border border-slate-100 rounded-xl p-4 mt-2 font-semibold whitespace-pre-line shadow-inner">
                  {error}
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Button
                onClick={() => setError('')}
                className="w-full h-11 bg-slate-950 hover:bg-slate-900 text-white font-bold rounded-xl shadow-md transition-all active:scale-[0.98]"
              >
                {language === 'hi' ? 'समझ गए' : 'Understood'}
              </Button>
            </div>
          </Card>
        </div>
      )}
      {/* Preview Modal */}
      {showPreviewModal && previewResult && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden my-4">
            {/* SAMPLE watermark header */}
            <div className="relative bg-gradient-to-r from-emerald-600 to-emerald-600 px-6 py-5 text-white">
              <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none select-none">
                <span className="text-6xl font-black tracking-widest rotate-[-20deg] text-white">{language === 'hi' ? 'नमूना' : 'SAMPLE'}</span>
              </div>
              <div className="relative">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold uppercase tracking-widest bg-white/20 px-2 py-0.5 rounded-full">{language === 'hi' ? 'पूर्वावलोकन — सबमिशन के लिए नहीं' : 'Preview — Not for Submission'}</span>
                  {previewResult.isProvisional && (
                    <span className="text-xs font-bold bg-amber-400 text-amber-900 px-2 py-0.5 rounded-full">{language === 'hi' ? 'अनंतिम सूचकांक' : 'Provisional Indices'}</span>
                  )}
                </div>
                <h2 className="text-xl font-black mt-2">{language === 'hi' ? 'पीवीसी गणना पूर्वावलोकन' : 'PVC Calculation Preview'}</h2>
                <p className="text-emerald-100 text-sm">{language === 'hi' ? 'तिमाही' : 'Quarter'}: {previewResult.quarter}</p>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Total PVC */}
              <div className="text-center py-4 bg-emerald-50 rounded-xl border border-emerald-100">
                <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wider mb-1">{language === 'hi' ? 'कुल पीवीसी राशि' : 'Total PVC Amount'}</p>
                <p className="text-4xl font-black text-emerald-700">
                  ₹{previewResult.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </p>
                {previewResult.previousCumulativePvc > 0 && (
                  <p className="text-xs text-slate-500 mt-1">
                    {language === 'hi' ? 'संचयी पीवीसी: ' : 'Cumulative PVC: '}₹{previewResult.cumulativePvc.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    <span className="text-slate-400"> ({language === 'hi' ? 'पिछला' : 'prev'}: ₹{previewResult.previousCumulativePvc.toLocaleString('en-IN', { maximumFractionDigits: 0 })})</span>
                  </p>
                )}
              </div>

              {/* Component breakdown */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{language === 'hi' ? 'घटक विभाजन' : 'Component Breakdown'}</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {[
                    [language === 'hi' ? 'श्रम (लेबर)' : 'Labour', previewResult.components.labourPvc],
                    [language === 'hi' ? 'संयंत्र और मशीनरी' : 'Plant & Machinery', previewResult.components.plantPvc],
                    [language === 'hi' ? 'ईंधन / बिजली' : 'Fuel / Power', previewResult.components.fuelPvc],
                    [language === 'hi' ? 'अन्य सामग्री' : 'Other Materials', previewResult.components.materialsPvc],
                    [language === 'hi' ? 'सीमेंट' : 'Cement', previewResult.components.cementPvc],
                    [language === 'hi' ? 'इस्पात (स्टील)' : 'Steel', previewResult.components.steelPvc],
                    [language === 'hi' ? 'विस्फोटक' : 'Explosives', previewResult.components.explosivesPvc],
                  ].filter(([, v]) => (v as number) !== 0).map(([label, value]) => (
                    <div key={label as string} className="flex justify-between items-center px-3 py-2 bg-slate-50 rounded-lg">
                      <span className="text-slate-600">{label}</span>
                      <span className="font-semibold text-slate-900">₹{(value as number).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* First bill pricing CTA */}
              <div className={`rounded-xl p-4 border ${previewResult.isFirstBill ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    {previewResult.isFirstBill ? (
                      <>
                        <p className="font-bold text-amber-800 flex items-center gap-1.5">
                          🎉 {language === 'hi' ? 'मुफ़्त परीक्षण — आपका पहला बिल है ' : 'Free Trial — your first bill is '}<span className="text-2xl text-green-700">{language === 'hi' ? 'मुफ़्त' : 'FREE'}</span>
                        </p>
                        <p className="text-xs text-amber-600 mt-0.5">
                          {language === 'hi' 
                            ? `नियमित मूल्य ₹${previewResult.fullCost}। नए उपयोगकर्ताओं के लिए एक बार का मुफ़्त परीक्षण।`
                            : `Regular price ₹${previewResult.fullCost}. One-time free trial for new users.`}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold text-slate-700">{language === 'hi' ? 'इस बिल को बनाएं ' : 'Create this bill for '}<span className="text-xl font-black">₹{previewResult.billCost}</span></p>
                        <p className="text-xs text-slate-500 mt-0.5">{language === 'hi' ? 'आपके क्रेडिट वॉलेट से काटा जाएगा' : 'Deducted from your credit wallet'}</p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-center text-xs text-slate-400">
                {language === 'hi' 
                  ? 'यह एक पूर्वावलोकन है। वास्तविक पीडीएफ बिल बनाने के बाद तैयार किया जाएगा।'
                  : 'This is a preview. The actual PDF will be generated after you create the bill.'}
              </p>
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowPreviewModal(false)}>
                {language === 'hi' ? 'बिल संपादित करें' : 'Edit Bill'}
              </Button>
              <Button
                className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                onClick={() => { setShowPreviewModal(false); (document.querySelector('form') as HTMLFormElement)?.requestSubmit(); }}
              >
                <Save className="h-4 w-4 mr-2" />
                {previewResult.isFirstBill 
                  ? (language === 'hi' ? 'मुफ़्त परीक्षण बिल बनाएं' : 'Create Free Trial Bill') 
                  : (language === 'hi' ? 'बिल बनाएं' : 'Create Bill')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NewBillPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center min-h-64">
        <LoadingSpinner size="lg" text="Loading..." />
      </div>
    }>
      <NewBillPageContent />
    </Suspense>
  );
}
