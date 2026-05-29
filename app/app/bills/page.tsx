
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FileText, Plus, Calculator, Building2, Calendar, Trash2, Filter, Search, ChevronDown, ChevronUp, Edit, Clock, IndianRupee, Gift, Grid3X3, List, Download, Eye, SortAsc, SortDesc, MoreHorizontal, Layers, AlertCircle, CheckCircle, User, FileSpreadsheet, Phone, Send, Wallet, FileUp } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';
import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { TableSkeleton } from '@/components/ui/skeletons/table-skeleton';
import { CardGridSkeleton } from '@/components/ui/skeletons/card-skeleton';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { BillStatusBadge } from '@/components/bills/bill-status-badge';
import { useSession } from 'next-auth/react';
import { IndicesAvailabilityIndicator } from '@/components/indices-availability-indicator';
import { WhatsAppSendDialog } from '@/components/whatsapp-send-dialog';
import { RazorpayTopupDialog } from '@/components/ui/razorpay-topup-dialog';

interface Contract {
  id: string;
  agreementNo: string;
  contractorName: string;
  contractorPhone?: string | null;
  workDescription: string;
  isExtended: boolean;
  extensionType: string | null;
  originalCompletionDate: string | null;
  currentCompletionDate: string | null;
  coveringLetterDesignation?: string | null;
  loaDate?: Date | string | null;
}

interface ReportTemplate {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
}

interface PvcCalculation {
  id: string;
  totalPvc: number;
  cumulativePvc: number;
  labourPvc: number;
  plantMachineryPvc: number;
  fuelPowerPvc: number;
  otherMaterialsPvc: number;
  cementPvc: number;
  explosivesPvc: number;
  steelPvc: number;
  dedicatedCementPvc: number;
  dedicatedSteelPvc: number;
  isIndexCapped?: boolean;
  originalPvcAmount?: number;
  restrictedPvcAmount?: number;
}

interface BillTransaction {
  id: string;
  amount: number;
  originalAmount: number;
  discount: number;
  status: string;
  isFree: boolean;
  createdAt: string;
}

interface Bill {
  id: string;
  billNo: string;
  billAmount: number;
  dateOfMeasurement: string;
  quarter: string;
  contractId: string;
  createdAt: string;
  updatedAt: string;
  status: string; // draft, submitted, approved, rejected, revision_requested
  batchId?: string | null;
  batchName?: string | null;
  contract: Contract;
  pvcCalculation?: PvcCalculation;
  billTransaction?: BillTransaction;
  indicesStatus?: {
    isProvisional: boolean;
    provisionalCount: number;
    totalCount: number;
  };
}

interface BillGroup {
  type: 'single' | 'batch';
  batchId?: string;
  batchName?: string;
  bills: Bill[];
  totalAmount: number;
  totalPvc: number;
  isExpanded?: boolean;
}

export default function BillsPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role || 'contractor';
  
  const [bills, setBills] = useState<Bill[]>([]);
  const [filteredBills, setFilteredBills] = useState<Bill[]>([]);
  const [billGroups, setBillGroups] = useState<BillGroup[]>([]);
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selectedBills, setSelectedBills] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [recalculating, setRecalculating] = useState<string | null>(null); // Bill ID being recalculated
  const [generatingBulkReport, setGeneratingBulkReport] = useState(false);
  const [submittingForApproval, setSubmittingForApproval] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [billTypeFilter, setBillTypeFilter] = useState<'all' | 'single' | 'bulk' | 'approvals'>('all');
  const [approvalBills, setApprovalBills] = useState<Bill[]>([]);
  const [approvalCounts, setApprovalCounts] = useState({
    submitted: 0,
    approved: 0,
    rejected: 0,
    revision_requested: 0
  });
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContract, setSelectedContract] = useState<string>('all');
  const [selectedQuarter, setSelectedQuarter] = useState<string>('all');
  const [indicesTypeFilter, setIndicesTypeFilter] = useState<string>('all'); // 'all', 'provisional', 'final'
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Template selection for PDF generation
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [selectedBillForPdf, setSelectedBillForPdf] = useState<{ id: string; billNo: string } | null>(null);
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [selectedBillForWhatsApp, setSelectedBillForWhatsApp] = useState<{ id: string; billNo: string; contractorName: string; contractorPhone?: string | null } | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('default');

  // Delete permissions state
  const [deletableBillIds, setDeletableBillIds] = useState<Set<string>>(new Set());
  const [canDeleteSelected, setCanDeleteSelected] = useState(false);

  // Credit balance state - default to allowing access for free accounts
  const [creditBalance, setCreditBalance] = useState<{
    balance: number;
    canAffordNextBill: boolean;
    nextBillCost: number;
    isPaidUser: boolean;
    trialInfo: {
      isActive: boolean;
      billsRemaining: number;
    };
  } | null>({
    balance: 0,
    canAffordNextBill: true, // Default to true for free accounts
    nextBillCost: 1000,
    isPaidUser: false,
    trialInfo: {
      isActive: false,
      billsRemaining: 0,
    },
  });
  const [showTopupDialog, setShowTopupDialog] = useState(false);

  // Maintenance mode state
  const [maintenanceStatus, setMaintenanceStatus] = useState<{
    singleBillMaintenance: boolean;
    bulkBillingMaintenance: boolean;
  }>({
    singleBillMaintenance: false,
    bulkBillingMaintenance: false,
  });

  useEffect(() => {
    fetchBills();
    fetchContracts();
    fetchTemplates();
    fetchCreditBalance();
    fetchMaintenanceStatus();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [bills, searchTerm, selectedContract, selectedQuarter, indicesTypeFilter, dateFrom, dateTo, minAmount, maxAmount, sortBy, sortOrder]);

  useEffect(() => {
    if (bills.length > 0) {
      checkDeletePermissions();
    }
  }, [bills]);

  useEffect(() => {
    if (selectedBills.length > 0) {
      checkSelectedBillsDeletePermission();
    } else {
      setCanDeleteSelected(false);
    }
  }, [selectedBills]);

  const fetchBills = async () => {
    try {
      setLoading(true);
      // Fetch all bills (no pagination limit for backward compatibility)
      // To enable pagination, add: ?page=1&limit=100
      const response = await fetch('/api/bills?limit=1000');
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || 'Failed to fetch bills');
      }
      
      const data = await response.json();
      
      // Handle both paginated and non-paginated responses
      const billsData = data.data ? data.data : data;
      setBills(billsData);
    } catch (error) {
      console.error('Error fetching bills:', error);
      const message = error instanceof Error ? error.message : 'Failed to fetch bills. Please try again.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const fetchContracts = async () => {
    try {
      const response = await fetch('/api/contracts');
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || 'Failed to fetch contracts');
      }
      
      const data = await response.json();
      setContracts(data);
    } catch (error) {
      console.error('Error fetching contracts:', error);
      const message = error instanceof Error ? error.message : 'Failed to fetch contracts.';
      toast.error(message);
    }
  };

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/report-templates');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
        // Set default template if exists
        const defaultTemplate = data.find((t: ReportTemplate) => t.isDefault);
        if (defaultTemplate) {
          setSelectedTemplateId(defaultTemplate.id);
        }
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  const fetchCreditBalance = async () => {
    try {
      const response = await fetch('/api/credits/balance');
      if (response.ok) {
        const data = await response.json();
        setCreditBalance({
          balance: data.balance || 0,
          canAffordNextBill: data.canAffordNextBill,
          nextBillCost: data.nextBillCost,
          isPaidUser: data.isPaidUser,
          trialInfo: {
            isActive: data.trialInfo.isActive,
            billsRemaining: data.trialInfo.billsRemaining,
          },
        });
      } else {
        // If API fails, default to allowing free accounts
        console.warn('Credit balance API failed, defaulting to free account access');
        setCreditBalance({
          balance: 0,
          canAffordNextBill: true,
          nextBillCost: 1000,
          isPaidUser: false,
          trialInfo: {
            isActive: false,
            billsRemaining: 0,
          },
        });
      }
    } catch (error) {
      console.error('Error fetching credit balance:', error);
      // If API fails, default to allowing free accounts
      setCreditBalance({
        balance: 0,
        canAffordNextBill: true,
        nextBillCost: 1000,
        isPaidUser: false,
        trialInfo: {
          isActive: false,
          billsRemaining: 0,
        },
      });
    }
  };

  const handleTopupSuccess = () => {
    // Refresh credit balance after successful top-up
    fetchCreditBalance();
  };

  const fetchMaintenanceStatus = async () => {
    try {
      const response = await fetch('/api/settings/maintenance-status');
      if (response.ok) {
        const data = await response.json();
        setMaintenanceStatus(data.maintenanceStatus || {
          singleBillMaintenance: false,
          bulkBillingMaintenance: false,
        });
      } else {
        console.warn('Failed to fetch maintenance status, defaulting to no maintenance');
      }
    } catch (error) {
      console.error('Error fetching maintenance status:', error);
      // On error, assume no maintenance mode
      setMaintenanceStatus({
        singleBillMaintenance: false,
        bulkBillingMaintenance: false,
      });
    }
  };

  // Check delete permissions for all bills
  const checkDeletePermissions = async () => {
    try {
      const billIds = bills.map(bill => bill.id);
      
      // Check permissions for each bill individually
      const results = await Promise.all(
        billIds.map(async (billId) => {
          try {
            const response = await fetch('/api/bills/can-delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ billId })
            });
            
            if (response.ok) {
              const data = await response.json();
              return { billId, allowed: data.allowed };
            }
            return { billId, allowed: false };
          } catch {
            return { billId, allowed: false };
          }
        })
      );

      const deletableIds = new Set(
        results.filter(r => r.allowed).map(r => r.billId)
      );
      
      setDeletableBillIds(deletableIds);
    } catch (error) {
      console.error('Error checking delete permissions:', error);
      // On error, assume no bills are deletable
      setDeletableBillIds(new Set());
    }
  };

  // Check if selected bills can be deleted
  const checkSelectedBillsDeletePermission = async () => {
    if (selectedBills.length === 0) {
      setCanDeleteSelected(false);
      return;
    }

    try {
      const response = await fetch('/api/bills/can-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billIds: selectedBills })
      });

      if (response.ok) {
        const data = await response.json();
        setCanDeleteSelected(data.allowed);
      } else {
        setCanDeleteSelected(false);
      }
    } catch (error) {
      console.error('Error checking selected bills delete permission:', error);
      setCanDeleteSelected(false);
    }
  };

  // Helper function to determine if single bill creation should be enabled
  const canCreateSingleBill = () => {
    // Check maintenance mode first
    if (maintenanceStatus.singleBillMaintenance) {
      return false;
    }

    // Admin and railway_official always have access (unless in maintenance)
    if (userRole === 'admin' || userRole === 'railway_official') {
      return true;
    }
    
    // For other roles, check credit balance
    return creditBalance && (creditBalance.canAffordNextBill || creditBalance.trialInfo.isActive);
  };

  // Helper function to determine if bulk bill creation should be enabled
  const canCreateBulkBills = () => {
    // Check maintenance mode first
    if (maintenanceStatus.bulkBillingMaintenance) {
      return false;
    }

    // Admin and railway_official always have access (unless in maintenance)
    if (userRole === 'admin' || userRole === 'railway_official') {
      return true;
    }
    
    // For other roles, check credit balance
    return creditBalance && (creditBalance.canAffordNextBill || creditBalance.trialInfo.isActive);
  };

  const applyFilters = () => {
    let filtered = [...bills];

    // Search term filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(bill => 
        bill.billNo.toLowerCase().includes(search) ||
        bill.contract.agreementNo.toLowerCase().includes(search) ||
        bill.contract.contractorName.toLowerCase().includes(search)
      );
    }

    // Contract filter
    if (selectedContract !== 'all') {
      filtered = filtered.filter(bill => bill.contractId === selectedContract);
    }

    // Quarter filter
    if (selectedQuarter !== 'all') {
      filtered = filtered.filter(bill => bill.quarter === selectedQuarter);
    }

    // Indices type filter (provisional vs final)
    if (indicesTypeFilter !== 'all') {
      if (indicesTypeFilter === 'provisional') {
        filtered = filtered.filter(bill => bill.indicesStatus?.isProvisional === true);
      } else if (indicesTypeFilter === 'final') {
        filtered = filtered.filter(bill => bill.indicesStatus?.isProvisional === false);
      }
    }

    // Date range filter
    if (dateFrom) {
      filtered = filtered.filter(bill => 
        new Date(bill.dateOfMeasurement) >= new Date(dateFrom)
      );
    }
    if (dateTo) {
      filtered = filtered.filter(bill => 
        new Date(bill.dateOfMeasurement) <= new Date(dateTo)
      );
    }

    // Amount range filter
    if (minAmount) {
      filtered = filtered.filter(bill => bill.billAmount >= parseFloat(minAmount));
    }
    if (maxAmount) {
      filtered = filtered.filter(bill => bill.billAmount <= parseFloat(maxAmount));
    }

    // Sorting
    filtered.sort((a, b) => {
      let aValue, bValue;

      switch (sortBy) {
        case 'billNo':
          aValue = a.billNo;
          bValue = b.billNo;
          break;
        case 'billAmount':
          aValue = a.billAmount;
          bValue = b.billAmount;
          break;
        case 'pvcAmount':
          aValue = a.pvcCalculation?.totalPvc || 0;
          bValue = b.pvcCalculation?.totalPvc || 0;
          break;
        case 'quarter':
          aValue = a.quarter;
          bValue = b.quarter;
          break;
        case 'contractorName':
          aValue = a.contract.contractorName;
          bValue = b.contract.contractorName;
          break;
        case 'createdAt':
          aValue = new Date(a.createdAt);
          bValue = new Date(b.createdAt);
          break;
        case 'dateOfMeasurement':
        default:
          aValue = new Date(a.dateOfMeasurement);
          bValue = new Date(b.dateOfMeasurement);
          break;
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    setFilteredBills(filtered);
  };

  // Group bills by batch
  const groupBillsByBatch = (billsToGroup: Bill[]): BillGroup[] => {
    const batchMap = new Map<string, Bill[]>();
    const singleBills: Bill[] = [];

    // Separate batched bills and single bills
    billsToGroup.forEach(bill => {
      if (bill.batchId) {
        if (!batchMap.has(bill.batchId)) {
          batchMap.set(bill.batchId, []);
        }
        batchMap.get(bill.batchId)!.push(bill);
      } else {
        singleBills.push(bill);
      }
    });

    // Create groups
    const groups: BillGroup[] = [];

    // Add batched bills as groups
    batchMap.forEach((batchBills, batchId) => {
      const totalAmount = batchBills.reduce((sum, bill) => sum + bill.billAmount, 0);
      const totalPvc = batchBills.reduce((sum, bill) => sum + (bill.pvcCalculation?.totalPvc || 0), 0);
      
      groups.push({
        type: 'batch',
        batchId,
        batchName: batchBills[0]?.batchName || `Batch ${batchId}`,
        bills: batchBills,
        totalAmount,
        totalPvc
      });
    });

    // Add single bills as individual groups
    singleBills.forEach(bill => {
      groups.push({
        type: 'single',
        bills: [bill],
        totalAmount: bill.billAmount,
        totalPvc: bill.pvcCalculation?.totalPvc || 0
      });
    });

    return groups;
  };

  // Update bill groups when filtered bills change
  useEffect(() => {
    let groups = groupBillsByBatch(filteredBills);
    
    // Apply bill type filter
    if (billTypeFilter !== 'all') {
      groups = groups.filter(group => {
        if (billTypeFilter === 'single') {
          return group.type === 'single';
        } else if (billTypeFilter === 'bulk') {
          return group.type === 'batch';
        }
        return true;
      });
    }
    
    setBillGroups(groups);
  }, [filteredBills, billTypeFilter]);

  const toggleBatchExpansion = (batchId: string) => {
    setExpandedBatches(prev => {
      const newSet = new Set(prev);
      if (newSet.has(batchId)) {
        newSet.delete(batchId);
      } else {
        newSet.add(batchId);
      }
      return newSet;
    });
  };

  const handleSelectBill = (billId: string) => {
    setSelectedBills(prev => {
      // If unchecking, just remove it
      if (prev.includes(billId)) {
        return prev.filter(id => id !== billId);
      }
      
      // If checking, verify it's from the same contract
      const billToAdd = bills.find(b => b.id === billId);
      if (!billToAdd) return prev;
      
      // If there are already selected bills, check if they're from the same contract
      if (prev.length > 0) {
        const firstSelectedBill = bills.find(b => b.id === prev[0]);
        if (firstSelectedBill && firstSelectedBill.contractId !== billToAdd.contractId) {
          toast.error('Cannot select bills from different contracts. Please select bills from the same contract only.');
          return prev;
        }
      }
      
      return [...prev, billId];
    });
  };

  const handleSelectAll = () => {
    if (selectedBills.length === filteredBills.length) {
      setSelectedBills([]);
    } else {
      // If there are already selected bills, only select from the same contract
      if (selectedBills.length > 0) {
        const firstSelectedBill = bills.find(b => b.id === selectedBills[0]);
        if (firstSelectedBill) {
          const billsFromSameContract = filteredBills.filter(
            bill => bill.contractId === firstSelectedBill.contractId
          );
          setSelectedBills(billsFromSameContract.map(bill => bill.id));
          if (billsFromSameContract.length < filteredBills.length) {
            toast('Only bills from the same contract can be selected together', {
              icon: 'ℹ️',
            });
          }
          return;
        }
      }
      // Otherwise, select all filtered bills
      setSelectedBills(filteredBills.map(bill => bill.id));
    }
  };

  const deleteBill = async (billId: string) => {
    if (!confirm('Are you sure you want to delete this bill?')) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/bills/${billId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setBills(prev => prev.filter(bill => bill.id !== billId));
        setSelectedBills(prev => prev.filter(id => id !== billId));
        toast.success('Bill deleted successfully');
      } else {
        throw new Error('Failed to delete bill');
      }
    } catch (error) {
      console.error('Error deleting bill:', error);
      toast.error('Failed to delete bill');
    } finally {
      setDeleting(false);
    }
  };

  const recalculateBill = async (billId: string) => {
    setRecalculating(billId);
    try {
      const response = await fetch(`/api/bills/${billId}/recalculate`, {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        // Update the bill in the list with new calculation
        setBills(prev => prev.map(bill => 
          bill.id === billId 
            ? { ...bill, pvcCalculation: data.pvcCalculation, updatedAt: new Date().toISOString() }
            : bill
        ));
        toast.success('PVC recalculated successfully');
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || 'Failed to recalculate PVC');
      }
    } catch (error) {
      console.error('Error recalculating bill:', error);
      const message = error instanceof Error ? error.message : 'Failed to recalculate PVC';
      toast.error(message);
    } finally {
      setRecalculating(null);
    }
  };

  const bulkDeleteBills = async () => {
    if (selectedBills.length === 0) {
      toast.error('Please select bills to delete');
      return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedBills.length} bills?`)) return;

    setDeleting(true);
    try {
      const response = await fetch('/api/bills/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ billIds: selectedBills }),
      });

      if (response.ok) {
        const result = await response.json();
        setBills(prev => prev.filter(bill => !selectedBills.includes(bill.id)));
        setSelectedBills([]);
        toast.success(`${result.deletedCount} bills deleted successfully`);
      } else {
        throw new Error('Failed to delete bills');
      }
    } catch (error) {
      console.error('Error deleting bills:', error);
      toast.error('Failed to delete bills');
    } finally {
      setDeleting(false);
    }
  };

  const generateBulkReport = async () => {
    if (selectedBills.length === 0) {
      toast.error('Please select bills to generate report');
      return;
    }

    if (selectedBills.length === 1) {
      toast.error('Please select at least 2 bills for bulk report');
      return;
    }

    setGeneratingBulkReport(true);
    try {
      const response = await fetch('/api/bills/bulk-pdf-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ billIds: selectedBills }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.error || 'Failed to generate bulk report');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `Bulk_PVC_Report_${selectedBills.length}_Bills_${format(toISTDate(new Date()), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      toast.success('Bulk report generated successfully');
    } catch (error) {
      console.error('Error generating bulk report:', error);
      const message = error instanceof Error ? error.message : 'Failed to generate bulk report';
      toast.error(message);
    } finally {
      setGeneratingBulkReport(false);
    }
  };

  const generateBatchCombinedPDF = async (batchBills: Bill[], batchName: string) => {
    const billIds = batchBills.map(b => b.id);
    
    setGeneratingBulkReport(true);
    try {
      const response = await fetch('/api/bills/bulk-pdf-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ billIds }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.error || 'Failed to generate combined PDF');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      // Sanitize batch name for filename
      const sanitizedBatchName = batchName.replace(/[^a-zA-Z0-9]/g, '_');
      a.download = `${sanitizedBatchName}_Combined_Report_${format(toISTDate(new Date()), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      toast.success('Combined PDF generated successfully');
    } catch (error) {
      console.error('Error generating combined PDF:', error);
      const message = error instanceof Error ? error.message : 'Failed to generate combined PDF';
      toast.error(message);
    } finally {
      setGeneratingBulkReport(false);
    }
  };

  const bulkSubmitForApproval = async () => {
    if (selectedBills.length === 0) {
      toast.error('Please select bills to submit');
      return;
    }

    setSubmittingForApproval(true);
    try {
      const response = await fetch('/api/bills/approval/bulk-submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ billIds: selectedBills }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to submit bills for approval');
      }

      const result = await response.json();
      
      // Show appropriate message based on results
      if (result.submitted > 0) {
        if (result.failed > 0) {
          toast.success(
            `Successfully submitted ${result.submitted} bill(s). ${result.failed} bill(s) could not be submitted.`,
            { duration: 6000 }
          );
          
          // Show errors if any
          if (result.errors && result.errors.length > 0) {
            setTimeout(() => {
              toast.error(
                `Errors:\n${result.errors.join('\n')}`,
                { duration: 8000 }
              );
            }, 500);
          }
        } else {
          toast.success(`Successfully submitted ${result.submitted} bill(s) for approval!`);
        }
        
        // Refresh bills list
        await fetchBills();
        
        // Clear selection
        setSelectedBills([]);
      } else if (result.errors && result.errors.length > 0) {
        toast.error(
          `Failed to submit bills:\n${result.errors.join('\n')}`,
          { duration: 8000 }
        );
      }
    } catch (error) {
      console.error('Error submitting bills:', error);
      const message = error instanceof Error ? error.message : 'Failed to submit bills for approval';
      toast.error(message);
    } finally {
      setSubmittingForApproval(false);
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedContract('all');
    setSelectedQuarter('all');
    setIndicesTypeFilter('all');
    setDateFrom('');
    setDateTo('');
    setMinAmount('');
    setMaxAmount('');
    setSortBy('dateOfMeasurement');
    setSortOrder('desc');
  };

  const handleSortChange = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const openTemplateDialog = (billId: string, billNo: string) => {
    setSelectedBillForPdf({ id: billId, billNo });
    setShowTemplateDialog(true);
  };

  const openWhatsAppDialog = (billId: string, billNo: string, contractorName: string, contractorPhone?: string | null) => {
    setSelectedBillForWhatsApp({ id: billId, billNo, contractorName, contractorPhone });
    setShowWhatsAppDialog(true);
  };

  const downloadBillPDF = async (billId: string, billNo: string) => {
    try {
      // Build URL with template parameter if not default
      let url = `/api/bills/${billId}/pdf-report`;
      if (selectedTemplateId && selectedTemplateId !== 'default') {
        url += `?templateId=${selectedTemplateId}`;
      }
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `PVC_Report_${billNo.replace(/[^a-zA-Z0-9]/g, '_')}_${format(toISTDate(new Date()), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
      
      // Close dialog after download
      setShowTemplateDialog(false);
      toast.success('PDF downloaded successfully');
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast.error('Failed to download PDF');
    }
  };

  const handleDownloadWithTemplate = () => {
    if (selectedBillForPdf) {
      downloadBillPDF(selectedBillForPdf.id, selectedBillForPdf.billNo);
    }
  };

  const downloadBillExcel = async (billId: string, billNo: string) => {
    try {
      const response = await fetch(`/api/bills/${billId}/excel-report`);
      if (!response.ok) {
        throw new Error('Failed to generate Excel report');
      }
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `PVC_Report_${billNo.replace(/[^a-zA-Z0-9]/g, '_')}_${format(toISTDate(new Date()), 'yyyy-MM-dd')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
      
      toast.success('Excel report downloaded successfully');
    } catch (error) {
      console.error('Error downloading Excel:', error);
      toast.error('Failed to download Excel report');
    }
  };

  const downloadCoveringLetter = async (billId: string, billNo: string, contract: Contract | undefined) => {
    if (!contract) {
      toast.error('Contract information not found');
      return;
    }

    try {
      const response = await fetch(`/api/bills/${billId}/covering-letter`);
      
      if (!response.ok) {
        const error = await response.json();
        if (error.error && error.error.includes('missing')) {
          // Missing fields - show error message
          toast.error(error.error);
        } else {
          throw new Error(error.error || 'Failed to download covering letter');
        }
        return;
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `Covering_Letter_${billNo.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      toast.success('Covering letter downloaded successfully');
    } catch (error) {
      console.error('Error downloading covering letter:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to download covering letter');
    }
  };

  // Get unique quarters from bills for filter dropdown
  const uniqueQuarters = Array.from(new Set(bills.map(bill => bill.quarter))).sort();

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-4">
          <div className="h-24 bg-muted animate-pulse rounded-lg" />
          {viewMode === 'grid' ? (
            <CardGridSkeleton count={6} />
          ) : (
            <TableSkeleton columns={7} rows={5} showCheckbox />
          )}
        </div>
      </div>
    );
  }

  const totalBillAmount = filteredBills.reduce((sum, bill) => sum + bill.billAmount, 0);
  const totalPvcAmount = filteredBills.reduce((sum, bill) => 
    sum + (bill.pvcCalculation?.totalPvc || 0), 0);
  const provisionalBillsCount = filteredBills.filter(bill => bill.indicesStatus?.isProvisional).length;
  const finalBillsCount = filteredBills.filter(bill => !bill.indicesStatus?.isProvisional).length;

  return (
    <div className="space-y-3 sm:space-y-4 px-2 sm:px-0">
      {/* Header Section - Optimized for mobile */}
      <div className="flex flex-col gap-2 sm:gap-3">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="h-5 w-5 sm:h-8 sm:w-8 text-purple-600" />
            Bill Processing
          </h1>
          <p className="text-xs sm:text-base text-gray-600 mt-0.5 sm:mt-2">
            Process running account bills with automatic PVC calculations
          </p>
        </div>

        {/* View Toggle and Action Buttons - Optimized layout */}
        <div className="flex flex-col gap-2">
          {/* View Toggle - Compact on mobile */}
          <div className="flex justify-between items-center gap-2">
            <div className="flex bg-gray-100 rounded-lg p-0.5 sm:p-1">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className="h-7 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm"
              >
                <Grid3X3 className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:mr-1" />
                <span className="hidden sm:inline">Grid</span>
              </Button>
              <Button
                variant={viewMode === 'table' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('table')}
                className="h-7 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm"
              >
                <List className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:mr-1" />
                <span className="hidden sm:inline">Table</span>
              </Button>
            </div>
          </div>

          {/* Bulk Action Buttons - Shown prominently when bills are selected */}
          {selectedBills.length > 0 && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-3 bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-lg shadow-sm">
              <div className="flex items-center gap-2">
                <div className="bg-blue-600 text-white px-3 py-1.5 rounded-full text-sm font-semibold shadow-sm">
                  {selectedBills.length} Selected
                </div>
                <Button 
                  onClick={() => setSelectedBills([])} 
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-gray-600 hover:text-gray-900 hover:bg-white/50"
                >
                  Clear All
                </Button>
              </div>
              
              <div className="flex flex-wrap gap-2 sm:ml-auto">
                <Button 
                  onClick={generateBulkReport} 
                  disabled={generatingBulkReport || selectedBills.length < 2}
                  variant="outline"
                  size="sm"
                  className="border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white h-9 px-4 font-medium shadow-sm transition-all"
                >
                  {generatingBulkReport ? (
                    <>
                      <LoadingSpinner size="sm" className="mr-2" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Bulk Report Download
                    </>
                  )}
                </Button>
                <Button 
                  onClick={bulkSubmitForApproval} 
                  disabled={submittingForApproval}
                  variant="outline"
                  size="sm"
                  className="border-green-600 text-green-600 hover:bg-green-600 hover:text-white h-9 px-4 font-medium shadow-sm transition-all"
                >
                  {submittingForApproval ? (
                    <>
                      <LoadingSpinner size="sm" className="mr-2" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Submit for Approval
                    </>
                  )}
                </Button>
                <Button 
                  onClick={bulkDeleteBills} 
                  disabled={deleting || !canDeleteSelected}
                  variant="destructive"
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 h-9 px-4 font-medium shadow-sm"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Selected
                </Button>
              </div>
            </div>
          )}

          {/* Create Bill Buttons - Mobile optimized */}
          <div className="flex flex-col lg:flex-row gap-2 sm:gap-3">
            {/* Buttons Section - Side by side on mobile */}
            <div className="flex gap-2 sm:gap-3 flex-1 min-w-0">
              {/* Single Bill Button */}
              <div className="flex-1 min-w-0">
                {canCreateSingleBill() ? (
                  <Link href="/bills/new" className="block">
                    <Button 
                      size="lg"
                      className="w-full h-16 sm:h-14 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg hover:shadow-xl transition-all duration-300 group relative overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      <div className="relative flex items-center justify-center gap-1.5 sm:gap-2">
                        <div className="p-1 sm:p-1.5 bg-white/20 rounded-lg group-hover:scale-110 transition-transform duration-300">
                          <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                        </div>
                        <div className="flex flex-col items-start">
                          <span className="text-xs sm:text-sm font-semibold leading-tight">Create Single Bill</span>
                          <span className="text-[10px] sm:text-xs opacity-90 leading-tight">Individual bill entry</span>
                        </div>
                      </div>
                    </Button>
                  </Link>
                ) : (
                  <div className="relative group">
                    <Button 
                      size="lg"
                      disabled
                      className="w-full h-16 sm:h-14 bg-gradient-to-r from-gray-400 to-gray-500 text-white shadow-lg cursor-not-allowed opacity-60"
                    >
                      <div className="relative flex items-center justify-center gap-1.5 sm:gap-2">
                        <div className="p-1 sm:p-1.5 bg-white/20 rounded-lg">
                          <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                        </div>
                        <div className="flex flex-col items-start">
                          <span className="text-xs sm:text-sm font-semibold leading-tight">Create Single Bill</span>
                          <span className="text-[10px] sm:text-xs opacity-90 leading-tight">
                            {maintenanceStatus.singleBillMaintenance 
                              ? 'Under Maintenance' 
                              : 'Insufficient Credits'}
                          </span>
                        </div>
                      </div>
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Trial Info Card - Show when trial is active */}
            {creditBalance && creditBalance.trialInfo.isActive && creditBalance.trialInfo.billsRemaining > 0 && userRole !== 'admin' && userRole !== 'railway_official' && (
              <div className="lg:w-80 lg:flex-shrink-0">
                <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 sm:p-3 h-16 sm:h-14 flex items-center">
                  <div className="flex items-center gap-1.5 sm:gap-2 w-full">
                    <div className="p-1.5 bg-green-600 rounded-lg">
                      <Gift className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="flex flex-col flex-1">
                      <p className="text-green-800 font-bold text-xs leading-tight">
                        {creditBalance.trialInfo.billsRemaining} Free {creditBalance.trialInfo.billsRemaining === 1 ? 'Bill' : 'Bills'}
                      </p>
                      <p className="text-green-700 text-[10px] leading-tight">
                        Trial active
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Indices Availability Indicator - Prominent display */}
      <IndicesAvailabilityIndicator />

      {/* Bill Type Tabs - Mobile optimized */}
      <Tabs value={billTypeFilter} onValueChange={(val) => setBillTypeFilter(val as 'all' | 'single' | 'bulk')} className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-9 sm:h-11 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200">
          <TabsTrigger value="all" className="data-[state=active]:bg-white data-[state=active]:text-purple-700 font-medium text-xs sm:text-sm px-1 sm:px-3">
            All Bills
          </TabsTrigger>
          <TabsTrigger value="single" className="data-[state=active]:bg-white data-[state=active]:text-purple-700 font-medium text-xs sm:text-sm px-1 sm:px-3">
            Single Bills
          </TabsTrigger>
          <TabsTrigger value="bulk" className="data-[state=active]:bg-white data-[state=active]:text-purple-700 font-medium text-xs sm:text-sm px-1 sm:px-3">
            Bulk Bills
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filters Section - Mobile optimized */}
      <Card className="border-0 shadow-md">
        <CardHeader className="pb-2 sm:pb-3 p-3 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Filter className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-gray-600" />
              <CardTitle className="text-sm sm:text-lg">Filters</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="text-gray-600 hover:text-gray-800 h-6 sm:h-8 px-1.5 sm:px-3 text-xs"
              >
                {showFilters ? (
                  <ChevronUp className="h-3 w-3 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" />
                ) : (
                  <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" />
                )}
                <span className="text-xs sm:text-sm">{showFilters ? 'Hide' : 'Show'}</span>
              </Button>
            </div>
            {showFilters && (
              <Button onClick={clearFilters} variant="outline" size="sm" className="h-6 sm:h-8 px-2 sm:px-4 text-xs sm:text-sm">
                Clear All
              </Button>
            )}
          </div>
        </CardHeader>
        {showFilters && (
        <CardContent className="space-y-3 sm:space-y-4 p-3 sm:p-6 pt-0">
          {/* Primary Filters Row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 sm:gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by bill no, agreement no, or contractor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedContract} onValueChange={setSelectedContract}>
              <SelectTrigger>
                <SelectValue placeholder="All Contracts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Contracts</SelectItem>
                {contracts.map((contract) => (
                  <SelectItem key={contract.id} value={contract.id}>
                    {contract.agreementNo} - {contract.contractorName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
              <SelectTrigger>
                <SelectValue placeholder="All Quarters" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Quarters</SelectItem>
                {uniqueQuarters.map((quarter) => (
                  <SelectItem key={quarter} value={quarter}>
                    {quarter}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={indicesTypeFilter} onValueChange={setIndicesTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Indices Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Indices Types</SelectItem>
                <SelectItem value="provisional">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-orange-600" />
                    <span>Provisional Indices</span>
                  </div>
                </SelectItem>
                <SelectItem value="final">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Final Indices</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date Range Filter */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">From Date</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">To Date</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          {/* Amount Range & Sorting */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Min Amount (₹)</label>
              <Input
                type="number"
                placeholder="0"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Max Amount (₹)</label>
              <Input
                type="number"
                placeholder="No limit"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Sort By</label>
              <div className="flex gap-2">
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dateOfMeasurement">Date</SelectItem>
                    <SelectItem value="billNo">Bill No</SelectItem>
                    <SelectItem value="billAmount">Bill Amount</SelectItem>
                    <SelectItem value="pvcAmount">PVC Amount</SelectItem>
                    <SelectItem value="quarter">Quarter</SelectItem>
                    <SelectItem value="contractorName">Contractor</SelectItem>
                    <SelectItem value="createdAt">Created</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="px-2"
                >
                  {sortOrder === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          {/* Filter Summary */}
          <div className="text-sm text-gray-600 bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border border-blue-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <span>
                Showing <span className="font-semibold text-blue-700">{filteredBills.length}</span> of{' '}
                <span className="font-semibold">{bills.length}</span> bills
                {(searchTerm || selectedContract !== 'all' || selectedQuarter !== 'all' || indicesTypeFilter !== 'all' || dateFrom || dateTo || minAmount || maxAmount) && 
                  ' (filtered)'
                }
              </span>
              <span className="text-xs">
                Sorted by {sortBy.replace(/([A-Z])/g, ' $1').toLowerCase()} ({sortOrder})
              </span>
            </div>
          </div>
        </CardContent>
        )}
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <Card className="border-0 shadow-md bg-gradient-to-r from-purple-50 to-purple-100">
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-purple-600" />
              <div className="space-y-0.5">
                <p className="text-xl sm:text-2xl font-bold text-purple-900">{filteredBills.length}</p>
                <p className="text-xs sm:text-sm text-purple-700">Bills {bills.length !== filteredBills.length ? `(${bills.length})` : ''}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md bg-gradient-to-r from-blue-50 to-blue-100">
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <Calculator className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
              <div className="space-y-0.5">
                <p className="text-sm sm:text-lg font-bold text-blue-900">
                  ₹{(totalBillAmount / 1000).toFixed(0)}K
                </p>
                <p className="text-xs sm:text-sm text-blue-700">Bill Amount</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md bg-gradient-to-r from-green-50 to-green-100">
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <Calculator className="h-5 w-5 sm:h-6 sm:w-6 text-green-600" />
              <div className="space-y-0.5">
                <p className="text-sm sm:text-lg font-bold text-green-900">
                  ₹{(totalPvcAmount / 1000).toFixed(0)}K
                </p>
                <p className="text-xs sm:text-sm text-green-700">Total PVC</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md bg-gradient-to-r from-orange-50 to-orange-100">
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <Building2 className="h-5 w-5 sm:h-6 sm:w-6 text-orange-600" />
              <div className="space-y-0.5">
                <p className="text-xl sm:text-2xl font-bold text-orange-900">
                  {new Set(filteredBills.map(b => b.contractId)).size}
                </p>
                <p className="text-xs sm:text-sm text-orange-700">Contracts</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md bg-gradient-to-r from-amber-50 to-amber-100">
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6 text-amber-600" />
              <div className="space-y-0.5">
                <p className="text-xl sm:text-2xl font-bold text-amber-900">
                  {provisionalBillsCount}
                </p>
                <p className="text-xs sm:text-sm text-amber-700">Provisional</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md bg-gradient-to-r from-emerald-50 to-emerald-100">
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <CheckCircle className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-600" />
              <div className="space-y-0.5">
                <p className="text-xl sm:text-2xl font-bold text-emerald-900">
                  {finalBillsCount}
                </p>
                <p className="text-xs sm:text-sm text-emerald-700">Final</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bills Display */}
      {bills.length === 0 ? (
        <Card className="border-0 shadow-lg">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No bills yet</h3>
            <p className="text-gray-600 text-center mb-6">
              Start processing your first running account bill to see PVC calculations.
            </p>
            <Button asChild>
              <Link href="/bills/new">
                <Plus className="h-4 w-4 mr-2" />
                Process First Bill
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : filteredBills.length === 0 ? (
        <Card className="border-0 shadow-lg">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Filter className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No bills match filters</h3>
            <p className="text-gray-600 text-center mb-6">
              Try adjusting your filters to see more results.
            </p>
            <Button onClick={clearFilters} variant="outline">
              Clear Filters
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === 'table' ? (
        /* Table View */
        <Card className="border-0 shadow-lg">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <Checkbox
                        checked={selectedBills.length === filteredBills.length && filteredBills.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100" onClick={() => handleSortChange('billNo')}>
                      <div className="flex items-center gap-1">
                        Bill No
                        {sortBy === 'billNo' && (sortOrder === 'asc' ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100 min-w-[180px] max-w-[250px]" onClick={() => handleSortChange('contractorName')}>
                      <div className="flex items-center gap-1">
                        Contract
                        {sortBy === 'contractorName' && (sortOrder === 'asc' ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100" onClick={() => handleSortChange('quarter')}>
                      <div className="flex items-center gap-1">
                        Quarter
                        {sortBy === 'quarter' && (sortOrder === 'asc' ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100" onClick={() => handleSortChange('billAmount')}>
                      <div className="flex items-center justify-end gap-1">
                        Bill Amount
                        {sortBy === 'billAmount' && (sortOrder === 'asc' ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100" onClick={() => handleSortChange('pvcAmount')}>
                      <div className="flex items-center justify-end gap-1">
                        PVC Amount
                        {sortBy === 'pvcAmount' && (sortOrder === 'asc' ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900">Approval Status</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {billGroups.flatMap((group, groupIndex) => {
                    if (group.type === 'single') {
                      const bill = group.bills[0];
                      return [(
                    <tr key={bill.id} className={`hover:bg-gray-50 ${selectedBills.includes(bill.id) ? 'bg-purple-50' : groupIndex % 2 === 0 ? 'bg-white' : 'bg-gray-25'}`}>
                      <td className="px-4 py-3">
                        <Checkbox
                          checked={selectedBills.includes(bill.id)}
                          onCheckedChange={() => handleSelectBill(bill.id)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{bill.billNo}</div>
                        <div className="text-xs text-gray-500" suppressHydrationWarning>
                          {format(new Date(bill.dateOfMeasurement), 'dd MMM yyyy')}
                        </div>
                      </td>
                      <td className="px-4 py-3 min-w-[180px] max-w-[250px]">
                        <div className="text-sm font-medium text-gray-900 truncate" title={bill.contract?.agreementNo}>
                          {bill.contract?.agreementNo}
                        </div>
                        <div className="text-xs text-gray-600 truncate mt-0.5" title={bill.contract?.contractorName}>
                          {bill.contract?.contractorName}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">{bill.quarter}</Badge>
                          {bill.indicesStatus?.isProvisional ? (
                            <Badge className="text-xs bg-orange-100 text-orange-700 hover:bg-orange-200 border-orange-300">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Provisional
                            </Badge>
                          ) : (
                            <Badge className="text-xs bg-green-100 text-green-700 hover:bg-green-200 border-green-300">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Final
                            </Badge>
                          )}
                          {/* Extension Marker */}
                          {bill.contract?.isExtended && bill.contract?.extensionType && (
                            <Badge className={`text-xs ${
                              bill.contract.extensionType === '17B' 
                                ? 'bg-red-100 text-red-700 hover:bg-red-200 border-red-300' 
                                : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 border-yellow-300'
                            }`}>
                              {bill.contract.extensionType}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-medium text-blue-600" suppressHydrationWarning>
                          ₹{bill.billAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {bill.pvcCalculation ? (
                          <div>
                            {/* Show dual amounts for 17B extension bills */}
                            {bill.contract?.isExtended && bill.contract?.extensionType === '17B' && bill.pvcCalculation.isIndexCapped && bill.pvcCalculation.originalPvcAmount && bill.pvcCalculation.restrictedPvcAmount ? (
                              <div className="flex flex-col gap-1">
                                <div className="font-medium text-green-600" suppressHydrationWarning>
                                  <span className="text-xs text-gray-500 font-normal">Actual PVC (With 17B):</span>
                                  <span className="ml-1">₹{bill.pvcCalculation.restrictedPvcAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                                </div>
                                <div className="text-xs text-gray-500" suppressHydrationWarning>
                                  <span className="font-medium">If Without 17B:</span>
                                  <span className="ml-1 text-gray-700">₹{bill.pvcCalculation.originalPvcAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="font-medium text-green-600" suppressHydrationWarning>
                                ₹{bill.pvcCalculation.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">Not calculated</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {bill.billTransaction ? (
                          <div className="flex flex-col items-center gap-1">
                            {bill.billTransaction.isFree ? (
                              <div className="flex items-center gap-1">
                                <Gift className="h-3 w-3 text-green-600" />
                                <span className="text-xs font-medium text-green-600">FREE</span>
                              </div>
                            ) : (
                              <span className="text-xs font-medium text-purple-600">
                                ₹{bill.billTransaction.amount.toLocaleString('en-IN')}
                              </span>
                            )}
                            <Badge 
                              className={`text-xs px-1 py-0 ${
                                bill.billTransaction.status === 'paid' ? 'bg-green-100 text-green-800' :
                                bill.billTransaction.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}
                            >
                              {bill.billTransaction.status.toUpperCase()}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">Not processed</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <BillStatusBadge status={bill.status || 'draft'} size="sm" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          {/* Recalculate button - hidden as per user request */}
                          {/* {bill.contract?.isExtended && bill.contract?.extensionType === '17B' && (
                            <Button
                              onClick={() => recalculateBill(bill.id)}
                              disabled={recalculating === bill.id}
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-purple-600 hover:text-purple-700"
                              title="Recalculate PVC"
                            >
                              {recalculating === bill.id ? (
                                <LoadingSpinner />
                              ) : (
                                <Calculator className="h-3 w-3" />
                              )}
                            </Button>
                          )} */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 hover:bg-gray-100"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Open menu</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuLabel className="text-xs font-semibold text-gray-500 uppercase">
                                Actions
                              </DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              
                              {/* View Section */}
                              <DropdownMenuItem asChild>
                                <Link 
                                  href={`/bills/${bill.id}`}
                                  className="flex items-center gap-2 cursor-pointer text-purple-600 focus:text-purple-700 focus:bg-purple-50"
                                >
                                  <Eye className="h-4 w-4" />
                                  <span>View Details</span>
                                </Link>
                              </DropdownMenuItem>
                              
                              <DropdownMenuSeparator />
                              
                              {/* Export Section */}
                              <DropdownMenuItem 
                                onClick={() => openTemplateDialog(bill.id, bill.billNo)}
                                className="flex items-center gap-2 cursor-pointer text-blue-600 focus:text-blue-700 focus:bg-blue-50"
                              >
                                <Download className="h-4 w-4" />
                                <span>PDF</span>
                              </DropdownMenuItem>
                              
                              <DropdownMenuItem 
                                onClick={() => downloadBillExcel(bill.id, bill.billNo)}
                                className="flex items-center gap-2 cursor-pointer text-green-600 focus:text-green-700 focus:bg-green-50"
                              >
                                <FileSpreadsheet className="h-4 w-4" />
                                <span>Excel</span>
                              </DropdownMenuItem>
                              
                              <DropdownMenuItem 
                                onClick={() => downloadCoveringLetter(bill.id, bill.billNo, bill.contract)}
                                className="flex items-center gap-2 cursor-pointer text-indigo-600 focus:text-indigo-700 focus:bg-indigo-50"
                              >
                                <Send className="h-4 w-4" />
                                <span>Covering Letter</span>
                              </DropdownMenuItem>
                              
                              <DropdownMenuItem 
                                onClick={() => openWhatsAppDialog(bill.id, bill.billNo, bill.contract.contractorName, bill.contract.contractorPhone)}
                                className="flex items-center gap-2 cursor-pointer text-emerald-600 focus:text-emerald-700 focus:bg-emerald-50"
                              >
                                <Phone className="h-4 w-4" />
                                <span>Send via WhatsApp</span>
                              </DropdownMenuItem>
                              
                              <DropdownMenuSeparator />
                              
                              {/* Manage Section */}
                              <DropdownMenuItem asChild>
                                <Link 
                                  href={`/bills/edit/${bill.id}`}
                                  className="flex items-center gap-2 cursor-pointer focus:bg-gray-50"
                                >
                                  <Edit className="h-4 w-4" />
                                  <span>Edit</span>
                                </Link>
                              </DropdownMenuItem>
                              
                              {deletableBillIds.has(bill.id) && (
                                <DropdownMenuItem 
                                  onClick={() => deleteBill(bill.id)}
                                  disabled={deleting}
                                  className="flex items-center gap-2 cursor-pointer text-red-600 focus:text-red-700 focus:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  <span>Delete</span>
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                      )];
                    } else {
                      // Batch group - render a single row with batch info
                      const batchId = group.batchId!;
                      return [(
                    <tr key={`batch-${batchId}`} className="bg-purple-50 hover:bg-purple-100" onClick={() => toggleBatchExpansion(batchId)} style={{cursor: 'pointer'}}>
                      <td className="px-4 py-3">
                        <Checkbox
                          checked={group.bills.every(b => selectedBills.includes(b.id))}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedBills(prev => [...new Set([...prev, ...group.bills.map(b => b.id)])]);
                            } else {
                              setSelectedBills(prev => prev.filter(id => !group.bills.some(b => b.id === id)));
                            }
                          }}
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        />
                      </td>
                      <td className="px-4 py-3" colSpan={2}>
                        <div className="flex items-center gap-2">
                          {expandedBatches.has(batchId) ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                          <Layers className="h-4 w-4 text-purple-600" />
                          <div>
                            <div className="font-semibold text-purple-900">{group.batchName}</div>
                            <div className="text-xs text-purple-700">{group.bills.length} bills in this batch</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className="bg-purple-100 text-purple-700">Batch</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-medium text-blue-600" suppressHydrationWarning>
                          ₹{group.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-medium text-green-600" suppressHydrationWarning>
                          ₹{group.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center" colSpan={3}>
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7"
                            onClick={(e: React.MouseEvent) => {
                              e.stopPropagation();
                              generateBatchCombinedPDF(group.bills, group.batchName || 'Batch');
                            }}
                            disabled={generatingBulkReport}
                          >
                            <Download className="h-3 w-3 mr-1" />
                            Combined PDF
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7"
                            onClick={(e: React.MouseEvent) => {
                              e.stopPropagation();
                              toggleBatchExpansion(batchId);
                            }}
                          >
                            {expandedBatches.has(batchId) ? 'Collapse' : 'Expand'} ({group.bills.length})
                          </Button>
                        </div>
                      </td>
                    </tr>
                      )];
                    }
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Grid View */
        <div className="space-y-4">
          {/* Select All Header */}
          {filteredBills.length > 0 && (
            <Card className="border-0 shadow-sm bg-gray-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selectedBills.length === filteredBills.length && filteredBills.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Select All ({filteredBills.length} bills)
                  </span>
                  {selectedBills.length > 0 && (
                    <Badge variant="secondary">
                      {selectedBills.length} selected
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {billGroups.flatMap((group, groupIndex) => {
            if (group.type === 'single') {
              const bill = group.bills[0];
              return [(
            <Card key={bill.id} className={`border-0 shadow-lg hover:shadow-xl transition-shadow ${selectedBills.includes(bill.id) ? 'ring-2 ring-purple-500' : ''}`}>
              <CardContent className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <Checkbox
                      checked={selectedBills.includes(bill.id)}
                      onCheckedChange={() => handleSelectBill(bill.id)}
                      className="mt-1"
                    />
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {bill.billNo}
                        </h3>
                        <Badge variant="outline">{bill.quarter}</Badge>
                        {bill.indicesStatus?.isProvisional ? (
                          <Badge className="text-xs bg-orange-100 text-orange-700 hover:bg-orange-200 border-orange-300">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Provisional Indices
                          </Badge>
                        ) : (
                          <Badge className="text-xs bg-green-100 text-green-700 hover:bg-green-200 border-green-300">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Final Indices
                          </Badge>
                        )}
                        {/* Extension Marker */}
                        {bill.contract?.isExtended && bill.contract?.extensionType && (
                          <Badge className={`text-xs ${
                            bill.contract.extensionType === '17B' 
                              ? 'bg-red-100 text-red-700 hover:bg-red-200 border-red-300' 
                              : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 border-yellow-300'
                          }`}>
                            <Clock className="h-3 w-3 mr-1" />
                            GCC {bill.contract.extensionType} Extension
                          </Badge>
                        )}
                        {/* Approval Status */}
                        <BillStatusBadge status={bill.status || 'draft'} size="sm" />
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Building2 className="h-4 w-4" />
                        <span>{bill.contract?.agreementNo}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <User className="h-4 w-4" />
                        <span className="font-medium">{bill.contract?.contractorName}</span>
                      </div>
                      <div className="flex items-start gap-2 text-sm text-gray-600">
                        <FileText className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span className="line-clamp-2">{bill.contract?.workDescription}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Calendar className="h-4 w-4" />
                        <span suppressHydrationWarning>Measurement: {format(new Date(bill.dateOfMeasurement), 'dd MMM yyyy')}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Clock className="h-4 w-4" />
                        <span suppressHydrationWarning>Created: {format(toISTDate(new Date(bill.createdAt)), 'dd MMM yyyy, HH:mm')}</span>
                      </div>
                      
                      {/* Financial Summary */}
                      <div className="pt-3 mt-3 border-t border-gray-200 space-y-2">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                          <div>
                            <p className="text-xs text-gray-500 mb-0.5">Bill Amount</p>
                            <p className="text-sm font-bold text-blue-600" suppressHydrationWarning>
                              ₹{bill.billAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </p>
                          </div>
                          
                          {bill.pvcCalculation && (
                            <>
                              <div>
                                <p className="text-xs text-gray-500 mb-0.5">PVC Amount</p>
                                {/* Show dual amounts for 17B extension bills */}
                                {bill.contract?.isExtended && bill.contract?.extensionType === '17B' && bill.pvcCalculation.isIndexCapped && bill.pvcCalculation.originalPvcAmount && bill.pvcCalculation.restrictedPvcAmount ? (
                                  <div className="flex flex-col gap-1">
                                    <div className="text-sm font-bold text-green-600" suppressHydrationWarning>
                                      <span className="text-xs text-gray-500 font-normal">Actual PVC (With 17B):</span>
                                      <span className="ml-1">₹{bill.pvcCalculation.restrictedPvcAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="text-xs text-gray-500" suppressHydrationWarning>
                                      <span className="font-medium">If Without 17B:</span>
                                      <span className="ml-1 text-gray-700">₹{bill.pvcCalculation.originalPvcAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-sm font-bold text-green-600" suppressHydrationWarning>
                                    ₹{bill.pvcCalculation.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                  </p>
                                )}
                              </div>
                              
                              <div>
                                <p className="text-xs text-gray-500 mb-0.5">Cumulative PVC</p>
                                <p className="text-sm font-bold text-purple-600">
                                  ₹{bill.pvcCalculation.cumulativePvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                </p>
                              </div>
                            </>
                          )}
                          
                          <div>
                            <p className="text-xs text-gray-500 mb-0.5">Processing Fee</p>
                            {bill.billTransaction ? (
                              <div>
                                {bill.billTransaction.isFree ? (
                                  <div className="flex items-center gap-1">
                                    <Gift className="h-3 w-3 text-green-600" />
                                    <span className="text-sm font-bold text-green-600">FREE</span>
                                  </div>
                                ) : (
                                  <p className="text-sm font-bold text-purple-600">
                                    ₹{bill.billTransaction.amount.toLocaleString('en-IN')}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-gray-500">Not processed</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="flex gap-2 flex-wrap">
                      {/* Recalculate button - hidden as per user request */}
                      {/* {bill.contract?.isExtended && bill.contract?.extensionType === '17B' && (
                        <Button
                          onClick={() => recalculateBill(bill.id)}
                          disabled={recalculating === bill.id}
                          variant="outline"
                          size="sm"
                          className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                        >
                          {recalculating === bill.id ? (
                            <>
                              <LoadingSpinner />
                              <span className="ml-1">Recalculating...</span>
                            </>
                          ) : (
                            <>
                              <Calculator className="h-3 w-3 mr-1" />
                              Recalculate PVC
                            </>
                          )}
                        </Button>
                      )} */}
                      <Button asChild variant="outline" size="sm" className="text-purple-600 hover:text-purple-700">
                        <Link href={`/bills/${bill.id}`}>
                          <Eye className="h-3 w-3 mr-1" />
                          View Details
                        </Link>
                      </Button>
                      <Button
                        onClick={() => openTemplateDialog(bill.id, bill.billNo)}
                        variant="outline"
                        size="sm"
                        className="text-blue-600 hover:text-blue-700"
                      >
                        <Download className="h-3 w-3 mr-1" />
                        PDF
                      </Button>
                      <Button
                        onClick={() => downloadBillExcel(bill.id, bill.billNo)}
                        variant="outline"
                        size="sm"
                        className="text-green-600 hover:text-green-700"
                      >
                        <FileSpreadsheet className="h-3 w-3 mr-1" />
                        Excel
                      </Button>
                      <Button
                        onClick={() => downloadCoveringLetter(bill.id, bill.billNo, bill.contract)}
                        variant="outline"
                        size="sm"
                        className="text-indigo-600 hover:text-indigo-700"
                      >
                        <Send className="h-3 w-3 mr-1" />
                        Covering Letter
                      </Button>
                      <Button
                        onClick={() => openWhatsAppDialog(bill.id, bill.billNo, bill.contract.contractorName, bill.contract.contractorPhone)}
                        variant="outline"
                        size="sm"
                        className="text-emerald-600 hover:text-emerald-700"
                      >
                        <Phone className="h-3 w-3 mr-1" />
                        WhatsApp
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/bills/edit/${bill.id}`}>
                          <Edit className="h-3 w-3 mr-1" />
                          Edit
                        </Link>
                      </Button>
                      {deletableBillIds.has(bill.id) && (
                        <Button
                          onClick={() => deleteBill(bill.id)}
                          disabled={deleting}
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Component breakdown for latest bills */}
                {bill.pvcCalculation && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                      {bill.pvcCalculation.labourPvc > 0 && (
                        <div className="text-center">
                          <span className="text-gray-600">Labour:</span>
                          <span className="ml-1 font-medium">
                            ₹{bill.pvcCalculation.labourPvc.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      )}
                      {bill.pvcCalculation.plantMachineryPvc > 0 && (
                        <div className="text-center">
                          <span className="text-gray-600">Plant:</span>
                          <span className="ml-1 font-medium">
                            ₹{bill.pvcCalculation.plantMachineryPvc.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      )}
                      {bill.pvcCalculation.fuelPowerPvc > 0 && (
                        <div className="text-center">
                          <span className="text-gray-600">Fuel:</span>
                          <span className="ml-1 font-medium">
                            ₹{bill.pvcCalculation.fuelPowerPvc.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      )}
                      {bill.pvcCalculation.otherMaterialsPvc > 0 && (
                        <div className="text-center">
                          <span className="text-gray-600">Materials:</span>
                          <span className="ml-1 font-medium">
                            ₹{bill.pvcCalculation.otherMaterialsPvc.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      )}
                      {(bill.pvcCalculation.cementPvc > 0 || bill.pvcCalculation.dedicatedCementPvc > 0) && (
                        <div className="text-center">
                          <span className="text-gray-600">Cement:</span>
                          <span className="ml-1 font-medium">
                            ₹{(bill.pvcCalculation.cementPvc + bill.pvcCalculation.dedicatedCementPvc).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      )}
                      {bill.pvcCalculation.explosivesPvc > 0 && (
                        <div className="text-center">
                          <span className="text-gray-600">Explosives:</span>
                          <span className="ml-1 font-medium">
                            ₹{bill.pvcCalculation.explosivesPvc.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      )}
                      {(bill.pvcCalculation.steelPvc > 0 || bill.pvcCalculation.dedicatedSteelPvc > 0) && (
                        <div className="text-center">
                          <span className="text-gray-600">Steel:</span>
                          <span className="ml-1 font-medium">
                            ₹{(bill.pvcCalculation.steelPvc + bill.pvcCalculation.dedicatedSteelPvc).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
              )];
            } else {
              // Batch group - render a batch card
              const batchId = group.batchId!;
              const isExpanded = expandedBatches.has(batchId);
              return [(
            <Card key={`batch-${batchId}`} className="border-0 shadow-lg hover:shadow-xl transition-shadow bg-purple-50">
              <CardContent className="p-6">
                <div className="flex flex-col gap-4">
                  <div className="flex items-start gap-4">
                    <Checkbox
                      checked={group.bills.every(b => selectedBills.includes(b.id))}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedBills(prev => [...new Set([...prev, ...group.bills.map(b => b.id)])]);
                        } else {
                          setSelectedBills(prev => prev.filter(id => !group.bills.some(b => b.id === id)));
                        }
                      }}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-3 flex-wrap mb-3">
                        <Layers className="h-5 w-5 text-purple-600" />
                        <h3 className="text-lg font-semibold text-purple-900">
                          {group.batchName}
                        </h3>
                        <Badge className="bg-purple-200 text-purple-800">{group.bills.length} Bills</Badge>
                      </div>
                      <div className="space-y-3 mb-4">
                        {/* Work Description */}
                        <div>
                          <p className="text-sm text-gray-600 mb-1">Work Description</p>
                          <p className="text-sm font-medium text-gray-900 line-clamp-2">
                            {group.bills[0]?.contract?.workDescription || 'N/A'}
                          </p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <p className="text-sm text-gray-600">Total Bill Amount</p>
                            <p className="text-lg font-semibold text-blue-600">
                              ₹{group.totalAmount.toLocaleString('en-IN')}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Total PVC</p>
                            <p className="text-lg font-semibold text-green-600">
                              ₹{group.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Contract</p>
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {group.bills[0]?.contract?.agreementNo}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 mb-3">
                        <Button 
                          variant="default" 
                          size="sm"
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            generateBatchCombinedPDF(group.bills, group.batchName || 'Batch');
                          }}
                          disabled={generatingBulkReport}
                          className="bg-purple-600 hover:bg-purple-700"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Combined PDF
                        </Button>
                        <Button 
                          variant="outline"
                          size="sm"
                          onClick={() => toggleBatchExpansion(batchId)}
                        >
                          {isExpanded ? (
                            <><ChevronUp className="h-4 w-4 mr-2" />Hide Bills</>
                          ) : (
                            <><ChevronDown className="h-4 w-4 mr-2" />Show {group.bills.length} Bills</>
                          )}
                        </Button>
                      </div>
                      {isExpanded && (
                        <div className="space-y-2 pl-4 border-l-2 border-purple-200">
                          {group.bills.map((bill) => (
                            <div key={bill.id} className="p-3 bg-white rounded-lg shadow-sm">
                              <div className="flex items-center justify-between mb-2">
                                <div>
                                  <p className="font-medium text-gray-900">{bill.billNo}</p>
                                  <p className="text-xs text-gray-500">
                                    {format(new Date(bill.dateOfMeasurement), 'dd MMM yyyy')}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-medium text-blue-600">
                                    ₹{bill.billAmount.toLocaleString('en-IN')}
                                  </p>
                                  {bill.pvcCalculation && (
                                    <p className="text-xs text-green-600">
                                      PVC: ₹{bill.pvcCalculation.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  asChild
                                  className="h-7 px-2 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                                >
                                  <Link href={`/bills/${bill.id}`}>
                                    <Eye className="h-3 w-3 mr-1" />View Details
                                  </Link>
                                </Button>
                                <Button
                                  onClick={() => openTemplateDialog(bill.id, bill.billNo)}
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                >
                                  <Download className="h-3 w-3 mr-1" />PDF
                                </Button>
                                <Button
                                  onClick={() => downloadBillExcel(bill.id, bill.billNo)}
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                >
                                  <FileSpreadsheet className="h-3 w-3 mr-1" />Excel
                                </Button>
                                <Button
                                  onClick={() => downloadCoveringLetter(bill.id, bill.billNo, bill.contract)}
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                                >
                                  <Send className="h-3 w-3 mr-1" />Letter
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  asChild
                                  className="h-7 px-2 text-xs"
                                >
                                  <Link href={`/bills/edit/${bill.id}`}>
                                    <Edit className="h-3 w-3 mr-1" />Edit
                                  </Link>
                                </Button>
                                <Button
                                  onClick={() => deleteBill(bill.id)}
                                  variant="ghost"
                                  size="sm"
                                  disabled={deleting}
                                  className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="h-3 w-3 mr-1" />Delete
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
              )];
            }
          })}
        </div>
      )}

      {/* Template Selection Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Report Template</DialogTitle>
            <DialogDescription>
              Choose a template to customize which sections and fields appear in your PDF report.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="template-select">Report Template</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger id="template-select">
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      <span>Full Report (Default)</span>
                    </div>
                  </SelectItem>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4" />
                        <span>{template.name}</span>
                        {template.isDefault && (
                          <Badge variant="secondary" className="ml-1 text-xs">Default</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {templates.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No custom templates found. <Link href="/report-templates" className="text-blue-600 hover:underline">Create one</Link>
                </p>
              )}
            </div>

            {selectedTemplateId !== 'default' && templates.find(t => t.id === selectedTemplateId)?.description && (
              <div className="rounded-md bg-muted p-3">
                <p className="text-sm text-muted-foreground">
                  {templates.find(t => t.id === selectedTemplateId)?.description}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleDownloadWithTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Send Dialog */}
      {selectedBillForWhatsApp && (
        <WhatsAppSendDialog
          open={showWhatsAppDialog}
          onOpenChange={setShowWhatsAppDialog}
          billId={selectedBillForWhatsApp.id}
          billNumber={selectedBillForWhatsApp.billNo}
          contractorName={selectedBillForWhatsApp.contractorName}
          contractorPhone={selectedBillForWhatsApp.contractorPhone}
        />
      )}

      {/* Razorpay Top-up Dialog */}
      <RazorpayTopupDialog
        open={showTopupDialog}
        onOpenChange={setShowTopupDialog}
        onSuccess={handleTopupSuccess}
      />
    </div>
  );
}
