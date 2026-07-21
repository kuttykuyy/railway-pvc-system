"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileText, X, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface LabourIndexUploadProps {
  defaultYear?: number;
  onUploadComplete?: () => void;
  buttonVariant?: "default" | "outline" | "secondary";
  buttonSize?: "default" | "sm" | "lg";
  buttonText?: string;
  showDocumentsList?: boolean;
  isReadOnly?: boolean;
}

interface UploadedDocument {
  id: string;
  componentType: string;
  year: number;
  months: number[];
  fileName: string;
  cloudStoragePath: string;
  uploadedBy: string;
  createdAt: string;
  user: {
    name: string;
    email: string;
  };
}

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

export function LabourIndexUpload({
  defaultYear,
  onUploadComplete,
  buttonVariant = "outline",
  buttonSize = "default",
  buttonText = "Upload Component Index",
  showDocumentsList = true,
  isReadOnly = false,
}: LabourIndexUploadProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [year, setYear] = useState<string>(
    defaultYear?.toString() || new Date().getFullYear().toString()
  );
  const [componentType, setComponentType] = useState<string>("LABOUR");
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [filterComponentType, setFilterComponentType] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>("all");
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  const currentYear = new Date().getFullYear();
  // Generate years from 2020 to current year
  const years = Array.from({ length: currentYear - 2020 + 1 }, (_, i) => 2020 + i).reverse();

  useEffect(() => {
    if (showDocumentsList) {
      fetchDocuments();
    }
  }, [showDocumentsList]);

  const fetchDocuments = async () => {
    try {
      setIsLoadingDocuments(true);
      const params = new URLSearchParams();
      if (filterComponentType !== "all") {
        params.append("componentType", filterComponentType);
      }
      if (filterYear !== "all") {
        params.append("year", filterYear);
      }

      const response = await fetch(`/api/labour-index/list?${params.toString()}`);
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



  const DIRECT_UPLOAD_MAX_BYTES = 4 * 1024 * 1024; // Vercel serverless payload limit

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== "application/pdf") {
        toast.error("Please select a PDF file");
        return;
      }
      // Hard ceiling to keep UX reasonable; S3 path allows larger files
      if (file.size > 100 * 1024 * 1024) {
        toast.error("File size must be less than 100MB");
        return;
      }
      setSelectedFile(file);
    }
  };

  const uploadToS3 = async (presignedUrl: string, file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", presignedUrl, true);
      xhr.setRequestHeader("Content-Type", file.type);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`S3 upload failed: ${xhr.statusText || xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error("S3 upload failed due to network error"));
      xhr.onabort = () => reject(new Error("S3 upload aborted"));

      xhr.send(file);
    });
  };

  const toggleMonth = (month: number) => {
    setSelectedMonths((prev) =>
      prev.includes(month)
        ? prev.filter((m) => m !== month)
        : [...prev, month].sort((a, b) => a - b)
    );
  };

  const selectAllMonths = () => {
    setSelectedMonths(MONTHS.map(m => m.value));
  };

  const deselectAllMonths = () => {
    setSelectedMonths([]);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("Please select a file");
      return;
    }

    if (selectedMonths.length === 0) {
      toast.error("Please select at least one month");
      return;
    }

    if (!componentType) {
      toast.error("Please select a component type");
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(0);

      // Step 1: Request presigned URL (or fallback directive)
      const presignResponse = await fetch("/api/labour-index/presigned-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileType: selectedFile.type,
          year: parseInt(year),
          months: selectedMonths,
          componentType,
        }),
      });

      if (!presignResponse.ok) {
        const error = await presignResponse.json();
        throw new Error(error.error || "Failed to prepare upload");
      }

      const presignData = await presignResponse.json();

      let uploadPayload: FormData;

      if (presignData.s3Available && presignData.presignedUrl && presignData.cloudStoragePath) {
        // Step 2a: Upload file directly to S3 (bypasses Vercel payload limit)
        await uploadToS3(presignData.presignedUrl, selectedFile);

        // Step 3a: Record metadata only
        uploadPayload = new FormData();
        uploadPayload.append("cloudStoragePath", presignData.cloudStoragePath);
        uploadPayload.append("year", year);
        uploadPayload.append("months", JSON.stringify(selectedMonths));
        uploadPayload.append("componentType", componentType);
      } else {
        // Step 2b: Fallback to direct upload (Vercel serverless payload limit applies)
        if (selectedFile.size > DIRECT_UPLOAD_MAX_BYTES) {
          throw new Error(
            `Files larger than ${DIRECT_UPLOAD_MAX_BYTES / 1024 / 1024}MB require S3 storage. Please configure S3 credentials in your deployment.`
          );
        }

        uploadPayload = new FormData();
        uploadPayload.append("file", selectedFile);
        uploadPayload.append("year", year);
        uploadPayload.append("months", JSON.stringify(selectedMonths));
        uploadPayload.append("componentType", componentType);
      }

      const response = await fetch("/api/labour-index/upload", {
        method: "POST",
        body: uploadPayload,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload failed");
      }

      const data = await response.json();
      toast.success(data.message);

      // Reset form
      setSelectedFile(null);
      setSelectedMonths([]);
      setUploadProgress(0);
      setIsOpen(false);

      // Refresh documents list
      if (showDocumentsList) {
        fetchDocuments();
      }

      // Call callback if provided
      if (onUploadComplete) {
        onUploadComplete();
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
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
      .map((m) => MONTHS.find((month) => month.value === m)?.label)
      .join(", ");
  };

  const getComponentLabel = (type: string) => {
    return COMPONENT_TYPES.find((c) => c.value === type)?.label || type;
  };

  return (
    <div className="space-y-6">
      {!isReadOnly && (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button variant={buttonVariant} size={buttonSize}>
              <Upload className="mr-2 h-4 w-4" />
              {buttonText}
            </Button>
          </DialogTrigger>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload Component Index Document</DialogTitle>
            <DialogDescription>
              Upload a PDF document containing component index data for specific months.
              This will be included in bill PDF reports for the selected component and period.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Component Type Selection */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="componentType" className="text-right">
                Component
              </Label>
              <Select value={componentType} onValueChange={setComponentType}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select component" />
                </SelectTrigger>
                <SelectContent>
                  {COMPONENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Year Selection */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="year" className="text-right">
                Year
              </Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={y.toString()}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Months Selection */}
            <div className="grid grid-cols-4 items-start gap-4">
              <Label className="text-right pt-2">
                Months
              </Label>
              <div className="col-span-3 space-y-3">
                {/* Select All / Deselect All buttons */}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={selectAllMonths}
                    className="flex-1"
                  >
                    Select All
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={deselectAllMonths}
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
                        id={`month-${month.value}`}
                        checked={selectedMonths.includes(month.value)}
                        onCheckedChange={() => toggleMonth(month.value)}
                      />
                      <label
                        htmlFor={`month-${month.value}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {month.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Selected Months Display */}
            {selectedMonths.length > 0 && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Selected</Label>
                <div className="col-span-3">
                  <div className="flex flex-wrap gap-1">
                    {selectedMonths.map((month) => (
                      <Badge key={month} variant="secondary">
                        {MONTHS.find((m) => m.value === month)?.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* File Upload */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="file" className="text-right">
                PDF File
              </Label>
              <div className="col-span-3">
                <Input
                  id="file"
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="cursor-pointer"
                />
              </div>
            </div>

            {/* Selected File Display */}
            {selectedFile && (
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-emerald-600" />
                    <div>
                      <p className="text-sm font-medium">{selectedFile.name}</p>
                      <p className="text-xs text-gray-500">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedFile(null)}
                    disabled={isUploading}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {isUploading && uploadProgress > 0 && (
                  <div className="space-y-1">
                    <div className="h-2 w-full rounded-full bg-gray-200">
                      <div
                        className="h-2 rounded-full bg-emerald-600 transition-all duration-200"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 text-right">{uploadProgress}%</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpload} 
              disabled={isUploading || !selectedFile || selectedMonths.length === 0}
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                "Upload"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}

      {/* Documents List */}
      {showDocumentsList && (
        <Card>
          <CardHeader>
            <CardTitle>Uploaded Component Index Documents</CardTitle>
            <CardDescription>
              Manage uploaded component index documents that are included in PDF reports
            </CardDescription>
            <div className="flex gap-4 mt-4">
              <div className="flex-1">
                <Select value={filterComponentType} onValueChange={(value) => {
                  setFilterComponentType(value);
                  fetchDocuments();
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by component" />
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
              <div className="flex-1">
                <Select value={filterYear} onValueChange={(value) => {
                  setFilterYear(value);
                  fetchDocuments();
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by year" />
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
              <Button variant="outline" onClick={fetchDocuments}>
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingDocuments ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No documents uploaded yet
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Component</TableHead>
                      <TableHead>Year</TableHead>
                      <TableHead>Months</TableHead>
                      <TableHead>File Name</TableHead>
                      <TableHead>Uploaded By</TableHead>
                      <TableHead>Date</TableHead>
                      {!isReadOnly && <TableHead className="w-[100px]">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <Badge variant="outline">
                            {getComponentLabel(doc.componentType)}
                          </Badge>
                        </TableCell>
                        <TableCell>{doc.year}</TableCell>
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
                        <TableCell className="max-w-[200px] truncate" title={doc.fileName}>
                          {doc.fileName}
                        </TableCell>
                        <TableCell>{doc.user.name || doc.user.email}</TableCell>
                        <TableCell>
                          {new Date(doc.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                        </TableCell>
                        {!isReadOnly && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(doc.id)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}