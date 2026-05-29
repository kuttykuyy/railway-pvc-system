
'use client';

import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface ProvisionalToggleProps {
  initialValue: boolean;
}

export default function ProvisionalToggle({ initialValue }: ProvisionalToggleProps) {
  const [isEnabled, setIsEnabled] = useState(initialValue);
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async (checked: boolean) => {
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/settings/provisional-indices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ allowProvisional: checked }),
      });

      if (!response.ok) {
        throw new Error('Failed to update setting');
      }

      setIsEnabled(checked);
      toast({
        title: 'Setting Updated',
        description: checked 
          ? 'Provisional indices are now allowed in calculations'
          : 'Only final indices will be used in calculations',
      });
    } catch (error) {
      console.error('Error updating setting:', error);
      toast({
        title: 'Error',
        description: 'Failed to update setting. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
      <div className="flex-1">
        <Label htmlFor="provisional-toggle" className="text-base font-medium cursor-pointer">
          Allow Provisional Indices
        </Label>
        <p className="text-sm text-gray-600 mt-1">
          Enable this to allow provisional indices in PVC calculations
        </p>
      </div>
      <div className="flex items-center gap-2">
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-600" />}
        <Switch
          id="provisional-toggle"
          checked={isEnabled}
          onCheckedChange={handleToggle}
          disabled={isLoading}
        />
      </div>
    </div>
  );
}
