
'use client';

import { ChangeEvent, useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Plus, Trash2, Save, AlertCircle, Edit, Upload, Download } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { InsufficientCreditDialog } from '@/components/ui/insufficient-credit-dialog';
import { BackButton } from '@/components/ui/back-button';
import { BillClassificationEntries } from '@/components/bill-classification-entries';
import { getRailwayZoneOptions } from '@/lib/zone-steel-city-mapping';

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
  amount: number | string | '';
  description?: string;
  steelTypes?: string[];
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
}

export default function BulkBillCreationPage() {
  const router = useRouter();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [classificationGroups, setClassificationGroups] = useState<ClassificationGroup[]>([]);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [processingFee, setProcessingFee] = useState<number>(0);

  // Global zone and fuel — selected once for all bills
  const [globalZone, setGlobalZone] = useState<string>('');
  const [globalFuelPriceType, setGlobalFuelPriceType] = useState<string>('four_city_avg');

  const [billRows, setBillRows] = useState<BillRow[]>([
    {
      id: Math.random().toString(36).substr(2, 9),
      billNo: '',
      dateOfMeasurement: '',
      classificationEntries: [],
    },
  ]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);

  const errorRef = useRef<HTMLDivElement>(null);

  const [showInsufficientCredit, setShowInsufficientCredit] = useState(false);
  const [creditInfo, setCreditInfo] = useState({ currentBalance: 0, requiredAmount: 0, shortfall: 0 });

  const [showClassificationDialog, setShowClassificationDialog] = useState(false);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadInitialData(); }, []);

  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [error]);

  const loadInitialData = async () => {
    try {
      setIsLoading(true);
      setError('');

      try {
        const maintenanceRes = await fetch('/api/settings/maintenance-status');
        if (maintenanceRes.ok) {
          const maintenanceData = await maintenanceRes.json();
          if (maintenanceData.maintenanceStatus?.bulkBillingMaintenance) {
            setIsMaintenanceMode(true);
            toast.error('Bulk billing is currently under maintenance. Please try again later.');
            setTimeout(() => router.push('/bills'), 2000);
            return;
          }
        }
      } catch (err) {
        console.error('Error checking maintenance mode:', err);
      }

      const contractsRes = await fetch('/api/contracts');
      if (!contractsRes.ok) throw new Error('Failed to load contracts');
      setContracts(await contractsRes.json());

      const classificationsRes = await fetch('/api/classification-groups');
      if (!classificationsRes.ok) throw new Error('Failed to load classifications');
      const classificationsData = await classificationsRes.json();
      const groupsArray = classificationsData.groups || classificationsData;
      setClassificationGroups(Array.isArray(groupsArray) ? groupsArray : []);

      try {
        const feeRes = await fetch('/api/user/processing-fee');
        if (feeRes.ok) {
          const feeData = await feeRes.json();
          setProcessingFee(feeData.processingFee || 0);
        } else {
          const settingsRes = await fetch('/api/admin/settings');
          if (settingsRes.ok) {
            const settings = await settingsRes.json();
            const billProcessingCost = settings.find((s: any) => s.key === 'BILL_PROCESSING_COST');
            if (billProcessingCost) setProcessingFee(parseFloat(billProcessingCost.value) || 10);
          }
        }
      } catch {
        setProcessingFee(10);
      }

      setIsLoading(false);
    } catch (err: any) {
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
      },
    ]);
  };

  const removeBillRow = (id: string) => {
    if (billRows.length === 1) { toast.error('At least one bill is required'); return; }
    setBillRows(billRows.filter((row) => row.id !== id));
  };

  const updateBillRow = (id: string, field: keyof BillRow, value: any) => {
    setBillRows((prev) => prev.map((row) => row.id === id ? { ...row, [field]: value } : row));
  };

  const parseAmount = (value: number | string | null | undefined): number => {
    if (value === '' || value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const parsed = parseFloat(value.replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const getClassificationTotal = (row: BillRow): number =>
    row.classificationEntries.reduce((sum, entry) => sum + parseAmount(entry.amount), 0);

  const formatAmount = (amount: number): string =>
    amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const findSubClassification = (rawValue: unknown): SubClassification | undefined => {
    const value = String(rawValue || '').trim().toLowerCase();
    if (!value) return undefined;
    const allSubs = classificationGroups.flatMap(g => g.subClassifications);
    return allSubs.find(sub =>
      sub.id.toLowerCase() === value ||
      sub.code.toLowerCase() === value ||
      sub.name.toLowerCase() === value ||
      `${sub.code} ${sub.name}`.toLowerCase() === value
    );
  };

  const getImportValue = (row: Record<string, any>, keys: string[]): any => {
    const normalizedEntries = Object.entries(row).map(([k, v]) => [
      k.trim().toLowerCase().replace(/[\s_-]/g, ''), v
    ]);
    for (const key of keys) {
      const nk = key.toLowerCase().replace(/[\s_-]/g, '');
      const match = normalizedEntries.find(([ek]) => ek === nk);
      if (match) return match[1];
    }
    return undefined;
  };

  const normalizeImportedDate = (value: unknown): string => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === 'number' && Number.isFinite(value)) {
      return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
    }
    return String(value || '').trim();
  };

  const downloadTemplate = () => {
    const headers = ['billNo', 'measurementDate', 'classificationCode', 'classificationAmount', 'description', 'itemNumber', 'quantity', 'agreementRate'];
    const rows = [
      ['B1', '2026-04-15', 'CIVIL', '300000', 'Earthwork', '1', '10', '30000'],
      ['B1', '2026-04-15', 'CONCRETE', '400000', 'Concrete work', '2', '20', '20000'],
      ['B1', '2026-04-15', 'STEEL', '300000', 'Steel work', '3', '15', '20000'],
      ['B2', '2026-04-20', 'CIVIL', '200000', 'Earthwork', '1', '', ''],
      ['B2', '2026-04-20', 'TRACK', '600000', 'Track work', '2', '', ''],
    ];
    const csvContent = [headers, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'bulk_bill_template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (classificationGroups.length === 0) {
      toast.error('Classifications are still loading. Please try again in a moment.');
      return;
    }
    try {
      const XLSX = await import('xlsx');
      const fileName = file.name.toLowerCase();
      const workbook = fileName.endsWith('.csv')
        ? XLSX.read(await file.text(), { type: 'string' })
        : XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const importedRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

      if (importedRows.length === 0) { toast.error('Import file has no rows'); return; }

      const grouped = new Map<string, BillRow>();
      const errors: string[] = [];

      importedRows.forEach((importRow, index) => {
        const rowNumber = index + 2;
        const billNo = String(getImportValue(importRow, ['billNo', 'bill number', 'bill']) || '').trim();
        const measurementDate = normalizeImportedDate(getImportValue(importRow, ['measurementDate', 'dateOfMeasurement', 'date']));
        const classificationValue = getImportValue(importRow, ['subClassificationId', 'classificationCode', 'subClassificationCode', 'classificationName', 'classification']);
        const subClassification = findSubClassification(classificationValue);
        const classificationAmount = parseAmount(getImportValue(importRow, ['classificationAmount', 'classAmount', 'entryAmount']));

        if (!billNo) errors.push(`Row ${rowNumber}: billNo is required`);
        if (!measurementDate) errors.push(`Row ${rowNumber}: measurementDate is required`);
        if (!subClassification) errors.push(`Row ${rowNumber}: classification not found (${classificationValue || 'blank'})`);
        if (classificationAmount <= 0) errors.push(`Row ${rowNumber}: classificationAmount must be greater than 0`);
        if (!billNo || !measurementDate || !subClassification || classificationAmount <= 0) return;

        const existing = grouped.get(billNo);
        const nextRow: BillRow = existing || {
          id: Math.random().toString(36).substr(2, 9),
          billNo,
          dateOfMeasurement: measurementDate,
          classificationEntries: [],
        };

        if (!existing) grouped.set(billNo, nextRow);

        nextRow.classificationEntries.push({
          subClassificationId: subClassification.id,
          subClassification,
          amount: classificationAmount,
          description: String(getImportValue(importRow, ['description', 'remarks']) || ''),
          itemNumber: String(getImportValue(importRow, ['itemNumber', 'itemNo']) || ''),
          quantity: parseAmount(getImportValue(importRow, ['quantity', 'qty'])) || '',
          agreementRate: parseAmount(getImportValue(importRow, ['agreementRate', 'rate'])) || '',
        });
      });

      if (errors.length > 0) {
        toast.error(`Import has errors:\n${errors.slice(0, 8).join('\n')}${errors.length > 8 ? `\n...and ${errors.length - 8} more` : ''}`, { duration: 10000 });
        return;
      }

      const importedBills = Array.from(grouped.values());
      if (importedBills.length === 0) { toast.error('No valid bills found in import file'); return; }

      setBillRows(importedBills);
      toast.success(`Imported ${importedBills.length} bills with ${importedRows.length} classification rows`);
    } catch (err) {
      console.error('Bulk bill import failed:', err);
      toast.error('Failed to import file. Please check the template format.');
    }
  };

  const openClassificationDialog = (billId: string) => {
    setEditingBillId(billId);
    setShowClassificationDialog(true);
  };

  const updateClassificationEntries = (billId: string, entries: ClassificationEntry[]) => {
    setBillRows((prev) => prev.map((row) => row.id === billId ? { ...row, classificationEntries: entries } : row));
  };

  const getEditingBill = () => billRows.find(row => row.id === editingBillId);

  const validateBills = (): string | null => {
    if (!selectedContract) return 'Please select a contract';
    if (!globalZone) return 'Please select a Railway Zone';

    for (let i = 0; i < billRows.length; i++) {
      const row = billRows[i];
      if (!row.billNo.trim()) return `Bill ${i + 1}: Bill number is required`;
      if (!row.dateOfMeasurement) return `Bill ${i + 1}: Date of measurement is required`;
      if (!row.classificationEntries || row.classificationEntries.length === 0) return `Bill ${i + 1}: At least one classification entry is required`;

      const classificationTotal = getClassificationTotal(row);
      if (classificationTotal <= 0) return `Bill ${i + 1}: Classification total must be greater than 0`;

      for (let j = 0; j < row.classificationEntries.length; j++) {
        const entry = row.classificationEntries[j];
        if (!entry.subClassificationId) return `Bill ${i + 1}: Classification ${j + 1} must have a sub-classification`;
        const numAmount = entry.amount === '' || entry.amount === null || entry.amount === undefined
          ? 0 : typeof entry.amount === 'string' ? parseFloat(entry.amount) || 0 : entry.amount;
        if (numAmount < 0) return `Bill ${i + 1}: Classification ${j + 1} amount must be zero or greater`;
      }
    }

    const billNos = billRows.map((r) => r.billNo.trim());
    const duplicates = billNos.filter((item, index) => billNos.indexOf(item) !== index);
    if (duplicates.length > 0) return `Duplicate bill numbers found: ${duplicates.join(', ')}`;

    return null;
  };

  const handleSubmit = async () => {
    const validationError = validateBills();
    if (validationError) { toast.error(validationError); return; }

    try {
      setIsSaving(true);

      const payload = {
        contractId: selectedContract!.id,
        bills: billRows.map((row) => {
          const classificationTotal = getClassificationTotal(row);
          return {
            billNo: row.billNo.trim(),
            dateOfMeasurement: row.dateOfMeasurement,
            zone: globalZone,
            fuelPriceType: globalFuelPriceType || 'four_city_avg',
            grossBillAmount: classificationTotal,
            billAmount: classificationTotal,
            steelTmtBarsAmount: 0,
            steelAngleChannelAmount: 0,
            steelPlatesAmount: 0,
            steelOtherSectionsAmount: 0,
            cementAmount: 0,
            classificationEntries: row.classificationEntries.map(entry => ({
              subClassificationId: entry.subClassificationId,
              amount: entry.amount === '' || entry.amount === null || entry.amount === undefined
                ? 0 : typeof entry.amount === 'string' ? parseFloat(entry.amount) || 0 : entry.amount,
              description: entry.description || '',
              steelTypes: entry.steelTypes || [],
              itemNumber: entry.itemNumber || null,
              quantity: entry.quantity === '' || entry.quantity === null || entry.quantity === undefined ? null : parseFloat(String(entry.quantity)) || null,
              agreementRate: entry.agreementRate === '' || entry.agreementRate === null || entry.agreementRate === undefined ? null : parseFloat(String(entry.agreementRate)) || null,
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
        const error: any = new Error(errorData.error || 'Failed to create bills');
        error.duplicateBills = errorData.duplicateBills;
        error.validationErrors = errorData.validationErrors;
        error.details = errorData.details;
        throw error;
      }

      const result = await response.json();

      if (result.creditInfo) {
        const { cost, remainingBalance } = result.creditInfo;
        if (remainingBalance === -1) {
          toast.success(`Successfully created ${result.count} bills! (Free Account)`);
        } else {
          toast.success(`Successfully created ${result.count} bills!\n${cost} credits deducted. Remaining balance: ${remainingBalance} credits`);
        }
      } else {
        toast.success(`Successfully created ${result.count} bills!`);
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      router.push(`/bills?contractId=${selectedContract!.id}&refresh=${Date.now()}`);
    } catch (err: any) {
      const errorMessage = err.message || '';
      if (errorMessage.includes('Insufficient balance') || errorMessage.includes('insufficient credit')) {
        const requiredMatch = errorMessage.match(/Required:\s*₹?([\d,]+\.?\d*)/);
        const availableMatch = errorMessage.match(/Available:\s*₹?([\d,]+\.?\d*)/);
        if (requiredMatch && availableMatch) {
          const required = parseFloat(requiredMatch[1].replace(/,/g, ''));
          const available = parseFloat(availableMatch[1].replace(/,/g, ''));
          setCreditInfo({ currentBalance: available, requiredAmount: required, shortfall: required - available });
          setShowInsufficientCredit(true);
          setIsSaving(false);
          return;
        }
      }
      if (err.duplicateBills || err.validationErrors) {
        let msg = 'Failed to create bills:\n\n';
        if (err.duplicateBills?.length > 0) msg += `⚠️ Duplicate bill numbers found:\n${err.duplicateBills.join(', ')}\n\n`;
        if (err.validationErrors?.length > 0) msg += `\n❌ Validation errors:\n${err.validationErrors.join('\n')}`;
        toast.error(msg, { duration: 10000 });
      } else {
        toast.error(err.message || 'Failed to create bills');
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <div className="container mx-auto p-6"><LoadingSpinner /></div>;

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6"><BackButton href="/bills" /></div>

      {isMaintenanceMode && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg mb-6">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-medium text-yellow-800">Bulk Billing Under Maintenance</h3>
              <p className="mt-2 text-sm text-yellow-700">
                Bulk billing is currently unavailable due to system maintenance. Please try again later.
              </p>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Create Multiple Bills</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">Create multiple bills for the same contract at once</p>
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
            <Select value={selectedContract?.id} onValueChange={(value) => setSelectedContract(contracts.find(c => c.id === value) || null)}>
              <SelectTrigger><SelectValue placeholder="Select a contract" /></SelectTrigger>
              <SelectContent>
                {contracts.length > 0 ? (
                  contracts.map(contract => (
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

          {/* Global Zone & Fuel — selected once for all bills */}
          {selectedContract && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg border">
              <div className="space-y-2">
                <Label>Railway Zone * <span className="text-xs text-muted-foreground">(applies to all bills)</span></Label>
                <Select value={globalZone || undefined} onValueChange={setGlobalZone} disabled={isSaving}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select zone" />
                  </SelectTrigger>
                  <SelectContent>
                    {getRailwayZoneOptions().map(zone => (
                      <SelectItem key={zone.value} value={zone.value}>
                        {zone.value} ({zone.steelCity})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Fuel Basis <span className="text-xs text-muted-foreground">(applies to all bills)</span></Label>
                <Select value={globalFuelPriceType} onValueChange={setGlobalFuelPriceType} disabled={isSaving}>
                  <SelectTrigger>
                    <SelectValue placeholder="Fuel basis" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="four_city_avg">4-City Average</SelectItem>
                    <SelectItem value="zone_city">Zone City</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Bills Table */}
          {selectedContract && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-lg">Bills</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <input ref={importInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImportFile} />
                  <Button type="button" variant="outline" size="sm" onClick={downloadTemplate} disabled={isSaving}>
                    <Download className="h-4 w-4 mr-2" />Template
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => importInputRef.current?.click()} disabled={isSaving}>
                    <Upload className="h-4 w-4 mr-2" />Import Excel
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={addBillRow} disabled={isSaving}>
                    <Plus className="h-4 w-4 mr-2" />Add Bill
                  </Button>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                <p className="text-sm text-blue-900">
                  <strong>Processing Fee:</strong> {processingFee} credits per bill (auto-deducted)
                </p>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-2 py-2 text-left text-xs font-medium sticky left-0 bg-muted z-10">#</th>
                        <th className="px-2 py-2 text-left text-xs font-medium">Bill No *</th>
                        <th className="px-2 py-2 text-left text-xs font-medium">Date of Measurement *</th>
                        <th className="px-2 py-2 text-left text-xs font-medium">Classifications *</th>
                        <th className="px-2 py-2 text-left text-xs font-medium">Class Total</th>
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
                              className="w-36 h-8 text-xs"
                            />
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
                                  : 'Add Classifications'}
                              </Button>
                              {row.classificationEntries.length > 0 && (
                                <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                                  {row.classificationEntries.map(e => {
                                    const sub = classificationGroups.flatMap(g => g.subClassifications).find(s => s.id === e.subClassificationId);
                                    return sub?.code || '';
                                  }).filter(Boolean).join(', ')}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <div className="text-xs font-medium">
                              ₹{formatAmount(getClassificationTotal(row))}
                            </div>
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
                  <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSaving}>Cancel</Button>
                  <Button onClick={handleSubmit} disabled={isSaving}>
                    {isSaving ? (
                      <><LoadingSpinner className="mr-2" />Creating...</>
                    ) : (
                      <><Save className="h-4 w-4 mr-2" />Create {billRows.length} Bill{billRows.length > 1 ? 's' : ''}</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <InsufficientCreditDialog
        open={showInsufficientCredit}
        onClose={() => setShowInsufficientCredit(false)}
        currentBalance={creditInfo.currentBalance}
        requiredAmount={creditInfo.requiredAmount}
        shortfall={creditInfo.shortfall}
      />

      <Dialog open={showClassificationDialog} onOpenChange={setShowClassificationDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Bill Classifications</DialogTitle>
            <DialogDescription>
              {editingBillId && getEditingBill() && <>Bill: {getEditingBill()?.billNo || 'New Bill'}</>}
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
            <Button variant="outline" onClick={() => setShowClassificationDialog(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
