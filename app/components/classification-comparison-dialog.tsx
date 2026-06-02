'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { BarChart3, X, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface ClassificationComparisonDialogProps {
  currentClassification: {
    code: string;
    name: string;
    fixed: number;
    labour: number;
    steel: number;
    cement: number;
    plantMachinery: number;
    fuel: number;
    otherMaterials: number;
    explosives: number;
  };
  entryAmount: number;
  indicesData: { base: { [key: string]: number }; current: { [key: string]: number } } | null;
  /** Optional: contractId for fetching indices when indicesData is null */
  contractId?: string;
  /** Optional: bill measurement date (ISO date string) for fetching indices when indicesData is null */
  measurementDate?: string;
}

interface ClassificationOption {
  id: string;
  code: string;
  name: string;
  fixed: number;
  labour: number;
  steel: number;
  cement: number;
  plantMachinery: number;
  fuel: number;
  otherMaterials: number;
  explosives: number;
  groupName?: string;
}

const COMPONENT_KEYS = [
  { key: 'fixed', label: 'Fixed', indexKey: null },
  { key: 'labour', label: 'Labour', indexKey: 'Labour' },
  { key: 'cement', label: 'Cement', indexKey: 'RBI Cement' },
  { key: 'steel', label: 'Steel', indexKey: 'Steel' },
  { key: 'plantMachinery', label: 'Plant & Machinery', indexKey: 'RBI Plant Machinery' },
  { key: 'fuel', label: 'Fuel (HSD)', indexKey: 'MPNG Fuel' },
  { key: 'otherMaterials', label: 'Other Materials', indexKey: 'RBI Other Materials' },
  { key: 'explosives', label: 'Explosives', indexKey: 'RBI Explosives' },
];

interface ComponentCalc {
  percentage: number;
  componentAmount: number;
  baseIndex: number;
  currentIndex: number;
  indexDiff: number;
  variationRatio: number;
  pvc: number;
}

interface ClassificationResult {
  componentCalcs: { [key: string]: ComponentCalc };
  totalPvc: number;
}

function calculateDetailedPvc(
  classification: any,
  amount: number,
  indicesData: { base: { [key: string]: number }; current: { [key: string]: number } } | null
): ClassificationResult {
  const componentCalcs: { [key: string]: ComponentCalc } = {};
  let totalPvc = 0;

  for (const comp of COMPONENT_KEYS) {
    const percent = classification[comp.key] || 0;
    const componentAmount = amount * percent / 100;

    if (percent <= 0 || !comp.indexKey || !indicesData) {
      componentCalcs[comp.key] = {
        percentage: percent,
        componentAmount,
        baseIndex: 0,
        currentIndex: 0,
        indexDiff: 0,
        variationRatio: 0,
        pvc: 0,
      };
      continue;
    }

    // For steel, average all 4 steel sub-types
    let baseIdx = 0;
    let currIdx = 0;
    if (comp.indexKey === 'Steel') {
      const steelTypes = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
      const validPairs = steelTypes
        .map(st => ({ base: indicesData.base[st] || 0, current: indicesData.current[st] || 0 }))
        .filter(p => p.base > 0);
      if (validPairs.length > 0) {
        baseIdx = validPairs.reduce((s, p) => s + p.base, 0) / validPairs.length;
        currIdx = validPairs.reduce((s, p) => s + p.current, 0) / validPairs.length;
      }
    } else {
      baseIdx = indicesData.base[comp.indexKey] || 0;
      currIdx = indicesData.current[comp.indexKey] || 0;
    }

    // Round to 2 decimal places to match actual PVC calculation (ComponentPvcTable)
    baseIdx = Math.round(baseIdx * 100) / 100;
    currIdx = Math.round(currIdx * 100) / 100;

    if (baseIdx <= 0) {
      componentCalcs[comp.key] = {
        percentage: percent,
        componentAmount,
        baseIndex: baseIdx,
        currentIndex: currIdx,
        indexDiff: 0,
        variationRatio: 0,
        pvc: 0,
      };
      continue;
    }

    const indexDiff = currIdx - baseIdx;
    const variationRatio = indexDiff / baseIdx;
    const pvc = componentAmount * variationRatio;
    totalPvc += pvc;

    componentCalcs[comp.key] = {
      percentage: percent,
      componentAmount,
      baseIndex: baseIdx,
      currentIndex: currIdx,
      indexDiff,
      variationRatio,
      pvc,
    };
  }

  return { componentCalcs, totalPvc };
}

export function ClassificationComparisonDialog({
  currentClassification,
  entryAmount,
  indicesData: externalIndicesData,
  contractId,
  measurementDate,
}: ClassificationComparisonDialogProps) {
  const [open, setOpen] = useState(false);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [checkingSub, setCheckingSub] = useState(true);
  const [allClassifications, setAllClassifications] = useState<ClassificationOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFormulas, setExpandedFormulas] = useState<Record<string, boolean>>({});
  const [fetchedIndicesData, setFetchedIndicesData] = useState<{ base: { [key: string]: number }; current: { [key: string]: number } } | null>(null);
  const [indicesLoading, setIndicesLoading] = useState(false);

  // Fetch subscription status on mount
  useEffect(() => {
    const checkSub = async () => {
      try {
        const res = await fetch('/api/credits/balance');
        if (res.ok) {
          const data = await res.json();
          const isExempt = 
            data.accountInfo?.tier === 'Superadmin' || 
            data.accountInfo?.tier === 'Admin' || 
            data.accountInfo?.tier === 'Railway Department' || 
            data.accountInfo?.tier === 'Free Tier' || 
            data.accountInfo?.tier === 'Unlimited' || 
            !data.paymentProcessingEnabled;
          
          const hasSub = !!data.subscription?.isActive;
          setSubscriptionActive(isExempt || hasSub);
        }
      } catch (err) {
        console.error('Error checking subscription for comparison:', err);
      } finally {
        setCheckingSub(false);
      }
    };
    checkSub();
  }, []);

  // Use externally provided indices if available, otherwise use fetched ones
  const indicesData = externalIndicesData || fetchedIndicesData;

  useEffect(() => {
    if (open && subscriptionActive && allClassifications.length === 0) {
      fetchClassifications();
    }
    // If no external indices provided, try to fetch from page context
    if (open && subscriptionActive && !externalIndicesData && !fetchedIndicesData && !indicesLoading) {
      fetchIndicesFromContext();
    }
  }, [open, subscriptionActive]);

  const fetchIndicesFromContext = async () => {
    try {
      setIndicesLoading(true);

      // If contractId and measurementDate props are provided, use the dedicated API
      if (contractId && measurementDate) {
        const res = await fetch(`/api/indices/comparison?contractId=${contractId}&measurementDate=${measurementDate}`);
        if (res.ok) {
          const data = await res.json();
          if (data.base && data.current) {
            setFetchedIndicesData({ base: data.base, current: data.current });
            return;
          }
        }
      }

      // Fallback: Try to get bill ID from the URL (e.g., /bills/[id]) and fetch bill to get contract info
      const path = window.location.pathname;
      const billMatch = path.match(/\/bills\/([^/]+)/);
      if (billMatch && billMatch[1] !== 'new') {
        const billId = billMatch[1];
        const res = await fetch(`/api/bills/${billId}`);
        if (res.ok) {
          const billData = await res.json();
          if (billData.contractId && billData.dateOfMeasurement) {
            const idxRes = await fetch(`/api/indices/comparison?contractId=${billData.contractId}&measurementDate=${billData.dateOfMeasurement}`);
            if (idxRes.ok) {
              const data = await idxRes.json();
              if (data.base && data.current) {
                setFetchedIndicesData({ base: data.base, current: data.current });
                return;
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch indices for comparison:', err);
    } finally {
      setIndicesLoading(false);
    }
  };

  const fetchClassifications = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/classification-groups');
      const data = await res.json();
      if (data.groups) {
        const options: ClassificationOption[] = [];
        for (const group of data.groups) {
          for (const sub of group.subClassifications || []) {
            if (!sub.isActive) continue;
            options.push({
              id: sub.id,
              code: sub.code,
              name: sub.name,
              fixed: sub.fixed || 0,
              labour: sub.labour || 0,
              steel: sub.steel || 0,
              cement: sub.cement || 0,
              plantMachinery: sub.plantMachinery || 0,
              fuel: sub.fuel || 0,
              otherMaterials: sub.otherMaterials || 0,
              explosives: sub.explosives || 0,
              groupName: `${group.code} - ${group.name}`,
            });
          }
        }
        setAllClassifications(options);
        const groupNames = new Set(options.map(o => o.groupName || ''));
        setExpandedGroups(groupNames);
      }
    } catch (err) {
      console.error('Failed to fetch classifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  };

  const toggleFormula = (classCode: string, compKey: string) => {
    const key = `${classCode}-${compKey}`;
    setExpandedFormulas(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const isFormulaExpanded = (classCode: string, compKey: string) => {
    return expandedFormulas[`${classCode}-${compKey}`] || false;
  };

  const selectedClassifications = allClassifications.filter((c) => selectedIds.has(c.id));

  // Group classifications by groupName
  const grouped = allClassifications.reduce((acc, c) => {
    const g = c.groupName || 'Other';
    if (!acc[g]) acc[g] = [];
    acc[g].push(c);
    return acc;
  }, {} as { [key: string]: ClassificationOption[] });

  // Filter by search
  const filteredGrouped = Object.entries(grouped).reduce((acc, [groupName, items]) => {
    if (!searchQuery) {
      acc[groupName] = items;
      return acc;
    }
    const q = searchQuery.toLowerCase();
    const filtered = items.filter(
      (c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    );
    if (filtered.length > 0 || groupName.toLowerCase().includes(q)) {
      acc[groupName] = filtered.length > 0 ? filtered : items;
    }
    return acc;
  }, {} as { [key: string]: ClassificationOption[] });

  const currentResult = calculateDetailedPvc(currentClassification, entryAmount, indicesData);

  const formatCurrency = (val: number) => {
    const prefix = val < 0 ? '-₹' : '₹';
    return prefix + Math.abs(val).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  };

  // Find best/worst among all (current + selected)
  const allResults = [
    { code: currentClassification.code, result: currentResult },
    ...selectedClassifications.map(c => ({ code: c.code, result: calculateDetailedPvc(c, entryAmount, indicesData) })),
  ];
  const bestCode = allResults.length > 0 ? allResults.reduce((best, curr) => curr.result.totalPvc > best.result.totalPvc ? curr : best).code : null;
  const worstCode = allResults.length > 0 ? allResults.reduce((worst, curr) => curr.result.totalPvc < worst.result.totalPvc ? curr : worst).code : null;

  const renderComponentCard = (
    classCode: string,
    comp: typeof COMPONENT_KEYS[0],
    calc: ComponentCalc,
    isCurrent: boolean
  ) => {
    const hasValue = calc.pvc !== 0;
    const hasCalc = comp.indexKey && indicesData && calc.percentage > 0 && calc.baseIndex > 0;

    return (
      <Collapsible
        key={`${classCode}-${comp.key}`}
        open={isFormulaExpanded(classCode, comp.key)}
        onOpenChange={() => toggleFormula(classCode, comp.key)}
      >
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs">
            <span className={cn(
              "flex items-center gap-1",
              hasValue ? "text-foreground" : "text-muted-foreground/50"
            )}>
              {comp.label}:
              {calc.percentage > 0 && (
                <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                  {calc.percentage}%
                </Badge>
              )}
              {hasCalc && (
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-4 w-4 p-0">
                    {isFormulaExpanded(classCode, comp.key) ? (
                      <ChevronUp className="h-2.5 w-2.5" />
                    ) : (
                      <ChevronDown className="h-2.5 w-2.5" />
                    )}
                  </Button>
                </CollapsibleTrigger>
              )}
            </span>
            <span className={cn(
              "font-medium text-xs",
              hasValue ? (calc.pvc < 0 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400") : "text-muted-foreground/50"
            )}>
              {hasValue ? formatCurrency(calc.pvc) : '—'}
            </span>
          </div>
          {hasCalc && (
            <CollapsibleContent>
              <div className="ml-2 p-1.5 bg-muted/30 rounded text-[10px] space-y-0.5 font-mono">
                <div>
                  <span className="text-muted-foreground">Base Index (I₀):</span> {calc.baseIndex.toFixed(2)}
                </div>
                <div>
                  <span className="text-muted-foreground">Avg Index (Iₘ):</span> {calc.currentIndex.toFixed(2)}
                </div>
                <div>
                  <span className="text-muted-foreground">Variation:</span> (Iₘ - I₀) = {calc.indexDiff.toFixed(2)}
                </div>
                <div>
                  <span className="text-muted-foreground">Ratio:</span> {(calc.variationRatio * 100).toFixed(2)}%
                </div>
                <div>
                  <span className="text-muted-foreground">Comp Amt:</span> {formatCurrency(calc.componentAmount)}
                </div>
                <div className="font-semibold border-t pt-0.5">
                  <span className="text-muted-foreground">PVC:</span> {formatCurrency(calc.componentAmount)} × {(calc.variationRatio * 100).toFixed(2)}% = {formatCurrency(calc.pvc)}
                </div>
              </div>
            </CollapsibleContent>
          )}
        </div>
      </Collapsible>
    );
  };

  return (
    <Dialog open={subscriptionActive ? open : false} onOpenChange={(val) => {
      if (!subscriptionActive && !checkingSub) {
        toast.error("Requires Advanced Feature Subscription (₹99/month). Please subscribe in the Billing panel to access this feature.");
        return;
      }
      setOpen(val);
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7">
          {checkingSub ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : !subscriptionActive ? (
            <span className="text-[10px]">🔒</span>
          ) : (
            <BarChart3 size={12} />
          )}
          Compare
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 size={18} />
            Classification Comparison
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Comparing against: <span className="font-semibold">{currentClassification.code} - {currentClassification.name}</span>
            {' '}| Amount: <span className="font-semibold">₹{entryAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
            {indicesLoading && <span className="ml-2 text-xs text-blue-600">Loading indices...</span>}
            {!indicesData && !indicesLoading && <span className="ml-2 text-xs text-amber-600">(Select contract &amp; date to see PVC)</span>}
          </p>
        </DialogHeader>

        <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
          {/* Left: Classification selector */}
          <div className="lg:w-[260px] flex flex-col border rounded-lg flex-shrink-0">
            <div className="p-2 border-b">
              <input
                type="text"
                placeholder="Search classifications..."
                className="w-full px-2 py-1.5 text-sm border rounded-md bg-background"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <ScrollArea className="flex-1 max-h-[300px] lg:max-h-[500px]">
              <div className="p-2 space-y-1">
                {loading ? (
                  <p className="text-sm text-muted-foreground p-2">Loading classifications...</p>
                ) : (
                  Object.entries(filteredGrouped).map(([groupName, items]) => (
                    <div key={groupName}>
                      <button
                        onClick={() => toggleGroup(groupName)}
                        className="flex items-center justify-between w-full text-left px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted rounded"
                      >
                        <span className="truncate">{groupName}</span>
                        {expandedGroups.has(groupName) ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      {expandedGroups.has(groupName) && (
                        <div className="ml-1 space-y-0.5">
                          {items.map((c) => (
                            <label
                              key={c.id}
                              className="flex items-center gap-2 px-2 py-1 text-xs cursor-pointer hover:bg-muted rounded"
                            >
                              <Checkbox
                                checked={selectedIds.has(c.id)}
                                onCheckedChange={() => toggleSelection(c.id)}
                                className="h-3.5 w-3.5"
                              />
                              <span className="truncate">
                                <span className="font-medium">{c.code}</span> - {c.name}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
            {selectedIds.size > 0 && (
              <div className="p-2 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs h-7"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Clear all ({selectedIds.size})
                </Button>
              </div>
            )}
          </div>

          {/* Right: Comparison cards */}
          <div className="flex-1 min-w-0 overflow-auto">
            {selectedClassifications.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-8 text-center border rounded-lg border-dashed">
                Select classifications from the left panel to compare PVC calculations
              </div>
            ) : (
              <div className="space-y-4">
                {/* Current classification card */}
                {(() => {
                  const isBest = bestCode === currentClassification.code;
                  const isWorst = worstCode === currentClassification.code && !isBest;
                  return (
                    <div className={cn(
                      "border rounded-lg p-3 relative",
                      isBest && "border-green-600 border-2 bg-green-50/50 dark:bg-green-950/20",
                      isWorst && "border-red-500 border-2 bg-red-50/50 dark:bg-red-950/20"
                    )}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="default" className="text-xs">Current</Badge>
                          <span className="font-semibold text-sm">{currentClassification.code}</span>
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">{currentClassification.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {isBest && (
                            <Badge className="bg-green-600 text-white text-[10px]">
                              <TrendingUp className="h-3 w-3 mr-0.5" /> Best
                            </Badge>
                          )}
                          {isWorst && (
                            <Badge variant="destructive" className="text-[10px]">
                              <TrendingDown className="h-3 w-3 mr-0.5" /> Worst
                            </Badge>
                          )}
                          <Badge
                            variant={currentResult.totalPvc >= 0 ? "default" : "destructive"}
                            className={cn("text-sm font-bold", currentResult.totalPvc >= 0 && "bg-green-600")}
                          >
                            {currentResult.totalPvc >= 0 ? '+' : ''}{formatCurrency(currentResult.totalPvc)}
                          </Badge>
                        </div>
                      </div>
                      <Separator className="mb-2" />
                      <div className="space-y-1">
                        {COMPONENT_KEYS.map((comp) =>
                          renderComponentCard(currentClassification.code, comp, currentResult.componentCalcs[comp.key], true)
                        )}
                      </div>
                      <Separator className="my-2" />
                      <div className="flex justify-between items-center text-sm font-semibold">
                        <span>Total PVC</span>
                        <span className={currentResult.totalPvc >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
                          {formatCurrency(currentResult.totalPvc)}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Selected classification cards */}
                {selectedClassifications.map((c) => {
                  const result = calculateDetailedPvc(c, entryAmount, indicesData);
                  const diff = result.totalPvc - currentResult.totalPvc;
                  const isBest = bestCode === c.code;
                  const isWorst = worstCode === c.code && !isBest;

                  return (
                    <div
                      key={c.id}
                      className={cn(
                        "border rounded-lg p-3 relative",
                        isBest && "border-green-600 border-2 bg-green-50/50 dark:bg-green-950/20",
                        isWorst && "border-red-500 border-2 bg-red-50/50 dark:bg-red-950/20"
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{c.code}</Badge>
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">{c.name}</span>
                          <button
                            onClick={() => toggleSelection(c.id)}
                            className="text-muted-foreground hover:text-foreground ml-1"
                          >
                            <X size={12} />
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          {isBest && (
                            <Badge className="bg-green-600 text-white text-[10px]">
                              <TrendingUp className="h-3 w-3 mr-0.5" /> Best
                            </Badge>
                          )}
                          {isWorst && (
                            <Badge variant="destructive" className="text-[10px]">
                              <TrendingDown className="h-3 w-3 mr-0.5" /> Worst
                            </Badge>
                          )}
                          <Badge
                            variant={result.totalPvc >= 0 ? "default" : "destructive"}
                            className={cn("text-sm font-bold", result.totalPvc >= 0 && "bg-green-600")}
                          >
                            {result.totalPvc >= 0 ? '+' : ''}{formatCurrency(result.totalPvc)}
                          </Badge>
                        </div>
                      </div>
                      <Separator className="mb-2" />
                      <div className="space-y-1">
                        {COMPONENT_KEYS.map((comp) =>
                          renderComponentCard(c.code, comp, result.componentCalcs[comp.key], false)
                        )}
                      </div>
                      <Separator className="my-2" />
                      <div className="flex justify-between items-center text-sm font-semibold">
                        <span>Total PVC</span>
                        <div className="flex items-center gap-2">
                          <span className={result.totalPvc >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
                            {formatCurrency(result.totalPvc)}
                          </span>
                          {diff !== 0 && (
                            <span className={cn("text-[10px]", diff > 0 ? 'text-green-600' : 'text-red-600')}>
                              ({diff > 0 ? '+' : ''}{formatCurrency(diff)} vs current)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}