
"use client";

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { CalendarIcon, TrendingUp, TrendingDown, Calculator, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

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
}

export default function PvcComparisonPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [amount, setAmount] = useState<string>('');
  const [baseDate, setBaseDate] = useState<Date | undefined>(undefined);
  const [measurementDate, setMeasurementDate] = useState<Date | undefined>(undefined);
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [selectedClassifications, setSelectedClassifications] = useState<string[]>([]);
  const [comparisonResults, setComparisonResults] = useState<ComparisonResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [expandedFormulas, setExpandedFormulas] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  useEffect(() => {
    fetchClassifications();
  }, []);

  const fetchClassifications = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/classifications-new');
      if (response.ok) {
        const data = await response.json();
        
        // Handle hierarchical work classification structure from /api/classifications-new
        if (data && Array.isArray(data.mainClassifications)) {
          // Flatten the hierarchical work classification structure to get all sub-classifications
          // This preserves the work classification hierarchy (main -> sub)
          const allClassifications: Classification[] = [];
          
          data.mainClassifications.forEach((main: any) => {
            if (Array.isArray(main.subClassifications)) {
              main.subClassifications.forEach((sub: any) => {
                // Only include sub-classifications that have component definitions
                const hasComponents = 
                  (sub.components?.labour || 0) > 0 ||
                  (sub.components?.steel || 0) > 0 ||
                  (sub.components?.cement || 0) > 0 ||
                  (sub.components?.plantMachinery || 0) > 0 ||
                  (sub.components?.fuel || 0) > 0 ||
                  (sub.components?.otherMaterials || 0) > 0 ||
                  (sub.components?.explosives || 0) > 0;

                if (hasComponents) {
                  allClassifications.push({
                    id: sub.id,
                    code: sub.code,
                    mainClassification: main.name,
                    subClassification: sub.name,
                    description: sub.description || sub.name,
                    componentPercentages: {
                      fixed: sub.components?.fixed || 0,
                      labour: sub.components?.labour || 0,
                      steel: sub.components?.steel || 0,
                      cement: sub.components?.cement || 0,
                      plantMachinery: sub.components?.plantMachinery || 0,
                      fuel: sub.components?.fuel || 0,
                      otherMaterials: sub.components?.otherMaterials || 0,
                      explosives: sub.components?.explosives || 0
                    }
                  });
                }
              });
            }
          });
          
          setClassifications(allClassifications);
          
          if (allClassifications.length === 0) {
            toast.error('No work classifications with components found. Please add work classifications first.');
          }
        } else if (Array.isArray(data)) {
          // Fallback: direct array format
          setClassifications(data);
        } else if (data && Array.isArray(data.classifications)) {
          // Fallback: classifications array
          setClassifications(data.classifications);
        } else {
          console.error('Invalid data format received:', data);
          setClassifications([]);
          toast.error('Invalid data format received');
        }
      } else {
        toast.error('Failed to load work classifications');
        setClassifications([]);
      }
    } catch (error) {
      console.error('Error fetching work classifications:', error);
      toast.error('Error loading work classifications');
      setClassifications([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleClassification = (classificationId: string) => {
    setSelectedClassifications(prev => {
      if (prev.includes(classificationId)) {
        return prev.filter(id => id !== classificationId);
      } else {
        return [...prev, classificationId];
      }
    });
  };

  const handleCompare = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    
    if (!baseDate) {
      toast.error('Please select a base date');
      return;
    }
    
    if (!measurementDate) {
      toast.error('Please select a measurement date');
      return;
    }
    
    if (selectedClassifications.length < 2) {
      toast.error('Please select at least 2 classifications to compare');
      return;
    }

    setCalculating(true);
    try {
      const response = await fetch('/api/indices/compare-classifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(amount),
          baseDate: baseDate.toISOString(),
          measurementDate: measurementDate.toISOString(),
          classificationIds: selectedClassifications
        })
      });

      if (response.ok) {
        const results = await response.json();
        setComparisonResults(results);
        toast.success('Comparison completed successfully');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to calculate comparison');
      }
    } catch (error) {
      console.error('Error calculating comparison:', error);
      toast.error('Error calculating comparison');
    } finally {
      setCalculating(false);
    }
  };

  const getBestClassification = () => {
    if (comparisonResults.length === 0) return null;
    return comparisonResults.reduce((best, current) => 
      current.totalPvc > best.totalPvc ? current : best
    );
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
    const hasValue = pvcValue > 0;

    return (
      <Collapsible
        key={componentKey}
        open={isFormulaExpanded(result.classification.id, componentKey)}
        onOpenChange={() => toggleFormulaExpanded(result.classification.id, componentKey)}
      >
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className={cn(
              "flex items-center gap-1",
              hasValue ? "text-foreground" : "text-muted-foreground/50"
            )}>
              {componentLabel}:
              {percentage > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {percentage}%
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
              hasValue ? "text-foreground" : "text-muted-foreground/50"
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
                  <span className="text-muted-foreground">Avg Index (Iₘ):</span> {calculation.averageIndex}
                </div>
                <div className="font-mono">
                  <span className="text-muted-foreground">Variation:</span> (Iₘ - I₀) = {calculation.indexDiff}
                </div>
                <div className="font-mono">
                  <span className="text-muted-foreground">Ratio:</span> (Iₘ - I₀) / I₀ = {(calculation.variationRatio * 100).toFixed(2)}%
                </div>
                <div className="font-mono">
                  <span className="text-muted-foreground">Amount:</span> ₹{amount} × {(calculation.variationRatio * 100).toFixed(2)}% = ₹{calculation.componentAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
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

  const bestResult = getBestClassification();

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">PVC Work Classification Comparison Calculator</h1>
        <p className="text-muted-foreground">
          Compare how the same amount performs across different work classifications with all components and sub-classifications to find the best option
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
        {/* Amount Input */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Bill Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (₹)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="e.g., 123345"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0"
                step="0.01"
              />
            </div>
          </CardContent>
        </Card>

        {/* Base Date */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Base Date</CardTitle>
          </CardHeader>
          <CardContent>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !baseDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {baseDate ? format(baseDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={baseDate}
                  onSelect={setBaseDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </CardContent>
        </Card>

        {/* Measurement Date */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Measurement Date</CardTitle>
          </CardHeader>
          <CardContent>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !measurementDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {measurementDate ? format(measurementDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={measurementDate}
                  onSelect={setMeasurementDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </CardContent>
        </Card>
      </div>

      {/* Work Classifications Selection */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Select Work Classifications to Compare</CardTitle>
          <CardDescription>
            Choose at least 2 work classifications to compare. Selected: {selectedClassifications.length}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!Array.isArray(classifications) || classifications.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No work classifications available. Please add work classifications with component definitions first.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Group classifications by main work classification */}
              {Array.from(new Set(classifications.map(c => c.mainClassification))).map(mainClass => {
                const subClassifications = classifications.filter(c => c.mainClassification === mainClass);
                return (
                  <div key={mainClass}>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                      {mainClass}
                    </h3>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {subClassifications.map((classification) => {
                        const activeComponents = Object.entries(classification.componentPercentages)
                          .filter(([key, value]) => key !== 'fixed' && value > 0)
                          .map(([key]) => key);
                        
                        return (
                          <div
                            key={classification.id}
                            onClick={() => toggleClassification(classification.id)}
                            className={cn(
                              "p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md",
                              selectedClassifications.includes(classification.id)
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-primary/50"
                            )}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <Badge variant={selectedClassifications.includes(classification.id) ? "default" : "outline"}>
                                {classification.code}
                              </Badge>
                              {selectedClassifications.includes(classification.id) && (
                                <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                                  <svg className="h-3 w-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              )}
                            </div>
                            <h4 className="font-semibold text-sm mb-1">{classification.subClassification}</h4>
                            <p className="text-xs text-muted-foreground mb-2">{classification.description}</p>
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
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compare Button */}
      <div className="flex justify-center mb-8">
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
      </div>

      {/* Comparison Results */}
      {comparisonResults.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Comparison Results</h2>
            {bestResult && (
              <Badge variant="default" className="text-sm py-1 px-3">
                Best Option: {bestResult.classification.code}
              </Badge>
            )}
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {comparisonResults
              .sort((a, b) => b.totalPvc - a.totalPvc)
              .map((result, index) => {
                const isBest = bestResult?.classification.id === result.classification.id;
                const rank = index + 1;
                
                return (
                  <Card 
                    key={result.classification.id}
                    className={cn(
                      "relative",
                      isBest && "border-primary border-2 shadow-lg"
                    )}
                  >
                    {isBest && (
                      <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                        <Badge className="bg-green-600 text-white">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          Best Option
                        </Badge>
                      </div>
                    )}
                    
                    <CardHeader className={cn(isBest && "pt-6")}>
                      <div className="flex items-start justify-between mb-2">
                        <Badge variant={isBest ? "default" : "outline"} className="text-sm">
                          #{rank} - {result.classification.code}
                        </Badge>
                        <Badge variant="secondary" className="text-lg font-bold">
                          ₹{result.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
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

          {/* Insights */}
          <Card className="bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800">
            <CardHeader>
              <CardTitle className="flex items-center text-emerald-900 dark:text-emerald-100">
                <AlertCircle className="h-5 w-5 mr-2" />
                Work Classification Comparison Insights
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-emerald-800 dark:text-emerald-200">
              {bestResult && (
                <div className="space-y-2">
                  <p>
                    <strong>Best Work Classification:</strong> {bestResult.classification.code} - {bestResult.classification.mainClassification} ({bestResult.classification.subClassification})
                  </p>
                  <p>
                    <strong>Total PVC:</strong> ₹{bestResult.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </p>
                  {comparisonResults.length > 1 && (
                    <p>
                      <strong>Difference from next best:</strong> ₹{(bestResult.totalPvc - comparisonResults.sort((a, b) => b.totalPvc - a.totalPvc)[1].totalPvc).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </p>
                  )}
                  <Separator className="my-2 bg-emerald-200 dark:bg-emerald-800" />
                  <p className="text-xs">
                    <strong>About Work Classifications:</strong> Work classifications include detailed component breakdowns (Labour, Steel, Cement, Plant & Machinery, Fuel, Other Materials, Explosives) and sub-classifications for precise PVC calculation.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
