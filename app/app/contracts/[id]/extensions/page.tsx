
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CalendarClock, Plus, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { format, differenceInDays } from 'date-fns';
import { notFound } from 'next/navigation';
import { ExtensionsList } from '@/components/extensions-list';
import { BackButton } from '@/components/ui/back-button';

export const dynamic = 'force-dynamic';

interface ExtensionsPageProps {
  params: Promise<{id: string}>;
}

export default async function ExtensionsPage({ params }: ExtensionsPageProps) {
  const { id } = await params;
  const contract = await prisma.contract.findUnique({
    where: { id: id },
    include: {
      extensions: {
        orderBy: { approvalDate: 'desc' }
      }
    }
  });

  if (!contract) {
    notFound();
  }

  // Calculate total extension duration
  const totalExtensionDays = contract.extensions.reduce(
    (sum, ext) => sum + ext.extensionDuration,
    0
  );

  // Check if contract is currently in extension period
  const now = new Date();
  const isInExtensionPeriod = contract.currentCompletionDate 
    ? now <= new Date(contract.currentCompletionDate) && contract.isExtended
    : false;

  // Count 17A and 17B extensions
  const type17ACount = contract.extensions.filter((e: any) => e.extensionType === '17A').length;
  const type17BCount = contract.extensions.filter((e: any) => e.extensionType === '17B').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <BackButton href={`/contracts/${contract.id}`} label="Back to Contract" variant="outline" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <CalendarClock className="h-8 w-8 text-blue-600" />
              Contract Extensions
            </h1>
            <p className="text-gray-600 mt-1">{contract.agreementNo}</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-md bg-gradient-to-r from-blue-50 to-blue-100">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-blue-900">Total Extensions</p>
                <p className="text-2xl font-bold text-blue-700 mt-1">
                  {contract.extensions.length}
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  {totalExtensionDays} days total
                </p>
              </div>
              <CalendarClock className="h-8 w-8 text-blue-600 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md bg-gradient-to-r from-green-50 to-green-100">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-green-900">Type 17A Extensions</p>
                <p className="text-2xl font-bold text-green-700 mt-1">{type17ACount}</p>
                <p className="text-xs text-green-600 mt-1">No PVC restrictions</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md bg-gradient-to-r from-orange-50 to-orange-100">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-orange-900">Type 17B Extensions</p>
                <p className="text-2xl font-bold text-orange-700 mt-1">{type17BCount}</p>
                <p className="text-xs text-orange-600 mt-1">PVC indices capped</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-600 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className={`border-0 shadow-md ${
          isInExtensionPeriod 
            ? 'bg-gradient-to-r from-purple-50 to-purple-100' 
            : 'bg-gradient-to-r from-gray-50 to-gray-100'
        }`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-sm font-medium ${
                  isInExtensionPeriod ? 'text-purple-900' : 'text-gray-900'
                }`}>
                  Current Status
                </p>
                <p className={`text-2xl font-bold mt-1 ${
                  isInExtensionPeriod ? 'text-purple-700' : 'text-gray-700'
                }`}>
                  {isInExtensionPeriod ? 'Extended' : 'Normal'}
                </p>
                <p className={`text-xs mt-1 ${
                  isInExtensionPeriod ? 'text-purple-600' : 'text-gray-600'
                }`}>
                  {contract.currentCompletionDate && (
                    <>Until {format(new Date(contract.currentCompletionDate), 'dd MMM yyyy')}</>
                  )}
                </p>
              </div>
              <Info className={`h-8 w-8 opacity-50 ${
                isInExtensionPeriod ? 'text-purple-600' : 'text-gray-600'
              }`} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* GCC Compliance Info */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-900">
              <p className="font-medium mb-2">GCC 2022 ACS2 - Chapter 17 Compliance</p>
              <ul className="space-y-1 text-xs">
                <li>
                  <strong>Clause 17A:</strong> Extensions granted for delays beyond contractor's 
                  control. PVC calculations continue normally with current price indices.
                </li>
                <li>
                  <strong>Clause 17B:</strong> Extensions for delays attributable to contractor. 
                  PVC indices are capped at original completion date values. Liquidated damages may apply.
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Extensions List */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Extension History</CardTitle>
              <CardDescription>
                Complete record of all time extensions granted for this contract
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ExtensionsList 
            contractId={contract.id} 
            extensions={contract.extensions}
            originalCompletionDate={contract.originalCompletionDate}
          />
        </CardContent>
      </Card>
    </div>
  );
}
