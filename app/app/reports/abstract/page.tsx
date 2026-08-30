
'use client';

import { useState, useEffect, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StatusMessage } from '@/components/ui/status-message';
import { Download, Printer, FileSpreadsheet, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'react-hot-toast';

interface Contract {
  id: string;
  agreementNo: string;
  contractorName: string;
  workDescription: string;
  /** Present on the full list (not ?lean=1): lets the empty state say which contracts
   *  actually have bills, instead of offering a dropdown of names with nothing behind them. */
  _count?: { bills: number; pvcCalculations: number };
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

// A railway money statement carries the figure in words as well as digits, so the
// amount cannot be altered after signing without the two disagreeing.
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}

/** Indian numbering: crore, lakh, thousand, hundred. */
function amountInWords(amount: number): string {
  const negative = amount < 0;
  let n = Math.abs(Math.round(amount));
  if (n === 0) return 'Rupees Nil';
  const parts: string[] = [];
  const units: Array<[number, string]> = [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand'], [100, 'Hundred']];
  for (const [value, label] of units) {
    const count = Math.floor(n / value);
    if (count > 0) {
      parts.push(`${twoDigits(count)} ${label}`);
      n -= count * value;
    }
  }
  if (n > 0) parts.push(twoDigits(n));
  return `Rupees ${parts.join(' ')} only${negative ? ' (recoverable from the contractor)' : ''}`;
}

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
      // The full list on purpose: this page's opening screen names the contracts that
      // have bills, which needs the counts the lean list leaves out.
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
      if (!res.ok) {
        // The API says what is actually wrong — most often "no bills with PVC
        // calculations on this contract", which is not an error so much as an empty
        // contract. "Failed to fetch abstract data" told the reader nothing, and a
        // deep link with ?contractId= skips the opening screen that would have shown
        // them which contracts have bills.
        const reason = await res.json().then(d => d?.error).catch(() => null);
        throw new Error(reason || 'The abstract could not be built. Please try again.');
      }
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

  // Column totals for the abstract's TOTAL row. Cement, steel-by-category and the grand
  // total already come from the API; these are the columns it does not send.
  const totals = (abstractData?.billData || []).reduce(
    (sum, row) => ({
      billAmount: sum.billAmount + (row.billAmount || 0),
      labour: sum.labour + row.labour,
      plantMachinery: sum.plantMachinery + row.plantMachinery,
      fuel: sum.fuel + row.fuel,
      material: sum.material + row.material,
      steel: sum.steel + row.steelTmt + row.steelAngleChannel + row.steelPlates + row.steelOtherSections,
    }),
    { billAmount: 0, labour: 0, plantMachinery: 0, fuel: 0, material: 0, steel: 0 },
  );

  if (isLoading) return <div className="flex justify-center py-16"><LoadingSpinner size="lg" text="Loading..." /></div>;

  const quarters = Array.from(new Set((abstractData?.billData || []).map(b => b.quarter).filter(Boolean)));
  const pvcPercent = totals.billAmount > 0 && abstractData ? (abstractData.grandTotal / totals.billAmount) * 100 : null;
  const components: Array<[string, number]> = abstractData ? [
    ['Labour', totals.labour],
    ['Plant & machinery', totals.plantMachinery],
    ['Fuel', totals.fuel],
    ['Cement', abstractData.totalForCement],
    ['Steel', totals.steel],
    ['Other materials', totals.material],
  ] : [];
  const largest = components.length
    ? components.reduce((a, b) => (Math.abs(b[1]) > Math.abs(a[1]) ? b : a))
    : null;
  const withBills = contracts.filter(c => (c._count?.bills ?? 0) > 0);
  const withoutBills = contracts.filter(c => (c._count?.bills ?? 0) === 0);

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header — what this document is, not just what it is called. */}
      <div className="print:hidden">
        <nav className="text-sm text-gray-500 flex items-center gap-1.5" aria-label="Breadcrumb">
          <Link href="/bills" className="text-emerald-700 font-semibold hover:underline">Reports</Link>
          <span aria-hidden>›</span>
          <span>Abstract</span>
        </nav>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 mt-1">Abstract — all bills on one statement</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-[80ch]">
          Every bill on a contract with its price variation split by component, in the railway&apos;s proforma —
          the sheet you submit with a periodic or final claim.
        </p>
      </div>

      {error && <StatusMessage type="error" title="Error" message={error} />}

      {/* Toolbar: the contract, what the statement covers, and the two ways out of it. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 print:hidden">
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="text-sm text-gray-500 whitespace-nowrap">Contract</label>
          <div className="w-[22rem] max-w-full">
            <Select value={selectedContract} onValueChange={handleContractChange}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Select a contract" />
              </SelectTrigger>
              <SelectContent>
                {contracts.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.agreementNo} — {c.contractorName}
                    {c._count ? ` (${c._count.bills} ${c._count.bills === 1 ? 'bill' : 'bills'})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {abstractData && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200">
              {abstractData.billData?.length || 0} {abstractData.billData?.length === 1 ? 'bill' : 'bills'}
              {quarters.length > 0 && ` · ${quarters.length === 1 ? quarters[0] : `${quarters[0]} – ${quarters[quarters.length - 1]}`}`}
            </span>
          )}
        </div>
        {abstractData && (
          <div className="flex items-center gap-2">
            <Button onClick={() => window.print()} size="sm" variant="outline">
              <Printer className="h-4 w-4 mr-1.5" /> Print
            </Button>
            <Button onClick={handleDownloadPDF} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Download className="h-4 w-4 mr-1.5" /> Download PDF
            </Button>
          </div>
        )}
      </div>

      {isLoadingAbstract ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" text="Generating abstract..." /></div>
      ) : abstractData ? (
        <div className="space-y-5">
          {/* The answer, before the working. The one figure a person opens this page for
              sat in small text under a wide table; it now leads, with the words beside it
              (a railway money statement carries both) and the facts that qualify it. */}
          <div className="grid gap-3 lg:grid-cols-[1.15fr_1fr_1fr] print:hidden">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-emerald-800">
                Total price variation {abstractData.totalSay < 0 ? 'recoverable' : 'payable'}
              </p>
              <p className={`font-mono tabular-nums text-3xl font-semibold mt-1 ${abstractData.totalSay < 0 ? 'text-red-700' : 'text-emerald-800'}`}>
                {abstractData.totalSay < 0 ? '−' : ''}₹{fmt(Math.abs(abstractData.totalSay), 0)}
              </p>
              <p className="text-xs text-emerald-900/80 mt-1.5">{amountInWords(abstractData.totalSay)}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 flex flex-col justify-center gap-2 text-sm">
              <div className="flex justify-between gap-3"><span className="text-gray-500">Value of work covered</span><b className="font-mono tabular-nums">₹{fmt(totals.billAmount, 0)}</b></div>
              <div className="flex justify-between gap-3"><span className="text-gray-500">PVC as % of work</span><b className="font-mono tabular-nums">{pvcPercent == null ? '—' : `${pvcPercent.toFixed(2)}%`}</b></div>
              {/* Count plus the span, never the full list: a ten-bill contract listed six
                  quarters and wrapped the card to three lines. */}
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">Bills covered</span>
                <b className="text-right">
                  {abstractData.billData?.length || 0}
                  {quarters.length === 1 && ` · ${quarters[0]}`}
                  {quarters.length > 1 && ` · ${quarters[0]} – ${quarters[quarters.length - 1]}`}
                </b>
              </div>
              <div className="flex justify-between gap-3"><span className="text-gray-500">Base month (T₀)</span><b>{abstractData.contract.baseMonth}</b></div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 flex flex-col justify-center gap-2 text-sm">
              {largest && (
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Largest component</span>
                  <b>{largest[0]} · <span className={`font-mono tabular-nums ${numClass(largest[1])}`}>₹{fmt(largest[1], 0)}</span></b>
                </div>
              )}
              {components.filter(([label]) => label !== largest?.[0]).slice(0, 3).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <span className="text-gray-500">{label}</span>
                  <b className={`font-mono tabular-nums ${numClass(value)}`}>{value < 0 ? '−' : ''}₹{fmt(Math.abs(value), 0)}</b>
                </div>
              ))}
            </div>
          </div>

          {/* Proforma heading and contract block, matching the single-bill IR statement so
              the two documents read as one set when submitted together. */}
          <div className="border border-gray-300 rounded-lg bg-white">
            <div className="border-b border-gray-300 px-4 py-3 text-center">
              <h2 className="text-base font-semibold text-gray-900">STATEMENT SHOWING PRICE VARIATION CLAUSE &mdash; ABSTRACT</h2>
              <p className="text-xs text-gray-500 mt-0.5">(As per GCC Clause 46A / Railway Board Guidelines)</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-2 p-4 text-sm">
              <div className="md:col-span-3"><span className="text-gray-500">Name of Work</span><p className="font-medium">{abstractData.contract.workDescription}</p></div>
              <div><span className="text-gray-500">Agreement No.</span><p className="font-medium">{abstractData.contract.agreementNo}</p></div>
              <div><span className="text-gray-500">Contractor</span><p className="font-medium">{abstractData.contract.contractorName}</p></div>
              <div><span className="text-gray-500">Date of Opening</span><p className="font-medium">{abstractData.contract.dateOfOpening}</p></div>
              <div><span className="text-gray-500">Base Month (T0)</span><p className="font-medium">{abstractData.contract.baseMonth}</p></div>
              <div><span className="text-gray-500">Bills covered</span><p className="font-medium">{abstractData.billData?.length || 0}</p></div>
            </div>
          </div>

          {/* Bill-wise abstract in the railway proforma: every component gets its own
              column, so the sheet adds up across and down on one page. The three-table
              split this replaced kept steel sections inside "General" while cement and
              TMT sat in tables of their own, so no single row ever showed a bill's total. */}
          <div className="border border-gray-300 rounded-lg overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <Th>Sl.</Th>
                    <Th>Bill No.</Th>
                    <Th>Quarter</Th>
                    <Th right>Value of work (W)</Th>
                    <Th right>Labour</Th>
                    <Th right>P &amp; M</Th>
                    <Th right>Fuel</Th>
                    <Th right>Cement</Th>
                    <Th right>Steel</Th>
                    <Th right>Other materials</Th>
                    <Th right>Total PVC</Th>
                  </tr>
                </thead>
                <tbody>
                  {abstractData.billData?.map((row, i) => {
                    const steel = row.steelTmt + row.steelAngleChannel + row.steelPlates + row.steelOtherSections;
                    return (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <Td>{i + 1}</Td>
                        <Td bold>{row.billNo || '-'}</Td>
                        <Td>{row.quarter}</Td>
                        <Td right>{fmt(row.billAmount)}</Td>
                        <Td right><span className={numClass(row.labour)}>{fmt(row.labour)}</span></Td>
                        <Td right><span className={numClass(row.plantMachinery)}>{fmt(row.plantMachinery)}</span></Td>
                        <Td right><span className={numClass(row.fuel)}>{fmt(row.fuel)}</span></Td>
                        <Td right><span className={numClass(row.cement)}>{fmt(row.cement)}</span></Td>
                        <Td right><span className={numClass(steel)}>{fmt(steel)}</span></Td>
                        <Td right><span className={numClass(row.material)}>{fmt(row.material)}</span></Td>
                        <Td right bold><span className={numClass(row.total)}>{fmt(row.total)}</span></Td>
                      </tr>
                    );
                  })}
                  <tr className="bg-gray-100 font-semibold">
                    <td className="border border-gray-200 px-3 py-2 text-xs text-gray-600" colSpan={3}>TOTAL</td>
                    <Td right>{fmt(totals.billAmount)}</Td>
                    <Td right><span className={numClass(totals.labour)}>{fmt(totals.labour)}</span></Td>
                    <Td right><span className={numClass(totals.plantMachinery)}>{fmt(totals.plantMachinery)}</span></Td>
                    <Td right><span className={numClass(totals.fuel)}>{fmt(totals.fuel)}</span></Td>
                    <Td right><span className={numClass(abstractData.totalForCement)}>{fmt(abstractData.totalForCement)}</span></Td>
                    <Td right><span className={numClass(totals.steel)}>{fmt(totals.steel)}</span></Td>
                    <Td right><span className={numClass(totals.material)}>{fmt(totals.material)}</span></Td>
                    <Td right bold><span className={numClass(abstractData.grandTotal)}>{fmt(abstractData.grandTotal)}</span></Td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* The four steel categories are priced against different JPC baskets, so the
                single Steel column is split out here rather than lost. */}
            <div className="flex flex-wrap gap-x-8 gap-y-1 border-t border-gray-200 px-4 py-2.5 text-xs text-gray-600">
              <span className="font-medium text-gray-500">Steel comprises:</span>
              <span>TMT bars <span className={`font-medium ${numClass(abstractData.totalForSteelTmt)}`}>{fmt(abstractData.totalForSteelTmt)}</span></span>
              <span>Angle / channel <span className={`font-medium ${numClass(abstractData.totalForSteelAngleChannel)}`}>{fmt(abstractData.totalForSteelAngleChannel)}</span></span>
              <span>Plates <span className={`font-medium ${numClass(abstractData.totalForSteelPlates)}`}>{fmt(abstractData.totalForSteelPlates)}</span></span>
              <span>Other sections <span className={`font-medium ${numClass(abstractData.totalForSteelOtherSections)}`}>{fmt(abstractData.totalForSteelOtherSections)}</span></span>
            </div>

            <div className="border-t border-gray-200 px-4 py-3">
              <p className="text-sm">
                <span className="text-gray-500">Total price variation {abstractData.totalSay < 0 ? 'recoverable' : 'payable'}:</span>{' '}
                <span className={`font-semibold ${numClass(abstractData.totalSay)}`}>Rs. {fmt(abstractData.totalSay, 0)}</span>
              </p>
              <p className="mt-1 text-sm text-gray-700">{amountInWords(abstractData.totalSay)}</p>
            </div>
          </div>

          {/* Classification-wise Steel */}
          {abstractData.classificationSteelData?.length > 0 && (
            <div>
              <SectionTitle>Classification-wise Steel</SectionTitle>
              <div className="border border-gray-200 rounded-lg overflow-x-auto">
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

          {/* A recovery raises a tax question the statement itself must not answer, so the
              explanation lives here rather than on the page the railway reads. The PDF
              carries the same text on a sheet of its own, marked as not part of the
              submission. Shown only when the variation is actually negative. */}
          {abstractData.totalSay < 0 && (() => {
            // IREPS bills state "Rate is inclusive of GST", and on every bill seen it says
            // Yes. The billed value already contains the tax, so a variation worked out
            // from it does too. The GST is EXTRACTED, never added on top — adding it would
            // count the tax twice and overstate a recovery by 18%.
            const splitGst = (amountInclGst: number) => {
              const taxable = Math.round((amountInclGst / 1.18) * 100) / 100;
              return { taxable, gst: Math.round((amountInclGst - taxable) * 100) / 100 };
            };
            const recovery = Math.abs(abstractData.totalSay);
            const net = splitGst(recovery);
            const rows = (abstractData.billData || []).map(row => ({
              billNo: row.billNo || '-',
              quarter: row.quarter,
              pvc: Math.abs(row.total),
              ...splitGst(Math.abs(row.total)),
              isCredit: row.total < 0,
            }));
            return (
              <div className="border border-amber-300 bg-amber-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-amber-900">This price variation is a recovery, not a payment</h3>
                <p className="mt-2 text-sm text-amber-900">
                  Prices fell below the base month, so <span className="font-semibold">₹{fmt(recovery, 0)}</span> is
                  recoverable from you rather than payable. That figure is inclusive of GST: of it,
                  <span className="font-semibold"> ₹{fmt(net.taxable, 0)}</span> is taxable value and
                  <span className="font-semibold"> ₹{fmt(net.gst, 0)}</span> is GST at 18%.
                </p>
                <p className="mt-2 text-sm text-amber-900">
                  These bills were billed at rates inclusive of GST, so each variation below already contains
                  the tax rather than attracting it on top. The financial year of each <em>original</em> tax
                  invoice, not of this statement, decides how long that adjustment stays open.
                </p>

                {/* The bill-wise split. An accountant cannot get here from the net figure —
                    each slice belongs to a different invoice, in a different year. */}
                <div className="mt-3 overflow-x-auto rounded-md border border-amber-300 bg-white">
                  <table className="w-full text-xs">
                    <thead className="bg-amber-100/70 text-amber-900">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Bill No.</th>
                        <th className="px-3 py-2 text-left font-medium">Quarter</th>
                        <th className="px-3 py-2 text-right font-medium">Variation (incl. GST)</th>
                        <th className="px-3 py-2 text-right font-medium">Taxable value</th>
                        <th className="px-3 py-2 text-right font-medium">GST @ 18%</th>
                        <th className="px-3 py-2 text-left font-medium">Instrument</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-200">
                      {rows.map((row, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 font-medium">{row.billNo}</td>
                          <td className="px-3 py-1.5">{row.quarter}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmt(row.pvc, 0)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmt(row.taxable, 0)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmt(row.gst, 0)}</td>
                          <td className="px-3 py-1.5">{row.isCredit ? 'Credit note' : 'Tax invoice'}</td>
                        </tr>
                      ))}
                      <tr className="bg-amber-100/70 font-semibold">
                        <td className="px-3 py-2">NET</td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(recovery, 0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(net.taxable, 0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(net.gst, 0)}</td>
                        <td className="px-3 py-2">Net recovery</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p className="mt-4 text-sm font-semibold text-amber-900">What to do</p>
                <ol className="mt-1 space-y-2 text-sm text-amber-900 list-decimal pl-5">
                  <li>
                    <span className="font-medium">Check whether any bill is still to be raised on this agreement.</span>{' '}
                    If one is, ask for the recovery to be adjusted there. That bill is then invoiced at the
                    reduced value, GST is charged on the lower figure, and no earlier invoice has to be touched.
                    Stop here — the steps below only apply if no bill remains, or it is smaller than the recovery.
                  </li>
                  <li>
                    <span className="font-medium">Write the tax invoice number and date against each bill above.</span>{' '}
                    The app does not hold them, and the year of that invoice is what sets the time limit for its row.
                  </li>
                  <li>
                    <span className="font-medium">Group the rows by the financial year of their invoice.</span>{' '}
                    Rows in a year that is still open can have their tax adjusted by credit note. Rows in a closed
                    year cannot — that tax stays with the government. Your accountant will confirm the cut-off for each year.
                  </li>
                  <li>
                    <span className="font-medium">Take up the closed years with the railway separately.</span>{' '}
                    Where the tax can no longer be reversed, ask that the recovery for that period be limited to the
                    taxable value and exclude the GST element, since you can no longer recover that tax from anyone.
                    Put the bills, invoice dates and figures in writing. The price fall is recoverable either way;
                    the tax inside it is the part worth arguing.
                  </li>
                </ol>
                <p className="mt-3 text-xs text-amber-800 italic">
                  These figures are derived from this statement and are indicative. They are not tax advice —
                  the treatment is for you and your accountant to determine.
                </p>
              </div>
            );
          })()}

          {/* Certification and signatures. A statement that goes to an accounts office is
              a signed document; leaving nowhere to sign is what gets one returned —
              "the calculation sheet may be revised duly signed by the competent authority". */}
          <div className="border border-gray-300 rounded-lg bg-white p-4">
            <p className="text-sm text-gray-700">
              Certified that the price variation shown above has been calculated as per the
              conditions of the contract and the indices published by the competent authority.
            </p>
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-6">
              {['Prepared by', 'Checked by', 'Accepted by'].map(role => (
                <div key={role} className="border-t border-gray-400 pt-1.5">
                  <p className="text-xs text-gray-500">{role}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : selectedContract ? (
        <div className="text-center py-16 text-gray-500">No data found for this contract.</div>
      ) : (
        /* The opening screen. "Select a contract to view the abstract report." on an empty
           page told a first-time reader neither what the abstract is nor which contracts
           have anything to show — the dropdown lists every contract, including the ones
           with no bills, which produce an empty statement. */
        <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr] items-start">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              <h2 className="font-bold text-gray-900">What the abstract is</h2>
            </div>
            <p className="text-sm text-gray-600 mt-2">
              One statement covering <b>every bill on a contract</b>: each bill&apos;s value of work and its
              price variation split into labour, plant &amp; machinery, fuel, cement, steel and other
              materials, with the total in figures and in words, and space for the three signatures.
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-gray-600 list-disc pl-5">
              <li>Submitted with a periodic or final claim, alongside the single-bill statements.</li>
              <li>Steel is split into TMT, angle/channel, plates and other sections, priced on different JPC baskets.</li>
              <li>If the total comes out negative, the sheet explains the recovery and its GST separately.</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="font-bold text-gray-900">Pick a contract</h2>
            {withBills.length === 0 ? (
              <p className="text-sm text-gray-600 mt-2">
                No contract has a bill yet. Add a bill first and its abstract builds itself.{' '}
                <Link href="/bills/new" className="text-emerald-700 font-semibold hover:underline">Add a bill →</Link>
              </p>
            ) : (
              <>
                <p className="text-sm text-gray-500 mt-1">{withBills.length} {withBills.length === 1 ? 'contract has' : 'contracts have'} bills to abstract.</p>
                <div className="mt-3 divide-y divide-gray-100 max-h-80 overflow-y-auto">
                  {withBills.slice(0, 12).map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleContractChange(c.id)}
                      className="w-full text-left py-2.5 flex items-center justify-between gap-3 group"
                    >
                      <span className="min-w-0">
                        <span className="block font-semibold text-sm text-gray-900 truncate">{c.agreementNo}</span>
                        <span className="block text-xs text-gray-500 truncate">{c.contractorName}</span>
                      </span>
                      <span className="shrink-0 text-xs text-gray-500 inline-flex items-center gap-1.5">
                        {c._count?.bills} {c._count?.bills === 1 ? 'bill' : 'bills'}
                        <ArrowRight className="h-3.5 w-3.5 text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </span>
                    </button>
                  ))}
                </div>
                {withBills.length > 12 && (
                  <p className="text-xs text-gray-400 mt-2">…and {withBills.length - 12} more — use the dropdown above.</p>
                )}
              </>
            )}
            {withoutBills.length > 0 && (
              <p className="text-xs text-gray-400 mt-3 border-t border-gray-100 pt-3">
                {withoutBills.length} {withoutBills.length === 1 ? 'contract has' : 'contracts have'} no bills yet — their abstract would be empty.
              </p>
            )}
          </div>
        </div>
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
