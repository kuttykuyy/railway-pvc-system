
'use client';

import { useState, useEffect, Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Switch } from '@/components/ui/switch';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StatusMessage } from '@/components/ui/status-message';
import { Badge } from '@/components/ui/badge';
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
  ArrowRight,
  Edit,
  Plus,
  RefreshCw,
  Upload,
  FileUp
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';
import CreditBalance from '@/components/ui/credit-balance';
import { STEEL_COMPONENT_OPTIONS } from '@/lib/types';
import { ProvisionalDateNotification } from '@/components/ui/provisional-date-notification';
import { BackButton } from '@/components/ui/back-button';
import { BillClassificationEntries } from '@/components/bill-classification-entries';
import { validateDate, validateDateForApi } from '@/lib/date-validation';

interface Contract {
  id: string;
  agreementNo: string;
  contractorName: string;
  workDescription: string;
  workClassification?: string;
  dateOfOpening: string;
  baseMonth: string;
}

interface SubClassification {
  code: string;
  name: string;
  description?: string;
}

interface Classification {
  id: string;
  code: string;
  name: string;
  description?: string;
  fixed: number;
  labour: number;
  steel: number;
  cement: number;
  plantMachinery: number;
  fuel: number;
  otherMaterials: number;
  explosives: number;
  isActive: boolean;
  isDefault: boolean;
  subClassifications?: SubClassification[];
}

interface Bill {
  id: string;
  billNo: string;
  billAmount: number;
  grossBillAmount?: number;
  cementAmount?: number;
  steelTmtBarsAmount?: number;
  steelAngleChannelAmount?: number;
  steelPlatesAmount?: number;
  steelOtherSectionsAmount?: number;
  dateOfMeasurement: string;
  quarter: string;
  zone?: string;
  isFinalPvc?: boolean;
  dateOfCompletion?: string;
  createdAt: string;
  updatedAt: string;
  contractId: string;
  workClassificationId?: string;
  subClassifications?: any[];
  nonScheduleItems?: any[];
}

interface PVCCalculationCardProps {
  classification: Classification | null;
  cementAmount?: string;
  steelTmtBarsAmount?: string;
  steelAngleChannelAmount?: string;
  steelPlatesAmount?: string;
  steelOtherSectionsAmount?: string;
}

function PVCCalculationCard({ classification, cementAmount, steelTmtBarsAmount, steelAngleChannelAmount, steelPlatesAmount, steelOtherSectionsAmount }: PVCCalculationCardProps) {
  if (!classification) {
    return (
      <Card className="border-0 shadow-lg bg-gradient-to-r from-blue-50 to-purple-50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            PVC Calculation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-700">
            Please select a work classification to see component percentages.
          </p>
        </CardContent>
      </Card>
    );
  }

  const components = {
    fixed: classification.fixed,
    labour: classification.labour,
    steel: classification.steel,
    cement: classification.cement,
    plantMachinery: classification.plantMachinery,
    fuel: classification.fuel,
    otherMaterials: classification.otherMaterials,
    explosives: classification.explosives
  };
  const totalPercentage = Object.values(components).reduce((sum: number, val: number) => sum + val, 0);

  return (
    <Card className="border-0 shadow-lg bg-gradient-to-r from-blue-50 to-purple-50">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          PVC Calculation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-700">
          The PVC amount will be calculated automatically using:
        </p>
        
        <div className="space-y-3">
          <p className="text-sm font-medium text-blue-800">
            Work Classification: {classification.code} - {classification.name}
          </p>
          
          <div className="grid grid-cols-2 gap-2 text-sm text-gray-700">
            {components.fixed > 0 && (
              <div className="flex justify-between">
                <span>• Fixed:</span>
                <span className="font-medium">{components.fixed}%</span>
              </div>
            )}
            {components.labour > 0 && (
              <div className="flex justify-between">
                <span>• Labour:</span>
                <span className="font-medium">{components.labour}%</span>
              </div>
            )}
            {components.plantMachinery > 0 && (
              <div className="flex justify-between">
                <span>• Plant Machinery & Spares:</span>
                <span className="font-medium">{components.plantMachinery}%</span>
              </div>
            )}
            {components.fuel > 0 && (
              <div className="flex justify-between">
                <span>• Fuel & Lubricants:</span>
                <span className="font-medium">{components.fuel}%</span>
              </div>
            )}
            {components.otherMaterials > 0 && (
              <div className="flex justify-between">
                <span>• Other Materials:</span>
                <span className="font-medium">{components.otherMaterials}%</span>
              </div>
            )}
            {components.steel > 0 && (
              <div className="flex justify-between">
                <span>• Steel:</span>
                <span className="font-medium">{components.steel}%</span>
              </div>
            )}
            {components.cement > 0 && (
              <div className="flex justify-between">
                <span>• Cement:</span>
                <span className="font-medium">{components.cement}%</span>
              </div>
            )}
            {components.explosives > 0 && (
              <div className="flex justify-between">
                <span>• Explosives:</span>
                <span className="font-medium">{components.explosives}%</span>
              </div>
            )}
          </div>
          
          <div className="pt-2 border-t border-gray-200">
            <div className="flex justify-between text-sm font-medium text-blue-700">
              <span>Total Components:</span>
              <span>{totalPercentage}%</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Variable Components:</span>
              <span>{totalPercentage - components.fixed}%</span>
            </div>
          </div>
        </div>
        
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Index Source:</strong> Manual entries will be used
          </p>
        </div>
        
        {/* Dedicated Calculations Section */}
        {(cementAmount || steelTmtBarsAmount || steelAngleChannelAmount || steelPlatesAmount || steelOtherSectionsAmount) && (
          <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
            <h4 className="text-sm font-semibold text-green-800 mb-2">Dedicated Component Calculations (85%)</h4>
            {cementAmount && parseFloat(cementAmount) > 0 && (
              <div className="flex justify-between text-sm text-green-700 mb-1">
                <span>• Dedicated Cement (₹{parseFloat(cementAmount).toLocaleString()}):</span>
                <span className="font-medium">85%</span>
              </div>
            )}
            {steelTmtBarsAmount && parseFloat(steelTmtBarsAmount) > 0 && (
              <div className="flex justify-between text-sm text-green-700 mb-1">
                <span>• Steel TMT Bars (₹{parseFloat(steelTmtBarsAmount).toLocaleString()}):</span>
                <span className="font-medium">85%</span>
              </div>
            )}
            {steelAngleChannelAmount && parseFloat(steelAngleChannelAmount) > 0 && (
              <div className="flex justify-between text-sm text-green-700 mb-1">
                <span>• Steel Angle/Channel (₹{parseFloat(steelAngleChannelAmount).toLocaleString()}):</span>
                <span className="font-medium">85%</span>
              </div>
            )}
            {steelPlatesAmount && parseFloat(steelPlatesAmount) > 0 && (
              <div className="flex justify-between text-sm text-green-700 mb-1">
                <span>• Steel Plates (₹{parseFloat(steelPlatesAmount).toLocaleString()}):</span>
                <span className="font-medium">85%</span>
              </div>
            )}
            {steelOtherSectionsAmount && parseFloat(steelOtherSectionsAmount) > 0 && (
              <div className="flex justify-between text-sm text-green-700">
                <span>• Steel Other Sections (₹{parseFloat(steelOtherSectionsAmount).toLocaleString()}):</span>
                <span className="font-medium">85%</span>
              </div>
            )}
            <p className="text-xs text-green-600 mt-2">
              These amounts will be calculated separately with 85% component percentage
            </p>
          </div>
        )}

        <p className="text-xs text-gray-600 pt-2 border-t">
          Formula: ( Amount * (Avg_Index - Base_Index) * Component% ) / Base_Index
        </p>
      </CardContent>
    </Card>
  );
}

function BillFormPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const billId = searchParams?.get('id');
  const preselectedContractId = searchParams?.get('contractId');
  const isEditMode = !!billId;

  const [bill, setBill] = useState<Bill | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [classifications, setClassifications] = useState<Classification[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showProvisionalNotification, setShowProvisionalNotification] = useState(false);
  const [isRefreshingClassifications, setIsRefreshingClassifications] = useState(false);
  
  // AI Suggestions state
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [suggestionError, setSuggestionError] = useState('');
  
  const [formData, setFormData] = useState({
    contractId: preselectedContractId || '',
    billNo: '',
    grossBillAmount: '',
    cementAmount: '',
    
    steelTmtBarsAmount: '',
    steelAngleChannelAmount: '',
    steelPlatesAmount: '',
    steelOtherSectionsAmount: '',
    
    dateOfMeasurement: '',
    workClassification: '',
    zone: '',
    isFinalPvc: false,
    dateOfCompletion: '',
  });
  
  const [subClassifications, setSubClassifications] = useState<Array<{ code: string; name: string; amount: string }>>([]);
  const [nonScheduleItems, setNonScheduleItems] = useState<Array<{ description: string; amount: string }>>([]);
  const [classificationEntries, setClassificationEntries] = useState<Array<any>>([]);
  const [openAccordion, setOpenAccordion] = useState<string[]>(['basic']);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [useMultipleClassifications, setUseMultipleClassifications] = useState(false);

  useEffect(() => {
    fetchContracts();
    fetchClassifications();
    
    if (isEditMode && billId) {
      fetchBill(billId);
    } else {
      setIsLoading(false);
    }
  }, [billId]);
  
  // Auto-refresh classifications when page becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchClassifications();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);
  
  useEffect(() => {
    if (contracts.length > 0 && classifications.length > 0 && !formData.workClassification && !isEditMode) {
      if (preselectedContractId) {
        const contract = contracts.find(c => c.id === preselectedContractId);
        if (contract?.workClassification) {
          const matchingClassification = classifications.find(c => 
            c.id === contract.workClassification || c.code === contract.workClassification
          );
          if (matchingClassification) {
            setFormData(prev => ({ ...prev, workClassification: matchingClassification.id }));
            return;
          }
        }
      }
      setDefaultClassification();
    }
  }, [contracts, classifications, preselectedContractId, isEditMode]);

  useEffect(() => {
    setSubClassifications([]);
  }, [formData.workClassification]);

  const fetchBill = async (id: string) => {
    try {
      const response = await fetch(`/api/bills/${id}`);
      if (!response.ok) throw new Error('Bill not found');
      
      const billData = await response.json();
      setBill(billData);
      
      setFormData({
        contractId: billData.contractId,
        billNo: billData.billNo,
        grossBillAmount: billData.grossBillAmount?.toString() || billData.billAmount.toString(),
        dateOfMeasurement: billData.dateOfMeasurement.split('T')[0],
        workClassification: billData.workClassificationId || '',
        zone: billData.zone || '',
        isFinalPvc: billData.isFinalPvc || false,
        dateOfCompletion: billData.dateOfCompletion ? billData.dateOfCompletion.split('T')[0] : '',
        cementAmount: billData.cementAmount?.toString() || '',
        steelTmtBarsAmount: billData.steelTmtBarsAmount?.toString() || '',
        steelAngleChannelAmount: billData.steelAngleChannelAmount?.toString() || '',
        steelPlatesAmount: billData.steelPlatesAmount?.toString() || '',
        steelOtherSectionsAmount: billData.steelOtherSectionsAmount?.toString() || ''
      });
      
      if (billData.subClassifications && Array.isArray(billData.subClassifications)) {
        setSubClassifications(billData.subClassifications.map((sc: any) => ({
          code: sc.code || '',
          name: sc.name || '',
          amount: sc.amount?.toString() || ''
        })));
      }
      
      if (billData.nonScheduleItems && Array.isArray(billData.nonScheduleItems)) {
        setNonScheduleItems(billData.nonScheduleItems.map((item: any) => ({
          description: item.description || '',
          amount: item.amount?.toString() || ''
        })));
      }
    } catch (error: any) {
      console.error('Error fetching bill:', error);
      setError(error.message || 'Failed to fetch bill');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchContracts = async () => {
    try {
      const response = await fetch('/api/contracts');
      if (!response.ok) throw new Error('Failed to fetch contracts');
      
      const data = await response.json();
      setContracts(data);
      
      if (preselectedContractId && !isEditMode) {
        setFormData(prev => ({ ...prev, contractId: preselectedContractId }));
      }
    } catch (error: any) {
      console.error('Error fetching contracts:', error);
      setError(error.message || 'Failed to fetch contracts');
    }
  };

  const fetchClassifications = async (showLoading = false) => {
    try {
      if (showLoading) setIsRefreshingClassifications(true);
      const response = await fetch('/api/classifications?active=true');
      if (!response.ok) throw new Error('Failed to fetch classifications');
      
      const data = await response.json();
      setClassifications(data.classifications || []);
      if (showLoading) {
        toast.success('Classifications refreshed successfully');
      }
    } catch (error: any) {
      console.error('Error fetching classifications:', error);
      if (showLoading) {
        toast.error('Failed to refresh classifications');
      }
    } finally {
      if (showLoading) setIsRefreshingClassifications(false);
    }
  };
  
  const handleRefreshClassifications = () => {
    fetchClassifications(true);
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Please upload a PDF file');
      return;
    }

    setIsUploadingPdf(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/parse-pdf', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to parse PDF');
      }

      const result = await response.json();
      
      if (result.success && result.data) {
        const updates: any = {};
        
        // Update measurement date if found
        if (result.data.measurementDate) {
          updates.dateOfMeasurement = result.data.measurementDate;
          toast.success('Measurement date extracted successfully');
        }
        
        // Update bill amount if found
        if (result.data.billAmount) {
          updates.grossBillAmount = result.data.billAmount;
          toast.success('Bill amount extracted successfully');
        }
        
        // Update bill number if found
        if (result.data.billNumber && !isEditMode) {
          updates.billNo = result.data.billNumber;
          toast.success('Bill number extracted successfully');
        }
        
        if (Object.keys(updates).length > 0) {
          setFormData(prev => ({ ...prev, ...updates }));
          
          // Check for provisional data if measurement date was extracted
          if (updates.dateOfMeasurement) {
            checkProvisionalData(updates.dateOfMeasurement);
          }
        } else {
          toast.error('Could not extract bill information from PDF');
        }
      }
    } catch (error: any) {
      console.error('Error parsing PDF:', error);
      toast.error('Failed to parse PDF: ' + error.message);
    } finally {
      setIsUploadingPdf(false);
      // Reset file input
      e.target.value = '';
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
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
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

  const handleContractChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      contractId: value
    }));
    
    const contract = contracts.find(c => c.id === value);
    if (contract?.workClassification && classifications.length > 0) {
      const matchingClassification = classifications.find(c => 
        c.id === contract.workClassification || c.code === contract.workClassification
      );
      
      if (matchingClassification) {
        setFormData(prev => ({
          ...prev,
          workClassification: matchingClassification.id
        }));
        toast.success(`Auto-selected classification: ${matchingClassification.code} - ${matchingClassification.name}`);
      } else {
        setDefaultClassification();
      }
    } else {
      setDefaultClassification();
    }
  };
  
  const setDefaultClassification = () => {
    const defaultClassification = classifications.find(c => c.isDefault);
    if (defaultClassification) {
      setFormData(prev => ({ ...prev, workClassification: defaultClassification.id }));
    } else if (classifications.length > 0) {
      setFormData(prev => ({ ...prev, workClassification: classifications[0].id }));
    }
  };

  const handleWorkClassificationChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      workClassification: value
    }));
    setAiSuggestions([]);
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
    const classification = classifications.find(c => c.code === code);
    if (classification) {
      setFormData(prev => ({
        ...prev,
        workClassification: classification.id
      }));
      toast.success(`Selected: ${code} - ${classification.name}`);
      setAiSuggestions([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const formattedSubClassifications = subClassifications
        .filter(sc => sc.code && sc.amount)
        .map(sc => ({
          code: sc.code,
          name: sc.name,
          amount: parseFloat(sc.amount) || 0
        }));
      
      const formattedNonScheduleItems = nonScheduleItems
        .filter(item => item.description && item.amount)
        .map(item => ({
          description: item.description.trim(),
          amount: parseFloat(item.amount) || 0
        }));
      
      // Calculate gross amount based on classification mode
      const grossAmount = useMultipleClassifications
        ? classificationEntries.reduce((sum, entry) => sum + (parseFloat(entry.amount) || 0), 0)
        : (parseFloat(formData.grossBillAmount) || 0);
      
      const nonScheduleTotal = formattedNonScheduleItems.reduce((sum, item) => sum + item.amount, 0);
      const netBillAmount = grossAmount - nonScheduleTotal;
      
      const url = isEditMode ? `/api/bills/${billId}` : '/api/bills';
      const method = isEditMode ? 'PUT' : 'POST';
      
      // Format classification entries for API
      const formattedClassificationEntries = classificationEntries
        .filter(entry => entry.classificationId && entry.amount > 0)
        .map(entry => ({
          classificationId: entry.classificationId,
          subClassifications: entry.subClassifications || [],
          amount: parseFloat(entry.amount) || 0,
          description: entry.description || ''
        }));

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          grossBillAmount: grossAmount,
          billAmount: netBillAmount,
          subClassifications: formattedSubClassifications,
          nonScheduleItems: formattedNonScheduleItems,
          classificationEntries: formattedClassificationEntries,
          useMultipleClassifications,
          paymentConfirmed: true,
          paymentMethod: 'free',
          paymentReference: null
        }),
      });

      const responseData = await response.json();

      if (response.ok) {
        toast.success(`Bill ${responseData.billNo || 'processed'} ${isEditMode ? 'updated' : 'created'} successfully`);
        router.push('/bills');
        return;
      }

      throw new Error(responseData.error || `Failed to ${isEditMode ? 'update' : 'create'} bill`);

    } catch (error: any) {
      console.error(`Error ${isEditMode ? 'updating' : 'creating'} bill:`, error);
      setError(error.message || `Failed to ${isEditMode ? 'update' : 'create'} bill`);
    } finally {
      setSaving(false);
    }
  };

  const selectedContract = contracts.find(c => c.id === formData.contractId);
  const selectedClassification = classifications.find(c => c.id === formData.workClassification) || null;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <LoadingSpinner size="lg" text={isEditMode ? "Loading bill..." : "Loading contracts..."} />
      </div>
    );
  }

  if (isEditMode && !bill) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Bill not found</h3>
          <p className="text-gray-600 mb-6">
            The bill you're looking for doesn't exist or has been deleted.
          </p>
          <BackButton href="/bills" label="Back to Bills" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CreditBalance />
      
      {/* Mode Banner */}
      {isEditMode ? (
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-6 py-3 rounded-lg shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-lg">
                <Edit className="h-5 w-5" />
              </div>
              <div>
                <div className="font-bold text-lg">EDIT MODE</div>
                <div className="text-sm text-orange-100">
                  You are editing an existing bill - Changes will update the current record
                </div>
              </div>
            </div>
            <Badge className="bg-white text-orange-600 hover:bg-white/90 text-sm font-semibold px-4 py-2">
              Editing: {bill?.billNo}
            </Badge>
          </div>
        </div>
      ) : null}
      
      <div className="flex items-center gap-4">
        <BackButton href="/bills" label="Back to Bills" variant="outline" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            {isEditMode ? (
              <>
                <Edit className="h-8 w-8 text-orange-600" />
                Edit Bill
              </>
            ) : (
              <>
                <FileText className="h-8 w-8 text-purple-600" />
                Process New Bill
              </>
            )}
          </h1>
          <p className="text-gray-600 mt-2">
            {isEditMode ? 'Update bill details and recalculate PVC' : 'Add a new running account bill with automatic PVC calculation'}
          </p>
        </div>
      </div>

      {/* Bill Info Summary (only in edit mode) */}
      {isEditMode && bill && (
        <Card className="border-0 shadow-md bg-gradient-to-r from-gray-50 to-gray-100">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Bill Number:</span>
                <p className="font-semibold text-gray-900">{bill.billNo}</p>
              </div>
              <div>
                <span className="text-gray-600">Created:</span>
                <p className="font-semibold text-gray-900">
                  {format(toISTDate(new Date(bill.createdAt)), 'dd MMM yyyy, HH:mm')}
                </p>
              </div>
              <div>
                <span className="text-gray-600">Last Updated:</span>
                <p className="font-semibold text-gray-900">
                  {format(toISTDate(new Date(bill.updatedAt)), 'dd MMM yyyy, HH:mm')}
                </p>
              </div>
              <div>
                <span className="text-gray-600">Quarter:</span>
                <p className="font-semibold text-gray-900">{bill.quarter}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
          <div className={`flex items-center gap-2 ${formData.workClassification ? 'text-green-600' : 'text-gray-400'}`}>
            {formData.workClassification ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <div className="h-5 w-5 rounded-full border-2 border-current flex items-center justify-center text-xs">2</div>
            )}
            <span className="font-medium">Classification</span>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-300" />
          <div className={`flex items-center gap-2 ${formData.grossBillAmount ? 'text-green-600' : 'text-gray-400'}`}>
            {formData.grossBillAmount ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <div className="h-5 w-5 rounded-full border-2 border-current flex items-center justify-center text-xs">3</div>
            )}
            <span className="font-medium">Amounts</span>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-300" />
          <div className="flex items-center gap-2 text-gray-400">
            <div className="h-5 w-5 rounded-full border-2 border-current flex items-center justify-center text-xs">4</div>
            <span className="font-medium">Review & Submit</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bill Form */}
        <div className="lg:col-span-2">
          <Card className={`border-0 shadow-lg ${isEditMode ? 'border-l-4 border-l-orange-500' : ''}`}>
            <CardHeader className={isEditMode ? 'bg-gradient-to-r from-orange-50 to-white' : ''}>
              <CardTitle className="flex items-center gap-2">
                {isEditMode ? <Edit className="h-6 w-6 text-orange-600" /> : <FileText className="h-6 w-6 text-purple-600" />}
                {isEditMode ? 'Edit Bill Details' : 'Bill Details'}
                {isEditMode && (
                  <Badge className="ml-auto bg-orange-100 text-orange-700 hover:bg-orange-100">
                    Editing Mode
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {isEditMode ? 'Modify the bill information. PVC will be recalculated automatically upon saving.' : 'Enter the bill information. PVC will be calculated automatically based on the quarter.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <StatusMessage type="error" title="Error" message={error} />
                )}

                <Accordion type="multiple" value={openAccordion} onValueChange={setOpenAccordion} className="space-y-4">
                  
                  {/* SECTION 1: Basic Information */}
                  <AccordionItem value="basic" className="border rounded-lg bg-gradient-to-r from-purple-50 to-blue-50">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <div className="flex items-center gap-3">
                        <Building2 className="h-5 w-5 text-purple-600" />
                        <div className="text-left">
                          <div className="font-semibold">Basic Information</div>
                          <div className="text-xs text-gray-600">Contract, Bill Number, Date, and Zone</div>
                        </div>
                        {formData.contractId && formData.billNo && formData.zone && formData.dateOfMeasurement && (
                          <CheckCircle2 className="h-5 w-5 text-green-600 ml-auto" />
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 space-y-4">
                      {/* PDF Upload Section */}
                      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-4 border border-blue-200">
                        <div className="flex items-start gap-3">
                          <FileUp className="h-5 w-5 text-blue-600 mt-0.5" />
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900 mb-1">Quick Fill from PDF</h4>
                            <p className="text-sm text-gray-600 mb-3">
                              Upload your bill PDF to automatically extract measurement date, bill amount, and bill number
                            </p>
                            <div className="flex items-center gap-2">
                              <input
                                type="file"
                                id="pdf-upload"
                                accept="application/pdf"
                                onChange={handlePdfUpload}
                                className="hidden"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => document.getElementById('pdf-upload')?.click()}
                                disabled={isUploadingPdf}
                                className="bg-white"
                              >
                                {isUploadingPdf ? (
                                  <>
                                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                    Processing...
                                  </>
                                ) : (
                                  <>
                                    <Upload className="h-4 w-4 mr-2" />
                                    Upload PDF
                                  </>
                                )}
                              </Button>
                              <span className="text-xs text-gray-500">Supports Railway bill PDFs</span>
                            </div>
                          </div>
                        </div>
                      </div>

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
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="zone">
                          Railway Zone <span className="text-red-500">*</span>
                        </Label>
                        <Select value={formData.zone} onValueChange={(value) => setFormData(prev => ({ ...prev, zone: value }))}>
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Select zone" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Chennai">Chennai</SelectItem>
                            <SelectItem value="Mumbai">Mumbai</SelectItem>
                            <SelectItem value="Delhi">Delhi</SelectItem>
                            <SelectItem value="Kolkata">Kolkata</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-600 flex items-center gap-1">
                          <Info className="h-3 w-3" />
                          PVC Number will be auto-generated based on zone and year
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
                          value={formData.dateOfMeasurement}
                          onChange={handleInputChange}
                          required
                          className="bg-white"
                        />
                        <p className="text-xs text-gray-600 flex items-center gap-1">
                          <Info className="h-3 w-3" />
                          Determines the quarter for PVC calculation
                        </p>
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
                              value={formData.dateOfCompletion}
                              onChange={handleInputChange}
                              required={formData.isFinalPvc}
                              className="bg-white"
                            />
                            <p className="text-xs text-green-700">
                              Required for final PVC claims
                            </p>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* SECTION 2: Classification */}
                  <AccordionItem value="classification" className="border rounded-lg bg-gradient-to-r from-green-50 to-teal-50">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <div className="flex items-center gap-3">
                        {useMultipleClassifications ? (
                          <Layers className="h-5 w-5 text-purple-600" />
                        ) : (
                          <ClipboardList className="h-5 w-5 text-green-600" />
                        )}
                        <div className="text-left">
                          <div className="font-semibold">Work Classification</div>
                          <div className="text-xs text-gray-600">
                            {useMultipleClassifications 
                              ? 'Multiple classifications with amounts'
                              : 'Single PVC classification selection'}
                          </div>
                        </div>
                        {useMultipleClassifications ? (
                          classificationEntries.length > 0 && (
                            <Badge variant="secondary" className="ml-auto">
                              {classificationEntries.length} {classificationEntries.length === 1 ? 'Entry' : 'Entries'}
                            </Badge>
                          )
                        ) : (
                          formData.workClassification && (
                            <CheckCircle2 className="h-5 w-5 text-green-600 ml-auto" />
                          )
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 space-y-4">
                      {/* Classification Mode Toggle */}
                      <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border-2 border-blue-200">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Label htmlFor="classification-mode" className="text-base font-semibold text-gray-900 mb-0 cursor-pointer">
                                Classification Mode
                              </Label>
                              <Badge variant={useMultipleClassifications ? "default" : "secondary"}>
                                {useMultipleClassifications ? 'Multiple' : 'Single'}
                              </Badge>
                            </div>
                            <p className="text-xs text-gray-600">
                              {useMultipleClassifications 
                                ? 'Multiple classifications for complex projects with diverse work types'
                                : 'Single classification for uniform work type'}
                            </p>
                          </div>
                          <Switch
                            id="classification-mode"
                            checked={useMultipleClassifications}
                            onCheckedChange={(checked) => {
                              setUseMultipleClassifications(checked);
                              if (checked) {
                                // Clear single classification when switching to multiple
                                setFormData(prev => ({ ...prev, workClassification: '' }));
                              } else {
                                // Clear multiple classifications when switching to single
                                setClassificationEntries([]);
                              }
                            }}
                            className="data-[state=checked]:bg-purple-600"
                          />
                        </div>
                      </div>

                      {/* Single Classification Mode */}
                      {!useMultipleClassifications && (
                        <div className="space-y-4 animate-in fade-in-50 duration-300">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <Label htmlFor="workClassification">
                                Work Classification <span className="text-red-500">*</span>
                              </Label>
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={handleRefreshClassifications}
                                  disabled={isRefreshingClassifications}
                                  className="h-8 text-xs"
                                  title="Refresh classifications list"
                                >
                                  {isRefreshingClassifications ? (
                                    <LoadingSpinner size="sm" text="" />
                                  ) : (
                                    <>
                                      <RefreshCw className="h-3 w-3 mr-1.5" />
                                      Refresh
                                    </>
                                  )}
                                </Button>
                                {!isEditMode && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={getAISuggestions}
                                    disabled={isLoadingSuggestions || !selectedContract}
                                    className="h-8 text-xs bg-gradient-to-r from-purple-50 to-blue-50 hover:from-purple-100 hover:to-blue-100 border-purple-200"
                                  >
                                    {isLoadingSuggestions ? (
                                      <LoadingSpinner size="sm" text="" />
                                    ) : (
                                      <>
                                        <Sparkles className="h-3 w-3 mr-1.5 text-purple-600" />
                                        AI Suggest
                                      </>
                                    )}
                                  </Button>
                                )}
                              </div>
                            </div>
                            
                            {!isEditMode && aiSuggestions.length > 0 && (
                              <div className="space-y-2 p-3 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200 animate-in fade-in-50 duration-300">
                                <div className="flex items-center gap-2 mb-2">
                                  <Sparkles className="h-4 w-4 text-purple-600" />
                                  <span className="text-sm font-semibold text-purple-900">AI Suggestions</span>
                                  <Badge variant="secondary" className="ml-auto text-xs">
                                    Based on: {selectedContract?.workDescription.substring(0, 30)}...
                                  </Badge>
                                </div>
                                {aiSuggestions.map((suggestion, index) => (
                                  <button
                                    key={suggestion.code}
                                    type="button"
                                    onClick={() => selectAISuggestion(suggestion.code)}
                                    className="w-full text-left p-3 bg-white rounded-lg border border-purple-200 hover:border-purple-400 hover:shadow-md transition-all duration-200 group"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                          <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-300">
                                            #{index + 1}
                                          </Badge>
                                          <span className="font-semibold text-gray-900 text-sm">
                                            {suggestion.code} - {suggestion.name}
                                          </span>
                                          <Badge className="ml-auto bg-green-100 text-green-700 border-green-300">
                                            {suggestion.confidence}% match
                                          </Badge>
                                        </div>
                                        <p className="text-xs text-gray-600 mb-1.5">
                                          {suggestion.reason}
                                        </p>
                                      </div>
                                      <ArrowRight className="h-4 w-4 text-purple-400 group-hover:text-purple-600 group-hover:translate-x-1 transition-all flex-shrink-0 mt-1" />
                                    </div>
                                  </button>
                                ))}
                                <p className="text-xs text-gray-600 text-center pt-1">
                                  Click a suggestion to select it, or choose manually below
                                </p>
                              </div>
                            )}

                            <Select value={formData.workClassification} onValueChange={handleWorkClassificationChange}>
                              <SelectTrigger className="bg-white">
                                <SelectValue placeholder="Select work classification" />
                              </SelectTrigger>
                              <SelectContent className="max-h-[300px]">
                                {classifications.map((classification) => (
                                  <SelectItem key={classification.id} value={classification.id}>
                                    <div className="flex flex-col">
                                      <span className="font-medium">{classification.code} - {classification.name}</span>
                                      {classification.description && (
                                        <span className="text-xs text-gray-600">{classification.description}</span>
                                      )}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {classifications.length === 0 && (
                              <p className="text-xs text-orange-600 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                No classifications found. Please create classifications in the{' '}
                                <Link href="/classifications" className="text-blue-600 hover:underline">
                                  Classifications page
                                </Link>
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Multiple Classifications Mode */}
                      {useMultipleClassifications && (
                        <div className="animate-in fade-in-50 duration-300">
                          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-start gap-2">
                              <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                              <div className="text-sm text-blue-900">
                                <p className="font-medium mb-1">Multiple Classifications Mode</p>
                                <p className="text-xs text-blue-700">
                                  Add multiple main and sub-classifications for complex projects. Each entry can have its own amount,
                                  and component-wise PVC will be calculated for each classification separately and shown in the PDF report.
                                  The sum of all classification amounts will be used as the gross bill amount.
                                </p>
                              </div>
                            </div>
                          </div>
                          
                          <BillClassificationEntries
                            value={classificationEntries}
                            onChange={setClassificationEntries}
                            classificationGroups={[]}
                            workDescription={selectedContract?.workDescription || ''}
                            grossBillAmount={undefined}
                          />
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>

                  {/* SECTION 3: Amounts */}
                  <AccordionItem value="amounts" className="border rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <div className="flex items-center gap-3">
                        <TrendingUp className="h-5 w-5 text-blue-600" />
                        <div className="text-left">
                          <div className="font-semibold">Bill Amount & Component Allocation</div>
                          <div className="text-xs text-gray-600">Total bill amount and dedicated components</div>
                        </div>
                        {formData.grossBillAmount && (
                          <CheckCircle2 className="h-5 w-5 text-green-600 ml-auto" />
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 space-y-4">
                      {useMultipleClassifications && (
                        <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border-2 border-purple-200 mb-4">
                          <div className="flex items-start gap-2">
                            <Info className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
                            <div className="text-sm text-purple-900">
                              <p className="font-medium mb-1">Auto-Calculated Gross Amount</p>
                              <p className="text-xs text-purple-700">
                                In multiple classification mode, the gross bill amount is automatically calculated as the sum of all classification entry amounts.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      <div className="space-y-2">
                        <Label htmlFor="grossBillAmount" className="flex items-center gap-2">
                          Gross Bill Amount (₹) <span className="text-red-500">*</span>
                          {useMultipleClassifications && (
                            <Badge variant="secondary" className="ml-2">Auto-Calculated</Badge>
                          )}
                        </Label>
                        <Input
                          id="grossBillAmount"
                          name="grossBillAmount"
                          type="number"
                          step="0.01"
                          value={useMultipleClassifications 
                            ? classificationEntries.reduce((sum, entry) => sum + (parseFloat(entry.amount) || 0), 0).toFixed(2)
                            : formData.grossBillAmount
                          }
                          onChange={handleInputChange}
                          placeholder="e.g., 5000000"
                          required
                          readOnly={useMultipleClassifications}
                          className={`text-lg font-semibold ${useMultipleClassifications ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}`}
                        />
                        <p className="text-xs text-gray-600">
                          {useMultipleClassifications 
                            ? 'Automatically calculated from classification entries'
                            : 'Enter the total gross bill amount before any deductions'}
                        </p>
                      </div>

                      {(formData.grossBillAmount || nonScheduleItems.length > 0) && (
                        <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-medium text-gray-700">Gross Bill Amount:</span>
                              <span className="text-base font-semibold text-gray-900">
                                ₹{(parseFloat(formData.grossBillAmount) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              </span>
                            </div>
                            {nonScheduleItems.length > 0 && (
                              <div className="flex justify-between items-center text-red-600">
                                <span className="text-sm font-medium">Less: Non-Schedule Items:</span>
                                <span className="text-base font-semibold">
                                  -₹{nonScheduleItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            )}
                            <div className="pt-2 border-t border-blue-300">
                              <div className="flex justify-between items-center">
                                <span className="text-base font-bold text-blue-900">Total Bill Amount (for PVC):</span>
                                <span className="text-xl font-bold text-blue-700">
                                  ₹{((parseFloat(formData.grossBillAmount) || 0) - nonScheduleItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                </span>
                              </div>
                              <p className="text-xs text-gray-600 mt-1">
                                This amount will be used for PVC calculation
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

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

                        <div className="space-y-2 mb-4">
                          <Label htmlFor="cementAmount" className="text-sm">
                            Cement Work Amount (₹)
                          </Label>
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
                        </div>

                        <div className="space-y-3 p-3 border border-gray-200 rounded-lg bg-white">
                          <Label className="text-sm font-semibold text-gray-900">
                            Steel Work Amounts
                          </Label>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label htmlFor="steelTmtBarsAmount" className="text-xs font-medium">
                                TMT Bars (₹)
                              </Label>
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
                            </div>

                            <div className="space-y-1.5">
                              <Label htmlFor="steelAngleChannelAmount" className="text-xs font-medium">
                                Angle/Channel (₹)
                              </Label>
                              <Input
                                id="steelAngleChannelAmount"
                                name="steelAngleChannelAmount"
                                type="number"
                                step="0.01"
                                value={formData.steelAngleChannelAmount}
                                onChange={handleInputChange}
                                placeholder="0.00"
                                className="h-9"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <Label htmlFor="steelPlatesAmount" className="text-xs font-medium">
                                Plates (₹)
                              </Label>
                              <Input
                                id="steelPlatesAmount"
                                name="steelPlatesAmount"
                                type="number"
                                step="0.01"
                                value={formData.steelPlatesAmount}
                                onChange={handleInputChange}
                                placeholder="0.00"
                                className="h-9"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <Label htmlFor="steelOtherSectionsAmount" className="text-xs font-medium">
                                Other Sections (₹)
                              </Label>
                              <Input
                                id="steelOtherSectionsAmount"
                                name="steelOtherSectionsAmount"
                                type="number"
                                step="0.01"
                                value={formData.steelOtherSectionsAmount}
                                onChange={handleInputChange}
                                placeholder="0.00"
                                className="h-9"
                              />
                            </div>
                          </div>
                          <p className="text-xs text-gray-600 mt-2">
                            Joint Plant Committee rates will be used for calculation
                          </p>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* SECTION 4: Optional Details */}
                  <AccordionItem value="optional" className="border rounded-lg bg-gradient-to-r from-orange-50 to-yellow-50">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <div className="flex items-center gap-3">
                        <Layers className="h-5 w-5 text-orange-600" />
                        <div className="text-left">
                          <div className="font-semibold">Additional Details (Optional)</div>
                          <div className="text-xs text-gray-600">Sub-classifications and non-schedule items</div>
                        </div>
                        {(subClassifications.length > 0 || nonScheduleItems.length > 0) && (
                          <Badge variant="secondary" className="ml-auto">
                            {subClassifications.length + nonScheduleItems.length} items
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 space-y-4">
                      
                      {/* Sub-Classifications Section */}
                      {selectedClassification && selectedClassification.subClassifications && selectedClassification.subClassifications.length > 0 ? (
                        <div className="space-y-3 p-3 border border-purple-200 rounded-lg bg-purple-50">
                          <div>
                            <Label className="text-sm font-semibold text-purple-900 mb-2 block">
                              Sub-Classification (Optional)
                            </Label>
                            <p className="text-xs text-purple-700 mb-3">
                              {selectedClassification.code} - {selectedClassification.name}
                            </p>
                          </div>
                          
                          <Select
                            value={subClassifications.length > 0 ? subClassifications[0].code : ''}
                            onValueChange={(value) => {
                              if (value === '') {
                                setSubClassifications([]);
                              } else {
                                const selectedSub = selectedClassification.subClassifications?.find((s: SubClassification) => s.code === value);
                                if (selectedSub) {
                                  setSubClassifications([{
                                    code: selectedSub.code,
                                    name: selectedSub.name,
                                    amount: formData.grossBillAmount || ''
                                  }]);
                                }
                              }
                            }}
                          >
                            <SelectTrigger className="bg-white">
                              <SelectValue placeholder="Select sub-classification (optional)" />
                            </SelectTrigger>
                            <SelectContent className="max-h-[300px]">
                              <SelectItem value="">None</SelectItem>
                              {selectedClassification.subClassifications?.map((subClassification: any) => (
                                <SelectItem key={subClassification.code} value={subClassification.code}>
                                  <div className="flex flex-col">
                                    <span className="font-medium">{subClassification.code}: {subClassification.name}</span>
                                    {subClassification.description && (
                                      <span className="text-xs text-gray-600">{subClassification.description}</span>
                                    )}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          
                          {subClassifications.length > 0 && (
                            <div className="mt-2 p-3 bg-white rounded-lg border border-purple-200">
                              <p className="text-xs text-gray-700 font-medium">
                                Selected: {subClassifications[0].code} - {subClassifications[0].name}
                              </p>
                            </div>
                          )}
                          
                          <p className="text-xs text-purple-700">
                            Select the specific sub-classification that applies to this work
                          </p>
                        </div>
                      ) : selectedClassification ? (
                        <div className="p-3 border border-gray-200 rounded-lg bg-gray-50">
                          <p className="text-sm text-gray-600 text-center">
                            No sub-classifications available for this work classification
                          </p>
                        </div>
                      ) : null}

                      {/* Non-Schedule Items Section */}
                      <div className="space-y-3 p-3 border border-red-200 rounded-lg bg-red-50">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-sm font-semibold text-red-900">
                              Non-Schedule Items
                            </Label>
                            <p className="text-xs text-red-700 mt-0.5">
                              These amounts will be deducted from gross bill amount
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setNonScheduleItems([...nonScheduleItems, { description: '', amount: '' }])}
                            className="bg-white hover:bg-red-100 h-8 text-xs"
                          >
                            + Add
                          </Button>
                        </div>
                  
                        {nonScheduleItems.map((item, index) => (
                          <div key={index} className="grid grid-cols-12 gap-2 items-start p-2 bg-white rounded border border-gray-200">
                            <div className="col-span-8">
                              <Label className="text-xs text-gray-600 mb-1">Description</Label>
                              <Input
                                value={item.description}
                                onChange={(e) => {
                                  const newNonScheduleItems = [...nonScheduleItems];
                                  newNonScheduleItems[index].description = e.target.value;
                                  setNonScheduleItems(newNonScheduleItems);
                                }}
                                placeholder="e.g., Extra work outside scope"
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="col-span-3">
                              <Label className="text-xs text-gray-600 mb-1">Amount (₹)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={item.amount}
                                onChange={(e) => {
                                  const newNonScheduleItems = [...nonScheduleItems];
                                  newNonScheduleItems[index].amount = e.target.value;
                                  setNonScheduleItems(newNonScheduleItems);
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
                                  const newNonScheduleItems = nonScheduleItems.filter((_, i) => i !== index);
                                  setNonScheduleItems(newNonScheduleItems);
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
                          <div className="pt-2 border-t border-red-200">
                            <div className="flex justify-between text-sm font-bold text-red-700">
                              <span>Total Non-Schedule:</span>
                              <span>₹{nonScheduleItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
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
                      onClick={() => router.push('/bills')}
                      disabled={isSaving}
                      className="min-w-[100px]"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSaving || !formData.contractId || !formData.billNo || !formData.grossBillAmount || !formData.workClassification || !formData.dateOfMeasurement || !formData.zone}
                      className={`min-w-[160px] ${isEditMode ? 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700' : 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700'}`}
                    >
                      {isSaving ? (
                        <LoadingSpinner size="sm" text={isEditMode ? "Updating..." : "Processing..."} />
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          {isEditMode ? 'Update Bill' : 'Process Bill'}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Info Panel */}
        <div className="space-y-6">
          {selectedContract && (
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg">Selected Contract</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-gray-600">Agreement No</p>
                  <p className="font-medium">{selectedContract.agreementNo}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Contractor</p>
                  <p className="font-medium">{selectedContract.contractorName}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Work</p>
                  <p className="text-sm text-gray-700">{selectedContract.workDescription}</p>
                </div>
              </CardContent>
            </Card>
          )}

          <PVCCalculationCard 
            key={formData.workClassification}
            classification={selectedClassification}
            cementAmount={formData.cementAmount}
            steelTmtBarsAmount={formData.steelTmtBarsAmount}
            steelAngleChannelAmount={formData.steelAngleChannelAmount}
            steelPlatesAmount={formData.steelPlatesAmount}
            steelOtherSectionsAmount={formData.steelOtherSectionsAmount}
          />

          {formData.dateOfMeasurement && (
            <Card className="border-0 shadow-lg bg-gradient-to-r from-green-50 to-blue-50">
              <CardHeader>
                <CardTitle className="text-lg">Quarter Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <p className="text-sm text-gray-600">Measurement Date</p>
                  <p className="font-bold text-green-600">
                    {new Date(formData.dateOfMeasurement).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                  <p className="text-sm text-gray-600 mt-2">
                    Quarter: <span className="font-medium">
                      Q{Math.floor((new Date(formData.dateOfMeasurement).getMonth()) / 3) + 1}-{new Date(formData.dateOfMeasurement).getFullYear()}
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BillFormPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center min-h-64">
        <LoadingSpinner size="lg" text="Loading..." />
      </div>
    }>
      <BillFormPageContent />
    </Suspense>
  );
}
