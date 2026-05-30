"use client";

import { toISTDate } from '@/lib/ist-utils';
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { format, parse, isValid, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, CheckCircle, Upload, Trash2, Download, Plus, Save, FileSpreadsheet, Sparkles, Loader2, Globe, Zap } from "lucide-react";
import { toast } from "react-hot-toast";
import { getClientRoleInfo } from "@/lib/role-auth";

interface FuelPrice {
  id?: string;
  date: string;
  delhi: number;
  mumbai: number;
  chennai: number;
  kolkata: number;
  source?: string;
}

export default function FuelPricesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { isAdmin } = getClientRoleInfo(session);

  const [fuelPrices, setFuelPrices] = useState<FuelPrice[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>(
    format(toISTDate(new Date()), "yyyy-MM")
  );
  const [manualEntries, setManualEntries] = useState<FuelPrice[]>([]);
  const [bulkInput, setBulkInput] = useState("");
  // PPAC Auto-fetch state
  const [ppacFetching, setPpacFetching] = useState(false);
  const [ppacPdfInfo, setPpacPdfInfo] = useState<{url: string; filename: string; date?: string} | null>(null);
  
  // Manual single entry state
  const [singleEntry, setSingleEntry] = useState({
    date: format(toISTDate(new Date()), "yyyy-MM-dd"),
    delhi: "",
    mumbai: "",
    chennai: "",
    kolkata: "",
  });
  const [savingSingle, setSavingSingle] = useState(false);
  
  // MPNG Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ created: number; updated: number; months: string[] } | null>(null);

  // Redirect unauthenticated users only
  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/auth/signin');
    }
  }, [session, status, router]);

  // Fetch fuel prices for selected month
  useEffect(() => {
    fetchFuelPrices();
  }, [selectedMonth]);

  const fetchFuelPrices = async () => {
    try {
      setLoading(true);
      const monthDate = parse(selectedMonth, "yyyy-MM", new Date());
      const startDate = format(startOfMonth(monthDate), "yyyy-MM-dd");
      const endDate = format(endOfMonth(monthDate), "yyyy-MM-dd");

      const response = await fetch(
        `/api/indices/fuel-prices?startDate=${startDate}&endDate=${endDate}`
      );
      const data = await response.json();

      if (data.success) {
        setFuelPrices(
          data.data.map((p: any) => ({
            ...p,
            date: format(new Date(p.date), "yyyy-MM-dd"),
          }))
        );
      }
    } catch (error) {
      console.error("Error fetching fuel prices:", error);
      toast.error("Failed to fetch fuel prices");
    } finally {
      setLoading(false);
    }
  };

  // Parse bulk input (format: date, delhi, mumbai, chennai, kolkata)
  const parseBulkInput = () => {
    const lines = bulkInput.trim().split("\n");
    const parsed: FuelPrice[] = [];
    const errors: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Try different formats: comma, tab, or multiple spaces
      const parts = line.split(/[,\t]+|\s{2,}/).map((p) => p.trim());

      if (parts.length < 5) {
        // Try parsing as: DD-Mon-YY Delhi Mumbai Chennai Kolkata
        const dateMatch = line.match(/(\d{1,2}-\w{3}-\d{2,4})/i);
        if (dateMatch) {
          const numbers = line.match(/[\d.]+/g);
          if (numbers && numbers.length >= 5) {
            const dateStr = dateMatch[1];
            const parsedDate = parse(dateStr, "dd-MMM-yy", new Date());
            
            if (isValid(parsedDate)) {
              parsed.push({
                date: format(parsedDate, "yyyy-MM-dd"),
                delhi: parseFloat(numbers[1]),
                mumbai: parseFloat(numbers[2]),
                chennai: parseFloat(numbers[3]),
                kolkata: parseFloat(numbers[4]),
                source: "PPAC",
              });
              continue;
            }
          }
        }
        errors.push(`Line ${i + 1}: Invalid format`);
        continue;
      }

      // Parse date (try multiple formats)
      let parsedDate: Date | null = null;
      const dateStr = parts[0];

      // Try DD-Mon-YY format (e.g., 01-Feb-25)
      parsedDate = parse(dateStr, "dd-MMM-yy", new Date());
      if (!isValid(parsedDate)) {
        parsedDate = parse(dateStr, "dd-MMM-yyyy", new Date());
      }
      if (!isValid(parsedDate)) {
        parsedDate = parse(dateStr, "yyyy-MM-dd", new Date());
      }
      if (!isValid(parsedDate)) {
        parsedDate = parse(dateStr, "dd/MM/yyyy", new Date());
      }

      if (!isValid(parsedDate)) {
        errors.push(`Line ${i + 1}: Invalid date format "${dateStr}"`);
        continue;
      }

      const delhi = parseFloat(parts[1]);
      const mumbai = parseFloat(parts[2]);
      const chennai = parseFloat(parts[3]);
      const kolkata = parseFloat(parts[4]);

      if (isNaN(delhi) || isNaN(mumbai) || isNaN(chennai) || isNaN(kolkata)) {
        errors.push(`Line ${i + 1}: Invalid price values`);
        continue;
      }

      parsed.push({
        date: format(parsedDate, "yyyy-MM-dd"),
        delhi,
        mumbai,
        chennai,
        kolkata,
        source: "PPAC",
      });
    }

    if (errors.length > 0) {
      toast.error(`Found ${errors.length} errors. Check console for details.`);
      console.error("Parse errors:", errors);
    }

    if (parsed.length > 0) {
      setManualEntries(parsed);
      toast.success(`Parsed ${parsed.length} entries`);
    }
  };

  // Import parsed entries to database
  const importEntries = async () => {
    if (manualEntries.length === 0) {
      toast.error("No entries to import");
      return;
    }

    try {
      setImporting(true);
      const response = await fetch("/api/indices/fuel-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prices: manualEntries }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(data.message);
        setManualEntries([]);
        setBulkInput("");
        fetchFuelPrices();
        // Auto-sync to MPNG indices
        handleSyncToMPNG();
      } else {
        toast.error(data.error || "Failed to import");
      }
    } catch (error) {
      console.error("Error importing:", error);
      toast.error("Failed to import fuel prices");
    } finally {
      setImporting(false);
    }
  };

  // Generate template for month
  const generateTemplate = () => {
    const monthDate = parse(selectedMonth, "yyyy-MM", new Date());
    const days = eachDayOfInterval({
      start: startOfMonth(monthDate),
      end: endOfMonth(monthDate),
    });

    const template = days
      .map((day) => `${format(day, "dd-MMM-yy")}\t94.77\t103.50\t100.80\t104.95`)
      .join("\n");

    setBulkInput(template);
    toast.success("Template generated. Update prices and click Parse.");
  };

  // Delete prices for month
  const deleteMonthPrices = async () => {
    if (!confirm(`Delete all fuel prices for ${selectedMonth}?`)) return;

    try {
      const monthDate = parse(selectedMonth, "yyyy-MM", new Date());
      const startDate = format(startOfMonth(monthDate), "yyyy-MM-dd");
      const endDate = format(endOfMonth(monthDate), "yyyy-MM-dd");

      const response = await fetch(
        `/api/indices/fuel-prices?startDate=${startDate}&endDate=${endDate}`,
        { method: "DELETE" }
      );

      const data = await response.json();

      if (data.success) {
        toast.success(data.message);
        fetchFuelPrices();
      } else {
        toast.error(data.error);
      }
    } catch (error) {
      console.error("Error deleting:", error);
      toast.error("Failed to delete");
    }
  };

  // Save single manual entry
  const saveSingleEntry = async () => {
    const { date, delhi, mumbai, chennai, kolkata } = singleEntry;
    
    if (!date || !delhi || !mumbai || !chennai || !kolkata) {
      toast.error("Please fill all fields");
      return;
    }
    
    const delhiNum = parseFloat(delhi);
    const mumbaiNum = parseFloat(mumbai);
    const chennaiNum = parseFloat(chennai);
    const kolkataNum = parseFloat(kolkata);
    
    if (isNaN(delhiNum) || isNaN(mumbaiNum) || isNaN(chennaiNum) || isNaN(kolkataNum)) {
      toast.error("Please enter valid numbers for all prices");
      return;
    }
    
    try {
      setSavingSingle(true);
      const response = await fetch("/api/indices/fuel-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prices: [{
            date,
            delhi: delhiNum,
            mumbai: mumbaiNum,
            chennai: chennaiNum,
            kolkata: kolkataNum,
          }],
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success(`Saved diesel price for ${format(new Date(date), "dd MMM yyyy")}`);
        // Reset form
        setSingleEntry({
          date: format(toISTDate(new Date()), "yyyy-MM-dd"),
          delhi: "",
          mumbai: "",
          chennai: "",
          kolkata: "",
        });
        // Refresh if viewing the same month
        const entryMonth = format(new Date(date), "yyyy-MM");
        if (entryMonth === selectedMonth) {
          fetchFuelPrices();
        }
        // Auto-sync to MPNG indices
        handleSyncToMPNG();
      } else {
        toast.error(data.error || "Failed to save entry");
      }
    } catch (error) {
      console.error("Error saving single entry:", error);
      toast.error("Failed to save entry");
    } finally {
      setSavingSingle(false);
    }
  };

  // Check PPAC for latest PDF
  const checkPPAC = async () => {
    try {
      setPpacFetching(true);
      const response = await fetch('/api/indices/fuel-prices/ppac-fetch');
      const data = await response.json();
      
      if (data.success && data.pdfInfo) {
        setPpacPdfInfo(data.pdfInfo);
        toast.success(`Found PPAC PDF: ${data.pdfInfo.filename}`);
      } else {
        toast.error(data.error || 'Could not find PPAC PDF');
      }
    } catch (error: any) {
      toast.error('Failed to check PPAC website');
    } finally {
      setPpacFetching(false);
    }
  };

  // Auto-fetch from PPAC and import
  const handlePPACFetch = async () => {
    try {
      setPpacFetching(true);
      toast.loading('Fetching from PPAC website...', { id: 'ppac-fetch' });
      
      const response = await fetch('/api/indices/fuel-prices/ppac-fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ previewOnly: false }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success(
          `Imported ${data.extracted} prices: ${data.created} new, ${data.updated} updated`,
          { id: 'ppac-fetch' }
        );
        if (data.pdfInfo) {
          setPpacPdfInfo(data.pdfInfo);
        }
        fetchFuelPrices();
        // Auto-sync to MPNG indices
        handleSyncToMPNG();
      } else {
        toast.error(data.error || 'Failed to import from PPAC', { id: 'ppac-fetch' });
      }
    } catch (error: any) {
      toast.error('Failed to fetch from PPAC: ' + error.message, { id: 'ppac-fetch' });
    } finally {
      setPpacFetching(false);
    }
  };


  // Download Excel export
  const handleDownloadExcel = async () => {
    try {
      toast.loading("Generating Excel file...");
      const response = await fetch("/api/indices/fuel-prices/export-excel");
      
      if (!response.ok) {
        toast.dismiss();
        toast.error("Failed to generate Excel");
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `PPAC_Diesel_Prices_${format(toISTDate(new Date()), "yyyy-MM-dd")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast.dismiss();
      toast.success("Excel downloaded successfully");
    } catch (error) {
      toast.dismiss();
      toast.error("Failed to download Excel");
    }
  };

  // Sync daily fuel prices to MPNG monthly indices (4-city avg + per-city)
  const handleSyncToMPNG = async () => {
    try {
      setSyncing(true);
      toast.loading('Syncing to MPNG Fuel indices...', { id: 'mpng-sync' });
      
      const response = await fetch('/api/indices/fuel-prices/sync', {
        method: 'POST',
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSyncResult({ created: data.created, updated: data.updated, months: data.months || [] });
        toast.success(data.message, { id: 'mpng-sync' });
      } else {
        toast.error(data.error || 'Sync failed', { id: 'mpng-sync' });
      }
    } catch (error: any) {
      toast.error('Failed to sync: ' + error.message, { id: 'mpng-sync' });
    } finally {
      setSyncing(false);
    }
  };

  // Calculate monthly average
  const calculateMonthlyAverage = () => {
    if (fuelPrices.length === 0) return null;

    const delhiAvg = fuelPrices.reduce((sum, p) => sum + p.delhi, 0) / fuelPrices.length;
    const mumbaiAvg = fuelPrices.reduce((sum, p) => sum + p.mumbai, 0) / fuelPrices.length;
    const chennaiAvg = fuelPrices.reduce((sum, p) => sum + p.chennai, 0) / fuelPrices.length;
    const kolkataAvg = fuelPrices.reduce((sum, p) => sum + p.kolkata, 0) / fuelPrices.length;
    const overallAvg = (delhiAvg + mumbaiAvg + chennaiAvg + kolkataAvg) / 4;

    return { delhiAvg, mumbaiAvg, chennaiAvg, kolkataAvg, overallAvg };
  };

  const averages = calculateMonthlyAverage();

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">PPAC Fuel Prices</h1>
          <p className="text-muted-foreground">
            Import and manage daily diesel prices from PPAC for Delhi, Mumbai, Chennai, and Kolkata
          </p>
        </div>
      </div>

      <Tabs defaultValue="view" className="space-y-4">
        <div className="flex justify-between items-center">
          <TabsList>
            <TabsTrigger value="view">View Prices</TabsTrigger>
            {isAdmin && <TabsTrigger value="import">Import Data</TabsTrigger>}
          </TabsList>
          <Button onClick={handleDownloadExcel} variant="outline" className="gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Download All Data (Excel)
          </Button>
        </div>

        <TabsContent value="view" className="space-y-4">
          {/* MPNG Sync Card - Admin Only */}
          {isAdmin && (
            <Card className="border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <Zap className="h-5 w-5 text-orange-600 shrink-0" />
                    <div>
                      <p className="font-semibold text-orange-800 text-sm">Sync to MPNG Fuel Monthly Indices</p>
                      <p className="text-xs text-orange-600">
                        Calculates monthly averages from daily prices → updates 4-city avg + per-city indices (Delhi, Mumbai, Chennai, Kolkata)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {syncResult && (
                      <span className="text-xs text-green-700 bg-green-100 px-2 py-1 rounded">
                        Last sync: {syncResult.created} created, {syncResult.updated} updated ({syncResult.months.length} months)
                      </span>
                    )}
                    <Button
                      onClick={handleSyncToMPNG}
                      disabled={syncing}
                      size="sm"
                      className="bg-orange-600 hover:bg-orange-700"
                    >
                      {syncing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        <>
                          <Zap className="h-4 w-4 mr-2" />
                          Sync Now
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Daily Fuel Prices</CardTitle>
                  <CardDescription>
                    View city-wise diesel prices from PPAC
                  </CardDescription>
                </div>
                <div className="flex items-center gap-4">
                  <div>
                    <Label htmlFor="month">Month</Label>
                    <Input
                      id="month"
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="w-40"
                    />
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={deleteMonthPrices}
                    disabled={fuelPrices.length === 0}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Month
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Loading...</div>
              ) : fuelPrices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                  No fuel prices found for {selectedMonth}.
                  <br />
                  Go to Import Data tab to add prices.
                </div>
              ) : (
                <>
                  {/* Monthly Averages */}
                  {averages && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                      <h3 className="font-semibold text-blue-800 mb-2">Monthly Averages</h3>
                      <div className="grid grid-cols-5 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground">Delhi</div>
                          <div className="font-bold">₹{averages.delhiAvg.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Mumbai</div>
                          <div className="font-bold">₹{averages.mumbaiAvg.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Chennai</div>
                          <div className="font-bold">₹{averages.chennaiAvg.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Kolkata</div>
                          <div className="font-bold">₹{averages.kolkataAvg.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Overall Avg</div>
                          <div className="font-bold text-blue-600">₹{averages.overallAvg.toFixed(2)}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="max-h-[500px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Delhi (₹)</TableHead>
                          <TableHead className="text-right">Mumbai (₹)</TableHead>
                          <TableHead className="text-right">Chennai (₹)</TableHead>
                          <TableHead className="text-right">Kolkata (₹)</TableHead>
                          <TableHead className="text-right">Average (₹)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fuelPrices.map((price) => {
                          const avg = (price.delhi + price.mumbai + price.chennai + price.kolkata) / 4;
                          return (
                            <TableRow key={price.date}>
                              <TableCell>{format(new Date(price.date), "dd MMM yyyy")}</TableCell>
                              <TableCell className="text-right">{price.delhi.toFixed(2)}</TableCell>
                              <TableCell className="text-right">{price.mumbai.toFixed(2)}</TableCell>
                              <TableCell className="text-right">{price.chennai.toFixed(2)}</TableCell>
                              <TableCell className="text-right">{price.kolkata.toFixed(2)}</TableCell>
                              <TableCell className="text-right font-medium">{avg.toFixed(2)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="text-sm text-muted-foreground mt-2">
                    Total: {fuelPrices.length} days
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && <TabsContent value="import" className="space-y-4">
          {/* PPAC Auto-Fetch Card */}
          <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-blue-600" />
                Auto-Fetch from PPAC Website
              </CardTitle>
              <CardDescription>
                Automatically download and import the latest diesel prices from ppac.gov.in
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4 flex-wrap">
                <Button
                  variant="outline"
                  onClick={checkPPAC}
                  disabled={ppacFetching}
                  className="border-blue-300 text-blue-700 hover:bg-blue-100"
                >
                  {ppacFetching ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    <>
                      <Globe className="h-4 w-4 mr-2" />
                      Check PPAC
                    </>
                  )}
                </Button>
                <Button
                  onClick={handlePPACFetch}
                  disabled={ppacFetching}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {ppacFetching ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Fetching...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4 mr-2" />
                      Fetch &amp; Import Now
                    </>
                  )}
                </Button>
              </div>
              {ppacPdfInfo && (
                <div className="text-sm bg-white/50 rounded p-3 border border-blue-100">
                  <p><strong>Latest PDF:</strong> {ppacPdfInfo.filename}</p>
                  {ppacPdfInfo.date && (
                    <p className="text-muted-foreground">PDF Date: {ppacPdfInfo.date}</p>
                  )}
                  <a 
                    href={ppacPdfInfo.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline text-xs"
                  >
                    View PDF on PPAC website →
                  </a>
                </div>
              )}
              <div className="text-sm text-muted-foreground bg-white/50 rounded p-3">
                <strong>How it works:</strong> Automatically scrapes the PPAC website for the latest 
                diesel price PDF, downloads it, extracts prices using AI, and imports to the database.
              </div>
            </CardContent>
          </Card>

          {/* Single Entry Card */}
          <Card className="border-green-200 bg-gradient-to-r from-green-50 to-emerald-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-green-600" />
                Add Single Entry
              </CardTitle>
              <CardDescription>
                Manually enter diesel price for a specific date
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4 items-end">
                <div className="col-span-2 md:col-span-1">
                  <Label htmlFor="entry-date">Date</Label>
                  <Input
                    id="entry-date"
                    type="date"
                    value={singleEntry.date}
                    onChange={(e) => setSingleEntry({ ...singleEntry, date: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="entry-delhi">Delhi (₹/L)</Label>
                  <Input
                    id="entry-delhi"
                    type="number"
                    step="0.01"
                    placeholder="94.77"
                    value={singleEntry.delhi}
                    onChange={(e) => setSingleEntry({ ...singleEntry, delhi: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="entry-mumbai">Mumbai (₹/L)</Label>
                  <Input
                    id="entry-mumbai"
                    type="number"
                    step="0.01"
                    placeholder="103.54"
                    value={singleEntry.mumbai}
                    onChange={(e) => setSingleEntry({ ...singleEntry, mumbai: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="entry-chennai">Chennai (₹/L)</Label>
                  <Input
                    id="entry-chennai"
                    type="number"
                    step="0.01"
                    placeholder="100.84"
                    value={singleEntry.chennai}
                    onChange={(e) => setSingleEntry({ ...singleEntry, chennai: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="entry-kolkata">Kolkata (₹/L)</Label>
                  <Input
                    id="entry-kolkata"
                    type="number"
                    step="0.01"
                    placeholder="105.45"
                    value={singleEntry.kolkata}
                    onChange={(e) => setSingleEntry({ ...singleEntry, kolkata: e.target.value })}
                  />
                </div>
                <div>
                  <Button 
                    onClick={saveSingleEntry} 
                    disabled={savingSingle}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    {savingSingle ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Manual Import Card */}
          <Card>
            <CardHeader>
              <CardTitle>Manual Import / Paste Data</CardTitle>
              <CardDescription>
                Paste data from PPAC website or enter manually. Format: Date, Delhi, Mumbai, Chennai, Kolkata
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={generateTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Generate Template for {selectedMonth}
                </Button>
              </div>

              <div>
                <Label>Bulk Input (paste from PPAC or Excel)</Label>
                <textarea
                  className="w-full h-64 p-3 border rounded-md font-mono text-sm"
                  placeholder={`Paste data here. Supported formats:\n\n01-Feb-25  94.77  103.50  100.80  104.95\n02-Feb-25  94.77  103.50  100.80  104.95\n\nOR\n\n2025-02-01, 94.77, 103.50, 100.80, 104.95\n2025-02-02, 94.77, 103.50, 100.80, 104.95`}
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={parseBulkInput} disabled={!bulkInput.trim()}>
                  Parse Data
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setBulkInput("");
                    setManualEntries([]);
                  }}
                >
                  Clear
                </Button>
              </div>

              {/* Preview parsed entries */}
              {manualEntries.length > 0 && (
                <div className="border rounded-lg p-4 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      {manualEntries.length} entries parsed
                    </h3>
                    <Button onClick={importEntries} disabled={importing}>
                      <Save className="h-4 w-4 mr-2" />
                      {importing ? "Importing..." : "Import to Database"}
                    </Button>
                  </div>

                  <div className="max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Delhi</TableHead>
                          <TableHead className="text-right">Mumbai</TableHead>
                          <TableHead className="text-right">Chennai</TableHead>
                          <TableHead className="text-right">Kolkata</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {manualEntries.slice(0, 10).map((entry, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{entry.date}</TableCell>
                            <TableCell className="text-right">{entry.delhi.toFixed(2)}</TableCell>
                            <TableCell className="text-right">{entry.mumbai.toFixed(2)}</TableCell>
                            <TableCell className="text-right">{entry.chennai.toFixed(2)}</TableCell>
                            <TableCell className="text-right">{entry.kolkata.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {manualEntries.length > 10 && (
                      <div className="text-sm text-muted-foreground text-center py-2">
                        ... and {manualEntries.length - 10} more entries
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle>How to Get PPAC Data</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <ol className="list-decimal list-inside space-y-2">
                <li>Visit <a href="https://ppac.gov.in" target="_blank" className="text-blue-600 underline">PPAC Website (ppac.gov.in)</a></li>
                <li>Go to "Retail Selling Price of Diesel" section</li>
                <li>Select the desired date range</li>
                <li>Copy the table data (Date, Delhi, Mumbai, Chennai, Kolkata columns)</li>
                <li>Paste in the text area above</li>
                <li>Click "Parse Data" to validate</li>
                <li>Click "Import to Database" to save</li>
              </ol>
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded">
                <strong>Note:</strong> The system will automatically calculate monthly averages from daily prices
                and display them in the MPNG Fuel section of PDF reports.
              </div>
            </CardContent>
          </Card>
        </TabsContent>}
      </Tabs>
    </div>
  );
}
