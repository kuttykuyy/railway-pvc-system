
import { Button } from '@/components/ui/button';
import {
  Building2, Calendar, User, FileText, Calculator,
  Edit, Plus, BarChart3, CheckCircle2, AlertTriangle, Info, Eye
} from 'lucide-react';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { format } from 'date-fns';
import { notFound } from 'next/navigation';
import { formatContractValue } from '@/lib/gcc-compliance';
import { BackButton } from '@/components/ui/back-button';
import { ShareContractDialog } from '@/components/contracts/share-contract-dialog';
import { ContractMoreMenu } from '@/components/contracts/contract-more-menu';
import { getAdministeringZone } from '@/lib/jurisdiction';
import { BillCard } from '@/components/bill-card';
import { resolvePre2022Setup } from '@/lib/pre2022-contract';
import { DeleteBillButton } from '@/components/bills/delete-bill-button';
import { FirstBillFreeTag } from '@/components/billing/first-bill-free-tag';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { checkUserContractAccess } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

interface Props { params: Promise<{id: string}> }

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <div className="text-sm font-medium text-gray-800">{value}</div>
    </div>
  );
}

export default async function ContractDetailPage({ params }: Props) {
  const { id } = await params;

  // The page read the contract straight from the database with no ownership check —
  // any signed-in user with a contract id (a stale share link is enough) saw another
  // contractor's full contract, bills, and PVC figures. Same rule as the bills API.
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) notFound();
  const viewer = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!viewer) notFound();
  const access = await checkUserContractAccess(viewer.id, id);
  if (!access?.canView) notFound();

  const contract = await prisma.contract.findUnique({
    where: { id: id },
    include: {
      bills: {
        orderBy: { dateOfMeasurement: 'desc' },
        include: { pvcCalculation: true }
      },
      pvcCalculations: { orderBy: { createdAt: 'desc' } },
      extensions: { orderBy: { approvalDate: 'desc' } }
    }
  });

  if (!contract) notFound();

  const totalBillAmount = contract.bills.reduce((s: number, b: any) => s + b.billAmount, 0);
  const totalPvcAmount = contract.pvcCalculations.reduce((s, p) => s + p.totalPvc, 0);

  const pvcApplicable = contract.tenderAdvertisedValue && contract.tenderAdvertisedValue > 20000000;
  const pvcUnknown = !contract.tenderAdvertisedValue;

  // Which price variation clause governs. On the older GCC the correct statement lives
  // on its own screen per bill, and until now the only doorway to it was a banner on the
  // bill page — someone starting from the contract had no way in at all.
  const pre2022 = resolvePre2022Setup(contract as any);

  // A contract run by a zone other than the one its agreement number names — the
  // Mangaluru transfer and any like it. Null when never moved, or before the columns
  // are applied (lib/jurisdiction.ts), and then nothing is shown.
  const administeringZone = await getAdministeringZone(contract.id);
  const agreementZone = contract.agreementNo.split('/')[0]?.trim().toUpperCase() || null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

      {/* Header: a document title with its facts, and one primary action. Six equal
          buttons beside the title used to leave the page with no obvious next step and
          the title squeezed into a corner; now Add bill leads, Edit and Share stay at
          hand, and the documents and analyses sit behind "More". The facts row carries
          what the four stat tiles below it used to — contractor, value, base month,
          bills and PVC — so the page is one row shorter. */}
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="min-w-0">
            <nav className="text-sm text-gray-500 flex items-center gap-1.5" aria-label="Breadcrumb">
              <Link href="/contracts" className="text-emerald-700 font-semibold hover:underline">Contracts</Link>
              <span aria-hidden>›</span>
              <span className="truncate">{contract.agreementNo}</span>
            </nav>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 break-words mt-1.5">{contract.agreementNo}</h1>
            <p className="text-sm sm:text-[15px] text-gray-500 mt-1 max-w-[78ch]">{contract.workDescription}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {administeringZone && administeringZone !== agreementZone && (
              <span
                className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 bg-sky-50 text-sky-800 border border-sky-200"
                title={`This contract is now administered by ${administeringZone}, though its agreement number is ${agreementZone}. See Admin → People & Access → Jurisdiction transfers for the order.`}
              >
                Administered by {administeringZone}
              </span>
            )}
            {contract.bills.length === 0 ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200">
                <span className="h-1.5 w-1.5 rounded-full bg-current" /> Setup · no bills yet
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {contract.pvcCalculations.length > 0 ? 'PVC ready' : 'Active'} · {contract.bills.length} {contract.bills.length === 1 ? 'bill' : 'bills'}
              </span>
            )}
            <Link href={`/bills/new?contractId=${contract.id}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
              <Plus className="h-4 w-4" /> Add bill
            </Link>
            <Link href={`/contracts/${contract.id}/edit`}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">
              <Edit className="h-4 w-4" /> Edit
            </Link>
            <ShareContractDialog contractId={contract.id} agreementNo={contract.agreementNo} />
            <ContractMoreMenu contractId={contract.id} extensionCount={contract.extensions.length} />
          </div>
        </div>

        <dl className="flex flex-wrap gap-x-7 gap-y-3 mt-4 pt-4 border-t border-gray-100 text-sm">
          {[
            ['Contractor', contract.contractorName],
            ['Agreement value', contract.contractValue ? formatContractValue(contract.contractValue) : '—'],
            ['Base month', format(new Date(contract.baseMonth), 'MMMM yyyy')],
            ['LOA', contract.loaNo
              ? `${contract.loaNo}${contract.loaDate ? ` · ${format(new Date(contract.loaDate as unknown as string), 'dd MMM yyyy')}` : ''}`
              : '—'],
            ['Completion', contract.completionPeriodMonths ? `${contract.completionPeriodMonths} months` : '—'],
            ['Bills', `${contract.bills.length} · ₹${totalBillAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`],
            // On a pre-2022 contract the stored totals are GCC-2022 figures — the wrong
            // clause — and a number in a headline gets quoted. The statements carry the
            // right figures.
            ['Total PVC', pre2022.isPre2022 ? 'see statements' : `₹${totalPvcAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">{label}</dt>
              <dd className="font-medium text-gray-800 break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* The doorway to the older-GCC statement. Full-width and OUTSIDE the header row —
          inside it, the panel sat in the column the action buttons squeeze, and rendered
          as a narrow box beside a page-wide blank. Each bill links straight to its
          correct statement; with no bills yet, it says the next step is uploading one,
          so nobody hunts for a "create old PVC" button that rightly does not exist —
          the bill IS the input. */}
      {pre2022.isPre2022 && (
        <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 space-y-2">
          <p className="text-sm font-semibold text-amber-900 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            This contract is on the older GCC — its bills are priced under the pre-2022 clause
          </p>
          {contract.bills.length === 0 ? (
            <p className="text-sm text-amber-800">
              Upload a bill below and its statement under the old clause will be ready on the
              bill&apos;s page.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {contract.bills.map((b: any) => (
                <Link
                  key={b.id}
                  href={`/bills/${b.id}/pre2022`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-900 bg-amber-100 border border-amber-300 rounded-md px-2.5 py-1 hover:bg-amber-200"
                >
                  <Calculator className="h-3.5 w-3.5" />
                  {b.billNo}: old-GCC statement
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Contract Details + GCC */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left: Contract details */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg p-5 space-y-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Contract Details</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Agreement Number" value={contract.agreementNo} />
            {contract.loaNo && <Field label="LOA Number" value={contract.loaNo} />}
            {contract.loaDate && (
              <Field label="LOA Date" value={format(new Date(contract.loaDate as unknown as string), 'dd MMM yyyy')} />
            )}
            <Field label="Date of Opening" value={format(new Date(contract.dateOfOpening), 'dd MMM yyyy')} />
            <Field label="Base Month" value={format(new Date(contract.baseMonth), 'MMMM yyyy')} />
            {contract.completionPeriodMonths && (
              <Field label="Completion Period" value={`${contract.completionPeriodMonths} months`} />
            )}
            {contract.originalCompletionDate && (
              <Field label="Original Completion" value={format(new Date(contract.originalCompletionDate), 'dd MMM yyyy')} />
            )}
            {contract.currentCompletionDate && (
              <Field
                label="Current Completion"
                value={
                  <span className="flex items-center gap-2">
                    {format(new Date(contract.currentCompletionDate), 'dd MMM yyyy')}
                    {contract.isExtended && (
                      <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full">
                        Extended ({contract.extensionType})
                      </span>
                    )}
                  </span>
                }
              />
            )}
          </div>

          {contract.workDescription && (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Work Description</p>
              <p className="text-sm text-gray-700 leading-relaxed">{contract.workDescription}</p>
            </div>
          )}

          {contract.isExtended && contract.extensionReason && (
            <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm">
              <AlertTriangle className="h-4 w-4 text-orange-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-orange-800">Extension Reason (GCC {contract.extensionType})</p>
                <p className="text-orange-700 mt-0.5">{contract.extensionReason}</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: GCC 46A.1 + values */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-emerald-500" />
            <h2 className="text-sm font-semibold text-gray-700">GCC 46A.1 — PVC Applicability</h2>
          </div>

          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm font-medium ${
            pvcApplicable ? 'bg-green-50 text-green-800 border border-green-200' :
            pvcUnknown ? 'bg-amber-50 text-amber-800 border border-amber-200' :
            'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {pvcApplicable ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertTriangle className="h-4 w-4 flex-shrink-0" />}
            <span>
              {pvcApplicable ? 'PVC Applicable (Value > ₹2 Cr)' :
               pvcUnknown ? 'PVC Applicability Not Determined' :
               'PVC Not Applicable (Value ≤ ₹2 Cr)'}
            </span>
          </div>

          {contract.pvcEligibilityNote && (
            <p className="text-xs text-gray-500">{contract.pvcEligibilityNote}</p>
          )}
          {pvcUnknown && (
            <p className="text-xs text-gray-500">Tender Advertised Value not provided. PVC applicability cannot be determined automatically.</p>
          )}

          <div className="space-y-3 pt-1">
            {contract.tenderAdvertisedValue && (
              <Field label="Tender Advertised Value" value={formatContractValue(contract.tenderAdvertisedValue)} />
            )}
            {contract.contractValue && (
              <Field label="Agreement Value" value={formatContractValue(contract.contractValue)} />
            )}
          </div>

          {contract.hasRailwaySuppliedMaterials && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-900">Railway Supplied Materials</p>
                <p className="text-xs text-amber-700 mt-0.5">Exclusion per GCC 46A.1</p>
                {contract.railwaySuppliedMaterialsNote && (
                  <p className="text-xs text-amber-700 mt-1">{contract.railwaySuppliedMaterialsNote}</p>
                )}
              </div>
            </div>
          )}

          {/* Quick stats */}
          <div className="border-t border-gray-100 pt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Bills</span>
              <span className="font-semibold">{contract.bills.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">PVC Calculations</span>
              <span className="font-semibold">{contract.pvcCalculations.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Extensions</span>
              <span className="font-semibold">{contract.extensions.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bills */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Bills</h2>
            <p className="text-xs text-gray-400 mt-0.5">Running account bills with PVC calculations</p>
          </div>
          <span className="inline-flex items-center gap-2">
            <FirstBillFreeTag />
            <Link href={`/bills/new?contractId=${contract.id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
              <Plus className="h-4 w-4" /> Add Bill
            </Link>
          </span>
        </div>

        {contract.bills.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-12 text-gray-400">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium text-gray-600 mx-auto max-w-none">No bills yet</p>
            <p className="text-sm mt-1 mx-auto max-w-none">Add your first running account bill to start PVC calculations.</p>
            <Link href={`/bills/new?contractId=${contract.id}`}
              className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
              <Plus className="h-4 w-4" /> Add First Bill <FirstBillFreeTag className="bg-white/20 text-white" />
            </Link>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500">Bill No</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Quarter</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Measurement Date</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Bill Amount</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">PVC</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Cumulative PVC</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {contract.bills.slice(0, 10).map((bill: any) => (
                    <tr key={bill.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-semibold text-gray-800">{bill.billNo}</td>
                      <td className="px-4 py-3 text-gray-600">{bill.quarter || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {format(new Date(bill.dateOfMeasurement), 'dd MMM yyyy')}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        ₹{bill.billAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {pre2022.isPre2022 ? (
                          // The stored figure is the WRONG clause for this contract; a
                          // green number in this column gets copied onto submissions.
                          <Link href={`/bills/${bill.id}/pre2022`} className="text-amber-700 text-xs font-medium hover:underline">
                            old-GCC statement
                          </Link>
                        ) : bill.pvcCalculation ? (
                          <span className={`font-semibold ${bill.pvcCalculation.totalPvc >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ₹{bill.pvcCalculation.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {pre2022.isPre2022 ? (
                          <span className="text-gray-300">—</span>
                        ) : bill.pvcCalculation ? (
                          <span className="text-gray-700 font-medium">
                            ₹{bill.pvcCalculation.cumulativePvc.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/bills/${bill.id}`}
                          className="p-1.5 rounded text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors inline-flex">
                          <Eye className="h-4 w-4" />
                        </Link>
                        <DeleteBillButton billId={bill.id} billNo={bill.billNo} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {contract.bills.length > 10 && (
              <div className="px-5 py-3 border-t border-gray-100 text-center">
                <Link href={`/bills?contractId=${contract.id}`}
                  className="text-sm text-emerald-600 hover:underline">
                  View all {contract.bills.length} bills →
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
