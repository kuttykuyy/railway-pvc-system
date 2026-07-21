
'use client';

import { useState, useEffect, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StatusMessage } from '@/components/ui/status-message';
import { Download } from 'lucide-react';
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
  material: number;
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

const fmt = (n: number, decimals = 2) =>
  n?.toLocaleString('en-IN', { maximumFractionDigits: decimals }) || '0.00';

const numClass = (n: number) => (n < 0 ? 'text-red-600' : '');

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 bg-gray-50 ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}

function Td({ children, right, bold }: { children: React.ReactNode; right?: boolean; bold?: boolean }) {
  return (
    <td className={`border border-gray-200 px-3 py-2 text-sm ${right ? 'text-right' : ''} ${bold ? 'font-semibold' : ''}`}>
      {children}
    </td>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{children}</h2>;
}

function AbstractPageContent() {
  const searchParams = useSearchParams();
  const preselectedContractId = searchParams?.get('contractId');

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selectedContract, setSelectedContract] = useState<string>(preselectedContractId || '');
  const [abstractData, setAbstractData] = useState<AbstractData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAbstract, setIsLoadingAbstract] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { fetchContracts(); }, []);
  useEffect(() => { if (preselectedContractId) fetchAbstractData(preselectedContractId); }, [preselectedContractId]);

  const fetchContracts = async () => {
    try {
      const res = await fetch('/api/contracts');
      if (!res.ok) throw new Error('Failed to fetch contracts');
      setContracts(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAbstractData = async (contractId: string) => {
    setIsLoadingAbstract(true);
    setError('');
    try {
      const res = await fetch(`/api/reports/abstract?contractId=${contractId}`);
      if (!res.ok) throw new Error('Failed to fetch abstract data');
      setAbstractData(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoadingAbstract(false);
    }
  };

  const handleContractChange = (contractId: string) => {
    setSelectedContract(contractId);
    if (contractId) fetchAbstractData(contractId);
    else setAbstractData(null);
  };

  const handleDownloadPDF = async () => {
    if (!selectedContract || !abstractData) return;
    try {
      toast.loading('Generating PDF...', { id: 'pdf' });
      const res = await fetch(`/api/reports/abstract/pdf?contractId=${selectedContract}`);
      if (!res.ok) throw new Error('Failed to generate PDF');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Abstract_${abstractData.contract.agreementNo.replace(/[^a-zA-Z0-9]/g, '_')}_${format(toISTDate(new Date()), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Downloaded', { id: 'pdf' });
    } catch {
      toast.error('Failed to download PDF', { id: 'pdf' });
    }
  };

  if (isLoading) return <div className="flex justify-center py-16"><LoadingSpinner size="lg" text="Loading..." /></div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Abstract Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">Quarterly PVC breakdown by component</p>
        </div>
        {abstractData && (
          <Button onClick={handleDownloadPDF} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Download className="h-4 w-4 mr-1.5" />
            Download PDF
          </Button>
        )}
      </div>

      {error && <StatusMessage type="error" title="Error" message={error} />}

      {/* Contract selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Contract</label>
        <div className="w-96">
          <Select value={selectedContract} onValueChange={handleContractChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select a contract" />
            </SelectTrigger>
            <SelectContent>
              {contracts.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.agreementNo} — {c.contractorName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoadingAbstract ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" text="Generating abstract..." /></div>
      ) : abstractData ? (
        <div className="space-y-6">
          {/* Contract details */}
          <div className="border border-gray-200 rounded-lg p-4 bg-white">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-2 text-sm">
              <div><span className="text-gray-500">Agreement No</span><p className="font-medium">{abstractData.contract.agreementNo}</p></div>
              <div><span className="text-gray-500">Contractor</span><p className="font-medium">{abstractData.contract.contractorName}</p></div>
              <div><span className="text-gray-500">Date of Opening</span><p className="font-medium">{abstractData.contract.dateOfOpening}</p></div>
              <div className="col-span-2"><span className="text-gray-500">Work</span><p className="font-medium">{abstractData.contract.workDescription}</p></div>
              <div><span className="text-gray-500">Base Month</span><p className="font-medium">{abstractData.contract.baseMonth}</p></div>
            </div>
          </div>

          {/* Table 1: General Classifications */}
          <div>
            <SectionTitle>General Classifications</SectionTitle>
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <Th>Quarter</Th>
                    <Th>Bill No</Th>
                    <Th right>Bill Amount</Th>
                    <Th right>Labour</Th>
                    <Th right>Material</Th>
                    <Th right>Fuel</Th>
                    <Th right>Plant</Th>
                    <Th right>Angle/Channel</Th>
                    <Th right>Plates</Th>
                    <Th right>Other Sections</Th>
                    <Th right>Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {abstractData.billData?.map((row, i) => {
                    const genTotal = row.labour + row.material + row.fuel + row.plantMachinery +
                      row.steelAngleChannel + row.steelPlates + row.steelOtherSections;
                    return (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <Td bold>{row.quarter}</Td>
                        <Td>{row.billNo || '-'}</Td>
                        <Td right>{fmt(row.billAmount)}</Td>
                        <Td right><span className={numClass(row.labour)}>{fmt(row.labour)}</span></Td>
                        <Td right><span className={numClass(row.material)}>{fmt(row.material)}</span></Td>
                        <Td right><span className={numClass(row.fuel)}>{fmt(row.fuel)}</span></Td>
                        <Td right><span className={numClass(row.plantMachinery)}>{fmt(row.plantMachinery)}</span></Td>
                        <Td right><span className={numClass(row.steelAngleChannel)}>{fmt(row.steelAngleChannel)}</span></Td>
                        <Td right><span className={numClass(row.steelPlates)}>{fmt(row.steelPlates)}</span></Td>
                        <Td right><span className={numClass(row.steelOtherSections)}>{fmt(row.steelOtherSections)}</span></Td>
                        <Td right bold><span className={numClass(genTotal)}>{fmt(genTotal)}</span></Td>
                      </tr>
                    );
                  })}
                  <tr className="bg-gray-100 font-semibold">
                    <td className="border border-gray-200 px-3 py-2 text-xs text-gray-600" colSpan={2}>TOTAL</td>
                    <Td right>{fmt(abstractData.billData?.reduce((s, r) => s + (r.billAmount || 0), 0))}</Td>
                    <Td right><span className={numClass(abstractData.billData?.reduce((s, r) => s + r.labour, 0))}>{fmt(abstractData.billData?.reduce((s, r) => s + r.labour, 0))}</span></Td>
                    <Td right><span className={numClass(abstractData.billData?.reduce((s, r) => s + r.material, 0))}>{fmt(abstractData.billData?.reduce((s, r) => s + r.material, 0))}</span></Td>
                    <Td right><span className={numClass(abstractData.billData?.reduce((s, r) => s + r.fuel, 0))}>{fmt(abstractData.billData?.reduce((s, r) => s + r.fuel, 0))}</span></Td>
                    <Td right><span className={numClass(abstractData.billData?.reduce((s, r) => s + r.plantMachinery, 0))}>{fmt(abstractData.billData?.reduce((s, r) => s + r.plantMachinery, 0))}</span></Td>
                    <Td right><span className={numClass(abstractData.totalForSteelAngleChannel)}>{fmt(abstractData.totalForSteelAngleChannel)}</span></Td>
                    <Td right><span className={numClass(abstractData.totalForSteelPlates)}>{fmt(abstractData.totalForSteelPlates)}</span></Td>
                    <Td right><span className={numClass(abstractData.totalForSteelOtherSections)}>{fmt(abstractData.totalForSteelOtherSections)}</span></Td>
                    <Td right bold><span className={numClass(abstractData.totalForLabourFuelMaterialsPlant)}>{fmt(abstractData.totalForLabourFuelMaterialsPlant)}</span></Td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Table 2 + 3 side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Cement */}
            <div>
              <SectionTitle>Cement</SectionTitle>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full border-collapse text-sm">
                  <thead><tr><Th>Quarter</Th><Th>Bill No</Th><Th right>Cement PVC</Th></tr></thead>
                  <tbody>
                    {abstractData.billData?.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <Td bold>{row.quarter}</Td>
                        <Td>{row.billNo || '-'}</Td>
                        <Td right><span className={numClass(row.cement)}>{fmt(row.cement)}</span></Td>
                      </tr>
                    ))}
                    <tr className="bg-gray-100 font-semibold">
                      <td className="border border-gray-200 px-3 py-2 text-xs text-gray-600" colSpan={2}>TOTAL</td>
                      <Td right><span className={numClass(abstractData.totalForCement)}>{fmt(abstractData.totalForCement)}</span></Td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* TMT Steel */}
            <div>
              <SectionTitle>TMT Steel</SectionTitle>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full border-collapse text-sm">
                  <thead><tr><Th>Quarter</Th><Th>Bill No</Th><Th right>TMT PVC</Th></tr></thead>
                  <tbody>
                    {abstractData.billData?.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <Td bold>{row.quarter}</Td>
                        <Td>{row.billNo || '-'}</Td>
                        <Td right><span className={numClass(row.steelTmt)}>{fmt(row.steelTmt)}</span></Td>
                      </tr>
                    ))}
                    <tr className="bg-gray-100 font-semibold">
                      <td className="border border-gray-200 px-3 py-2 text-xs text-gray-600" colSpan={2}>TOTAL</td>
                      <Td right><span className={numClass(abstractData.totalForSteelTmt)}>{fmt(abstractData.totalForSteelTmt)}</span></Td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Classification-wise Steel */}
          {abstractData.classificationSteelData?.length > 0 && (
            <div>
              <SectionTitle>Classification-wise Steel</SectionTitle>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <Th>Bill No</Th>
                      <Th>Quarter</Th>
                      <Th>Code</Th>
                      <Th>Classification</Th>
                      <Th>Steel Types</Th>
                      <Th right>Steel PVC</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {abstractData.classificationSteelData.map((item, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <Td bold>{item.billNo}</Td>
                        <Td>{item.quarter}</Td>
                        <Td bold>{item.classificationCode}</Td>
                        <Td>{item.classificationName}</Td>
                        <Td><span className="text-xs text-gray-600">{formatSteelTypes(item.steelTypes)}</span></Td>
                        <Td right><span className={numClass(item.steelPvc)}>₹{fmt(item.steelPvc)}</span></Td>
                      </tr>
                    ))}
                    <tr className="bg-gray-100 font-semibold">
                      <td className="border border-gray-200 px-3 py-2 text-xs text-gray-600" colSpan={5}>TOTAL</td>
                      <Td right>
                        <span className={numClass(abstractData.classificationSteelData.reduce((s, r) => s + r.steelPvc, 0))}>
                          ₹{fmt(abstractData.classificationSteelData.reduce((s, r) => s + r.steelPvc, 0))}
                        </span>
                      </Td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Grand Total */}
          <div className="flex justify-end gap-4">
            <div className="border border-gray-200 rounded-lg px-6 py-4 bg-white text-right min-w-40">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total</p>
              <p className={`text-xl font-bold ${abstractData.grandTotal < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                ₹{fmt(abstractData.grandTotal)}
              </p>
            </div>
            <div className="border border-emerald-200 rounded-lg px-6 py-4 bg-emerald-50 text-right min-w-40">
              <p className="text-xs text-emerald-500 uppercase tracking-wide">Say</p>
              <p className={`text-xl font-bold ${abstractData.totalSay < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                ₹{fmt(abstractData.totalSay, 0)}
              </p>
            </div>
          </div>
        </div>
      ) : selectedContract ? (
        <div className="text-center py-16 text-gray-500">No data found for this contract.</div>
      ) : (
        <div className="text-center py-16 text-gray-400">Select a contract to view the abstract report.</div>
      )}
    </div>
  );
}

export default function AbstractPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><LoadingSpinner size="lg" text="Loading..." /></div>}>
      <AbstractPageContent />
    </Suspense>
  );
}
