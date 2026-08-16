
'use client';

import { useState, useEffect, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StatusMessage } from '@/components/ui/status-message';
import { Printer, Calculator, Download, FileText } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { BackButton } from '@/components/ui/back-button';
import { format } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';
import toast from 'react-hot-toast';

interface DetailedReport {
  bill: {
    id: string;
    billNo: string;
    billAmount: number;
    dateOfMeasurement: Date;
    quarter: string;
    cementAmount: number;
    steelAmount: number;
    selectedSteelComponent?: string;
    subClassifications?: Array<{ code: string; name: string; amount: number }>;
    nonScheduleItems?: Array<{ description: string; amount: number }>;
    nonScheduleAmount?: number;
    dateOfCompletion?: Date;
    isFinalPvc?: boolean;
  };
  contract: {
    agreementNo: string;
    contractorName: string;
    workDescription: string;
    dateOfOpening: Date;
    baseMonth: Date;
  };
  workClassification: {
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
  } | null;
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
    cementAmount: number;
    steelAmount: number;
    selectedSteelComponent: string | null;
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
  dedicatedCementCalculation?: {
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
  } | null;
  comprehensiveSteelCalculation?: {
    selectedComponent: {
      finalPvc: number;
      steps: any;
      formula: string;
      averageIndex: number;
      baseIndex: number;
      componentPercentage: number;
      componentName: string;
      indexSource: string;
      selectedComponent: string;
    } | null;
    allSteelComponents: {
      [key: string]: {
        finalPvc: number;
        averageIndex: number;
        baseIndex: number;
        variation: number;
        available: boolean;
        componentName: string;
        indexSource: string;
      };
    };
    totalAmount: number;
  } | null;
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

function FullPvcReportContent() {
  const params = useParams();
  const billId = params?.billId as string;
  
  const [detailedReport, setDetailedReport] = useState<DetailedReport | null>(null);
  const [calculationSteps, setCalculationSteps] = useState<CalculationSteps | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (billId) {
      fetchFullReport();
    }
  }, [billId]);

  const fetchFullReport = async () => {
    try {
      setIsLoading(true);
      setError('');
      
      const [detailedResponse, calculationResponse] = await Promise.all([
        fetch(`/api/bills/${billId}/detailed-report`),
        fetch(`/api/bills/${billId}/calculation-steps`)
      ]);

      // Both failures used to collapse into one blank "Failed to fetch report data",
      // throwing away the only sentence that tells the user what to do — that the bill
      // has no work classification, or no calculation, or is not theirs. Read it back.
      if (!detailedResponse.ok || !calculationResponse.ok) {
        const failed = !detailedResponse.ok ? detailedResponse : calculationResponse;
        const reason = await failed
          .json()
          .then((body) => body?.error || body?.message)
          .catch(() => null);
        throw new Error(
          reason
          || (failed.status === 403
            ? 'This bill belongs to another account.'
            : `The report could not be built (${failed.status}).`),
        );
      }

      const detailedData = await detailedResponse.json();
      const calculationData = await calculationResponse.json();
      
      setDetailedReport(detailedData);
      setCalculationSteps(calculationData);
    } catch (error: any) {
      console.error('Error fetching full report:', error);
      setError(error.message || 'Failed to fetch report data');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch(`/api/bills/${billId}/pdf-report?format=ir_standard`);
      if (!response.ok) {
        const reason = await response.json().then((b) => b?.error).catch(() => null);
        throw new Error(reason || `The PDF could not be built (${response.status}).`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PVC_Report_${detailedReport?.bill.billNo}_${format(toISTDate(new Date()), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      // This used to be console.error alone: the button did nothing, said nothing, and
      // gave no hint that anything had been attempted.
      console.error('Error downloading PDF:', error);
      toast.error(error?.message || 'The PDF could not be downloaded.', { duration: 8000 });
    } finally {
      setIsDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <LoadingSpinner size="lg" text="Loading full PVC report..." />
      </div>
    );
  }

  // Both of these are ends of the road, so both need a way onward. "Back to Reports"
  // pointed at /reports, which has no page — the one button on the error screen was a
  // 404. The bill itself is the useful destination: it is where the report is fixed.
  if (error || !detailedReport || !calculationSteps) {
    return (
      <div className="p-6">
        <StatusMessage
          type="error"
          title="This report could not be opened"
          message={error || 'The report came back empty.'}
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="outline" onClick={fetchFullReport}>Try again</Button>
          <BackButton href={`/bills/${billId}`} label="Open the bill" variant="outline" />
          <BackButton href="/bills" label="All bills" variant="outline" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white">
      {/* Enhanced Print/Download Controls - Hidden in print */}
      <div className="no-print bg-gradient-to-r from-gray-50 via-emerald-50 to-emerald-50 border-b border-gray-200 p-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <BackButton href="/reports" label="Back to Reports" variant="outline" size="lg" className="hover:bg-white" />
          
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <div className="bg-gradient-to-r from-emerald-100 to-green-100 rounded-xl px-6 py-3 border border-emerald-200">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-emerald-600" />
                <span className="text-sm font-semibold text-emerald-800">Full Report View</span>
              </div>
              <p className="text-xs text-emerald-700 mt-1">Bill: {detailedReport.bill.billNo}</p>
            </div>
            
            <div className="flex gap-2">
              <Button 
                onClick={handlePrint}
                className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg"
                size="lg"
              >
                <Printer className="h-5 w-5 mr-2" />
                Print Report
              </Button>
              
              <Button 
                onClick={handleDownloadPdf}
                disabled={isDownloading}
                variant="outline"
                className="hover:bg-gray-50 shadow-lg"
                size="lg"
              >
                <Download className="h-5 w-5 mr-2" />
                {isDownloading ? 'Building the PDF…' : 'PDF Download'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Report Content - Optimized for printing */}
      <div className="report-content-container max-w-7xl mx-auto p-8 print:p-4 print:max-w-none">
        
        {/* Report Header */}
        <div className="text-center mb-8 print:mb-6">
          <div className="bg-emerald-600 text-white py-4 px-6 rounded-lg mb-4 print:bg-emerald-600 print:rounded-none print:mb-2">
            <h1 className="text-2xl font-bold print:text-xl">INDIAN RAILWAY</h1>
            <h2 className="text-xl font-semibold print:text-lg">PRICE VARIATION CALCULATION (PVC) REPORT</h2>
            <h3 className="text-lg print:text-base">FULL DETAILED REPORT</h3>
          </div>
          <div className="bg-emerald-500 text-white py-2 px-4 rounded print:bg-emerald-500 print:rounded-none">
            <h4 className="font-bold">Bill No: {detailedReport.bill.billNo} | Quarter: {detailedReport.bill.quarter}</h4>
          </div>
        </div>

        {/* Contract and Bill Information */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 print:gap-4 print:mb-6">
          <div className="bg-gray-50 p-6 rounded-lg print:bg-white print:border print:border-gray-300 print:rounded-none print:p-4">
            <h3 className="text-lg font-bold mb-4 text-gray-900">Contract Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="font-medium">Agreement No:</span>
                <span>{detailedReport.contract.agreementNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Contractor:</span>
                <span>{detailedReport.contract.contractorName}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Work Description:</span>
                <span className="text-right">{detailedReport.contract.workDescription}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Date of Opening:</span>
                <span>{format(new Date(detailedReport.contract.dateOfOpening), 'dd/MM/yyyy')}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Base Month:</span>
                <span>{format(new Date(detailedReport.contract.baseMonth), 'MMMM yyyy')}</span>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-50 p-6 rounded-lg print:bg-white print:border print:border-gray-300 print:rounded-none print:p-4">
            <h3 className="text-lg font-bold mb-4 text-gray-900">Bill Information</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="font-medium">Bill Number:</span>
                <span>{detailedReport.bill.billNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Bill Amount:</span>
                <span className="font-bold">₹{detailedReport.bill.billAmount.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Date of Measurement:</span>
                <span>{format(new Date(detailedReport.bill.dateOfMeasurement), 'dd/MM/yyyy')}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Quarter:</span>
                <span>{detailedReport.bill.quarter}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">PVC Amount:</span>
                <span className="font-bold text-green-600">₹{detailedReport.pvcCalculation.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Cumulative PVC:</span>
                <span className="font-bold text-emerald-600">₹{detailedReport.pvcCalculation.cumulativePvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              </div>
              {(detailedReport.bill.cementAmount && detailedReport.bill.cementAmount > 0) && (
                <div className="flex justify-between">
                  <span className="font-medium">Cement Amount:</span>
                  <span className="font-bold text-orange-600">₹{detailedReport.bill.cementAmount.toLocaleString('en-IN')}</span>
                </div>
              )}
              {(detailedReport.bill.steelAmount && detailedReport.bill.steelAmount > 0) && (
                <div className="flex justify-between">
                  <span className="font-medium">Steel Amount:</span>
                  <span className="font-bold text-emerald-700">₹{detailedReport.bill.steelAmount.toLocaleString('en-IN')}</span>
                </div>
              )}
              {detailedReport.bill.isFinalPvc && detailedReport.bill.dateOfCompletion && (
                <div className="flex justify-between">
                  <span className="font-medium">Date of Completion:</span>
                  <span className="font-bold text-green-600">{format(new Date(detailedReport.bill.dateOfCompletion), 'dd/MM/yyyy')}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sub-Classifications Section */}
        {detailedReport.bill.subClassifications && detailedReport.bill.subClassifications.length > 0 && (
          <div className="mb-8 print:mb-6">
            <div className="bg-emerald-50 p-6 rounded-lg print:bg-white print:border print:border-gray-300 print:rounded-none print:p-4">
              <h3 className="text-lg font-bold mb-4 text-gray-900">Sub-Classifications</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-300">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">S.No.</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                      <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {detailedReport.bill.subClassifications.map((subClass, index) => (
                      <tr key={index}>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">{index + 1}</td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{subClass.code}</td>
                        <td className="px-3 py-4 text-sm text-gray-900">{subClass.name}</td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                          ₹{subClass.amount.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gray-100 font-bold">
                      <td colSpan={3} className="px-3 py-4 text-sm text-gray-900 text-right">Total:</td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        ₹{detailedReport.bill.subClassifications.reduce((sum, sc) => sum + sc.amount, 0).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Non-Schedule Items Section */}
        {detailedReport.bill.nonScheduleItems && detailedReport.bill.nonScheduleItems.length > 0 && (
          <div className="mb-8 print:mb-6">
            <div className="bg-red-50 p-6 rounded-lg print:bg-white print:border print:border-gray-300 print:rounded-none print:p-4">
              <h3 className="text-lg font-bold mb-4 text-gray-900">Non-Schedule Items (Deductions)</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-300">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">S.No.</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                      <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {detailedReport.bill.nonScheduleItems.map((item, index) => (
                      <tr key={index}>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">{index + 1}</td>
                        <td className="px-3 py-4 text-sm text-gray-900">{item.description}</td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                          ₹{item.amount.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-red-100 font-bold">
                      <td colSpan={2} className="px-3 py-4 text-sm text-gray-900 text-right">Total Deduction:</td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-red-700 text-right">
                        -₹{detailedReport.bill.nonScheduleItems.reduce((sum, item) => sum + item.amount, 0).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-sm text-gray-600 italic">
                Note: These amounts are deducted from the gross bill amount for PVC calculation.
                {detailedReport.bill.nonScheduleItems && (
                  <span className="ml-1">
                    Effective Bill Amount: ₹{(detailedReport.bill.billAmount - detailedReport.bill.nonScheduleItems.reduce((sum, item) => sum + item.amount, 0)).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Work Classification - Removed as per user request */}

        {/* Detailed Component Calculation Breakdown */}
        <div className="mb-8 print:mb-6">
          <h3 className="text-xl font-bold mb-4 text-gray-900">Detailed PVC Component Calculation</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border-2 border-gray-800 text-sm">
              <thead>
                <tr className="bg-gray-800 text-white print:bg-gray-800 print:text-white">
                  <th className="border border-gray-300 p-3 text-left font-bold">Component</th>
                  <th className="border border-gray-300 p-3 text-left font-bold">Calculation Formula</th>
                  <th className="border border-gray-300 p-3 text-right font-bold">PVC Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {/* Fixed Component */}
                <tr className="bg-gray-50 print:bg-white">
                  <td className="border border-gray-300 p-3 font-medium">
                    Fixed Component ({detailedReport.workClassification?.fixed || 0}%) (As per Classification {detailedReport.workClassification?.code || ''})
                  </td>
                  <td className="border border-gray-300 p-3 italic text-gray-600">
                    Not subject to price variation
                  </td>
                  <td className="border border-gray-300 p-3 text-right font-bold">
                    0.00
                  </td>
                </tr>

                {/* Labour */}
                {Object.entries(calculationSteps.calculationSteps)
                  .filter(([key, stepData]) => stepData.componentName.toLowerCase().includes('labour'))
                  .map(([key, stepData]) => (
                    <tr key={key} className="bg-white">
                      <td className="border border-gray-300 p-3 font-medium">
                        Labour ({stepData.componentPercentage}%) (As per Classification {detailedReport.workClassification?.code || ''})
                      </td>
                      <td className="border border-gray-300 p-3 font-mono text-xs">
                        {detailedReport.bill.billAmount.toLocaleString('en-IN')} × [({stepData.averageIndex?.toFixed(2) || '0.00'} - {stepData.baseIndex?.toFixed(2) || '0.00'}) ÷ {stepData.baseIndex?.toFixed(2) || '0.00'}] × {stepData.componentPercentage}%
                      </td>
                      <td className="border border-gray-300 p-3 text-right font-bold">
                        {stepData.finalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                }

                {/* Plant Machinery & Spares */}
                {Object.entries(calculationSteps.calculationSteps)
                  .filter(([key, stepData]) => stepData.componentName.toLowerCase().includes('plant'))
                  .map(([key, stepData]) => (
                    <tr key={key} className="bg-white">
                      <td className="border border-gray-300 p-3 font-medium">
                        Plant Machinery & Spares ({stepData.componentPercentage}%) (As per Classification {detailedReport.workClassification?.code || ''})
                      </td>
                      <td className="border border-gray-300 p-3 font-mono text-xs">
                        {detailedReport.bill.billAmount.toLocaleString('en-IN')} × [({stepData.averageIndex?.toFixed(2) || '0.00'} - {stepData.baseIndex?.toFixed(2) || '0.00'}) ÷ {stepData.baseIndex?.toFixed(2) || '0.00'}] × {stepData.componentPercentage}%
                      </td>
                      <td className="border border-gray-300 p-3 text-right font-bold">
                        {stepData.finalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                }

                {/* Fuel & Lubricants */}
                {Object.entries(calculationSteps.calculationSteps)
                  .filter(([key, stepData]) => stepData.componentName.toLowerCase().includes('fuel'))
                  .map(([key, stepData]) => (
                    <tr key={key} className="bg-white">
                      <td className="border border-gray-300 p-3 font-medium">
                        Fuel & Lubricants ({stepData.componentPercentage}%) (As per Classification {detailedReport.workClassification?.code || ''})
                      </td>
                      <td className="border border-gray-300 p-3 font-mono text-xs">
                        {detailedReport.bill.billAmount.toLocaleString('en-IN')} × [({stepData.averageIndex?.toFixed(2) || '0.00'} - {stepData.baseIndex?.toFixed(2) || '0.00'}) ÷ {stepData.baseIndex?.toFixed(2) || '0.00'}] × {stepData.componentPercentage}%
                      </td>
                      <td className="border border-gray-300 p-3 text-right font-bold">
                        {stepData.finalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                }

                {/* Other Materials Component */}
                {Object.entries(calculationSteps.calculationSteps)
                  .filter(([key, stepData]) => stepData.componentName.toLowerCase().includes('other'))
                  .map(([key, stepData]) => (
                    <tr key={key} className="bg-white">
                      <td className="border border-gray-300 p-3 font-medium">
                        Other Materials ({stepData.componentPercentage}%) (As per Classification {detailedReport.workClassification?.code || ''})
                      </td>
                      <td className="border border-gray-300 p-3 font-mono text-xs">
                        {detailedReport.bill.billAmount.toLocaleString('en-IN')} × [({stepData.averageIndex?.toFixed(2) || '0.00'} - {stepData.baseIndex?.toFixed(2) || '0.00'}) ÷ {stepData.baseIndex?.toFixed(2) || '0.00'}] × {stepData.componentPercentage}%
                      </td>
                      <td className="border border-gray-300 p-3 text-right font-bold">
                        {stepData.finalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                }

                {/* Cement Component (if applicable) */}
                {calculationSteps.summary.cementPvc !== 0 && (
                  Object.entries(calculationSteps.calculationSteps)
                    .filter(([key, stepData]) => stepData.componentName.toLowerCase().includes('cement'))
                    .map(([key, stepData]) => (
                      <tr key={key} className="bg-orange-50 print:bg-gray-50">
                        <td className="border border-gray-300 p-3 font-medium">
                          Cement Component ({stepData.componentPercentage}%) (As per Classification {detailedReport.workClassification?.code || ''})
                        </td>
                        <td className="border border-gray-300 p-3 font-mono text-xs">
                          {detailedReport.bill.billAmount.toLocaleString('en-IN')} × [({stepData.averageIndex?.toFixed(2) || '0.00'} - {stepData.baseIndex?.toFixed(2) || '0.00'}) ÷ {stepData.baseIndex?.toFixed(2) || '0.00'}] × {stepData.componentPercentage}%
                        </td>
                        <td className="border border-gray-300 p-3 text-right font-bold">
                          {stepData.finalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))
                )}

                {/* Steel Component (if applicable) */}
                {calculationSteps.summary.steelPvc !== 0 && (
                  Object.entries(calculationSteps.calculationSteps)
                    .filter(([key, stepData]) => stepData.componentName.toLowerCase().includes('steel'))
                    .map(([key, stepData]) => (
                      <tr key={key} className="bg-emerald-50 print:bg-gray-50">
                        <td className="border border-gray-300 p-3 font-medium">
                          Steel Component ({stepData.componentPercentage}%) (As per Classification {detailedReport.workClassification?.code || ''})
                        </td>
                        <td className="border border-gray-300 p-3 font-mono text-xs">
                          {detailedReport.bill.billAmount.toLocaleString('en-IN')} × [({stepData.averageIndex?.toFixed(2) || '0.00'} - {stepData.baseIndex?.toFixed(2) || '0.00'}) ÷ {stepData.baseIndex?.toFixed(2) || '0.00'}] × {stepData.componentPercentage}%
                        </td>
                        <td className="border border-gray-300 p-3 text-right font-bold">
                          {stepData.finalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))
                )}

                {/* Dedicated Cement (if applicable) */}
                {(detailedReport.bill.cementAmount && detailedReport.bill.cementAmount > 0) && (
                  <tr className="bg-orange-100 print:bg-gray-100">
                    <td className="border border-gray-300 p-3 font-medium">
                      Dedicated Cement Component (85%)
                    </td>
                    <td className="border border-gray-300 p-3 font-mono text-xs">
                      {detailedReport.bill.cementAmount.toLocaleString('en-IN')} × [({calculationSteps.dedicatedCementCalculation?.averageIndex.toFixed(2) || '0.00'} - {calculationSteps.dedicatedCementCalculation?.baseIndex.toFixed(2) || '0.00'}) ÷ {calculationSteps.dedicatedCementCalculation?.baseIndex.toFixed(2) || '0.00'}] × 85%
                    </td>
                    <td className="border border-gray-300 p-3 text-right font-bold">
                      {calculationSteps.summary.dedicatedCementPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                )}

                {/* Dedicated Steel (if applicable) */}
                {(detailedReport.bill.steelAmount && detailedReport.bill.steelAmount > 0) && (
                  <tr className="bg-emerald-100 print:bg-gray-100">
                    <td className="border border-gray-300 p-3 font-medium">
                      Dedicated Steel Component (85%)
                    </td>
                    <td className="border border-gray-300 p-3 font-mono text-xs">
                      {detailedReport.bill.steelAmount.toLocaleString('en-IN')} × [({calculationSteps.comprehensiveSteelCalculation?.selectedComponent?.averageIndex.toFixed(2) || '0.00'} - {calculationSteps.comprehensiveSteelCalculation?.selectedComponent?.baseIndex.toFixed(2) || '0.00'}) ÷ {calculationSteps.comprehensiveSteelCalculation?.selectedComponent?.baseIndex.toFixed(2) || '0.00'}] × 85%
                    </td>
                    <td className="border border-gray-300 p-3 text-right font-bold">
                      {calculationSteps.summary.dedicatedSteelPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                )}

                {/* Total Row */}
                <tr className="bg-green-600 text-white print:bg-gray-800 print:text-white font-bold">
                  <td className="border border-gray-300 p-3 text-lg">TOTAL PVC AMOUNT</td>
                  <td className="border border-gray-300 p-3 text-center">Sum of all components</td>
                  <td className="border border-gray-300 p-3 text-right text-xl">
                    {calculationSteps.summary.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-4 text-xs text-gray-600 italic">
            * Formula: Bill Amount × [(Current Index - Base Index) ÷ Base Index] × Component Percentage
            <br />
            * All calculations are based on the quarterly average indices for the measurement period
          </div>
        </div>

        {/* PVC Summary */}
        <div className="mb-8 print:mb-6">
          <h3 className="text-xl font-bold mb-4 text-gray-900">PVC Calculation Summary</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300 text-sm">
              <thead>
                <tr className="bg-emerald-100 print:bg-gray-100">
                  <th className="border border-gray-300 p-3 text-left font-semibold">Component</th>
                  <th className="border border-gray-300 p-3 text-right font-semibold">Percentage</th>
                  <th className="border border-gray-300 p-3 text-right font-semibold">PVC Amount (₹)</th>
                  <th className="border border-gray-300 p-3 text-left font-semibold">Index Source</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(calculationSteps.calculationSteps).map(([key, stepData]) => (
                  <tr key={key} className="hover:bg-gray-50">
                    <td className="border border-gray-300 p-3 font-medium">{stepData.componentName}</td>
                    <td className="border border-gray-300 p-3 text-right">{stepData.componentPercentage}%</td>
                    <td className="border border-gray-300 p-3 text-right font-medium">
                      {stepData.finalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="border border-gray-300 p-3 text-sm text-gray-600">{stepData.indexSource}</td>
                  </tr>
                ))}
                
                {/* Dedicated Cement - Always Show */}
                <tr className="bg-orange-50 print:bg-gray-50">
                  <td className="border border-gray-300 p-3 font-medium">Dedicated Cement (85%)</td>
                  <td className="border border-gray-300 p-3 text-right">
                    {detailedReport.bill.cementAmount && detailedReport.bill.cementAmount > 0 ? '85%' : '-'}
                  </td>
                  <td className="border border-gray-300 p-3 text-right font-medium">
                    {calculationSteps.summary.dedicatedCementPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>
                  <td className="border border-gray-300 p-3 text-sm text-gray-600">RBI Cement, Lime & Plaster</td>
                </tr>
                
                {/* Dedicated Steel - Always Show */}
                <tr className="bg-orange-50 print:bg-gray-50">
                  <td className="border border-gray-300 p-3 font-medium">Dedicated Steel (85%)</td>
                  <td className="border border-gray-300 p-3 text-right">
                    {detailedReport.bill.steelAmount && detailedReport.bill.steelAmount > 0 ? '85%' : '-'}
                  </td>
                  <td className="border border-gray-300 p-3 text-right font-medium">
                    {calculationSteps.summary.dedicatedSteelPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>
                  <td className="border border-gray-300 p-3 text-sm text-gray-600">Joint Plant Committee Steel</td>
                </tr>
                
                {/* Total */}
                <tr className="bg-green-100 print:bg-gray-200 font-bold">
                  <td className="border border-gray-300 p-3">TOTAL PVC AMOUNT</td>
                  <td className="border border-gray-300 p-3 text-right">-</td>
                  <td className="border border-gray-300 p-3 text-right text-lg">
                    {calculationSteps.summary.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>
                  <td className="border border-gray-300 p-3">-</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Enhanced Classification Details - Removed as per user request */}

        {/* Separate Totals for Cement, Steel, and Others */}
        <div className="mb-8 print:mb-6">
          <h3 className="text-xl font-bold mb-4 text-gray-900">Component-wise PVC Totals</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Cement Total */}
            <div className="bg-orange-50 p-6 rounded-lg print:bg-white print:border print:border-gray-300 print:rounded-none print:p-4">
              <h4 className="text-lg font-bold mb-3 text-orange-800">Cement</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Classification-based:</span>
                  <span className="font-medium">₹{calculationSteps.summary.cementPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span>Dedicated (85%):</span>
                  <span className="font-medium">₹{calculationSteps.summary.dedicatedCementPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-bold text-lg">
                  <span>Total Cement:</span>
                  <span className="text-orange-700">₹{(calculationSteps.summary.cementPvc + calculationSteps.summary.dedicatedCementPvc).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            {/* Steel Total */}
            <div className="bg-emerald-50 p-6 rounded-lg print:bg-white print:border print:border-gray-300 print:rounded-none print:p-4">
              <h4 className="text-lg font-bold mb-3 text-emerald-800">Steel</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Classification-based:</span>
                  <span className="font-medium">₹{calculationSteps.summary.steelPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span>Dedicated (85%):</span>
                  <span className="font-medium">₹{calculationSteps.summary.dedicatedSteelPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-bold text-lg">
                  <span>Total Steel:</span>
                  <span className="text-emerald-700">₹{(calculationSteps.summary.steelPvc + calculationSteps.summary.dedicatedSteelPvc).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            {/* Others Total */}
            <div className="bg-green-50 p-6 rounded-lg print:bg-white print:border print:border-gray-300 print:rounded-none print:p-4">
              <h4 className="text-lg font-bold mb-3 text-green-800">Others</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Labour:</span>
                  <span className="font-medium">₹{calculationSteps.summary.labourPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span>Plant Machinery & Spares:</span>
                  <span className="font-medium">₹{calculationSteps.summary.plantMachineryPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span>Fuel & Lubricants:</span>
                  <span className="font-medium">₹{calculationSteps.summary.fuelPowerPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span>Other Materials:</span>
                  <span className="font-medium">₹{calculationSteps.summary.otherMaterialsPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span>Explosives:</span>
                  <span className="font-medium">₹{calculationSteps.summary.explosivesPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-bold text-lg">
                  <span>Total Others:</span>
                  <span className="text-green-700">₹{(calculationSteps.summary.labourPvc + calculationSteps.summary.plantMachineryPvc + calculationSteps.summary.fuelPowerPvc + calculationSteps.summary.otherMaterialsPvc + calculationSteps.summary.explosivesPvc).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Grand Total */}
          <div className="mt-6 p-4 bg-gray-800 text-white rounded-lg print:bg-gray-800 print:rounded-none">
            <div className="text-center">
              <div className="text-sm opacity-90">GRAND TOTAL PVC AMOUNT</div>
              <div className="text-2xl font-bold">₹{calculationSteps.summary.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
            </div>
          </div>
        </div>

        {/* Enhanced Price Indices from Base Month to Measurement Date */}
        <div className="mb-8 print:mb-6">
          <h3 className="text-xl font-bold mb-4 text-gray-900">Price Index Movement (Base Month to Measurement Date)</h3>
          <p className="text-sm text-gray-600 mb-4">
            Base Month: {detailedReport.reportMetadata.baseMonth} | Measurement Date: {detailedReport.reportMetadata.measurementDate} | Quarter: {detailedReport.reportMetadata.quarter}
          </p>
          
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300 text-sm">
              <thead>
                <tr className="bg-emerald-600 text-white print:bg-emerald-600 print:text-white">
                  <th className="border border-gray-300 p-3 text-left font-semibold">Price Index</th>
                  <th className="border border-gray-300 p-3 text-center font-semibold">Base Index<br/>({detailedReport.reportMetadata.baseMonth})</th>
                  <th className="border border-gray-300 p-3 text-center font-semibold">Quarterly Average<br/>({detailedReport.reportMetadata.quarter})</th>
                  <th className="border border-gray-300 p-3 text-center font-semibold">Variation<br/>(%)</th>
                  <th className="border border-gray-300 p-3 text-center font-semibold">Impact on PVC</th>
                </tr>
              </thead>
              <tbody>
                {detailedReport.quarterlyBreakdown.map((qData, index) => (
                  <tr key={`enhanced-${index}`} className={`${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} print:bg-white hover:bg-emerald-50`}>
                    <td className="border border-gray-300 p-3 font-medium">{qData.indexName}</td>
                    <td className="border border-gray-300 p-3 text-center font-bold text-emerald-700">
                      {qData.baseValue?.toFixed(2) || '0.00'}
                    </td>
                    <td className="border border-gray-300 p-3 text-center font-bold">
                      {qData.average !== null ? qData.average.toFixed(2) : 'N/A'}
                    </td>
                    <td className="border border-gray-300 p-3 text-center">
                      <span className={`font-bold text-lg ${qData.variation && qData.variation > 0 ? 'text-green-700' : qData.variation && qData.variation < 0 ? 'text-red-700' : 'text-gray-700'}`}>
                        {qData.variation !== null ? `${qData.variation > 0 ? '+' : ''}${qData.variation.toFixed(2)}%` : 'N/A'}
                      </span>
                    </td>
                    <td className="border border-gray-300 p-3 text-center">
                      <span className={`font-medium text-sm ${qData.variation && qData.variation > 0 ? 'text-green-700' : qData.variation && qData.variation < 0 ? 'text-red-700' : 'text-gray-700'}`}>
                        {qData.variation && qData.variation > 0 ? 'Increases PVC' : qData.variation && qData.variation < 0 ? 'Decreases PVC' : 'No Impact'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Monthly Index Table - New Format */}
        <div className="mb-8 print:mb-6">
          <h3 className="text-xl font-bold mb-4 text-gray-900">Monthly Index Table</h3>
          <p className="text-sm text-gray-600 mb-4">
            Months as rows, Index names as columns (Base: {detailedReport.reportMetadata.baseMonth})
          </p>
          
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300 text-xs">
              <thead>
                <tr className="bg-gray-800 text-white print:bg-gray-800 print:text-white">
                  <th className="border border-gray-300 p-2 text-left font-semibold">Month</th>
                  {detailedReport.quarterlyBreakdown.map((qData, index) => (
                    <th key={index} className="border border-gray-300 p-2 text-center font-semibold min-w-16">
                      {qData.indexName.replace('RBI ', '').replace('MPNG ', '').replace('Steel ', '')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detailedReport.monthlyData.map((monthData, monthIndex) => {
                  const isBaseMonth = monthIndex === 0;
                  const isCurrentQuarterMonth = detailedReport.quarterlyBreakdown.some(qData => 
                    qData.quarterMonths.includes(monthData.monthName)
                  );
                  
                  return (
                    <tr 
                      key={`month-${monthIndex}`} 
                      className={`${
                        isBaseMonth ? 'bg-emerald-50 print:bg-gray-100' : 
                        isCurrentQuarterMonth ? 'bg-green-50 print:bg-gray-50' : 
                        'bg-white print:bg-white'
                      }`}
                    >
                      <td className={`border border-gray-300 p-2 font-medium ${
                        isBaseMonth ? 'text-emerald-800 font-bold' :
                        isCurrentQuarterMonth ? 'text-green-800 font-bold' :
                        'text-gray-700'
                      }`}>
                        {monthData.monthName}
                        {isBaseMonth && <span className="text-xs ml-1">(Base)</span>}
                        {isCurrentQuarterMonth && !isBaseMonth && <span className="text-xs ml-1">(Q)</span>}
                      </td>
                      {detailedReport.quarterlyBreakdown.map((qData, qIndex) => {
                        const indexData = monthData.indices.find(idx => idx.indexName === qData.indexName);
                        
                        return (
                          <td 
                            key={qIndex} 
                            className="border border-gray-300 p-2 text-center"
                          >
                            {indexData?.available && indexData.currentValue !== null && indexData.currentValue !== undefined
                              ? indexData.currentValue.toFixed(2)
                              : indexData?.available && indexData.baseValue !== null && indexData.baseValue !== undefined
                                ? indexData.baseValue.toFixed(2)
                                : 'N/A'
                            }
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-xs text-gray-600">
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-emerald-50 border border-emerald-300"></div>
                <span>Base Month</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-50 border border-green-300"></div>
                <span>Current Quarter Months</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-white border border-gray-300"></div>
                <span>Other Months</span>
              </div>
            </div>
          </div>
        </div>

        {/* Final Summary Page */}
        <div className="print:break-before-page mt-12 print:mt-8">
          <h3 className="text-xl font-bold mb-6 text-gray-900 text-center">PVC CALCULATION SUMMARY</h3>
          
          <div className="bg-gradient-to-r from-emerald-50 to-green-50 p-6 rounded-lg mb-8 print:bg-gray-100 print:rounded-none">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column */}
              <div className="space-y-3">
                <h4 className="font-bold text-lg text-gray-900 border-b pb-2">Contract Information</h4>
                <div className="space-y-2 text-sm">
                  <div><strong>Agreement No:</strong> {detailedReport.contract.agreementNo}</div>
                  <div><strong>Contractor:</strong> {detailedReport.contract.contractorName}</div>
                  <div><strong>Base Month:</strong> {format(new Date(detailedReport.contract.baseMonth), 'MMMM yyyy')}</div>
                  <div><strong>Bill No:</strong> {detailedReport.bill.billNo}</div>
                  <div><strong>Quarter:</strong> {detailedReport.bill.quarter}</div>
                </div>
              </div>
              
              {/* Right Column */}
              <div className="space-y-3">
                <h4 className="font-bold text-lg text-gray-900 border-b pb-2">Financial Summary</h4>
                <div className="space-y-2 text-sm">
                  <div><strong>Bill Amount:</strong> ₹{detailedReport.bill.billAmount.toLocaleString('en-IN')}</div>
                  {(detailedReport.bill.cementAmount && detailedReport.bill.cementAmount > 0) && (
                    <div><strong>Cement Amount:</strong> ₹{detailedReport.bill.cementAmount.toLocaleString('en-IN')}</div>
                  )}
                  {(detailedReport.bill.steelAmount && detailedReport.bill.steelAmount > 0) && (
                    <div><strong>Steel Amount:</strong> ₹{detailedReport.bill.steelAmount.toLocaleString('en-IN')}</div>
                  )}
                  <div className="text-lg font-bold text-green-700 border-t pt-2">
                    <strong>Total PVC:</strong> ₹{calculationSteps.summary.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-lg font-bold text-emerald-700">
                    <strong>Cumulative PVC:</strong> ₹{detailedReport.pvcCalculation.cumulativePvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Component Breakdown */}
          <div className="mb-8">
            <h4 className="font-bold text-lg text-gray-900 mb-4">Component-wise PVC Breakdown</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="bg-white p-3 border border-gray-300 text-center">
                <div className="font-medium">Labour</div>
                <div className="text-green-700 font-bold">₹{calculationSteps.summary.labourPvc.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
              </div>
              <div className="bg-white p-3 border border-gray-300 text-center">
                <div className="font-medium">Plant Machinery & Spares</div>
                <div className="text-emerald-700 font-bold">₹{calculationSteps.summary.plantMachineryPvc.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
              </div>
              <div className="bg-white p-3 border border-gray-300 text-center">
                <div className="font-medium">Fuel & Lubricants</div>
                <div className="text-emerald-700 font-bold">₹{calculationSteps.summary.fuelPowerPvc.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
              </div>
              <div className="bg-white p-3 border border-gray-300 text-center">
                <div className="font-medium">Other Materials</div>
                <div className="text-emerald-700 font-bold">₹{calculationSteps.summary.otherMaterialsPvc.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
              </div>
              <div className="bg-white p-3 border border-gray-300 text-center">
                <div className="font-medium">Cement</div>
                <div className="text-orange-700 font-bold">₹{(calculationSteps.summary.cementPvc + calculationSteps.summary.dedicatedCementPvc).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
              </div>
              <div className="bg-white p-3 border border-gray-300 text-center">
                <div className="font-medium">Steel</div>
                <div className="text-emerald-800 font-bold">₹{(calculationSteps.summary.steelPvc + calculationSteps.summary.dedicatedSteelPvc).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
              </div>
              <div className="bg-white p-3 border border-gray-300 text-center">
                <div className="font-medium">Explosives</div>
                <div className="text-red-700 font-bold">₹{calculationSteps.summary.explosivesPvc.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
              </div>
              <div className="bg-green-100 p-3 border border-green-300 text-center print:bg-gray-200">
                <div className="font-bold">TOTAL</div>
                <div className="text-green-800 font-bold text-lg">₹{calculationSteps.summary.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Report Footer */}
        <div className="mt-12 pt-8 border-t-2 border-gray-300 print:mt-8">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-2">
              Report generated on {format(toISTDate(new Date()), 'dd MMMM yyyy, HH:mm')}
            </p>
            <p className="text-sm text-gray-600">
              IR-PVC Management System
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FullPvcReportPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center min-h-64">
        <LoadingSpinner size="lg" text="Loading full PVC report..." />
      </div>
    }>
      <div>
        {/* Enhanced Print Styles */}
        <style jsx global>{`
          @media print {
            .no-print {
              display: none !important;
            }
            
            body {
              font-size: 12px !important;
              line-height: 1.3 !important;
              color: #000 !important;
              background: white !important;
            }
            
            .print\\:break-before-page {
              page-break-before: always;
            }
            
            .print\\:break-after-page {
              page-break-after: always;
            }
            
            .print\\:text-xs {
              font-size: 10px !important;
            }
            
            .print\\:text-sm {
              font-size: 11px !important;
            }
            
            .print\\:text-base {
              font-size: 12px !important;
            }
            
            .print\\:text-lg {
              font-size: 14px !important;
            }
            
            .print\\:text-xl {
              font-size: 16px !important;
            }
            
            .print\\:bg-white {
              background-color: white !important;
              -webkit-print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            
            .print\\:bg-gray-50 {
              background-color: #f9fafb !important;
              -webkit-print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            
            .print\\:bg-gray-100 {
              background-color: #f3f4f6 !important;
              -webkit-print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            
            .print\\:bg-gray-200 {
              background-color: #e5e7eb !important;
              -webkit-print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            
            .print\\:bg-emerald-600 {
              background-color: #059669 !important;
              color: white !important;
              -webkit-print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            
            .print\\:bg-emerald-500 {
              background-color: #10b981 !important;
              color: white !important;
              -webkit-print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            
            .print\\:border {
              border: 1px solid #d1d5db !important;
            }
            
            .print\\:border-gray-300 {
              border-color: #d1d5db !important;
            }
            
            .print\\:rounded-none {
              border-radius: 0 !important;
            }
            
            .print\\:p-2 {
              padding: 8px !important;
            }
            
            .print\\:p-4 {
              padding: 16px !important;
            }
            
            .print\\:mb-2 {
              margin-bottom: 8px !important;
            }
            
            .print\\:mb-4 {
              margin-bottom: 16px !important;
            }
            
            .print\\:mb-6 {
              margin-bottom: 24px !important;
            }
            
            .print\\:mb-8 {
              margin-bottom: 32px !important;
            }
            
            .print\\:gap-4 {
              gap: 16px !important;
            }
            
            .print\\:max-w-none {
              max-width: none !important;
            }
            
            table {
              border-collapse: collapse !important;
              width: 100% !important;
            }
            
            th, td {
              border: 1px solid #d1d5db !important;
              padding: 8px !important;
              font-size: 11px !important;
            }
            
            /* Preserve important colors for print */
            .bg-emerald-600,
            .bg-emerald-500,
            .bg-gray-800 {
              background-color: #1f2937 !important;
              color: white !important;
              -webkit-print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            
            /* Ensure page breaks work properly */
            @page {
              margin: 1in;
              size: A4;
            }
            
            /* Prevent breaking inside important sections */
            .avoid-break {
              page-break-inside: avoid;
            }
            
            /* Hide shadows and rounded corners in print */
            * {
              box-shadow: none !important;
              border-radius: 0 !important;
            }
          }

          /* Print-specific button styling */
          @media screen {
            .print-button {
              background: linear-gradient(135deg, #10b981, #047857);
              color: white;
              border: none;
              padding: 12px 24px;
              border-radius: 8px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.3s ease;
              box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
            }
            
            .print-button:hover {
              background: linear-gradient(135deg, #047857, #1e40af);
              transform: translateY(-2px);
              box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
            }
            
            .print-button:active {
              transform: translateY(0);
            }
          }
        `}</style>
        
        <FullPvcReportContent />
      </div>
    </Suspense>
  );
}
