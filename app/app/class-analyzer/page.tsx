
"use client";

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Calculator, AlertCircle, ChevronDown, ChevronUp, RefreshCcw, Image as ImageIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getClientRoleInfo } from '@/lib/role-auth-client';
import html2canvas from 'html2canvas';

interface MainClassification {
  id: string;
  code: string;
  name: string;
  subClassifications: SubClassification[];
}

interface SubClassification {
  id: string;
  code: string;
  name: string;
  description: string;
  components: {
    fixed: number;
    labour: number;
    steel: number;
    cement: number;
    plantMachinery: number;
    fuel: number;
    otherMaterials: number;
    explosives: number;
  };
}

interface ClassificationSelection {
  id: string;
  steelTypes?: string[];
}

interface Classification {
  id: string;
  code: string;
  mainClassification: string;
  subClassification: string;
  description: string;
  componentPercentages: {
    fixed: number;
    labour: number;
    steel: number;
    cement: number;
    plantMachinery: number;
    fuel: number;
    otherMaterials: number;
    explosives: number;
  };
}

interface IndexData {
  componentName: string;
  baseIndex: number;
  averageIndex: number;
  quarterMonths: { month: string; value: number }[];
  monthsUsed?: number; // Number of months used in quarter average (1-3)
}

interface CalculationSteps {
  baseIndex: number;
  averageIndex: number;
  indexDiff: number;
  variationRatio: number;
  componentAmount: number;
  percentage: number;
  pvc: number;
}

interface ComparisonResult {
  classification: Classification;
  totalPvc: number;
  componentPvcs: {
    labour: number;
    steel: number;
    cement: number;
    plantMachinery: number;
    fuel: number;
    otherMaterials: number;
    explosives: number;
  };
  componentCalculations: {
    labour: CalculationSteps | null;
    steel: CalculationSteps | null;
    cement: CalculationSteps | null;
    plantMachinery: CalculationSteps | null;
    fuel: CalculationSteps | null;
    otherMaterials: CalculationSteps | null;
    explosives: CalculationSteps | null;
  };
  steelTypes?: string[]; // Selected steel types
}

interface BillEntry {
  id: string;
  billNumber: string;
  amount: string;
  measurementDate: string;
  dedicatedTmt: string;
  dedicatedCement: string;
}

interface DedicatedComponentResult {
  component: 'tmt' | 'cement';
  amount: number;
  baseIndex: number;
  averageIndex: number;
  pvc: number;
  calculationSteps: CalculationSteps;
}

interface MultiBillComparisonResult {
  billId: string;
  billNumber?: string;
  amount: number;
  measurementDate: string;
  results: ComparisonResult[];
  dedicatedComponents?: DedicatedComponentResult[];
  indicesData: IndexData[];
  baseMonth: string;
  measurementMonth: string;
}

export default function ClassAnalyzerPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [baseMonth, setBaseMonth] = useState<string>('');
  const [billEntries, setBillEntries] = useState<BillEntry[]>([
    { id: '1', billNumber: '', amount: '', measurementDate: '', dedicatedTmt: '', dedicatedCement: '' }
  ]);
  const [mainClassifications, setMainClassifications] = useState<MainClassification[]>([]);
  const [selectedSubClassifications, setSelectedSubClassifications] = useState<ClassificationSelection[]>([]);
  
  // Date range restrictions
  const [availableDateRange, setAvailableDateRange] = useState<{
    minDate: string | null;
    maxDate: string | null;
    availableMonths: string[];
  }>({
    minDate: null,
    maxDate: null,
    availableMonths: []
  });
  const [isLoadingDateRange, setIsLoadingDateRange] = useState(false);
  const [multiBillResults, setMultiBillResults] = useState<MultiBillComparisonResult[]>([]);
  const [indicesData, setIndicesData] = useState<IndexData[]>([]);
  const [baseMonthDisplay, setBaseMonthDisplay] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [exportingImage, setExportingImage] = useState(false);
  const [expandedFormulas, setExpandedFormulas] = useState<Record<string, boolean>>({});
  const [expandedMainClasses, setExpandedMainClasses] = useState<Record<string, boolean>>({});
  const [expandedSteelTypeSelections, setExpandedSteelTypeSelections] = useState<Record<string, boolean>>({});
  const [expandedBills, setExpandedBills] = useState<Record<string, boolean>>({});
  
  // Error state and ref for auto-scroll
  const [validationError, setValidationError] = useState<string>('');
  const errorRef = useRef<HTMLDivElement>(null);
  
  // Subscription status states
  const [subscriptionActive, setSubscriptionActive] = useState<boolean>(true);
  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [subscribing, setSubscribing] = useState<boolean>(false);

  // Available steel types
  const steelTypes = [
    { value: 'TMT', label: 'TMT Bars' },
    { value: 'ANGLE_CHANNEL', label: 'Angle/Channel' },
    { value: 'PLATES', label: 'Plates' },
    { value: 'OTHER_SECTIONS', label: 'Other Sections' }
  ];

  const { isAdmin } = getClientRoleInfo(session);

  // Auto-scroll to error when it appears
  useEffect(() => {
    console.log('[Class Analyzer] Validation error changed:', validationError);
    if (validationError) {
      // Use setTimeout to ensure the error div is rendered before scrolling
      setTimeout(() => {
        console.log('[Class Analyzer] Error ref current:', errorRef.current);
        if (errorRef.current) {
          console.log('[Class Analyzer] Scrolling to error message');
          errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [validationError]);

  // Check subscription status
  useEffect(() => {
    if (status === 'loading') return;
    
    if (!session) {
      router.push('/auth/signin');
      return;
    }
    
    checkSubscriptionStatus();
  }, [status, session, router]);

  const checkSubscriptionStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/credits/balance');
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
    } finally {
      setLoading(false);
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
        toast.success(data.message || 'Subscription activated successfully!');
        setSubscriptionActive(true);
        // Refresh classifications and indices
        fetchClassifications();
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

  useEffect(() => {
    fetchClassifications();
    fetchAvailableDateRange();
  }, []);

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
      
      console.log('[Class Analyzer] Available date range:', {
        minDate: data.minDate,
        maxDate: data.maxDate,
        monthsCount: data.availableMonths?.length || 0
      });
    } catch (error) {
      console.error('Error fetching available date range:', error);
    } finally {
      setIsLoadingDateRange(false);
    }
  };

  const fetchClassifications = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/classifications-new');
      if (response.ok) {
        const data = await response.json();
        
        console.log('[Class Analyzer] Fetched classifications data:', data);
        
        if (data && Array.isArray(data.mainClassifications)) {
          // Filter main classifications that have sub-classifications with components
          const filteredMainClassifications = data.mainClassifications
            .map((main: any) => {
              // Filter sub-classifications that have component definitions
              const filteredSubs = (main.subClassifications || []).filter((sub: any) => {
                const hasComponents = 
                  (sub.components?.labour || 0) > 0 ||
                  (sub.components?.steel || 0) > 0 ||
                  (sub.components?.cement || 0) > 0 ||
                  (sub.components?.plantMachinery || 0) > 0 ||
                  (sub.components?.fuel || 0) > 0 ||
                  (sub.components?.otherMaterials || 0) > 0 ||
                  (sub.components?.explosives || 0) > 0;
                return hasComponents;
              });

              return {
                ...main,
                subClassifications: filteredSubs
              };
            })
            .filter((main: any) => main.subClassifications.length > 0);
          
          console.log('[Class Analyzer] Processed main classifications:', filteredMainClassifications.length);
          
          if (filteredMainClassifications.length === 0) {
            toast.error('No work classifications with components found. Please add work classifications first.');
          }
          
          setMainClassifications(filteredMainClassifications);
        } else {
          console.error('Invalid data format received:', data);
          toast.error('Invalid data format received');
          setMainClassifications([]);
        }
      } else {
        const errorText = await response.text();
        console.error('Failed to load work classifications:', response.status, errorText);
        toast.error('Failed to load work classifications');
        setMainClassifications([]);
      }
    } catch (error) {
      console.error('Error fetching work classifications:', error);
      toast.error('Error loading work classifications');
      setMainClassifications([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleMainClassification = (mainClassId: string) => {
    setExpandedMainClasses(prev => ({
      ...prev,
      [mainClassId]: !prev[mainClassId]
    }));
  };

  const isSubClassificationSelected = (subClassId: string): boolean => {
    return selectedSubClassifications.some(s => s.id === subClassId);
  };

  const getSubClassificationSteelTypes = (subClassId: string): string[] => {
    const selection = selectedSubClassifications.find(s => s.id === subClassId);
    return selection?.steelTypes || [];
  };

  const toggleSubClassification = (subClassId: string) => {
    setSelectedSubClassifications(prev => {
      const isSelected = prev.some(s => s.id === subClassId);
      if (isSelected) {
        // Remove this selection (allow selecting the same class multiple times)
        // Only remove the first occurrence
        const index = prev.findIndex(s => s.id === subClassId);
        return [...prev.slice(0, index), ...prev.slice(index + 1)];
      } else {
        // Add new selection
        return [...prev, { id: subClassId, steelTypes: [] }];
      }
    });
  };

  const addSubClassification = (subClassId: string) => {
    // Always add a new selection entry (allow multiple selections of same class)
    setSelectedSubClassifications(prev => [...prev, { id: subClassId, steelTypes: [] }]);
  };

  const removeSubClassificationAtIndex = (index: number) => {
    setSelectedSubClassifications(prev => prev.filter((_, i) => i !== index));
  };

  const updateSteelTypesForSelection = (index: number, steelTypes: string[]) => {
    setSelectedSubClassifications(prev => 
      prev.map((sel, i) => i === index ? { ...sel, steelTypes } : sel)
    );
  };

  const toggleSteelTypeForSelection = (index: number, steelType: string) => {
    setSelectedSubClassifications(prev => {
      const selection = prev[index];
      const currentTypes = selection.steelTypes || [];
      const newTypes = currentTypes.includes(steelType)
        ? currentTypes.filter(t => t !== steelType)
        : [...currentTypes, steelType];
      return prev.map((sel, i) => i === index ? { ...sel, steelTypes: newTypes } : sel);
    });
  };

  const selectAllSubClassifications = (mainClassId: string) => {
    const mainClass = mainClassifications.find(m => m.id === mainClassId);
    if (mainClass) {
      const allSubIds = mainClass.subClassifications.map(s => s.id);
      setSelectedSubClassifications(prev => {
        const hasAnySelected = allSubIds.some(id => prev.some(s => s.id === id));
        if (hasAnySelected) {
          // Deselect all from this main class
          return prev.filter(s => !allSubIds.includes(s.id));
        } else {
          // Select all
          const newSelections = allSubIds.map(id => ({ id, steelTypes: [] as string[] }));
          return [...prev, ...newSelections];
        }
      });
    }
  };

  // Validate date formats
  const validateDateFormat = (dateStr: string, format: 'mm-yyyy' | 'dd-mm-yyyy'): boolean => {
    if (format === 'mm-yyyy') {
      const regex = /^(0[1-9]|1[0-2])-\d{4}$/;
      return regex.test(dateStr);
    } else {
      const regex = /^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[0-2])-\d{4}$/;
      return regex.test(dateStr);
    }
  };

  // Convert dd-mm-yyyy to YYYY-MM-DD for comparison
  const convertToISODate = (dateStr: string): string => {
    const [day, month, year] = dateStr.split('-');
    return `${year}-${month}-${day}`;
  };

  // Convert mm-yyyy to YYYY-MM-DD (first day of month) for comparison
  const convertMonthToISODate = (monthStr: string): string => {
    const [month, year] = monthStr.split('-');
    return `${year}-${month}-01`;
  };

  // Validate date is within available range
  const validateDateInRange = (dateStr: string, format: 'mm-yyyy' | 'dd-mm-yyyy'): { isValid: boolean; error?: string } => {
    if (!availableDateRange.minDate || !availableDateRange.maxDate) {
      return { isValid: true }; // If range not loaded yet, allow it
    }

    const isoDate = format === 'mm-yyyy' ? convertMonthToISODate(dateStr) : convertToISODate(dateStr);
    const selectedDate = new Date(isoDate);
    const minDate = new Date(availableDateRange.minDate);
    const maxDate = new Date(availableDateRange.maxDate);

    if (selectedDate < minDate) {
      const formattedMinDate = availableDateRange.minDate.split('-').reverse().join('-');
      return {
        isValid: false,
        error: `Indices are not available before ${formattedMinDate}. Please select a later date.`
      };
    }

    if (selectedDate > maxDate) {
      const formattedMaxDate = availableDateRange.maxDate.split('-').reverse().join('-');
      return {
        isValid: false,
        error: `Indices are not available after ${formattedMaxDate}. Please select an earlier date.`
      };
    }

    // For full dates, also check if the specific month has indices
    if (format === 'dd-mm-yyyy') {
      const yearMonth = isoDate.substring(0, 7); // Extract YYYY-MM
      if (!availableDateRange.availableMonths.includes(yearMonth)) {
        const [year, month] = yearMonth.split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthName = monthNames[parseInt(month) - 1];
        return {
          isValid: false,
          error: `Indices are not available for ${monthName} ${year}. Please select a date in an available month.`
        };
      }
    }

    return { isValid: true };
  };

  // Bill entry management functions
  const addBillEntry = () => {
    const newId = (Math.max(...billEntries.map(b => parseInt(b.id)), 0) + 1).toString();
    setBillEntries([...billEntries, { id: newId, billNumber: '', amount: '', measurementDate: '', dedicatedTmt: '', dedicatedCement: '' }]);
  };

  const removeBillEntry = (id: string) => {
    if (billEntries.length === 1) {
      toast.error('At least one bill entry is required');
      return;
    }
    setBillEntries(billEntries.filter(b => b.id !== id));
  };

  const updateBillEntry = (id: string, field: 'billNumber' | 'amount' | 'measurementDate' | 'dedicatedTmt' | 'dedicatedCement', value: string) => {
    setBillEntries(billEntries.map(b => 
      b.id === id ? { ...b, [field]: value } : b
    ));
  };

  const toggleBillExpanded = (billId: string) => {
    setExpandedBills(prev => ({
      ...prev,
      [billId]: !prev[billId]
    }));
  };

  const handleCompare = async () => {
    // Clear any previous validation errors
    setValidationError('');
    
    if (!subscriptionActive) {
      toast.error('Advanced Tools Subscription required (₹99/month)');
      return;
    }
    
    // Validate base month
    if (!baseMonth) {
      toast.error('Please enter base month (mm-yyyy format)');
      return;
    }
    
    if (!validateDateFormat(baseMonth, 'mm-yyyy')) {
      toast.error('Invalid base month format. Please use mm-yyyy format (e.g., 01-2024)');
      return;
    }
    
    // Validate base month is within available range
    const baseMonthValidation = validateDateInRange(baseMonth, 'mm-yyyy');
    if (!baseMonthValidation.isValid) {
      toast.error(baseMonthValidation.error || 'Invalid base month');
      return;
    }
    
    // Validate bill entries
    const validBills = billEntries.filter(bill => 
      bill.amount && parseFloat(bill.amount) > 0 && bill.measurementDate
    );
    
    if (validBills.length === 0) {
      toast.error('Please enter at least one valid bill (amount and measurement date)');
      return;
    }
    
    // Validate date formats and ranges
    for (const bill of validBills) {
      if (!validateDateFormat(bill.measurementDate, 'dd-mm-yyyy')) {
        toast.error(`Invalid measurement date format for Bill ${bill.id}. Please use dd-mm-yyyy format`);
        return;
      }
      
      // Validate measurement date is within available range
      const measurementDateValidation = validateDateInRange(bill.measurementDate, 'dd-mm-yyyy');
      if (!measurementDateValidation.isValid) {
        const billLabel = bill.billNumber || `Bill ${bill.id}`;
        toast.error(`${billLabel}: ${measurementDateValidation.error}`);
        return;
      }
    }
    
    if (selectedSubClassifications.length < 2) {
      toast.error('Please select at least 2 sub-classifications to compare');
      return;
    }

    setCalculating(true);
    try {
      const response = await fetch('/api/indices/compare-classifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseMonth,
          bills: validBills.map(bill => ({
            id: bill.id,
            billNumber: bill.billNumber || '',
            amount: parseFloat(bill.amount),
            measurementDate: bill.measurementDate,
            dedicatedTmt: bill.dedicatedTmt ? parseFloat(bill.dedicatedTmt) : 0,
            dedicatedCement: bill.dedicatedCement ? parseFloat(bill.dedicatedCement) : 0
          })),
          classificationSelections: selectedSubClassifications
        })
      });

      if (response.ok) {
        const data = await response.json();
        setMultiBillResults(data.billResults || []);
        
        // Collect all unique indices from all bills
        const allIndices = new Map<string, IndexData>();
        (data.billResults || []).forEach((billResult: MultiBillComparisonResult) => {
          (billResult.indicesData || []).forEach((indexData: IndexData) => {
            if (!allIndices.has(indexData.componentName)) {
              allIndices.set(indexData.componentName, indexData);
            }
          });
        });
        setIndicesData(Array.from(allIndices.values()));
        
        setBaseMonthDisplay(data.baseMonth || '');
        
        // Set all bills as expanded by default
        const expanded: Record<string, boolean> = {};
        validBills.forEach(bill => {
          expanded[bill.id] = true;
        });
        setExpandedBills(expanded);
        
        toast.success(`Comparison completed for ${validBills.length} bill(s)`);
        
        // Refresh subscription status and balance
        checkSubscriptionStatus();
      } else {
        const error = await response.json();
        console.log('[Class Analyzer] Error response:', error);
        const errorMessage = error.error || 'Failed to calculate comparison';
        console.log('[Class Analyzer] Setting validation error:', errorMessage);
        setValidationError(errorMessage);
        toast.error(errorMessage);
      }
    } catch (error) {
      console.error('Error calculating comparison:', error);
      const errorMessage = 'Error calculating comparison';
      setValidationError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setCalculating(false);
    }
  };



  const handleExportImage = async () => {
    if (multiBillResults.length === 0) {
      toast.error('No comparison results to export');
      return;
    }

    setExportingImage(true);
    try {
      // Expand all bills before capturing
      const allExpanded: Record<string, boolean> = {};
      multiBillResults.forEach(bill => {
        allExpanded[bill.billId] = true;
      });
      setExpandedBills(allExpanded);

      // Wait a bit for the UI to update
      await new Promise(resolve => setTimeout(resolve, 300));

      // Export each bill separately
      for (const billResult of multiBillResults) {
        const billElement = document.getElementById(`bill-result-${billResult.billId}`);
        if (!billElement) {
          console.error(`Could not find bill element for bill ${billResult.billId}`);
          continue;
        }

        // Capture the bill card as canvas
        const canvas = await html2canvas(billElement, {
          backgroundColor: '#ffffff',
          scale: 2, // Higher quality
          logging: false,
          useCORS: true,
          allowTaint: true,
          ignoreElements: (element) => {
            // Remove any text background highlights
            const style = window.getComputedStyle(element);
            if (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') {
              // Check if this is a text element with background
              if (element.textContent && element.textContent.trim() !== '' && !element.querySelector('*')) {
                return false; // Don't ignore, but we'll handle it differently
              }
            }
            return false;
          },
          onclone: (clonedDoc) => {
            // Remove background colors from text elements in the cloned document
            const allElements = clonedDoc.querySelectorAll('*');
            allElements.forEach((el: any) => {
              const element = el as HTMLElement;
              const computedStyle = window.getComputedStyle(element);
              
              // Remove background from span, p, div, and other text elements
              // but keep backgrounds for card containers, badges, buttons, etc.
              if (element.tagName === 'SPAN' || 
                  element.tagName === 'P' || 
                  element.tagName === 'H1' || 
                  element.tagName === 'H2' || 
                  element.tagName === 'H3' || 
                  element.tagName === 'H4' || 
                  element.tagName === 'H5' || 
                  element.tagName === 'H6') {
                
                // Only remove background if it's not a badge or button-like element
                if (!element.classList.contains('bg-') && 
                    !element.closest('[class*="badge"]') &&
                    !element.closest('[class*="button"]')) {
                  element.style.backgroundColor = 'transparent';
                  element.style.background = 'none';
                }
              }
            });
          }
        });

        // Convert canvas to blob and download
        await new Promise<void>((resolve) => {
          canvas.toBlob((blob) => {
            if (blob) {
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              const billName = billResult.billNumber || `Bill_${billResult.billId}`;
              const fileName = `PVC_Comparison_${billName.replace(/[/\\?%*:|"<>]/g, '_')}_${new Date().toISOString().split('T')[0]}.png`;
              a.download = fileName;
              document.body.appendChild(a);
              a.click();
              window.URL.revokeObjectURL(url);
              document.body.removeChild(a);
            }
            resolve();
          }, 'image/png');
        });

        // Small delay between downloads
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      toast.success(`Exported ${multiBillResults.length} bill image${multiBillResults.length > 1 ? 's' : ''} successfully`);

    } catch (error) {
      console.error('Error exporting images:', error);
      toast.error('Error exporting images');
    } finally {
      setExportingImage(false);
    }
  };

  const getBestClassification = (results: ComparisonResult[]) => {
    if (results.length === 0) return null;
    // Find the classification with the least negative value (closest to zero)
    // or the most positive value if all are positive
    return results.reduce((best, current) => {
      if (current.totalPvc > best.totalPvc) {
        return current;
      }
      return best;
    });
  };

  const getWorstClassification = (results: ComparisonResult[]) => {
    if (results.length === 0) return null;
    return results.reduce((worst, current) => {
      if (current.totalPvc < worst.totalPvc) {
        return current;
      }
      return worst;
    });
  };

  const toggleFormulaExpanded = (classificationId: string, component: string) => {
    const key = `${classificationId}-${component}`;
    setExpandedFormulas(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const isFormulaExpanded = (classificationId: string, component: string) => {
    const key = `${classificationId}-${component}`;
    return expandedFormulas[key] || false;
  };

  const renderComponentWithFormula = (
    result: ComparisonResult,
    componentKey: keyof ComparisonResult['componentPvcs'],
    componentLabel: string
  ) => {
    const pvcValue = result.componentPvcs[componentKey];
    const percentage = result.classification.componentPercentages[componentKey];
    const calculation = result.componentCalculations[componentKey];
    const hasValue = pvcValue !== 0;
    
    // Steel type mapping for display
    const steelTypeLabels: Record<string, string> = {
      'TMT': 'TMT Bars',
      'ANGLE_CHANNEL': 'Angle/Channel',
      'PLATES': 'Plates',
      'OTHER_SECTIONS': 'Other Sections'
    };

    // Get steel type display text
    const getSteelTypeDisplay = () => {
      if (componentKey !== 'steel' || !result.steelTypes || result.steelTypes.length === 0) {
        return null;
      }
      if (result.steelTypes.length === 4) {
        return 'All Types (Avg)';
      }
      return result.steelTypes.map(st => steelTypeLabels[st] || st).join(', ');
    };

    const steelTypeDisplay = getSteelTypeDisplay();

    return (
      <Collapsible
        key={componentKey}
        open={isFormulaExpanded(result.classification.id, componentKey)}
        onOpenChange={() => toggleFormulaExpanded(result.classification.id, componentKey)}
      >
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className={cn(
              "flex items-center gap-1 flex-wrap",
              hasValue ? "text-foreground" : "text-muted-foreground/50"
            )}>
              <span className="flex items-center gap-1">
                {componentLabel}:
                {percentage > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {percentage}%
                  </Badge>
                )}
              </span>
              {steelTypeDisplay && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300">
                  {steelTypeDisplay}
                </Badge>
              )}
              {calculation && (
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-4 w-4 p-0 ml-1">
                    {isFormulaExpanded(result.classification.id, componentKey) ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </Button>
                </CollapsibleTrigger>
              )}
            </span>
            <span className={cn(
              "font-medium",
              hasValue ? (pvcValue < 0 ? "text-red-600 dark:text-red-400" : "text-foreground") : "text-muted-foreground/50"
            )}>
              {hasValue 
                ? `₹${pvcValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                : '—'
              }
            </span>
          </div>
          {calculation && (
            <CollapsibleContent>
              <div className="ml-4 p-2 bg-muted/30 rounded text-xs space-y-1">
                <div className="font-mono">
                  <span className="text-muted-foreground">Base Index (I₀):</span> {calculation.baseIndex}
                </div>
                <div className="font-mono">
                  <span className="text-muted-foreground">Quarterly Avg Index (Iₘ):</span> {calculation.averageIndex}
                  <span className="text-muted-foreground/70 ml-1">(3-month avg)</span>
                </div>
                <div className="font-mono">
                  <span className="text-muted-foreground">Variation:</span> (Iₘ - I₀) = {calculation.indexDiff}
                </div>
                <div className="font-mono">
                  <span className="text-muted-foreground">Ratio:</span> (Iₘ - I₀) / I₀ = {(calculation.variationRatio * 100).toFixed(2)}%
                </div>
                <div className="font-mono">
                  <span className="text-muted-foreground">Component Amount:</span> ₹{calculation.componentAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </div>
                <div className="font-mono font-semibold border-t pt-1">
                  <span className="text-muted-foreground">PVC:</span> ₹{calculation.componentAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} × {calculation.percentage}% = ₹{calculation.pvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </div>
              </div>
            </CollapsibleContent>
          )}
        </div>
      </Collapsible>
    );
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!subscriptionActive) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-4xl min-h-[70vh] flex items-center justify-center">
        <Card className="relative overflow-hidden border border-slate-100 bg-gradient-to-br from-white via-indigo-50/5 to-purple-50/10 rounded-3xl p-8 lg:p-12 shadow-[0_20px_50px_rgba(79,70,229,0.07)] text-center space-y-8 max-w-2xl mx-auto">
          {/* Glassmorphic glowing circles */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-300/10 blur-[80px] rounded-full pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-300/10 blur-[80px] rounded-full pointer-events-none" />
          
          <div className="relative inline-flex items-center justify-center p-5 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-3xl shadow-xl shadow-indigo-500/20">
            <Calculator className="h-10 w-10 text-white" />
          </div>
          
          <div className="space-y-3 relative z-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full">
              <span className="flex h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
              Advanced Contractor Feature
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 leading-tight">
              Unlock the Work <br/>Classification Analyzer
            </h1>
            <p className="text-slate-500 text-sm sm:text-base font-light max-w-md mx-auto leading-relaxed">
              Compare multiple bills across different work classifications instantly. Find the most profitable and compliant setup with zero per-event check fees.
            </p>
          </div>

          <div className="p-6 bg-slate-50/80 border border-slate-100/80 rounded-2xl max-w-md mx-auto space-y-4 text-left shadow-sm">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Subscription Benefits</p>
            <ul className="text-xs sm:text-sm text-slate-600 space-y-2.5 font-light">
              <li className="flex items-center gap-2">
                <span className="text-indigo-600 font-extrabold text-base">✓</span> <strong>Unlimited Comparisons:</strong> Run unlimited classifications check.
              </li>
              <li className="flex items-center gap-2">
                <span className="text-indigo-600 font-extrabold text-base">✓</span> <strong>Zero Event Fees:</strong> No cost per bill checked.
              </li>
              <li className="flex items-center gap-2">
                <span className="text-indigo-600 font-extrabold text-base">✓</span> <strong>Dual Access:</strong> Includes full access to the PVC Check tool.
              </li>
            </ul>
          </div>

          <div className="pt-4 max-w-sm mx-auto space-y-3 relative z-10">
            <div className="flex items-baseline justify-between px-6">
              <span className="text-xs text-slate-400 font-medium">Monthly Plan:</span>
              <span className="text-2xl font-black text-indigo-600">₹99 <span className="text-[11px] text-slate-400 font-medium">/ month</span></span>
            </div>
            
            <Button
              onClick={handleSubscribeTools}
              disabled={subscribing || creditBalance < 99}
              className="w-full h-12 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/25 active:scale-[0.98] transition-all text-sm"
            >
              {subscribing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Activating Subscription...
                </>
              ) : (
                'Activate Now (₹99)'
              )}
            </Button>
            
            {creditBalance < 99 ? (
              <div className="space-y-2">
                <p className="text-xs text-red-500 font-semibold leading-relaxed">
                  Your current balance is ₹{creditBalance.toFixed(2)}. Insufficient credits to subscribe.
                </p>
                <Button 
                  variant="outline" 
                  onClick={() => router.push('/profile')}
                  className="w-full border-slate-200 text-slate-700 hover:bg-slate-50 text-xs rounded-xl h-10 font-bold"
                >
                  Top Up Wallet Credits
                </Button>
              </div>
            ) : (
              <p className="text-xs text-slate-400 font-medium">
                Deducted atomically from your wallet balance (₹{creditBalance.toFixed(2)} available)
              </p>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8 max-w-7xl">
      <div className="mb-4 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">Class Analyzer - Compare Work Classifications</h1>
          <Card className="p-3 sm:p-4 bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-150">
            <div className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-indigo-600 animate-pulse" />
              <div className="text-sm">
                <p className="font-semibold text-indigo-700">
                  Unlimited Comparisons Enabled
                </p>
                <p className="text-xs text-slate-500">
                  Active Subscription Plan
                </p>
              </div>
            </div>
          </Card>
        </div>
        <p className="text-sm sm:text-base text-muted-foreground">
          Compare multiple bills across different work classifications to find the best option under GCC guidelines.
        </p>
      </div>

      {/* Base Month - Single for all bills */}
      <Card className="mb-4 sm:mb-6">
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Base Month (Common for all bills)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-w-sm">
            <Label htmlFor="baseMonth" className="text-sm">Month (mm-yyyy)</Label>
            <Input
              id="baseMonth"
              type="text"
              placeholder="e.g., 01-2024"
              value={baseMonth}
              onChange={(e) => setBaseMonth(e.target.value)}
              maxLength={7}
              className="text-base"
            />
            <p className="text-xs text-muted-foreground">Format: mm-yyyy</p>
            {availableDateRange.minDate && availableDateRange.maxDate && (
              <div className="flex items-center gap-2.5 p-2 px-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800 animate-blink font-semibold">
                <AlertCircle className="h-4 w-4 flex-shrink-0 animate-pulse text-blue-500" />
                <span>
                  Indices available from{' '}
                  <strong>{availableDateRange.minDate.split('-').reverse().join('-')}</strong> to{' '}
                  <strong>{availableDateRange.maxDate.split('-').reverse().join('-')}</strong>
                  <span className="ml-2 bg-blue-100/80 text-blue-900 border border-blue-250 px-1.5 py-0.5 rounded font-extrabold whitespace-nowrap">
                    (All indices up to date: {new Date(availableDateRange.maxDate).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })})
                  </span>
                </span>
              </div>
            )}
            {isLoadingDateRange && (
              <p className="text-xs text-muted-foreground">Loading available date range...</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bill Entries */}
      <Card className="mb-4 sm:mb-8">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
          <div>
            <CardTitle className="text-base sm:text-lg">Bill Entries</CardTitle>
            <CardDescription className="text-sm">
              Add multiple bills to compare ({billEntries.length} bill{billEntries.length !== 1 ? 's' : ''})
            </CardDescription>
          </div>
          <Button onClick={addBillEntry} size="sm" className="w-full sm:w-auto">
            Add Bill
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {billEntries.map((bill, index) => (
              <div key={bill.id} className="p-4 border rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Bill #{bill.id}</h3>
                  {billEntries.length > 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeBillEntry(bill.id)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`billNumber-${bill.id}`}>Bill Number</Label>
                    <Input
                      id={`billNumber-${bill.id}`}
                      type="text"
                      placeholder="e.g., SR/MAS/2024/001"
                      value={bill.billNumber}
                      onChange={(e) => updateBillEntry(bill.id, 'billNumber', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`amount-${bill.id}`}>Bill Amount (₹)</Label>
                    <Input
                      id={`amount-${bill.id}`}
                      type="number"
                      placeholder="e.g., 123345"
                      value={bill.amount}
                      onChange={(e) => updateBillEntry(bill.id, 'amount', e.target.value)}
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`measurementDate-${bill.id}`}>Measurement Date (dd-mm-yyyy)</Label>
                    <Input
                      id={`measurementDate-${bill.id}`}
                      type="text"
                      placeholder="e.g., 15-01-2024"
                      value={bill.measurementDate}
                      onChange={(e) => updateBillEntry(bill.id, 'measurementDate', e.target.value)}
                      maxLength={10}
                    />
                    <p className="text-xs text-muted-foreground">
                      Must be within indices availability range
                    </p>
                  </div>
                </div>
                
                <Separator className="my-4" />
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Dedicated Components (85% Composition)</Label>
                    <Badge variant="secondary" className="text-xs">Optional</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Enter amounts for dedicated TMT/cement components. These will be calculated with 85% composition factor.
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`dedicatedTmt-${bill.id}`}>Dedicated TMT Amount (₹)</Label>
                      <Input
                        id={`dedicatedTmt-${bill.id}`}
                        type="number"
                        placeholder="e.g., 50000"
                        value={bill.dedicatedTmt}
                        onChange={(e) => updateBillEntry(bill.id, 'dedicatedTmt', e.target.value)}
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`dedicatedCement-${bill.id}`}>Dedicated Cement Amount (₹)</Label>
                      <Input
                        id={`dedicatedCement-${bill.id}`}
                        type="number"
                        placeholder="e.g., 30000"
                        value={bill.dedicatedCement}
                        onChange={(e) => updateBillEntry(bill.id, 'dedicatedCement', e.target.value)}
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Work Classifications Selection */}
      <Card className="mb-8">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Select Sub-Classifications to Compare</CardTitle>
            <CardDescription>
              Choose at least 2 sub-classifications to compare. Selected: {selectedSubClassifications.length}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchClassifications()}
            disabled={loading}
          >
            <RefreshCcw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {mainClassifications.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No work classifications available. Please add work classifications with component definitions first.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {mainClassifications.map((mainClass) => {
                const isExpanded = expandedMainClasses[mainClass.id] !== false; // Default to expanded
                const selectedInThisMain = mainClass.subClassifications.filter(s => 
                  selectedSubClassifications.some(sel => sel.id === s.id)
                ).length;
                const allInThisMain = mainClass.subClassifications.length;
                const allSelected = selectedInThisMain === allInThisMain && allInThisMain > 0;
                
                return (
                  <Card key={mainClass.id} className="border-2">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={() => selectAllSubClassifications(mainClass.id)}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{mainClass.code}</Badge>
                              <h3 className="font-semibold text-base">{mainClass.name}</h3>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {selectedInThisMain} of {allInThisMain} sub-classifications selected
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleMainClassification(mainClass.id)}
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </CardHeader>
                    
                    {isExpanded && (
                      <CardContent className="pt-0">
                        <Separator className="mb-4" />
                        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                          {mainClass.subClassifications.map((subClass) => {
                            const isSelected = selectedSubClassifications.some(s => s.id === subClass.id);
                            const activeComponents = Object.entries(subClass.components || {})
                              .filter(([key, value]) => key !== 'fixed' && value > 0)
                              .map(([key]) => key);
                            const hasSteelComponent = (subClass.components?.steel || 0) > 0;
                            
                            return (
                              <div
                                key={subClass.id}
                                className={cn(
                                  "p-3 border rounded-lg transition-all",
                                  isSelected
                                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                                    : "border-border"
                                )}
                              >
                                <div className="flex items-start justify-between mb-2">
                                  <Badge variant={isSelected ? "default" : "outline"} className="text-xs">
                                    {subClass.code}
                                  </Badge>
                                  <Button
                                    variant={isSelected ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => addSubClassification(subClass.id)}
                                    className="h-6"
                                  >
                                    Add
                                  </Button>
                                </div>
                                <h4 className="font-semibold text-sm mb-1">{subClass.name}</h4>
                                <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                                  {subClass.description}
                                </p>
                                {activeComponents.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {activeComponents.map(component => (
                                      <Badge key={component} variant="secondary" className="text-[10px] px-1.5 py-0">
                                        {component.charAt(0).toUpperCase() + component.slice(1)}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Classifications with Steel Type Selection */}
      {selectedSubClassifications.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Selected Classifications ({selectedSubClassifications.length})</CardTitle>
            <CardDescription>
              Configure steel types for classifications with steel components
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {selectedSubClassifications.map((selection, index) => {
                const subClass = mainClassifications
                  .flatMap(m => m.subClassifications)
                  .find(s => s.id === selection.id);
                
                if (!subClass) return null;

                const hasSteelComponent = (subClass.components?.steel || 0) > 0;
                const mainClass = mainClassifications.find(m => 
                  m.subClassifications.some(s => s.id === subClass.id)
                );

                return (
                  <Card key={`${selection.id}-${index}`} className="border">
                    <CardHeader className="p-4 pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge>{subClass.code}</Badge>
                            <Badge variant="outline" className="text-xs">#{index + 1}</Badge>
                            {hasSteelComponent && (
                              <Badge variant="secondary" className="text-xs">Steel Component</Badge>
                            )}
                          </div>
                          <h4 className="font-semibold text-sm">{subClass.name}</h4>
                          {mainClass && (
                            <p className="text-xs text-muted-foreground">{mainClass.name}</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeSubClassificationAtIndex(index)}
                          className="h-8 w-8 p-0"
                        >
                          ×
                        </Button>
                      </div>
                    </CardHeader>

                    {hasSteelComponent && (
                      <CardContent className="p-4 pt-0">
                        <Separator className="mb-3" />
                        <Label className="text-xs font-semibold mb-2 block">
                          Steel Types (leave empty to use average of all types):
                        </Label>
                        <div className="grid grid-cols-2 gap-2">
                          {steelTypes.map((steelType) => {
                            const isChecked = (selection.steelTypes || []).includes(steelType.value);
                            return (
                              <div key={steelType.value} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`steel-${index}-${steelType.value}`}
                                  checked={isChecked}
                                  onCheckedChange={() => toggleSteelTypeForSelection(index, steelType.value)}
                                />
                                <Label
                                  htmlFor={`steel-${index}-${steelType.value}`}
                                  className="text-xs font-normal cursor-pointer"
                                >
                                  {steelType.label}
                                </Label>
                              </div>
                            );
                          })}
                        </div>
                        {(selection.steelTypes || []).length === 0 && (
                          <p className="text-xs text-muted-foreground mt-2">
                            No steel types selected - will use average of all 4 steel types
                          </p>
                        )}
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation Error Message */}
      {validationError && (
        <div ref={errorRef} className="mb-6">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-red-900 mb-1">Cannot Process Comparison</h3>
                  <p className="text-sm text-red-800">{validationError}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Compare Button */}
      <div className="flex justify-center gap-4 mb-8">
        <Button 
          onClick={handleCompare} 
          disabled={calculating}
          size="lg"
          className="min-w-[200px]"
        >
          {calculating ? (
            <>
              <LoadingSpinner size="sm" className="mr-2" />
              Calculating...
            </>
          ) : (
            <>
              <Calculator className="mr-2 h-5 w-5" />
              Compare Work Classifications
            </>
          )}
        </Button>
        
        {multiBillResults.length > 0 && (
          <Button 
            onClick={handleExportImage} 
            disabled={exportingImage}
            size="lg"
            variant="outline"
            className="min-w-[180px]"
          >
            {exportingImage ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Exporting...
              </>
            ) : (
              <>
                <ImageIcon className="mr-2 h-5 w-5" />
                Export as Images ({multiBillResults.length})
              </>
            )}
          </Button>
        )}
      </div>

      {/* Global Indices Display Section - Now shown separately for each bill below */}
      {/* Removed to show indices per bill instead of consolidated view */}

      {/* Comparison Results for Multiple Bills */}
      {multiBillResults.length > 0 && (
        <div id="class-analyzer-results" className="space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Comparison Results</h2>
            <Badge variant="outline" className="text-sm py-1 px-3">
              {multiBillResults.length} Bill{multiBillResults.length !== 1 ? 's' : ''} Compared
            </Badge>
          </div>

          {/* Results for each bill */}
          {multiBillResults.map((billResult) => {
            const bestResult = getBestClassification(billResult.results);
            const worstResult = getWorstClassification(billResult.results);
            const isExpanded = expandedBills[billResult.billId] !== false;

            return (
              <Card key={billResult.billId} className="border-2" id={`bill-result-${billResult.billId}`}>
                <CardHeader>
                  <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleBillExpanded(billResult.billId)}>
                    <div className="flex-1">
                      <CardTitle className="text-xl">
                        {billResult.billNumber ? billResult.billNumber : `Bill #${billResult.billId}`}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        Amount: ₹{billResult.amount.toLocaleString('en-IN')} | Base: {billResult.baseMonth}
                      </CardDescription>
                      <CardDescription className="mt-1">
                        Measurement: {billResult.measurementDate} ({billResult.measurementMonth})
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {bestResult && (
                        <Badge variant="default" className="bg-green-600 whitespace-nowrap">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          Best: {bestResult.classification.code}
                        </Badge>
                      )}
                      <Button variant="ghost" size="sm">
                        {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                
                {isExpanded && (
                  <CardContent>
                    {/* Bill Summary Card */}
                    {(() => {
                      // Calculate totals
                      const classificationPvcs = billResult.results.map(r => r.totalPvc);
                      const totalClassificationPVC = classificationPvcs.reduce((sum, pvc) => sum + pvc, 0);
                      const avgClassificationPVC = classificationPvcs.length > 0 ? totalClassificationPVC / classificationPvcs.length : 0;
                      
                      const dedicatedPVC = (billResult.dedicatedComponents || []).reduce((sum, d) => sum + d.pvc, 0);
                      const grandTotalPVC = totalClassificationPVC + dedicatedPVC;
                      const netPayableAmount = billResult.amount + grandTotalPVC;
                      const percentageChange = ((grandTotalPVC / billResult.amount) * 100);
                      
                      const bestClassification = getBestClassification(billResult.results);
                      const worstClassification = getWorstClassification(billResult.results);
                      const pvcRange = bestClassification && worstClassification 
                        ? Math.abs(bestClassification.totalPvc - worstClassification.totalPvc)
                        : 0;
                      
                      return (
                        <Card className="mb-6 border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
                          <CardHeader className="pb-4">
                            <div className="flex items-center gap-2">
                              <Calculator className="h-5 w-5 text-primary" />
                              <CardTitle className="text-lg">Bill Summary & Financial Impact</CardTitle>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                              {/* Bill Information */}
                              <div className="space-y-3">
                                <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Bill Information</h4>
                                <div className="space-y-2">
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Original Amount:</span>
                                    <span className="font-semibold">₹{billResult.amount.toLocaleString('en-IN')}</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Base Month:</span>
                                    <span className="font-mono text-xs">{billResult.baseMonth}</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Measurement:</span>
                                    <span className="font-mono text-xs">{billResult.measurementDate}</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Classifications:</span>
                                    <span className="font-semibold">{billResult.results.length}</span>
                                  </div>
                                </div>
                              </div>

                              {/* PVC Breakdown */}
                              <div className="space-y-3">
                                <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">PVC Breakdown</h4>
                                <div className="space-y-2">
                                  {billResult.results.length > 0 && (
                                    <>
                                      <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Total PVC (All):</span>
                                        <span className={cn(
                                          "font-semibold",
                                          totalClassificationPVC >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                                        )}>
                                          {totalClassificationPVC >= 0 ? '+' : ''}₹{totalClassificationPVC.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                        </span>
                                      </div>
                                      <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Average PVC:</span>
                                        <span className={cn(
                                          "font-semibold",
                                          avgClassificationPVC >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                                        )}>
                                          {avgClassificationPVC >= 0 ? '+' : ''}₹{avgClassificationPVC.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                        </span>
                                      </div>
                                    </>
                                  )}
                                  {dedicatedPVC !== 0 && (
                                    <div className="flex justify-between text-sm">
                                      <span className="text-muted-foreground">Dedicated PVC:</span>
                                      <span className={cn(
                                        "font-semibold",
                                        dedicatedPVC >= 0 ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400"
                                      )}>
                                        {dedicatedPVC >= 0 ? '+' : ''}₹{dedicatedPVC.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                  )}
                                  {bestClassification && (
                                    <div className="flex justify-between text-sm pt-2 border-t">
                                      <span className="text-muted-foreground">Best Option:</span>
                                      <span className="font-semibold text-green-600 dark:text-green-400">
                                        {bestClassification.totalPvc >= 0 ? '+' : ''}₹{bestClassification.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                  )}
                                  {worstClassification && bestClassification && worstClassification.classification.id !== bestClassification.classification.id && (
                                    <div className="flex justify-between text-sm">
                                      <span className="text-muted-foreground">Worst Option:</span>
                                      <span className="font-semibold text-red-600 dark:text-red-400">
                                        {worstClassification.totalPvc >= 0 ? '+' : ''}₹{worstClassification.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Financial Impact */}
                              <div className="space-y-3">
                                <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Financial Impact</h4>
                                <div className="space-y-2">
                                  {bestClassification && (
                                    <>
                                      <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Net Amount (Best):</span>
                                        <span className="font-bold text-lg">
                                          ₹{(billResult.amount + bestClassification.totalPvc).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                        </span>
                                      </div>
                                      <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Impact %:</span>
                                        <Badge variant={bestClassification.totalPvc >= 0 ? "default" : "destructive"} className="font-semibold">
                                          {bestClassification.totalPvc >= 0 ? '+' : ''}{((bestClassification.totalPvc / billResult.amount) * 100).toFixed(2)}%
                                        </Badge>
                                      </div>
                                    </>
                                  )}
                                  {pvcRange > 0 && (
                                    <div className="flex justify-between text-sm pt-2 border-t">
                                      <span className="text-muted-foreground">PVC Range:</span>
                                      <span className="font-semibold text-amber-600 dark:text-amber-400">
                                        ₹{pvcRange.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                  )}
                                  {dedicatedPVC !== 0 && (
                                    <div className="flex justify-between text-sm">
                                      <span className="text-muted-foreground">Dedicated Impact:</span>
                                      <span className={cn(
                                        "font-semibold",
                                        dedicatedPVC >= 0 ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400"
                                      )}>
                                        {dedicatedPVC >= 0 ? '+' : ''}{((dedicatedPVC / billResult.amount) * 100).toFixed(2)}%
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Recommendation Section */}
                            {bestClassification && (
                              <div className="mt-6 p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5">
                                    <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                                  </div>
                                  <div className="flex-1">
                                    <h4 className="font-semibold text-green-900 dark:text-green-100 mb-1">
                                      Recommended Classification
                                    </h4>
                                    <p className="text-sm text-green-800 dark:text-green-200">
                                      <span className="font-semibold">{bestClassification.classification.code}</span>: {bestClassification.classification.mainClassification} → {bestClassification.classification.subClassification}
                                    </p>
                                    <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                                      {bestClassification.classification.description}
                                    </p>
                                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                                      <Badge variant="outline" className="bg-white dark:bg-green-950 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300">
                                        PVC: {bestClassification.totalPvc >= 0 ? '+' : ''}₹{bestClassification.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                      </Badge>
                                      <Badge variant="outline" className="bg-white dark:bg-green-950 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300">
                                        Net: ₹{(billResult.amount + bestClassification.totalPvc).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                      </Badge>
                                      {pvcRange > 0 && (
                                        <Badge variant="outline" className="bg-white dark:bg-green-950 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300">
                                          Saves: ₹{pvcRange.toLocaleString('en-IN', { maximumFractionDigits: 2 })} vs worst option
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })()}

                    {/* Price Indices for This Bill */}
                    {billResult.indicesData && billResult.indicesData.length > 0 && (
                      <div className="mb-6">
                        <div className="flex items-center gap-2 mb-4">
                          <h3 className="text-lg font-semibold">Price Indices for This Bill</h3>
                          <Badge variant="secondary">Quarterly Averages</Badge>
                        </div>
                        <div className="overflow-x-auto rounded-lg border">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                              <tr className="border-b">
                                <th className="text-left py-3 px-4 font-semibold">Component</th>
                                <th className="text-right py-3 px-4 font-semibold">
                                  Base Index
                                  <br/>
                                  <span className="text-xs font-normal text-muted-foreground">({billResult.baseMonth})</span>
                                </th>
                                <th className="text-right py-3 px-4 font-semibold">
                                  Average Index
                                  <br/>
                                  <span className="text-xs font-normal text-muted-foreground">({billResult.measurementMonth})</span>
                                </th>
                                <th className="text-left py-3 px-4 font-semibold">Quarter Months</th>
                              </tr>
                            </thead>
                            <tbody>
                              {billResult.indicesData.map((indexData, idx) => {
                                const isPartialQuarter = indexData.monthsUsed && indexData.monthsUsed < 3;
                                return (
                                  <tr key={idx} className={cn(
                                    "border-b",
                                    idx % 2 === 0 && "bg-muted/30",
                                    isPartialQuarter && "bg-amber-50 dark:bg-amber-950/20"
                                  )}>
                                    <td className="py-3 px-4">
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">{indexData.componentName}</span>
                                        {isPartialQuarter && (
                                          <Badge variant="outline" className="text-[10px] bg-amber-100 dark:bg-amber-900 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200">
                                            {indexData.monthsUsed} month{indexData.monthsUsed !== 1 ? 's' : ''}
                                          </Badge>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono">{indexData.baseIndex.toFixed(2)}</td>
                                    <td className="py-3 px-4 text-right font-mono">{indexData.averageIndex.toFixed(2)}</td>
                                    <td className="py-3 px-4">
                                      <div className="flex gap-2 flex-wrap">
                                        {indexData.quarterMonths.map((qm, qmIdx) => (
                                          <Badge key={qmIdx} variant="outline" className="text-xs">
                                            {qm.month}: {qm.value.toFixed(2)}
                                          </Badge>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        {billResult.indicesData.some((d: IndexData) => d.monthsUsed && d.monthsUsed < 3) && (
                          <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
                            <p className="text-sm text-amber-800 dark:text-amber-200">
                              ⚠️ <strong>Partial Quarter Data:</strong> Some components use less than 3 months of data due to unavailable future month indices.
                            </p>
                          </div>
                        )}
                        <Separator className="my-6" />
                      </div>
                    )}

                    {/* Dedicated Components Section */}
                    {billResult.dedicatedComponents && billResult.dedicatedComponents.length > 0 && (
                      <div className="mb-6">
                        <div className="flex items-center gap-2 mb-4">
                          <h3 className="text-lg font-semibold">Dedicated Components (85% Composition)</h3>
                          <Badge variant="secondary">PVC Calculation</Badge>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          {billResult.dedicatedComponents.map((dedicated, idx) => {
                            const isPositive = dedicated.pvc >= 0;
                            const componentName = dedicated.component === 'tmt' ? 'TMT Bars' : 'Cement';
                            
                            return (
                              <Card key={idx} className="border-2 border-blue-200 dark:border-blue-800">
                                <CardHeader className="pb-3">
                                  <div className="flex items-center justify-between">
                                    <CardTitle className="text-base">{componentName}</CardTitle>
                                    <Badge 
                                      variant={isPositive ? "default" : "destructive"} 
                                      className={cn(
                                        "text-lg font-bold",
                                        isPositive && "bg-blue-600"
                                      )}
                                    >
                                      {isPositive ? '+' : ''}₹{dedicated.pvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    Amount: ₹{dedicated.amount.toLocaleString('en-IN')} × 85%
                                  </p>
                                </CardHeader>
                                <CardContent>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Base Index:</span>
                                      <span className="font-mono">{dedicated.baseIndex}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Avg Index:</span>
                                      <span className="font-mono">{dedicated.averageIndex}</span>
                                    </div>
                                    <Separator />
                                    <div className="flex justify-between font-semibold">
                                      <span>PVC:</span>
                                      <span className={isPositive ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400"}>
                                        ₹{dedicated.pvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                        <Separator className="my-6" />
                      </div>
                    )}
                    
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                      {billResult.results
                        .sort((a, b) => {
                          // Sort by classification code (natural sort for alphanumeric codes)
                          const codeA = a.classification.code || '';
                          const codeB = b.classification.code || '';
                          return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
                        })
                        .map((result, index) => {
                          const isBest = bestResult?.classification.id === result.classification.id;
                          const isWorst = worstResult?.classification.id === result.classification.id;
                          const rank = index + 1;
                          const isPositive = result.totalPvc >= 0;
                          
                          return (
                            <Card 
                              key={result.classification.id}
                              className={cn(
                                "relative",
                                isBest && "border-green-600 border-2 shadow-lg",
                                isWorst && !isBest && "border-red-500 border-2"
                              )}
                            >
                              {isBest && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                                  <Badge className="bg-green-600 text-white whitespace-nowrap shadow-md">
                                    <TrendingUp className="h-3 w-3 mr-1" />
                                    Least Negative
                                  </Badge>
                                </div>
                              )}
                              
                              {isWorst && !isBest && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                                  <Badge variant="destructive" className="whitespace-nowrap shadow-md">
                                    <TrendingDown className="h-3 w-3 mr-1" />
                                    Most Negative
                                  </Badge>
                                </div>
                              )}
                              
                              <CardHeader className={cn((isBest || isWorst) && "pt-6")}>
                                <div className="flex items-start justify-between mb-2">
                                  <Badge variant={isBest ? "default" : "outline"} className="text-sm">
                                    #{rank} - {result.classification.code}
                                  </Badge>
                                  <Badge 
                                    variant={isPositive ? "default" : "destructive"} 
                                    className={cn(
                                      "text-lg font-bold",
                                      isPositive && "bg-green-600"
                                    )}
                                  >
                                    {isPositive ? '+' : ''}₹{result.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                  </Badge>
                                </div>
                                <CardTitle className="text-lg">
                                  {result.classification.mainClassification}
                                </CardTitle>
                                <CardDescription className="text-xs">
                                  {result.classification.subClassification}
                                </CardDescription>
                              </CardHeader>
                              
                              <CardContent>
                                <Separator className="mb-4" />
                                <div className="space-y-2">
                                  <h4 className="font-semibold text-sm mb-2">Component Breakdown:</h4>
                                  
                                  {renderComponentWithFormula(result, 'labour', 'Labour')}
                                  {renderComponentWithFormula(result, 'steel', 'Steel')}
                                  {renderComponentWithFormula(result, 'cement', 'Cement')}
                                  {renderComponentWithFormula(result, 'plantMachinery', 'Plant & Machinery')}
                                  {renderComponentWithFormula(result, 'fuel', 'Fuel & Power')}
                                  {renderComponentWithFormula(result, 'otherMaterials', 'Other Materials')}
                                  {renderComponentWithFormula(result, 'explosives', 'Explosives')}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

    </div>
  );
}
