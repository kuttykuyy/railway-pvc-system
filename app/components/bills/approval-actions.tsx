
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { 
  CheckCircle2, 
  XCircle, 
  FileEdit, 
  Send 
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface RailwayOfficial {
  id: string;
  name: string;
  designation: string;
}

interface ApprovalActionsProps {
  billId: string;
  billStatus: string;
  userRole: string;
  onActionComplete?: () => void;
}

export function ApprovalActions({ 
  billId, 
  billStatus, 
  userRole,
  onActionComplete 
}: ApprovalActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [selectOfficialOpen, setSelectOfficialOpen] = useState(false);
  const [comments, setComments] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [officials, setOfficials] = useState<RailwayOfficial[]>([]);
  const [selectedOfficialId, setSelectedOfficialId] = useState<string>('');

  // Contractor actions (users with 'user' role are contractors)
  const isContractor = userRole === 'user' || userRole === 'contractor' || userRole === 'admin';
  const canSubmit = isContractor && (billStatus === 'draft' || billStatus === 'revision_requested');

  // Railway official actions
  const isRailwayOfficial = userRole === 'RAILWAY_OFFICIAL' || userRole === 'railway_official' || userRole === 'admin';
  const canApprove = isRailwayOfficial && billStatus === 'submitted';

  const handleSubmit = async (assignedToUserId?: string) => {
    setLoading(true);
    console.log('=== Submit for Approval Started ===');
    console.log('Bill ID:', billId);
    console.log('Assigned to:', assignedToUserId);
    
    try {
      const res = await fetch('/api/bills/approval/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          billId,
          assignedToUserId 
        })
      });

      console.log('Response status:', res.status);
      const data = await res.json();
      console.log('Response data:', data);

      if (res.ok) {
        toast.success('Bill submitted for approval successfully!');
        setSelectOfficialOpen(false);
        setSelectedOfficialId('');
        setOfficials([]);
        onActionComplete?.();
        router.refresh();
      } else {
        // Handle case where multiple officials found
        if (data.requiresSelection && data.officials) {
          console.log('Multiple officials found:', data.officials);
          setOfficials(data.officials);
          setSelectOfficialOpen(true);
          toast.info('Multiple railway officials found. Please select one to assign the bill.');
        } else {
          console.error('Submit failed:', data.error);
          toast.error(data.error || 'Failed to submit bill');
        }
      }
    } catch (error) {
      console.error('Submit error:', error);
      toast.error('An error occurred while submitting the bill');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitWithSelectedOfficial = async () => {
    if (!selectedOfficialId) {
      toast.error('Please select a railway official');
      return;
    }
    await handleSubmit(selectedOfficialId);
  };

  const handleApprove = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bills/approval/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billId, comments })
      });

      const data = await res.json();

      if (res.ok) {
        toast.success('Bill approved successfully!');
        setApproveOpen(false);
        setComments('');
        onActionComplete?.();
        router.refresh();
      } else {
        toast.error(data.error || 'Failed to approve bill');
      }
    } catch (error) {
      toast.error('An error occurred while approving the bill');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/bills/approval/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          billId, 
          reason: rejectionReason,
          comments 
        })
      });

      const data = await res.json();

      if (res.ok) {
        toast.success('Bill rejected successfully');
        setRejectOpen(false);
        setRejectionReason('');
        setComments('');
        onActionComplete?.();
        router.refresh();
      } else {
        toast.error(data.error || 'Failed to reject bill');
      }
    } catch (error) {
      toast.error('An error occurred while rejecting the bill');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestRevision = async () => {
    if (!comments.trim()) {
      toast.error('Please provide revision comments');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/bills/approval/request-revision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billId, comments })
      });

      const data = await res.json();

      if (res.ok) {
        toast.success('Revision requested successfully');
        setRevisionOpen(false);
        setComments('');
        onActionComplete?.();
        router.refresh();
      } else {
        toast.error(data.error || 'Failed to request revision');
      }
    } catch (error) {
      toast.error('An error occurred while requesting revision');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-3">
      {/* Submit for Approval - Contractors only */}
      {canSubmit && (
        <Button
          onClick={() => handleSubmit()}
          disabled={loading}
          className="gap-2"
        >
          <Send size={16} />
          Submit for Approval
        </Button>
      )}

      {/* Approve - Railway Officials only */}
      {canApprove && (
        <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
          <DialogTrigger asChild>
            <Button variant="default" className="gap-2 bg-green-600 hover:bg-green-700">
              <CheckCircle2 size={16} />
              Approve
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Approve Bill</DialogTitle>
              <DialogDescription>
                Are you sure you want to approve this bill? You can add optional comments below.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="approve-comments">Comments (Optional)</Label>
                <Textarea
                  id="approve-comments"
                  placeholder="Add any comments about the approval..."
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApproveOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleApprove} 
                disabled={loading}
                className="bg-green-600 hover:bg-green-700"
              >
                {loading ? 'Approving...' : 'Confirm Approval'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Reject - Railway Officials only */}
      {canApprove && (
        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive" className="gap-2">
              <XCircle size={16} />
              Reject
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Bill</DialogTitle>
              <DialogDescription>
                Please provide a reason for rejecting this bill.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="rejection-reason">Rejection Reason *</Label>
                <Textarea
                  id="rejection-reason"
                  placeholder="Enter the reason for rejection..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={3}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reject-comments">Additional Comments</Label>
                <Textarea
                  id="reject-comments"
                  placeholder="Add any additional comments..."
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectOpen(false)}>
                Cancel
              </Button>
              <Button 
                variant="destructive"
                onClick={handleReject} 
                disabled={loading}
              >
                {loading ? 'Rejecting...' : 'Confirm Rejection'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Request Revision - Railway Officials only */}
      {canApprove && (
        <Dialog open={revisionOpen} onOpenChange={setRevisionOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2">
              <FileEdit size={16} />
              Request Revision
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Revision</DialogTitle>
              <DialogDescription>
                Provide details about what needs to be revised in the bill.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="revision-comments">Revision Requirements *</Label>
                <Textarea
                  id="revision-comments"
                  placeholder="Describe what needs to be revised..."
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  rows={5}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRevisionOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleRequestRevision} 
                disabled={loading}
              >
                {loading ? 'Requesting...' : 'Request Revision'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Select Railway Official Dialog */}
      <Dialog open={selectOfficialOpen} onOpenChange={setSelectOfficialOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Railway Official</DialogTitle>
            <DialogDescription>
              Multiple railway officials found for this contract. Please select one to assign the bill for approval.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="official-select">Railway Official *</Label>
              <Select
                value={selectedOfficialId}
                onValueChange={setSelectedOfficialId}
              >
                <SelectTrigger id="official-select">
                  <SelectValue placeholder="Select an official" />
                </SelectTrigger>
                <SelectContent>
                  {officials.map((official) => (
                    <SelectItem key={official.id} value={official.id}>
                      {official.name} ({official.designation})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-muted-foreground">
              <p>Officials found: {officials.length}</p>
              <p className="mt-1">The selected official will be assigned to review and approve this bill.</p>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setSelectOfficialOpen(false);
                setSelectedOfficialId('');
                setOfficials([]);
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSubmitWithSelectedOfficial} 
              disabled={loading || !selectedOfficialId}
            >
              {loading ? 'Submitting...' : 'Submit Bill'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
