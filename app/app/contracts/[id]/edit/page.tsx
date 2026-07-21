
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2 } from 'lucide-react';
import { BackButton } from '@/components/ui/back-button';
import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import ContractForm from '@/components/contract-form';
import { format } from 'date-fns';

export const dynamic = "force-dynamic";


interface EditContractPageProps {
  params: Promise<{id: string}>;
}

export default async function EditContractPage({ params }: EditContractPageProps) {
  const { id } = await params;
  const contract = await prisma.contract.findUnique({
    where: { id: id }
  });

  if (!contract) {
    notFound();
  }

  const formData = {
    agreementNo: contract.agreementNo,
    loaNo: contract.loaNo || '',
    loaDate: contract.loaDate ? format(new Date(contract.loaDate), 'yyyy-MM-dd') : '',
    contractorName: contract.contractorName,
    workDescription: contract.workDescription,
    dateOfOpening: format(new Date(contract.dateOfOpening), 'yyyy-MM-dd'),
    tenderAdvertisedValue: contract.tenderAdvertisedValue || undefined,
    contractValue: contract.contractValue || undefined,
    completionPeriodMonths: contract.completionPeriodMonths || undefined,
    hasRailwaySuppliedMaterials: contract.hasRailwaySuppliedMaterials || false,
    railwaySuppliedMaterialsNote: contract.railwaySuppliedMaterialsNote || '',
    coveringLetterDesignation: contract.coveringLetterDesignation || '',
    schedules: Array.isArray(contract.schedules) ? contract.schedules as string[] : []
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <BackButton href={`/contracts/${contract.id}`} label="Back to Contract" variant="outline" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Building2 className="h-8 w-8 text-emerald-600" />
            Edit Contract
          </h1>
          <p className="text-gray-600 mt-2">
            Update contract information for {contract.agreementNo}
          </p>
        </div>
      </div>

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Contract Details</CardTitle>
          <CardDescription>
            Update the contract information. The base month will be recalculated if you change the opening date.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ContractForm 
            initialData={formData}
            isEdit={true}
            contractId={contract.id}
          />
        </CardContent>
      </Card>
    </div>
  );
}
