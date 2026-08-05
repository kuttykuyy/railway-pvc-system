
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
