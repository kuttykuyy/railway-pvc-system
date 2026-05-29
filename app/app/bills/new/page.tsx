
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
  Sparkles,
  ArrowRight
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { STEEL_COMPONENT_OPTIONS } from '@/lib/types';
import { getRailwayZoneOptions, getSteelCityForZone } from '@/lib/zone-steel-city-mapping';
import { ProvisionalDateNotification } from '@/components/ui/provisional-date-notification';
import { BackButton } from '@/components/ui/back-button';
import { BillClassificationEntries } from '@/components/bill-classification-entries';
import { DocumentScanner } from '@/components/document-scanner';
import { InsufficientCreditDialog } from '@/components/ui/insufficient-credit-dialog';
import { BillAmountCalculator } from '@/components/bill-amount-calculator';
import { ContextualHelp } from '@/components/contextual-help';
import { validateDate, validateDateForApi } from '@/lib/date-validation';

interface Contract {
  id: string;
  agreementNo: string;
  contractorName: string;
  workDescription: string;
  workClassification?: string;
  dateOfOpening: string;
  baseMonth: string;
  schedules?: string[];
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
  subClassificationId: string;
  subClassification?: SubClassification;
  amount: number | string | '';  // Allow blank values
  description?: string;
  steelTypes?: string[];  // Array of selected steel types
  scheduleItem?: string;
  itemNumber?: string;
  quantity?: number | string | '';
  agreementRate?: number | string | '';
  itemRows?: ItemRow[];
}


function NewBillPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedContractId = searchParams?.get('contractId');

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [classificationGroups, setClassificationGroups] = useState<ClassificationGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<ClassificationGroup | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const [showProvisionalNotification, setShowProvisionalNotification] = useState(false);
  
  // Ref for error message to enable scroll-to-error
  const errorRef = useRef<HTMLDivElement>(null);
  
  // Date range validation state
  const [availableDateRange, setAvailableDateRange] = useState<{
    minDate: string | null;
    maxDate: string | null;
    availableMonths: string[];
  } | null>(null);
  const [isLoadingDateRange, setIsLoadingDateRange] = useState(true);
  
  // AI Suggestions state
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [suggestionError, setSuggestionError] = useState('');
  
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
    
    // Steel components - only TMT Bars
    steelTmtBarsAmount: '',       // Amount for TMT Bars (85% calculation)
    
    dateOfMeasurement: '',
    workClassification: '', // Will be set to default classification when loaded
    zone: '', // Railway zone (PVC Number will be auto-generated)
    fuelPriceType: 'four_city_avg', // 'four_city_avg' or 'zone_city'
    isFinalPvc: false, // Is this final PVC
    dateOfCompletion: '', // Date of completion (only for final PVC)
  });
  
  // Classification entries state - array of { subClassificationId, amount, description }
  const [classificationEntries, setClassificationEntries] = useState<ClassificationEntry[]>([]);
  
  // Sub-classifications state - array of { code, name, amount }
  const [subClassifications, setSubClassifications] = useState<Array<{ code: string; name: string; amount: string }>>([]);
  
  // Non-schedule items state - array of { description, amount }
  const [nonScheduleItems, setNonScheduleItems] = useState<Array<{ description: string; amount: string }>>([]);
  
  // Accordion state - start with basic info open
  const [openAccordion, setOpenAccordion] = useState<string[]>(['basic']);

  // Insufficient credit dialog state
  const [showInsufficientCredit, setShowInsufficientCredit] = useState(false);
  const [creditInfo, setCreditInfo] = useState({
    currentBalance: 0,
    requiredAmount: 0,
    shortfall: 0
  });

  // PVC Check state
  const [isPvcChecking, setIsPvcChecking] = useState(false);
  const [pvcCheckResult, setPvcCheckResult] = useState<{
    totalPvc: number;
    isPositive: boolean;
    charged: number;
    breakdown: Record<string, number>;
    quarter: string;
    contractAgreementNo: string;
  } | null>(null);
  const [showPvcCheckResult, setShowPvcCheckResult] = useState(false);

  useEffect(() => {
    checkMaintenanceMode();
    fetchContracts();
    fetchClassificationGroups();
    fetchAvailableDateRange();
  }, []);

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
  
  // Set default sub-classification after groups are loaded
  useEffect(() => {
    if (classificationGroups.length > 0 && !formData.workClassification) {
      // Set default sub-classification (first sub of first group)
      const firstGroup = classificationGroups.find(g => g.subClassifications.length > 0);
      if (firstGroup && firstGroup.subClassifications.length > 0) {
        const defaultSub = firstGroup.subClassifications.find(s => s.isDefault) || firstGroup.subClassifications[0];
        setFormData(prev => ({ ...prev, workClassification: defaultSub.id }));
        setSelectedGroup(firstGroup);
      }
    }
  }, [classificationGroups]);

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

  const handleContractChange = async (value: string) => {
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
      // API returns paginated response: { data: [...], pagination: {...} }
      setPreviousBills(result.data || []);
    } catch (error) {
      console.error('Error fetching previous bills:', error);
      setPreviousBills([]);
    } finally {
      setIsLoadingPreviousBills(false);
    }
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
    // Clear suggestions when manually selecting
    setAiSuggestions([]);
  };

  /**
   * Handle data extracted from document scanner.
   * Supports enhanced bill extraction with line items, steel/non-steel separation,
   * and auto-classification entry creation.
   */
  const handleDocumentDataExtracted = (data: any) => {
    const updates: any = {};

    // Map extracted header data to form fields
    if (data.billNo) updates.billNo = data.billNo;
    if (data.dateOfMeasurement) updates.dateOfMeasurement = data.dateOfMeasurement;
    
    // Cement amount: prefer DSR-classified amount over LLM guess
    if (data.dsrCementSummary?.totalAmount) {
      updates.cementAmount = data.dsrCementSummary.totalAmount.toString();
    } else if (data.cementAmount) {
      updates.cementAmount = data.cementAmount.toString();
    }
    
    // Steel amounts: prefer DSR-classified amounts
    if (data.dsrSteelSummary?.tmtBarsAmount) {
      updates.steelTmtBarsAmount = data.dsrSteelSummary.tmtBarsAmount.toString();
    } else if (data.steelSummary?.tmtBarsAmount) {
      updates.steelTmtBarsAmount = data.steelSummary.tmtBarsAmount.toString();
    } else if (data.steelTmtBarsAmount) {
      updates.steelTmtBarsAmount = data.steelTmtBarsAmount.toString();
    }

    // Steel Angle/Channel amount from DSR classification
    if (data.dsrSteelSummary?.angleChannelAmount) {
      updates.steelAngleChannelAmount = data.dsrSteelSummary.angleChannelAmount.toString();
    } else if (data.steelAngleChannelAmount) {
      updates.steelAngleChannelAmount = data.steelAngleChannelAmount.toString();
    }
    
    // Set gross bill amount if available
    if (data.grossBillAmount) {
      updates.grossBillAmount = data.grossBillAmount.toString();
    }

    // Update form data
    setFormData(prev => ({
      ...prev,
      ...updates
    }));

    // Handle non-schedule items
    if (data.nonScheduleItems && Array.isArray(data.nonScheduleItems) && data.nonScheduleItems.length > 0) {
      const formattedItems = data.nonScheduleItems.map((item: any) => ({
        description: item.description || '',
        amount: item.amount ? item.amount.toString() : ''
      }));
      setNonScheduleItems(formattedItems);
    }

    // === Enhanced: Auto-populate classification entries from line items (per-item with qty/rate) ===
    if (data.lineItems && Array.isArray(data.lineItems) && data.lineItems.length > 0) {
      const newEntries: ClassificationEntry[] = [];
      
      // Helper to find matching sub-classification
      const findSubClass = (gccCode: string) => {
        for (const group of classificationGroups) {
          const exactMatch = group.subClassifications.find(s => s.code === gccCode);
          if (exactMatch) return { subClass: exactMatch, group };
          const prefixMatch = group.subClassifications.find(s => 
            s.code.replace(/[A-Z]$/, '') === gccCode.replace(/[A-Z]$/, '') && 
            s.code.slice(-1) === gccCode.slice(-1)
          );
          if (prefixMatch) return { subClass: prefixMatch, group };
        }
        return null;
      };

      for (const item of data.lineItems) {
        if (!item.amount || item.amount <= 0) continue;
        
        const gccCode = item.suggestedGccCode || '';
        const match = gccCode ? findSubClass(gccCode) : null;
        
        // Determine steel types
        const steelTypes: string[] = [];
        if (match?.subClass?.steel && match.subClass.steel > 0 && item.category === 'steel') {
          if (item.steelType === 'TMT Bars') steelTypes.push('TMT Bars');
          else if (item.steelType === 'Structural Steel (Angle/Channel)' || item.steelType === 'Structural Steel' || item.steelType === 'Angles') steelTypes.push('Structural Steel (Angle/Channel)');
          else if (item.steelType === 'Steel Plates' || item.steelType === 'Plates') steelTypes.push('Steel Plates');
          else if (item.steelType === 'Other Steel Sections' || item.steelType === 'Other') steelTypes.push('Other Steel Sections');
          if (steelTypes.length === 0) steelTypes.push('TMT Bars');
        }
        
        newEntries.push({
          subClassificationId: match?.subClass?.id || '',
          subClassification: match?.subClass || undefined,
          amount: Math.round(item.amount * 100) / 100,
          description: item.description || '',
          steelTypes: steelTypes.length > 0 ? steelTypes : undefined,
          itemNumber: item.itemNo || '',
          quantity: item.quantity || '',
          agreementRate: item.rate || '',
          scheduleItem: item.schedule || '',
        });
        
        // Set primary classification from first matched entry
        if (newEntries.length === 1 && match) {
          setSelectedGroup(match.group);
          setFormData(prev => ({
            ...prev,
            workClassification: match.subClass!.id
          }));
        }
      }
      
      if (newEntries.length > 0) {
        setClassificationEntries(newEntries);
        toast.success(`${newEntries.length} item${newEntries.length === 1 ? '' : 's'} extracted with Qty & Rate from bill scan`);
      }
    }
    // Fallback: use suggestedClassifications if no lineItems
    else if (data.suggestedClassifications && Array.isArray(data.suggestedClassifications) && data.suggestedClassifications.length > 0) {
      const newEntries: ClassificationEntry[] = [];
      
      for (const suggestion of data.suggestedClassifications) {
        const gccCode = suggestion.gccCode;
        if (!gccCode || !suggestion.amount) continue;
        
        let matchedSubClass: SubClassification | null = null;
        let matchedGroup: ClassificationGroup | null = null;
        
        for (const group of classificationGroups) {
          const exactMatch = group.subClassifications.find(s => s.code === gccCode);
          if (exactMatch) {
            matchedSubClass = exactMatch;
            matchedGroup = group;
            break;
          }
          const prefixMatch = group.subClassifications.find(s => 
            s.code.replace(/[A-Z]$/, '') === gccCode.replace(/[A-Z]$/, '') && 
            s.code.slice(-1) === gccCode.slice(-1)
          );
          if (prefixMatch) {
            matchedSubClass = prefixMatch;
            matchedGroup = group;
            break;
          }
        }
        
        if (matchedSubClass) {
          newEntries.push({
            subClassificationId: matchedSubClass.id,
            subClassification: matchedSubClass,
            amount: Math.round(suggestion.amount * 100) / 100,
            description: suggestion.description || `${gccCode} - AI classified`,
          });
          
          if (newEntries.length === 1 && matchedGroup) {
            setSelectedGroup(matchedGroup);
            setFormData(prev => ({
              ...prev,
              workClassification: matchedSubClass!.id
            }));
          }
        }
      }
      
      if (newEntries.length > 0) {
        setClassificationEntries(newEntries);
        toast.success(`${newEntries.length} classification ${newEntries.length === 1 ? 'entry' : 'entries'} auto-created from bill scan`);
      }
    }

    toast.success('Document data extracted and applied!');

    // Show DSR classification summary if available
    if (data.dsrCementSummary || data.dsrSteelSummary) {
      const cementAmt = data.dsrCementSummary?.totalAmount || 0;
      const steelAmt = data.dsrSteelSummary?.totalAmount || 0;
      if (cementAmt > 0 || steelAmt > 0) {
        const parts: string[] = [];
        if (cementAmt > 0) parts.push(`Cement: ₹${cementAmt.toLocaleString('en-IN')}`);
        if (steelAmt > 0) parts.push(`Steel: ₹${steelAmt.toLocaleString('en-IN')}`);
        toast.success(`DSR Chapter Classification: ${parts.join(', ')}`, { duration: 6000 });
      }
    }
  };

  const getAISuggestions = async () => {
    if (!selectedContract?.workDescription) {
      toast.error('Please select a contract first');
      return;
    }

    setIsLoadingSuggestions(true);
    setSuggestionError('');
    setAiSuggestions([]);

    try {
      const response = await fetch('/api/ai/suggest-classifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workDescription: selectedContract.workDescription
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get suggestions');
      }

      setAiSuggestions(data.suggestions || []);
      
      if (data.suggestions?.length > 0) {
        toast.success(`Found ${data.suggestions.length} AI suggestions`);
      } else {
        toast('No suggestions found', { icon: 'ℹ️' });
      }
    } catch (error: any) {
      console.error('Error getting AI suggestions:', error);
      setSuggestionError(error.message || 'Failed to get suggestions');
      toast.error('Failed to get AI suggestions');
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const selectAISuggestion = (code: string) => {
    // Find sub-classification by code across all groups
    for (const group of classificationGroups) {
      const subClass = group.subClassifications.find(s => s.code === code);
      if (subClass) {
        setSelectedGroup(group);
        setFormData(prev => ({
          ...prev,
          workClassification: subClass.id
        }));
        toast.success(`Selected: ${code} - ${subClass.name}`);
        setAiSuggestions([]);
        return;
      }
    }
    toast.error(`Classification ${code} not found`);
  };

  const handlePvcCheck = async () => {
    if (!formData.contractId || !formData.dateOfMeasurement || !formData.zone) {
      toast.error('Please fill Contract, Zone and Date of Measurement first');
      return;
    }
    if (classificationEntries.length === 0) {
      toast.error('Please add at least one classification entry');
      return;
    }

    setIsPvcChecking(true);
    setError('');

    try {
      const response = await fetch('/api/bills/pvc-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId: formData.contractId,
          billNo: formData.billNo || undefined,
          zone: formData.zone,
          fuelPriceType: formData.fuelPriceType,
          dateOfMeasurement: formData.dateOfMeasurement,
          cementAmount: formData.cementAmount || 0,
          steelTmtBarsAmount: formData.steelTmtBarsAmount || 0,
          classificationEntries: classificationEntries.map(entry => ({
            subClassificationId: entry.subClassificationId,
            amount: entry.amount === '' ? 0 : typeof entry.amount === 'string' ? parseFloat(entry.amount) || 0 : entry.amount,
            steelTypes: entry.steelTypes || [],
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 402) {
          const requiredMatch = data.error?.match(/Required:\s*₹?([\d,]+\.?\d*)/);
          const availableMatch = data.error?.match(/Available:\s*₹?([\d,]+\.?\d*)/);
          if (requiredMatch && availableMatch) {
            setCreditInfo({
              currentBalance: parseFloat(availableMatch[1].replace(/,/g, '')),
              requiredAmount: parseFloat(requiredMatch[1].replace(/,/g, '')),
              shortfall: parseFloat(requiredMatch[1].replace(/,/g, '')) - parseFloat(availableMatch[1].replace(/,/g, ''))
            });
            setShowInsufficientCredit(true);
            return;
          }
        }
        throw new Error(data.error || 'PVC check failed');
      }

      setPvcCheckResult(data);
      setShowPvcCheckResult(true);
    } catch (err: any) {
      console.error('PVC check error:', err);
      toast.error(err.message || 'PVC check failed');
      setError(err.message || 'PVC check failed');
    } finally {
      setIsPvcChecking(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      // Validate classification entries (if any exist)
      // Allow bills without classification entries
      if (classificationEntries.length > 0) {
        // Validate that all entries have sub-classifications and non-negative amounts
        const hasInvalidEntries = classificationEntries.some(entry => {
          if (!entry.subClassificationId) return true;
          const numAmount = entry.amount === '' || entry.amount === null || entry.amount === undefined 
            ? 0 
            : typeof entry.amount === 'string' 
              ? parseFloat(entry.amount) || 0 
              : entry.amount;
          return numAmount < 0;
        });
        if (hasInvalidEntries) {
          toast.error('All classification entries must have a valid sub-classification and non-negative amount');
          setSaving(false);
          return;
        }
      }

      // Calculate total classification amount, treating blank/undefined/null as 0
      const totalClassificationAmount = classificationEntries.reduce((sum, entry) => {
        const amount = entry.amount === '' || entry.amount === null || entry.amount === undefined 
          ? 0 
          : typeof entry.amount === 'string' 
            ? parseFloat(entry.amount) || 0 
            : entry.amount;
        return sum + amount;
      }, 0);

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
          classificationEntries: classificationEntries.map(entry => ({
            subClassificationId: entry.subClassificationId,
            amount: entry.amount === '' || entry.amount === null || entry.amount === undefined 
              ? 0 
              : typeof entry.amount === 'string' 
                ? parseFloat(entry.amount) || 0 
                : entry.amount,
            description: entry.description || '',
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
          paymentReference: null
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

  const selectedContract = contracts.find(c => c.id === formData.contractId);
  // Find the selected sub-classification across all groups
  const selectedSubClassification = classificationGroups
    .flatMap(g => g.subClassifications)
    .find(s => s.id === formData.workClassification) || null;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <LoadingSpinner size="lg" text="Loading contracts..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <BackButton href="/bills" label="Back to Bills" variant="outline" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <FileText className="h-8 w-8 text-purple-600" />
            Process New Bill
          </h1>
          <p className="text-gray-600 mt-2">
            Add a new running account bill with automatic PVC calculation
          </p>
        </div>
      </div>

      {/* Maintenance Mode Alert */}
      {isMaintenanceMode && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg">
          <div className="flex items-start">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-medium text-yellow-800">
                Single Bill Creation Under Maintenance
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>
                  Single bill creation is currently unavailable due to system maintenance. 
                  Please try again later or contact your administrator for more information.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contextual Help Tips */}
      <ContextualHelp
        tips={[
          { title: 'Contract', content: 'Select the contract this bill belongs to. If you haven\'t added one yet, go to Contracts → New Contract first.' },
          { title: 'Date of Measurement', content: 'Enter the date when the work was measured. The system will automatically pick the correct quarter.' },
          { title: 'Work Classification', content: 'This determines the PVC percentage weights. The AI scanner can auto-detect it from your documents.' },
          { title: 'Amounts', content: 'Enter the gross bill amount. Cement and Steel amounts are optional — only needed if your classification has those components.' },
        ]}
      />

      {/* Progress indicator */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex items-center justify-between text-sm">
          <div className={`flex items-center gap-2 ${formData.contractId && formData.billNo && formData.zone && formData.dateOfMeasurement ? 'text-green-600' : 'text-gray-400'}`}>
            {formData.contractId && formData.billNo && formData.zone && formData.dateOfMeasurement ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <div className="h-5 w-5 rounded-full border-2 border-current flex items-center justify-center text-xs">1</div>
            )}
            <span className="font-medium">Basic Info</span>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-300" />
          <div className={`flex items-center gap-2 ${classificationEntries.length > 0 ? 'text-green-600' : 'text-gray-400'}`}>
            {classificationEntries.length > 0 ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <div className="h-5 w-5 rounded-full border-2 border-current flex items-center justify-center text-xs">2</div>
            )}
            <span className="font-medium">Classifications</span>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-300" />
          <div className="flex items-center gap-2 text-gray-400">
            <div className="h-5 w-5 rounded-full border-2 border-current flex items-center justify-center text-xs">3</div>
            <span className="font-medium">Optional Details</span>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-300" />
          <div className="flex items-center gap-2 text-gray-400">
            <div className="h-5 w-5 rounded-full border-2 border-current flex items-center justify-center text-xs">4</div>
            <span className="font-medium">Review & Submit</span>
          </div>
        </div>
      </div>

      {/* AI Document Scanner - Collapsible */}
      <Accordion type="multiple" className="mb-6">
        <AccordionItem value="scanner" className="border rounded-lg px-4 bg-gradient-to-r from-amber-50 to-orange-50">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-600 rounded-lg">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-gray-900">AI Document Scanner</h3>
                <p className="text-sm text-gray-600">Auto-fill bill details by scanning documents</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <DocumentScanner
              documentType="bill"
              onDataExtracted={handleDocumentDataExtracted}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Contract and Quarter Info Cards - Displayed at top when selected */}
      {(selectedContract || formData.dateOfMeasurement) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Contract Info */}
          {selectedContract && (
            <Card className="border-0 shadow-md bg-gradient-to-r from-purple-50 to-white">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-purple-600" />
                  Selected Contract
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Agreement No:</span>
                  <span className="font-semibold text-gray-900">{selectedContract.agreementNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Contractor:</span>
                  <span className="font-semibold text-gray-900">{selectedContract.contractorName}</span>
                </div>
                <div>
                  <span className="text-gray-600">Work Description:</span>
                  <p className="text-gray-900 font-medium mt-1">{selectedContract.workDescription}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quarter Info */}
          {formData.dateOfMeasurement && (
            <Card className="border-0 shadow-md bg-gradient-to-r from-green-50 to-blue-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-green-600" />
                  Quarter Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <p className="text-sm text-gray-600">Measurement Date</p>
                  <p className="font-bold text-green-600 text-lg">
                    {new Date(formData.dateOfMeasurement).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                  <p className="text-sm text-gray-600 mt-2">
                    Quarter: <span className="font-medium text-base">
                      Q{Math.floor((new Date(formData.dateOfMeasurement).getMonth()) / 3) + 1}-{new Date(formData.dateOfMeasurement).getFullYear()}
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Bill Form - Full Width */}
      <div className="grid grid-cols-1 gap-6">
        <div className="w-full">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-6 w-6 text-purple-600" />
                Bill Details
              </CardTitle>
              <CardDescription>
                Enter the bill information. PVC will be calculated automatically based on the quarter.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                {error && (
                  <div ref={errorRef}>
                    <StatusMessage type="error" title="Error" message={error} />
                  </div>
                )}

                {/* Accordion for organized sections */}
                <Accordion type="multiple" value={openAccordion} onValueChange={setOpenAccordion} className="space-y-4">
                  
                  {/* SECTION 1: Basic Information */}
                  <AccordionItem value="basic" className="border rounded-lg bg-gradient-to-r from-purple-50 to-blue-50">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <div className="flex items-center gap-3">
                        <Building2 className="h-5 w-5 text-purple-600" />
                        <div className="text-left">
                          <div className="font-semibold">Basic Information</div>
                          <div className="text-xs text-gray-600">Contract, Bill Number, and Zone</div>
                        </div>
                        {formData.contractId && formData.billNo && formData.zone && (
                          <CheckCircle2 className="h-5 w-5 text-green-600 ml-auto" />
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="contractId" className="flex items-center gap-2">
                          Contract <span className="text-red-500">*</span>
                        </Label>
                        <Select value={formData.contractId} onValueChange={handleContractChange}>
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Select a contract" />
                          </SelectTrigger>
                          <SelectContent>
                            {contracts.map((contract) => (
                              <SelectItem key={contract.id} value={contract.id}>
                                {contract.agreementNo} - {contract.contractorName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="billNo">
                          Bill Number <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="billNo"
                          name="billNo"
                          value={formData.billNo}
                          onChange={handleInputChange}
                          placeholder="e.g., RA/001/2023"
                          required
                          className="bg-white"
                        />
                        
                        {/* Previous Bills Display */}
                        {formData.contractId && (
                          <div className="mt-3">
                            {isLoadingPreviousBills ? (
                              <div className="text-xs text-gray-600 italic">
                                Loading previous bills...
                              </div>
                            ) : previousBills.length > 0 ? (
                              <Accordion type="single" collapsible className="border rounded-lg">
                                <AccordionItem value="previous-bills" className="border-0">
                                  <AccordionTrigger className="px-3 py-2 hover:no-underline text-xs">
                                    <div className="flex items-center gap-2">
                                      <FileText className="h-3 w-3 text-blue-600" />
                                      <span className="font-medium">Previous Bills ({previousBills.length})</span>
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
                                            <span className="font-medium text-gray-900">{bill.billNo || `Bill ${index + 1}`}</span>
                                            <span className="text-gray-500 ml-2">
                                              ({new Date(bill.dateOfMeasurement).toLocaleDateString('en-IN', { 
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
                                No previous bills found for this contract
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="zone">
                          Railway Zone <span className="text-red-500">*</span>
                        </Label>
                        <Select value={formData.zone} onValueChange={(value) => setFormData(prev => ({ ...prev, zone: value }))}>
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Select railway zone" />
                          </SelectTrigger>
                          <SelectContent>
                            {getRailwayZoneOptions().map(zone => (
                              <SelectItem key={zone.value} value={zone.value}>
                                {zone.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-600 flex items-center gap-1">
                          <Info className="h-3 w-3" />
                          Steel prices for PVC will be based on the zone&apos;s nearest city ({formData.zone ? getSteelCityForZone(formData.zone) : '...'})
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="fuelPriceType">
                          Fuel (Diesel) Price Basis
                        </Label>
                        <Select value={formData.fuelPriceType} onValueChange={(value) => setFormData(prev => ({ ...prev, fuelPriceType: value }))}>
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Select fuel price basis" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="four_city_avg">Average of 4 Cities (Delhi, Mumbai, Chennai, Kolkata)</SelectItem>
                            <SelectItem value="zone_city">Zone City ({formData.zone ? getSteelCityForZone(formData.zone) : '...'})</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-600 flex items-center gap-1">
                          <Info className="h-3 w-3" />
                          {formData.fuelPriceType === 'zone_city' && formData.zone
                            ? `Diesel prices from ${getSteelCityForZone(formData.zone)} will be used for MPNG Fuel index`
                            : 'Average diesel prices of Delhi, Mumbai, Chennai & Kolkata will be used'}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="dateOfMeasurement" className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Date of Measurement <span className="text-red-500">*</span>
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
                        {availableDateRange && availableDateRange.minDate && availableDateRange.maxDate ? (
                          <p className="text-xs text-gray-600 flex items-center gap-1">
                            <Info className="h-3 w-3" />
                            Indices available from {new Date(availableDateRange.minDate).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' })} to {new Date(availableDateRange.maxDate).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' })}
                          </p>
                        ) : isLoadingDateRange ? (
                          <p className="text-xs text-gray-500 flex items-center gap-1">
                            <LoadingSpinner className="h-3 w-3" />
                            Loading available dates...
                          </p>
                        ) : (
                          <p className="text-xs text-amber-600 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            No indices available. Please upload indices first.
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
                            className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                          />
                          <Label htmlFor="isFinalPvc" className="cursor-pointer font-medium">
                            Mark as Final PVC
                          </Label>
                        </div>
                        
                        {/* Conditional Date of Completion field */}
                        {formData.isFinalPvc && (
                          <div className="space-y-2 p-3 border border-green-200 rounded-lg bg-green-50 ml-6">
                            <Label htmlFor="dateOfCompletion" className="flex items-center gap-2 text-green-900 font-medium">
                              <Calendar className="h-4 w-4" />
                              Date of Completion <span className="text-red-500">*</span>
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
                              Required for final PVC claims
                            </p>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* SECTION 2: Work Classifications */}
                  <AccordionItem value="classification" className="border rounded-lg bg-gradient-to-r from-green-50 to-teal-50">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <div className="flex items-center gap-3">
                        <ClipboardList className="h-5 w-5 text-green-600" />
                        <div className="text-left">
                          <div className="font-semibold">Work Classifications</div>
                          <div className="text-xs text-gray-600">Add multiple classifications with amounts</div>
                        </div>
                        {classificationEntries.length > 0 && (
                          <CheckCircle2 className="h-5 w-5 text-green-600 ml-auto" />
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 space-y-4">
                      {/* Fetch Previous Classification Button */}
                      {formData.contractId && previousBills.length > 0 && (
                        <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200 mb-4">
                          <div className="flex items-center gap-2">
                            <Info className="h-4 w-4 text-blue-600" />
                            <span className="text-sm text-blue-900">
                              Load classification from previous bill?
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={fetchPreviousBillClassification}
                            disabled={isFetchingClassification}
                            className="bg-white hover:bg-blue-100"
                          >
                            {isFetchingClassification ? (
                              <LoadingSpinner size="sm" text="Loading..." />
                            ) : (
                              <>
                                <ArrowRight className="h-4 w-4 mr-1" />
                                Fetch Classification
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                      
                      {/* Multi-Classification Entries Component */}
                      <BillClassificationEntries
                        value={classificationEntries}
                        onChange={setClassificationEntries}
                        classificationGroups={classificationGroups}
                        workDescription={selectedContract?.workDescription}
                        contractSchedules={selectedContract?.schedules || []}
                        contractId={formData.contractId || undefined}
                        measurementDate={formData.dateOfMeasurement || undefined}
                      />
                    </AccordionContent>
                  </AccordionItem>

                  {/* SECTION 3: Dedicated Components (Optional) */}
                  <AccordionItem value="amounts" className="border rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <div className="flex items-center gap-3">
                        <TrendingUp className="h-5 w-5 text-blue-600" />
                        <div className="text-left">
                          <div className="font-semibold">Dedicated Component Allocations (Optional)</div>
                          <div className="text-xs text-gray-600">Special components calculated separately at 85%</div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 space-y-4">
                      {/* Bill Amount Summary from Classification Entries */}
                      {classificationEntries.length > 0 && (() => {
                        const totalClassificationAmount = classificationEntries.reduce((sum, entry) => {
                          const amount = entry.amount === '' || entry.amount === null || entry.amount === undefined 
                            ? 0 
                            : typeof entry.amount === 'string' 
                              ? parseFloat(entry.amount) || 0 
                              : entry.amount;
                          return sum + amount;
                        }, 0);
                        const totalNonScheduleItems = nonScheduleItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
                        
                        // Calculate total dedicated component allocations
                        const totalDedicatedComponents = 
                          (parseFloat(formData.cementAmount) || 0) +
                          (parseFloat(formData.steelTmtBarsAmount) || 0);
                        
                        // Calculate net bill amount
                        const netBillAmount = totalClassificationAmount + totalDedicatedComponents - totalNonScheduleItems;
                        
                        return (
                          <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200 mb-4">
                            <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-gray-700">Total Classification Amount:</span>
                                <span className="text-base font-semibold text-gray-900">
                                  ₹{totalClassificationAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                </span>
                              </div>
                              
                              {totalDedicatedComponents > 0 && (
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-medium text-gray-700">Add: Dedicated Components:</span>
                                  <span className="text-base font-semibold text-green-700">
                                    +₹{totalDedicatedComponents.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                              )}
                              
                              {nonScheduleItems.length > 0 && nonScheduleItems.some(item => parseFloat(item.amount) > 0) && (
                                <div className="flex justify-between items-center text-red-600">
                                  <span className="text-sm font-medium">Less: Non-Schedule Items:</span>
                                  <span className="text-base font-semibold">
                                    -₹{totalNonScheduleItems.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                              )}
                              
                              <div className="pt-2 border-t border-blue-300">
                                <div className="flex justify-between items-center">
                                  <span className="text-base font-bold text-blue-900">Total Bill Amount:</span>
                                  <span className="text-xl font-bold text-blue-700">
                                    ₹{netBillAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-600 mt-1">
                                  This is the total amount including all classifications and dedicated components
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="border-t pt-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Package className="h-4 w-4 text-blue-600" />
                          <Label className="text-base font-semibold text-blue-900">
                            Dedicated Component Allocations
                          </Label>
                          <Badge variant="outline" className="ml-auto">85% PVC</Badge>
                        </div>
                        <p className="text-xs text-gray-600 mb-4">
                          Allocate amounts for specific components (optional, calculated at 85%)
                        </p>

                        {/* Cement Amount */}
                        <div className="space-y-2 mb-4">
                          <Label htmlFor="cementAmount" className="text-sm">
                            Cement Work Amount (₹)
                          </Label>
                          <div className="flex gap-2 items-center">
                            <Input
                              id="cementAmount"
                              name="cementAmount"
                              type="number"
                              step="0.01"
                              value={formData.cementAmount}
                              onChange={handleInputChange}
                              placeholder="0.00"
                              className="bg-white"
                            />
                            <BillAmountCalculator
                              onInsertTotal={(total) => {
                                setFormData(prev => ({ ...prev, cementAmount: total.toString() }));
                              }}
                            />
                          </div>
                        </div>

                        {/* Steel Components Section */}
                        <div className="space-y-3 p-3 border border-gray-200 rounded-lg bg-white">
                          <Label className="text-sm font-semibold text-gray-900">
                            Steel Work Amounts
                          </Label>
                          <div className="grid grid-cols-1 gap-3">
                            {/* TMT Bars */}
                            <div className="space-y-1.5">
                              <Label htmlFor="steelTmtBarsAmount" className="text-xs font-medium">
                                TMT Bars (₹)
                              </Label>
                              <div className="flex gap-2 items-center">
                                <Input
                                  id="steelTmtBarsAmount"
                                  name="steelTmtBarsAmount"
                                  type="number"
                                  step="0.01"
                                  value={formData.steelTmtBarsAmount}
                                  onChange={handleInputChange}
                                  placeholder="0.00"
                                  className="h-9"
                                />
                                <BillAmountCalculator
                                  onInsertTotal={(total) => {
                                    setFormData(prev => ({ ...prev, steelTmtBarsAmount: total.toString() }));
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                          <p className="text-xs text-gray-600 mt-2">
                            Joint Plant Committee rates will be used for calculation
                          </p>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* SECTION 4: Non-Schedule Items */}
                  <AccordionItem value="optional" className="border rounded-lg bg-gradient-to-r from-orange-50 to-yellow-50">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <div className="flex items-center gap-3">
                        <Layers className="h-5 w-5 text-orange-600" />
                        <div className="text-left">
                          <div className="font-semibold">Non-Schedule Items (Optional)</div>
                          <div className="text-xs text-gray-600">Items not covered under standard schedule</div>
                        </div>
                        {nonScheduleItems.length > 0 && (
                          <Badge variant="secondary" className="ml-auto">
                            {nonScheduleItems.length} items
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 space-y-4">
                      {/* Non-Schedule Items Section */}
                      <div className="space-y-3 p-3 border border-orange-200 rounded-lg bg-orange-50 mt-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-sm font-semibold text-orange-900">
                              Non-Schedule Items
                            </Label>
                            <p className="text-xs text-orange-700 mt-0.5">
                              Items not covered under standard schedule (will be deducted)
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setNonScheduleItems([...nonScheduleItems, { description: '', amount: '' }])}
                            className="bg-white hover:bg-orange-100 h-8 text-xs"
                          >
                            + Add
                          </Button>
                        </div>
                        
                        {nonScheduleItems.map((item, index) => (
                          <div key={index} className="grid grid-cols-12 gap-2 items-start p-2 bg-white rounded border border-gray-200">
                            <div className="col-span-7">
                              <Label className="text-xs text-gray-600 mb-1">Description</Label>
                              <Input
                                value={item.description}
                                onChange={(e) => {
                                  const newItems = [...nonScheduleItems];
                                  newItems[index].description = e.target.value;
                                  setNonScheduleItems(newItems);
                                }}
                                placeholder="e.g., Special materials..."
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="col-span-4">
                              <Label className="text-xs text-gray-600 mb-1">Amount (₹)</Label>
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
                            No non-schedule items added yet
                          </p>
                        )}
                        
                        {nonScheduleItems.length > 0 && (
                          <div className="flex justify-end pt-2 border-t border-orange-200">
                            <div className="text-right">
                              <span className="text-xs font-medium text-orange-900">Total Deduction: </span>
                              <span className="text-sm font-bold text-orange-700">
                                -₹{nonScheduleItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>



                {/* Submit Section */}
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 mt-6 border-t border-gray-200">
                  <div className="text-sm text-gray-600">
                    <p className="flex items-center gap-1">
                      <Info className="h-4 w-4" />
                      All fields marked with <span className="text-red-500 font-medium">*</span> are required
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => router.back()}
                      disabled={isSaving}
                      className="min-w-[100px]"
                    >
                      Cancel
                    </Button>
                    <div className="flex flex-col items-center gap-1">
                      <Button
                        type="button"
                        onClick={handlePvcCheck}
                        disabled={isPvcChecking || isSaving || !formData.contractId || !formData.zone || !formData.dateOfMeasurement || classificationEntries.length === 0}
                        className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 min-w-[160px] text-white"
                      >
                        {isPvcChecking ? (
                          <LoadingSpinner size="sm" text="Checking..." />
                        ) : (
                          <>
                            <TrendingUp className="h-4 w-4 mr-2" />
                            PVC Check (₹500)
                          </>
                        )}
                      </Button>
                      <p className="text-xs text-gray-500 text-center max-w-[200px]">
                        Quick check if PVC is positive or negative — without creating a bill
                      </p>
                    </div>
                    <Button
                      type="submit"
                      disabled={isSaving || !formData.contractId || !formData.billNo || !formData.zone || !formData.dateOfMeasurement}
                      className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 min-w-[160px]"
                    >
                      {isSaving ? (
                        <LoadingSpinner size="sm" text="Processing..." />
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          Process Bill
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

      {/* PVC Check Result Dialog */}
      {showPvcCheckResult && pvcCheckResult && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            {/* Header */}
            <div className={`p-6 text-center ${pvcCheckResult.isPositive ? 'bg-gradient-to-r from-green-500 to-emerald-600' : 'bg-gradient-to-r from-red-500 to-rose-600'}`}>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/20 mb-3">
                {pvcCheckResult.isPositive ? (
                  <TrendingUp className="h-8 w-8 text-white" />
                ) : (
                  <AlertTriangle className="h-8 w-8 text-white" />
                )}
              </div>
              <h3 className="text-xl font-bold text-white">
                PVC is {pvcCheckResult.isPositive ? 'POSITIVE' : 'NEGATIVE'}
              </h3>
              <p className="text-3xl font-bold text-white mt-2">
                ₹{Math.abs(pvcCheckResult.totalPvc).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </p>
              <p className="text-white/80 text-sm mt-1">
                Quarter: {pvcCheckResult.quarter} · {pvcCheckResult.contractAgreementNo}
              </p>
            </div>

            <div className="p-6 space-y-3">
              {pvcCheckResult.charged > 0 && (
                <p className="text-xs text-gray-500 text-center">
                  ₹{pvcCheckResult.charged} has been deducted from your credit balance for this check
                </p>
              )}

              <Button
                onClick={() => setShowPvcCheckResult(false)}
                className="w-full bg-gray-900 hover:bg-gray-800"
              >
                Close
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
