import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Sparkles } from 'lucide-react';
import { BackButton } from '@/components/ui/back-button';
import ContractForm from '@/components/contract-form';

export default function NewContractPage({
  searchParams,
}: {
  searchParams?: { welcome?: string };
}) {
  const isWelcome = searchParams?.welcome === '1';
  return (
    <div className="space-y-6 sm:space-y-8 px-4 sm:px-0">
      {/* Shown when a first-time user is routed here straight after signup. */}
      {isWelcome && (
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-emerald-50/40 p-5 flex items-start gap-3">
          <div className="rounded-xl bg-emerald-600 p-2 text-white shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-emerald-900">Welcome! Let&apos;s set up your first contract.</p>
            <p className="mt-1 text-sm text-emerald-800/80">
              The fast way: <strong>upload your LOA PDF below</strong> (Letter of Acceptance) and AI fills the form
              for you — free. Once the contract is saved, you can create PVC bills against it.
            </p>
          </div>
        </div>
      )}
      <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <BackButton 
            href="/contracts" 
            label="Back to Contracts" 
            variant="outline" 
            className="border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl" 
          />
          <div className="h-6 w-px bg-slate-200 hidden md:block" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <div className="bg-emerald-50 p-2 rounded-xl text-emerald-600">
              <Building2 className="h-6 w-6 sm:h-7 sm:w-7" />
            </div>
            Add New Contract
          </h1>
        </div>
      </div>

      {/* Simple guidance for new users */}
      <div className="bg-slate-55 border border-slate-200 rounded-2xl p-4 text-xs">
        <p className="text-slate-600 flex items-start gap-2.5">
          <span className="text-sm mt-0.5">💡</span>
          <span>
            <strong>Quick Start Guide:</strong> You only need three core values to save a contract and begin — the <strong>Agreement Number</strong>, <strong>Contractor Name</strong>, and <strong>Date of Opening</strong> (from your LOA). All financial values, material inclusions, and schedules are optional and can be updated or filled in later.
          </span>
        </p>
      </div>

      <Card className="border border-slate-200 shadow-sm rounded-2xl w-full bg-white overflow-hidden">
        <CardHeader className="border-b border-slate-100 bg-slate-50/40 px-6 py-4">
          <CardTitle className="text-base font-semibold text-slate-800">Contract Details</CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Enter key metadata. The Base Month for PVC indices is automatically set to one month prior to the tender opening month.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <ContractForm />
        </CardContent>
      </Card>
    </div>
  );
}
