
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, Calendar, User, FileText, Calculator, Edit, Plus, BarChart3, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { format } from 'date-fns';
import { notFound } from 'next/navigation';
import { formatContractValue } from '@/lib/gcc-compliance';
import { BackButton } from '@/components/ui/back-button';
import { BillCard } from '@/components/bill-card';

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-600 mb-1">{children}</p>;
}

export const dynamic = "force-dynamic";



interface ContractDetailPageProps {
  params: { id: string };
}

export default async function ContractDetailPage({ params }: ContractDetailPageProps) {
  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
    include: {
      bills: {
        orderBy: { dateOfMeasurement: 'desc' },
        include: {
          pvcCalculation: true
        }
      },
      pvcCalculations: {
        orderBy: { createdAt: 'desc' }
      },
      extensions: {
        orderBy: { approvalDate: 'desc' }
      }
    }
  });

  if (!contract) {
    notFound();
  }

  const totalBillAmount = contract.bills.reduce((sum: number, bill: any) => sum + bill.billAmount, 0);
  const totalPvcAmount = contract.pvcCalculations.reduce((sum, pvc) => sum + pvc.totalPvc, 0);

  return (
    <div className="space-y-6 -mx-2 sm:-mx-4 px-2 sm:px-4 max-w-full">
      <div className="flex items-center gap-4 flex-wrap">
        <BackButton href="/contracts" label="Back to Contracts" variant="outline" />
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Building2 className="h-8 w-8 text-blue-600" />
            {contract.agreementNo}
          </h1>
          <p className="text-gray-600 mt-2">{contract.workDescription}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button asChild variant="outline">
            <Link href={`/contracts/${contract.id}/covering-letter`}>
              <FileText className="h-4 w-4 mr-2" />
              Covering Letter
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/contracts/${contract.id}/extensions`}>
              <Calendar className="h-4 w-4 mr-2" />
              Extensions
              {contract.isExtended && (
                <span className="ml-2 px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">
                  {contract.extensions.length}
                </span>
              )}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/contracts/${contract.id}/quarterly-averages`}>
              <BarChart3 className="h-4 w-4 mr-2" />
              Quarterly Averages
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/contracts/${contract.id}/edit`}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Contract
            </Link>
          </Button>
        </div>
      </div>

      {/* Contract Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-md bg-gradient-to-r from-blue-50 to-blue-100">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <User className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-blue-900">Contractor</p>
                <p className="text-xs text-blue-700">{contract.contractorName}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md bg-gradient-to-r from-green-50 to-green-100">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Calendar className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-900">Base Month</p>
                <p className="text-xs text-green-700">
                  {format(new Date(contract.baseMonth), 'MMM yyyy')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md bg-gradient-to-r from-purple-50 to-purple-100">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <FileText className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm font-medium text-purple-900">Total Bills</p>
                <p className="text-xs text-purple-700">₹{totalBillAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md bg-gradient-to-r from-orange-50 to-orange-100">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Calculator className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-sm font-medium text-orange-900">Total PVC</p>
                <p className="text-xs text-orange-700">₹{totalPvcAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contract Details */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Contract Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label>Agreement Number</Label>
              <p className="text-sm font-medium text-gray-900">{contract.agreementNo}</p>
            </div>
            {contract.loaNo && (
              <div>
                <Label>LOA Number</Label>
                <p className="text-sm font-medium text-gray-900">{contract.loaNo}</p>
              </div>
            )}
            <div>
              <Label>Date of Opening</Label>
              <p className="text-sm font-medium text-gray-900">
                {format(new Date(contract.dateOfOpening), 'dd MMMM yyyy')}
              </p>
            </div>
            <div>
              <Label>Base Month</Label>
              <p className="text-sm font-medium text-gray-900">
                {format(new Date(contract.baseMonth), 'MMMM yyyy')}
              </p>
            </div>
            {contract.originalCompletionDate && (
              <div>
                <Label>Original Completion Date</Label>
                <p className="text-sm font-medium text-gray-900">
                  {format(new Date(contract.originalCompletionDate), 'dd MMMM yyyy')}
                </p>
              </div>
            )}
            {contract.currentCompletionDate && (
              <div>
                <Label>Current Completion Date</Label>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900">
                    {format(new Date(contract.currentCompletionDate), 'dd MMMM yyyy')}
                  </p>
                  {contract.isExtended && (
                    <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                      Extended ({contract.extensionType})
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* GCC 46A.1 Compliance Information */}
          <div className="border-t pt-4 mt-4 space-y-4">
            <div className="flex items-center gap-2 text-blue-600">
              <Info className="h-5 w-5" />
              <h3 className="font-semibold">GCC 46A.1 - PVC Applicability</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {contract.tenderAdvertisedValue && (
                <div>
                  <Label>Tender Advertised Value</Label>
                  <p className="text-sm font-medium text-gray-900">
                    {formatContractValue(contract.tenderAdvertisedValue)}
                  </p>
                </div>
              )}

              {contract.contractValue && (
                <div>
                  <Label>AGREEMENT VALUE</Label>
                  <p className="text-sm font-medium text-gray-900">
                    {formatContractValue(contract.contractValue)}
                  </p>
                </div>
              )}

              {contract.completionPeriodMonths && (
                <div>
                  <Label>Completion Period</Label>
                  <p className="text-sm font-medium text-gray-900">
                    {contract.completionPeriodMonths} months
                  </p>
                </div>
              )}

              <div className="md:col-span-2 lg:col-span-3">
                <Label>PVC Applicability Status</Label>
                <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg ${
                  contract.tenderAdvertisedValue && contract.tenderAdvertisedValue > 20000000
                    ? 'bg-green-50 text-green-800 border border-green-200' 
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}>
                  {contract.tenderAdvertisedValue && contract.tenderAdvertisedValue > 20000000 ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                  <span className="text-sm font-medium">
                    {contract.tenderAdvertisedValue && contract.tenderAdvertisedValue > 20000000 
                      ? 'PVC Applicable (Tender Value > ₹2 Crores)' 
                      : contract.tenderAdvertisedValue 
                        ? 'PVC Not Applicable (Tender Value ≤ ₹2 Crores)'
                        : 'PVC Applicability Not Determined'}
                  </span>
                </div>
                {contract.pvcEligibilityNote && (
                  <p className="text-xs text-gray-600 mt-2">
                    {contract.pvcEligibilityNote}
                  </p>
                )}
                {!contract.tenderAdvertisedValue && (
                  <p className="text-xs text-gray-600 mt-2">
                    Tender Advertised Value not provided. PVC applicability cannot be determined automatically.
                  </p>
                )}
              </div>

              {contract.hasRailwaySuppliedMaterials && (
                <div className="md:col-span-2 lg:col-span-3">
                  <Label>Materials Supplied by Railway</Label>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-900">
                          Exclusion per GCC 46A.1
                        </p>
                        {contract.railwaySuppliedMaterialsNote && (
                          <p className="text-xs text-amber-700 mt-1">
                            {contract.railwaySuppliedMaterialsNote}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div>
            <Label>Work Description</Label>
            <p className="text-sm text-gray-700 mt-1">{contract.workDescription}</p>
          </div>
          {contract.isExtended && contract.extensionReason && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-md">
              <Label>Latest Extension Reason (GCC {contract.extensionType})</Label>
              <p className="text-sm text-orange-800 mt-1">{contract.extensionReason}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Bills */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Recent Bills</CardTitle>
              <CardDescription>
                Running account bills with PVC calculations
              </CardDescription>
            </div>
            <Button asChild>
              <Link href={`/bills/new?contractId=${contract.id}`}>
                <Plus className="h-4 w-4 mr-2" />
                Add Bill
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {contract.bills.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No bills yet</h3>
              <p className="text-gray-600 mb-4">
                Add your first running account bill to start PVC calculations.
              </p>
              <Button asChild>
                <Link href={`/bills/new?contractId=${contract.id}`}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Bill
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {contract.bills.slice(0, 5).map((bill) => (
                <BillCard 
                  key={bill.id} 
                  bill={{
                    ...bill,
                    contract: {
                      id: contract.id,
                      agreementNo: contract.agreementNo,
                      contractorName: contract.contractorName,
                      workDescription: contract.workDescription,
                      isExtended: contract.isExtended,
                      extensionType: contract.extensionType
                    }
                  }} 
                  variant="compact"
                  showContract={false}
                />
              ))}
              
              {contract.bills.length > 5 && (
                <div className="text-center">
                  <Button asChild variant="outline">
                    <Link href={`/bills?contractId=${contract.id}`}>
                      View All Bills ({contract.bills.length})
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
