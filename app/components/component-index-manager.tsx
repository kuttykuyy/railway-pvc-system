
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileText, Loader2, MoreVertical, Edit, Trash2, CheckCircle, XCircle, Filter, ArrowUpDown, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const COMPONENT_TYPES = [
  { value: "LABOUR", label: "Labour" },
  { value: "PLANT_MACHINERY_SPARES", label: "Plant Machinery & Spares" },
  { value: "MPNG_FUEL", label: "MPNG Fuel" },
  { value: "OTHER_MATERIALS", label: "Other Materials" },
  { value: "CEMENT", label: "Cement" },
  { value: "TMT_BARS", label: "TMT Bars" },
  { value: "ANGLE_CHANNEL", label: "Angle/Channel" },
  { value: "PLATES", label: "Plates" },
  { value: "OTHER_SECTIONS", label: "Other Sections" },
];

const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

interface UploadedDocument {
  id: string;
  componentType: string;
  year: number;
  months: number[];
  fileName: string;
  cloudStoragePath: string;
  uploadedBy: string;
  isProvisional: boolean;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
  user: {
    name: string;
    email: string;
  };
}

type SortField = "componentType" | "year" | "createdAt" | "updatedAt" | "isProvisional";
type SortOrder = "asc" | "desc";

export function ComponentIndexManager() {
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<UploadedDocument[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  
  // Filter states
  const [filterComponentType, setFilterComponentType] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Sort states
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Edit dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<UploadedDocument | null>(null);
  const [editMonths, setEditMonths] = useState<number[]>([]);
  const [editRemarks, setEditRemarks] = useState<string>("");
  const [isUpdating, setIsUpdating] = useState(false);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 2020 + 1 }, (_, i) => 2020 + i).reverse();

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    applyFiltersAndSort();
  }, [documents, filterComponentType, filterYear, filterStatus, searchQuery, sortField, sortOrder]);

  const fetchDocuments = async () => {
    try {
      setIsLoadingDocuments(true);
      const response = await fetch(`/api/labour-index/list`);
      if (!response.ok) throw new Error("Failed to fetch documents");

      const data = await response.json();
      setDocuments(data.documents);
    } catch (error) {
      console.error("Error fetching documents:", error);
      toast.error("Failed to load documents");
    } finally {
      setIsLoadingDocuments(false);
    }
  };

  const applyFiltersAndSort = () => {
    let filtered = [...documents];

    // Apply filters
    if (filterComponentType !== "all") {
      filtered = filtered.filter(doc => doc.componentType === filterComponentType);
    }
    if (filterYear !== "all") {
      filtered = filtered.filter(doc => doc.year === parseInt(filterYear));
    }
    if (filterStatus !== "all") {
      const isProvisional = filterStatus === "provisional";
      filtered = filtered.filter(doc => doc.isProvisional === isProvisional);
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(doc => 
        doc.fileName.toLowerCase().includes(query) ||
        doc.user.name?.toLowerCase().includes(query) ||
        doc.user.email.toLowerCase().includes(query) ||
        doc.remarks?.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === "createdAt" || sortField === "updatedAt") {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }

      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    setFilteredDocuments(filtered);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const clearFilters = () => {
    setFilterComponentType("all");
    setFilterYear("all");
    setFilterStatus("all");
    setSearchQuery("");
  };

  const handleEdit = (doc: UploadedDocument) => {
    setEditingDocument(doc);
    setEditMonths(doc.months);
    setEditRemarks(doc.remarks || "");
    setEditDialogOpen(true);
  };

  const toggleEditMonth = (month: number) => {
    setEditMonths((prev) =>
      prev.includes(month)
        ? prev.filter((m) => m !== month)
        : [...prev, month].sort((a, b) => a - b)
    );
  };

  const selectAllEditMonths = () => {
    setEditMonths(MONTHS.map(m => m.value));
  };

  const deselectAllEditMonths = () => {
    setEditMonths([]);
  };

  const handleUpdate = async () => {
    if (!editingDocument) return;

    if (editMonths.length === 0) {
      toast.error("Please select at least one month");
      return;
    }

    try {
      setIsUpdating(true);

      const response = await fetch("/api/labour-index/update", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editingDocument.id,
          months: editMonths,
          remarks: editRemarks.trim() || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Update failed");
      }

      toast.success("Document updated successfully");
      setEditDialogOpen(false);
      fetchDocuments();
    } catch (error) {
      console.error("Update error:", error);
      toast.error(error instanceof Error ? error.message : "Update failed");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleToggleStatus = async (doc: UploadedDocument) => {
    try {
      const response = await fetch("/api/labour-index/update", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: doc.id,
          isProvisional: !doc.isProvisional,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Status update failed");
      }

      toast.success(`Document marked as ${!doc.isProvisional ? "Provisional" : "Final"}`);
      fetchDocuments();
    } catch (error) {
      console.error("Status toggle error:", error);
      toast.error(error instanceof Error ? error.message : "Status update failed");
    }
  };

  const handleDelete = async (documentId: string) => {
    if (!confirm("Are you sure you want to delete this document?")) {
      return;
    }

    try {
      const response = await fetch(`/api/labour-index/delete?id=${documentId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Delete failed");
      }

      toast.success("Document deleted successfully");
      fetchDocuments();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error(error instanceof Error ? error.message : "Delete failed");
    }
  };

  const getMonthsDisplay = (months: number[]) => {
    return months
      .sort((a, b) => a - b)
      .map((m) => MONTHS.find((month) => month.value === m)?.label.slice(0, 3))
      .join(", ");
  };

  const getComponentLabel = (type: string) => {
    return COMPONENT_TYPES.find((c) => c.value === type)?.label || type;
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="ml-2 h-4 w-4 opacity-30" />;
    return sortOrder === "asc" ? 
      <ArrowUpDown className="ml-2 h-4 w-4 text-emerald-600" /> : 
      <ArrowUpDown className="ml-2 h-4 w-4 text-emerald-600 rotate-180" />;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Component Index Documents Management</CardTitle>
          <CardDescription>
            Filter, sort, and manage uploaded component index documents with provisional/final status
          </CardDescription>
          
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mt-4">
            <div>
              <Label htmlFor="search" className="text-xs mb-1 block">Search</Label>
              <Input
                id="search"
                placeholder="Search filename, user..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="filterComponent" className="text-xs mb-1 block">Component</Label>
              <Select value={filterComponentType} onValueChange={setFilterComponentType}>
                <SelectTrigger id="filterComponent">
                  <SelectValue placeholder="All Components" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Components</SelectItem>
                  {COMPONENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="filterYear" className="text-xs mb-1 block">Year</Label>
              <Select value={filterYear} onValueChange={setFilterYear}>
                <SelectTrigger id="filterYear">
                  <SelectValue placeholder="All Years" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {years.map((y) => (
                    <SelectItem key={y} value={y.toString()}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="filterStatus" className="text-xs mb-1 block">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger id="filterStatus">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="provisional">Provisional</SelectItem>
                  <SelectItem value="final">Final</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button variant="outline" onClick={clearFilters} className="flex-1">
                <Filter className="h-4 w-4 mr-2" />
                Clear
              </Button>
              <Button variant="outline" onClick={fetchDocuments}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Results count */}
          <div className="text-sm text-gray-600 mt-2">
            Showing {filteredDocuments.length} of {documents.length} document{documents.length !== 1 ? 's' : ''}
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingDocuments ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {documents.length === 0 ? "No documents uploaded yet" : "No documents match the current filters"}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleSort("componentType")}
                        className="font-semibold"
                      >
                        Component
                        {getSortIcon("componentType")}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleSort("year")}
                        className="font-semibold"
                      >
                        Year
                        {getSortIcon("year")}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleSort("isProvisional")}
                        className="font-semibold"
                      >
                        Status
                        {getSortIcon("isProvisional")}
                      </Button>
                    </TableHead>
                    <TableHead>Months</TableHead>
                    <TableHead>File Name</TableHead>
                    <TableHead>Uploaded By</TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleSort("createdAt")}
                        className="font-semibold"
                      >
                        Created
                        {getSortIcon("createdAt")}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleSort("updatedAt")}
                        className="font-semibold"
                      >
                        Updated
                        {getSortIcon("updatedAt")}
                      </Button>
                    </TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocuments.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <Badge variant="outline">
                          {getComponentLabel(doc.componentType)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{doc.year}</TableCell>
                      <TableCell>
                        {doc.isProvisional ? (
                          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                            <XCircle className="h-3 w-3 mr-1" />
                            Provisional
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Final
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <div className="flex flex-wrap gap-1">
                          {doc.months.slice(0, 3).map((month) => (
                            <Badge key={month} variant="secondary" className="text-xs">
                              {MONTHS.find((m) => m.value === month)?.label.slice(0, 3)}
                            </Badge>
                          ))}
                          {doc.months.length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{doc.months.length - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <div className="truncate" title={doc.fileName}>
                          {doc.fileName}
                        </div>
                        {doc.remarks && (
                          <div className="text-xs text-gray-500 truncate mt-1" title={doc.remarks}>
                            {doc.remarks}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{doc.user.name || doc.user.email}</TableCell>
                      <TableCell className="text-sm">
                        {new Date(doc.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(doc.updatedAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleEdit(doc)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggleStatus(doc)}>
                              {doc.isProvisional ? (
                                <>
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Mark as Final
                                </>
                              ) : (
                                <>
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Mark as Provisional
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => handleDelete(doc.id)}
                              className="text-red-600 focus:text-red-700"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Document Details</DialogTitle>
            <DialogDescription>
              Update months and remarks for the component index document
            </DialogDescription>
          </DialogHeader>

          {editingDocument && (
            <div className="grid gap-4 py-4">
              {/* Document Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-gray-500">Component</Label>
                  <div className="font-medium">{getComponentLabel(editingDocument.componentType)}</div>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Year</Label>
                  <div className="font-medium">{editingDocument.year}</div>
                </div>
              </div>

              {/* Months Selection */}
              <div className="space-y-3">
                <Label>Applicable Months</Label>
                {/* Select All / Deselect All buttons */}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={selectAllEditMonths}
                    className="flex-1"
                  >
                    Select All
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={deselectAllEditMonths}
                    className="flex-1"
                  >
                    Deselect All
                  </Button>
                </div>
                {/* Months grid */}
                <div className="grid grid-cols-3 gap-2">
                  {MONTHS.map((month) => (
                    <div key={month.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`edit-month-${month.value}`}
                        checked={editMonths.includes(month.value)}
                        onCheckedChange={() => toggleEditMonth(month.value)}
                      />
                      <label
                        htmlFor={`edit-month-${month.value}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {month.label}
                      </label>
                    </div>
                  ))}
                </div>
                {editMonths.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {editMonths.map((month) => (
                      <Badge key={month} variant="secondary">
                        {MONTHS.find((m) => m.value === month)?.label}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Remarks */}
              <div className="space-y-2">
                <Label htmlFor="edit-remarks">Remarks (Optional)</Label>
                <Textarea
                  id="edit-remarks"
                  placeholder="Add any notes or remarks about this document..."
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpdate} 
              disabled={isUpdating || editMonths.length === 0}
            >
              {isUpdating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Document"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
