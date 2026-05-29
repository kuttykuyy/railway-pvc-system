'use client';

import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MapPin, Building2, Loader2 } from 'lucide-react';
import { RAILWAY_ZONES, ZONE_DIVISIONS } from '@/lib/railway-division-helper';
import { toast } from 'react-hot-toast';

interface RailwayPostingFormProps {
  userData: any;
  onUpdate?: () => void;
}

export function RailwayPostingForm({ userData, onUpdate }: RailwayPostingFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    designation: userData?.designation || '',
    department: userData?.department || '',
    railwayZone: userData?.railwayZone || '',
    division: userData?.division || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    console.log('Form submission started');
    console.log('Form data:', formData);

    try {
      const payload = {
        ...formData,
        railwayZoneName: RAILWAY_ZONES[formData.railwayZone as keyof typeof RAILWAY_ZONES] || formData.railwayZone,
        divisionName: ZONE_DIVISIONS[formData.railwayZone]?.[formData.division] || formData.division,
      };
      
      console.log('Sending payload:', payload);

      const response = await fetch('/api/auth/profile/update-posting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', data);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update posting details');
      }

      toast.success('Posting details updated successfully!');
      console.log('Calling onUpdate callback');
      if (onUpdate) {
        await onUpdate();
      }
    } catch (error: any) {
      console.error('Error updating posting details:', error);
      toast.error(error.message || 'Failed to update posting details');
    } finally {
      setLoading(false);
    }
  };

  // Get available divisions based on selected zone
  const availableDivisions = formData.railwayZone
    ? ZONE_DIVISIONS[formData.railwayZone] || {}
    : {};

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Railway Posting Details
        </CardTitle>
        <CardDescription>
          Division and posting information for bill approval routing
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Designation */}
          <div className="space-y-2">
            <Label htmlFor="designation">Designation *</Label>
            <Input
              id="designation"
              value={formData.designation}
              onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
              placeholder="e.g., Divisional Engineer (Civil)"
              required
            />
            <p className="text-xs text-muted-foreground">
              Enter your full designation as it appears in your official documents
            </p>
          </div>

          {/* Department */}
          <div className="space-y-2">
            <Label htmlFor="department">Department *</Label>
            <Select
              value={formData.department}
              onValueChange={(value) => setFormData({ ...formData, department: value })}
              required
            >
              <SelectTrigger id="department">
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Civil">Civil Engineering</SelectItem>
                <SelectItem value="Electrical">Electrical Engineering</SelectItem>
                <SelectItem value="Mechanical">Mechanical Engineering</SelectItem>
                <SelectItem value="S&T">Signal & Telecommunication</SelectItem>
                <SelectItem value="Stores">Stores Department</SelectItem>
                <SelectItem value="Accounts">Accounts & Finance</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Railway Zone & Division */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="railwayZone">Railway Zone *</Label>
              <Select
                value={formData.railwayZone}
                onValueChange={(value) => {
                  setFormData({ ...formData, railwayZone: value, division: '' });
                }}
                required
              >
                <SelectTrigger id="railwayZone">
                  <SelectValue placeholder="Select zone" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RAILWAY_ZONES).map(([code, name]) => (
                    <SelectItem key={code} value={code}>
                      {code} - {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="division">Division *</Label>
              <Select
                value={formData.division}
                onValueChange={(value) => setFormData({ ...formData, division: value })}
                required
                disabled={!formData.railwayZone}
              >
                <SelectTrigger id="division">
                  <SelectValue placeholder={
                    formData.railwayZone ? "Select division" : "Select zone first"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(availableDivisions).map(([code, name]) => (
                    <SelectItem key={code} value={code}>
                      {code} - {name}
                    </SelectItem>
                  ))}
                  <SelectItem value="Other">Other (Not listed)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex items-center gap-3 pt-4">
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <MapPin className="mr-2 h-4 w-4" />
                  Update Posting Details
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
