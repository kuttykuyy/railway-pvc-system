
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Plus,
  Trash2,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Info,
  Loader2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { BillAmountCalculator } from './bill-amount-calculator';
import { ClassificationComparisonDialog } from './classification-comparison-dialog';

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
  itemNumber?: string;     // Legacy single item (backward compat)
  quantity?: number | string | '';   // Legacy single qty
  agreementRate?: number | string | ''; // Legacy single rate
  itemRows?: ItemRow[];    // Multiple item rows
}

interface BillClassificationEntriesProps {
  value: ClassificationEntry[];
  onChange: (entries: ClassificationEntry[]) => void;
  classificationGroups: ClassificationGroup[];
  workDescription?: string;
  grossBillAmount?: number;
  contractSchedules?: string[];
  indicesData?: { base: { [key: string]: number }; current: { [key: string]: number } } | null;
  contractId?: string;
  measurementDate?: string;
}

export function BillClassificationEntries({
  value = [],
  onChange,
  classificationGroups = [],
  workDescription,
  grossBillAmount,
  contractSchedules = [],
  indicesData = null,
  contractId,
  measurementDate
}: BillClassificationEntriesProps) {
  const [entries, setEntries] = useState<ClassificationEntry[]>(value);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [showAIResults, setShowAIResults] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any>(null);
  const [aiSuggestingEntry, setAiSuggestingEntry] = useState<number | null>(null);

  useEffect(() => {
    setEntries(value);
  }, [value]);

  // Helper: ensure entry has itemRows (migrate from legacy single fields)
  const ensureItemRows = (entry: ClassificationEntry): ItemRow[] => {
    if (entry.itemRows && entry.itemRows.length > 0) return entry.itemRows;
    // Migrate legacy single item to itemRows
    if (entry.itemNumber || entry.quantity || entry.agreementRate) {
      return [{ itemNumber: entry.itemNumber || '', quantity: entry.quantity ?? '', agreementRate: entry.agreementRate ?? '' }];
    }
    return [{ itemNumber: '', quantity: '', agreementRate: '' }];
  };

  // Helper: compute total amount from itemRows
  const computeItemRowsTotal = (rows: ItemRow[]): number => {
    let total = 0;
    for (const row of rows) {
      const qty = parseFloat(String(row.quantity)) || 0;
      const rate = parseFloat(String(row.agreementRate)) || 0;
      total += qty * rate;
    }
    return Math.round(total * 100) / 100;
  };

  const addEntry = () => {
    const newEntry: ClassificationEntry = {
      subClassificationId: '',
      amount: 0,
      description: '',
      itemRows: [{ itemNumber: '', quantity: '', agreementRate: '' }],
    };
    const newEntries = [...entries, newEntry];
    setEntries(newEntries);
    onChange(newEntries);
  };

  const removeEntry = (index: number) => {
    const newEntries = entries.filter((_, i) => i !== index);
    setEntries(newEntries);
    onChange(newEntries);
  };

  const addItemRow = (entryIndex: number) => {
    const newEntries = [...entries];
    const rows = ensureItemRows(newEntries[entryIndex]);
    rows.push({ itemNumber: '', quantity: '', agreementRate: '' });
    newEntries[entryIndex] = { ...newEntries[entryIndex], itemRows: rows };
    setEntries(newEntries);
    onChange(newEntries);
  };

  const removeItemRow = (entryIndex: number, rowIndex: number) => {
    const newEntries = [...entries];
    const rows = ensureItemRows(newEntries[entryIndex]).filter((_, i) => i !== rowIndex);
    if (rows.length === 0) rows.push({ itemNumber: '', quantity: '', agreementRate: '' });
    newEntries[entryIndex] = { ...newEntries[entryIndex], itemRows: rows };
    // Recalculate amount
    const total = computeItemRowsTotal(rows);
    if (total > 0) newEntries[entryIndex].amount = total;
    // Sync legacy fields from first row
    newEntries[entryIndex].itemNumber = rows[0]?.itemNumber || '';
    newEntries[entryIndex].quantity = rows[0]?.quantity ?? '';
    newEntries[entryIndex].agreementRate = rows[0]?.agreementRate ?? '';
    setEntries(newEntries);
    onChange(newEntries);
  };

  const updateItemRow = (entryIndex: number, rowIndex: number, field: keyof ItemRow, value: any) => {
    const newEntries = [...entries];
    const rows = [...ensureItemRows(newEntries[entryIndex])];
    rows[rowIndex] = { ...rows[rowIndex], [field]: value };
    newEntries[entryIndex] = { ...newEntries[entryIndex], itemRows: rows };
    // Auto-calculate total amount from all rows
    const total = computeItemRowsTotal(rows);
    if (total > 0) {
      newEntries[entryIndex].amount = total;
    }
    // Keep legacy fields in sync with first row for backward compatibility
    newEntries[entryIndex].itemNumber = rows[0]?.itemNumber || '';
    newEntries[entryIndex].quantity = rows[0]?.quantity ?? '';
    newEntries[entryIndex].agreementRate = rows[0]?.agreementRate ?? '';
    setEntries(newEntries);
    onChange(newEntries);
  };

  const updateEntry = (index: number, field: keyof ClassificationEntry, value: any) => {
    const newEntries = [...entries];
    newEntries[index] = { ...newEntries[index], [field]: value };
    
    // If sub-classification changed, update reference
    if (field === 'subClassificationId') {
      const subClass = classificationGroups
        .flatMap(g => g.subClassifications)
        .find(s => s.id === value);
      newEntries[index].subClassification = subClass;
    }
    
    setEntries(newEntries);
    onChange(newEntries);
  };

  const getAISuggestions = async () => {
    if (!workDescription || workDescription.trim().length < 10) {
      toast.error('Please enter a detailed work description (at least 10 characters)');
      return;
    }

    setIsLoadingAI(true);
    setShowAIResults(false);

    try {
      const response = await fetch('/api/ai/suggest-classifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workDescription }),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI suggestions');
      }

      const data = await response.json();
      setAiSuggestions(data);
      setShowAIResults(true);
      toast.success('AI suggestions received!');
    } catch (error) {
      console.error('Error getting AI suggestions:', error);
      toast.error('Failed to get AI suggestions. Please try again.');
    } finally {
      setIsLoadingAI(false);
    }
  };

  const getAISuggestionForEntry = async (entryIndex: number) => {
    const entry = entries[entryIndex];
    const scheduleText = entry.scheduleItem || '';
    // Use schedule text combined with work description for context
    const textForAI = scheduleText
      ? `Schedule: ${scheduleText}${workDescription ? `. Contract work: ${workDescription}` : ''}`
      : workDescription || '';

    if (!textForAI || textForAI.trim().length < 10) {
      toast.error('Select a schedule or ensure work description is available');
      return;
    }

    setAiSuggestingEntry(entryIndex);
    try {
      const response = await fetch('/api/ai/suggest-classifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workDescription: textForAI }),
      });

      if (!response.ok) throw new Error('Failed to get AI suggestions');
      const data = await response.json();
      const topSuggestion = data.suggestions?.[0];

      if (topSuggestion) {
        // Find sub-classification by code
        for (const group of classificationGroups) {
          const subClass = group.subClassifications.find(s => s.code === topSuggestion.code);
          if (subClass) {
            updateEntry(entryIndex, 'subClassificationId', subClass.id);
            toast.success(`AI suggested: ${subClass.code} - ${subClass.name} (${Math.round(topSuggestion.confidence * 100)}% confidence)`);
            return;
          }
        }
        toast.error('AI suggestion not found in available classifications');
      } else {
        toast.error('No AI suggestions received');
      }
    } catch (error) {
      console.error('Error getting AI suggestion for entry:', error);
      toast.error('Failed to get AI suggestion');
    } finally {
      setAiSuggestingEntry(null);
    }
  };

  const applyAISuggestion = (suggestion: any) => {
    // Find sub-classification by code across all groups
    for (const group of classificationGroups) {
      const subClass = group.subClassifications.find(s => s.code === suggestion.code);
      if (subClass) {
        const newEntry: ClassificationEntry = {
          subClassificationId: subClass.id,
          subClassification: subClass,
          amount: 0,
          description: suggestion.reasoning
        };

        setEntries([...entries, newEntry]);
        toast.success(`Added ${subClass.name}`);
        return;
      }
    }
    toast.error('Classification not found');
  };

  // Calculate total amount, treating blank/undefined/null as 0
  const totalAmount = entries.reduce((sum, entry) => {
    const amount = entry.amount === '' || entry.amount === null || entry.amount === undefined 
      ? 0 
      : parseFloat(entry.amount?.toString() || '0') || 0;
    return sum + amount;
  }, 0);
  const amountDifference = grossBillAmount ? totalAmount - grossBillAmount : 0;
  const isAmountValid = grossBillAmount ? Math.abs(amountDifference) < 0.01 : true;

  return (
    <div className="space-y-6">
      {/* Header with AI Suggestion Button */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Work Classifications
                <Badge variant="outline" className="ml-2">
                  {entries.length} {entries.length === 1 ? 'Entry' : 'Entries'}
                </Badge>
              </CardTitle>
              <CardDescription className="mt-2">
                Add work classifications with their amounts (optional). If provided, the sum should match the gross bill amount.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={getAISuggestions}
              disabled={isLoadingAI || !workDescription}
              className="ml-4"
            >
              {isLoadingAI ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Getting AI Suggestions...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  AI Suggest
                </>
              )}
            </Button>
          </div>
        </CardHeader>

        {/* Amount Summary */}
        <CardContent>
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Total Classification Amount:</span>
              <span className="font-semibold">₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            {grossBillAmount && (
              <>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Gross Bill Amount:</span>
                  <span className="font-semibold">₹{grossBillAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-sm font-medium">Difference:</span>
                  <div className="flex items-center gap-2">
                    {isAmountValid ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-orange-600" />
                    )}
                    <span className={`font-semibold ${isAmountValid ? 'text-green-600' : 'text-orange-600'}`}>
                      ₹{Math.abs(amountDifference).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
                {!isAmountValid && (
                  <div className="flex items-start gap-2 text-xs text-orange-600 mt-2">
                    <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span>
                      {amountDifference > 0 
                        ? 'Total classification amount exceeds gross bill amount' 
                        : 'Total classification amount is less than gross bill amount'}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* AI Suggestions */}
      {showAIResults && aiSuggestions && (
        <Card className="border-purple-200 bg-purple-50/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              AI Suggestions
            </CardTitle>
            {aiSuggestions.notes && (
              <CardDescription>{aiSuggestions.notes}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {aiSuggestions.suggestions?.map((suggestion: any, idx: number) => (
              <Card key={idx} className="border-purple-200">
                <CardContent className="pt-4">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-purple-900">
                          {suggestion.mainClassification}. {suggestion.mainName}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {Math.round(suggestion.confidence * 100)}% confidence
                        </Badge>
                      </div>
                      {suggestion.subClassifications && suggestion.subClassifications.length > 0 && (
                        <div className="text-sm text-muted-foreground mt-2">
                          <span className="font-medium">Sub-classifications:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {suggestion.subClassifications.map((sub: any, subIdx: number) => (
                              <Badge key={subIdx} variant="outline" className="text-xs">
                                {sub.code}: {sub.name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      <p className="text-sm text-muted-foreground mt-2">{suggestion.reasoning}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => applyAISuggestion(suggestion)}
                      className="ml-4"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Classification Entries */}
      <div className="space-y-4">
        {entries.map((entry, index) => {
          const selectedSubClass = classificationGroups
            .flatMap(g => g.subClassifications)
            .find(s => s.id === entry.subClassificationId);
          
          const selectedGroup = selectedSubClass 
            ? classificationGroups.find(g => g.id === selectedSubClass.groupId)
            : null;

          return (
            <Card key={index} className="border-gray-200">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {/* Header with remove button */}
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-gray-900">Entry #{index + 1}</h4>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeEntry(index)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Schedule Dropdown (shown first so AI can use it for classification suggestion) */}
                  {contractSchedules.length > 0 && (
                    <div className="space-y-2">
                      <Label htmlFor={`schedule-${index}`}>Schedule</Label>
                      <Select
                        value={entry.scheduleItem || '_none_'}
                        onValueChange={(val) => updateEntry(index, 'scheduleItem', val === '_none_' ? '' : val)}
                      >
                        <SelectTrigger id={`schedule-${index}`}>
                          <SelectValue placeholder="Select schedule" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none_">— None —</SelectItem>
                          {contractSchedules.map((s, i) => (
                            <SelectItem key={i} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Main Classification Group Dropdown */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`group-${index}`}>Main Classification</Label>
                      {(entry.scheduleItem || workDescription) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => getAISuggestionForEntry(index)}
                          disabled={aiSuggestingEntry === index}
                          className="h-6 px-2 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                        >
                          {aiSuggestingEntry === index ? (
                            <>
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              Suggesting...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-3 w-3 mr-1" />
                              AI Suggest
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                    <Select
                      value={selectedGroup?.id || ''}
                      onValueChange={(groupId) => {
                        const group = classificationGroups.find(g => g.id === groupId);
                        if (group && group.subClassifications.length > 0) {
                          // Auto-select first sub-classification in the group
                          const firstSub = group.subClassifications[0];
                          updateEntry(index, 'subClassificationId', firstSub.id);
                        }
                      }}
                    >
                      <SelectTrigger id={`group-${index}`}>
                        <SelectValue placeholder="Select main classification" />
                      </SelectTrigger>
                      <SelectContent>
                        {classificationGroups.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.code} - {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Sub-Classification Dropdown */}
                  {selectedGroup && (
                    <div className="space-y-2">
                      <Label htmlFor={`sub-${index}`}>Sub-Classification</Label>
                      <Select
                        value={entry.subClassificationId || ''}
                        onValueChange={(value) => updateEntry(index, 'subClassificationId', value)}
                      >
                        <SelectTrigger id={`sub-${index}`}>
                          <SelectValue placeholder="Select sub-classification" />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedGroup.subClassifications.map((sub) => (
                            <SelectItem key={sub.id} value={sub.id}>
                              {sub.code} - {sub.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Steel Types Multi-Select (only show when steel component > 0) */}
                  {selectedSubClass && selectedSubClass.steel > 0 && (
                    <div className="space-y-2">
                      <Label>
                        Steel Types
                        <Badge variant="secondary" className="ml-2">
                          {selectedSubClass.steel}% Steel
                        </Badge>
                      </Label>
                      <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                        <p className="text-xs text-muted-foreground mb-2">
                          Select one or more steel types. If multiple are selected, average index will be used.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {[
                            { value: 'TMT', label: 'TMT (Index M)', description: 'Thermo-Mechanically Treated Bars' },
                            { value: 'ANGLE_CHANNEL', label: 'Angle/Channel (Index N)', description: 'Structural Steel Sections' },
                            { value: 'PLATES', label: 'Plates (Index O)', description: 'Steel Plates' },
                            { value: 'OTHER_SECTIONS', label: 'Other Sections (Index P)', description: 'Other Steel Sections' }
                          ].map((steelType) => (
                            <div key={steelType.value} className="flex items-start space-x-3 bg-white p-3 rounded-md border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-colors">
                              <Checkbox
                                id={`steel-${index}-${steelType.value}`}
                                checked={(entry.steelTypes || []).includes(steelType.value)}
                                onCheckedChange={(checked) => {
                                  const currentSteelTypes = entry.steelTypes || [];
                                  let newSteelTypes: string[];
                                  
                                  if (checked) {
                                    newSteelTypes = [...currentSteelTypes, steelType.value];
                                  } else {
                                    newSteelTypes = currentSteelTypes.filter(t => t !== steelType.value);
                                  }
                                  
                                  updateEntry(index, 'steelTypes', newSteelTypes);
                                }}
                                className="mt-0.5"
                              />
                              <div className="flex-1">
                                <Label
                                  htmlFor={`steel-${index}-${steelType.value}`}
                                  className="text-sm font-medium cursor-pointer"
                                >
                                  {steelType.label}
                                </Label>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {steelType.description}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                        {(entry.steelTypes || []).length === 0 && (
                          <div className="flex items-center gap-2 text-xs text-orange-600 bg-orange-50 p-2 rounded">
                            <AlertCircle className="h-3 w-3" />
                            <span>Please select at least one steel type</span>
                          </div>
                        )}
                        {(entry.steelTypes || []).length > 1 && (
                          <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 p-2 rounded">
                            <Info className="h-3 w-3" />
                            <span>Multiple steel types selected. Average index will be used in calculations.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Multi-row Item Number, Qty, Rate */}
                  <div className="space-y-3">
                    {(() => {
                      const rows = ensureItemRows(entry);
                      return rows.map((row, ri) => {
                        const rowQty = parseFloat(String(row.quantity)) || 0;
                        const rowRate = parseFloat(String(row.agreementRate)) || 0;
                        const rowAmt = rowQty > 0 && rowRate > 0 ? Math.round(rowQty * rowRate * 100) / 100 : 0;
                        return (
                          <div key={ri} className="relative">
                            {ri > 0 && <div className="border-t border-dashed border-gray-200 mt-1 mb-2" />}
                            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
                              <div className="space-y-1">
                                {ri === 0 && <Label className="text-xs">Item No.</Label>}
                                <Input
                                  type="text"
                                  placeholder="e.g. 1130 10 (G)"
                                  value={row.itemNumber || ''}
                                  onChange={(e) => updateItemRow(index, ri, 'itemNumber', e.target.value)}
                                  className="h-9"
                                />
                              </div>
                              <div className="space-y-1">
                                {ri === 0 && <Label className="text-xs">Qty (since last bill)</Label>}
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="0.00"
                                  value={row.quantity === 0 ? '0' : (row.quantity || '')}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    updateItemRow(index, ri, 'quantity', val === '' ? '' : (isNaN(parseFloat(val)) ? '' : parseFloat(val)));
                                  }}
                                  className="h-9"
                                />
                              </div>
                              <div className="space-y-1">
                                {ri === 0 && <Label className="text-xs">Agreement Rate (₹)</Label>}
                                <Input
                                  type="number"
                                  step="0.00001"
                                  min="0"
                                  placeholder="0.00"
                                  value={row.agreementRate === 0 ? '0' : (row.agreementRate || '')}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    updateItemRow(index, ri, 'agreementRate', val === '' ? '' : (isNaN(parseFloat(val)) ? '' : parseFloat(val)));
                                  }}
                                  className="h-9"
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                {rows.length > 1 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-9 w-9 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => removeItemRow(index, ri)}
                                    title="Remove this item row"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </div>
                            {rowAmt > 0 && (
                              <div className="text-xs text-gray-500 mt-0.5 text-right mr-10">
                                = ₹{rowAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 h-7 px-2"
                      onClick={() => addItemRow(index)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Item Row
                    </Button>
                  </div>

                  {/* Amount Input */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`amount-${index}`}>
                        Amount (₹)
                        {(() => {
                          const rows = ensureItemRows(entry);
                          const total = computeItemRowsTotal(rows);
                          if (total > 0) {
                            return (
                              <Badge variant="secondary" className="ml-2 text-xs">
                                {rows.length > 1 ? `= Sum of ${rows.length} items` : '= Qty × Rate'}
                              </Badge>
                            );
                          }
                          return null;
                        })()}
                        {selectedSubClass && (
                          <Badge variant="outline" className="ml-2">
                            Components: {(100 - selectedSubClass.fixed).toFixed(0)}% variable
                          </Badge>
                        )}
                      </Label>
                      <div className="flex items-center gap-1">
                        {(() => {
                          const amt = parseFloat(String(entry.amount));
                          if (!isNaN(amt) && amt > 0 && amt !== Math.round(amt)) {
                            return (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs px-2 text-orange-600 border-orange-300 hover:bg-orange-50"
                                onClick={() => updateEntry(index, 'amount', Math.round(amt))}
                              >
                                Round Off
                              </Button>
                            );
                          }
                          return null;
                        })()}
                        {selectedSubClass && (parseFloat(String(entry.amount)) || 0) > 0 && (
                          <ClassificationComparisonDialog
                            currentClassification={selectedSubClass}
                            entryAmount={parseFloat(String(entry.amount)) || 0}
                            indicesData={indicesData}
                            contractId={contractId}
                            measurementDate={measurementDate}
                          />
                        )}
                        <BillAmountCalculator
                          label="Calculator"
                          onInsertTotal={(total) => updateEntry(index, 'amount', total)}
                        />
                      </div>
                    </div>
                    <Input
                      id={`amount-${index}`}
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={entry.amount === 0 ? '0' : (entry.amount || '')}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '' || value === null || value === undefined) {
                          updateEntry(index, 'amount', '');
                        } else {
                          const numValue = parseFloat(value);
                          updateEntry(index, 'amount', isNaN(numValue) ? '' : numValue);
                        }
                      }}
                    />
                  </div>

                  {/* Description Input */}
                  <div className="space-y-2">
                    <Label htmlFor={`desc-${index}`}>Description (Optional)</Label>
                    <Input
                      id={`desc-${index}`}
                      type="text"
                      placeholder="Add notes or description..."
                      value={entry.description || ''}
                      onChange={(e) => updateEntry(index, 'description', e.target.value)}
                    />
                  </div>

                  {/* Component Breakdown */}
                  {selectedSubClass && (
                    <div className="bg-blue-50 rounded-lg p-4 mt-4">
                      <h5 className="text-sm font-semibold text-blue-900 mb-2">
                        Component Breakdown: {selectedSubClass.code} - {selectedSubClass.name}
                      </h5>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {selectedSubClass.fixed > 0 && (
                          <div className="flex justify-between">
                            <span className="text-blue-700">Fixed:</span>
                            <span className="font-medium text-blue-900">{selectedSubClass.fixed}%</span>
                          </div>
                        )}
                        {selectedSubClass.labour > 0 && (
                          <div className="flex justify-between">
                            <span className="text-blue-700">Labour:</span>
                            <span className="font-medium text-blue-900">{selectedSubClass.labour}%</span>
                          </div>
                        )}
                        {selectedSubClass.plantMachinery > 0 && (
                          <div className="flex justify-between">
                            <span className="text-blue-700">Plant & Machinery:</span>
                            <span className="font-medium text-blue-900">{selectedSubClass.plantMachinery}%</span>
                          </div>
                        )}
                        {selectedSubClass.fuel > 0 && (
                          <div className="flex justify-between">
                            <span className="text-blue-700">Fuel & Lubricants:</span>
                            <span className="font-medium text-blue-900">{selectedSubClass.fuel}%</span>
                          </div>
                        )}
                        {selectedSubClass.otherMaterials > 0 && (
                          <div className="flex justify-between">
                            <span className="text-blue-700">Other Materials:</span>
                            <span className="font-medium text-blue-900">{selectedSubClass.otherMaterials}%</span>
                          </div>
                        )}
                        {selectedSubClass.steel > 0 && (
                          <div className="flex justify-between">
                            <span className="text-blue-700">Steel:</span>
                            <span className="font-medium text-blue-900">{selectedSubClass.steel}%</span>
                          </div>
                        )}
                        {selectedSubClass.cement > 0 && (
                          <div className="flex justify-between">
                            <span className="text-blue-700">Cement:</span>
                            <span className="font-medium text-blue-900">{selectedSubClass.cement}%</span>
                          </div>
                        )}
                        {selectedSubClass.explosives > 0 && (
                          <div className="flex justify-between">
                            <span className="text-blue-700">Explosives:</span>
                            <span className="font-medium text-blue-900">{selectedSubClass.explosives}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {entries.length === 0 && (
          <Card className="border-dashed border-2 border-gray-300 bg-gray-50">
            <CardContent className="pt-6 pb-6">
              <p className="text-center text-gray-500">
                No classification entries added yet. Click "Add Classification Entry" below to start.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add Entry Button */}
      <Button
        type="button"
        variant="outline"
        onClick={addEntry}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Classification Entry
      </Button>
    </div>
  );
}
