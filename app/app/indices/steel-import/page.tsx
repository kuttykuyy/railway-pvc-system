"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { BackButton } from "@/components/ui/back-button";
import { FileText, Loader2, Calculator, CheckCircle, ArrowRight, Database, Info, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "react-hot-toast";
import { getClientRoleInfo } from "@/lib/role-auth-client";
import { JPC_ITEMS, PVC_CALCULATION_ITEMS, INDEX_DISPLAY_NAMES, CATEGORY_DISPLAY_NAMES } from "@/lib/jpc-items";

type ItemData = { f1: string; f2: string };
type AllItemsData = Record<string, ItemData>;

export default function SteelImportPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { isAdmin } = getClientRoleInfo(session);

  const [steelMonth, setSteelMonth] = useState<string>("");
  const [selectedCity, setSelectedCity] = useState<string>("Chennai");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveResult, setSaveResult] = useState<{ created: number; updated: number } | null>(null);
  const [importToIndices, setImportToIndices] = useState(true);
  const [isProvisional, setIsProvisional] = useState(false);
  const [existingData, setExistingData] = useState<any>(null);
  const [showAllItems, setShowAllItems] = useState(false);

  // Initialize all items with empty values
  const getInitialItemsData = (): AllItemsData => {
    const data: AllItemsData = {};
    JPC_ITEMS.forEach(item => {
      data[item.id] = { f1: "", f2: "" };
    });
    return data;
  };

  const [itemsData, setItemsData] = useState<AllItemsData>(getInitialItemsData);

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
    
    // Fetch latest month from DB on mount to pre-populate form
    const fetchLatestMonth = async () => {
      try {
        const response = await fetch('/api/indices/available-date-range');
        if (response.ok) {
          const result = await response.json();
          if (result.maxMonth) {
            setSteelMonth(result.maxMonth.substring(0, 7));
          }
        }
      } catch (error) {
        console.error("Error fetching latest month:", error);
      }
    };
    fetchLatestMonth();
  }, [session, status, router, isAdmin]);

  // Load existing data when month or city changes
  useEffect(() => {
    if (steelMonth) {
      loadExistingData(steelMonth, selectedCity);
    }
  }, [steelMonth, selectedCity]);

  const loadExistingData = async (month: string, city: string = 'Chennai') => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/indices/jpc-items?month=${month}&city=${city}`);
      const data = await response.json();
      
      if (data.success && data.items) {
        const newItemsData = { ...getInitialItemsData() };
        Object.entries(data.items).forEach(([itemCode, itemData]: [string, any]) => {
          if (newItemsData[itemCode]) {
            newItemsData[itemCode] = {
              f1: itemData.f1?.toString() || "",
              f2: itemData.f2?.toString() || ""
            };
          }
        });
        setItemsData(newItemsData);
        setExistingData(data);
        if (data.itemCount > 0) {
          toast.success(`Loaded ${data.itemCount} existing records for ${month}`);
        }
      }
    } catch (error) {
      console.error("Error loading existing data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Get F1 and F2 values for an item
  const getItemValues = (itemId: string): { f1: number; f2: number } => {
    const item = itemsData[itemId];
    return {
      f1: parseFloat(item?.f1 || "0") || 0,
      f2: parseFloat(item?.f2 || "0") || 0
    };
  };

  // Calculate item average (F1 + F2) / 2 - keep 2 decimal places
  const calculateItemAverage = (itemId: string): number => {
    const { f1, f2 } = getItemValues(itemId);
    if (f1 === 0 && f2 === 0) return 0;
    if (f1 === 0) return f2;
    if (f2 === 0) return f1;
    return parseFloat(((f1 + f2) / 2).toFixed(2));
  };

  /**
   * TMT Bars Calculation (as per user's Excel):
   * Average of all 4 values: (10mm_F1 + 10mm_F2 + 25mm_F1 + 25mm_F2) ÷ 4
   */
  const calculateTMTAverage = (): { avg: number; breakdown: string } => {
    const tmt10 = getItemValues('tmt_10mm');
    const tmt25 = getItemValues('tmt_25mm');
    
    const values = [tmt10.f1, tmt10.f2, tmt25.f1, tmt25.f2].filter(v => v > 0);
    if (values.length === 0) return { avg: 0, breakdown: "-" };
    
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = parseFloat((sum / values.length).toFixed(2));
    
    const breakdown = `(${tmt10.f1 || '-'} + ${tmt10.f2 || '-'} + ${tmt25.f1 || '-'} + ${tmt25.f2 || '-'}) ÷ ${values.length}`;
    return { avg, breakdown };
  };

  /**
   * Angle/Channel Calculation (as per user's Excel):
   * Items: ISA 75x6, MS Plate-10mm, ISMC 150x75
   * Step 1: Calculate item avg for each = (F1 + F2) ÷ 2
   * Step 2: Final avg = (ISA_Avg + MSPlate_Avg + ISMC_Avg) ÷ 3
   */
  const calculateAngleChannelAverage = (): { avg: number; breakdown: string; itemAvgs: { name: string; avg: number }[] } => {
    const isaAvg = calculateItemAverage('angle_75x75x6mm');
    const plateAvg = calculateItemAverage('plate_10mm');
    const ismcAvg = calculateItemAverage('channel_150x75mm');
    
    const itemAvgs = [
      { name: 'ISA 75x6', avg: isaAvg },
      { name: 'MS Plate-10mm', avg: plateAvg },
      { name: 'ISMC 150x75', avg: ismcAvg }
    ];
    
    const validAvgs = itemAvgs.filter(i => i.avg > 0);
    if (validAvgs.length === 0) return { avg: 0, breakdown: "-", itemAvgs };
    
    const sum = validAvgs.reduce((a, b) => a + b.avg, 0);
    const avg = parseFloat((sum / validAvgs.length).toFixed(2));
    
    const breakdown = `(${itemAvgs.map(i => i.avg || '-').join(' + ')}) ÷ ${validAvgs.length}`;
    return { avg, breakdown, itemAvgs };
  };

  /**
   * Plates Calculation (as per user's Excel):
   * Items: MS Plate-10mm, MS Plate-25mm
   * Step 1: Calculate item avg for each = (F1 + F2) ÷ 2
   * Step 2: Final avg = (Plate10_Avg + Plate25_Avg) ÷ 2
   */
  const calculatePlatesAverage = (): { avg: number; breakdown: string; itemAvgs: { name: string; avg: number }[] } => {
    const plate10Avg = calculateItemAverage('plate_10mm');
    const plate25Avg = calculateItemAverage('plate_25mm');
    
    const itemAvgs = [
      { name: 'MS Plate-10mm', avg: plate10Avg },
      { name: 'MS Plate-25mm', avg: plate25Avg }
    ];
    
    const validAvgs = itemAvgs.filter(i => i.avg > 0);
    if (validAvgs.length === 0) return { avg: 0, breakdown: "-", itemAvgs };
    
    const sum = validAvgs.reduce((a, b) => a + b.avg, 0);
    const avg = parseFloat((sum / validAvgs.length).toFixed(2));
    
    const breakdown = `(${itemAvgs.map(i => i.avg || '-').join(' + ')}) ÷ ${validAvgs.length}`;
    return { avg, breakdown, itemAvgs };
  };

  /**
   * Other Sections Calculation (as per GCC 2022 Clause 46A.9):
   * "Any other section of steel not covered in the above categories" =
   * Average of price for the 3 categories: TMT, Angle/Channel, Plates
   * Formula: (TMT + Angle/Channel + Plates) ÷ 3
   */
  const calculateOtherSectionsAverage = (): { avg: number; breakdown: string; source: string } => {
    // Get the calculated averages of the other 3 indices
    const tmtVal = calculateTMTAverage().avg;
    const angleVal = calculateAngleChannelAverage().avg;
    const platesVal = calculatePlatesAverage().avg;
    
    const validValues = [tmtVal, angleVal, platesVal].filter(v => v > 0);
    if (validValues.length === 0) return { avg: 0, breakdown: "-", source: "GCC 2022 Clause 46A.9" };
    
    const sum = validValues.reduce((a, b) => a + b, 0);
    const avg = parseFloat((sum / validValues.length).toFixed(2));
    
    const breakdown = `(${tmtVal || '-'} + ${angleVal || '-'} + ${platesVal || '-'}) ÷ ${validValues.length}`;
    return { avg, breakdown, source: "GCC 2022 Clause 46A.9" };
  };

  // Update item data
  const updateItemData = (itemId: string, field: "f1" | "f2", value: string) => {
    setItemsData(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value }
    }));
    setSaveSuccess(false);
  };


  // Save handler
  const handleSave = async () => {
    if (!steelMonth) {
      toast.error("Please select a month");
      return;
    }

    // Check if at least the calculation items have data
    const requiredItems = ['tmt_10mm', 'tmt_25mm', 'angle_75x75x6mm', 'plate_10mm', 'channel_150x75mm', 'plate_25mm'];
    const filledRequired = requiredItems.filter(id => {
      const data = itemsData[id];
      return data && (data.f1 || data.f2);
    });

    if (filledRequired.length === 0) {
      toast.error("Please enter at least one steel price for calculation items");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/indices/jpc-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: steelMonth,
          city: selectedCity,
          items: itemsData,
          source: `JPC ${steelMonth}`,
          importToIndices,
          isProvisional
        })
      });

      const data = await response.json();

      if (data.success) {
        const { results, indexImportResults } = data;
        let message = `JPC Items: ${results.created} created, ${results.updated} updated`;
        if (indexImportResults) {
          message += ` | Steel Indices: ${indexImportResults.created} created, ${indexImportResults.updated} updated`;
        }
        toast.success(message);
        setSaveSuccess(true);
        setSaveResult({ created: results.created, updated: results.updated });
      } else {
        throw new Error(data.error || "Failed to save data");
      }
    } catch (error: any) {
      console.error("Save error:", error);
      toast.error(error.message || "Failed to save JPC items");
    } finally {
      setIsSaving(false);
    }
  };

  // Reset form
  const handleReset = () => {
    setItemsData(getInitialItemsData());
    setSteelMonth("");
    setSelectedCity("Chennai");

    setSaveSuccess(false);
    setSaveResult(null);
    setExistingData(null);
  };

  if (status === "loading" || !session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  const tmtCalc = calculateTMTAverage();
  const angleCalc = calculateAngleChannelAverage();
  const platesCalc = calculatePlatesAverage();
  const otherSectionsCalc = calculateOtherSectionsAverage();

  // Items used in calculation (highlighted in the form)
  const calculationItemIds = ['tmt_10mm', 'tmt_25mm', 'angle_75x75x6mm', 'plate_10mm', 'channel_150x75mm', 'plate_25mm'];

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      <BackButton href="/indices" label="Back to Indices" />

      <div className="mb-6">
        <h1 className="text-2xl font-bold">Import Steel Indices (JPC)</h1>
        <p className="text-gray-600 mt-1">Enter city-wise JPC rates to calculate steel indices for IR-PVC</p>
      </div>

      {/* Calculation Method Info */}
      <Card className="mb-6 border-emerald-200 bg-emerald-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-emerald-800">
            <Info className="h-5 w-5" />
            Calculation Method (as per GCC 2022 Clause 46A.9)
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-emerald-700 space-y-1">
          <p><strong>1. TMT Bars:</strong> Average of 10mm & 25mm TMT rates</p>
          <p><strong>2. Angle/Channel:</strong> Average of [ISA 75x6, MS Plate-10mm, ISMC 150x75]</p>
          <p><strong>3. Plates:</strong> Average of [MS Plate-10mm, MS Plate-25mm]</p>
          <p><strong>4. Other Sections:</strong> (TMT + Angle/Channel + Plates) ÷ 3</p>
          <p className="text-xs text-emerald-600 mt-2">* Item Avg = (F1 + F2) ÷ 2 | Source: GCC April 2022</p>
        </CardContent>
      </Card>

      {/* Step 1: Month & City Selection */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="bg-emerald-100 text-emerald-700 rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">1</span>
            Select Month & City
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <Label className="text-xs text-gray-600">Month</Label>
              <Input
                type="month"
                value={steelMonth}
                onChange={(e) => setSteelMonth(e.target.value)}
                className="max-w-xs"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-600">City</Label>
              <div className="flex gap-2">
                {['Delhi', 'Mumbai', 'Chennai', 'Kolkata'].map((city) => (
                  <Button
                    key={city}
                    variant={selectedCity === city ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setSelectedCity(city);
                      setSaveSuccess(false);
                      setSaveResult(null);
                    }}
                    className={selectedCity === city ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                  >
                    {city}
                  </Button>
                ))}
              </div>
            </div>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-500 mt-5" />}
            {existingData?.itemCount > 0 && (
              <span className="text-sm text-green-600 mt-5">
                ✓ {existingData.itemCount} records exist for {selectedCity}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Enter Steel Prices - Focus on Calculation Items */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="bg-amber-100 text-amber-700 rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">3</span>
            Enter {selectedCity} Rates (₹/MT) - Items Used for Calculation
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* TMT Bars Section */}
          <div className="mb-6">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <h4 className="font-semibold text-emerald-800 mb-3">TMT Bars</h4>
              <div className="grid grid-cols-5 gap-3 items-end">
                <div>
                  <Label className="text-xs text-gray-600">10mm F1</Label>
                  <Input
                    type="number"
                    value={itemsData.tmt_10mm?.f1 || ""}
                    onChange={(e) => updateItemData('tmt_10mm', 'f1', e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-600">10mm F2</Label>
                  <Input
                    type="number"
                    value={itemsData.tmt_10mm?.f2 || ""}
                    onChange={(e) => updateItemData('tmt_10mm', 'f2', e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-600">25mm F1</Label>
                  <Input
                    type="number"
                    value={itemsData.tmt_25mm?.f1 || ""}
                    onChange={(e) => updateItemData('tmt_25mm', 'f1', e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-600">25mm F2</Label>
                  <Input
                    type="number"
                    value={itemsData.tmt_25mm?.f2 || ""}
                    onChange={(e) => updateItemData('tmt_25mm', 'f2', e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div className="bg-emerald-100 rounded-lg p-2 text-center">
                  <div className="text-xs text-emerald-600">TMT Avg</div>
                  <div className="text-lg font-bold text-emerald-800">
                    {tmtCalc.avg > 0 ? tmtCalc.avg.toLocaleString() : "-"}
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">{tmtCalc.breakdown}</p>
            </div>
          </div>

          {/* Angle/Channel Section */}
          <div className="mb-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-semibold text-green-800 mb-3">Angle, Channel, Joist etc.</h4>
              <div className="grid grid-cols-7 gap-3 items-end">
                <div>
                  <Label className="text-xs text-gray-600">ISA 75x6 F1</Label>
                  <Input
                    type="number"
                    value={itemsData.angle_75x75x6mm?.f1 || ""}
                    onChange={(e) => updateItemData('angle_75x75x6mm', 'f1', e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-600">ISA 75x6 F2</Label>
                  <Input
                    type="number"
                    value={itemsData.angle_75x75x6mm?.f2 || ""}
                    onChange={(e) => updateItemData('angle_75x75x6mm', 'f2', e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-600">MS Plate-10mm F1</Label>
                  <Input
                    type="number"
                    value={itemsData.plate_10mm?.f1 || ""}
                    onChange={(e) => updateItemData('plate_10mm', 'f1', e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-600">MS Plate-10mm F2</Label>
                  <Input
                    type="number"
                    value={itemsData.plate_10mm?.f2 || ""}
                    onChange={(e) => updateItemData('plate_10mm', 'f2', e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-600">ISMC 150x75 F1</Label>
                  <Input
                    type="number"
                    value={itemsData.channel_150x75mm?.f1 || ""}
                    onChange={(e) => updateItemData('channel_150x75mm', 'f1', e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-600">ISMC 150x75 F2</Label>
                  <Input
                    type="number"
                    value={itemsData.channel_150x75mm?.f2 || ""}
                    onChange={(e) => updateItemData('channel_150x75mm', 'f2', e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div className="bg-green-100 rounded-lg p-2 text-center">
                  <div className="text-xs text-green-600">Angle Avg</div>
                  <div className="text-lg font-bold text-green-800">
                    {angleCalc.avg > 0 ? angleCalc.avg.toLocaleString() : "-"}
                  </div>
                </div>
              </div>
              <div className="flex gap-4 text-xs text-gray-500 mt-2">
                {angleCalc.itemAvgs.map((item, idx) => (
                  <span key={idx}>{item.name}: {item.avg || '-'}</span>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">{angleCalc.breakdown}</p>
            </div>
          </div>

          {/* Plates Section */}
          <div className="mb-6">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h4 className="font-semibold text-red-800 mb-3">Plates</h4>
              <div className="grid grid-cols-5 gap-3 items-end">
                <div>
                  <Label className="text-xs text-gray-600">MS Plate-10mm F1</Label>
                  <Input
                    type="number"
                    value={itemsData.plate_10mm?.f1 || ""}
                    onChange={(e) => updateItemData('plate_10mm', 'f1', e.target.value)}
                    className="font-mono bg-yellow-50"
                    disabled
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-600">MS Plate-10mm F2</Label>
                  <Input
                    type="number"
                    value={itemsData.plate_10mm?.f2 || ""}
                    onChange={(e) => updateItemData('plate_10mm', 'f2', e.target.value)}
                    className="font-mono bg-yellow-50"
                    disabled
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-600">MS Plate-25mm F1</Label>
                  <Input
                    type="number"
                    value={itemsData.plate_25mm?.f1 || ""}
                    onChange={(e) => updateItemData('plate_25mm', 'f1', e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-600">MS Plate-25mm F2</Label>
                  <Input
                    type="number"
                    value={itemsData.plate_25mm?.f2 || ""}
                    onChange={(e) => updateItemData('plate_25mm', 'f2', e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div className="bg-red-100 rounded-lg p-2 text-center">
                  <div className="text-xs text-red-600">Plates Avg</div>
                  <div className="text-lg font-bold text-red-800">
                    {platesCalc.avg > 0 ? platesCalc.avg.toLocaleString() : "-"}
                  </div>
                </div>
              </div>
              <div className="flex gap-4 text-xs text-gray-500 mt-2">
                {platesCalc.itemAvgs.map((item, idx) => (
                  <span key={idx}>{item.name}: {item.avg || '-'}</span>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">{platesCalc.breakdown}</p>
              <p className="text-xs text-yellow-700 mt-1">* MS Plate-10mm values are shared with Angle/Channel section above</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 4: All 34 Items (Expandable) */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <span className="bg-gray-100 text-gray-700 rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">4</span>
              All 34 JPC Items (Optional - For Record Keeping)
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAllItems(!showAllItems)}
              className="gap-1"
            >
              {showAllItems ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {showAllItems ? "Hide" : "Show All Items"}
            </Button>
          </div>
          <CardDescription>
            Store all 34 JPC items in database. Only highlighted items are used for PVC calculation.
          </CardDescription>
        </CardHeader>
        {showAllItems && (
          <CardContent>
            {/* Header Row */}
            <div className="grid grid-cols-12 gap-2 mb-2 px-2 text-xs font-semibold text-gray-500 border-b pb-2 sticky top-0 bg-white z-10">
              <div className="col-span-1">#</div>
              <div className="col-span-4">Item Name</div>
              <div className="col-span-2">F1 (₹/MT)</div>
              <div className="col-span-2">F2 (₹/MT)</div>
              <div className="col-span-2">Avg</div>
              <div className="col-span-1">PVC</div>
            </div>

            {/* All 34 Items */}
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {JPC_ITEMS.map((item) => {
                const itemData = itemsData[item.id];
                const itemAvg = calculateItemAverage(item.id);
                const hasData = itemData?.f1 || itemData?.f2;
                const isCalcItem = item.usedInCalculation;

                return (
                  <div 
                    key={item.id} 
                    className={`grid grid-cols-12 gap-2 items-center p-2 rounded ${
                      isCalcItem ? "bg-emerald-50 border border-emerald-200" : hasData ? "bg-green-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="col-span-1 text-sm text-gray-400">{item.sno}</div>
                    <div className={`col-span-4 text-sm ${isCalcItem ? "font-semibold text-emerald-700" : ""}`}>
                      {item.name}
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        placeholder="0"
                        value={itemData?.f1 || ""}
                        onChange={(e) => updateItemData(item.id, "f1", e.target.value)}
                        className="h-8 text-sm font-mono"
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        placeholder="0"
                        value={itemData?.f2 || ""}
                        onChange={(e) => updateItemData(item.id, "f2", e.target.value)}
                        className="h-8 text-sm font-mono"
                      />
                    </div>
                    <div className="col-span-2 text-sm font-mono text-emerald-600 font-semibold">
                      {itemAvg > 0 ? itemAvg.toLocaleString() : "-"}
                    </div>
                    <div className="col-span-1">
                      {isCalcItem ? (
                        <span className="text-xs px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">✓</span>
                      ) : (
                        <span className="text-xs text-gray-300">-</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-4 pt-3 border-t flex gap-6 text-xs text-gray-500">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 bg-emerald-50 border border-emerald-200 rounded"></span>
                <span>Used in PVC Calculation</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 bg-green-50 rounded"></span>
                <span>Has Data</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 bg-white border rounded"></span>
                <span>No Data</span>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Summary & Save */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Summary - Calculated Steel Index Values
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* 4 Index Values */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
              <div className="text-sm text-gray-600 mb-1">Steel TMT Bars</div>
              <div className="text-xl font-bold text-emerald-700">
                {tmtCalc.avg > 0 ? `₹${tmtCalc.avg.toLocaleString()}` : "-"}
              </div>
              <div className="text-xs text-gray-400 mt-1">2 items</div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <div className="text-sm text-gray-600 mb-1">Steel Angle/Channel</div>
              <div className="text-xl font-bold text-green-700">
                {angleCalc.avg > 0 ? `₹${angleCalc.avg.toLocaleString()}` : "-"}
              </div>
              <div className="text-xs text-gray-400 mt-1">3 items</div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
              <div className="text-sm text-gray-600 mb-1">Steel Plates</div>
              <div className="text-xl font-bold text-red-700">
                {platesCalc.avg > 0 ? `₹${platesCalc.avg.toLocaleString()}` : "-"}
              </div>
              <div className="text-xs text-gray-400 mt-1">2 items</div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
              <div className="text-sm text-gray-600 mb-1">Steel Other Sections</div>
              <div className="text-xl font-bold text-emerald-700">
                {otherSectionsCalc.avg > 0 ? `₹${otherSectionsCalc.avg.toLocaleString()}` : "-"}
              </div>
              <div className="text-xs text-gray-400 mt-1">= (1 + 2 + 3) ÷ 3</div>
            </div>
          </div>

          {/* Options */}
          <div className="flex flex-wrap items-center gap-6 mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Checkbox
                id="importToIndices"
                checked={importToIndices}
                onCheckedChange={(checked) => setImportToIndices(checked === true)}
              />
              <Label htmlFor="importToIndices" className="text-sm cursor-pointer">
                Also update Steel Indices (for PVC calculation)
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="isProvisional"
                checked={isProvisional}
                onCheckedChange={(checked) => setIsProvisional(checked === true)}
                disabled={!importToIndices}
              />
              <Label htmlFor="isProvisional" className={`text-sm cursor-pointer ${!importToIndices ? 'text-gray-400' : ''}`}>
                Mark indices as Provisional
              </Label>
            </div>
          </div>

          {saveSuccess ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
              <p className="text-green-800 font-medium">JPC steel data saved successfully!</p>
              {saveResult && (
                <p className="text-sm text-green-600 mt-1">
                  {saveResult.created} created, {saveResult.updated} updated
                </p>
              )}
              <div className="mt-4 flex justify-center gap-3">
                <Button variant="outline" onClick={handleReset}>
                  Import Another Month
                </Button>
                <Button onClick={() => router.push("/indices/spreadsheet")}>
                  View Spreadsheet <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3 justify-end">
              <Button variant="outline" onClick={handleReset} disabled={isSaving}>
                Reset All
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving || !steelMonth || (tmtCalc.avg === 0 && angleCalc.avg === 0 && platesCalc.avg === 0 && otherSectionsCalc.avg === 0)}
                className="gap-2"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <><Database className="h-4 w-4" /> Save JPC Data</>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
