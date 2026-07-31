"use client";

/**
 * JPC steel rate entry — ALL FOUR CITIES in one form.
 *
 * GCC-2022 Cl.46A.9(2) assigns a JPC city per railway zone, so every city's index
 * matters (not just Chennai). This page enters the six calculation items for
 * Kolkata / Delhi / Mumbai / Chennai side by side — one row per fortnight — and
 * saves all cities in one action. Saving posts per city to /api/indices/jpc-items,
 * which writes the city-suffixed indices (Chennai also updates the unsuffixed
 * default, for backward compatibility).
 */

import { useState, useEffect, Fragment } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { BackButton } from "@/components/ui/back-button";
import { Loader2, Copy, Database, Info, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "react-hot-toast";
import { getClientRoleInfo } from "@/lib/role-auth-client";
import { JPC_ITEMS, CATEGORY_DISPLAY_NAMES } from "@/lib/jpc-items";

type ItemData = { f1: string; f2: string };
type AllItemsData = Record<string, ItemData>;
type CityData = Record<string, AllItemsData>;

// Column order matches the JPC bulletin, so eyes track straight across.
const CITIES = ["Kolkata", "Delhi", "Mumbai", "Chennai"] as const;

// The six 46A.9(1) calculation items, as grid rows.
const CALC_ROWS: { id: string; label: string }[] = [
  { id: "tmt_10mm", label: "TMT 10mm" },
  { id: "tmt_25mm", label: "TMT 25mm" },
  { id: "angle_75x75x6mm", label: "ISA 75×75×6" },
  { id: "plate_10mm", label: "MS Plate 10mm" },
  { id: "channel_150x75mm", label: "ISMC 150×75" },
  { id: "plate_25mm", label: "MS Plate 25mm" },
];
const CALC_IDS = CALC_ROWS.map((r) => r.id);

const SECTIONS: { key: string; title: string; note: string; rows: string[]; items: string[] }[] = [
  { key: "tmt", title: "TMT Bars", note: "10mm + 25mm avg", rows: ["tmt_10mm", "tmt_25mm"], items: ["tmt_10mm", "tmt_25mm"] },
  { key: "angle", title: "Angle, Channel, Joist", note: "ISA 75×6 + Plate 10mm + ISMC 150×75", rows: ["angle_75x75x6mm", "plate_10mm", "channel_150x75mm"], items: ["angle_75x75x6mm", "plate_10mm", "channel_150x75mm"] },
  { key: "plates", title: "Plates", note: "Plate 10mm (shared from above) + Plate 25mm", rows: ["plate_25mm"], items: ["plate_10mm", "plate_25mm"] },
];

export default function SteelImportPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { isAdmin } = getClientRoleInfo(session);

  const [steelMonth, setSteelMonth] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [importToIndices, setImportToIndices] = useState(true);
  const [isProvisional, setIsProvisional] = useState(false);
  const [showAllItems, setShowAllItems] = useState(false);
  const [allItemsCity, setAllItemsCity] = useState<string>("Chennai");

  const emptyItems = (): AllItemsData => {
    const d: AllItemsData = {};
    JPC_ITEMS.forEach((item) => { d[item.id] = { f1: "", f2: "" }; });
    return d;
  };
  const emptyCityData = (): CityData => {
    const d: CityData = {};
    CITIES.forEach((c) => { d[c] = emptyItems(); });
    return d;
  };
  const [cityData, setCityData] = useState<CityData>(emptyCityData);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) { router.push("/auth/signin"); return; }
    if (!isAdmin) { router.push("/indices"); return; }
    (async () => {
      try {
        const response = await fetch("/api/indices/available-date-range");
        if (response.ok) {
          const result = await response.json();
          if (result.maxMonth) setSteelMonth(result.maxMonth.substring(0, 7));
        }
      } catch (error) {
        console.error("Error fetching latest month:", error);
      }
    })();
  }, [session, status, router, isAdmin]);

  // Load every city's existing values for the month, in parallel.
  useEffect(() => {
    if (!steelMonth) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const results = await Promise.all(
          CITIES.map(async (city) => {
            const res = await fetch(`/api/indices/jpc-items?month=${steelMonth}&city=${city}`);
            const data = await res.json().catch(() => null);
            return { city, data };
          }),
        );
        if (cancelled) return;
        const next = emptyCityData();
        let loaded = 0;
        for (const { city, data } of results) {
          if (data?.success && data.items) {
            Object.entries(data.items).forEach(([itemCode, itemData]: [string, any]) => {
              if (next[city][itemCode]) {
                next[city][itemCode] = {
                  f1: itemData.f1?.toString() || "",
                  f2: itemData.f2?.toString() || "",
                };
              }
            });
            if (data.itemCount > 0) loaded++;
          }
        }
        setCityData(next);
        if (loaded > 0) toast.success(`Loaded existing records for ${loaded} city(ies) — ${steelMonth}`);
      } catch (error) {
        console.error("Error loading existing data:", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [steelMonth]);

  const setValue = (city: string, itemId: string, field: "f1" | "f2", value: string) => {
    setCityData((prev) => ({
      ...prev,
      [city]: { ...prev[city], [itemId]: { ...prev[city][itemId], [field]: value } },
    }));
  };

  const num = (s: string | undefined) => {
    const v = parseFloat(s || "");
    return !isNaN(v) && v > 0 ? v : 0;
  };

  // Item avg = (F1 + F2) / 2, tolerating a single filled fortnight.
  const itemAvg = (city: string, itemId: string): number => {
    const d = cityData[city]?.[itemId];
    const f1 = num(d?.f1), f2 = num(d?.f2);
    if (!f1 && !f2) return 0;
    if (!f1) return f2;
    if (!f2) return f1;
    return parseFloat(((f1 + f2) / 2).toFixed(2));
  };

  // TMT is the raw average of all four fortnight values (matches the old page).
  const tmtAvg = (city: string): number => {
    const vals = [
      num(cityData[city]?.tmt_10mm?.f1), num(cityData[city]?.tmt_10mm?.f2),
      num(cityData[city]?.tmt_25mm?.f1), num(cityData[city]?.tmt_25mm?.f2),
    ].filter((v) => v > 0);
    if (!vals.length) return 0;
    return parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
  };

  const sectionAvg = (sectionKey: string, city: string): number => {
    if (sectionKey === "tmt") return tmtAvg(city);
    const section = SECTIONS.find((s) => s.key === sectionKey)!;
    const avgs = section.items.map((id) => itemAvg(city, id)).filter((v) => v > 0);
    if (!avgs.length) return 0;
    return parseFloat((avgs.reduce((a, b) => a + b, 0) / avgs.length).toFixed(2));
  };

  // Other Sections = (TMT + Angle + Plates) / 3, per GCC 46A.9.
  const otherSectionsAvg = (city: string): number => {
    const vals = [sectionAvg("tmt", city), sectionAvg("angle", city), sectionAvg("plates", city)].filter((v) => v > 0);
    if (!vals.length) return 0;
    return parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
  };

  const cityComplete = (city: string): boolean =>
    ["tmt", "angle", "plates"].every((s) => sectionAvg(s, city) > 0);

  const cityHasAnyData = (city: string): boolean =>
    CALC_IDS.some((id) => {
      const d = cityData[city]?.[id];
      return !!(d?.f1 || d?.f2);
    });

  const copyF1toF2 = () => {
    setCityData((prev) => {
      const next: CityData = JSON.parse(JSON.stringify(prev));
      CITIES.forEach((city) => {
        JPC_ITEMS.forEach((item) => {
          const d = next[city][item.id];
          if (d.f1 && !d.f2) d.f2 = d.f1;
        });
      });
      return next;
    });
    toast.success("Copied F1 values into empty F2 fields");
  };

  const handleSave = async () => {
    if (!steelMonth) { toast.error("Select a month first"); return; }
    const citiesToSave = CITIES.filter((c) => cityHasAnyData(c));
    if (!citiesToSave.length) { toast.error("Enter at least one rate first"); return; }

    setIsSaving(true);
    try {
      let created = 0, updated = 0, idxCreated = 0, idxUpdated = 0;
      const failed: string[] = [];
      // Sequential on purpose: four quick posts, and per-city errors stay attributable.
      for (const city of citiesToSave) {
        const response = await fetch("/api/indices/jpc-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            month: steelMonth,
            city,
            items: cityData[city],
            source: `JPC ${steelMonth}`,
            importToIndices,
            isProvisional,
          }),
        });
        const data = await response.json().catch(() => null);
        if (data?.success) {
          created += data.results?.created || 0;
          updated += data.results?.updated || 0;
          idxCreated += data.indexImportResults?.created || 0;
          idxUpdated += data.indexImportResults?.updated || 0;
        } else {
          failed.push(city);
        }
      }
      if (failed.length) {
        toast.error(`Saved with errors — failed for: ${failed.join(", ")}`);
      } else {
        let msg = `Saved ${citiesToSave.length} city(ies): ${created} created, ${updated} updated`;
        if (importToIndices) msg += ` | Indices: ${idxCreated} created, ${idxUpdated} updated`;
        toast.success(msg);
      }
    } catch (error: any) {
      console.error("Save error:", error);
      toast.error(error.message || "Failed to save JPC items");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setCityData(emptyCityData());
  };

  if (status === "loading" || !session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  const completeCount = CITIES.filter((c) => cityComplete(c)).length;

  const inputCell = (city: string, itemId: string, field: "f1" | "f2") => (
    <td key={`${city}-${field}`} className="px-1 py-0.5">
      <Input
        type="number"
        value={cityData[city]?.[itemId]?.[field] || ""}
        onChange={(e) => setValue(city, itemId, field, e.target.value)}
        className="h-8 text-sm font-mono text-right px-2"
      />
    </td>
  );

  const avgCells = (sectionKey: string) =>
    CITIES.map((city) => {
      const v = sectionAvg(sectionKey, city);
      return (
        <td key={city} className="px-1 py-1.5 text-center font-semibold text-emerald-700">
          {v > 0 ? v.toLocaleString("en-IN") : "–"}
        </td>
      );
    });

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      <BackButton href="/indices" label="Back to Indices" />

      <div className="mb-6">
        <h1 className="text-2xl font-bold">Import Steel Indices (JPC)</h1>
        <p className="text-gray-600 mt-1">Enter JPC rates for all four cities in one form — per GCC-2022 Cl.46A.9</p>
      </div>

      <Card className="mb-6 border-emerald-200 bg-emerald-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-emerald-800">
            <Info className="h-5 w-5" />
            Calculation Method (GCC 2022 Clause 46A.9)
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-emerald-700 space-y-1">
          <p><strong>TMT Bars:</strong> avg of 10mm &amp; 25mm TMT · <strong>Angle/Channel:</strong> avg of ISA 75×6, MS Plate-10mm, ISMC 150×75 · <strong>Plates:</strong> avg of MS Plate-10mm &amp; 25mm · <strong>Other Sections:</strong> (TMT + Angle + Plates) ÷ 3</p>
          <p className="text-xs text-emerald-600">Item avg = (F1 + F2) ÷ 2 · Each city feeds its own zone&apos;s index (46A.9(2)): Kolkata → ER/ECR/ECoR/NFR/SER/SECR · Delhi → NR/NCR/NER/NWR · Mumbai → CR/WR/WCR · Chennai → SR/SCR/SWR</p>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="bg-emerald-100 text-emerald-700 rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">1</span>
            Select Month
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <Label className="text-xs text-gray-600">Month</Label>
              <Input type="month" value={steelMonth} onChange={(e) => setSteelMonth(e.target.value)} className="max-w-xs" />
            </div>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-500 mt-5" />}
            <span className="text-sm text-gray-500 mt-5">{completeCount} of {CITIES.length} cities complete</span>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="bg-amber-100 text-amber-700 rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">2</span>
            Enter Rates (₹/MT) — All Cities
          </CardTitle>
          <CardDescription>One row per fortnight. City order matches the JPC bulletin.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 640 }}>
              <thead>
                <tr className="text-gray-600">
                  <th className="text-left px-2 py-1.5 font-medium w-[130px]">Item</th>
                  <th className="text-center px-1 py-1.5 font-medium w-[44px] text-xs">Fortnight</th>
                  {CITIES.map((city) => (
                    <th key={city} className={`text-center px-1 py-1.5 font-medium ${city === "Chennai" ? "text-emerald-700" : ""}`}>{city}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SECTIONS.map((section) => (
                  <Fragment key={section.key}>
                    <tr>
                      <td colSpan={2 + CITIES.length} className={`px-2 pt-3 pb-1.5 font-semibold rounded ${section.key === "plates" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
                        {section.title} <span className="font-normal text-xs opacity-75">({section.note})</span>
                      </td>
                    </tr>
                    {section.rows.map((itemId) => {
                      const row = CALC_ROWS.find((r) => r.id === itemId)!;
                      return (
                        <Fragment key={itemId}>
                          <tr>
                            <td rowSpan={2} className="px-2 py-1 text-gray-600 align-middle border-b border-slate-100">{row.label}</td>
                            <td className="text-center text-[11px] font-medium text-gray-400 px-1">F1</td>
                            {CITIES.map((city) => inputCell(city, itemId, "f1"))}
                          </tr>
                          <tr className="border-b border-slate-100">
                            <td className="text-center text-[11px] font-medium text-gray-400 px-1">F2</td>
                            {CITIES.map((city) => inputCell(city, itemId, "f2"))}
                          </tr>
                        </Fragment>
                      );
                    })}
                    <tr className="bg-slate-50">
                      <td colSpan={2} className="px-2 py-1.5 font-semibold text-slate-700">{section.title} Avg</td>
                      {avgCells(section.key)}
                    </tr>
                  </Fragment>
                ))}
                <tr className="bg-slate-100 border-t border-slate-200">
                  <td colSpan={2} className="px-2 py-1.5 font-semibold text-slate-700">Other Sections <span className="font-normal text-xs text-slate-500">((TMT + Angle + Plates) ÷ 3)</span></td>
                  {CITIES.map((city) => {
                    const v = otherSectionsAvg(city);
                    return (
                      <td key={city} className="px-1 py-1.5 text-center font-semibold text-slate-700">
                        {v > 0 ? v.toLocaleString("en-IN") : "–"}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-amber-700 mt-2">* MS Plate-10mm feeds both Angle/Channel and Plates — entered once.</p>
          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={copyF1toF2}>
              <Copy className="h-4 w-4 mr-1.5" /> Copy F1 → F2 (empty fields only)
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <span className="bg-slate-100 text-slate-700 rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">3</span>
              All 34 JPC Items (Optional — For Record Keeping)
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => setShowAllItems(!showAllItems)}>
              {showAllItems ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
              {showAllItems ? "Hide" : "Show All Items"}
            </Button>
          </div>
          <CardDescription>Non-calculation items, stored for reference. Pick a city, then enter its values.</CardDescription>
        </CardHeader>
        {showAllItems && (
          <CardContent>
            <div className="flex gap-2 mb-4">
              {CITIES.map((city) => (
                <Button
                  key={city}
                  variant={allItemsCity === city ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAllItemsCity(city)}
                  className={allItemsCity === city ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                >
                  {city}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
              {JPC_ITEMS.filter((item) => !CALC_IDS.includes(item.id)).map((item) => (
                <div key={item.id} className="grid grid-cols-[1fr_90px_90px] gap-2 items-center">
                  <Label className="text-xs text-gray-600 truncate" title={item.name}>
                    {item.name}
                    <span className="text-gray-400 ml-1">({CATEGORY_DISPLAY_NAMES[item.category] || item.category})</span>
                  </Label>
                  <Input
                    type="number"
                    placeholder="F1"
                    value={cityData[allItemsCity]?.[item.id]?.f1 || ""}
                    onChange={(e) => setValue(allItemsCity, item.id, "f1", e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                  <Input
                    type="number"
                    placeholder="F2"
                    value={cityData[allItemsCity]?.[item.id]?.f2 || ""}
                    onChange={(e) => setValue(allItemsCity, item.id, "f2", e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="importToIndices"
                  checked={importToIndices}
                  onCheckedChange={(v) => setImportToIndices(!!v)}
                />
                <Label htmlFor="importToIndices" className="text-sm cursor-pointer">
                  Also update steel price indices (used in PVC calculations)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isProvisional"
                  checked={isProvisional}
                  onCheckedChange={(v) => setIsProvisional(!!v)}
                  disabled={!importToIndices}
                />
                <Label htmlFor="isProvisional" className={`text-sm cursor-pointer ${!importToIndices ? "text-gray-400" : ""}`}>
                  Mark as provisional (not final published values)
                </Label>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReset} disabled={isSaving}>
                Reset All
              </Button>
              <Button onClick={handleSave} disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                {isSaving ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                ) : (
                  <><Database className="h-4 w-4" /> Save All Cities</>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
