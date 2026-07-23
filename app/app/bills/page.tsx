
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
import { WhatsAppSendDialog } from '@/components/whatsapp-send-dialog';
import { RazorpayTopupDialog } from '@/components/ui/razorpay-topup-dialog';
import { PromoBanner } from '@/components/promo-banner';

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
  user?: { id: string; name: string; email: string } | null;
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
  usedProvisionalIndices?: boolean;
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
  const [generatingCombinedPDF, setGeneratingCombinedPDF] = useState<string | null>(null); // stores batchId being generated
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
  // Detailed format is hidden from the UI; IR Standard is the only downloadable report.
  const [pdfFormat, setPdfFormat] = useState<'detailed' | 'ir_standard'>('ir_standard');
  const [includeIndexDocs, setIncludeIndexDocs] = useState(true);
  // Bulk download: ask "with index / without index" before generating the combined PDF.
  const [showBulkIndexDialog, setShowBulkIndexDialog] = useState(false);
  const [pendingBulk, setPendingBulk] = useState<((includeDocs: boolean) => void) | null>(null);

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
        // Refresh so the provisional/final badge reflects any newly-entered final indices.
        void fetchBills();
        toast.success('PVC regenerated. If the month is now final, it will show as Final.');
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

  const generateBulkReport = () => {
    if (selectedBills.length === 0) {
      toast.error('Please select bills to generate report');
      return;
    }
    if (selectedBills.length === 1) {
      toast.error('Please select at least 2 bills for bulk report');
      return;
    }
    const ids = [...selectedBills];
    setPendingBulk(() => (includeDocs: boolean) => runBulkReport(ids, includeDocs));
    setShowBulkIndexDialog(true);
  };

  const runBulkReport = async (billIds: string[], includeDocs: boolean) => {
    setGeneratingBulkReport(true);
    try {
      const response = await fetch('/api/bills/bulk-pdf-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ billIds, format: pdfFormat, includeDocs }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.error || 'Failed to generate bulk report');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const formatSuffix = pdfFormat === 'ir_standard' ? 'IR_Standard' : 'Detailed';
      a.download = `Bulk_PVC_${formatSuffix}_${billIds.length}_Bills_${format(toISTDate(new Date()), 'yyyy-MM-dd')}.pdf`;
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

  const generateBatchCombinedPDF = (batchBills: Bill[], batchName: string, batchId: string) => {
    setPendingBulk(() => (includeDocs: boolean) => runBatchCombinedPDF(batchBills, batchName, batchId, includeDocs));
    setShowBulkIndexDialog(true);
  };

  const runBatchCombinedPDF = async (batchBills: Bill[], batchName: string, batchId: string, includeDocs: boolean) => {
    const billIds = batchBills.map(b => b.id);

    setGeneratingCombinedPDF(batchId);
    try {
      const response = await fetch('/api/bills/bulk-pdf-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billIds, format: pdfFormat, includeDocs }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.error || 'Failed to generate combined PDF');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const sanitizedBatchName = batchName.replace(/[^a-zA-Z0-9]/g, '_');
      const formatSuffix = pdfFormat === 'ir_standard' ? 'IR_Standard' : 'Detailed';
      a.download = `${sanitizedBatchName}_${formatSuffix}_${format(toISTDate(new Date()), 'yyyy-MM-dd')}.pdf`;
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
      setGeneratingCombinedPDF(null);
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
      const params = new URLSearchParams();
      if (selectedTemplateId && selectedTemplateId !== 'default') params.set('templateId', selectedTemplateId);
      if (pdfFormat === 'ir_standard') params.set('format', 'ir_standard');
      if (!includeIndexDocs) params.set('includeDocs', '0');
      if (params.toString()) url += `?${params.toString()}`;
      
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
      <div className="space-y-6 px-4 sm:px-0 animate-pulse">
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white border border-slate-100 p-6 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-100" />
            <div className="space-y-2">
              <div className="h-7 w-40 bg-slate-200 rounded-lg" />
              <div className="h-4 w-64 bg-slate-100 rounded-md" />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="h-11 w-28 bg-slate-100 rounded-xl" />
            <div className="h-11 w-28 bg-emerald-100 rounded-xl" />
          </div>
        </div>

        {/* Filters skeleton */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5">
          <div className="flex flex-wrap gap-3">
            <div className="h-10 w-64 bg-slate-100 rounded-xl" />
            <div className="h-10 w-36 bg-slate-100 rounded-xl" />
            <div className="h-10 w-36 bg-slate-100 rounded-xl" />
            <div className="h-10 w-28 bg-slate-100 rounded-xl ml-auto" />
          </div>
        </div>

        {/* Table skeleton */}
        <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
          {/* Table header */}
          <div className="flex items-center gap-4 px-5 py-3 border-b border-slate-100 bg-slate-50/60">
            <div className="w-4 h-4 bg-slate-200 rounded" />
            {[100, 140, 80, 90, 90, 80, 70].map((w, i) => (
              <div key={i} className="h-3 rounded-md bg-slate-200" style={{ width: w }} />
            ))}
          </div>
          {/* Table rows */}
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 px-5 py-4 border-b border-slate-50"
              style={{ opacity: 1 - i * 0.12 }}
            >
              <div className="w-4 h-4 bg-slate-100 rounded" />
              <div className="h-4 w-24 bg-slate-100 rounded-md" />
              <div className="h-4 w-36 bg-slate-100 rounded-md" />
              <div className="h-5 w-16 bg-emerald-100 rounded-full" />
              <div className="h-4 w-20 bg-slate-100 rounded-md" />
              <div className="h-4 w-20 bg-slate-100 rounded-md" />
              <div className="h-5 w-14 bg-emerald-100 rounded-full" />
              <div className="h-8 w-8 bg-slate-100 rounded-lg ml-auto" />
            </div>
          ))}
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
    <div className="space-y-6 sm:space-y-8 px-4 sm:px-0">
      <PromoBanner />
      {/* Premium, Clean Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white border border-slate-100 p-6 rounded-2xl shadow-sm">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <div className="bg-emerald-50 p-2 rounded-xl text-emerald-600">
              <FileText className="h-7 w-7" />
            </div>
            Bill Processing
          </h1>
          <p className="text-sm sm:text-base text-slate-500 max-w-2xl">
            Process running account bills with automatic PVC calculations.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {creditBalance && creditBalance.trialInfo.isActive && creditBalance.trialInfo.billsRemaining > 0 && userRole !== 'admin' && userRole !== 'railway_official' && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-1.5 flex items-center gap-2">
              <Gift className="h-4 w-4 text-green-600" />
              <div className="text-left">
                <p className="text-green-800 font-bold text-xs leading-none">
                  {creditBalance.trialInfo.billsRemaining} Free {creditBalance.trialInfo.billsRemaining === 1 ? 'Bill' : 'Bills'}
                </p>
              </div>
            </div>
          )}
          {canCreateBulkBills() ? (
            <Button asChild variant="outline" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 font-semibold rounded-xl w-full sm:w-auto" size="lg">
              <Link href="/bills/bulk-new">
                <Plus className="h-5 w-5 mr-2" />
                Bulk Bills
              </Link>
            </Button>
          ) : (
            <Button disabled variant="outline" className="border-gray-300 text-gray-400 font-semibold rounded-xl w-full sm:w-auto cursor-not-allowed opacity-60" size="lg">
              <Plus className="h-5 w-5 mr-2" />
              Bulk Bills
            </Button>
          )}
          {canCreateSingleBill() ? (
            <Button asChild className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md shadow-emerald-500/10 rounded-xl w-full sm:w-auto" size="lg">
              <Link href="/bills/new">
                <Plus className="h-5 w-5 mr-2" />
                New Bill
              </Link>
            </Button>
          ) : (
            <Button disabled className="bg-gray-400 text-white font-semibold rounded-xl w-full sm:w-auto cursor-not-allowed opacity-60" size="lg">
              <Plus className="h-5 w-5 mr-2" />
              New Bill ({maintenanceStatus.singleBillMaintenance ? 'Maintenance' : 'No Credits'})
            </Button>
          )}
        </div>
      </div>

      {/* Search & Filters Panel - Clean Layout */}
      <Card className="border border-slate-100 shadow-sm bg-white rounded-2xl">
        <CardHeader className="p-5 sm:p-6 pb-2">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <Filter className="h-5 w-5 text-slate-500" />
                Search & Filters
              </CardTitle>
              <CardDescription className="text-sm text-slate-500">
                Locate bills, filter by contracts or quarters, and switch view modes.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="text-slate-600 hover:text-slate-800 h-9 px-3 rounded-xl border border-slate-200"
              >
                {showFilters ? (
                  <ChevronUp className="h-4 w-4 mr-1.5 text-slate-500" />
                ) : (
                  <ChevronDown className="h-4 w-4 mr-1.5 text-slate-500" />
                )}
                <span>{showFilters ? 'Collapse Filters' : 'Expand Filters'}</span>
              </Button>
              {showFilters && (searchTerm || selectedContract !== 'all' || selectedQuarter !== 'all' || indicesTypeFilter !== 'all' || dateFrom || dateTo || minAmount || maxAmount) && (
                <Button onClick={clearFilters} variant="outline" size="sm" className="rounded-xl h-9">
                  Clear All
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        {showFilters && (
        <CardContent className="p-5 sm:p-6 pt-2 space-y-4">
          {/* Primary and Advanced Filters Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div className="space-y-1.5 col-span-1 sm:col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">Search Bills</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Bill no, agreement no, or contractor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-11 border-slate-200 rounded-xl"
                />
              </div>
            </div>

            {/* Contract Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">Contract</label>
              <Select value={selectedContract} onValueChange={setSelectedContract}>
                <SelectTrigger className="h-11 border-slate-200 rounded-xl">
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
            </div>

            {/* Quarter Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">Quarter</label>
              <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
                <SelectTrigger className="h-11 border-slate-200 rounded-xl">
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
            </div>

            {/* Indices Type Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">Indices Type</label>
              <Select value={indicesTypeFilter} onValueChange={setIndicesTypeFilter}>
                <SelectTrigger className="h-11 border-slate-200 rounded-xl">
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

            {/* Date From */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">From Date</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-11 border-slate-200 rounded-xl"
              />
            </div>

            {/* Date To */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">To Date</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-11 border-slate-200 rounded-xl"
              />
            </div>

            {/* Min Amount */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">Min Amount (₹)</label>
              <Input
                type="number"
                placeholder="Min"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                className="h-11 border-slate-200 rounded-xl"
              />
            </div>

            {/* Max Amount */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">Max Amount (₹)</label>
              <Input
                type="number"
                placeholder="Max"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                className="h-11 border-slate-200 rounded-xl"
              />
            </div>

            {/* Sort By */}
            <div className="space-y-1.5 col-span-1 sm:col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">Sort By</label>
              <div className="flex gap-2">
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="h-11 border-slate-200 rounded-xl flex-1">
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
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="h-11 px-3 border-slate-200 rounded-xl"
                >
                  {sortOrder === 'asc' ? <SortAsc className="h-4 w-4 text-slate-600" /> : <SortDesc className="h-4 w-4 text-slate-600" />}
                </Button>
              </div>
            </div>

            {/* View Mode */}
            <div className="space-y-1.5 col-span-1 sm:col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">View Mode</label>
              <div className="flex gap-2 h-11 bg-slate-50 p-1 rounded-xl border border-slate-150">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`flex-grow flex items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'grid' ? 'bg-white text-emerald-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <Grid3X3 className="h-3.5 w-3.5" />
                  Grid
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`flex-grow flex items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'table' ? 'bg-white text-emerald-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <List className="h-3.5 w-3.5" />
                  Table
                </button>
              </div>
            </div>
          </div>

          {/* Filter Summary Banner - Clean slate style */}
          <div className="text-xs font-medium text-slate-500 bg-slate-50 border border-slate-150 p-4 rounded-xl">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <span>
                Showing <span className="font-bold text-slate-900">{filteredBills.length}</span> of{' '}
                <span className="font-bold text-slate-900">{bills.length}</span> bills
                {(searchTerm || selectedContract !== 'all' || selectedQuarter !== 'all' || indicesTypeFilter !== 'all' || dateFrom || dateTo || minAmount || maxAmount) && 
                  ' (filtered)'
                }
              </span>
              <span>
                Sorted by {sortBy.replace(/([A-Z])/g, ' $1').toLowerCase()} ({sortOrder})
              </span>
            </div>
          </div>
        </CardContent>
        )}
      </Card>

      {/* Single vs Bulk bill tabs — always visible */}
      <Tabs value={billTypeFilter === 'approvals' ? 'all' : billTypeFilter} onValueChange={(val) => setBillTypeFilter(val as 'all' | 'single' | 'bulk')} className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-12 bg-slate-100/80 border border-slate-200/50 p-1 rounded-xl">
          <TabsTrigger value="all" className="data-[state=active]:bg-white data-[state=active]:text-emerald-600 data-[state=active]:shadow-sm font-semibold text-sm text-slate-500 hover:text-slate-800 rounded-lg">
            All Bills
          </TabsTrigger>
          <TabsTrigger value="single" className="data-[state=active]:bg-white data-[state=active]:text-emerald-600 data-[state=active]:shadow-sm font-semibold text-sm text-slate-500 hover:text-slate-800 rounded-lg gap-2">
            <FileText className="h-4 w-4" /> Single Bills
          </TabsTrigger>
          <TabsTrigger value="bulk" className="data-[state=active]:bg-white data-[state=active]:text-emerald-600 data-[state=active]:shadow-sm font-semibold text-sm text-slate-500 hover:text-slate-800 rounded-lg gap-2">
            <Layers className="h-4 w-4" /> Bulk Bills
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Summary Stats - High Contrast, Clean White Theme */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Total Bills */}
        <Card className="border border-slate-100 shadow-sm bg-white hover:shadow-md transition-all duration-200 rounded-2xl overflow-hidden">
          <CardContent className="p-4 sm:p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Bills</p>
              <p className="text-xl sm:text-2xl font-bold text-slate-900">{filteredBills.length}</p>
            </div>
            <div className="bg-emerald-50 p-2.5 sm:p-3 rounded-2xl text-emerald-600 flex-shrink-0">
              <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
          </CardContent>
        </Card>

        {/* Bill Amount */}
        <Card className="border border-slate-100 shadow-sm bg-white hover:shadow-md transition-all duration-200 rounded-2xl overflow-hidden">
          <CardContent className="p-4 sm:p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Bill Amount</p>
              <p className="text-xl sm:text-2xl font-bold text-emerald-600">₹{(totalBillAmount / 1000).toFixed(0)}K</p>
            </div>
            <div className="bg-emerald-50 p-2.5 sm:p-3 rounded-2xl text-emerald-600 flex-shrink-0">
              <Calculator className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
          </CardContent>
        </Card>

        {/* Total PVC */}
        <Card className="border border-slate-100 shadow-sm bg-white hover:shadow-md transition-all duration-200 rounded-2xl overflow-hidden">
          <CardContent className="p-4 sm:p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Total PVC</p>
              <p className="text-xl sm:text-2xl font-bold text-green-600">₹{(totalPvcAmount / 1000).toFixed(0)}K</p>
            </div>
            <div className="bg-green-50 p-2.5 sm:p-3 rounded-2xl text-green-600 flex-shrink-0">
              <Calculator className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
          </CardContent>
        </Card>

        {/* Contracts */}
        <Card className="border border-slate-100 shadow-sm bg-white hover:shadow-md transition-all duration-200 rounded-2xl overflow-hidden">
          <CardContent className="p-4 sm:p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Contracts</p>
              <p className="text-xl sm:text-2xl font-bold text-slate-900">{new Set(filteredBills.map(b => b.contractId)).size}</p>
            </div>
            <div className="bg-orange-50 p-2.5 sm:p-3 rounded-2xl text-orange-600 flex-shrink-0">
              <Building2 className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
          </CardContent>
        </Card>

        {/* Provisional */}
        <Card className="border border-slate-100 shadow-sm bg-white hover:shadow-md transition-all duration-200 rounded-2xl overflow-hidden">
          <CardContent className="p-4 sm:p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Provisional</p>
              <p className="text-xl sm:text-2xl font-bold text-amber-600">{provisionalBillsCount}</p>
            </div>
            <div className="bg-amber-50 p-2.5 sm:p-3 rounded-2xl text-amber-600 flex-shrink-0">
              <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
          </CardContent>
        </Card>

        {/* Final */}
        <Card className="border border-slate-100 shadow-sm bg-white hover:shadow-md transition-all duration-200 rounded-2xl overflow-hidden">
          <CardContent className="p-4 sm:p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Final</p>
              <p className="text-xl sm:text-2xl font-bold text-emerald-600">{finalBillsCount}</p>
            </div>
            <div className="bg-emerald-50 p-2.5 sm:p-3 rounded-2xl text-emerald-600 flex-shrink-0">
              <CheckCircle className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bulk Action Buttons - Floating bar, stays visible while scrolling when bills are selected */}
      {selectedBills.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] max-w-4xl border border-slate-200 bg-white/95 backdrop-blur p-3 sm:p-4 rounded-2xl shadow-xl ring-1 ring-black/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 text-white px-3 py-1 rounded-full text-xs font-semibold shadow-sm">
              {selectedBills.length} Selected
            </div>
            <Button 
              onClick={() => setSelectedBills([])} 
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-slate-500 hover:text-slate-900"
            >
              Clear All
            </Button>
          </div>
          
          <div className="flex flex-wrap gap-2 items-center">
            <Button
              onClick={generateBulkReport}
              disabled={generatingBulkReport || selectedBills.length < 2}
              variant="outline"
              size="sm"
              className="border-slate-200 hover:bg-slate-100 text-slate-700 h-10 rounded-xl px-4 font-medium transition-all shadow-sm"
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
              className="border-green-200 text-green-700 bg-green-50/50 hover:bg-green-600 hover:text-white h-10 rounded-xl px-4 font-medium transition-all shadow-sm"
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
              className="bg-red-600 hover:bg-red-700 h-10 rounded-xl px-4 font-medium transition-all shadow-sm"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected
            </Button>
          </div>
        </div>
      )}

      {/* Bills Display */}
      {bills.length === 0 ? (
        <Card className="border border-slate-100 shadow-sm bg-white rounded-2xl overflow-hidden">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-16 w-16 text-slate-300 mb-6" />
            <h3 className="text-xl font-bold text-slate-900 mb-2">No bills yet</h3>
            <p className="text-slate-500 text-center mb-8 max-w-sm mx-auto">
              Start processing your first running account bill to see PVC calculations.
            </p>
            <Button asChild size="lg" className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl">
              <Link href="/bills/new">
                <Plus className="h-5 w-5 mr-2" />
                Process First Bill
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : filteredBills.length === 0 ? (
        <Card className="border border-slate-100 shadow-sm bg-white rounded-2xl overflow-hidden">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Filter className="h-16 w-16 text-slate-300 mb-6" />
            <h3 className="text-xl font-bold text-slate-900 mb-2">No bills match filters</h3>
            <p className="text-slate-500 text-center mb-8 max-w-sm mx-auto">
              Try adjusting your filters to see more results.
            </p>
            <Button onClick={clearFilters} variant="outline" size="lg" className="rounded-xl border-slate-200">
              Clear Filters
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === 'table' ? (
        /* Table View */
        <Card className="border border-slate-100 shadow-sm bg-white rounded-2xl overflow-hidden">
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
                    <tr key={bill.id} className={`hover:bg-gray-50 ${selectedBills.includes(bill.id) ? 'bg-emerald-50' : groupIndex % 2 === 0 ? 'bg-white' : 'bg-gray-25'}`}>
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
                        <div className="font-medium text-emerald-600" suppressHydrationWarning>
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
                              <span className="text-xs font-medium text-emerald-600">
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
                              className="h-6 w-6 p-0 text-emerald-600 hover:text-emerald-700"
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
                                  className="flex items-center gap-2 cursor-pointer text-emerald-600 focus:text-emerald-700 focus:bg-emerald-50"
                                >
                                  <Eye className="h-4 w-4" />
                                  <span>View Details</span>
                                </Link>
                              </DropdownMenuItem>

                              {/* Regenerate — only for provisional bills. Re-runs the PVC with the
                                  latest indices, so once the real numbers are entered it becomes Final. */}
                              {bill.indicesStatus?.isProvisional && (
                                <DropdownMenuItem
                                  onClick={(e) => { e.preventDefault(); recalculateBill(bill.id); }}
                                  disabled={recalculating === bill.id}
                                  className="flex items-center gap-2 cursor-pointer text-amber-700 focus:text-amber-800 focus:bg-amber-50"
                                >
                                  {recalculating === bill.id ? <LoadingSpinner /> : <Calculator className="h-4 w-4" />}
                                  <span>Regenerate PVC</span>
                                </DropdownMenuItem>
                              )}

                              <DropdownMenuSeparator />
                              
                              {/* Export Section */}
                              <DropdownMenuItem 
                                onClick={() => openTemplateDialog(bill.id, bill.billNo)}
                                className="flex items-center gap-2 cursor-pointer text-emerald-600 focus:text-emerald-700 focus:bg-emerald-50"
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
                                className="flex items-center gap-2 cursor-pointer text-emerald-600 focus:text-emerald-700 focus:bg-emerald-50"
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
                    <tr key={`batch-${batchId}`} className="bg-emerald-50 hover:bg-emerald-100" onClick={() => toggleBatchExpansion(batchId)} style={{cursor: 'pointer'}}>
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
                          <Layers className="h-4 w-4 text-emerald-600" />
                          <div>
                            <div className="font-semibold text-emerald-900">{group.batchName}</div>
                            <div className="text-xs text-emerald-700">{group.bills.length} bills in this batch</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className="bg-emerald-100 text-emerald-700">Batch</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-medium text-emerald-600" suppressHydrationWarning>
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
                              generateBatchCombinedPDF(group.bills, group.batchName || 'Batch', batchId);
                            }}
                            disabled={generatingCombinedPDF === batchId}
                          >
                            {generatingCombinedPDF === batchId ? (
                              <><LoadingSpinner size="sm" className="mr-1" />Generating...</>
                            ) : (
                              <><Download className="h-3 w-3 mr-1" />Combined PDF</>
                            )}
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
        <div className="space-y-6">
          {/* Select All Header */}
          {filteredBills.length > 0 && (
            <Card className="border border-slate-100 shadow-sm bg-slate-50/50 rounded-2xl overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selectedBills.length === filteredBills.length && filteredBills.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                  <span className="text-sm font-medium text-slate-700">
                    Select All ({filteredBills.length} bills)
                  </span>
                  {selectedBills.length > 0 && (
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
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
            <Card key={bill.id} className={`group relative overflow-hidden rounded-2xl border border-slate-150 bg-white/80 backdrop-blur-md shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:border-slate-300/80 dark:border-slate-800 dark:bg-slate-950/70 dark:hover:border-slate-700/80 ${selectedBills.includes(bill.id) ? 'ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-slate-900 border-emerald-200 dark:border-emerald-800' : ''}`}>
              <CardContent className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-stretch justify-between gap-6">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="pt-1.5">
                      <Checkbox
                        checked={selectedBills.includes(bill.id)}
                        onCheckedChange={() => handleSelectBill(bill.id)}
                        className="rounded border-slate-350 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                      />
                    </div>
                    
                    <div className="flex-1 space-y-4">
                      {/* Top Header Row with Title and Badges */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                          {bill.billNo}
                        </h3>
                        <Badge variant="secondary" className="px-2.5 py-0.5 rounded-full font-medium text-xs bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {bill.quarter}
                        </Badge>
                        {bill.indicesStatus?.isProvisional ? (
                          <Badge className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/50 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30">
                            <AlertCircle className="h-3 w-3 mr-1 text-amber-500" />
                            Provisional Indices
                          </Badge>
                        ) : (
                          <Badge className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/50 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30">
                            <CheckCircle className="h-3 w-3 mr-1 text-emerald-500" />
                            Final Indices
                          </Badge>
                        )}
                        {/* Extension Marker */}
                        {bill.contract?.isExtended && bill.contract?.extensionType && (
                          <Badge className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                            bill.contract.extensionType === '17B' 
                              ? 'bg-rose-50 text-rose-700 border-rose-200/50 hover:bg-rose-100 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30' 
                              : 'bg-amber-50 text-amber-700 border-amber-200/50 hover:bg-amber-100 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30'
                          }`}>
                            <Clock className="h-3 w-3 mr-1" />
                            GCC {bill.contract.extensionType} Extension
                          </Badge>
                        )}
                        {/* Approval Status */}
                        <BillStatusBadge status={bill.status || 'draft'} size="sm" />
                      </div>

                      {/* General Info Panel - Grid style */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-600 dark:text-slate-300 bg-slate-50/50 dark:bg-slate-900/30 p-4 rounded-xl border border-slate-100/80 dark:border-slate-800/40">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-slate-400 flex-shrink-0" />
                            <span className="font-medium text-slate-700 dark:text-slate-200">{bill.contract?.agreementNo}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-slate-400 flex-shrink-0" />
                            <span className="font-semibold text-slate-800 dark:text-slate-100">{bill.contract?.contractorName}</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <FileText className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                            <span className="line-clamp-2 leading-relaxed">{bill.contract?.workDescription}</span>
                          </div>
                        </div>
                        <div className="space-y-2 border-t md:border-t-0 md:border-l border-slate-150 dark:border-slate-800/60 pt-2 md:pt-0 md:pl-4 flex flex-col justify-center">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-slate-400 flex-shrink-0" />
                            <span suppressHydrationWarning className="font-medium">
                              Measurement: <span className="text-slate-800 dark:text-slate-100">{format(new Date(bill.dateOfMeasurement), 'dd MMM yyyy')}</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Clock className="h-4 w-4 text-slate-400 flex-shrink-0" />
                            <span suppressHydrationWarning className="text-xs text-slate-500">
                              Created: {format(toISTDate(new Date(bill.createdAt)), 'dd MMM yyyy, HH:mm')}
                            </span>
                          </div>
                          {bill.contract?.user?.name && (
                            <div className="flex items-center gap-2 mt-1">
                              <User className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                              <span className="text-xs text-slate-500">
                                By: <span className="font-medium text-slate-700">{bill.contract.user.name}</span>
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Financial Summary Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                        {/* Bill Amount */}
                        <div className="bg-gradient-to-br from-emerald-50/40 to-emerald-100/10 dark:from-emerald-950/20 dark:to-emerald-900/5 border border-emerald-100/50 dark:border-emerald-900/30 rounded-xl p-3 hover:bg-emerald-50/20 transition-all duration-200">
                          <p className="text-[10px] font-semibold text-emerald-600/80 dark:text-emerald-400 uppercase tracking-wider mb-1">Bill Amount</p>
                          <p className="text-base font-bold text-emerald-700 dark:text-emerald-300" suppressHydrationWarning>
                            ₹{bill.billAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </p>
                        </div>

                        {/* PVC Amount */}
                        <div className="bg-gradient-to-br from-emerald-50/40 to-emerald-100/10 dark:from-emerald-950/20 dark:to-emerald-900/5 border border-emerald-100/50 dark:border-emerald-900/30 rounded-xl p-3 hover:bg-emerald-50/20 transition-all duration-200">
                          <p className="text-[10px] font-semibold text-emerald-600/80 dark:text-emerald-400 uppercase tracking-wider mb-1">PVC Amount</p>
                          {bill.pvcCalculation ? (
                            bill.contract?.isExtended && bill.contract?.extensionType === '17B' && bill.pvcCalculation.isIndexCapped && bill.pvcCalculation.originalPvcAmount && bill.pvcCalculation.restrictedPvcAmount ? (
                              <div className="flex flex-col gap-0.5">
                                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300" suppressHydrationWarning>
                                  ₹{bill.pvcCalculation.restrictedPvcAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                </p>
                                <span className="text-[9px] text-slate-500 font-medium leading-none" suppressHydrationWarning>
                                  Uncapped: ₹{bill.pvcCalculation.originalPvcAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                </span>
                              </div>
                            ) : (
                              <p className="text-base font-bold text-emerald-700 dark:text-emerald-300" suppressHydrationWarning>
                                ₹{bill.pvcCalculation.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              </p>
                            )
                          ) : (
                            <p className="text-xs text-slate-400 font-medium">Pending</p>
                          )}
                        </div>

                        {/* Cumulative PVC */}
                        <div className="bg-gradient-to-br from-emerald-50/40 to-emerald-100/10 dark:from-emerald-950/20 dark:to-emerald-900/5 border border-emerald-100/50 dark:border-emerald-900/30 rounded-xl p-3 hover:bg-emerald-50/20 transition-all duration-200">
                          <p className="text-[10px] font-semibold text-emerald-600/80 dark:text-emerald-400 uppercase tracking-wider mb-1">Cumulative PVC</p>
                          {bill.pvcCalculation ? (
                            <p className="text-base font-bold text-emerald-700 dark:text-emerald-300" suppressHydrationWarning>
                              ₹{bill.pvcCalculation.cumulativePvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            </p>
                          ) : (
                            <p className="text-xs text-slate-400 font-medium">Pending</p>
                          )}
                        </div>

                        {/* Processing Fee */}
                        <div className="bg-gradient-to-br from-emerald-50/40 to-emerald-100/10 dark:from-emerald-950/20 dark:to-emerald-900/5 border border-emerald-100/50 dark:border-emerald-900/30 rounded-xl p-3 hover:bg-emerald-50/20 transition-all duration-200">
                          <p className="text-[10px] font-semibold text-emerald-600/80 dark:text-emerald-400 uppercase tracking-wider mb-1">Processing Fee</p>
                          {bill.billTransaction ? (
                            bill.billTransaction.isFree ? (
                              <div className="flex items-center gap-1 mt-0.5">
                                <Gift className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">FREE</span>
                              </div>
                            ) : (
                              <p className="text-base font-bold text-emerald-700 dark:text-emerald-300" suppressHydrationWarning>
                                ₹{bill.billTransaction.amount.toLocaleString('en-IN')}
                              </p>
                            )
                          ) : (
                            <p className="text-xs text-slate-400 font-medium">Not processed</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions Console */}
                  <div className="flex flex-wrap lg:flex-col items-stretch justify-center gap-3 min-w-[200px] w-full lg:w-[220px] mt-4 lg:mt-0 border-t lg:border-t-0 lg:border-l border-slate-150 dark:border-slate-800/80 pt-4 lg:pt-0 lg:pl-5">
                    {/* View Details - Highlighted Primary CTA */}
                    <Button asChild variant="default" size="default" className="w-full bg-emerald-600 hover:bg-emerald-750 text-white shadow-sm hover:shadow transition-all duration-300 font-semibold rounded-xl h-10 gap-2">
                      <Link href={`/bills/${bill.id}`}>
                        <Eye className="h-4 w-4" />
                        <span>View Details</span>
                      </Link>
                    </Button>

                    {/* Export Actions Grid (PDF, Excel, Covering Letter) */}
                    <div className="grid grid-cols-3 gap-2 w-full">
                      {/* PDF */}
                      <button
                        onClick={() => openTemplateDialog(bill.id, bill.billNo)}
                        className="flex flex-col items-center justify-center p-2 rounded-xl border border-slate-200/50 hover:border-emerald-200 dark:border-slate-800 dark:hover:border-emerald-900/50 bg-slate-50/50 hover:bg-emerald-50/30 text-emerald-700 dark:text-emerald-400 dark:bg-slate-900/20 transition-all duration-200 group/btn"
                        title="Download PDF"
                      >
                        <Download className="h-4 w-4 mb-1 group-hover/btn:scale-110 transition-transform duration-200" />
                        <span className="text-[10px] font-bold">PDF</span>
                      </button>

                      {/* Excel */}
                      <button
                        onClick={() => downloadBillExcel(bill.id, bill.billNo)}
                        className="flex flex-col items-center justify-center p-2 rounded-xl border border-slate-200/50 hover:border-emerald-200 dark:border-slate-800 dark:hover:border-emerald-900/50 bg-slate-50/50 hover:bg-emerald-50/30 text-emerald-700 dark:text-emerald-400 dark:bg-slate-900/20 transition-all duration-200 group/btn"
                        title="Download Excel"
                      >
                        <FileSpreadsheet className="h-4 w-4 mb-1 group-hover/btn:scale-110 transition-transform duration-200" />
                        <span className="text-[10px] font-bold">Excel</span>
                      </button>

                      {/* Covering Letter */}
                      <button
                        onClick={() => downloadCoveringLetter(bill.id, bill.billNo, bill.contract)}
                        className="flex flex-col items-center justify-center p-2 rounded-xl border border-slate-200/50 hover:border-emerald-200 dark:border-slate-800 dark:hover:border-emerald-900/50 bg-slate-50/50 hover:bg-emerald-50/30 text-emerald-700 dark:text-emerald-400 dark:bg-slate-900/20 transition-all duration-200 group/btn"
                        title="Download Covering Letter"
                      >
                        <Send className="h-4 w-4 mb-1 group-hover/btn:scale-110 transition-transform duration-200" />
                        <span className="text-[10px] font-bold">Letter</span>
                      </button>
                    </div>

                    {/* WhatsApp notification action */}
                    <Button
                      onClick={() => openWhatsAppDialog(bill.id, bill.billNo, bill.contract.contractorName, bill.contract.contractorPhone)}
                      variant="outline"
                      size="default"
                      className="w-full border-emerald-100 hover:border-emerald-250 dark:border-emerald-950 dark:hover:border-emerald-900/50 bg-emerald-50/30 hover:bg-emerald-50/60 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-semibold rounded-xl h-10 gap-2 transition-all duration-200"
                    >
                      <Phone className="h-4 w-4 text-emerald-600" />
                      <span>WhatsApp</span>
                    </Button>

                    {/* Regenerate — only for bills whose numbers were computed with provisional
                        (borrowed) indices. Stays disabled until the real index for the month is
                        published (indicesStatus becomes final), then lights up so one click
                        refreshes the bill with the final figures. */}
                    {bill.pvcCalculation?.usedProvisionalIndices && (() => {
                      const nowFinal = bill.indicesStatus?.isProvisional === false;
                      const busy = recalculating === bill.id;
                      return (
                        <Button
                          onClick={() => recalculateBill(bill.id)}
                          disabled={!nowFinal || busy}
                          variant="outline"
                          size="default"
                          title={nowFinal
                            ? 'The final index is now published — click to regenerate this bill with the final figures.'
                            : 'Waiting for the final index of this month to be published. You can regenerate once it is available.'}
                          className={`w-full font-semibold rounded-xl h-10 gap-2 transition-all duration-200 ${
                            nowFinal
                              ? 'border-amber-200 hover:border-amber-300 bg-amber-50/60 hover:bg-amber-100/60 dark:border-amber-900/50 dark:bg-amber-950/20 dark:hover:bg-amber-950/40 text-amber-800 dark:text-amber-300'
                              : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/20 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                          }`}
                        >
                          {busy ? <LoadingSpinner /> : <Calculator className="h-4 w-4" />}
                          <span>{nowFinal ? 'Regenerate (final ready)' : 'Regenerate (awaiting final)'}</span>
                        </Button>
                      );
                    })()}

                    {/* Edit & Delete Action Grid */}
                    <div className="grid grid-cols-2 gap-2 w-full">
                      {/* Edit */}
                      <Button asChild variant="outline" size="default" className="w-full border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 font-semibold rounded-xl h-10 gap-1.5 transition-all duration-200">
                        <Link href={`/bills/edit/${bill.id}`}>
                          <Edit className="h-3.5 w-3.5" />
                          <span>Edit</span>
                        </Link>
                      </Button>

                      {/* Delete */}
                      {deletableBillIds.has(bill.id) ? (
                        <Button
                          onClick={() => deleteBill(bill.id)}
                          disabled={deleting}
                          variant="outline"
                          size="default"
                          className="w-full border-rose-100 hover:border-rose-200 dark:border-rose-950/50 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 font-semibold rounded-xl h-10 gap-1.5 transition-all duration-200"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                          <span>Delete</span>
                        </Button>
                      ) : (
                        <div className="w-full h-10 border border-dashed border-slate-200 dark:border-slate-850 rounded-xl flex items-center justify-center text-[10px] text-slate-400 font-semibold bg-slate-50/30 dark:bg-slate-900/10">
                          System Lock
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Component breakdown for latest bills */}
                {bill.pvcCalculation && (
                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-850">
                    <div className="flex flex-wrap gap-2.5 justify-center lg:justify-start">
                      {bill.pvcCalculation.labourPvc !== 0 && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50/60 border border-emerald-100/50 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-400 text-xs font-semibold shadow-sm hover:bg-emerald-100/30 transition-colors duration-150">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          <span>Labour:</span>
                          <span className={`font-bold ${bill.pvcCalculation.labourPvc < 0 ? 'text-rose-600' : 'text-emerald-800 dark:text-emerald-300'}`}>
                            {bill.pvcCalculation.labourPvc < 0 ? '-' : ''}₹{Math.abs(bill.pvcCalculation.labourPvc).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      )}
                      {bill.pvcCalculation.plantMachineryPvc !== 0 && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50/60 border border-amber-100/50 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900/30 dark:text-amber-400 text-xs font-semibold shadow-sm hover:bg-amber-100/30 transition-colors duration-150">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          <span>Plant:</span>
                          <span className={`font-bold ${bill.pvcCalculation.plantMachineryPvc < 0 ? 'text-rose-600' : 'text-amber-800 dark:text-amber-300'}`}>
                            {bill.pvcCalculation.plantMachineryPvc < 0 ? '-' : ''}₹{Math.abs(bill.pvcCalculation.plantMachineryPvc).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      )}
                      {bill.pvcCalculation.fuelPowerPvc !== 0 && (
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm transition-colors duration-150 border ${
                          bill.pvcCalculation.fuelPowerPvc < 0
                            ? 'bg-rose-50/60 border-rose-100/50 text-rose-700 dark:bg-rose-950/20 dark:border-rose-900/30 dark:text-rose-400 hover:bg-rose-100/30'
                            : 'bg-orange-50/60 border-orange-100/50 text-orange-700 dark:bg-orange-950/20 dark:border-orange-900/30 dark:text-orange-400 hover:bg-orange-100/30'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${bill.pvcCalculation.fuelPowerPvc < 0 ? 'bg-rose-500' : 'bg-orange-500'}`}></span>
                          <span>Fuel:</span>
                          <span className={`font-bold ${bill.pvcCalculation.fuelPowerPvc < 0 ? 'text-rose-750 dark:text-rose-400' : 'text-orange-800 dark:text-orange-300'}`}>
                            {bill.pvcCalculation.fuelPowerPvc < 0 ? '-' : ''}₹{Math.abs(bill.pvcCalculation.fuelPowerPvc).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      )}
                      {bill.pvcCalculation.otherMaterialsPvc !== 0 && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50/60 border border-emerald-100/50 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-400 text-xs font-semibold shadow-sm hover:bg-emerald-100/30 transition-colors duration-150">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          <span>Materials:</span>
                          <span className={`font-bold ${bill.pvcCalculation.otherMaterialsPvc < 0 ? 'text-rose-600' : 'text-emerald-800 dark:text-emerald-300'}`}>
                            {bill.pvcCalculation.otherMaterialsPvc < 0 ? '-' : ''}₹{Math.abs(bill.pvcCalculation.otherMaterialsPvc).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      )}
                      {(bill.pvcCalculation.cementPvc !== 0 || bill.pvcCalculation.dedicatedCementPvc !== 0) && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50/60 border border-emerald-100/50 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-400 text-xs font-semibold shadow-sm hover:bg-emerald-100/30 transition-colors duration-150">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          <span>Cement:</span>
                          <span className={`font-bold ${(bill.pvcCalculation.cementPvc + bill.pvcCalculation.dedicatedCementPvc) < 0 ? 'text-rose-600' : 'text-emerald-800 dark:text-emerald-300'}`}>
                            {(bill.pvcCalculation.cementPvc + bill.pvcCalculation.dedicatedCementPvc) < 0 ? '-' : ''}₹{Math.abs(bill.pvcCalculation.cementPvc + bill.pvcCalculation.dedicatedCementPvc).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      )}
                      {bill.pvcCalculation.explosivesPvc !== 0 && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-pink-50/60 border border-pink-100/50 text-pink-700 dark:bg-pink-950/20 dark:border-pink-900/30 dark:text-pink-400 text-xs font-semibold shadow-sm hover:bg-pink-100/30 transition-colors duration-150">
                          <span className="w-1.5 h-1.5 rounded-full bg-pink-500"></span>
                          <span>Explosives:</span>
                          <span className={`font-bold ${bill.pvcCalculation.explosivesPvc < 0 ? 'text-rose-600' : 'text-pink-800 dark:text-pink-300'}`}>
                            {bill.pvcCalculation.explosivesPvc < 0 ? '-' : ''}₹{Math.abs(bill.pvcCalculation.explosivesPvc).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      )}
                      {(bill.pvcCalculation.steelPvc !== 0 || bill.pvcCalculation.dedicatedSteelPvc !== 0) && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-slate-700 dark:bg-slate-900/30 dark:border-slate-800 dark:text-slate-300 text-xs font-semibold shadow-sm hover:bg-slate-100 dark:hover:bg-slate-900/50 transition-colors duration-150">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                          <span>Steel:</span>
                          <span className={`font-bold ${(bill.pvcCalculation.steelPvc + bill.pvcCalculation.dedicatedSteelPvc) < 0 ? 'text-rose-600' : 'text-slate-800 dark:text-slate-255'}`}>
                            {(bill.pvcCalculation.steelPvc + bill.pvcCalculation.dedicatedSteelPvc) < 0 ? '-' : ''}₹{Math.abs(bill.pvcCalculation.steelPvc + bill.pvcCalculation.dedicatedSteelPvc).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
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
            <Card key={`batch-${batchId}`} className="group relative overflow-hidden rounded-2xl border border-emerald-100/70 bg-gradient-to-br from-emerald-50/20 to-emerald-50/10 dark:border-emerald-900/30 dark:from-emerald-950/20 dark:to-emerald-950/10 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg">
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
                      className="mt-1.5 border-emerald-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-3 flex-wrap mb-3">
                        <Layers className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                        <h3 className="text-xl font-bold text-emerald-950 dark:text-emerald-300 tracking-tight">
                          {group.batchName}
                        </h3>
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200/50 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/30 font-semibold px-2.5 py-0.5 rounded-full text-xs">
                          {group.bills.length} Bills
                        </Badge>
                      </div>
                      
                      <div className="space-y-3 mb-4 bg-emerald-50/30 dark:bg-emerald-950/10 p-4 rounded-xl border border-emerald-100/50 dark:border-emerald-900/20">
                        {/* Work Description */}
                        <div>
                          <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">Work Description</p>
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 line-clamp-2 leading-relaxed">
                            {group.bills[0]?.contract?.workDescription || 'N/A'}
                          </p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                          <div className="bg-white/80 dark:bg-slate-900/60 p-3 rounded-lg border border-emerald-100/30 dark:border-emerald-900/10 shadow-sm">
                            <p className="text-[10px] font-semibold text-emerald-600/80 dark:text-emerald-400 uppercase tracking-wider mb-0.5">Total Bill Amount</p>
                            <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                              ₹{group.totalAmount.toLocaleString('en-IN')}
                            </p>
                          </div>
                          <div className="bg-white/80 dark:bg-slate-900/60 p-3 rounded-lg border border-emerald-100/30 dark:border-emerald-900/10 shadow-sm">
                            <p className="text-[10px] font-semibold text-emerald-600/80 dark:text-emerald-400 uppercase tracking-wider mb-0.5">Total PVC</p>
                            <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                              ₹{group.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            </p>
                          </div>
                          <div className="bg-white/80 dark:bg-slate-900/60 p-3 rounded-lg border border-emerald-100/30 dark:border-emerald-900/10 shadow-sm">
                            <p className="text-[10px] font-semibold text-emerald-600/80 dark:text-emerald-400 uppercase tracking-wider mb-0.5">Contract</p>
                            <p className="text-sm font-semibold text-slate-850 dark:text-slate-200 truncate mt-0.5" title={group.bills[0]?.contract?.agreementNo}>
                              {group.bills[0]?.contract?.agreementNo}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 flex-wrap mb-1 items-center">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            generateBatchCombinedPDF(group.bills, group.batchName || 'Batch', batchId);
                          }}
                          disabled={generatingCombinedPDF === batchId}
                          className="bg-emerald-600 hover:bg-emerald-750 text-white font-semibold rounded-xl px-4 py-2 h-9 shadow-sm hover:shadow transition-all duration-200 gap-1.5"
                        >
                          {generatingCombinedPDF === batchId ? (
                            <><LoadingSpinner size="sm" className="mr-1" /><span>Generating...</span></>
                          ) : (
                            <><Download className="h-4 w-4" /><span>Combined PDF</span></>
                          )}
                        </Button>
                        <Button 
                          variant="outline"
                          size="sm"
                          onClick={() => toggleBatchExpansion(batchId)}
                          className="border-emerald-200 hover:border-emerald-300 hover:bg-emerald-50/50 dark:border-emerald-900 dark:hover:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-semibold rounded-xl px-4 py-2 h-9 transition-all duration-200 gap-1.5"
                        >
                          {isExpanded ? (
                            <><ChevronUp className="h-4 w-4" /><span>Hide Bills</span></>
                          ) : (
                            <><ChevronDown className="h-4 w-4" /><span>Show {group.bills.length} Bills</span></>
                          )}
                        </Button>
                      </div>

                      {isExpanded && (
                        <div className="space-y-3 pl-4 border-l-2 border-emerald-200 dark:border-emerald-800/60 mt-4">
                          {group.bills.map((bill) => (
                            <div key={bill.id} className="p-4 bg-white/90 dark:bg-slate-900/80 rounded-xl border border-slate-150 dark:border-slate-800 shadow-sm transition-all duration-200 hover:shadow-md">
                              <div className="flex items-center justify-between mb-3">
                                <div>
                                  <p className="font-bold text-slate-850 dark:text-white text-sm">{bill.billNo}</p>
                                  <p className="text-[11px] text-slate-450 font-medium">
                                    Measurement: {format(new Date(bill.dateOfMeasurement), 'dd MMM yyyy')}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                    ₹{bill.billAmount.toLocaleString('en-IN')}
                                  </p>
                                  {bill.pvcCalculation && (
                                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                      PVC: ₹{bill.pvcCalculation.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-1.5 flex-wrap border-t border-slate-50 dark:border-slate-800/40 pt-3">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  asChild
                                  className="h-8 px-3 text-xs text-emerald-600 hover:text-emerald-750 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30 font-semibold rounded-lg"
                                >
                                  <Link href={`/bills/${bill.id}`}>
                                    <Eye className="h-3.5 w-3.5 mr-1" />View Details
                                  </Link>
                                </Button>
                                <Button
                                  onClick={() => openTemplateDialog(bill.id, bill.billNo)}
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-3 text-xs text-emerald-600 hover:text-emerald-750 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30 font-semibold rounded-lg"
                                >
                                  <Download className="h-3.5 w-3.5 mr-1" />PDF
                                </Button>
                                <Button
                                  onClick={() => downloadBillExcel(bill.id, bill.billNo)}
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-3 text-xs text-emerald-600 hover:text-emerald-750 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30 font-semibold rounded-lg"
                                >
                                  <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />Excel
                                </Button>
                                <Button
                                  onClick={() => downloadCoveringLetter(bill.id, bill.billNo, bill.contract)}
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-3 text-xs text-emerald-600 hover:text-emerald-750 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30 font-semibold rounded-lg"
                                >
                                  <Send className="h-3.5 w-3.5 mr-1" />Letter
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  asChild
                                  className="h-8 px-3 text-xs text-slate-650 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-350 dark:hover:bg-slate-800 font-semibold rounded-lg"
                                >
                                  <Link href={`/bills/edit/${bill.id}`}>
                                    <Edit className="h-3.5 w-3.5 mr-1" />Edit
                                  </Link>
                                </Button>
                                <Button
                                  onClick={() => deleteBill(bill.id)}
                                  variant="ghost"
                                  size="sm"
                                  disabled={deleting}
                                  className="h-8 px-3 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30 font-semibold rounded-lg"
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
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
            {/* Report format is fixed to IR Standard; choose with or without index documents. */}
            <div className="space-y-2">
              <Label>Report Format</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIncludeIndexDocs(true)}
                  className={`flex flex-col items-start p-3 rounded-lg border-2 text-left transition-colors ${includeIndexDocs ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <span className="font-semibold text-sm">IR PDF + Index Documents</span>
                  <span className="text-xs text-muted-foreground mt-1">Official A4 proforma with the published index documents attached</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIncludeIndexDocs(false)}
                  className={`flex flex-col items-start p-3 rounded-lg border-2 text-left transition-colors ${!includeIndexDocs ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <span className="font-semibold text-sm">IR PDF only</span>
                  <span className="text-xs text-muted-foreground mt-1">Statement pages only, without the supporting index documents</span>
                </button>
              </div>
            </div>

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
                  No custom templates found. <Link href="/report-templates" className="text-emerald-600 hover:underline">Create one</Link>
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

      {/* Bulk download: with / without index documents */}
      <Dialog open={showBulkIndexDialog} onOpenChange={setShowBulkIndexDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Download combined PDF</DialogTitle>
            <DialogDescription>Do you want the supporting index documents included?</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 py-2">
            <button
              type="button"
              onClick={() => { setShowBulkIndexDialog(false); const run = pendingBulk; setPendingBulk(null); run?.(true); }}
              className="flex flex-col items-start p-3 rounded-lg border-2 border-emerald-600 bg-emerald-50 text-left"
            >
              <span className="font-semibold text-sm">With index documents</span>
              <span className="text-xs text-muted-foreground mt-1">Statements + the published index documents attached</span>
            </button>
            <button
              type="button"
              onClick={() => { setShowBulkIndexDialog(false); const run = pendingBulk; setPendingBulk(null); run?.(false); }}
              className="flex flex-col items-start p-3 rounded-lg border-2 border-slate-200 hover:border-slate-300 text-left"
            >
              <span className="font-semibold text-sm">Without index</span>
              <span className="text-xs text-muted-foreground mt-1">Statement pages only, no supporting documents</span>
            </button>
          </div>
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
