
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
import { BillCard } from '@/components/bill-card';

export const dynamic = 'force-dynamic';

interface Props { params: { id: string } }

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <div className="text-sm font-medium text-gray-800">{value}</div>
    </div>
  );
}

export default async function ContractDetailPage({ params }: Props) {
  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
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

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <BackButton href="/contracts" label="Contracts" variant="outline" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mt-2 break-all">{contract.agreementNo}</h1>
          <p className="text-sm text-gray-500 mt-1 line-clamp-2">{contract.workDescription}</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Link href={`/contracts/${contract.id}/covering-letter`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
            <FileText className="h-4 w-4" /> Covering Letter
          </Link>
          <Link href={`/contracts/${contract.id}/extensions`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
            <Calendar className="h-4 w-4" /> Extensions
            {contract.isExtended && (
              <span className="ml-1 text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full">{contract.extensions.length}</span>
            )}
          </Link>
          <Link href={`/contracts/${contract.id}/quarterly-averages`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
            <BarChart3 className="h-4 w-4" /> Quarterly Averages
          </Link>
          <Link href={`/contracts/${contract.id}/edit`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
            <Edit className="h-4 w-4" /> Edit
          </Link>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Contractor', value: contract.contractorName, icon: User, color: 'text-blue-600' },
          { label: 'Base Month', value: format(new Date(contract.baseMonth), 'MMM yyyy'), icon: Calendar, color: 'text-green-600' },
          { label: 'Total Bills', value: `₹${totalBillAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, icon: FileText, color: 'text-purple-600' },
          { label: 'Total PVC', value: `₹${totalPvcAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, icon: Calculator, color: 'text-orange-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`h-4 w-4 ${color}`} />
              <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
            </div>
            <p className="text-sm font-semibold text-gray-800 truncate">{value}</p>
          </div>
        ))}
      </div>

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
            <Info className="h-4 w-4 text-blue-500" />
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
          <Link href={`/bills/new?contractId=${contract.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Add Bill
          </Link>
        </div>

        {contract.bills.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-12 text-gray-400">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium text-gray-600 mx-auto max-w-none">No bills yet</p>
            <p className="text-sm mt-1 mx-auto max-w-none">Add your first running account bill to start PVC calculations.</p>
            <Link href={`/bills/new?contractId=${contract.id}`}
              className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Plus className="h-4 w-4" /> Add First Bill
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
                        {bill.pvcCalculation ? (
                          <span className={`font-semibold ${bill.pvcCalculation.totalPvc >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ₹{bill.pvcCalculation.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {bill.pvcCalculation ? (
                          <span className="text-gray-700 font-medium">
                            ₹{bill.pvcCalculation.cumulativePvc.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/bills/${bill.id}`}
                          className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors inline-flex">
                          <Eye className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {contract.bills.length > 10 && (
              <div className="px-5 py-3 border-t border-gray-100 text-center">
                <Link href={`/bills?contractId=${contract.id}`}
                  className="text-sm text-blue-600 hover:underline">
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
