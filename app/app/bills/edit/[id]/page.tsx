
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
import { 
  FileText, 
  Save, 
  Calculator, 
  Calendar, 
  Edit, 
  Clock, 
  IndianRupee,
  AlertTriangle,
  Building2,
  ClipboardList,
  Package,
  Layers,
  TrendingUp,
  CheckCircle2,
  Info,
  ChevronRight
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { format } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';
import { getRailwayZoneOptions, getSteelCityForZone } from '@/lib/zone-steel-city-mapping';
import { toast } from 'react-hot-toast';
import { BackButton } from '@/components/ui/back-button';
import { BillClassificationEntries } from '@/components/bill-classification-entries';
import { BillAmountCalculator } from '@/components/bill-amount-calculator';

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

interface BillTransaction {
  id: string;
  amount: number;
  originalAmount: number;
  discount: number;
  status: string;
  isFree: boolean;
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

interface ItemRow {
  itemNumber: string;
  quantity: number | string | '';
  agreementRate: number | string | '';
}

interface ClassificationEntry {
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

interface ClassificationGroup {
  id: string;
  code: string;
  name: string;
  description?: string;
  subClassifications: SubClassification[];
}

interface Bill {
  id: string;
  billNo: string;
  billAmount: number;
  grossBillAmount?: number;
  cementAmount?: number;
  steelTmtBarsAmount?: number;
  selectedSteelComponent?: string;
  dateOfMeasurement: string;
  quarter: string;
  zone?: string;
  fuelPriceType?: string;
  isFinalPvc?: boolean;
  dateOfCompletion?: string;
  createdAt: string;
  updatedAt: string;
  contractId: string;
  workClassificationId?: string;
  subClassifications?: any[];
  nonScheduleItems?: any[];
  contract: Contract;
  workClassification?: Classification;
  billTransaction?: BillTransaction;
}



function EditBillPageContent() {
  const router = useRouter();
  const params = useParams();
  const billId = params?.id as string;

  const [bill, setBill] = useState<Bill | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [classificationGroups, setClassificationGroups] = useState<ClassificationGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  // Ref for error message to enable scroll-to-error
  const errorRef = useRef<HTMLDivElement>(null);
  
  const [formData, setFormData] = useState({
    contractId: '',
    billNo: '',
    grossBillAmount: '',
    billAmount: '',
    dateOfMeasurement: '',
    workClassification: '',
    zone: '',
    fuelPriceType: 'four_city_avg',
    isFinalPvc: false,
    dateOfCompletion: '',
    pvcNumber: '',
    cementAmount: '',
    steelTmtBarsAmount: ''
  });
  
  // Classification entries state - array of { subClassificationId, amount }
  const [classificationEntries, setClassificationEntries] = useState<ClassificationEntry[]>([]);
  
  // Sub-classifications state - array of { code, name, amount } (legacy support)
  const [subClassifications, setSubClassifications] = useState<Array<{ code: string; name: string; amount: string }>>([]);
  
  // Non-schedule items state - array of { description, amount }
  const [nonScheduleItems, setNonScheduleItems] = useState<Array<{ description: string; amount: string }>>([]);
  
  // Accordion state - start with basic info open
  const [openAccordion, setOpenAccordion] = useState<string[]>(['basic']);

  useEffect(() => {
    if (billId) {
      fetchBill();
      fetchContracts();
      fetchClassifications();
    }
  }, [billId]);

  // Scroll to error when it appears
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [error]);

  const fetchBill = async () => {
    try {
      const response = await fetch(`/api/bills/${billId}`);
      if (!response.ok) throw new Error('Bill not found');
      
      const billData = await response.json();
      setBill(billData);
      
      // Populate form with existing data
      setFormData({
        contractId: billData.contractId || '',
        billNo: billData.billNo || '',
        grossBillAmount: billData.grossBillAmount?.toString() || billData.billAmount?.toString() || '',
        billAmount: billData.billAmount?.toString() || '',
        dateOfMeasurement: billData.dateOfMeasurement ? billData.dateOfMeasurement.split('T')[0] : '', // Convert to date input format
        workClassification: billData.workClassificationId || '',
        zone: billData.zone || '',
        fuelPriceType: billData.fuelPriceType || 'four_city_avg',
        isFinalPvc: billData.isFinalPvc || false,
        dateOfCompletion: billData.dateOfCompletion ? billData.dateOfCompletion.split('T')[0] : '',
        pvcNumber: billData.pvcNumber || '',
        cementAmount: billData.cementAmount?.toString() || '',
        steelTmtBarsAmount: billData.steelTmtBarsAmount?.toString() || '',

      });
      
      // Populate classification entries if they exist (new format)
      if (billData.classificationEntries && Array.isArray(billData.classificationEntries) && billData.classificationEntries.length > 0) {
        console.log('Loading classification entries from bill:', billData.classificationEntries);
        setClassificationEntries(billData.classificationEntries.map((entry: any) => ({
          subClassificationId: entry.subClassificationId || entry.classificationId || '',
          amount: entry.amount || 0,
          description: entry.description || '',
          scheduleItem: entry.scheduleItem || '',
          itemNumber: entry.itemNumber || '',
          quantity: entry.quantity || '',
          agreementRate: entry.agreementRate || '',
          itemRows: entry.itemRows && Array.isArray(entry.itemRows) && entry.itemRows.length > 0
            ? entry.itemRows.map((r: any) => ({ itemNumber: r.itemNumber || '', quantity: r.quantity ?? '', agreementRate: r.agreementRate ?? '' }))
            : undefined
        })));
      }
      
      // Populate sub-classifications if they exist (legacy support)
      if (billData.subClassifications && Array.isArray(billData.subClassifications)) {
        setSubClassifications(billData.subClassifications.map((sc: any) => ({
          code: sc.code || '',
          name: sc.name || '',
          amount: sc.amount?.toString() || ''
        })));
      }
      
      // Populate non-schedule items if they exist
      if (billData.nonScheduleItems && Array.isArray(billData.nonScheduleItems)) {
        setNonScheduleItems(billData.nonScheduleItems.map((item: any) => ({
          description: item.description || '',
          amount: item.amount?.toString() || ''
        })));
      }
    } catch (error: any) {
      console.error('Error fetching bill:', error);
      setError(error.message || 'Failed to fetch bill');
    }
  };

  const fetchContracts = async () => {
    try {
      const response = await fetch('/api/contracts');
      if (!response.ok) throw new Error('Failed to fetch contracts');
      
      const data = await response.json();
      setContracts(data);
    } catch (error: any) {
      console.error('Error fetching contracts:', error);
      setError(error.message || 'Failed to fetch contracts');
    }
  };

  const fetchClassifications = async () => {
    try {
      // Use the same endpoint as bulk bill creation
      const response = await fetch('/api/classification-groups');
      if (!response.ok) throw new Error('Failed to fetch classifications');
      
      const data = await response.json();
      
      // Check if data has a 'groups' property or is an array
      const groupsData = data.groups || data;
      
      if (!Array.isArray(groupsData)) {
        console.error('Invalid classification groups data:', data);
        setError('Invalid classification data format');
        return;
      }
      
      console.log('Loaded classification groups:', groupsData);
      console.log('Total groups:', groupsData.length);
      console.log('Total sub-classifications:', groupsData.reduce((sum: number, g: any) => sum + (g.subClassifications?.length || 0), 0));
      
      setClassificationGroups(groupsData);
      
      // Also set the flat classifications list for compatibility
      const flatClassifications = groupsData.map((group: any) => ({
        id: group.id,
        code: group.code,
        name: group.name,
        description: group.description,
        subClassifications: group.subClassifications || [],
        fixed: 0,
        labour: 0,
        steel: 0,
        cement: 0,
        plantMachinery: 0,
        fuel: 0,
        otherMaterials: 0,
        explosives: 0,
        isActive: true,
        isDefault: false
      }));
      setClassifications(flatClassifications);
    } catch (error: any) {
      console.error('Error fetching classifications:', error);
      setError(error.message || 'Failed to fetch classifications');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleContractChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      contractId: value
    }));
  };

  const handleWorkClassificationChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      workClassification: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      // Calculate total classification amount from entries, treating blank/undefined/null as 0
      const totalClassificationAmount = classificationEntries.reduce((sum, entry) => {
        const amount = entry.amount === '' || entry.amount === null || entry.amount === undefined 
          ? 0 
          : typeof entry.amount === 'string' 
            ? parseFloat(entry.amount) || 0 
            : entry.amount;
        return sum + amount;
      }, 0);
      
      // Convert non-schedule items to proper format with numeric amounts
      const formattedNonScheduleItems = nonScheduleItems
        .filter(item => item.description && item.amount) // Only include complete entries
        .map(item => ({
          description: item.description.trim(),
          amount: parseFloat(item.amount) || 0
        }));
      
      // Calculate net bill amount: total classification amount - total non-schedule items
      const nonScheduleTotal = formattedNonScheduleItems.reduce((sum, item) => sum + item.amount, 0);
      const netBillAmount = totalClassificationAmount - nonScheduleTotal;
      
      const response = await fetch(`/api/bills/${billId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          grossBillAmount: totalClassificationAmount,
          billAmount: netBillAmount, // Calculated net amount
          classificationEntries: classificationEntries.map(entry => ({
            subClassificationId: entry.subClassificationId,
            amount: entry.amount,
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
          nonScheduleItems: formattedNonScheduleItems
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update bill');
      }

      const updatedBill = await response.json();
      toast.success(`Bill ${updatedBill.billNo} updated successfully`);
      
      // Redirect to bills page
      router.push('/bills');
    } catch (error: any) {
      console.error('Error updating bill:', error);
      setError(error.message || 'Failed to update bill');
    } finally {
      setSaving(false);
    }
  };

  const selectedContract = contracts.find(c => c.id === formData.contractId);
  const selectedClassification = classifications.find(c => c.id === formData.workClassification) || null;

  if (isLoading || !bill || contracts.length === 0) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <LoadingSpinner size="lg" text="Loading bill..." />
      </div>
    );
  }

  if (!bill) {
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
      {/* Edit Mode Indicator Banner */}
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
            Editing: {bill.billNo}
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <BackButton href="/bills" label="Back to Bills" variant="outline" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Edit className="h-8 w-8 text-orange-600" />
            Edit Bill
          </h1>
          <p className="text-gray-600 mt-2">
            Update bill details and recalculate PVC
          </p>
        </div>
      </div>

      {/* Bill Info Summary */}
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

      {/* Progress indicator */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex items-center justify-between text-sm">
          <div className={`flex items-center gap-2 ${formData.contractId && formData.billNo ? 'text-green-600' : 'text-gray-400'}`}>
            {formData.contractId && formData.billNo ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <div className="h-5 w-5 rounded-full border-2 border-current flex items-center justify-center text-xs">1</div>
            )}
            <span className="font-medium">Basic Info</span>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-300" />
          <div className={`flex items-center gap-2 ${classificationEntries.length > 0 && formData.dateOfMeasurement ? 'text-green-600' : 'text-gray-400'}`}>
            {classificationEntries.length > 0 && formData.dateOfMeasurement ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <div className="h-5 w-5 rounded-full border-2 border-current flex items-center justify-center text-xs">2</div>
            )}
            <span className="font-medium">Classification</span>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-300" />
          <div className={`flex items-center gap-2 ${classificationEntries.length > 0 ? 'text-green-600' : 'text-gray-400'}`}>
            {classificationEntries.length > 0 ? (
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

      <div className="grid grid-cols-1 gap-6">
        {/* Edit Form - Full Width */}
        <div className="w-full">
          <Card className="border-0 shadow-lg border-l-4 border-l-orange-500">
            <CardHeader className="bg-gradient-to-r from-orange-50 to-white">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-6 w-6 text-orange-600" />
                Edit Bill Details
                <Badge className="ml-auto bg-orange-100 text-orange-700 hover:bg-orange-100">
                  Editing Mode
                </Badge>
              </CardTitle>
              <CardDescription>
                Modify the bill information. PVC will be recalculated automatically upon saving.
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
                          <div className="text-xs text-gray-600">Contract and Bill Number</div>
                        </div>
                        {formData.contractId && formData.billNo && (
                          <CheckCircle2 className="h-5 w-5 text-green-600 ml-auto" />
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="contractId" className="flex items-center gap-2">
                          Contract <span className="text-red-500">*</span>
                          <Badge variant="outline" className="ml-2">Cannot be changed</Badge>
                        </Label>
                        <Select value={formData.contractId} onValueChange={handleContractChange} disabled>
                          <SelectTrigger className="bg-gray-100">
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
                        <p className="text-xs text-gray-600">
                          Contract cannot be changed after bill creation
                        </p>
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
                    </AccordionContent>
                  </AccordionItem>

                  {/* SECTION 2: Work Classifications & Date */}
                  <AccordionItem value="classification" className="border rounded-lg bg-gradient-to-r from-green-50 to-teal-50">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <div className="flex items-center gap-3">
                        <ClipboardList className="h-5 w-5 text-green-600" />
                        <div className="text-left">
                          <div className="font-semibold">Work Classifications & Date</div>
                          <div className="text-xs text-gray-600">Classification entries and measurement date</div>
                        </div>
                        {classificationEntries.length > 0 && formData.dateOfMeasurement && (
                          <CheckCircle2 className="h-5 w-5 text-green-600 ml-auto" />
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 space-y-4">
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
                      
                      <div className="space-y-2 pt-4 border-t">
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
                          onKeyDown={(e) => e.preventDefault()}
                          required
                          className="bg-white cursor-pointer"
                        />
                        <p className="text-xs text-gray-600 flex items-center gap-1">
                          <Info className="h-3 w-3" />
                          Determines the quarter for PVC calculation
                        </p>
                      </div>
                      
                      {/* Optional PVC fields */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                        <div className="space-y-2">
                          <Label htmlFor="zone">Railway Zone</Label>
                          <Select value={formData.zone || undefined} onValueChange={(value) => setFormData(prev => ({ ...prev, zone: value }))}>
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
                          {formData.zone && (
                            <p className="text-xs text-gray-600 flex items-center gap-1">
                              <Info className="h-3 w-3" />
                              Steel city: {getSteelCityForZone(formData.zone)}
                            </p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="fuelPriceType">Fuel (Diesel) Price Basis</Label>
                          <Select value={formData.fuelPriceType || 'four_city_avg'} onValueChange={(value) => setFormData(prev => ({ ...prev, fuelPriceType: value }))}>
                            <SelectTrigger className="bg-white">
                              <SelectValue placeholder="Select fuel price basis" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="four_city_avg">Average of 4 Cities</SelectItem>
                              <SelectItem value="zone_city">Zone City ({formData.zone ? getSteelCityForZone(formData.zone) : '...'})</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-gray-600 flex items-center gap-1">
                            <Info className="h-3 w-3" />
                            {formData.fuelPriceType === 'zone_city' && formData.zone
                              ? `Diesel prices from ${getSteelCityForZone(formData.zone)} will be used`
                              : 'Average diesel prices of 4 cities will be used'}
                          </p>
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="pvcNumber">PVC Number</Label>
                          <Input
                            id="pvcNumber"
                            name="pvcNumber"
                            value={formData.pvcNumber}
                            onChange={handleInputChange}
                            placeholder="e.g., PVC/2023/001"
                            className="bg-white"
                          />
                        </div>
                      </div>
                      
                      {/* Final PVC checkbox and completion date */}
                      <div className="space-y-3 pt-4 border-t">
                        <div className="flex items-center space-x-2">
                          <input
                            id="isFinalPvc"
                            type="checkbox"
                            checked={formData.isFinalPvc}
                            onChange={(e) => setFormData(prev => ({ ...prev, isFinalPvc: e.target.checked }))}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          <Label htmlFor="isFinalPvc" className="text-sm font-medium">
                            This is a Final PVC
                          </Label>
                        </div>
                        
                        {formData.isFinalPvc && (
                          <div className="space-y-2 pl-6 border-l-2 border-green-300">
                            <Label htmlFor="dateOfCompletion" className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              Date of Completion <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              id="dateOfCompletion"
                              name="dateOfCompletion"
                              type="date"
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

                  {/* SECTION 3: Dedicated Components & Non-Schedule Items */}
                  <AccordionItem value="amounts" className="border rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <div className="flex items-center gap-3">
                        <TrendingUp className="h-5 w-5 text-blue-600" />
                        <div className="text-left">
                          <div className="font-semibold">Dedicated Components (Optional)</div>
                          <div className="text-xs text-gray-600">Special components calculated separately at 85%</div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 space-y-4">
                      {/* Bill Amount Summary from Classification Entries */}
                      {classificationEntries.length > 0 && (
                        <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200 mb-4">
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-medium text-gray-700">Total Classification Amount:</span>
                              <span className="text-base font-semibold text-gray-900">
                                ₹{classificationEntries.reduce((sum, entry) => {
                                  const amount = entry.amount === '' || entry.amount === null || entry.amount === undefined 
                                    ? 0 
                                    : typeof entry.amount === 'string' 
                                      ? parseFloat(entry.amount) || 0 
                                      : entry.amount;
                                  return sum + amount;
                                }, 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              </span>
                            </div>
                            {nonScheduleItems.length > 0 && nonScheduleItems.some(item => parseFloat(item.amount) > 0) && (
                              <div className="flex justify-between items-center text-red-600">
                                <span className="text-sm font-medium">Less: Non-Schedule Items:</span>
                                <span className="text-base font-semibold">
                                  -₹{nonScheduleItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            )}
                            <div className="pt-2 border-t border-blue-300">
                              <div className="flex justify-between items-center">
                                <span className="text-base font-bold text-blue-900">Net Bill Amount (for PVC):</span>
                                <span className="text-xl font-bold text-blue-700">
                                  ₹{(classificationEntries.reduce((sum, entry) => {
                                    const amount = entry.amount === '' || entry.amount === null || entry.amount === undefined 
                                      ? 0 
                                      : typeof entry.amount === 'string' 
                                        ? parseFloat(entry.amount) || 0 
                                        : entry.amount;
                                    return sum + amount;
                                  }, 0) - nonScheduleItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
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

                        {/* Cement and Steel Amounts */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <Button
                      type="submit"
                      disabled={isSaving || !formData.contractId || !formData.billNo || classificationEntries.length === 0 || !formData.dateOfMeasurement}
                      className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 min-w-[160px]"
                    >
                      {isSaving ? (
                        <LoadingSpinner size="sm" text="Updating..." />
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          Update Existing Bill
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
        
        {/* Info Panel - Now displayed inline at bottom in full width */}
        {(selectedContract || formData.dateOfMeasurement) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            {/* Contract Info */}
            {selectedContract && (
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-purple-600" />
                    Selected Contract
                  </CardTitle>
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

            {/* Quarter Info */}
            {formData.dateOfMeasurement && (
              <Card className="border-0 shadow-lg bg-gradient-to-r from-green-50 to-blue-50">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-green-600" />
                    Quarter Information
                  </CardTitle>
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
        )}
      </div>
    </div>
  );
}

export default function EditBillPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center min-h-64">
        <LoadingSpinner size="lg" text="Loading..." />
      </div>
    }>
      <EditBillPageContent />
    </Suspense>
  );
}
