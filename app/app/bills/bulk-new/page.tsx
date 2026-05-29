
'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Plus, Trash2, Save, AlertCircle, Calculator as CalcIcon, Edit } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { InsufficientCreditDialog } from '@/components/ui/insufficient-credit-dialog';
import { BackButton } from '@/components/ui/back-button';
import { BillAmountCalculator } from '@/components/bill-amount-calculator';
import { BillClassificationEntries } from '@/components/bill-classification-entries';
import { IndicesAvailabilityIndicator } from '@/components/indices-availability-indicator';
import { getRailwayZoneOptions, getSteelCityForZone } from '@/lib/zone-steel-city-mapping';

interface Contract {
  id: string;
  agreementNo: string;
  contractorName: string;
  workDescription: string;
  dateOfOpening: string;
  baseMonth: string;
}

interface SubClassification {
  id: string;
  code: string;
  name: string;
  groupId: string;
  fixed: number;
  labour: number;
  steel: number;
  cement: number;
  plantMachinery: number;
  fuel: number;
  otherMaterials: number;
  explosives: number;
}

interface ClassificationGroup {
  id: string;
  code: string;
  name: string;
  subClassifications: SubClassification[];
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
}

interface BillRow {
  id: string;
  billNo: string;
  dateOfMeasurement: string;
  classificationEntries: ClassificationEntry[];
  steelTmtBarsAmount: number;
  steelAngleChannelAmount: number;
  steelPlatesAmount: number;
  steelOtherSectionsAmount: number;
  cementAmount: number;
  zone: string;
  fuelPriceType: string;
}

export default function BulkBillCreationPage() {
  const router = useRouter();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [classificationGroups, setClassificationGroups] = useState<ClassificationGroup[]>([]);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [processingFee, setProcessingFee] = useState<number>(0);
  const [billRows, setBillRows] = useState<BillRow[]>([
    {
      id: Math.random().toString(36).substr(2, 9),
      billNo: '',
      dateOfMeasurement: '',
      classificationEntries: [],
      steelTmtBarsAmount: 0,
      steelAngleChannelAmount: 0,
      steelPlatesAmount: 0,
      steelOtherSectionsAmount: 0,
      cementAmount: 0,
      zone: '',
      fuelPriceType: 'four_city_avg',
    },
  ]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);

  // Ref for error message to enable scroll-to-error
  const errorRef = useRef<HTMLDivElement>(null);

  // Insufficient credit dialog state
  const [showInsufficientCredit, setShowInsufficientCredit] = useState(false);
  const [creditInfo, setCreditInfo] = useState({
    currentBalance: 0,
    requiredAmount: 0,
    shortfall: 0
  });

  // Classification management dialog state
  const [showClassificationDialog, setShowClassificationDialog] = useState(false);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  // Scroll to error when it appears
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [error]);

  const loadInitialData = async () => {
    try {
      setIsLoading(true);
      setError('');

      // Check maintenance mode
      try {
        const maintenanceRes = await fetch('/api/settings/maintenance-status');
        if (maintenanceRes.ok) {
          const maintenanceData = await maintenanceRes.json();
          if (maintenanceData.maintenanceStatus?.bulkBillingMaintenance) {
            setIsMaintenanceMode(true);
            // Show error message
            toast.error('Bulk billing is currently under maintenance. Please try again later.');
            // Redirect to bills page after 2 seconds
            setTimeout(() => {
              router.push('/bills');
            }, 2000);
            return; // Exit early to prevent further loading
          }
        }
      } catch (err) {
        console.error('Error checking maintenance mode:', err);
      }

      // Load contracts
      const contractsRes = await fetch('/api/contracts');
      if (!contractsRes.ok) throw new Error('Failed to load contracts');
      const contractsData = await contractsRes.json();
      setContracts(contractsData);

      // Load classifications
      const classificationsRes = await fetch('/api/classification-groups');
      if (!classificationsRes.ok) throw new Error('Failed to load classifications');
      const classificationsData = await classificationsRes.json();
      // API returns { groups: [...] }
      const groupsArray = classificationsData.groups || classificationsData;
      setClassificationGroups(Array.isArray(groupsArray) ? groupsArray : []);
      
      // Debug log
      if (groupsArray.length > 0) {
        console.log(`✅ Loaded ${groupsArray.length} classification groups with sub-classifications`);
      }

      // Load processing fee (user's custom fee or system default)
      try {
        const feeRes = await fetch('/api/user/processing-fee');
        if (feeRes.ok) {
          const feeData = await feeRes.json();
          setProcessingFee(feeData.processingFee || 0);
        } else {
          // Fallback to system settings
          const settingsRes = await fetch('/api/admin/settings');
          if (settingsRes.ok) {
            const settings = await settingsRes.json();
            const billProcessingCost = settings.find((s: any) => s.key === 'BILL_PROCESSING_COST');
            if (billProcessingCost) {
              setProcessingFee(parseFloat(billProcessingCost.value) || 10);
            }
          }
        }
      } catch (settingsErr) {
        console.warn('Failed to load processing fee from settings, using default:', settingsErr);
        setProcessingFee(10); // Default fallback
      }

      setIsLoading(false);
    } catch (err: any) {
      console.error('Error loading data:', err);
      setError(err.message || 'Failed to load data');
      setIsLoading(false);
    }
  };

  const addBillRow = () => {
    setBillRows([
      ...billRows,
      {
        id: Math.random().toString(36).substr(2, 9),
        billNo: '',
        dateOfMeasurement: '',
        classificationEntries: [],
        steelTmtBarsAmount: 0,
        steelAngleChannelAmount: 0,
        steelPlatesAmount: 0,
        steelOtherSectionsAmount: 0,
        cementAmount: 0,
        zone: '',
        fuelPriceType: 'four_city_avg',
      },
    ]);
  };

  const removeBillRow = (id: string) => {
    if (billRows.length === 1) {
      toast.error('At least one bill is required');
      return;
    }
    setBillRows(billRows.filter((row) => row.id !== id));
  };

  const updateBillRow = (id: string, field: keyof BillRow, value: any) => {
    setBillRows((prevRows) =>
      prevRows.map((row) =>
        row.id === id ? { ...row, [field]: value } : row
      )
    );
  };

  // Open classification dialog for a specific bill row
  const openClassificationDialog = (billId: string) => {
    setEditingBillId(billId);
    setShowClassificationDialog(true);
  };

  // Update classification entries for a specific bill
  const updateClassificationEntries = (billId: string, entries: ClassificationEntry[]) => {
    setBillRows((prevRows) =>
      prevRows.map((row) =>
        row.id === billId ? { ...row, classificationEntries: entries } : row
      )
    );
  };

  // Get current bill for editing
  const getEditingBill = () => {
    return billRows.find(row => row.id === editingBillId);
  };

  const validateBills = (): string | null => {
    if (!selectedContract) {
      return 'Please select a contract';
    }

    for (let i = 0; i < billRows.length; i++) {
      const row = billRows[i];
      
      if (!row.billNo.trim()) {
        return `Bill ${i + 1}: Bill number is required`;
      }
      
      if (!row.dateOfMeasurement) {
        return `Bill ${i + 1}: Date of measurement is required`;
      }
      
      if (!row.zone) {
        return `Bill ${i + 1}: Railway zone is required`;
      }
      
      if (!row.classificationEntries || row.classificationEntries.length === 0) {
        return `Bill ${i + 1}: At least one classification entry is required`;
      }
      
      // Validate each classification entry
      for (let j = 0; j < row.classificationEntries.length; j++) {
        const entry = row.classificationEntries[j];
        if (!entry.subClassificationId) {
          return `Bill ${i + 1}: Classification ${j + 1} must have a sub-classification`;
        }
        const numAmount = entry.amount === '' || entry.amount === null || entry.amount === undefined 
          ? 0 
          : typeof entry.amount === 'string' 
            ? parseFloat(entry.amount) || 0 
            : entry.amount;
        if (numAmount < 0) {
          return `Bill ${i + 1}: Classification ${j + 1} amount must be zero or greater`;
        }
      }
    }

    // Check for duplicate bill numbers
    const billNos = billRows.map((r) => r.billNo.trim());
    const duplicates = billNos.filter((item, index) => billNos.indexOf(item) !== index);
    if (duplicates.length > 0) {
      return `Duplicate bill numbers found: ${duplicates.join(', ')}`;
    }

    return null;
  };

  const handleSubmit = async () => {
    const validationError = validateBills();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    try {
      setIsSaving(true);

      const payload = {
        contractId: selectedContract!.id,
        bills: billRows.map((row) => {
          // Calculate gross bill amount from classification entries, treating blank/undefined/null as 0
          const grossBillAmount = row.classificationEntries.reduce((sum, entry) => {
            const amount = entry.amount === '' || entry.amount === null || entry.amount === undefined 
              ? 0 
              : typeof entry.amount === 'string' 
                ? parseFloat(entry.amount) || 0 
                : entry.amount;
            return sum + amount;
          }, 0);
          
          return {
            billNo: row.billNo.trim(),
            dateOfMeasurement: row.dateOfMeasurement,
            zone: row.zone,
            fuelPriceType: row.fuelPriceType || 'four_city_avg',
            grossBillAmount: grossBillAmount,
            billAmount: grossBillAmount,
            steelTmtBarsAmount: row.steelTmtBarsAmount || 0,
            steelAngleChannelAmount: row.steelAngleChannelAmount || 0,
            steelPlatesAmount: row.steelPlatesAmount || 0,
            steelOtherSectionsAmount: row.steelOtherSectionsAmount || 0,
            cementAmount: row.cementAmount || 0,
            classificationEntries: row.classificationEntries.map(entry => ({
              subClassificationId: entry.subClassificationId,
              amount: entry.amount === '' || entry.amount === null || entry.amount === undefined 
                ? 0 
                : typeof entry.amount === 'string' 
                  ? parseFloat(entry.amount) || 0 
                  : entry.amount,
              description: entry.description || '',
              steelTypes: entry.steelTypes || [],
              itemNumber: entry.itemNumber || null,
              quantity: entry.quantity === '' || entry.quantity === null || entry.quantity === undefined ? null : parseFloat(String(entry.quantity)) || null,
              agreementRate: entry.agreementRate === '' || entry.agreementRate === null || entry.agreementRate === undefined ? null : parseFloat(String(entry.agreementRate)) || null
            })),
            processingFee: processingFee,
          };
        }),
      };

      const response = await fetch('/api/bills/bulk-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        // Create an error object that includes all validation details
        const error: any = new Error(errorData.error || 'Failed to create bills');
        error.duplicateBills = errorData.duplicateBills;
        error.validationErrors = errorData.validationErrors;
        error.details = errorData.details;
        throw error;
      }

      const result = await response.json();
      
      // Display success message with credit info
      if (result.creditInfo) {
        const { cost, remainingBalance } = result.creditInfo;
        if (remainingBalance === -1) {
          // Free account
          toast.success(`Successfully created ${result.count} bills! (Free Account)`);
        } else {
          // Paid account
          toast.success(
            `Successfully created ${result.count} bills!\n${cost} credits deducted. Remaining balance: ${remainingBalance} credits`
          );
        }
      } else {
        toast.success(`Successfully created ${result.count} bills!`);
      }
      
      // Add a small delay to ensure database transaction is complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Force a hard refresh by adding a timestamp query parameter to bust any caches
      router.push(`/bills?contractId=${selectedContract!.id}&refresh=${Date.now()}`);
    } catch (err: any) {
      console.error('Error creating bills:', err);
      
      // Check if this is an insufficient credit error
      const errorMessage = err.message || '';
      if (errorMessage.includes('Insufficient balance') || errorMessage.includes('insufficient credit')) {
        // Parse credit information from error message
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
          setIsSaving(false);
          return;
        }
      }
      
      // Check if this is a validation error with detailed information
      if (err.duplicateBills || err.validationErrors) {
        let errorMessage = 'Failed to create bills:\n\n';
        
        if (err.duplicateBills && err.duplicateBills.length > 0) {
          errorMessage += `⚠️ Duplicate bill numbers found:\n${err.duplicateBills.join(', ')}\n\n`;
          errorMessage += 'These bills already exist for this contract. Please use different bill numbers or edit the existing bills.\n';
        }
        
        if (err.validationErrors && err.validationErrors.length > 0) {
          errorMessage += `\n❌ Validation errors:\n${err.validationErrors.join('\n')}`;
        }
        
        toast.error(errorMessage, { duration: 10000 }); // Show for 10 seconds
      } else {
        toast.error(err.message || 'Failed to create bills');
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <BackButton href="/bills" />
      </div>

      {/* Maintenance Mode Alert */}
      {isMaintenanceMode && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg mb-6">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-medium text-yellow-800">
                Bulk Billing Under Maintenance
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>
                  Bulk billing is currently unavailable due to system maintenance. 
                  Please try again later or contact your administrator for more information.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Indices Availability Indicator - Prominent display */}
      <div className="mb-6">
        <IndicesAvailabilityIndicator />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Create Multiple Bills</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Create multiple bills for the same contract at once
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div ref={errorRef} className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg flex items-start gap-2">
              <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Contract Selection */}
          <div className="space-y-2">
            <Label>Select Contract *</Label>
            <Select
              value={selectedContract?.id}
              onValueChange={(value) => {
                const contract = contracts.find((c) => c.id === value);
                setSelectedContract(contract || null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a contract" />
              </SelectTrigger>
              <SelectContent>
                {contracts.length > 0 ? (
                  contracts.map((contract) => (
                    <SelectItem key={contract.id} value={contract.id}>
                      {contract.agreementNo} - {contract.contractorName}
                    </SelectItem>
                  ))
                ) : (
                  <div className="px-2 py-1 text-sm text-muted-foreground">No contracts available</div>
                )}
              </SelectContent>
            </Select>
            {selectedContract && (
              <div className="text-sm text-muted-foreground mt-2 p-3 bg-muted rounded-lg">
                <p><strong>Work:</strong> {selectedContract.workDescription}</p>
                <p><strong>Base Month:</strong> {new Date(selectedContract.baseMonth).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'long', year: 'numeric' })}</p>
              </div>
            )}
          </div>

          {/* Bills Table */}
          {selectedContract && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-lg">Bills</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addBillRow}
                  disabled={isSaving}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Bill
                </Button>
              </div>

              {/* Display Processing Fee Info */}
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                <p className="text-sm text-blue-900">
                  <strong>Processing Fee:</strong> {processingFee} credits per bill (auto-deducted from system settings)
                </p>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-2 py-2 text-left text-xs font-medium sticky left-0 bg-muted z-10">#</th>
                        <th className="px-2 py-2 text-left text-xs font-medium">Bill No *</th>
                        <th className="px-2 py-2 text-left text-xs font-medium">Date *</th>
                        <th className="px-2 py-2 text-left text-xs font-medium">Zone *</th>
                        <th className="px-2 py-2 text-left text-xs font-medium">Fuel Basis</th>
                        <th className="px-2 py-2 text-left text-xs font-medium">Classifications *</th>
                        <th className="px-2 py-2 text-left text-xs font-medium">Bill Amount</th>
                        <th className="px-2 py-2 text-left text-xs font-medium">TMT Bars</th>
                        <th className="px-2 py-2 text-left text-xs font-medium">Angle/Channel</th>
                        <th className="px-2 py-2 text-left text-xs font-medium">MS Plates</th>
                        <th className="px-2 py-2 text-left text-xs font-medium">Other Steel</th>
                        <th className="px-2 py-2 text-left text-xs font-medium">Cement</th>
                        <th className="px-2 py-2 text-center text-xs font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {billRows.map((row, index) => (
                        <tr key={row.id} className="hover:bg-muted/50">
                          <td className="px-2 py-2 text-xs sticky left-0 bg-white">{index + 1}</td>
                          <td className="px-2 py-2">
                            <Input
                              type="text"
                              value={row.billNo}
                              onChange={(e) => updateBillRow(row.id, 'billNo', e.target.value)}
                              placeholder="B1"
                              disabled={isSaving}
                              className="w-24 h-8 text-xs"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <Input
                              type="date"
                              value={row.dateOfMeasurement}
                              onChange={(e) => updateBillRow(row.id, 'dateOfMeasurement', e.target.value)}
                              disabled={isSaving}
                              className="w-32 h-8 text-xs"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <Select
                              value={row.zone || undefined}
                              onValueChange={(value) => updateBillRow(row.id, 'zone', value)}
                              disabled={isSaving}
                            >
                              <SelectTrigger className="w-28 h-8 text-xs">
                                <SelectValue placeholder="Zone" />
                              </SelectTrigger>
                              <SelectContent>
                                {getRailwayZoneOptions().map(zone => (
                                  <SelectItem key={zone.value} value={zone.value} className="text-xs">
                                    {zone.value} ({zone.steelCity})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-2 py-2">
                            <Select
                              value={row.fuelPriceType || 'four_city_avg'}
                              onValueChange={(value) => updateBillRow(row.id, 'fuelPriceType', value)}
                              disabled={isSaving}
                            >
                              <SelectTrigger className="w-28 h-8 text-xs">
                                <SelectValue placeholder="Fuel" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="four_city_avg" className="text-xs">4-City Avg</SelectItem>
                                <SelectItem value="zone_city" className="text-xs">Zone City</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex flex-col gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => openClassificationDialog(row.id)}
                                disabled={isSaving}
                                className="h-7 text-xs"
                              >
                                <Edit className="h-3 w-3 mr-1" />
                                {row.classificationEntries.length > 0 
                                  ? `${row.classificationEntries.length} item${row.classificationEntries.length > 1 ? 's' : ''}`
                                  : 'Add Classifications'
                                }
                              </Button>
                              {row.classificationEntries.length > 0 && (
                                <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                                  {row.classificationEntries.map(e => {
                                    const sub = classificationGroups
                                      .flatMap(g => g.subClassifications)
                                      .find(s => s.id === e.subClassificationId);
                                    return sub?.code || '';
                                  }).filter(Boolean).join(', ')}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <div className="text-xs font-medium">
                              ₹{row.classificationEntries.reduce((sum, entry) => {
                                const amount = entry.amount === '' || entry.amount === null || entry.amount === undefined 
                                  ? 0 
                                  : typeof entry.amount === 'string' 
                                    ? parseFloat(entry.amount) || 0 
                                    : entry.amount;
                                return sum + amount;
                              }, 0).toLocaleString('en-IN', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })}
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <Input
                              type="number"
                              value={row.steelTmtBarsAmount || ''}
                              onChange={(e) => updateBillRow(row.id, 'steelTmtBarsAmount', parseFloat(e.target.value) || 0)}
                              placeholder="0"
                              disabled={isSaving}
                              className="w-24 h-8 text-xs"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <Input
                              type="number"
                              value={row.steelAngleChannelAmount || ''}
                              onChange={(e) => updateBillRow(row.id, 'steelAngleChannelAmount', parseFloat(e.target.value) || 0)}
                              placeholder="0"
                              disabled={isSaving}
                              className="w-24 h-8 text-xs"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <Input
                              type="number"
                              value={row.steelPlatesAmount || ''}
                              onChange={(e) => updateBillRow(row.id, 'steelPlatesAmount', parseFloat(e.target.value) || 0)}
                              placeholder="0"
                              disabled={isSaving}
                              className="w-24 h-8 text-xs"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <Input
                              type="number"
                              value={row.steelOtherSectionsAmount || ''}
                              onChange={(e) => updateBillRow(row.id, 'steelOtherSectionsAmount', parseFloat(e.target.value) || 0)}
                              placeholder="0"
                              disabled={isSaving}
                              className="w-24 h-8 text-xs"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <Input
                              type="number"
                              value={row.cementAmount || ''}
                              onChange={(e) => updateBillRow(row.id, 'cementAmount', parseFloat(e.target.value) || 0)}
                              placeholder="0"
                              disabled={isSaving}
                              className="w-24 h-8 text-xs"
                            />
                          </td>
                          <td className="px-2 py-2 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeBillRow(row.id)}
                              disabled={isSaving || billRows.length === 1}
                              className="text-destructive hover:text-destructive h-7 w-7 p-0"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Total Bills: <Badge variant="secondary">{billRows.length}</Badge>
                </div>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.back()}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <>
                        <LoadingSpinner className="mr-2" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Create {billRows.length} Bill{billRows.length > 1 ? 's' : ''}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Insufficient Credit Dialog */}
      <InsufficientCreditDialog
        open={showInsufficientCredit}
        onClose={() => setShowInsufficientCredit(false)}
        currentBalance={creditInfo.currentBalance}
        requiredAmount={creditInfo.requiredAmount}
        shortfall={creditInfo.shortfall}
      />

      {/* Classification Management Dialog */}
      <Dialog open={showClassificationDialog} onOpenChange={setShowClassificationDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Bill Classifications</DialogTitle>
            <DialogDescription>
              {editingBillId && getEditingBill() && (
                <>Bill: {getEditingBill()?.billNo || 'New Bill'}</>
              )}
            </DialogDescription>
          </DialogHeader>
          {editingBillId && getEditingBill() && (
            <BillClassificationEntries
              value={getEditingBill()!.classificationEntries}
              onChange={(entries) => updateClassificationEntries(editingBillId, entries)}
              classificationGroups={classificationGroups}
              workDescription={selectedContract?.workDescription}
              contractId={selectedContract?.id}
              measurementDate={getEditingBill()?.dateOfMeasurement || undefined}
            />
          )}
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setShowClassificationDialog(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
