import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2 } from 'lucide-react';
import { BackButton } from '@/components/ui/back-button';
import ContractForm from '@/components/contract-form';

export default function NewContractPage() {
  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center gap-4">
        <BackButton href="/contracts" label="Back to Contracts" variant="outline" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Building2 className="h-8 w-8 text-blue-600" />
            Add New Contract
          </h1>
          <p className="text-gray-600 mt-2">
            Create a new railway contract with automatic base month calculation
          </p>
        </div>
      </div>

      {/* Simple guidance for new users */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
        <p className="text-amber-800">
          <strong>💡 Tip:</strong> You only need 3 things to get started — <strong>Agreement Number</strong>, <strong>Contractor Name</strong>, and <strong>Date of Opening</strong> (from your LOA). Everything else is optional and can be added later.
        </p>
      </div>

      <Card className="border-0 shadow-lg w-full">
        <CardHeader>
          <CardTitle>Contract Details</CardTitle>
          <CardDescription>
            Enter the contract information. The base month will be automatically calculated as one month prior to the opening date.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ContractForm />
        </CardContent>
      </Card>
    </div>
  );
}
