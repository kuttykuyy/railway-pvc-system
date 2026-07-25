"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { BackButton } from "@/components/ui/back-button";
import ProvisionalToggle from "@/components/settings/provisional-toggle";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, RefreshCcw, ChevronLeft, ChevronRight, Download, Globe, Upload, FileText, Loader2, ShieldCheck, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { getClientRoleInfo } from "@/lib/role-auth-client";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Non-steel indices (always shown)
const NON_STEEL_COLUMNS = [
  { key: "labour", name: "Labour", dbName: "Labour" },
  { key: "mpngFuel", name: "Fuel", dbName: "MPNG Fuel" },
  { key: "rbiCite", name: "Cement", dbName: "RBI Cement" },
  { key: "rbiExplosives", name: "Expl.", dbName: "RBI Explosives" },
  { key: "rbiOtherMaterials", name: "Mat.", dbName: "RBI Other Materials" },
  { key: "rbiPlantMachinery", name: "Plant", dbName: "RBI Plant Machinery" },
];

// Steel columns per city
const STEEL_CITIES = ['Default', 'Delhi', 'Mumbai', 'Chennai', 'Kolkata'] as const;
type SteelCity = typeof STEEL_CITIES[number];

const STEEL_TYPES = [
  { baseKey: "steelTMTBars", name: "TMT", baseDbName: "Steel TMT Bars" },
  { baseKey: "steelAngleChannel", name: "Angle", baseDbName: "Steel Angle/Channel" },
  { baseKey: "steelPlates", name: "Plates", baseDbName: "Steel Plates" },
  { baseKey: "steelOtherSections", name: "Other", baseDbName: "Steel Other Sections" },
];

function getSteelColumnsForCity(city: SteelCity) {
  if (city === 'Default') {
    return STEEL_TYPES.map(st => ({
      key: st.baseKey,
      name: st.name,
      dbName: st.baseDbName,
    }));
  }
  return STEEL_TYPES.map(st => ({
    key: `${st.baseKey}_${city}`,
    name: st.name,
    dbName: `${st.baseDbName} - ${city}`,
  }));
}

function getAllSteelColumns() {
  const cols: { key: string; name: string; dbName: string; city: SteelCity }[] = [];
  for (const city of STEEL_CITIES) {
    getSteelColumnsForCity(city).forEach(col => {
      cols.push({ ...col, city });
    });
  }
  return cols;
}

// Legacy INDEX_COLUMNS kept for Add dialog and steel import compatibility
const INDEX_COLUMNS = [
  { key: "labour", name: "Labour", dbName: "Labour" },
  { key: "mpngFuel", name: "Fuel", dbName: "MPNG Fuel" },
  { key: "rbiCite", name: "Cement", dbName: "RBI Cement" },
  { key: "steelTMTBars", name: "TMT", dbName: "Steel TMT Bars" },
  { key: "steelAngleChannel", name: "Angle", dbName: "Steel Angle/Channel" },
  { key: "steelPlates", name: "Plates", dbName: "Steel Plates" },
  { key: "steelOtherSections", name: "Other", dbName: "Steel Other Sections" },
  { key: "rbiExplosives", name: "Expl.", dbName: "RBI Explosives" },
  { key: "rbiOtherMaterials", name: "Mat.", dbName: "RBI Other Materials" },
  { key: "rbiPlantMachinery", name: "Plant", dbName: "RBI Plant Machinery" },
];

interface MonthRow {
  month: string;
  monthIndex: number;
  [key: string]: any;
}

export default function SpreadsheetPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { isAdmin } = getClientRoleInfo(session);

  const [year, setYear] = useState(new Date().getFullYear());
  // Current "Allow Provisional Indices" setting — loaded so the toggle shows its real state.
  const [allowProvisional, setAllowProvisional] = useState<boolean | null>(null);
  const [data, setData] = useState<MonthRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [priceIndices, setPriceIndices] = useState<any[]>([]);
  
  // Add dialog state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addMonth, setAddMonth] = useState("");
  const [addIndex, setAddIndex] = useState("");
  const [addValue, setAddValue] = useState("");
  const [addProvisional, setAddProvisional] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // WPI import state
  const [isImportingWPI, setIsImportingWPI] = useState(false);
  const [wpiPreview, setWpiPreview] = useState<any>(null);
  const [showWPIDialog, setShowWPIDialog] = useState(false);
  
  // Labour import state
  const [showLabourDialog, setShowLabourDialog] = useState(false);
  const [labourCSV, setLabourCSV] = useState("");
  const [labourPreview, setLabourPreview] = useState<any>(null);
  const [isImportingLabour, setIsImportingLabour] = useState(false);
  
  // Steel (JPC) import state
  const [showSteelDialog, setShowSteelDialog] = useState(false);
  const [steelMonth, setSteelMonth] = useState<string>("");
  const [steelInputType, setSteelInputType] = useState<"manual" | "excel">("excel");
  const [steelManualData, setSteelManualData] = useState({
    tmt: "",
    angleChannel: "",
    plates: "",
    otherSections: ""
  });
  
  // Excel-style multi-entry steel data matching exact Excel template format
  const [steelExcelData, setSteelExcelData] = useState({
    // TMT Bars: 10mm and 25mm with 2 fortnights each
    tmt: {
      mm10_f1: "", mm10_f2: "",
      mm25_f1: "", mm25_f2: ""
    },
    // Angle/Channel: ISA 75x6, MS plate-10mm, ISMC 150x75 with 2 fortnights each
    angleChannel: {
      isa75_f1: "", isa75_f2: "",
      msPlate10_f1: "", msPlate10_f2: "",
      ismc150_f1: "", ismc150_f2: ""
    },
    // Plates: MS Plate-10mm and MS Plate-25mm with 2 fortnights each
    plates: {
      msPlate10_f1: "", msPlate10_f2: "",
      msPlate25_f1: "", msPlate25_f2: ""
    },
    // Other Sections: simple 2 fortnights
    otherSections: {
      fortnight1: "",
      fortnight2: ""
    }
  });
  const [steelPreview, setSteelPreview] = useState<any>(null);
  const [isImportingSteel, setIsImportingSteel] = useState(false);
  
  // Provisional toggle state
  const [togglingCol, setTogglingCol] = useState<string | null>(null);
  
  // Steel detail popover state
  const [steelPopover, setSteelPopover] = useState<{
    month: string;
    colName: string;
    city: string;
    value: number;
    detail: any;
    rect: { top: number; left: number };
  } | null>(null);
  
  // Steel city view state
  const [steelCityView, setSteelCityView] = useState<'all' | SteelCity>('Default');
  
  // PDF extraction state

  useEffect(() => {
    fetch('/api/settings/provisional-indices')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && typeof d.value === 'boolean') setAllowProvisional(d.value); })
      .catch(() => {});
  }, []);

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

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/indices/yearly-view?year=${year}`);
      const result = await response.json();

      if (result.data) {
        // Build the full list of all column keys to extract from API response
        const allColumnKeys = [
          ...INDEX_COLUMNS.map(c => c.key),
          // City-specific steel columns
          ...getAllSteelColumns().map(c => c.key),
        ];
        // Deduplicate
        const uniqueKeys = Array.from(new Set(allColumnKeys));
        
        const rows: MonthRow[] = MONTHS.map((month, idx) => {
          const apiRow = result.data.find((r: any) => r.month === month) || {};
          const row: MonthRow = { month, monthIndex: idx };
          
          uniqueKeys.forEach(key => {
            const cellData = apiRow[key];
            row[key] = cellData ? {
              id: cellData.id ?? null,
              value: cellData.value,
              isProvisional: cellData.isProvisional ?? false,
              formula: cellData.formula ?? null,
              steelDetail: cellData.steelDetail ?? null,
            } : { id: null, value: null, isProvisional: false, formula: null, steelDetail: null };
          });
          
          return row;
        });
        setData(rows);
      }

      const indicesRes = await fetch("/api/indices");
      const indicesData = await indicesRes.json();
      // API returns array directly, not { indices: [...] }
      if (Array.isArray(indicesData)) {
        setPriceIndices(indicesData);
      } else if (indicesData.indices) {
        setPriceIndices(indicesData.indices);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [year]);

  useEffect(() => {
    if (session && isAdmin) {
      fetchData();
    }
  }, [session, isAdmin, fetchData]);

  const getMonthDateString = (monthName: string) => {
    const monthIdx = MONTHS.indexOf(monthName);
    if (monthIdx === -1) return "";
    return `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`;
  };

  const handleDeleteCell = async (monthName: string, colKey: string, cellId?: string | null) => {
    const monthStr = getMonthDateString(monthName);
    if (!monthStr) return;

    const col = [...NON_STEEL_COLUMNS, ...getAllSteelColumns()].find(c => c.key === colKey);
    if (!col) {
      toast.error("Invalid column");
      return;
    }

    const priceIndex = priceIndices.find(p => p.name === col.dbName);
    const priceIndexId = priceIndex?.id;

    if (!priceIndexId) {
      toast.error(`Index details not found for ${col.dbName}`);
      return;
    }

    const confirmDelete = window.confirm(`Are you sure you want to delete the ${col.name} index value for ${monthName} ${year}?`);
    if (!confirmDelete) return;

    try {
      let url = "/api/indices/monthly";
      let options: any = {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceIndexId, month: monthStr })
      };

      if (cellId) {
        url = `/api/indices/monthly/${cellId}`;
        options = {
          method: "DELETE"
        };
      }

      const response = await fetch(url, options);
      if (response.ok) {
        toast.success("Index value deleted successfully");
        fetchData();
      } else {
        const err = await response.json();
        toast.error(err.error || "Failed to delete index value");
      }
    } catch (err) {
      toast.error("Failed to delete index value");
    }
  };

  const handleDeleteRow = async (monthName: string) => {
    const monthStr = getMonthDateString(monthName);
    if (!monthStr) return;

    const confirmDelete = window.confirm(`Are you sure you want to delete ALL price indices for ${monthName} ${year}? This will clear the entire row.`);
    if (!confirmDelete) return;

    try {
      const response = await fetch("/api/indices/monthly", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: monthStr, deleteEntireRow: true })
      });
      if (response.ok) {
        toast.success(`Successfully cleared all index values for ${monthName} ${year}`);
        fetchData();
      } else {
        const err = await response.json();
        toast.error(err.error || "Failed to delete row values");
      }
    } catch (err) {
      toast.error("Failed to delete row values");
    }
  };

  const handleAddEntry = async () => {
    if (!addMonth || !addIndex || !addValue) {
      toast.error("Please fill all fields");
      return;
    }

    const numValue = parseFloat(addValue);
    if (isNaN(numValue)) {
      toast.error("Invalid value");
      return;
    }

    const col = INDEX_COLUMNS.find(c => c.key === addIndex);
    if (!col) {
      toast.error("Invalid index");
      return;
    }

    const priceIndex = priceIndices.find(p => p.name === col.dbName);
    if (!priceIndex) {
      toast.error(`Index not found: ${col.dbName}`);
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/indices/monthly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceIndexId: priceIndex.id,
          month: addMonth,
          value: numValue,
          isProvisional: addProvisional,
        }),
      });

      if (response.ok) {
        toast.success("Entry added successfully");
        setShowAddDialog(false);
        setAddMonth("");
        setAddIndex("");
        setAddValue("");
        setAddProvisional(false);
        fetchData();
      } else {
        const err = await response.json();
        toast.error(err.error || "Failed to add entry");
      }
    } catch (error) {
      toast.error("Failed to add entry");
    } finally {
      setIsSaving(false);
    }
  };

  // WPI Import handlers
  const handleFetchWPIPreview = async () => {
    try {
      setIsImportingWPI(true);
      const response = await fetch('/api/indices/wpi-import');
      const data = await response.json();
      
      if (data.success) {
        setWpiPreview(data);
        setShowWPIDialog(true);
      } else {
        toast.error(data.error || 'Failed to fetch WPI data');
      }
    } catch (error) {
      toast.error('Failed to fetch WPI preview');
    } finally {
      setIsImportingWPI(false);
    }
  };

  const handleImportWPI = async (isProvisional: boolean = false) => {
    try {
      setIsImportingWPI(true);
      const response = await fetch('/api/indices/wpi-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isProvisional })
      });
      const data = await response.json();
      
      if (data.success) {
        const provisionalNote = isProvisional ? ' (latest 2 months marked provisional, older records unchanged)' : '';
        toast.success(`Updated ${data.updated} WPI values${provisionalNote}`);
        setShowWPIDialog(false);
        setWpiPreview(null);
        fetchData();
      } else {
        toast.error(data.error || 'Failed to import WPI data');
      }
    } catch (error) {
      toast.error('Failed to import WPI data');
    } finally {
      setIsImportingWPI(false);
    }
  };

  // Labour Index Import handlers
  const handleLabourCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setLabourCSV(content);
      };
      reader.readAsText(file);
    }
  };

  const handleLabourPreview = async () => {
    if (!labourCSV) {
      toast.error('Please upload a CSV file first');
      return;
    }
    try {
      setIsImportingLabour(true);
      const response = await fetch('/api/indices/labour-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvContent: labourCSV, action: 'preview' })
      });
      const data = await response.json();
      
      if (data.success) {
        setLabourPreview(data);
      } else {
        toast.error(data.error || 'Failed to parse Labour CSV');
      }
    } catch (error) {
      toast.error('Failed to parse Labour data');
    } finally {
      setIsImportingLabour(false);
    }
  };

  const handleImportLabour = async (isProvisional: boolean = false) => {
    if (!labourCSV) {
      toast.error('Please upload a CSV file first');
      return;
    }
    try {
      setIsImportingLabour(true);
      const response = await fetch('/api/indices/labour-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvContent: labourCSV, action: 'import', isProvisional })
      });
      const data = await response.json();
      
      if (data.success) {
        toast.success(`Labour index: ${data.result.created} created, ${data.result.updated} updated`);
        setShowLabourDialog(false);
        setLabourPreview(null);
        setLabourCSV("");
        fetchData();
      } else {
        toast.error(data.error || 'Failed to import Labour data');
      }
    } catch (error) {
      toast.error('Failed to import Labour data');
    } finally {
      setIsImportingLabour(false);
    }
  };

  // JPC PDF extraction handler

  // Calculate average of F1 and F2 for a single item
  const calculateItemAverage = (f1: string, f2: string): number => {
    const v1 = parseFloat(f1);
    const v2 = parseFloat(f2);
    if (isNaN(v1) && isNaN(v2)) return 0;
    if (isNaN(v1)) return v2;
    if (isNaN(v2)) return v1;
    return Math.round((v1 + v2) / 2);
  };

  // Calculate final average from item averages
  const calculateFinalAverage = (itemAverages: number[]): number => {
    const validAverages = itemAverages.filter(v => v > 0);
    if (validAverages.length === 0) return 0;
    const sum = validAverages.reduce((acc, val) => acc + val, 0);
    return Math.round(sum / validAverages.length);
  };
  
  // Get all steel averages for display
  const getSteelAverages = () => {
    // TMT: First calculate (F1+F2)/2 for each size, then average of both sizes
    const tmt10mmAvg = calculateItemAverage(steelExcelData.tmt.mm10_f1, steelExcelData.tmt.mm10_f2);
    const tmt25mmAvg = calculateItemAverage(steelExcelData.tmt.mm25_f1, steelExcelData.tmt.mm25_f2);
    const tmtFinal = calculateFinalAverage([tmt10mmAvg, tmt25mmAvg]);
    
    // Angle/Channel: First calculate (F1+F2)/2 for each item, then average of all 3 items
    const isa75Avg = calculateItemAverage(steelExcelData.angleChannel.isa75_f1, steelExcelData.angleChannel.isa75_f2);
    const msPlateAngleAvg = calculateItemAverage(steelExcelData.angleChannel.msPlate10_f1, steelExcelData.angleChannel.msPlate10_f2);
    const ismc150Avg = calculateItemAverage(steelExcelData.angleChannel.ismc150_f1, steelExcelData.angleChannel.ismc150_f2);
    const angleFinal = calculateFinalAverage([isa75Avg, msPlateAngleAvg, ismc150Avg]);
    
    // Plates: First calculate (F1+F2)/2 for each size, then average of both sizes
    const plate10mmAvg = calculateItemAverage(steelExcelData.plates.msPlate10_f1, steelExcelData.plates.msPlate10_f2);
    const plate25mmAvg = calculateItemAverage(steelExcelData.plates.msPlate25_f1, steelExcelData.plates.msPlate25_f2);
    const platesFinal = calculateFinalAverage([plate10mmAvg, plate25mmAvg]);
    
    // Other Sections: (F1+F2)/2
    const otherFinal = calculateItemAverage(steelExcelData.otherSections.fortnight1, steelExcelData.otherSections.fortnight2);
    
    return {
      tmt: { mm10: tmt10mmAvg, mm25: tmt25mmAvg, final: tmtFinal },
      angle: { isa75: isa75Avg, msPlate: msPlateAngleAvg, ismc150: ismc150Avg, final: angleFinal },
      plates: { mm10: plate10mmAvg, mm25: plate25mmAvg, final: platesFinal },
      other: { final: otherFinal }
    };
  };
  
  const convertExcelDataToText = (): string => {
    const parts: string[] = [];
    const avgs = getSteelAverages();
    
    if (avgs.tmt.final > 0) parts.push(`TMT: ${avgs.tmt.final}`);
    if (avgs.angle.final > 0) parts.push(`Angle/Channel: ${avgs.angle.final}`);
    if (avgs.plates.final > 0) parts.push(`Plates: ${avgs.plates.final}`);
    if (avgs.other.final > 0) parts.push(`Other Sections: ${avgs.other.final}`);
    
    return parts.join('\n');
  };

  const handleSteelPreview = async () => {
    if (!steelMonth) {
      toast.error('Please select a month');
      return;
    }
    
    // Prepare data based on input type
    let dataToSend = "";
    
    if (steelInputType === 'excel') {
      // Convert Excel-style data to text format with averages
      dataToSend = convertExcelDataToText();
      
      if (!dataToSend || dataToSend.trim() === '') {
        toast.error('Please enter at least one steel price');
        return;
      }
    } else if (steelInputType === 'manual') {
      // Convert manual form data to text format
      const parts: string[] = [];
      if (steelManualData.tmt) parts.push(`TMT: ${steelManualData.tmt}`);
      if (steelManualData.angleChannel) parts.push(`Angle/Channel: ${steelManualData.angleChannel}`);
      if (steelManualData.plates) parts.push(`Plates: ${steelManualData.plates}`);
      if (steelManualData.otherSections) parts.push(`Other Sections: ${steelManualData.otherSections}`);
      
      if (parts.length === 0) {
        toast.error('Please enter at least one steel price');
        return;
      }
      
      dataToSend = parts.join('\n');
    }
    
    try {
      setIsImportingSteel(true);
      const response = await fetch('/api/indices/steel-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'preview',
          month: steelMonth,
          inputType: steelInputType,
          data: dataToSend
        })
      });
      const data = await response.json();
      
      if (data.success) {
        setSteelPreview(data);
      } else {
        toast.error(data.error || 'Failed to parse steel data');
      }
    } catch (error) {
      toast.error('Failed to parse steel data');
    } finally {
      setIsImportingSteel(false);
    }
  };

  const handleImportSteel = async (isProvisional: boolean = false) => {
    if (!steelMonth) {
      toast.error('Please enter month');
      return;
    }
    
    // Prepare data based on input type
    let dataToSend = "";
    
    if (steelInputType === 'excel') {
      dataToSend = convertExcelDataToText();
      
      if (!dataToSend || dataToSend.trim() === '') {
        toast.error('Please enter at least one steel price');
        return;
      }
    } else if (steelInputType === 'manual') {
      const parts: string[] = [];
      if (steelManualData.tmt) parts.push(`TMT: ${steelManualData.tmt}`);
      if (steelManualData.angleChannel) parts.push(`Angle/Channel: ${steelManualData.angleChannel}`);
      if (steelManualData.plates) parts.push(`Plates: ${steelManualData.plates}`);
      if (steelManualData.otherSections) parts.push(`Other Sections: ${steelManualData.otherSections}`);
      
      if (parts.length === 0) {
        toast.error('Please enter at least one steel price');
        return;
      }
      
      dataToSend = parts.join('\n');
    }
    
    try {
      setIsImportingSteel(true);
      const response = await fetch('/api/indices/steel-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'import',
          month: steelMonth,
          inputType: steelInputType,
          data: dataToSend,
          isProvisional
        })
      });
      const data = await response.json();
      
      if (data.success) {
        const summary = data.summary;
        toast.success(`Steel indices: ${summary.new} new, ${summary.updated} updated`);
        setShowSteelDialog(false);
        setSteelPreview(null);
        setSteelManualData({ tmt: "", angleChannel: "", plates: "", otherSections: "" });
        setSteelExcelData({
          tmt: { mm10_f1: "", mm10_f2: "", mm25_f1: "", mm25_f2: "" },
          angleChannel: { isa75_f1: "", isa75_f2: "", msPlate10_f1: "", msPlate10_f2: "", ismc150_f1: "", ismc150_f2: "" },
          plates: { msPlate10_f1: "", msPlate10_f2: "", msPlate25_f1: "", msPlate25_f2: "" },
          otherSections: { fortnight1: "", fortnight2: "" }
        });
        setSteelMonth("");
        fetchData();
      } else {
        toast.error(data.error || 'Failed to import steel data');
      }
    } catch (error) {
      toast.error('Failed to import steel data');
    } finally {
      setIsImportingSteel(false);
    }
  };

  // Helper: check if a column has any provisional values in current data
  const getColumnProvisionalStatus = (colKey: string): 'final' | 'provisional' | 'mixed' | 'empty' => {
    const values = data.filter(row => row[colKey]?.value !== null && row[colKey]?.value !== undefined);
    if (values.length === 0) return 'empty';
    const provisionalCount = values.filter(row => row[colKey]?.isProvisional).length;
    if (provisionalCount === 0) return 'final';
    if (provisionalCount === values.length) return 'provisional';
    return 'mixed';
  };

  // Toggle provisional status. Whole column/year by default, or a single month
  // when monthIndex (0-11) is given.
  const handleToggleProvisional = async (colDbName: string, colKey: string, setProvisional: boolean, monthIndex?: number) => {
    setTogglingCol(colKey);
    try {
      const response = await fetch('/api/indices/monthly/toggle-provisional', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceIndexName: colDbName,
          year,
          ...(typeof monthIndex === 'number' ? { month: monthIndex + 1 } : {}),
          isProvisional: setProvisional,
        }),
      });
      const result = await response.json();
      if (result.success) {
        toast.success(`${colDbName}: ${result.updated} value(s) marked as ${setProvisional ? 'Provisional' : 'Final'}`);
        fetchData();
      } else {
        toast.error(result.error || 'Failed to update');
      }
    } catch (error) {
      toast.error('Failed to toggle provisional status');
    } finally {
      setTogglingCol(null);
    }
  };

  if (status === "loading" || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <BackButton href="/indices" />
          <h1 className="text-xl font-bold">Price Indices - {year}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setYear(y => y - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Select value={year.toString()} onValueChange={v => setYear(parseInt(v))}>
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(y => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setYear(y => y + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCcw className="h-4 w-4" />
          </Button>
          
          {/* Add Button */}
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Index Value</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label>Month</Label>
                  <Input
                    type="month"
                    value={addMonth}
                    onChange={e => setAddMonth(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Index</Label>
                  <Select value={addIndex} onValueChange={setAddIndex}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select index" />
                    </SelectTrigger>
                    <SelectContent>
                      {INDEX_COLUMNS.map(col => (
                        <SelectItem key={col.key} value={col.key}>{col.dbName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Value</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={addValue}
                    onChange={e => setAddValue(e.target.value)}
                    placeholder="Enter value"
                    className="mt-1"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="provisional"
                    checked={addProvisional}
                    onCheckedChange={c => setAddProvisional(!!c)}
                  />
                  <Label htmlFor="provisional">Provisional (P)</Label>
                </div>
                <Button onClick={handleAddEntry} disabled={isSaving} className="w-full">
                  {isSaving ? "Saving..." : "Add Entry"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          
          {/* WPI Import Button */}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleFetchWPIPreview}
            disabled={isImportingWPI}
          >
            <Globe className="h-4 w-4 mr-1" />
            {isImportingWPI ? "Fetching..." : "Fetch WPI"}
          </Button>
          
          {/* Labour Import Button */}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowLabourDialog(true)}
          >
            <Download className="h-4 w-4 mr-1" />
            Import Labour
          </Button>
          
          {/* Steel Import Button - Links to dedicated page with all 34 JPC items */}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => router.push('/indices/steel-import')}
          >
            <Download className="h-4 w-4 mr-1" />
            Import Steel (JPC)
          </Button>
          
          {/* WPI Import Dialog */}
          <Dialog open={showWPIDialog} onOpenChange={setShowWPIDialog}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Import WPI Data from eaindustry.nic.in</DialogTitle>
              </DialogHeader>
              {wpiPreview && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Data source: <a href={wpiPreview.url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 underline">
                      {wpiPreview.url?.split('/').pop()}
                    </a>
                  </p>
                  
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-3 py-2 text-left">Index</th>
                          <th className="px-3 py-2 text-left">WPI Code</th>
                          <th className="px-3 py-2 text-right">Latest Value</th>
                          <th className="px-3 py-2 text-center">Month</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wpiPreview.indices?.map((idx: any) => (
                          <tr key={idx.indexName} className="border-t">
                            <td className="px-3 py-2 font-medium">{idx.indexName}</td>
                            <td className="px-3 py-2 text-gray-600 font-mono text-xs">{idx.wpiCode}</td>
                            <td className="px-3 py-2 text-right">
                              {idx.latestValue ? idx.latestValue.toFixed(2) : <span className="text-red-500">N/A</span>}
                            </td>
                            <td className="px-3 py-2 text-center text-gray-600">{idx.latestMonth || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  <p className="text-xs text-amber-600">
                    Note: Latest 2 months in WPI data are typically provisional and may be revised.
                  </p>
                  
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setShowWPIDialog(false)}>
                      Cancel
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => handleImportWPI(true)}
                      disabled={isImportingWPI}
                    >
                      Import as Provisional
                    </Button>
                    <Button 
                      onClick={() => handleImportWPI(false)}
                      disabled={isImportingWPI}
                    >
                      {isImportingWPI ? "Importing..." : "Import as Final"}
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
          
          {/* Labour Import Dialog */}
          <Dialog open={showLabourDialog} onOpenChange={(open) => {
            setShowLabourDialog(open);
            if (!open) {
              setLabourPreview(null);
              setLabourCSV("");
            }
          }}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Import Labour Index (CPI-IW) Data</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <p className="text-sm text-emerald-800">
                    <strong>Step 1:</strong> Download CSV from{" "}
                    <a 
                      href="https://labourbureau.gov.in/all-india-index" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-emerald-600 underline"
                    >
                      labourbureau.gov.in/all-india-index
                    </a>
                  </p>
                  <p className="text-xs text-emerald-700 mt-1">
                    Click the "CSV" button on that page to download the All India CPI-IW data.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label>Step 2: Upload the CSV file</Label>
                  <Input 
                    type="file" 
                    accept=".csv"
                    onChange={handleLabourCSVUpload}
                  />
                  {labourCSV && (
                    <p className="text-xs text-green-600">✓ CSV file loaded ({labourCSV.split('\n').length - 1} rows)</p>
                  )}
                </div>
                
                {labourCSV && !labourPreview && (
                  <Button 
                    onClick={handleLabourPreview}
                    disabled={isImportingLabour}
                  >
                    {isImportingLabour ? "Processing..." : "Preview Data"}
                  </Button>
                )}
                
                {labourPreview && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Preview: {labourPreview.comparison?.indexName} (Base: {labourPreview.comparison?.baseValue})</p>
                    
                    <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left">Month</th>
                            <th className="px-3 py-2 text-right">New Value</th>
                            <th className="px-3 py-2 text-right">Current</th>
                            <th className="px-3 py-2 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {labourPreview.comparison?.entries?.map((entry: any) => (
                            <tr key={entry.month} className="border-t">
                              <td className="px-3 py-1">{entry.month}</td>
                              <td className="px-3 py-1 text-right font-mono">{entry.newValue.toFixed(1)}</td>
                              <td className="px-3 py-1 text-right font-mono text-gray-600">
                                {entry.currentValue?.toFixed(1) || '-'}
                              </td>
                              <td className="px-3 py-1 text-center">
                                {entry.needsUpdate ? (
                                  <span className="text-amber-600 text-xs">Update</span>
                                ) : (
                                  <span className="text-green-600 text-xs">✓</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    <p className="text-xs text-amber-600">
                      Note: Only Base Year 2016 data will be imported.
                    </p>
                    
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => setShowLabourDialog(false)}>
                        Cancel
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={() => handleImportLabour(true)}
                        disabled={isImportingLabour}
                      >
                        Import as Provisional
                      </Button>
                      <Button 
                        onClick={() => handleImportLabour(false)}
                        disabled={isImportingLabour}
                      >
                        {isImportingLabour ? "Importing..." : "Import as Final"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
          
          {/* Steel Import Dialog */}
          <Dialog open={showSteelDialog} onOpenChange={(open) => {
            setShowSteelDialog(open);
            if (!open) {
              setSteelPreview(null);
              setSteelManualData({ tmt: "", angleChannel: "", plates: "", otherSections: "" });
              setSteelExcelData({
                tmt: { mm10_f1: "", mm10_f2: "", mm25_f1: "", mm25_f2: "" },
                angleChannel: { isa75_f1: "", isa75_f2: "", msPlate10_f1: "", msPlate10_f2: "", ismc150_f1: "", ismc150_f2: "" },
                plates: { msPlate10_f1: "", msPlate10_f2: "", msPlate25_f1: "", msPlate25_f2: "" },
                otherSections: { fortnight1: "", fortnight2: "" }
              });

            }
          }}>
            <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
              <DialogHeader className="flex-shrink-0">
                <DialogTitle>Import Steel Indices (JPC Data)</DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <p className="text-sm text-emerald-800">
                    <strong>Source:</strong> JPC (Joint Plant Committee) Retail Market Prices
                  </p>
                  <p className="text-xs text-emerald-700 mt-1">
                    Enter prices from JPC bulletin for TMT Bars, Angle/Channel, Plates, and Other Sections.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label>Month</Label>
                  <Input 
                    type="month"
                    value={steelMonth}
                    onChange={(e) => setSteelMonth(e.target.value)}
                    className="max-w-xs"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Input Type</Label>
                  <Select value={steelInputType} onValueChange={(v: "manual" | "excel") => setSteelInputType(v)}>
                    <SelectTrigger className="max-w-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="excel">Manual Entry (F1 & F2 Fortnights)</SelectItem>
                      <SelectItem value="manual">Simple Entry (Single Average)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {steelInputType === "excel" ? (
                  (() => {
                    const avgs = getSteelAverages();
                    return (
                  <div className="space-y-3">
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
                      <p className="text-sm text-amber-800 font-medium">
                        ⚠️ Enter Chennai rates only (JPC Retail Market Prices)
                      </p>
                      <p className="text-xs text-amber-700 mt-1">
                        <strong>Calculation:</strong> Item Avg = (F1 + F2) ÷ 2
                      </p>
                      <p className="text-xs text-amber-700">
                        You can upload PDF above to auto-fill, or manually type F1 & F2 values below
                      </p>
                    </div>
                    
                    {/* TMT Bars - Horizontal Layout matching Excel */}
                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-gray-100 px-3 py-2 flex justify-between items-center">
                        <h4 className="font-semibold text-sm">TMT Bars</h4>
                        <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">
                          Final Avg: ₹{avgs.tmt.final > 0 ? avgs.tmt.final.toLocaleString() : '-'}
                        </span>
                      </div>
                      <div className="p-3">
                        {/* 10mm Row */}
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-medium w-12">10mm:</span>
                          <div className="flex-1">
                            <Label className="text-[10px] text-gray-500">F1</Label>
                            <Input type="number" placeholder="62280" value={steelExcelData.tmt.mm10_f1}
                              onChange={(e) => setSteelExcelData({...steelExcelData, tmt: {...steelExcelData.tmt, mm10_f1: e.target.value}})}
                              className="font-mono text-xs h-8" />
                          </div>
                          <div className="flex-1">
                            <Label className="text-[10px] text-gray-500">F2</Label>
                            <Input type="number" placeholder="60600" value={steelExcelData.tmt.mm10_f2}
                              onChange={(e) => setSteelExcelData({...steelExcelData, tmt: {...steelExcelData.tmt, mm10_f2: e.target.value}})}
                              className="font-mono text-xs h-8" />
                          </div>
                          <div className="w-20 text-right">
                            <Label className="text-[10px] text-gray-500">Avg</Label>
                            <div className="font-mono text-xs h-8 flex items-center justify-end text-emerald-600 font-semibold">
                              {avgs.tmt.mm10 > 0 ? avgs.tmt.mm10.toLocaleString() : '-'}
                            </div>
                          </div>
                        </div>
                        {/* 25mm Row */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium w-12">25mm:</span>
                          <div className="flex-1">
                            <Label className="text-[10px] text-gray-500">F1</Label>
                            <Input type="number" placeholder="61670" value={steelExcelData.tmt.mm25_f1}
                              onChange={(e) => setSteelExcelData({...steelExcelData, tmt: {...steelExcelData.tmt, mm25_f1: e.target.value}})}
                              className="font-mono text-xs h-8" />
                          </div>
                          <div className="flex-1">
                            <Label className="text-[10px] text-gray-500">F2</Label>
                            <Input type="number" placeholder="60010" value={steelExcelData.tmt.mm25_f2}
                              onChange={(e) => setSteelExcelData({...steelExcelData, tmt: {...steelExcelData.tmt, mm25_f2: e.target.value}})}
                              className="font-mono text-xs h-8" />
                          </div>
                          <div className="w-20 text-right">
                            <Label className="text-[10px] text-gray-500">Avg</Label>
                            <div className="font-mono text-xs h-8 flex items-center justify-end text-emerald-600 font-semibold">
                              {avgs.tmt.mm25 > 0 ? avgs.tmt.mm25.toLocaleString() : '-'}
                            </div>
                          </div>
                        </div>
                        {/* Step-by-step Calculation Display */}
                        <div className="mt-2 pt-2 border-t text-xs text-gray-600 space-y-1">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-gray-500">10mm:</span> ({steelExcelData.tmt.mm10_f1 || '?'} + {steelExcelData.tmt.mm10_f2 || '?'}) ÷ 2 = <span className="text-emerald-600 font-semibold">{avgs.tmt.mm10 || '?'}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">25mm:</span> ({steelExcelData.tmt.mm25_f1 || '?'} + {steelExcelData.tmt.mm25_f2 || '?'}) ÷ 2 = <span className="text-emerald-600 font-semibold">{avgs.tmt.mm25 || '?'}</span>
                            </div>
                          </div>
                          <div className="text-center pt-1 border-t border-dashed">
                            <span className="text-gray-500">Final:</span> ({avgs.tmt.mm10 || '?'} + {avgs.tmt.mm25 || '?'}) ÷ 2 = <span className="font-bold text-green-700">{avgs.tmt.final || '?'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Angle/Channel - Horizontal Layout */}
                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-gray-100 px-3 py-2 flex justify-between items-center">
                        <h4 className="font-semibold text-sm">Angle, Channel, Joist etc.</h4>
                        <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">
                          Final Avg: ₹{avgs.angle.final > 0 ? avgs.angle.final.toLocaleString() : '-'}
                        </span>
                      </div>
                      <div className="p-3 space-y-2">
                        {/* ISA 75x6 Row */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium w-24">ISA 75x6:</span>
                          <div className="flex-1">
                            <Label className="text-[10px] text-gray-500">F1</Label>
                            <Input type="number" placeholder="59030" value={steelExcelData.angleChannel.isa75_f1}
                              onChange={(e) => setSteelExcelData({...steelExcelData, angleChannel: {...steelExcelData.angleChannel, isa75_f1: e.target.value}})}
                              className="font-mono text-xs h-8" />
                          </div>
                          <div className="flex-1">
                            <Label className="text-[10px] text-gray-500">F2</Label>
                            <Input type="number" placeholder="58170" value={steelExcelData.angleChannel.isa75_f2}
                              onChange={(e) => setSteelExcelData({...steelExcelData, angleChannel: {...steelExcelData.angleChannel, isa75_f2: e.target.value}})}
                              className="font-mono text-xs h-8" />
                          </div>
                          <div className="w-20 text-right">
                            <Label className="text-[10px] text-gray-500">Avg</Label>
                            <div className="font-mono text-xs h-8 flex items-center justify-end text-emerald-600 font-semibold">
                              {avgs.angle.isa75 > 0 ? avgs.angle.isa75.toLocaleString() : '-'}
                            </div>
                          </div>
                        </div>
                        {/* MS Plate-10mm Row */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium w-24">MS Plate-10mm:</span>
                          <div className="flex-1">
                            <Label className="text-[10px] text-gray-500">F1</Label>
                            <Input type="number" placeholder="62560" value={steelExcelData.angleChannel.msPlate10_f1}
                              onChange={(e) => setSteelExcelData({...steelExcelData, angleChannel: {...steelExcelData.angleChannel, msPlate10_f1: e.target.value}})}
                              className="font-mono text-xs h-8" />
                          </div>
                          <div className="flex-1">
                            <Label className="text-[10px] text-gray-500">F2</Label>
                            <Input type="number" placeholder="62560" value={steelExcelData.angleChannel.msPlate10_f2}
                              onChange={(e) => setSteelExcelData({...steelExcelData, angleChannel: {...steelExcelData.angleChannel, msPlate10_f2: e.target.value}})}
                              className="font-mono text-xs h-8" />
                          </div>
                          <div className="w-20 text-right">
                            <Label className="text-[10px] text-gray-500">Avg</Label>
                            <div className="font-mono text-xs h-8 flex items-center justify-end text-emerald-600 font-semibold">
                              {avgs.angle.msPlate > 0 ? avgs.angle.msPlate.toLocaleString() : '-'}
                            </div>
                          </div>
                        </div>
                        {/* ISMC 150x75 Row */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium w-24">ISMC 150x75:</span>
                          <div className="flex-1">
                            <Label className="text-[10px] text-gray-500">F1</Label>
                            <Input type="number" placeholder="61920" value={steelExcelData.angleChannel.ismc150_f1}
                              onChange={(e) => setSteelExcelData({...steelExcelData, angleChannel: {...steelExcelData.angleChannel, ismc150_f1: e.target.value}})}
                              className="font-mono text-xs h-8" />
                          </div>
                          <div className="flex-1">
                            <Label className="text-[10px] text-gray-500">F2</Label>
                            <Input type="number" placeholder="60350" value={steelExcelData.angleChannel.ismc150_f2}
                              onChange={(e) => setSteelExcelData({...steelExcelData, angleChannel: {...steelExcelData.angleChannel, ismc150_f2: e.target.value}})}
                              className="font-mono text-xs h-8" />
                          </div>
                          <div className="w-20 text-right">
                            <Label className="text-[10px] text-gray-500">Avg</Label>
                            <div className="font-mono text-xs h-8 flex items-center justify-end text-emerald-600 font-semibold">
                              {avgs.angle.ismc150 > 0 ? avgs.angle.ismc150.toLocaleString() : '-'}
                            </div>
                          </div>
                        </div>
                        {/* Step-by-step Calculation Display */}
                        <div className="mt-2 pt-2 border-t text-xs text-gray-600 space-y-1">
                          <div className="space-y-0.5">
                            <div>
                              <span className="text-gray-500">ISA 75x6:</span> ({steelExcelData.angleChannel.isa75_f1 || '?'} + {steelExcelData.angleChannel.isa75_f2 || '?'}) ÷ 2 = <span className="text-emerald-600 font-semibold">{avgs.angle.isa75 || '?'}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">MS Plate:</span> ({steelExcelData.angleChannel.msPlate10_f1 || '?'} + {steelExcelData.angleChannel.msPlate10_f2 || '?'}) ÷ 2 = <span className="text-emerald-600 font-semibold">{avgs.angle.msPlate || '?'}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">ISMC 150:</span> ({steelExcelData.angleChannel.ismc150_f1 || '?'} + {steelExcelData.angleChannel.ismc150_f2 || '?'}) ÷ 2 = <span className="text-emerald-600 font-semibold">{avgs.angle.ismc150 || '?'}</span>
                            </div>
                          </div>
                          <div className="text-center pt-1 border-t border-dashed">
                            <span className="text-gray-500">Final:</span> ({avgs.angle.isa75 || '?'} + {avgs.angle.msPlate || '?'} + {avgs.angle.ismc150 || '?'}) ÷ 3 = <span className="font-bold text-green-700">{avgs.angle.final || '?'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Plates - Horizontal Layout */}
                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-gray-100 px-3 py-2 flex justify-between items-center">
                        <h4 className="font-semibold text-sm">Plates</h4>
                        <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">
                          Final Avg: ₹{avgs.plates.final > 0 ? avgs.plates.final.toLocaleString() : '-'}
                        </span>
                      </div>
                      <div className="p-3">
                        {/* MS Plate 10mm Row */}
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-medium w-24">MS Plate-10mm:</span>
                          <div className="flex-1">
                            <Label className="text-[10px] text-gray-500">F1</Label>
                            <Input type="number" placeholder="62560" value={steelExcelData.plates.msPlate10_f1}
                              onChange={(e) => setSteelExcelData({...steelExcelData, plates: {...steelExcelData.plates, msPlate10_f1: e.target.value}})}
                              className="font-mono text-xs h-8" />
                          </div>
                          <div className="flex-1">
                            <Label className="text-[10px] text-gray-500">F2</Label>
                            <Input type="number" placeholder="62560" value={steelExcelData.plates.msPlate10_f2}
                              onChange={(e) => setSteelExcelData({...steelExcelData, plates: {...steelExcelData.plates, msPlate10_f2: e.target.value}})}
                              className="font-mono text-xs h-8" />
                          </div>
                          <div className="w-20 text-right">
                            <Label className="text-[10px] text-gray-500">Avg</Label>
                            <div className="font-mono text-xs h-8 flex items-center justify-end text-emerald-600 font-semibold">
                              {avgs.plates.mm10 > 0 ? avgs.plates.mm10.toLocaleString() : '-'}
                            </div>
                          </div>
                        </div>
                        {/* MS Plate 25mm Row */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium w-24">MS Plate-25mm:</span>
                          <div className="flex-1">
                            <Label className="text-[10px] text-gray-500">F1</Label>
                            <Input type="number" placeholder="63510" value={steelExcelData.plates.msPlate25_f1}
                              onChange={(e) => setSteelExcelData({...steelExcelData, plates: {...steelExcelData.plates, msPlate25_f1: e.target.value}})}
                              className="font-mono text-xs h-8" />
                          </div>
                          <div className="flex-1">
                            <Label className="text-[10px] text-gray-500">F2</Label>
                            <Input type="number" placeholder="63510" value={steelExcelData.plates.msPlate25_f2}
                              onChange={(e) => setSteelExcelData({...steelExcelData, plates: {...steelExcelData.plates, msPlate25_f2: e.target.value}})}
                              className="font-mono text-xs h-8" />
                          </div>
                          <div className="w-20 text-right">
                            <Label className="text-[10px] text-gray-500">Avg</Label>
                            <div className="font-mono text-xs h-8 flex items-center justify-end text-emerald-600 font-semibold">
                              {avgs.plates.mm25 > 0 ? avgs.plates.mm25.toLocaleString() : '-'}
                            </div>
                          </div>
                        </div>
                        {/* Step-by-step Calculation Display */}
                        <div className="mt-2 pt-2 border-t text-xs text-gray-600 space-y-1">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-gray-500">10mm:</span> ({steelExcelData.plates.msPlate10_f1 || '?'} + {steelExcelData.plates.msPlate10_f2 || '?'}) ÷ 2 = <span className="text-emerald-600 font-semibold">{avgs.plates.mm10 || '?'}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">25mm:</span> ({steelExcelData.plates.msPlate25_f1 || '?'} + {steelExcelData.plates.msPlate25_f2 || '?'}) ÷ 2 = <span className="text-emerald-600 font-semibold">{avgs.plates.mm25 || '?'}</span>
                            </div>
                          </div>
                          <div className="text-center pt-1 border-t border-dashed">
                            <span className="text-gray-500">Final:</span> ({avgs.plates.mm10 || '?'} + {avgs.plates.mm25 || '?'}) ÷ 2 = <span className="font-bold text-green-700">{avgs.plates.final || '?'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Other Sections - Horizontal Layout */}
                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-gray-100 px-3 py-2 flex justify-between items-center">
                        <h4 className="font-semibold text-sm">Other Sections</h4>
                        <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">
                          Final Avg: ₹{avgs.other.final > 0 ? avgs.other.final.toLocaleString() : '-'}
                        </span>
                      </div>
                      <div className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <Label className="text-[10px] text-gray-500">F1 (1st Fortnight)</Label>
                            <Input type="number" placeholder="58000" value={steelExcelData.otherSections.fortnight1}
                              onChange={(e) => setSteelExcelData({...steelExcelData, otherSections: {...steelExcelData.otherSections, fortnight1: e.target.value}})}
                              className="font-mono text-xs h-8" />
                          </div>
                          <div className="flex-1">
                            <Label className="text-[10px] text-gray-500">F2 (2nd Fortnight)</Label>
                            <Input type="number" placeholder="59000" value={steelExcelData.otherSections.fortnight2}
                              onChange={(e) => setSteelExcelData({...steelExcelData, otherSections: {...steelExcelData.otherSections, fortnight2: e.target.value}})}
                              className="font-mono text-xs h-8" />
                          </div>
                        </div>
                        {/* Step-by-step Calculation Display */}
                        <div className="mt-2 pt-2 border-t text-xs text-gray-600 text-center">
                          <span className="text-gray-500">Final:</span> ({steelExcelData.otherSections.fortnight1 || '?'} + {steelExcelData.otherSections.fortnight2 || '?'}) ÷ 2 = <span className="font-bold text-green-700">{avgs.other.final || '?'}</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Summary Box */}
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <p className="text-sm font-semibold text-green-800 mb-2">Final Index Values to Import:</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>Steel TMT Bars: <span className="font-bold">{avgs.tmt.final > 0 ? `₹${avgs.tmt.final.toLocaleString()}` : '-'}</span></div>
                        <div>Steel Angle/Channel: <span className="font-bold">{avgs.angle.final > 0 ? `₹${avgs.angle.final.toLocaleString()}` : '-'}</span></div>
                        <div>Steel Plates: <span className="font-bold">{avgs.plates.final > 0 ? `₹${avgs.plates.final.toLocaleString()}` : '-'}</span></div>
                        <div>Steel Other Sections: <span className="font-bold">{avgs.other.final > 0 ? `₹${avgs.other.final.toLocaleString()}` : '-'}</span></div>
                      </div>
                    </div>
                  </div>
                    );
                  })()
                ) : steelInputType === "manual" ? (
                  <div className="space-y-4">
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-sm text-amber-800 font-medium">
                        ⚠️ Important: Enter Chennai rates only
                      </p>
                      <p className="text-xs text-amber-700 mt-1">
                        IR-PVC uses ONLY Chennai rates for steel calculations. Enter Chennai prices from JPC bulletin.
                      </p>
                    </div>
                    
                    <div className="space-y-3">
                      <Label className="text-base font-semibold">Steel Prices (Chennai Rates in ₹/MT)</Label>
                      
                      {/* TMT Bars */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-center">
                        <Label htmlFor="tmt-bars" className="text-sm">
                          Steel TMT Bars
                          <span className="text-gray-500 text-xs ml-1">(Fe-500/Fe-550)</span>
                        </Label>
                        <Input
                          id="tmt-bars"
                          type="number"
                          placeholder="e.g., 58120"
                          value={steelManualData.tmt}
                          onChange={(e) => setSteelManualData({ ...steelManualData, tmt: e.target.value })}
                          className="font-mono"
                        />
                      </div>
                      
                      {/* Angle/Channel */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-center">
                        <Label htmlFor="angle-channel" className="text-sm">
                          Steel Angle/Channel
                          <span className="text-gray-500 text-xs ml-1">(MS Structural)</span>
                        </Label>
                        <Input
                          id="angle-channel"
                          type="number"
                          placeholder="e.g., 59990"
                          value={steelManualData.angleChannel}
                          onChange={(e) => setSteelManualData({ ...steelManualData, angleChannel: e.target.value })}
                          className="font-mono"
                        />
                      </div>
                      
                      {/* Plates */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-center">
                        <Label htmlFor="plates" className="text-sm">
                          Steel Plates
                          <span className="text-gray-500 text-xs ml-1">(MS/HR Plates)</span>
                        </Label>
                        <Input
                          id="plates"
                          type="number"
                          placeholder="e.g., 67180"
                          value={steelManualData.plates}
                          onChange={(e) => setSteelManualData({ ...steelManualData, plates: e.target.value })}
                          className="font-mono"
                        />
                      </div>
                      
                      {/* Other Sections */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-center">
                        <Label htmlFor="other-sections" className="text-sm">
                          Steel Other Sections
                          <span className="text-gray-500 text-xs ml-1">(Beams, Flats, etc.)</span>
                        </Label>
                        <Input
                          id="other-sections"
                          type="number"
                          placeholder="e.g., 62483"
                          value={steelManualData.otherSections}
                          onChange={(e) => setSteelManualData({ ...steelManualData, otherSections: e.target.value })}
                          className="font-mono"
                        />
                      </div>
                    </div>
                    
                    <p className="text-xs text-gray-500 italic">
                      All prices in ₹ per Metric Ton (MT). Leave blank if not available.
                    </p>
                  </div>
                ) : null}
                
              </div>
              
              {/* Fixed Footer Buttons */}
              <div className="flex-shrink-0 pt-4 border-t mt-2">
                {((steelInputType === 'manual' && (steelManualData.tmt || steelManualData.angleChannel || steelManualData.plates || steelManualData.otherSections)) ||
                  (steelInputType === 'excel' && (
                    steelExcelData.tmt.mm10_f1 || steelExcelData.tmt.mm10_f2 || steelExcelData.tmt.mm25_f1 || steelExcelData.tmt.mm25_f2 ||
                    steelExcelData.angleChannel.isa75_f1 || steelExcelData.angleChannel.isa75_f2 ||
                    steelExcelData.angleChannel.msPlate10_f1 || steelExcelData.angleChannel.msPlate10_f2 ||
                    steelExcelData.angleChannel.ismc150_f1 || steelExcelData.angleChannel.ismc150_f2 ||
                    steelExcelData.plates.msPlate10_f1 || steelExcelData.plates.msPlate10_f2 ||
                    steelExcelData.plates.msPlate25_f1 || steelExcelData.plates.msPlate25_f2 ||
                    steelExcelData.otherSections.fortnight1 || steelExcelData.otherSections.fortnight2
                  ))) && 
                  !steelPreview && (
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setShowSteelDialog(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleSteelPreview}
                      disabled={isImportingSteel}
                    >
                      {isImportingSteel ? "Processing..." : "Preview Data"}
                    </Button>
                  </div>
                )}
                
                {steelPreview && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Preview for {steelPreview.month}</p>
                    
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-3 py-2 text-left">Index</th>
                            <th className="px-3 py-2 text-right">New Value</th>
                            <th className="px-3 py-2 text-right">Current</th>
                            <th className="px-3 py-2 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {steelPreview.comparison?.map((entry: any) => (
                            <tr key={entry.index} className="border-t">
                              <td className="px-3 py-1 font-medium">{entry.index}</td>
                              <td className="px-3 py-1 text-right font-mono">{entry.newValue.toLocaleString()}</td>
                              <td className="px-3 py-1 text-right font-mono text-gray-600">
                                {entry.oldValue?.toLocaleString() || '-'}
                              </td>
                              <td className="px-3 py-1 text-center">
                                {entry.status === 'new' ? (
                                  <span className="text-green-600 text-xs">New</span>
                                ) : entry.status === 'updated' ? (
                                  <span className="text-amber-600 text-xs">Update</span>
                                ) : (
                                  <span className="text-gray-600 text-xs">Same</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    {steelPreview.summary && (
                      <p className="text-xs text-gray-600">
                        Summary: {steelPreview.summary.new} new, {steelPreview.summary.updated} updated, {steelPreview.summary.unchanged} unchanged
                      </p>
                    )}
                    
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => setShowSteelDialog(false)}>
                        Cancel
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={() => handleImportSteel(true)}
                        disabled={isImportingSteel}
                      >
                        Import as Provisional
                      </Button>
                      <Button 
                        onClick={() => handleImportSteel(false)}
                        disabled={isImportingSteel}
                      >
                        {isImportingSteel ? "Importing..." : "Import as Final"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Provisional indices control — lets bills be created before final numbers publish */}
      {allowProvisional !== null && (
        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <ProvisionalToggle initialValue={allowProvisional} />
          <p className="text-xs text-slate-500 sm:max-w-md">
            When ON, bills can be created before a month&apos;s numbers are final — the bill is marked
            &quot;Provisional&quot; and any missing month borrows a nearby one. When OFF, such bills are blocked
            until every number is entered and final.
          </p>
        </div>
      )}

      {/* Steel City Filter */}
      <div className="flex items-center gap-3 mb-3">
        <Label className="text-sm font-medium text-gray-700">Steel City:</Label>
        <div className="flex gap-1 flex-wrap">
          {(['all', ...STEEL_CITIES] as const).map((city) => (
            <Button
              key={city}
              variant={steelCityView === city ? "default" : "outline"}
              size="sm"
              className={`text-xs h-7 px-2.5 ${steelCityView === city ? '' : 'text-gray-600'}`}
              onClick={() => setSteelCityView(city)}
            >
              {city === 'all' ? 'All Cities' : city === 'Default' ? 'Default (Chennai)' : city}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {(() => {
            // Build visible steel columns based on city selection
            let steelColumns: { key: string; name: string; dbName: string; city?: SteelCity }[] = [];
            if (steelCityView === 'all') {
              steelColumns = getAllSteelColumns();
            } else {
              steelColumns = getSteelColumnsForCity(steelCityView).map(c => ({ ...c, city: steelCityView }));
            }
            
            // Group steel columns by city for header rendering
            const steelCityGroups: { city: string; cols: typeof steelColumns }[] = [];
            if (steelCityView === 'all') {
              for (const city of STEEL_CITIES) {
                const cityCols = steelColumns.filter(c => c.city === city);
                if (cityCols.length > 0) steelCityGroups.push({ city: city === 'Default' ? 'Default (Chennai)' : city, cols: cityCols });
              }
            }
            
            const allVisibleColumns = [...NON_STEEL_COLUMNS, ...steelColumns];
            
            return (
              <table className="w-full text-sm border-collapse">
                <thead className="bg-gray-100">
                  {/* City group header row (only in "all" view) */}
                  {steelCityView === 'all' && (
                    <tr>
                      <th className="border px-2 py-1" rowSpan={1}></th>
                      {/* Non-steel spacer */}
                      <th className="border px-2 py-1" colSpan={NON_STEEL_COLUMNS.length}></th>
                      {steelCityGroups.map(group => (
                        <th 
                          key={group.city} 
                          colSpan={group.cols.length} 
                          className={`border px-2 py-1 text-center text-xs font-bold ${
                            group.city === 'Default (Chennai)' ? 'bg-emerald-100 text-emerald-800' :
                            group.city === 'Delhi' ? 'bg-orange-100 text-orange-800' :
                            group.city === 'Mumbai' ? 'bg-emerald-100 text-emerald-800' :
                            group.city === 'Chennai' ? 'bg-green-100 text-green-800' :
                            'bg-red-100 text-red-800'
                          }`}
                        >
                          {group.city}
                        </th>
                      ))}
                    </tr>
                  )}
                  {/* Column name header row */}
                  <tr>
                    <th className="border px-2 py-2 text-left font-semibold w-20">Month</th>
                    {NON_STEEL_COLUMNS.map(col => (
                      <th key={col.key} className="border px-2 py-2 text-center font-semibold" title={col.dbName}>
                        {col.name}
                      </th>
                    ))}
                    {steelColumns.map(col => (
                      <th 
                        key={col.key} 
                        className={`border px-1 py-2 text-center font-semibold text-xs ${
                          steelCityView === 'all' ? (
                            col.city === 'Default' ? 'bg-emerald-50' :
                            col.city === 'Delhi' ? 'bg-orange-50' :
                            col.city === 'Mumbai' ? 'bg-emerald-50' :
                            col.city === 'Chennai' ? 'bg-green-50' :
                            'bg-red-50'
                          ) : ''
                        }`}
                        title={col.dbName}
                      >
                        {steelCityView !== 'all' ? col.name : col.name}
                      </th>
                    ))}
                  </tr>
                  {/* F/P toggle row */}
                  <tr className="bg-gray-50">
                    <th className="border px-1 py-1 text-xs text-gray-400 font-normal">F / P</th>
                    {NON_STEEL_COLUMNS.map(col => {
                      const status = getColumnProvisionalStatus(col.key);
                      const isToggling = togglingCol === col.key;
                      return (
                        <th key={col.key} className="border px-1 py-0.5 text-center">
                          {status !== 'empty' && (
                            <div className="flex items-center justify-center gap-0.5">
                              <button
                                onClick={() => handleToggleProvisional(col.dbName, col.key, false)}
                                disabled={isToggling || status === 'final'}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                                  status === 'final' 
                                    ? 'bg-green-100 text-green-700 border border-green-300' 
                                    : 'bg-gray-100 text-gray-500 hover:bg-green-50 hover:text-green-600 border border-gray-200'
                                } ${isToggling ? 'opacity-50' : ''}`}
                                title="Mark all as Final"
                              >
                                F
                              </button>
                              <button
                                onClick={() => handleToggleProvisional(col.dbName, col.key, true)}
                                disabled={isToggling || status === 'provisional'}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                                  status === 'provisional' 
                                    ? 'bg-amber-100 text-amber-700 border border-amber-300' 
                                    : status === 'mixed'
                                    ? 'bg-amber-50 text-amber-600 border border-amber-200'
                                    : 'bg-gray-100 text-gray-500 hover:bg-amber-50 hover:text-amber-600 border border-gray-200'
                                } ${isToggling ? 'opacity-50' : ''}`}
                                title="Mark all as Provisional"
                              >
                                P
                              </button>
                              {isToggling && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
                            </div>
                          )}
                        </th>
                      );
                    })}
                    {steelColumns.map(col => {
                      const status = getColumnProvisionalStatus(col.key);
                      const isToggling = togglingCol === col.key;
                      return (
                        <th key={col.key} className={`border px-0.5 py-0.5 text-center ${
                          steelCityView === 'all' ? (
                            col.city === 'Default' ? 'bg-emerald-50/50' :
                            col.city === 'Delhi' ? 'bg-orange-50/50' :
                            col.city === 'Mumbai' ? 'bg-emerald-50/50' :
                            col.city === 'Chennai' ? 'bg-green-50/50' :
                            'bg-red-50/50'
                          ) : ''
                        }`}>
                          {status !== 'empty' && (
                            <div className="flex items-center justify-center gap-0.5">
                              <button
                                onClick={() => handleToggleProvisional(col.dbName, col.key, false)}
                                disabled={isToggling || status === 'final'}
                                className={`px-1 py-0.5 rounded text-[9px] font-semibold transition-colors ${
                                  status === 'final' 
                                    ? 'bg-green-100 text-green-700 border border-green-300' 
                                    : 'bg-gray-100 text-gray-500 hover:bg-green-50 hover:text-green-600 border border-gray-200'
                                } ${isToggling ? 'opacity-50' : ''}`}
                                title="Mark all as Final"
                              >
                                F
                              </button>
                              <button
                                onClick={() => handleToggleProvisional(col.dbName, col.key, true)}
                                disabled={isToggling || status === 'provisional'}
                                className={`px-1 py-0.5 rounded text-[9px] font-semibold transition-colors ${
                                  status === 'provisional' 
                                    ? 'bg-amber-100 text-amber-700 border border-amber-300' 
                                    : status === 'mixed'
                                    ? 'bg-amber-50 text-amber-600 border border-amber-200'
                                    : 'bg-gray-100 text-gray-500 hover:bg-amber-50 hover:text-amber-600 border border-gray-200'
                                } ${isToggling ? 'opacity-50' : ''}`}
                                title="Mark all as Provisional"
                              >
                                P
                              </button>
                              {isToggling && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
                            </div>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, rowIdx) => (
                    <tr key={row.month} className={rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="border px-2 py-2 font-medium text-gray-700">
                        <div className="flex items-center justify-between group">
                          <span>{row.month}</span>
                          <button
                            onClick={() => handleDeleteRow(row.month)}
                            className="text-red-500 hover:text-red-700 p-0.5 rounded hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                            title={`Clear all values for ${row.month}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                      {NON_STEEL_COLUMNS.map(col => {
                        const cell = row[col.key];
                        const hasValue = cell?.value !== null && cell?.value !== undefined;
                        return (
                          <td 
                            key={col.key} 
                            className={`border px-2 py-2 text-center ${cell?.isProvisional ? "bg-amber-50" : ""} ${hasValue && cell?.formula ? "cursor-help" : ""}`}
                            title={hasValue && cell?.formula ? cell.formula : undefined}
                          >
                            {hasValue ? (
                              <div className="flex items-center justify-center gap-1 group">
                                <span>{cell.value.toFixed(2)}</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleProvisional(col.dbName, col.key, !cell.isProvisional, row.monthIndex);
                                  }}
                                  className={`text-[10px] font-bold leading-none px-1 py-0.5 rounded ${cell.isProvisional ? "text-amber-700 bg-amber-100 hover:bg-amber-200" : "text-green-700 bg-green-100 hover:bg-green-200"}`}
                                  title={cell.isProvisional ? "Provisional — click to mark this month Final" : "Final — click to mark this month Provisional"}
                                >
                                  {cell.isProvisional ? "P" : "F"}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteCell(row.month, col.key, cell.id);
                                  }}
                                  className="text-red-500 hover:text-red-700 p-0.5 rounded hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Delete value"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                        );
                      })}
                      {steelColumns.map(col => {
                        const cell = row[col.key];
                        const hasValue = cell?.value !== null && cell?.value !== undefined;
                        const hasDetail = hasValue && cell?.steelDetail;
                        return (
                          <td 
                            key={col.key} 
                            className={`border px-1 py-2 text-center text-xs ${
                              cell?.isProvisional ? "bg-amber-50" : 
                              steelCityView === 'all' ? (
                                col.city === 'Default' ? 'bg-emerald-50/30' :
                                col.city === 'Delhi' ? 'bg-orange-50/30' :
                                col.city === 'Mumbai' ? 'bg-emerald-50/30' :
                                col.city === 'Chennai' ? 'bg-green-50/30' :
                                'bg-red-50/30'
                              ) : ''
                            } ${hasDetail ? "cursor-pointer hover:bg-emerald-100/50" : hasValue && cell?.formula ? "cursor-help" : ""}`}
                            title={!hasDetail && hasValue && cell?.formula ? cell.formula : hasDetail ? "Click to view breakdown" : undefined}
                            onClick={hasDetail ? (e) => {
                              const rect = (e.target as HTMLElement).getBoundingClientRect();
                              setSteelPopover({
                                month: row.month,
                                colName: col.name,
                                city: (col as any).city === 'Default' ? 'Chennai' : (col as any).city || 'Chennai',
                                value: cell.value,
                                detail: cell.steelDetail,
                                rect: { top: rect.bottom + window.scrollY, left: rect.left + window.scrollX },
                              });
                            } : undefined}
                          >
                            {hasValue ? (
                              <div className="flex items-center justify-center gap-1 group">
                                <span className={`font-mono ${hasDetail ? "underline decoration-dotted decoration-gray-400" : ""}`}>
                                  {cell.value.toFixed(0)}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleProvisional(col.dbName, col.key, !cell.isProvisional, row.monthIndex);
                                  }}
                                  className={`text-[10px] font-bold leading-none px-1 py-0.5 rounded ${cell.isProvisional ? "text-amber-700 bg-amber-100 hover:bg-amber-200" : "text-green-700 bg-green-100 hover:bg-green-200"}`}
                                  title={cell.isProvisional ? "Provisional — click to mark this month Final" : "Final — click to mark this month Provisional"}
                                >
                                  {cell.isProvisional ? "P" : "F"}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteCell(row.month, col.key, cell.id);
                                  }}
                                  className="text-red-500 hover:text-red-700 p-0.5 rounded hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Delete value"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </CardContent>
      </Card>

      {/* Steel Detail Popover */}
      {steelPopover && (
        <div 
          className="fixed inset-0 z-50" 
          onClick={() => setSteelPopover(null)}
        >
          <div 
            className="absolute bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-80 max-w-[90vw]"
            style={{
              top: Math.min(steelPopover.rect.top, window.innerHeight - 320),
              left: Math.min(Math.max(steelPopover.rect.left - 120, 8), window.innerWidth - 330),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="font-semibold text-sm text-gray-900">
                  {steelPopover.colName} — {steelPopover.month} {year}
                </h4>
                <p className="text-xs text-gray-500">{steelPopover.city} JPC Rates</p>
              </div>
              <div className="text-right">
                <span className="text-lg font-bold text-emerald-600">{steelPopover.value.toFixed(0)}</span>
                <p className="text-[10px] text-gray-400">₹/MT</p>
              </div>
            </div>
            
            {steelPopover.detail.items.length > 0 ? (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left py-1.5 px-2 font-medium text-gray-600 border">Item</th>
                    <th className="text-center py-1.5 px-1.5 font-medium text-gray-600 border w-16">F1</th>
                    <th className="text-center py-1.5 px-1.5 font-medium text-gray-600 border w-16">F2</th>
                    <th className="text-center py-1.5 px-1.5 font-medium text-gray-600 border w-16">Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {steelPopover.detail.items.map((item: any, idx: number) => (
                    <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                      <td className="py-1.5 px-2 text-gray-700 border font-medium">{item.name}</td>
                      <td className="py-1.5 px-1.5 text-center border font-mono text-gray-600">
                        {item.f1 != null ? item.f1.toFixed(0) : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="py-1.5 px-1.5 text-center border font-mono text-gray-600">
                        {item.f2 != null ? item.f2.toFixed(0) : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="py-1.5 px-1.5 text-center border font-mono font-semibold text-gray-800">
                        {item.avg != null ? item.avg.toFixed(0) : <span className="text-gray-300">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-gray-500 italic py-2">{steelPopover.detail.formulaDesc}</p>
            )}
            
            <div className="mt-2 pt-2 border-t">
              <p className="text-[10px] text-gray-400">{steelPopover.detail.formulaDesc}</p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 text-sm text-gray-500 flex items-center gap-4 flex-wrap">
        <span>
          <span className="inline-block w-4 h-4 bg-amber-50 border mr-1 align-middle"></span>
          <span className="text-amber-600">(P)</span> = Provisional
        </span>
        <span className="text-xs text-gray-400">
          Default steel indices = Chennai JPC rates. City-specific indices use respective city&apos;s JPC retail market prices.
        </span>
      </div>
    </div>
  );
}
