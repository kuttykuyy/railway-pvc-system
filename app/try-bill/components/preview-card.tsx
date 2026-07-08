'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, FileDown } from 'lucide-react';
import type { GuestPreviewResult } from '@/try-bill/types';

interface PreviewCardProps {
  preview: GuestPreviewResult;
  onSignup: () => void;
}

function formatCurrency(value: number) {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function PreviewCard({ preview, onSignup }: PreviewCardProps) {
  const rows = [
    { label: 'Labour PVC', value: preview.labourPvc },
    { label: 'Plant & Machinery PVC', value: preview.plantMachineryPvc },
    { label: 'Fuel & Power PVC', value: preview.fuelPowerPvc },
    { label: 'Other Materials PVC', value: preview.otherMaterialsPvc },
    { label: 'Cement PVC', value: preview.cementPvc },
    { label: 'Steel PVC', value: preview.steelPvc },
    { label: 'Explosives PVC', value: preview.explosivesPvc },
  ];

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardHeader>
        <CardTitle>PVC Preview</CardTitle>
        <CardDescription>
          Quarter: {preview.quarter}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rows.map((row) =>
            row.value !== 0 ? (
              <div key={row.label} className="flex justify-between rounded-lg bg-white px-4 py-3 border">
                <span className="text-slate-600">{row.label}</span>
                <span className="font-semibold text-slate-900">{formatCurrency(row.value)}</span>
              </div>
            ) : null
          )}
        </div>
        <div className="flex items-center justify-between rounded-xl bg-blue-600 px-6 py-4 text-white">
          <span className="text-lg font-medium">Total PVC</span>
          <span className="text-2xl font-bold">{formatCurrency(preview.totalPvc)}</span>
        </div>
        <Button size="lg" className="w-full" onClick={onSignup}>
          <FileDown className="mr-2 h-5 w-5" />
          Sign up to save & download PDF
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
      </CardContent>
    </Card>
  );
}
