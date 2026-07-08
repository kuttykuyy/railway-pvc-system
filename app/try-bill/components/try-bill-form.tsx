'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getRailwayZoneOptions } from '@/lib/zone-steel-city-mapping';
import type { GuestBillDraft } from '@/try-bill/types';

interface ClassificationOption {
  id: string;
  code: string;
  name: string;
}

interface TryBillFormProps {
  initialDraft: Partial<GuestBillDraft>;
  onSubmit: (draft: GuestBillDraft) => void;
  isLoading: boolean;
}

export function TryBillForm({ initialDraft, onSubmit, isLoading }: TryBillFormProps) {
  const zoneOptions = getRailwayZoneOptions();
  const [classifications, setClassifications] = useState<ClassificationOption[]>([]);
  const [formData, setFormData] = useState<GuestBillDraft>({
    agreementNo: initialDraft.agreementNo || '',
    contractorName: initialDraft.contractorName || '',
    dateOfOpening: initialDraft.dateOfOpening || '',
    dateOfMeasurement: initialDraft.dateOfMeasurement || '',
    grossBillAmount: initialDraft.grossBillAmount || 0,
    workClassificationCode: initialDraft.workClassificationCode || '',
    zone: initialDraft.zone || zoneOptions[0]?.value || 'SR',
    fuelPriceType: initialDraft.fuelPriceType || 'four_city_avg',
  });

  useEffect(() => {
    fetch('/api/classifications/active')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const options = Array.isArray(data)
          ? data.map((c: any) => ({ id: c.id, code: c.code, name: c.name }))
          : [];
        setClassifications(options);
      })
      .catch(() => setClassifications([]));
  }, []);

  const updateField = <K extends keyof GuestBillDraft>(field: K, value: GuestBillDraft[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enter bill details</CardTitle>
        <CardDescription>
          Try IR-PVC with a single bill. No signup required for the preview.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="agreementNo">Agreement Number</Label>
              <Input
                id="agreementNo"
                value={formData.agreementNo}
                onChange={(e) => updateField('agreementNo', e.target.value)}
                placeholder="SR/MAS/Civil/2024/001"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contractorName">Contractor Name</Label>
              <Input
                id="contractorName"
                value={formData.contractorName}
                onChange={(e) => updateField('contractorName', e.target.value)}
                placeholder="M/s Example Contractors"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateOfOpening">Date of Opening</Label>
              <Input
                id="dateOfOpening"
                type="date"
                value={formData.dateOfOpening}
                onChange={(e) => updateField('dateOfOpening', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateOfMeasurement">Date of Measurement</Label>
              <Input
                id="dateOfMeasurement"
                type="date"
                value={formData.dateOfMeasurement}
                onChange={(e) => updateField('dateOfMeasurement', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="grossBillAmount">Gross Bill Amount (₹)</Label>
              <Input
                id="grossBillAmount"
                type="number"
                min={1}
                step="0.01"
                value={formData.grossBillAmount || ''}
                onChange={(e) => updateField('grossBillAmount', Number(e.target.value))}
                placeholder="100000"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zone">Railway Zone</Label>
              <Select value={formData.zone} onValueChange={(v) => updateField('zone', v)}>
                <SelectTrigger id="zone">
                  <SelectValue placeholder="Select zone" />
                </SelectTrigger>
                <SelectContent>
                  {zoneOptions.map((z) => (
                    <SelectItem key={z.value} value={z.value}>
                      {z.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="workClassificationCode">Work Classification</Label>
              <Select
                value={formData.workClassificationCode}
                onValueChange={(v) => updateField('workClassificationCode', v)}
              >
                <SelectTrigger id="workClassificationCode">
                  <SelectValue placeholder="Select classification (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {classifications.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} - {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fuelPriceType">Fuel Price Type</Label>
              <Select
                value={formData.fuelPriceType}
                onValueChange={(v) => updateField('fuelPriceType', v as 'four_city_avg' | 'zone_city')}
              >
                <SelectTrigger id="fuelPriceType">
                  <SelectValue placeholder="Select fuel price type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="four_city_avg">4-City Average</SelectItem>
                  <SelectItem value="zone_city">Zone City</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Calculating...' : 'Calculate PVC Preview'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
