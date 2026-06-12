

import { QuarterlyAveragesDisplay } from '@/components/quarterly-averages-display';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { BackButton } from '@/components/ui/back-button';

export const dynamic = "force-dynamic";



interface PageProps {
  params: Promise<{id: string;}>;
}

export default async function QuarterlyAveragesPage({ params }: PageProps) {
  const { id } = await params;
  // Verify the contract exists and user has access
  const contract = await prisma.contract.findUnique({
    where: { id: id }
  });

  if (!contract) {
    notFound();
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <BackButton href={`/contracts/${id}`} className="mb-4" />
        <h1 className="text-3xl font-bold tracking-tight">Quarterly Price Indices</h1>
        <p className="text-muted-foreground mt-2">
          View average price indices for each quarter based on PVC components
        </p>
      </div>

      <QuarterlyAveragesDisplay contractId={id} />
    </div>
  );
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const contract = await prisma.contract.findUnique({
    where: { id },
    select: { agreementNo: true }
  });

  return {
    title: contract ? `Quarterly Averages - ${contract.agreementNo}` : 'Quarterly Averages',
    description: 'View quarterly average price indices for railway PVC calculations'
  };
}
