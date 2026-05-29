
'use client';

import { useState, useEffect, Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StatusMessage } from '@/components/ui/status-message';
import { Calculator, FileText, Building2, TrendingUp, Table as TableIcon, Download } from 'lucide-react';
import { format } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';
import { useSearchParams } from 'next/navigation';
import { toast } from 'react-hot-toast';

interface Contract {
  id: string;
  agreementNo: string;
  contractorName: string;
  workDescription: string;
}

interface BillData {
  billNo: string;
  quarter: string;
  measurementDate: string;
  billAmount: number;
  labour: number;
  material: number; // Other Materials
  fuel: number;
  plantMachinery: number;
  cement: number;
  steelTmt: number;
  steelAngleChannel: number;
  steelPlates: number;
  steelOtherSections: number;
  total: number;
}

interface ClassificationSteel {
  classificationCode: string;
  classificationName: string;
  billNo: string;
  quarter: string;
  steelPvc: number;
  steelTypes: string[];
}

interface AbstractData {
  contract: {
    agreementNo: string;
    contractorName: string;
    workDescription: string;
    dateOfOpening: string;
    baseMonth: string;
  };
  billData: BillData[];
  classificationSteelData: ClassificationSteel[];
  totalForLabourFuelMaterialsPlant: number;
  totalForCement: number;
  totalForSteelTmt: number;
  totalForSteelAngleChannel: number;
  totalForSteelPlates: number;
  totalForSteelOtherSections: number;
  grandTotal: number;
  totalSay: number;
}

// Helper function to format steel types
const formatSteelTypes = (types: string[]) => {
  if (!types || types.length === 0) return 'All Types (Average)';
  
  const typeMap: { [key: string]: string } = {
    'TMT': 'TMT Bars',
    'ANGLE_CHANNEL': 'Angle/Channel',
    'PLATES': 'Plates',
    'OTHER_SECTIONS': 'Other Sections'
  };
  
  return types.map(type => typeMap[type] || type).join(', ');
};

function AbstractPageContent() {
  const searchParams = useSearchParams();
  const preselectedContractId = searchParams?.get('contractId');
  
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selectedContract, setSelectedContract] = useState<string>(preselectedContractId || '');
  const [abstractData, setAbstractData] = useState<AbstractData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAbstract, setIsLoadingAbstract] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchContracts();
  }, []);

  useEffect(() => {
    if (preselectedContractId) {
      fetchAbstractData(preselectedContractId);
    }
  }, [preselectedContractId]);

  const fetchContracts = async () => {
    try {
      const response = await fetch('/api/contracts');
      if (!response.ok) {
        throw new Error('Failed to fetch contracts');
      }
      const data = await response.json();
      setContracts(data);
    } catch (error: any) {
      console.error('Error fetching contracts:', error);
      setError(error.message || 'Failed to fetch contracts');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAbstractData = async (contractId: string) => {
    setIsLoadingAbstract(true);
    setError('');
    
    try {
      const response = await fetch(`/api/reports/abstract?contractId=${contractId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch abstract data');
      }
      
      const data = await response.json();
      setAbstractData(data);
    } catch (error: any) {
      console.error('Error fetching abstract data:', error);
      setError(error.message || 'Failed to fetch abstract data');
    } finally {
      setIsLoadingAbstract(false);
    }
  };

  const handleContractChange = (contractId: string) => {
    setSelectedContract(contractId);
    if (contractId) {
      fetchAbstractData(contractId);
    } else {
      setAbstractData(null);
    }
  };

  const handleDownloadPDF = async () => {
    if (!selectedContract || !abstractData) {
      toast.error('Please select a contract first');
      return;
    }

    try {
      toast.loading('Generating PDF...', { id: 'pdf-generation' });
      
      const response = await fetch(`/api/reports/abstract/pdf?contractId=${selectedContract}`);
      
      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Abstract_${abstractData.contract.agreementNo.replace(/[^a-zA-Z0-9]/g, '_')}_${format(toISTDate(new Date()), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast.success('PDF downloaded successfully', { id: 'pdf-generation' });
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast.error('Failed to download PDF', { id: 'pdf-generation' });
    }
  };

  const selectedContractData = contracts.find(c => c.id === selectedContract);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <LoadingSpinner size="lg" text="Loading contracts..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <TableIcon className="h-8 w-8 text-blue-600" />
            Abstract Report
          </h1>
          <p className="text-gray-600 mt-2">
            Quarterly breakdown of PVC calculations with cement and steel components
          </p>
        </div>
        <div className="flex gap-2">
          {abstractData && (
            <>
              <div className="bg-gradient-to-r from-teal-50 to-emerald-50 rounded-lg px-4 py-2 border border-teal-200">
                <span className="text-sm font-medium text-teal-800">Abstract Report Generated Successfully</span>
              </div>
              <Button
                onClick={handleDownloadPDF}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <StatusMessage type="error" title="Error" message={error} />
      )}

      {/* Contract Selection */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Contract Selection</CardTitle>
          <CardDescription>
            Select a contract to view its quarterly PVC abstract
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Contract</label>
              <Select value={selectedContract} onValueChange={handleContractChange}>
                <SelectTrigger>
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
          </div>
        </CardContent>
      </Card>

      {/* Abstract Data Display */}
      {isLoadingAbstract ? (
        <div className="flex justify-center items-center min-h-64">
          <LoadingSpinner size="lg" text="Generating abstract..." />
        </div>
      ) : abstractData ? (
        <div className="space-y-6">
          {/* Header with Contract Details */}
          <Card className="border-0 shadow-lg bg-gradient-to-r from-blue-50 to-indigo-50">
            <CardHeader>
              <div className="text-center">
                <div className="bg-blue-600 text-white py-3 px-6 rounded-lg mb-4 inline-block">
                  <h2 className="text-xl font-bold">INDIAN RAILWAY</h2>
                  <h3 className="text-lg">PRICE VARIATION CALCULATION (PVC) REPORT</h3>
                </div>
                <div className="bg-blue-500 text-white py-2 px-4 rounded">
                  <h4 className="font-bold">ABSTRACT</h4>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-4 rounded-lg border">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="font-medium">Work Description:</span>
                    <span className="text-right">{abstractData.contract.workDescription}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Agreement No:</span>
                    <span>{abstractData.contract.agreementNo}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Contractor:</span>
                    <span>{abstractData.contract.contractorName}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="font-medium">Date of Opening:</span>
                    <span>{abstractData.contract.dateOfOpening}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Base Month:</span>
                    <span>{abstractData.contract.baseMonth}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Table 1: General Classifications (Labour, Fuel, Materials, Plant & Machinery + Non-TMT Steel) */}
          <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
              <CardTitle className="flex items-center gap-2 text-blue-900">
                <TableIcon className="h-5 w-5" />
                General Classifications
              </CardTitle>
              <CardDescription className="text-blue-700">
                Labour, Fuel, Materials, Plant & Machinery, and Non-TMT Steel components
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-blue-300">
                  <thead>
                    <tr className="bg-gradient-to-r from-blue-100 to-indigo-100">
                      <th className="border border-blue-300 p-3 text-left font-semibold text-blue-900">Quarter</th>
                      <th className="border border-blue-300 p-3 text-left font-semibold text-blue-900">Bill No</th>
                      <th className="border border-blue-300 p-3 text-right font-semibold text-blue-900">Bill Amount</th>
                      <th className="border border-blue-300 p-3 text-right font-semibold text-blue-900">Labour</th>
                      <th className="border border-blue-300 p-3 text-right font-semibold text-blue-900">Material</th>
                      <th className="border border-blue-300 p-3 text-right font-semibold text-blue-900">Fuel</th>
                      <th className="border border-blue-300 p-3 text-right font-semibold text-blue-900">Plant Machinery</th>
                      <th className="border border-blue-300 p-3 text-right font-semibold text-blue-900">Angle/Channel</th>
                      <th className="border border-blue-300 p-3 text-right font-semibold text-blue-900">Plates</th>
                      <th className="border border-blue-300 p-3 text-right font-semibold text-blue-900">Other Sections</th>
                      <th className="border border-blue-300 p-3 text-right font-semibold text-blue-900">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {abstractData.billData?.map((row, index) => {
                      const generalTotal = row.labour + row.material + row.fuel + row.plantMachinery + 
                                          row.steelAngleChannel + row.steelPlates + row.steelOtherSections;
                      return (
                        <tr key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-blue-50/30'} hover:bg-blue-100/50 transition-colors`}>
                          <td className="border border-blue-300 p-3 font-medium text-blue-900">{row.quarter}</td>
                          <td className="border border-blue-300 p-3">
                            <div className="text-sm text-gray-700 font-medium">
                              {row.billNo || '-'}
                            </div>
                          </td>
                          <td className="border border-blue-300 p-3 text-right">
                            {row.billAmount?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0.00'}
                          </td>
                          <td className="border border-blue-300 p-3 text-right">
                            <span className={row.labour < 0 ? 'text-red-600' : ''}>
                              {row.labour?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0.00'}
                            </span>
                          </td>
                          <td className="border border-blue-300 p-3 text-right">
                            <span className={row.material < 0 ? 'text-red-600' : ''}>
                              {row.material?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0.00'}
                            </span>
                          </td>
                          <td className="border border-blue-300 p-3 text-right">
                            <span className={row.fuel < 0 ? 'text-red-600' : ''}>
                              {row.fuel?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0.00'}
                            </span>
                          </td>
                          <td className="border border-blue-300 p-3 text-right">
                            <span className={row.plantMachinery < 0 ? 'text-red-600' : ''}>
                              {row.plantMachinery?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0.00'}
                            </span>
                          </td>
                          <td className="border border-blue-300 p-3 text-right">
                            <span className={row.steelAngleChannel < 0 ? 'text-red-600' : row.steelAngleChannel > 0 ? 'text-green-600 font-semibold' : 'text-gray-400'}>
                              {row.steelAngleChannel?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0.00'}
                            </span>
                          </td>
                          <td className="border border-blue-300 p-3 text-right">
                            <span className={row.steelPlates < 0 ? 'text-red-600' : row.steelPlates > 0 ? 'text-green-600 font-semibold' : 'text-gray-400'}>
                              {row.steelPlates?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0.00'}
                            </span>
                          </td>
                          <td className="border border-blue-300 p-3 text-right">
                            <span className={row.steelOtherSections < 0 ? 'text-red-600' : row.steelOtherSections > 0 ? 'text-green-600 font-semibold' : 'text-gray-400'}>
                              {row.steelOtherSections?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0.00'}
                            </span>
                          </td>
                          <td className="border border-blue-300 p-3 text-right font-bold">
                            <span className={generalTotal < 0 ? 'text-red-600' : 'text-green-700'}>
                              {generalTotal?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0.00'}
                            </span>
                          </td>
                        </tr>
                      );
                    }) || []}
                    {/* Column Totals Row */}
                    <tr className="bg-gradient-to-r from-blue-200 to-indigo-200 font-bold border-t-2 border-blue-500">
                      <td className="border border-blue-300 p-3 text-blue-900" colSpan={2}>COLUMN TOTALS</td>
                      <td className="border border-blue-300 p-3 text-right">
                        {abstractData.billData?.reduce((sum, row) => sum + (row.billAmount || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0.00'}
                      </td>
                      <td className="border border-blue-300 p-3 text-right">
                        <span className={abstractData.billData?.reduce((sum, row) => sum + (row.labour || 0), 0) < 0 ? 'text-red-600' : ''}>
                          {abstractData.billData?.reduce((sum, row) => sum + (row.labour || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0.00'}
                        </span>
                      </td>
                      <td className="border border-blue-300 p-3 text-right">
                        <span className={abstractData.billData?.reduce((sum, row) => sum + (row.material || 0), 0) < 0 ? 'text-red-600' : ''}>
                          {abstractData.billData?.reduce((sum, row) => sum + (row.material || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0.00'}
                        </span>
                      </td>
                      <td className="border border-blue-300 p-3 text-right">
                        <span className={abstractData.billData?.reduce((sum, row) => sum + (row.fuel || 0), 0) < 0 ? 'text-red-600' : ''}>
                          {abstractData.billData?.reduce((sum, row) => sum + (row.fuel || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0.00'}
                        </span>
                      </td>
                      <td className="border border-blue-300 p-3 text-right">
                        <span className={abstractData.billData?.reduce((sum, row) => sum + (row.plantMachinery || 0), 0) < 0 ? 'text-red-600' : ''}>
                          {abstractData.billData?.reduce((sum, row) => sum + (row.plantMachinery || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0.00'}
                        </span>
                      </td>
                      <td className="border border-blue-300 p-3 text-right">
                        <span className={abstractData.totalForSteelAngleChannel < 0 ? 'text-red-600' : 'text-green-600'}>
                          {abstractData.totalForSteelAngleChannel?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0.00'}
                        </span>
                      </td>
                      <td className="border border-blue-300 p-3 text-right">
                        <span className={abstractData.totalForSteelPlates < 0 ? 'text-red-600' : 'text-green-600'}>
                          {abstractData.totalForSteelPlates?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0.00'}
                        </span>
                      </td>
                      <td className="border border-blue-300 p-3 text-right">
                        <span className={abstractData.totalForSteelOtherSections < 0 ? 'text-red-600' : 'text-green-600'}>
                          {abstractData.totalForSteelOtherSections?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0.00'}
                        </span>
                      </td>
                      <td className="border border-blue-300 p-3 text-right">
                        <span className={(abstractData.totalForLabourFuelMaterialsPlant + abstractData.totalForSteelAngleChannel + abstractData.totalForSteelPlates + abstractData.totalForSteelOtherSections) < 0 ? 'text-red-600' : 'text-green-600'}>
                          {(abstractData.totalForLabourFuelMaterialsPlant + abstractData.totalForSteelAngleChannel + abstractData.totalForSteelPlates + abstractData.totalForSteelOtherSections)?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0.00'}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Table 2: Cement Components */}
          <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="bg-gradient-to-r from-orange-50 to-amber-50">
              <CardTitle className="flex items-center gap-2 text-orange-900">
                <TableIcon className="h-5 w-5" />
                Cement Components
              </CardTitle>
              <CardDescription className="text-orange-700">
                Dedicated cement price variation calculations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-orange-300">
                  <thead>
                    <tr className="bg-gradient-to-r from-orange-100 to-amber-100">
                      <th className="border border-orange-300 p-3 text-left font-semibold text-orange-900">Quarter</th>
                      <th className="border border-orange-300 p-3 text-left font-semibold text-orange-900">Bill No</th>
                      <th className="border border-orange-300 p-3 text-right font-semibold text-orange-900">Cement PVC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {abstractData.billData?.map((row, index) => {
                      return (
                        <tr key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-orange-50/30'} hover:bg-orange-100/50 transition-colors`}>
                          <td className="border border-orange-300 p-3 font-medium text-orange-900">{row.quarter}</td>
                          <td className="border border-orange-300 p-3">
                            <div className="text-sm text-gray-700 font-medium">
                              {row.billNo || '-'}
                            </div>
                          </td>
                          <td className="border border-orange-300 p-3 text-right">
                            <span className={row.cement < 0 ? 'text-red-600' : row.cement > 0 ? 'text-green-600 font-semibold' : 'text-gray-400'}>
                              {row.cement?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0.00'}
                            </span>
                          </td>
                        </tr>
                      );
                    }) || []}
                    {/* Column Totals Row */}
                    <tr className="bg-gradient-to-r from-orange-200 to-amber-200 font-bold border-t-2 border-orange-500">
                      <td className="border border-orange-300 p-3 text-orange-900" colSpan={2}>TOTAL FOR CEMENT</td>
                      <td className="border border-orange-300 p-3 text-right">
                        <span className={abstractData.totalForCement < 0 ? 'text-red-600' : 'text-green-600'}>
                          {abstractData.totalForCement?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0.00'}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Table 3: TMT Steel Components */}
          <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="bg-gradient-to-r from-gray-50 to-slate-50">
              <CardTitle className="flex items-center gap-2 text-gray-900">
                <TableIcon className="h-5 w-5" />
                TMT Steel Components
              </CardTitle>
              <CardDescription className="text-gray-700">
                Dedicated TMT bar price variation calculations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gradient-to-r from-gray-100 to-slate-100">
                      <th className="border border-gray-300 p-3 text-left font-semibold text-gray-900">Quarter</th>
                      <th className="border border-gray-300 p-3 text-left font-semibold text-gray-900">Bill No</th>
                      <th className="border border-gray-300 p-3 text-right font-semibold text-gray-900">TMT Bars PVC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {abstractData.billData?.map((row, index) => {
                      return (
                        <tr key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} hover:bg-gray-100/50 transition-colors`}>
                          <td className="border border-gray-300 p-3 font-medium text-gray-900">{row.quarter}</td>
                          <td className="border border-gray-300 p-3">
                            <div className="text-sm text-gray-700 font-medium">
                              {row.billNo || '-'}
                            </div>
                          </td>
                          <td className="border border-gray-300 p-3 text-right">
                            <span className={row.steelTmt < 0 ? 'text-red-600' : row.steelTmt > 0 ? 'text-green-600 font-semibold' : 'text-gray-400'}>
                              {row.steelTmt?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0.00'}
                            </span>
                          </td>
                        </tr>
                      );
                    }) || []}
                    {/* Column Totals Row */}
                    <tr className="bg-gradient-to-r from-gray-200 to-slate-200 font-bold border-t-2 border-gray-500">
                      <td className="border border-gray-300 p-3 text-gray-900" colSpan={2}>TOTAL FOR TMT STEEL</td>
                      <td className="border border-gray-300 p-3 text-right">
                        <span className={abstractData.totalForSteelTmt < 0 ? 'text-red-600' : 'text-green-600'}>
                          {abstractData.totalForSteelTmt?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0.00'}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Classification-wise Steel Component Table */}
          {abstractData.classificationSteelData && abstractData.classificationSteelData.length > 0 && (
            <Card className="border-0 shadow-lg bg-gradient-to-r from-purple-50 to-pink-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="h-1 w-1 bg-purple-500 rounded-full animate-pulse"></div>
                  Classification-wise Steel Component Breakdown
                </CardTitle>
                <CardDescription>
                  Detailed steel component PVC by work classification with selected steel types
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-purple-300">
                    <thead>
                      <tr className="bg-gradient-to-r from-purple-100 to-pink-100">
                        <th className="border border-purple-300 p-3 text-left font-semibold text-purple-900">Bill No</th>
                        <th className="border border-purple-300 p-3 text-left font-semibold text-purple-900">Quarter</th>
                        <th className="border border-purple-300 p-3 text-left font-semibold text-purple-900">Classification Code</th>
                        <th className="border border-purple-300 p-3 text-left font-semibold text-purple-900">Classification Name</th>
                        <th className="border border-purple-300 p-3 text-left font-semibold text-purple-900">Steel Types Used</th>
                        <th className="border border-purple-300 p-3 text-right font-semibold text-purple-900">Steel PVC Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {abstractData.classificationSteelData.map((item, index) => (
                        <tr 
                          key={index} 
                          className={`${index % 2 === 0 ? 'bg-white' : 'bg-purple-50/30'} hover:bg-purple-100/50 transition-colors`}
                        >
                          <td className="border border-purple-300 p-3 font-medium text-purple-900">
                            {item.billNo}
                          </td>
                          <td className="border border-purple-300 p-3 text-purple-800">
                            {item.quarter}
                          </td>
                          <td className="border border-purple-300 p-3 font-semibold text-purple-700">
                            {item.classificationCode}
                          </td>
                          <td className="border border-purple-300 p-3 text-sm">
                            {item.classificationName}
                          </td>
                          <td className="border border-purple-300 p-3">
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                              {formatSteelTypes(item.steelTypes)}
                            </span>
                          </td>
                          <td className="border border-purple-300 p-3 text-right font-semibold">
                            <span className={item.steelPvc < 0 ? 'text-red-600' : 'text-green-700'}>
                              ₹{item.steelPvc?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0.00'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {/* Total Row */}
                      <tr className="bg-gradient-to-r from-purple-200 to-pink-200 font-bold border-t-2 border-purple-400">
                        <td className="border border-purple-300 p-3" colSpan={5}>
                          <span className="flex items-center gap-2">
                            <Calculator className="h-4 w-4" />
                            TOTAL CLASSIFICATION STEEL PVC
                          </span>
                        </td>
                        <td className="border border-purple-300 p-3 text-right text-lg">
                          <span className={abstractData.classificationSteelData.reduce((sum, item) => sum + item.steelPvc, 0) < 0 ? 'text-red-700' : 'text-green-700'}>
                            ₹{abstractData.classificationSteelData.reduce((sum, item) => sum + item.steelPvc, 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                
                {/* Info Note */}
                <div className="mt-4 p-4 bg-purple-100 border-l-4 border-purple-500 rounded-r-lg">
                  <p className="text-sm text-purple-900">
                    <strong>Note:</strong> This table shows steel component PVC calculated at the work classification level. 
                    When multiple steel types are selected for a classification, the system calculates the average index and applies it 
                    based on the component percentage allocated to that classification.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Grand Total */}
          <Card className="border-0 shadow-lg bg-gradient-to-r from-green-50 to-emerald-50">
            <CardContent className="p-6">
              <div className="text-center">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow">
                    <p className="text-lg font-semibold text-gray-700">Total</p>
                    <p className={`text-2xl font-bold ${abstractData.grandTotal < 0 ? 'text-red-600' : 'text-green-900'}`}>
                      ₹{abstractData.grandTotal?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0.00'}
                    </p>
                  </div>
                  <div className="p-4 bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow">
                    <p className="text-lg font-semibold text-gray-700">Say</p>
                    <p className={`text-2xl font-bold ${abstractData.totalSay < 0 ? 'text-red-600' : 'text-green-900'}`}>
                      ₹{abstractData.totalSay?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) || '0'}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : selectedContract ? (
        <Card className="border-0 shadow-lg">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calculator className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No data found</h3>
            <p className="text-gray-600 text-center">
              The selected contract does not have enough data to generate an abstract report.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-0 shadow-lg">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Select a contract</h3>
            <p className="text-gray-600 text-center">
              Choose a contract from the dropdown above to view its abstract report.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function AbstractPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center min-h-64">
        <LoadingSpinner size="lg" text="Loading abstract report..." />
      </div>
    }>
      <AbstractPageContent />
    </Suspense>
  );
}
