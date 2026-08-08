"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
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
import { 
  Upload, 
  FileText, 
  Loader2, 
  MoreVertical, 
  Edit, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  Filter, 
  ArrowUpDown, 
  RefreshCw,
  Search,
  Grid,
  List,
  X,
  FileCheck2,
  Calendar,
  Layers,
  ArrowLeft,
  ChevronRight,
  Eye,
  Info
} from "lucide-react";
import { toast } from "react-hot-toast";
import { BackButton } from "@/components/ui/back-button";
import { getClientRoleInfo } from "@/lib/role-auth-client";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

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

/** The upload signature covers the content type, so one value has to serve both ends. */
const UPLOAD_CONTENT_TYPE = 'application/pdf';

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

type SortField = "componentType" | "year" | "createdAt" | "updatedAt" | "isProvisional";
type SortOrder = "asc" | "desc";
const handleApiResponse = async (response: Response, defaultError: string) => {
  if (response.ok) return await response.json();
  
  let errorMessage = defaultError;
  try {
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const data = await response.json();
      errorMessage = data.error || errorMessage;
    } else {
      const text = await response.text();
      errorMessage = `${defaultError} (Status ${response.status}): ${text.substring(0, 150)}`;
    }
  } catch (e) {
    errorMessage = `${defaultError} (Status ${response.status})`;
  }
  throw new Error(errorMessage);
};

const renderRasterPdf = async (
  pdf: any,
  scale: number,
  quality: number,
  onProgress?: (message: string) => void
): Promise<Uint8Array> => {
  const { PDFDocument } = await import('pdf-lib'); // on-demand — keeps pdf-lib out of the initial bundle
  const numPages = pdf.numPages;
  const rasterDoc = await PDFDocument.create();
  
  for (let i = 1; i <= numPages; i++) {
    if (onProgress) {
      onProgress(`Rendering page ${i} of ${numPages} (scale: ${scale.toFixed(2)}, quality: ${quality.toFixed(2)})...`);
    }
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext("2d");
    
    if (!context) throw new Error("Could not create canvas context");
    
    await page.render({
      canvasContext: context,
      viewport: viewport,
    }).promise;
    
    // These sheets are black figures on white paper. Colour costs roughly a third of the
    // file for nothing — the scanner's chroma noise — and spending that on resolution
    // instead is what keeps a 6 and an 8 apart. Greyscale first, then encode.
    try {
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const d = pixels.data;
      for (let p = 0; p < d.length; p += 4) {
        // Rec. 601 luma, then a gentle contrast stretch so paper goes white and ink dark.
        const luma = d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114;
        const stretched = luma < 110 ? luma * 0.75 : luma > 190 ? 255 : luma;
        d[p] = d[p + 1] = d[p + 2] = stretched;
      }
      context.putImageData(pixels, 0, 0);
    } catch {
      // A tainted or oversized canvas — encode what was rendered rather than failing.
    }

    const jpegDataUrl = canvas.toDataURL("image/jpeg", quality);
    const base64Jpeg = jpegDataUrl.split(",")[1];
    
    const binaryString = atob(base64Jpeg);
    const jpegBytes = new Uint8Array(binaryString.length);
    for (let j = 0; j < binaryString.length; j++) {
      jpegBytes[j] = binaryString.charCodeAt(j);
    }
    
    const img = await rasterDoc.embedJpg(jpegBytes);
    const newPage = rasterDoc.addPage([img.width, img.height]);
    newPage.drawImage(img, {
      x: 0,
      y: 0,
      width: img.width,
      height: img.height,
    });
  }
  
  return await rasterDoc.save({
    useObjectStreams: true,
  });
};

const optimizeAndCompressPdf = async (
  file: File,
  s3Available: boolean,
  onProgress?: (message: string) => void
): Promise<{ file: File; originalSize: number; compressedSize: number; success: boolean }> => {
  const originalSize = file.size;
  try {
    const { PDFDocument } = await import('pdf-lib'); // on-demand
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    
    // Copy pages to a new document to remove unused metadata/objects and rebuild structures
    const compressedDoc = await PDFDocument.create();
    const copiedPages = await compressedDoc.copyPages(pdfDoc, pdfDoc.getPageIndices());
    copiedPages.forEach((page) => compressedDoc.addPage(page));
    
    // Save with object streams compression enabled
    let compressedBytes = await compressedDoc.save({
      useObjectStreams: true,
    });
    
    let compressedSize = compressedBytes.length;
    const LIMIT_BYTES = 3.3 * 1024 * 1024;
    
    // If S3 is active, we completely avoid lossy rasterization. 
    // Lossless is 100% safe, so if it is smaller than original, we return it. Otherwise we return the original.
    if (s3Available) {
      if (compressedSize < originalSize) {
        const compressedFile = new File([compressedBytes], file.name, {
          type: "application/pdf",
        });
        return { file: compressedFile, originalSize, compressedSize, success: true };
      } else {
        return { file, originalSize, compressedSize: originalSize, success: true };
      }
    }

    // If lossless optimization brings it under the limit (for database fallback), return immediately
    if (compressedSize <= LIMIT_BYTES) {
      const compressedFile = new File([compressedBytes], file.name, {
        type: "application/pdf",
      });
      return { file: compressedFile, originalSize, compressedSize, success: true };
    }
    
    // If lossless is not enough and we have no S3, perform raster image compression (lossy fallback for scanned files)
    console.log("Lossless optimization insufficient. Running browser raster JPEG compression...");
    
    // Dynamically import PDF.js to avoid SSR/prerender errors during Next.js build
    const pdfjs = (await import("pdfjs-dist")) as any;
    pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/6.0.227/pdf.worker.min.mjs`;
    
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    
    // Define descending tiers of compression settings based on page count with higher quality setting for legibility
    interface CompressionTier {
      scale: number;
      quality: number;
    }
    
    let tiers: CompressionTier[] = [];
    
    // Resolution before quality. Dropping the scale blurs the digits themselves, which no
    // encoder can put back, whereas JPEG quality on a greyscale page of black-on-white
    // degrades gently. The earlier tiers did the opposite — scale 0.75 at quality 0.35 —
    // and that is why the sheets came out unreadable. Each list starts where a page is
    // comfortably legible and steps down only if the file will not fit.
    if (numPages > 15) {
      tiers = [
        { scale: 1.25, quality: 0.62 },
        { scale: 1.1, quality: 0.52 },
        { scale: 0.95, quality: 0.45 },
        { scale: 0.85, quality: 0.4 },
      ];
    } else if (numPages > 5) {
      tiers = [
        { scale: 1.5, quality: 0.68 },
        { scale: 1.3, quality: 0.58 },
        { scale: 1.1, quality: 0.48 },
        { scale: 0.95, quality: 0.42 },
      ];
    } else {
      tiers = [
        { scale: 1.8, quality: 0.75 },
        { scale: 1.5, quality: 0.65 },
        { scale: 1.25, quality: 0.55 },
        { scale: 1.05, quality: 0.45 },
      ];
    }
    
    let finalBytes = new Uint8Array();
    let finalSize = originalSize;
    let success = false;
    
    for (let attempt = 0; attempt < tiers.length; attempt++) {
      const { scale: currentScale, quality: currentQuality } = tiers[attempt];
      if (onProgress) {
        onProgress(`Optimization attempt ${attempt + 1}/${tiers.length} (scale: ${currentScale.toFixed(2)}, quality: ${currentQuality.toFixed(2)})...`);
      }
      
      try {
        finalBytes = await renderRasterPdf(pdf, currentScale, currentQuality, onProgress);
        finalSize = finalBytes.length;
        
        console.log(`Attempt ${attempt + 1} produced size: ${(finalSize / (1024 * 1024)).toFixed(2)} MB`);
        
        if (finalSize <= LIMIT_BYTES) {
          success = true;
          break;
        }
      } catch (err) {
        console.error(`Attempt ${attempt + 1} failed:`, err);
      }
    }
    
    if (finalBytes.length > 0) {
      const compressedFile = new File([finalBytes], file.name, {
        type: "application/pdf",
      });
      return { file: compressedFile, originalSize, compressedSize: finalSize, success };
    }
  } catch (error) {
    console.error("Client-side PDF compression failed:", error);
  }
  return { file, originalSize, compressedSize: originalSize, success: false };
};

export default function ComponentDocumentsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { isAdmin } = getClientRoleInfo(session);

  // Stats Metrics
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<UploadedDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // View settings
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Filter states
  const [filterComponentType, setFilterComponentType] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Sort states
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Upload form states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadYear, setUploadYear] = useState<string>(
    new Date().getFullYear().toString()
  );
  const [selectedComponentTypes, setSelectedComponentTypes] = useState<string[]>(["LABOUR"]);
  
  const toggleComponentType = (type: string) => {
    setSelectedComponentTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);
  const [isProvisionalUpload, setIsProvisionalUpload] = useState<boolean>(true);
  const [uploadRemarks, setUploadRemarks] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [storageStatus, setStorageStatus] = useState<{
    s3Available: boolean;
    message: string;
    diagnostics?: {
      initError: string | null;
      bucketSetVia: string[];
      endpointSetVia: string[];
      regionSetVia: string[];
      credentialsSetVia: string[];
      endpointLooksRight: boolean | null;
      bucket: { value: string; from: string } | null;
      region: { value: string; from: string } | null;
      overriddenBucket: { value: string; from: string } | null;
      overriddenRegion: { value: string; from: string } | null;
    };
  } | null>(null);
  const [connectionTest, setConnectionTest] = useState<{
    ok: boolean;
    failedAt?: string;
    errorCode?: string;
    errorMessage?: string;
    hint?: string;
  } | null>(null);
  const [isTestingStorage, setIsTestingStorage] = useState(false);

  /**
   * Put a real file in the bucket and take it out again.
   *
   * Being configured only means the variables can be read. It does not mean the bucket
   * exists or that storage will accept us, and the upload URL is worked out offline, so
   * neither problem shows up until a sheet is already being sent.
   */
  const testStorageConnection = async () => {
    setIsTestingStorage(true);
    setConnectionTest(null);
    try {
      const res = await fetch('/api/labour-index/presigned-url?test=1');
      const data = await res.json();
      setConnectionTest(data.connection ?? { ok: false, errorMessage: 'No result came back.' });
      if (data.connection?.ok) toast.success('Storage is working — a test file went up and came back.');
    } catch (err: any) {
      setConnectionTest({ ok: false, errorMessage: String(err?.message || err) });
    } finally {
      setIsTestingStorage(false);
    }
  };

  /** The reason storage is off, in words, from which variables are actually present. */
  const storageProblem = (() => {
    const d = storageStatus?.diagnostics;
    if (!storageStatus || storageStatus.s3Available || !d) return null;
    if (d.bucketSetVia.length === 0) return 'No bucket name is set (SUPABASE_STORAGE_BUCKET).';
    if (d.endpointSetVia.length === 0) return 'No endpoint is set (SUPABASE_S3_ENDPOINT).';
    if (d.endpointLooksRight === false) return 'The endpoint is missing its /storage/v1/s3 path.';
    if (d.credentialsSetVia.length < 2) return 'The access key or the secret is missing.';
    if (d.initError) return d.initError;
    return 'Set, but the connection could not be made. Check the values and redeploy.';
  })();

  // Asked once on load, so the answer is on the screen before anything is uploaded
  // rather than discovered afterwards from the quality of the result.
  useEffect(() => {
    fetch('/api/labour-index/presigned-url')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && typeof d.s3Available === 'boolean') setStorageStatus(d); })
      .catch(() => { /* the badge simply does not appear */ });
  }, []);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  // Edit dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<UploadedDocument | null>(null);
  const [editMonths, setEditMonths] = useState<number[]>([]);
  const [editRemarks, setEditRemarks] = useState<string>("");
  const [isUpdating, setIsUpdating] = useState(false);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 2020 + 1 }, (_, i) => 2020 + i).reverse();

  useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.push("/auth/signin");
      return;
    }
    if (!isAdmin) {
      router.push("/indices");
      return;
    }
  }, [session, status, router, isAdmin]);

  const fetchDocuments = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/labour-index/list`);
      const data = await handleApiResponse(response, "Failed to load documents");
      setDocuments(data.documents);
    } catch (error) {
      console.error("Error fetching documents:", error);
      toast.error(error instanceof Error ? error.message : "Failed to load documents");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session && isAdmin) {
      fetchDocuments();
    }
  }, [session, isAdmin, fetchDocuments]);

  const applyFiltersAndSort = useCallback(() => {
    let filtered = [...documents];

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(doc => 
        doc.fileName.toLowerCase().includes(query) ||
        doc.user.name?.toLowerCase().includes(query) ||
        doc.user.email.toLowerCase().includes(query) ||
        doc.remarks?.toLowerCase().includes(query)
      );
    }

    // Apply component type filter
    if (filterComponentType !== "all") {
      filtered = filtered.filter(doc => doc.componentType === filterComponentType);
    }

    // Apply year filter
    if (filterYear !== "all") {
      filtered = filtered.filter(doc => doc.year === parseInt(filterYear));
    }

    // Apply status filter
    if (filterStatus !== "all") {
      const showProvisional = filterStatus === "provisional";
      filtered = filtered.filter(doc => doc.isProvisional === showProvisional);
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
  }, [documents, searchQuery, filterComponentType, filterYear, filterStatus, sortField, sortOrder]);

  useEffect(() => {
    applyFiltersAndSort();
  }, [applyFiltersAndSort]);

  const toggleMonth = (month: number) => {
    setSelectedMonths(prev =>
      prev.includes(month)
        ? prev.filter(m => m !== month)
        : [...prev, month].sort((a, b) => a - b)
    );
  };

  const selectAllMonths = () => setSelectedMonths(MONTHS.map(m => m.value));
  const deselectAllMonths = () => setSelectedMonths([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        toast.error("Please upload a PDF document");
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("Please select a file to upload");
      return;
    }
    if (selectedMonths.length === 0) {
      toast.error("Please select at least one month");
      return;
    }
    if (selectedComponentTypes.length === 0) {
      toast.error("Please select at least one component type");
      return;
    }

    try {
      setIsUploading(true);
      
      let fileToUpload = selectedFile;
      const LIMIT_MB = 3.3;
      const LIMIT_BYTES = LIMIT_MB * 1024 * 1024;
      
      // Step 1: Check if S3 is active by generating a presigned URL
      let presignedUrl = "";
      let cloudStoragePath = "";
      let s3Available = false;

      const presignedToastId = toast.loading("Checking storage configuration...");
      try {
        const checkRes = await fetch("/api/labour-index/presigned-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: selectedFile.name,
            // Signed and sent as the same fixed type. The upload is signed before the
            // file is compressed, and the signature covers the content type, so taking it
            // from the original here and from the rebuilt file at upload time would let
            // the two drift apart and be refused.
            fileType: UPLOAD_CONTENT_TYPE,
            componentTypes: selectedComponentTypes,
            year: parseInt(uploadYear),
            months: selectedMonths,
          }),
        });

        const checkData = await checkRes.json().catch(() => ({}));
        if (checkRes.ok && checkData.s3Available) {
          presignedUrl = checkData.presignedUrl;
          cloudStoragePath = checkData.cloudStoragePath;
          s3Available = true;
        } else {
          // Say why. A failing check used to be swallowed — no else branch, no message —
          // so a 400 or a 500 here was indistinguishable from having no storage at all,
          // and the only symptom was a sheet compressed until the digits blurred.
          const reason = checkData.error || checkData.message || `storage check returned ${checkRes.status}`;
          console.warn('Cloud storage unavailable:', reason);
          toast.error(`Cloud storage not used: ${reason}`, { duration: 8000 });
        }
      } catch (err: any) {
        console.warn("Failed to check/generate presigned URL, using DB storage fallback:", err);
        toast.error(`Could not reach cloud storage: ${err?.message || 'request failed'}`, { duration: 8000 });
      } finally {
        toast.dismiss(presignedToastId);
      }

      // Step 2: Handle PDF compression/optimization
      if (selectedFile.size > LIMIT_BYTES) {
        const toastId = toast.loading("Optimizing PDF size client-side...");
        try {
          const optimization = await optimizeAndCompressPdf(selectedFile, s3Available, (msg) => {
            toast.loading(msg, { id: toastId });
          });
          
          if (optimization.success && optimization.file.size <= LIMIT_BYTES) {
            fileToUpload = optimization.file;
            const originalMB = (optimization.originalSize / (1024 * 1024)).toFixed(2);
            const compressedMB = (optimization.compressedSize / (1024 * 1024)).toFixed(2);
            toast.dismiss(toastId);
            toast.success(`PDF successfully optimized from ${originalMB} MB to ${compressedMB} MB`);
          } else {
            const finalMB = (optimization.compressedSize / (1024 * 1024)).toFixed(2);
            toast.dismiss(toastId);
            
            if (s3Available) {
              fileToUpload = optimization.file;
              toast.success(`PDF compression completed (${finalMB} MB). Uploading directly to cloud storage...`);
            } else {
              toast.error(
                `Vercel enforces a strict 4.5 MB request payload limit. Your file size is ${finalMB} MB (after browser optimization). Please compress your PDF using an online tool (e.g. Smallpdf) to get it below 3.3 MB before uploading.`,
                { duration: 10000 }
              );
              setIsUploading(false);
              return;
            }
          }
        } catch (compressErr) {
          console.error("Compression failed:", compressErr);
          toast.dismiss(toastId);
          if (!s3Available) {
            toast.error("Compression failed. Raw file is too large for database storage.");
            setIsUploading(false);
            return;
          }
        }
      }

      // Step 3: Upload the file
      if (s3Available && presignedUrl) {
        const uploadToastId = toast.loading("Uploading document directly to Amazon S3...");
        try {
          const s3UploadRes = await fetch(presignedUrl, {
            method: "PUT",
            headers: {
              "Content-Type": UPLOAD_CONTENT_TYPE,
            },
            body: fileToUpload,
          });

          if (!s3UploadRes.ok) {
            const errText = await s3UploadRes.text();
            throw new Error(`S3 upload failed: ${s3UploadRes.statusText} ${errText.substring(0, 100)}`);
          }
          toast.dismiss(uploadToastId);
          toast.success("Document uploaded to S3 successfully");
        } catch (s3Err: any) {
          console.error("S3 Direct upload failed, falling back to database upload:", s3Err);
          toast.dismiss(uploadToastId);
          // The actual reason, not just that it failed. A refused signature and a browser
          // blocking the request for CORS need completely different fixes, and "upload
          // failed" sends you looking at the file instead of at either of them.
          const detail = String(s3Err?.message || s3Err || '');
          const looksLikeCors = /failed to fetch|networkerror|load failed/i.test(detail);
          toast.error(
            looksLikeCors
              ? 'The browser blocked the upload to Supabase (CORS). The bucket has to allow uploads from this site.'
              : `Upload to storage refused: ${detail.slice(0, 160)}`,
            { duration: 12000 },
          );
          s3Available = false;

          if (fileToUpload.size > LIMIT_BYTES) {
            toast.error("File is too large for database fallback. Please reduce file size.");
            setIsUploading(false);
            return;
          }
        }
      }

      const formData = new FormData();
      formData.append("year", uploadYear);
      formData.append("months", JSON.stringify(selectedMonths));
      formData.append("componentTypes", JSON.stringify(selectedComponentTypes));

      if (s3Available && cloudStoragePath) {
        formData.append("cloudStoragePath", cloudStoragePath);
      } else {
        formData.append("file", fileToUpload);
      }

      const response = await fetch("/api/labour-index/upload", {
        method: "POST",
        body: formData,
      });

      const data = await handleApiResponse(response, "Upload failed");
      
      // Update provisional status or remarks for all created documents
      if (data.documents && Array.isArray(data.documents)) {
        for (const doc of data.documents) {
          if (isProvisionalUpload === false) {
            const updateRes = await fetch("/api/labour-index/update", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: doc.id, isProvisional: false, remarks: uploadRemarks.trim() || undefined })
            });
            await handleApiResponse(updateRes, "Failed to update provisional status");
          } else if (uploadRemarks.trim()) {
            const updateRes = await fetch("/api/labour-index/update", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: doc.id, remarks: uploadRemarks.trim() })
            });
            await handleApiResponse(updateRes, "Failed to save remarks");
          }
        }
      }

      toast.success("Document metadata registered successfully");
      
      // Reset form
      setSelectedFile(null);
      setSelectedMonths([]);
      setSelectedComponentTypes(["LABOUR"]);
      setUploadRemarks("");
      setUploadDialogOpen(false);
      fetchDocuments();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (documentId: string) => {
    if (!confirm("Are you sure you want to permanently delete this document?")) {
      return;
    }

    try {
      const response = await fetch(`/api/labour-index/delete?id=${documentId}`, {
        method: "DELETE",
      });

      await handleApiResponse(response, "Delete failed");

      toast.success("Document deleted successfully");
      fetchDocuments();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error(error instanceof Error ? error.message : "Delete failed");
    }
  };

  const handleToggleStatus = async (doc: UploadedDocument) => {
    try {
      const response = await fetch("/api/labour-index/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: doc.id, isProvisional: !doc.isProvisional }),
      });

      await handleApiResponse(response, "Failed to update status");

      toast.success(`Marked as ${!doc.isProvisional ? "Provisional" : "Final"}`);
      fetchDocuments();
    } catch (error) {
      console.error("Status update error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to update status");
    }
  };

  const handleEdit = (doc: UploadedDocument) => {
    setEditingDocument(doc);
    setEditMonths(doc.months);
    setEditRemarks(doc.remarks || "");
    setEditDialogOpen(true);
  };

  const toggleEditMonth = (month: number) => {
    setEditMonths(prev =>
      prev.includes(month)
        ? prev.filter(m => m !== month)
        : [...prev, month].sort((a, b) => a - b)
    );
  };

  const handleUpdate = async () => {
    if (!editingDocument) return;

    try {
      setIsUpdating(true);
      const response = await fetch("/api/labour-index/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingDocument.id,
          months: editMonths,
          remarks: editRemarks.trim() || null
        }),
      });

      await handleApiResponse(response, "Update failed");

      toast.success("Document updated successfully");
      setEditDialogOpen(false);
      fetchDocuments();
    } catch (error) {
      console.error("Update error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to update document");
    } finally {
      setIsUpdating(false);
    }
  };

  const getComponentLabel = (type: string) => {
    return COMPONENT_TYPES.find(c => c.value === type)?.label || type;
  };

  const getMonthsDisplay = (months: number[]) => {
    return months
      .sort((a, b) => a - b)
      .map(m => MONTHS.find(month => month.value === m)?.label.slice(0, 3))
      .join(", ");
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40" />;
    return sortOrder === "asc" ? 
      <ArrowUpDown className="ml-1 h-3.5 w-3.5 text-emerald-600" /> : 
      <ArrowUpDown className="ml-1 h-3.5 w-3.5 text-emerald-600 rotate-180" />;
  };

  // Stats Card Calculations
  const statsTotal = documents.length;
  const statsProvisional = documents.filter(d => d.isProvisional).length;
  const statsFinal = documents.filter(d => !d.isProvisional).length;
  const statsLatestYear = documents.length > 0 ? Math.max(...documents.map(d => d.year)) : currentYear;

  if (status === "loading" || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 pb-12">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        
        {/* Navigation & Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <BackButton href="/indices" />
            <div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                <FileText className="h-6 w-6 text-emerald-600" />
                Component Index Documents
              </h1>
              <p className="text-sm text-gray-500">
                Upload and manage index bulletins (Labour, Cement, Steel) embedded automatically in Bill PDFs
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Whether a sheet keeps its quality turns on this one fact, and the only way
                to find out used to be to upload something and watch the messages. */}
            {storageStatus && (
              <span
                className={`text-xs px-2.5 py-1.5 rounded-lg border ${
                  storageStatus.s3Available
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}
                title={storageStatus.message}
              >
                {storageStatus.s3Available
                  ? 'Cloud storage on — full quality'
                  : 'Cloud storage off — sheets get compressed'}
                {storageProblem && <span className="block font-normal opacity-90 mt-0.5">{storageProblem}</span>}
                {/* Diagnostics come back for admins only, so their presence is the cue. */}
                {storageStatus.diagnostics && (
                  <button
                    type="button"
                    onClick={testStorageConnection}
                    disabled={isTestingStorage}
                    className="block mt-1 underline font-normal opacity-90 hover:opacity-100 disabled:opacity-50"
                  >
                    {isTestingStorage ? 'Testing…' : 'Test storage now'}
                  </button>
                )}
                {connectionTest && (
                  <span className="block mt-1 font-normal">
                    {connectionTest.ok
                      ? '✓ A test file uploaded and read back fine.'
                      : `✗ Failed at ${connectionTest.failedAt ?? 'upload'}: ${connectionTest.errorCode ?? ''} ${connectionTest.errorMessage ?? ''}`}
                    {connectionTest.hint && <span className="block mt-0.5 opacity-90">{connectionTest.hint}</span>}
                  </span>
                )}
                {storageStatus.diagnostics?.bucket && (
                  <span className="block mt-1 font-normal opacity-75">
                    Bucket “{storageStatus.diagnostics.bucket.value}” (from {storageStatus.diagnostics.bucket.from})
                    {storageStatus.diagnostics.region
                      ? `, region ${storageStatus.diagnostics.region.value} (from ${storageStatus.diagnostics.region.from})`
                      : ', region not set'}
                  </span>
                )}
                {(storageStatus.diagnostics?.overriddenBucket || storageStatus.diagnostics?.overriddenRegion) && (
                  <span className="block mt-1 font-normal opacity-75">
                    Ignoring leftover{' '}
                    {[storageStatus.diagnostics.overriddenBucket?.from, storageStatus.diagnostics.overriddenRegion?.from]
                      .filter(Boolean)
                      .join(' and ')}
                    . Safe to delete in Vercel.
                  </span>
                )}
              </span>
            )}
            <Button onClick={() => setUploadDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm gap-2">
              <Upload className="h-4 w-4" />
              Upload Document
            </Button>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-gradient-to-r from-emerald-50 to-emerald-50 border border-emerald-100 rounded-xl p-4 flex gap-3 shadow-sm">
          <Info className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-emerald-900">Automatic PDF Attachment Flow</h4>
            <p className="text-xs text-emerald-800 leading-relaxed">
              When printing a PVC bill, the system searches these documents for matched components (e.g. Labour, Cement) and applicable billing calendar months. Matched index sheets are automatically appended to the final output PDF as supporting verification schedules.
            </p>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Documents", value: statsTotal, desc: "Uploaded index sheets", icon: FileText, color: "text-emerald-600 bg-emerald-100/50" },
            { label: "Provisional (P)", value: statsProvisional, desc: "Awaiting final bulletin", icon: FileCheck2, color: "text-amber-600 bg-amber-100/50" },
            { label: "Final Release", value: statsFinal, desc: "Verified records", icon: CheckCircle, color: "text-emerald-600 bg-emerald-100/50" },
            { label: "Active Year Range", value: statsLatestYear, desc: `Latest data uploaded`, icon: Calendar, color: "text-emerald-600 bg-emerald-100/50" },
          ].map((stat, idx) => (
            <Card key={idx} className="border border-gray-200/80 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`p-2.5 rounded-xl ${stat.color}`}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{stat.label}</p>
                  <p className="text-2xl font-black text-gray-900 font-mono mt-0.5">{stat.value}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{stat.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Explorer Card */}
        <Card className="border-gray-200 shadow-sm">
          <CardHeader className="pb-3 border-b space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg font-bold text-gray-900">Documents Explorer</CardTitle>
                <CardDescription className="text-xs">Browse, filter, and audit uploaded component records</CardDescription>
              </div>

              {/* View switches */}
              <div className="flex items-center bg-gray-100 rounded-lg p-0.5 self-start md:self-auto">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setViewMode("grid")}
                  className={`h-7 px-2.5 rounded-md text-xs gap-1.5 transition-colors ${viewMode === "grid" ? "bg-white text-gray-900 font-semibold shadow-sm" : "text-gray-500"}`}
                >
                  <Grid className="h-3.5 w-3.5" />
                  Grid
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setViewMode("table")}
                  className={`h-7 px-2.5 rounded-md text-xs gap-1.5 transition-colors ${viewMode === "table" ? "bg-white text-gray-900 font-semibold shadow-sm" : "text-gray-500"}`}
                >
                  <List className="h-3.5 w-3.5" />
                  Table
                </Button>
              </div>
            </div>

            {/* Tool bar & filters */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="relative md:col-span-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search file, remarks..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9 text-xs"
                />
              </div>

              {/* Component filter */}
              <Select value={filterComponentType} onValueChange={setFilterComponentType}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="All Components" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Components</SelectItem>
                  {COMPONENT_TYPES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Year filter */}
              <Select value={filterYear} onValueChange={setFilterYear}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="All Years" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {years.map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Status filter */}
              <div className="flex gap-2 flex-1">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="text-xs flex-1">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="provisional">Provisional</SelectItem>
                    <SelectItem value="final">Final</SelectItem>
                  </SelectContent>
                </Select>
                
                <Button variant="outline" size="icon" onClick={fetchDocuments} className="shrink-0">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-6">
            {filteredDocuments.length === 0 ? (
              <div className="text-center py-16 text-gray-400 space-y-3">
                <FileText className="h-12 w-12 mx-auto text-gray-300 stroke-1" />
                <div>
                  <p className="text-sm font-bold text-gray-700">No documents found</p>
                  <p className="text-xs mt-0.5">Try adjusting your filters or upload a new component document.</p>
                </div>
              </div>
            ) : viewMode === "grid" ? (
              
              /* Grid View Mode */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredDocuments.map(doc => {
                  const downloadUrl = `/api/public/uploads?key=${encodeURIComponent(doc.cloudStoragePath)}`;
                  return (
                    <div 
                      key={doc.id}
                      className="group bg-white border border-gray-200/80 rounded-xl p-5 hover:border-emerald-300 hover:shadow-md transition-all duration-300 flex flex-col justify-between relative"
                    >
                      <div>
                        {/* Upper Badge Line */}
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-100 font-bold px-2 py-0.5 text-[10px]">
                            {getComponentLabel(doc.componentType)}
                          </Badge>
                          {doc.isProvisional ? (
                            <Badge className="bg-amber-50 text-amber-700 border-amber-200 font-bold text-[10px]">
                              Provisional (P)
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 font-bold text-[10px]">
                              Final
                            </Badge>
                          )}
                        </div>

                        {/* Title & Metadata */}
                        <div className="space-y-1">
                          <h4 className="font-bold text-gray-900 text-sm truncate" title={doc.fileName}>
                            {doc.fileName}
                          </h4>
                          <div className="flex items-center gap-1.5 text-xs text-gray-400 font-mono">
                            <span>Year:</span>
                            <span className="font-bold text-gray-700">{doc.year}</span>
                          </div>
                        </div>

                        {/* Months breakdown pills */}
                        <div className="flex flex-wrap gap-1 mt-3">
                          {doc.months.sort((a,b) => a-b).map(m => (
                            <span key={m} className="bg-gray-100 text-gray-600 rounded text-[10px] px-1.5 py-0.5 font-medium">
                              {MONTHS.find(month => month.value === m)?.label.slice(0, 3)}
                            </span>
                          ))}
                        </div>

                        {/* Remarks if any */}
                        {doc.remarks && (
                          <p className="text-xs text-gray-500 italic mt-3 bg-gray-50 border border-gray-100 p-2 rounded-lg line-clamp-2" title={doc.remarks}>
                            {doc.remarks}
                          </p>
                        )}
                      </div>

                      {/* Footer & Actions */}
                      <div className="border-t border-gray-100 pt-4 mt-5 flex items-center justify-between">
                        <div className="text-[10px] text-gray-400">
                          <p className="font-medium text-gray-600 truncate max-w-[120px]">{doc.user.name || doc.user.email}</p>
                          <p className="mt-0.5">{new Date(doc.createdAt).toLocaleDateString('en-IN')}</p>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <a 
                            href={downloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg border border-gray-200 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 text-gray-500 transition-colors"
                            title="View PDF Document"
                          >
                            <Eye className="h-4 w-4" />
                          </a>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleEdit(doc)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit Months/Remarks
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
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              
              /* Table View Mode */
              <div className="rounded-xl border overflow-hidden">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead>
                        <button onClick={() => handleSort("componentType")} className="flex items-center hover:text-gray-900 font-bold">
                          Component {getSortIcon("componentType")}
                        </button>
                      </TableHead>
                      <TableHead>
                        <button onClick={() => handleSort("year")} className="flex items-center hover:text-gray-900 font-bold">
                          Year {getSortIcon("year")}
                        </button>
                      </TableHead>
                      <TableHead>
                        <button onClick={() => handleSort("isProvisional")} className="flex items-center hover:text-gray-900 font-bold">
                          Status {getSortIcon("isProvisional")}
                        </button>
                      </TableHead>
                      <TableHead className="font-bold">Months</TableHead>
                      <TableHead className="font-bold">File Name</TableHead>
                      <TableHead className="font-bold">Uploaded By</TableHead>
                      <TableHead>
                        <button onClick={() => handleSort("createdAt")} className="flex items-center hover:text-gray-900 font-bold">
                          Created {getSortIcon("createdAt")}
                        </button>
                      </TableHead>
                      <TableHead className="text-right font-bold pr-4">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDocuments.map(doc => {
                      const downloadUrl = `/api/public/uploads?key=${encodeURIComponent(doc.cloudStoragePath)}`;
                      return (
                        <TableRow key={doc.id} className="hover:bg-gray-50/50">
                          <TableCell>
                            <Badge variant="outline" className="font-semibold bg-gray-50">
                              {getComponentLabel(doc.componentType)}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-bold">{doc.year}</TableCell>
                          <TableCell>
                            {doc.isProvisional ? (
                              <Badge className="bg-amber-50 text-amber-700 border-amber-100 font-medium">Provisional</Badge>
                            ) : (
                              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 font-medium">Final</Badge>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate" title={getMonthsDisplay(doc.months)}>
                            <div className="flex flex-wrap gap-1">
                              {doc.months.sort((a,b)=>a-b).slice(0, 3).map(m => (
                                <span key={m} className="bg-gray-100 text-gray-600 rounded text-[9px] px-1 py-0.5">
                                  {MONTHS.find(month => month.value === m)?.label.slice(0, 3)}
                                </span>
                              ))}
                              {doc.months.length > 3 && (
                                <span className="bg-gray-100 text-gray-500 rounded text-[9px] px-1 py-0.5">
                                  +{doc.months.length - 3}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[220px] truncate font-medium" title={doc.fileName}>
                            <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">
                              {doc.fileName}
                            </a>
                            {doc.remarks && <p className="text-[10px] text-gray-400 truncate mt-0.5">{doc.remarks}</p>}
                          </TableCell>
                          <TableCell className="text-xs text-gray-600">{doc.user.name || doc.user.email}</TableCell>
                          <TableCell className="text-xs font-mono text-gray-500">
                            {new Date(doc.createdAt).toLocaleDateString('en-IN')}
                          </TableCell>
                          <TableCell className="text-right pr-4">
                            <div className="flex justify-end gap-1.5">
                              <a 
                                href={downloadUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-emerald-600 transition-colors"
                              >
                                <Eye className="h-4 w-4" />
                              </a>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleEdit(doc)}>
                                    <Edit className="h-4 w-4 mr-2" />
                                    Edit Details
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleToggleStatus(doc)}>
                                    {doc.isProvisional ? "Mark as Final" : "Mark as Provisional"}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => handleDelete(doc.id)} className="text-red-600">
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* --- Upload Dialog --- */}
        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-emerald-600" />
                Upload Index Document
              </DialogTitle>
              <DialogDescription>
                Attach index sheets/bulletins. They are verified and appended automatically to generated Bill PDFs based on calendar months.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-5 py-4">
              
              {/* Drag & Drop File Container */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">PDF File</Label>
                <div
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-300 ${
                    dragActive ? "border-emerald-500 bg-emerald-50/50" : "border-gray-200 hover:border-emerald-400 bg-gray-50/30"
                  }`}
                  onDragEnter={() => setDragActive(true)}
                  onDragLeave={() => setDragActive(false)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    const file = e.dataTransfer.files?.[0];
                    const isPdf = file && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
                    if (file && isPdf) {
                      setSelectedFile(file);
                    } else {
                      toast.error("Please upload a PDF file");
                    }
                  }}
                  onClick={() => document.getElementById("file-input")?.click()}
                >
                  <input
                    id="file-input"
                    type="file"
                    accept=".pdf"
                    onChange={handleFileChange}
                    onClick={(e) => e.stopPropagation()}
                    className="hidden"
                  />
                  {selectedFile ? (
                    <div className="flex flex-col items-center">
                      <FileCheck2 className="h-10 w-10 text-green-500 mb-2 animate-bounce" />
                      <p className="text-sm font-bold text-gray-800 truncate max-w-[400px]">{selectedFile.name}</p>
                      <p className="text-xs text-gray-400 mt-1">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Click to replace</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <Upload className="h-10 w-10 text-emerald-500 mb-2" />
                      <p className="text-sm font-bold text-gray-700">Drag & drop your PDF document here, or browse</p>
                      <p className="text-xs text-gray-400 mt-1">PDF format only (Max 100MB)</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Component selection grid with shortcuts */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Components</Label>
                  <div className="flex gap-2">
                    <button 
                      type="button" 
                      onClick={() => setSelectedComponentTypes(["TMT_BARS", "ANGLE_CHANNEL", "PLATES", "OTHER_SECTIONS"])} 
                      className="text-[10px] text-emerald-600 hover:underline font-bold"
                    >
                      Select All Steel
                    </button>
                    <span className="text-gray-300 text-[10px]">|</span>
                    <button 
                      type="button" 
                      onClick={() => setSelectedComponentTypes(COMPONENT_TYPES.map(c => c.value))} 
                      className="text-[10px] text-emerald-600 hover:underline font-bold"
                    >
                      Select All
                    </button>
                    <span className="text-gray-300 text-[10px]">|</span>
                    <button 
                      type="button" 
                      onClick={() => setSelectedComponentTypes([])} 
                      className="text-[10px] text-emerald-600 hover:underline font-bold"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 bg-gray-50/50 border rounded-xl p-3 max-h-[160px] overflow-y-auto">
                  {COMPONENT_TYPES.map(c => {
                    const isSelected = selectedComponentTypes.includes(c.value);
                    return (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => toggleComponentType(c.value)}
                        className={`py-1.5 px-3 text-left text-xs font-semibold rounded-lg border transition-all duration-200 flex items-center justify-between ${
                          isSelected
                            ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                            : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <span className="truncate mr-1">{c.label}</span>
                        {isSelected && <CheckCircle className="h-4 w-4 text-white shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Year Selection */}
              <div className="space-y-2">
                <Label htmlFor="uploadYear" className="text-xs font-bold text-gray-500 uppercase tracking-wider">Year</Label>
                <Select value={uploadYear} onValueChange={setUploadYear}>
                  <SelectTrigger id="uploadYear">
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map(y => (
                      <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Month Pills Selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Applicable Months</Label>
                  <div className="flex gap-2">
                    <button type="button" onClick={selectAllMonths} className="text-[10px] text-emerald-600 hover:underline font-semibold">Select All</button>
                    <span className="text-gray-300 text-[10px]">|</span>
                    <button type="button" onClick={deselectAllMonths} className="text-[10px] text-emerald-600 hover:underline font-semibold">Clear All</button>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 bg-gray-50/50 border rounded-xl p-3">
                  {MONTHS.map(m => {
                    const isSelected = selectedMonths.includes(m.value);
                    return (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => toggleMonth(m.value)}
                        className={`py-1.5 text-xs font-bold rounded-lg border transition-all duration-200 ${
                          isSelected
                            ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                            : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {m.label.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Release Type (Provisional vs Final) */}
              <div className="flex items-center justify-between border border-gray-200 rounded-xl p-3 bg-gray-50/20">
                <div className="space-y-0.5">
                  <Label htmlFor="provisionalUpload" className="text-sm font-bold text-gray-800">Provisional Document</Label>
                  <p className="text-xs text-gray-500">Enable if this is a temporary/unverified bulletin release</p>
                </div>
                <Checkbox 
                  id="provisionalUpload" 
                  checked={isProvisionalUpload} 
                  onCheckedChange={c => setIsProvisionalUpload(!!c)} 
                  className="h-5 w-5 border-gray-300"
                />
              </div>

              {/* Remarks */}
              <div className="space-y-2">
                <Label htmlFor="uploadRemarks" className="text-xs font-bold text-gray-500 uppercase tracking-wider">Remarks (Optional)</Label>
                <Textarea
                  id="uploadRemarks"
                  placeholder="E.g., CPI-IW series linkage factors details..."
                  value={uploadRemarks}
                  onChange={e => setUploadRemarks(e.target.value)}
                  rows={2}
                  className="text-xs"
                />
              </div>

            </div>

            <DialogFooter className="border-t pt-4">
              <Button variant="outline" onClick={() => setUploadDialogOpen(false)} disabled={isUploading}>
                Cancel
              </Button>
              <Button 
                onClick={handleUpload} 
                disabled={isUploading || !selectedFile || selectedMonths.length === 0 || selectedComponentTypes.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  "Upload File"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* --- Edit Dialog --- */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Document Details</DialogTitle>
              <DialogDescription>Update applicable months and remarks for this index file</DialogDescription>
            </DialogHeader>

            {editingDocument && (
              <div className="grid gap-5 py-4">
                
                {/* Meta details */}
                <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
                  <div>
                    <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Component</Label>
                    <p className="text-sm font-bold text-gray-700 mt-0.5">{getComponentLabel(editingDocument.componentType)}</p>
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Year</Label>
                    <p className="text-sm font-bold text-gray-700 mt-0.5">{editingDocument.year}</p>
                  </div>
                </div>

                {/* Month selection */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Applicable Months</Label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setEditMonths(MONTHS.map(m=>m.value))} className="text-[10px] text-emerald-600 hover:underline font-semibold">Select All</button>
                      <span className="text-gray-300 text-[10px]">|</span>
                      <button type="button" onClick={() => setEditMonths([])} className="text-[10px] text-emerald-600 hover:underline font-semibold">Clear All</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 bg-gray-50/50 border rounded-xl p-3">
                    {MONTHS.map(m => {
                      const isSelected = editMonths.includes(m.value);
                      return (
                        <button
                          key={m.value}
                          type="button"
                          onClick={() => toggleEditMonth(m.value)}
                          className={`py-1.5 text-xs font-bold rounded-lg border transition-all duration-200 ${
                            isSelected
                              ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                              : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          {m.label.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Remarks */}
                <div className="space-y-2">
                  <Label htmlFor="editRemarks" className="text-xs font-bold text-gray-500 uppercase tracking-wider">Remarks (Optional)</Label>
                  <Textarea
                    id="editRemarks"
                    placeholder="Enter document remarks..."
                    value={editRemarks}
                    onChange={e => setEditRemarks(e.target.value)}
                    rows={3}
                  />
                </div>

              </div>
            )}

            <DialogFooter className="border-t pt-4">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={isUpdating}>
                Cancel
              </Button>
              <Button 
                onClick={handleUpdate} 
                disabled={isUpdating || editMonths.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}
