
'use client';

import { useState, useEffect, Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StatusMessage } from '@/components/ui/status-message';
import { Calculator, FileText, Building2, TrendingUp, Files, CheckSquare, ChevronDown, ChevronUp, Minimize2, Maximize2, Eye } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';
import { useSearchParams } from 'next/navigation';

interface Bill {
  id: string;
  billNo: string;
  billAmount: number;
  dateOfMeasurement: Date;
  quarter: string;
  contract: {
    id: string;
    agreementNo: string;
    contractorName: string;
    workDescription: string;
    workClassification?: string;
  };
  workClassification?: {
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
  };
  classificationEntries?: {
    id: string;
    amount: number;
    classification?: {
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
      isActive?: boolean;
      isDefault?: boolean;
    };
    subClassification?: {
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
      isActive?: boolean;
      isDefault?: boolean;
    };
  }[];
  pvcCalculation: {
    labourPvc: number;
    plantMachineryPvc: number;
    fuelPowerPvc: number;
    otherMaterialsPvc: number;
    cementPvc: number;
    steelPvc: number;
    explosivesPvc: number;
    dedicatedCementPvc: number;
    dedicatedSteelPvc: number;
    totalPvc: number;
    previousPvcTotal: number;
    cumulativePvc: number;
  };
}

interface DetailedReport {
  bill: {
    id: string;
    billNo: string;
    billAmount: number;
    dateOfMeasurement: Date;
    quarter: string;
  };
  contract: {
    agreementNo: string;
    contractorName: string;
    workDescription: string;
    dateOfOpening: Date;
    baseMonth: Date;
  };
  pvcCalculation: any;
  monthlyData: {
    month: Date;
    monthName: string;
    indices: {
      indexName: string;
      baseValue: number;
      currentValue: number | null;
      available: boolean;
    }[];
  }[];
  quarterlyBreakdown: {
    indexName: string;
    baseValue: number;
    quarterMonths: string[];
    monthlyValues: { month: string; value: number }[];
    average: number | null;
    variation: number | null;
  }[];
  reportMetadata: {
    baseMonth: string;
    startMonth: string;
    measurementDate: string;
    quarter: string;
    quarterMonths: string[];
    totalMonths: number;
  };
}

interface CalculationSteps {
  bill: {
    id: string;
    billNo: string;
    billAmount: number;
    dateOfMeasurement: Date;
    quarter: string;
  };
  contract: {
    agreementNo: string;
    contractorName: string;
    workDescription: string;
    baseMonth: Date;
  };
  classification: {
    code: string;
    name: string;
    description?: string;
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
  } | null;
  quarterlyAverages: {
    indexName: string;
    average: number;
    baseValue: number;
    quarter: string;
  }[];
  calculationSteps: {
    [key: string]: {
      finalPvc: number;
      steps: {
        step1: { description: string; calculation: string; result: number };
        step2: { description: string; calculation: string; result: number };
        step3: { description: string; calculation: string; result: number };
        step4: { description: string; calculation: string; result: number };
      };
      formula: string;
      averageIndex: number;
      baseIndex: number;
      componentPercentage: number;
      componentName: string;
      indexSource: string;
    };
  };
  summary: {
    labourPvc: number;
    plantMachineryPvc: number;
    fuelPowerPvc: number;
    otherMaterialsPvc: number;
    cementPvc: number;
    steelPvc: number;
    explosivesPvc: number;
    dedicatedCementPvc: number;
    dedicatedSteelPvc: number;
    totalPvc: number;
  };
}

interface Contract {
  id: string;
  agreementNo: string;
  contractorName: string;
}

function ReportsPageContent() {
  const searchParams = useSearchParams();
  const preselectedBillId = searchParams?.get('billId');

  const [bills, setBills] = useState<Bill[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selectedContract, setSelectedContract] = useState<string>('all');
  const [selectedBill, setSelectedBill] = useState<string>(preselectedBillId || '');
  const [selectedBills, setSelectedBills] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailedReport, setDetailedReport] = useState<DetailedReport | null>(null);
  const [isLoadingDetailedReport, setIsLoadingDetailedReport] = useState(false);
  const [showDetailedReport, setShowDetailedReport] = useState(false);
  const [isDownloadingBulkPDF, setIsDownloadingBulkPDF] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [calculationSteps, setCalculationSteps] = useState<CalculationSteps | null>(null);
  const [isLoadingCalculationSteps, setIsLoadingCalculationSteps] = useState(false);
  const [showCalculationSteps, setShowCalculationSteps] = useState(false);
  const [activeTab, setActiveTab] = useState<'calculation' | 'report' | null>(null);
  const [isTabContentCollapsed, setIsTabContentCollapsed] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [billsResponse, contractsResponse] = await Promise.all([
        fetch('/api/bills'),
        fetch('/api/contracts')
      ]);

      if (!billsResponse.ok || !contractsResponse.ok) {
        throw new Error('Failed to fetch data');
      }

      const billsData = await billsResponse.json();
      const contractsData = await contractsResponse.json();
      
      // Extract data from paginated response
      setBills(Array.isArray(billsData) ? billsData : billsData.data || []);
      setContracts(Array.isArray(contractsData) ? contractsData : contractsData.data || []);

      // If there's a preselected bill, set it
      if (preselectedBillId) {
        handleBillSelection(preselectedBillId);
      }
    } catch (error: any) {
      console.error('Error fetching data:', error);
      setError(error.message || 'Failed to fetch data');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredBills = selectedContract === 'all' 
    ? bills 
    : bills.filter(bill => bill.contract?.id === selectedContract);

  const selectedBillData = bills.find(bill => bill.id === selectedBill);

  // Multi-select functions
  const handleBillSelect = (billId: string) => {
    setSelectedBills(prev => 
      prev.includes(billId) 
        ? prev.filter(id => id !== billId)
        : [...prev, billId]
    );
  };

  const handleSelectAll = () => {
    const billsWithPvc = filteredBills.filter(bill => bill.pvcCalculation);
    if (selectedBills.length === billsWithPvc.length) {
      setSelectedBills([]);
    } else {
      setSelectedBills(billsWithPvc.map(bill => bill.id));
    }
  };

  const handleBillSelection = (billId: string) => {
    setSelectedBill(billId);
    
    // Reset related states
    setDetailedReport(null);
    setCalculationSteps(null);
    setShowDetailedReport(false);
    setShowCalculationSteps(false);
    setActiveTab(null); // Reset active tab when new bill is selected
    setIsTabContentCollapsed(false); // Reset collapse state for new bill
  };

  const fetchDetailedReport = async (billId: string) => {
    setIsLoadingDetailedReport(true);
    setError('');
    setActiveTab('report');
    setShowCalculationSteps(false);
    setIsTabContentCollapsed(false); // Auto-expand when switching to report tab
    
    try {
      const response = await fetch(`/api/bills/${billId}/detailed-report`);
      if (!response.ok) {
        throw new Error('Failed to fetch detailed report');
      }
      
      const data = await response.json();
      setDetailedReport(data);
      setShowDetailedReport(true);
    } catch (error: any) {
      console.error('Error fetching detailed report:', error);
      setError(error.message || 'Failed to fetch detailed report');
      setActiveTab(null);
    } finally {
      setIsLoadingDetailedReport(false);
    }
  };

  const fetchCalculationSteps = async (billId: string) => {
    setIsLoadingCalculationSteps(true);
    setError('');
    setActiveTab('calculation');
    setShowDetailedReport(false);
    setIsTabContentCollapsed(false); // Auto-expand when switching to calculation tab
    
    try {
      const response = await fetch(`/api/bills/${billId}/calculation-steps`);
      if (!response.ok) {
        throw new Error('Failed to fetch calculation steps');
      }
      
      const data = await response.json();
      setCalculationSteps(data);
      setShowCalculationSteps(true);
    } catch (error: any) {
      console.error('Error fetching calculation steps:', error);
      setError(error.message || 'Failed to fetch calculation steps');
      setActiveTab(null);
    } finally {
      setIsLoadingCalculationSteps(false);
    }
  };



  const downloadBulkPDF = async () => {
    if (selectedBills.length === 0) return;

    setIsDownloadingBulkPDF(true);
    try {
      setError('');
      const response = await fetch('/api/bills/bulk-pdf-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ billIds: selectedBills }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.details || errorData.error || 'Failed to generate bulk PDF report';
        throw new Error(errorMessage);
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Bulk_PVC_Report_${selectedBills.length}_Bills_${format(toISTDate(new Date()), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Error downloading bulk PDF:', error);
      setError(error.message || 'Failed to download bulk PDF report');
    } finally {
      setIsDownloadingBulkPDF(false);
    }
  };





  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <LoadingSpinner size="lg" text="Loading reports..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Calculator className="h-8 w-8 text-orange-600" />
            PVC Reports
          </h1>
          <p className="text-gray-600 mt-2">
            View detailed PVC calculation reports and component breakdowns. Select a bill below to access calculation steps, detailed reports, or full HTML printable reports.
          </p>
        </div>
        <div className="flex gap-2">
          {/* Enhanced Bulk Actions Panel */}
          {selectedBills.length > 0 && (
            <div className="flex gap-3 items-center bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl px-6 py-4 border border-indigo-200 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-medium text-indigo-800">
                <CheckSquare className="h-4 w-4" />
                <span>{selectedBills.length} bill{selectedBills.length !== 1 ? 's' : ''} selected</span>
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={downloadBulkPDF} 
                  disabled={isDownloadingBulkPDF}
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 shadow-md hover:shadow-lg transform hover:scale-105 transition-all duration-200 font-semibold"
                >
                  {isDownloadingBulkPDF ? (
                    <>
                      <LoadingSpinner size="sm" className="mr-2" />
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <Files className="h-4 w-4 mr-2" />
                      <span>Generate Bulk Report</span>
                    </>
                  )}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setSelectedBills([])}
                  className="text-slate-600 hover:text-slate-800 border-slate-300 hover:border-slate-400 hover:bg-slate-50 transition-all duration-200"
                >
                  Clear Selection
                </Button>
              </div>
            </div>
          )}

          {/* Modern Action Panel for single bill actions */}
          {selectedBillData && (
            <div className="bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex">
                <button
                  onClick={() => fetchCalculationSteps(selectedBill)} 
                  disabled={isLoadingCalculationSteps}
                  className={`flex-1 px-8 py-6 text-sm font-semibold flex items-center justify-center gap-3 transition-all duration-300 ${
                    activeTab === 'calculation' 
                      ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg transform scale-105' 
                      : 'text-slate-700 hover:text-blue-600 hover:bg-white hover:shadow-md hover:scale-102'
                  } ${isLoadingCalculationSteps ? 'opacity-75 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {isLoadingCalculationSteps ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <Calculator className="h-5 w-5" />
                  )}
                  <span className="font-medium">
                    {isLoadingCalculationSteps ? 'Loading...' : 'Calculation Steps'}
                  </span>
                </button>
                
                <button 
                  onClick={() => fetchDetailedReport(selectedBill)} 
                  disabled={isLoadingDetailedReport}
                  className={`flex-1 px-8 py-6 text-sm font-semibold flex items-center justify-center gap-3 transition-all duration-300 border-l border-slate-200 ${
                    activeTab === 'report' 
                      ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-lg transform scale-105' 
                      : 'text-slate-700 hover:text-purple-600 hover:bg-white hover:shadow-md hover:scale-102'
                  } ${isLoadingDetailedReport ? 'opacity-75 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {isLoadingDetailedReport ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <FileText className="h-5 w-5" />
                  )}
                  <span className="font-medium">
                    {isLoadingDetailedReport ? 'Loading...' : 'Detailed Report'}
                  </span>
                </button>
                
                <Link 
                  href={`/reports/full/${selectedBill}`}
                  className="flex-1 px-8 py-6 text-sm font-semibold flex items-center justify-center gap-3 transition-all duration-300 border-l border-slate-200 text-slate-700 hover:text-emerald-600 hover:bg-white hover:shadow-md hover:scale-102 cursor-pointer"
                >
                  <Eye className="h-5 w-5" />
                  <span className="font-medium">View Full Report</span>
                </Link>
                
                {/* Collapse/Expand Toggle Button */}
                {(activeTab && (showCalculationSteps || showDetailedReport)) && (
                  <button 
                    onClick={() => setIsTabContentCollapsed(!isTabContentCollapsed)}
                    className="px-6 py-6 border-l border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-white transition-all duration-300 hover:scale-105"
                    title={isTabContentCollapsed ? 'Expand Content' : 'Collapse Content'}
                  >
                    {isTabContentCollapsed ? (
                      <Maximize2 className="h-5 w-5" />
                    ) : (
                      <Minimize2 className="h-5 w-5" />
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <StatusMessage type="error" title="Error" message={error} />
      )}

      {/* Filters */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Report Filters & Bill Selection</CardTitle>
              <CardDescription>
                Select a contract, choose individual bills for detailed reports, or select multiple bills for bulk PDF download
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="text-gray-600 hover:text-gray-800"
            >
              {showFilters ? (
                <ChevronUp className="h-4 w-4 mr-2" />
              ) : (
                <ChevronDown className="h-4 w-4 mr-2" />
              )}
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </Button>
          </div>
        </CardHeader>
        {showFilters && (
        <CardContent>
          <div className="space-y-6">
            {/* Contract Filter */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Contract</label>
                <Select value={selectedContract} onValueChange={setSelectedContract}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Contracts</SelectItem>
                    {contracts.map((contract) => (
                      <SelectItem key={contract.id} value={contract.id}>
                        {contract.agreementNo} - {contract.contractorName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Single Bill (Detailed Report)</label>
                <Select value={selectedBill} onValueChange={handleBillSelection}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a bill for detailed report" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredBills
                      .filter(bill => bill.pvcCalculation)
                      .map((bill) => (
                      <SelectItem key={bill.id} value={bill.id}>
                        {bill.billNo} - {bill.quarter} (₹{bill.billAmount.toLocaleString('en-IN')})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Multi-select Bills */}
            {filteredBills.filter(bill => bill.pvcCalculation).length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Multiple Bills (Bulk PDF Download)</label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAll}
                    className="text-xs"
                  >
                    <CheckSquare className="h-3 w-3 mr-1" />
                    {selectedBills.length === filteredBills.filter(bill => bill.pvcCalculation).length 
                      ? 'Deselect All' 
                      : 'Select All'
                    }
                  </Button>
                </div>
                
                <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-4">
                  <div className="space-y-3">
                    {filteredBills
                      .filter(bill => bill.pvcCalculation)
                      .map((bill) => (
                      <div key={bill.id} className="flex items-start space-x-3 p-2 hover:bg-gray-50 rounded">
                        <Checkbox
                          id={`bill-${bill.id}`}
                          checked={selectedBills.includes(bill.id)}
                          onCheckedChange={() => handleBillSelect(bill.id)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <label 
                            htmlFor={`bill-${bill.id}`} 
                            className="text-sm font-medium text-gray-900 cursor-pointer"
                          >
                            {bill.billNo}
                          </label>
                          <div className="text-xs text-gray-600 mt-1">
                            <span>{bill.contract.agreementNo}</span>
                            <span className="mx-2">•</span>
                            <span>{bill.quarter}</span>
                            <span className="mx-2">•</span>
                            <span>₹{bill.billAmount.toLocaleString('en-IN')}</span>
                            <span className="mx-2">•</span>
                            <span>PVC: ₹{bill.pvcCalculation.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {selectedBills.length > 0 && (
                  <div className="text-xs text-gray-600 bg-blue-50 p-3 rounded-lg">
                    {selectedBills.length} bill{selectedBills.length !== 1 ? 's' : ''} selected for bulk PDF download
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
        )}
      </Card>

      {/* Detailed Report */}
      {selectedBillData?.pvcCalculation ? (
        <div className="space-y-6">
          {/* Bill Summary */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-xl">{selectedBillData.billNo}</CardTitle>
                  <CardDescription>
                    {selectedBillData.contract.agreementNo} • {selectedBillData.contract.contractorName}
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-base px-3 py-1">
                  {selectedBillData.quarter}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <FileText className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-600">Bill Amount</p>
                  <p className="text-2xl font-bold text-blue-900">
                    ₹{selectedBillData.billAmount.toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <Calculator className="h-8 w-8 text-green-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-600">PVC Amount</p>
                  <p className="text-2xl font-bold text-green-900">
                    ₹{selectedBillData.pvcCalculation.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <TrendingUp className="h-8 w-8 text-purple-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-600">Cumulative PVC</p>
                  <p className="text-2xl font-bold text-purple-900">
                    ₹{selectedBillData.pvcCalculation.cumulativePvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Component Breakdown */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>PVC Component Breakdown</CardTitle>
              <CardDescription>
                Detailed breakdown by component percentages
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                // Use the actual classification from the bill data
                // Priority 1: Legacy workClassification
                let billClassification: {
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
                } | undefined = selectedBillData.workClassification;
                
                // Priority 2: Get from classificationEntries
                if (!billClassification && selectedBillData.classificationEntries && selectedBillData.classificationEntries.length > 0) {
                  const entry = selectedBillData.classificationEntries[0];
                  // Use subClassification if available, otherwise use classification
                  billClassification = entry.subClassification || entry.classification;
                }
                
                // If no classification found, show error
                if (!billClassification) {
                  return (
                    <div className="text-center py-8 text-gray-500">
                      No classification data available for this bill.
                    </div>
                  );
                }
                
                const components = [
                  { 
                    key: 'labourPvc', 
                    name: 'Labour', 
                    percentage: billClassification.labour, 
                    color: 'text-blue-600', 
                    value: selectedBillData.pvcCalculation.labourPvc, 
                    description: 'Consumer Price Index for Industrial Workers' 
                  },
                  { 
                    key: 'plantMachineryPvc', 
                    name: 'Plant Machinery & Spares', 
                    percentage: billClassification.plantMachinery, 
                    color: 'text-green-600', 
                    value: selectedBillData.pvcCalculation.plantMachineryPvc, 
                    description: 'RBI Plant Machinery index' 
                  },
                  { 
                    key: 'fuelPowerPvc', 
                    name: 'Fuel & Lubricants', 
                    percentage: billClassification.fuel, 
                    color: 'text-orange-600', 
                    value: selectedBillData.pvcCalculation.fuelPowerPvc, 
                    description: 'MPNG Fuel & Lubricants index' 
                  },
                  { 
                    key: 'otherMaterialsPvc', 
                    name: 'Other Materials', 
                    percentage: billClassification.otherMaterials, 
                    color: 'text-purple-600', 
                    value: selectedBillData.pvcCalculation.otherMaterialsPvc, 
                    description: 'RBI Other Materials index' 
                  },
                  { 
                    key: 'cementPvc', 
                    name: 'Cement', 
                    percentage: billClassification.cement, 
                    color: 'text-indigo-600', 
                    value: selectedBillData.pvcCalculation.cementPvc + selectedBillData.pvcCalculation.dedicatedCementPvc, 
                    description: 'RBI Cement, Lime & Plaster index (includes dedicated cement)' 
                  },
                  { 
                    key: 'steelPvc', 
                    name: 'Steel', 
                    percentage: billClassification.steel, 
                    color: 'text-red-600', 
                    value: selectedBillData.pvcCalculation.steelPvc + selectedBillData.pvcCalculation.dedicatedSteelPvc, 
                    description: 'Joint Plant Committee steel rates (includes dedicated steel)' 
                  },
                  { 
                    key: 'explosivesPvc', 
                    name: 'Explosives', 
                    percentage: billClassification.explosives, 
                    color: 'text-yellow-600', 
                    value: selectedBillData.pvcCalculation.explosivesPvc, 
                    description: 'RBI Explosives index' 
                  }
                ].filter(component => component.percentage > 0); // Only show components that have percentages > 0

                const fixedPercentage = billClassification.fixed;

                return (
                  <>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {components.map((component, index) => (
                        <div key={component.key} className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium">{component.name} ({component.percentage}%)</p>
                            <p className="text-sm text-gray-600">{component.description}</p>
                          </div>
                          <p className={`text-lg font-bold ${component.color}`}>
                            ₹{component.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Fixed Component Note */}
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                      <p className="text-sm text-blue-800">
                        <span className="font-semibold">Fixed Component ({fixedPercentage}%):</span> Not subject to price variation as per GCC-2022-ACS2
                      </p>
                    </div>

                    {/* Classification Info */}
                    {billClassification && (
                      <div className="mt-4 p-3 bg-green-50 rounded-lg">
                        <p className="text-sm text-green-800">
                          <span className="font-semibold">Classification:</span> {billClassification.code} - {billClassification.name}
                          {billClassification.description && (
                            <span className="block text-xs text-green-700 mt-1">{billClassification.description}</span>
                          )}
                        </p>
                      </div>
                    )}

                    <div className="mt-6 pt-6 border-t border-gray-200">
                      <div className="flex justify-between items-center text-lg font-bold mb-2">
                        <span>Total Variable PVC Amount:</span>
                        <span className="text-green-600">
                          ₹{selectedBillData.pvcCalculation.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">
                        Total Variable Components: {(100 - fixedPercentage)}% | Fixed Component: {fixedPercentage}%
                      </p>
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>

          {/* Contract Details */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Contract & Bill Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Agreement Number</p>
                    <p className="font-medium">{selectedBillData.contract.agreementNo}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Contractor Name</p>
                    <p className="font-medium">{selectedBillData.contract.contractorName}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Work Description</p>
                    <p className="text-sm text-gray-700">{selectedBillData.contract.workDescription}</p>
                  </div>

                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Bill Number</p>
                    <p className="font-medium">{selectedBillData.billNo}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Date of Measurement</p>
                    <p className="font-medium">
                      {format(new Date(selectedBillData.dateOfMeasurement), 'dd MMMM yyyy')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">Quarter</p>
                    <p className="font-medium">{selectedBillData.quarter}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Detailed Calculation Steps */}
          {showCalculationSteps && calculationSteps && !isTabContentCollapsed && (
            <div className="space-y-6">
              <Card className="border-0 shadow-lg bg-gradient-to-r from-orange-50 to-red-50">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-2xl text-orange-900 flex items-center gap-3">
                        <Calculator className="h-7 w-7" />
                        Step-by-Step PVC Calculation
                      </CardTitle>
                      <CardDescription className="text-orange-700">
                        Detailed breakdown of the 4-step PVC calculation formula for {calculationSteps.bill.billNo}
                      </CardDescription>
                    </div>
                    <Button 
                      onClick={() => setShowCalculationSteps(false)}
                      variant="outline"
                      size="sm"
                      className="bg-white hover:bg-orange-50 border-orange-200"
                    >
                      Close
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-white rounded-lg p-6 border border-orange-200">
                    <div className="text-center mb-8">
                      <h3 className="text-xl font-bold text-gray-900 mb-2">
                        PVC Calculation Formula
                      </h3>
                      <div className="bg-blue-50 p-4 rounded-lg inline-block">
                        <code className="text-blue-800 font-mono text-lg">
                          PVC = (Bill Amount × (Avg_Index - Base_Index) × Component%) ÷ Base_Index
                        </code>
                      </div>
                      <p className="text-sm text-gray-600 mt-3">
                        Applied as a 4-step process for each component
                      </p>
                    </div>

                    {/* Component Calculations */}
                    {Object.entries(calculationSteps.calculationSteps).map(([componentKey, stepData], index) => (
                      <div key={componentKey} className="mb-8 last:mb-0">
                        <div className="border-2 border-gray-200 rounded-lg overflow-hidden">
                          {/* Component Header */}
                          <div className="bg-gradient-to-r from-gray-100 to-gray-200 px-6 py-4 border-b">
                            <div className="flex justify-between items-center">
                              <div>
                                <h4 className="text-lg font-bold text-gray-900">
                                  {stepData.componentName} ({stepData.componentPercentage}%)
                                </h4>
                                <p className="text-sm text-gray-600">{stepData.indexSource}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm text-gray-600">Final PVC Amount</p>
                                <p className="text-xl font-bold text-green-700">
                                  ₹{stepData.finalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                </p>
                              </div>
                            </div>
                            
                            {/* Formula for this component */}
                            <div className="mt-3 p-3 bg-blue-50 rounded border-l-4 border-blue-400">
                              <p className="text-sm font-medium text-blue-800">Formula:</p>
                              <code className="text-xs text-blue-700 font-mono">
                                {stepData.formula}
                              </code>
                            </div>
                          </div>

                          {/* 4-Step Calculation */}
                          <div className="p-6 bg-white">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {/* Step 1 & 2 */}
                              <div className="space-y-4">
                                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-8 h-8 bg-yellow-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
                                      1
                                    </div>
                                    <h5 className="font-semibold text-gray-900">
                                      {stepData.steps.step1.description}
                                    </h5>
                                  </div>
                                  <p className="text-sm text-gray-700 mb-2">
                                    <strong>Calculation:</strong> {stepData.steps.step1.calculation}
                                  </p>
                                  <p className="text-lg font-bold text-yellow-800">
                                    = {stepData.steps.step1.result.toFixed(2)}
                                  </p>
                                </div>

                                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
                                      2
                                    </div>
                                    <h5 className="font-semibold text-gray-900">
                                      {stepData.steps.step2.description}
                                    </h5>
                                  </div>
                                  <p className="text-sm text-gray-700 mb-2">
                                    <strong>Calculation:</strong> {stepData.steps.step2.calculation}
                                  </p>
                                  <p className="text-lg font-bold text-green-800">
                                    = ₹{stepData.steps.step2.result.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                  </p>
                                </div>
                              </div>

                              {/* Step 3 & 4 */}
                              <div className="space-y-4">
                                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
                                      3
                                    </div>
                                    <h5 className="font-semibold text-gray-900">
                                      {stepData.steps.step3.description}
                                    </h5>
                                  </div>
                                  <p className="text-sm text-gray-700 mb-2">
                                    <strong>Calculation:</strong> {stepData.steps.step3.calculation}
                                  </p>
                                  <p className="text-lg font-bold text-blue-800">
                                    = ₹{stepData.steps.step3.result.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                  </p>
                                </div>

                                <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-8 h-8 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
                                      4
                                    </div>
                                    <h5 className="font-semibold text-gray-900">
                                      {stepData.steps.step4.description}
                                    </h5>
                                  </div>
                                  <p className="text-sm text-gray-700 mb-2">
                                    <strong>Calculation:</strong> {stepData.steps.step4.calculation}
                                  </p>
                                  <p className="text-xl font-bold text-purple-800 border-t border-purple-200 pt-2 mt-2">
                                    = ₹{stepData.steps.step4.result.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                  </p>
                                  <p className="text-xs text-purple-600 mt-1">Final PVC for {stepData.componentName}</p>
                                </div>
                              </div>
                            </div>

                            {/* Index Values Summary */}
                            <div className="mt-6 pt-4 border-t border-gray-200">
                              <div className="grid grid-cols-3 gap-4 text-center">
                                <div>
                                  <p className="text-sm text-gray-600">Base Index</p>
                                  <p className="font-bold text-gray-900">{stepData.baseIndex}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-gray-600">Average Index</p>
                                  <p className="font-bold text-blue-700">{stepData.averageIndex.toFixed(2)}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-gray-600">Component %</p>
                                  <p className="font-bold text-orange-700">{stepData.componentPercentage}%</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Total Summary */}
                    <div className="mt-8 pt-6 border-t-2 border-gray-300">
                      <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-lg border-2 border-green-200">
                        <div className="text-center">
                          <h3 className="text-xl font-bold text-green-900 mb-4">
                            Total PVC Calculation Summary
                          </h3>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            <div className="text-left space-y-2">
                              {Object.entries(calculationSteps.calculationSteps).map(([key, stepData]) => (
                                <div key={key} className="flex justify-between">
                                  <span className="text-sm text-gray-700">{stepData.componentName}:</span>
                                  <span className="font-medium">₹{stepData.finalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                                </div>
                              ))}
                              {calculationSteps.summary.dedicatedCementPvc > 0 && (
                                <div className="flex justify-between border-t pt-2">
                                  <span className="text-sm text-gray-700">Dedicated Cement (85%):</span>
                                  <span className="font-medium">₹{calculationSteps.summary.dedicatedCementPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                                </div>
                              )}
                              {calculationSteps.summary.dedicatedSteelPvc > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-sm text-gray-700">Dedicated Steel (85%):</span>
                                  <span className="font-medium">₹{calculationSteps.summary.dedicatedSteelPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col justify-center">
                              <div className="text-center p-4 bg-white rounded-lg border border-green-300">
                                <p className="text-lg text-green-800 font-medium">Total PVC Amount</p>
                                <p className="text-3xl font-bold text-green-900">
                                  ₹{calculationSteps.summary.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Classification Info */}
                          {calculationSteps.classification && (
                            <div className="text-center p-3 bg-blue-50 rounded border border-blue-200">
                              <p className="text-sm text-blue-800">
                                <strong>Classification:</strong> {calculationSteps.classification.code} - {calculationSteps.classification.name}
                                <br />
                                <span className="text-xs">{calculationSteps.classification.description}</span>
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Collapsed Content Indicator */}
          {isTabContentCollapsed && (activeTab === 'calculation' || activeTab === 'report') && (
            <Card className="border-0 shadow-lg bg-gray-50">
              <CardContent className="py-8">
                <div className="text-center text-gray-500">
                  <Minimize2 className="h-8 w-8 mx-auto mb-2" />
                  <p className="text-sm">
                    {activeTab === 'calculation' ? 'Calculation Steps' : 'Detailed Report'} content is collapsed.
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Click the expand button in the tab bar to show content.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Detailed Monthly Report */}
          {showDetailedReport && detailedReport && !isTabContentCollapsed && (
            <div className="space-y-6">
              {/* Report Metadata */}
              <Card className="border-0 shadow-lg bg-gradient-to-r from-indigo-50 to-blue-50">
                <CardHeader>
                  <CardTitle className="text-xl text-indigo-900">Detailed Monthly Price Index Report</CardTitle>
                  <CardDescription>
                    Complete breakdown of monthly indices from base month to measurement date
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Base Month</p>
                      <p className="text-lg font-bold text-indigo-900">{detailedReport.reportMetadata.baseMonth}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Calculation Period</p>
                      <p className="text-lg font-bold text-indigo-900">{detailedReport.reportMetadata.startMonth}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Total Months</p>
                      <p className="text-lg font-bold text-indigo-900">{detailedReport.reportMetadata.totalMonths}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Quarter</p>
                      <p className="text-lg font-bold text-indigo-900">{detailedReport.reportMetadata.quarter}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Monthly Index Values Table */}
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle>Monthly Price Index Values</CardTitle>
                  <CardDescription>
                    All price indices from {detailedReport.reportMetadata.startMonth} to {detailedReport.reportMetadata.measurementDate}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b-2 border-gray-200 bg-gray-50">
                          <th className="text-left p-3 font-semibold">Month</th>
                          <th className="text-center p-3 font-semibold">Labour</th>
                          <th className="text-center p-3 font-semibold">RBI Plant</th>
                          <th className="text-center p-3 font-semibold">MPNG Fuel</th>
                          <th className="text-center p-3 font-semibold">RBI Materials</th>
                          <th className="text-center p-3 font-semibold">RBI Cement</th>
                          <th className="text-center p-3 font-semibold">RBI Explosives</th>
                          <th className="text-center p-3 font-semibold">Steel TMT</th>
                          <th className="text-center p-3 font-semibold">Steel A/C</th>
                          <th className="text-center p-3 font-semibold">Steel Plates</th>
                          <th className="text-center p-3 font-semibold">Steel Others</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailedReport.monthlyData.map((monthData, index) => (
                          <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="p-3 font-medium text-blue-900">{monthData.monthName}</td>
                            {['Labour', 'RBI Plant Machinery', 'MPNG Fuel', 'RBI Other Materials', 'RBI Cement', 'RBI Explosives', 'Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'].map((indexName) => {
                              const indexData = monthData.indices.find(i => i.indexName === indexName);
                              return (
                                <td key={indexName} className="p-3 text-center">
                                  {indexData?.available ? (
                                    <span className="font-medium text-green-700">
                                      {indexData.currentValue?.toFixed(2)}
                                    </span>
                                  ) : (
                                    <span className="text-red-500 text-sm">N/A</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Quarterly Average Calculations */}
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle>Quarterly Average Calculations</CardTitle>
                  <CardDescription>
                    Quarter: {detailedReport.reportMetadata.quarter} ({detailedReport.reportMetadata.quarterMonths.join(', ')})
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {detailedReport.quarterlyBreakdown.map((qData, index) => (
                      <div key={index} className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                        <h4 className="font-bold text-lg text-gray-900 mb-3">{qData.indexName}</h4>
                        
                        <div className="space-y-2 mb-4">
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Base Value:</span>
                            <span className="font-medium">{qData.baseValue}</span>
                          </div>
                          
                          {qData.monthlyValues.length > 0 ? (
                            <>
                              <div className="text-sm text-gray-700">
                                <p className="font-medium mb-1">Monthly Values:</p>
                                {qData.monthlyValues.map((mv, mvIndex) => (
                                  <div key={mvIndex} className="flex justify-between ml-2">
                                    <span>{mv.month}:</span>
                                    <span className="font-medium">{mv.value}</span>
                                  </div>
                                ))}
                              </div>
                              
                              <div className="border-t pt-2 mt-2">
                                <div className="flex justify-between">
                                  <span className="text-sm text-gray-600">Quarterly Average:</span>
                                  <span className="font-bold text-blue-700">{qData.average?.toFixed(2) || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-sm text-gray-600">Variation (%):</span>
                                  <span className={`font-bold ${qData.variation && qData.variation > 0 ? 'text-green-700' : qData.variation && qData.variation < 0 ? 'text-red-700' : 'text-gray-700'}`}>
                                    {qData.variation ? `${qData.variation > 0 ? '+' : ''}${qData.variation.toFixed(2)}%` : 'N/A'}
                                  </span>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="text-sm text-red-600 italic">
                              No data available for this quarter
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Quarterly Averages Summary */}
              <Card className="border-0 shadow-lg bg-gradient-to-r from-green-50 to-emerald-50">
                <CardHeader>
                  <CardTitle className="text-xl text-green-900">Quarter End - Quarterly Averages Summary</CardTitle>
                  <CardDescription>
                    Summary of quarterly averages for {detailedReport.reportMetadata.quarter} period
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="bg-white rounded-lg p-6 border border-green-200">
                    <h3 className="text-lg font-bold text-green-900 mb-4">
                      Quarterly Averages - {detailedReport.reportMetadata.quarter}
                    </h3>
                    <p className="text-sm text-gray-600 mb-6">
                      Calculation Period: {detailedReport.reportMetadata.quarterMonths.join(', ')}
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {detailedReport.quarterlyBreakdown
                        .filter(qData => ['Labour', 'RBI Plant Machinery', 'MPNG Fuel', 'RBI Other Materials'].includes(qData.indexName))
                        .map((qData, index) => (
                        <div key={index} className="p-4 border border-gray-300 rounded-lg bg-gray-50">
                          <div className="flex justify-between items-center mb-2">
                            <h4 className="font-bold text-base text-gray-900">{qData.indexName}</h4>
                            <Badge variant="outline" className="bg-white">
                              {(() => {
                                const billClassification = selectedBillData.workClassification;
                                
                                if (!billClassification) {
                                  return '0%';
                                }
                                
                                if (qData.indexName === 'Labour') {
                                  return `${billClassification.labour}%`;
                                } else if (qData.indexName === 'RBI Plant Machinery') {
                                  return `${billClassification.plantMachinery}%`;
                                } else if (qData.indexName === 'MPNG Fuel') {
                                  return `${billClassification.fuel}%`;
                                } else if (qData.indexName === 'RBI Other Materials') {
                                  return `${billClassification.otherMaterials}%`;
                                } else if (qData.indexName === 'RBI Cement') {
                                  return `${billClassification.cement}%`;
                                } else if (qData.indexName.includes('Steel')) {
                                  return `${billClassification.steel}%`;
                                } else if (qData.indexName === 'RBI Explosives') {
                                  return `${billClassification.explosives}%`;
                                }
                                return '0%';
                              })()}
                            </Badge>
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Base Index:</span>
                              <span className="font-medium">{qData.baseValue}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Average Index:</span>
                              <span className="font-bold text-blue-700">
                                {qData.average?.toFixed(2) || 'N/A'}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm border-t pt-2">
                              <span className="text-gray-600">Variation:</span>
                              <span className={`font-bold ${qData.variation && qData.variation > 0 ? 'text-green-700' : qData.variation && qData.variation < 0 ? 'text-red-700' : 'text-gray-700'}`}>
                                {qData.variation ? `${qData.variation > 0 ? '+' : ''}${qData.variation.toFixed(2)}%` : 'N/A'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="mt-6 pt-4 border-t border-green-200">
                      <div className="text-center">
                        <p className="text-lg font-bold text-green-900">
                          Quarter {detailedReport.reportMetadata.quarter} - End of Period Summary
                        </p>
                        <p className="text-sm text-gray-600 mt-2">
                          These quarterly averages are used for PVC calculation using formula:
                        </p>
                        <div className="mt-3 p-3 bg-blue-50 rounded-lg inline-block">
                          <code className="text-sm text-blue-800 font-mono">
                            PVC = (Bill Amount × (Avg_Index - Base_Index) × Component%) / Base_Index
                          </code>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Close Detailed Report Button */}
              <div className="text-center">
                <Button 
                  onClick={() => setShowDetailedReport(false)}
                  variant="outline"
                  className="bg-white hover:bg-gray-50"
                >
                  Close Detailed Report
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : selectedBill ? (
        <Card className="border-0 shadow-lg">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calculator className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No PVC calculation found</h3>
            <p className="text-gray-600 text-center">
              The selected bill does not have PVC calculations available.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-0 shadow-lg">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Select a bill to view report</h3>
            <p className="text-gray-600 text-center">
              Choose a contract and bill from the filters above to see detailed PVC calculations.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center min-h-64">
        <LoadingSpinner size="lg" text="Loading reports..." />
      </div>
    }>
      <ReportsPageContent />
    </Suspense>
  );
}
