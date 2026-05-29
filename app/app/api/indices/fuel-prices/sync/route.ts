import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateAdminAccess } from "@/lib/role-auth";
import { startOfMonth, endOfMonth, format } from "date-fns";

export const dynamic = "force-dynamic";

// City-specific fuel index names
const FUEL_CITY_INDICES = [
  { name: "MPNG Fuel - Delhi", cityKey: "delhi" as const, description: "MPNG Fuel - Delhi diesel prices" },
  { name: "MPNG Fuel - Mumbai", cityKey: "mumbai" as const, description: "MPNG Fuel - Mumbai diesel prices" },
  { name: "MPNG Fuel - Chennai", cityKey: "chennai" as const, description: "MPNG Fuel - Chennai diesel prices" },
  { name: "MPNG Fuel - Kolkata", cityKey: "kolkata" as const, description: "MPNG Fuel - Kolkata diesel prices" },
];

// Ensure city-specific MPNG Fuel price indices exist in the database
async function ensureCityFuelIndicesExist() {
  const baseIndex = await prisma.priceIndex.findFirst({ where: { name: "MPNG Fuel" } });
  const baseValue = baseIndex?.baseValue ?? 93.06;

  for (const cityIdx of FUEL_CITY_INDICES) {
    await prisma.priceIndex.upsert({
      where: { name: cityIdx.name },
      update: {},
      create: {
        name: cityIdx.name,
        baseValue: baseValue,
        description: cityIdx.description,
      },
    });
  }
}

// Helper: upsert a monthly index value for a given priceIndexId
async function upsertMonthlyValue(
  priceIndexId: string,
  monthDate: Date,
  value: number,
  source: string
): Promise<{ action: "created" | "updated" | "unchanged" }> {
  const existing = await prisma.monthlyIndexValue.findFirst({
    where: { priceIndexId, month: monthDate },
  });

  if (existing) {
    if (Math.abs(existing.value - value) > 0.001) {
      await prisma.monthlyIndexValue.update({
        where: { id: existing.id },
        data: { value, source, updatedAt: new Date() },
      });
      return { action: "updated" };
    }
    return { action: "unchanged" };
  } else {
    await prisma.monthlyIndexValue.create({
      data: { priceIndexId, month: monthDate, value, isProvisional: false, source },
    });
    return { action: "created" };
  }
}

// Helper function to sync daily fuel prices to MPNG Fuel monthly index (4-city avg + per-city)
async function syncFuelPricesToMPNGIndex() {
  // Ensure city-specific indices exist
  await ensureCityFuelIndicesExist();

  // Get all fuel price indices (4-city avg + 4 city-specific)
  const mpngIndex = await prisma.priceIndex.findFirst({ where: { name: "MPNG Fuel" } });
  if (!mpngIndex) throw new Error("MPNG Fuel price index not found");

  const cityIndices: Record<string, string> = {};
  for (const cityIdx of FUEL_CITY_INDICES) {
    const idx = await prisma.priceIndex.findFirst({ where: { name: cityIdx.name } });
    if (idx) cityIndices[cityIdx.cityKey] = idx.id;
  }

  // Get all daily fuel prices
  const allFuelPrices = await prisma.dailyFuelPrice.findMany({ orderBy: { date: "asc" } });
  if (allFuelPrices.length === 0) {
    return { created: 0, updated: 0, months: [] };
  }

  // Group by month: collect per-city and 4-city-avg prices
  const monthlyData: Map<string, {
    fourCityPrices: number[];
    cityPrices: Record<string, number[]>;
    firstDate: Date;
  }> = new Map();

  for (const fp of allFuelPrices) {
    const monthKey = format(fp.date, "yyyy-MM");
    const fourCityAvg = (fp.delhi + fp.mumbai + fp.chennai + fp.kolkata) / 4;

    if (!monthlyData.has(monthKey)) {
      monthlyData.set(monthKey, {
        fourCityPrices: [],
        cityPrices: { delhi: [], mumbai: [], chennai: [], kolkata: [] },
        firstDate: startOfMonth(fp.date),
      });
    }
    const md = monthlyData.get(monthKey)!;
    md.fourCityPrices.push(fourCityAvg);
    md.cityPrices.delhi.push(fp.delhi);
    md.cityPrices.mumbai.push(fp.mumbai);
    md.cityPrices.chennai.push(fp.chennai);
    md.cityPrices.kolkata.push(fp.kolkata);
  }

  let created = 0;
  let updated = 0;
  const processedMonths: string[] = [];

  for (const [monthKey, data] of monthlyData) {
    const monthDate = data.firstDate;
    const round2 = (arr: number[]) => Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100;

    // 4-city average (existing MPNG Fuel)
    const fourCityAvg = round2(data.fourCityPrices);
    const r1 = await upsertMonthlyValue(mpngIndex.id, monthDate, fourCityAvg, "PPAC Daily Average (4-city)");
    if (r1.action === "created") created++;
    if (r1.action === "updated") updated++;

    // Per-city averages
    for (const [cityKey, indexId] of Object.entries(cityIndices)) {
      const cityAvg = round2(data.cityPrices[cityKey]);
      const r = await upsertMonthlyValue(indexId, monthDate, cityAvg, `PPAC Daily Average (${cityKey})`);
      if (r.action === "created") created++;
      if (r.action === "updated") updated++;
    }

    processedMonths.push(monthKey);
  }

  return { created, updated, months: processedMonths };
}

// POST - Sync daily fuel prices to MPNG Fuel monthly index (admin only)
export async function POST(request: NextRequest) {
  try {
    const adminCheck = await validateAdminAccess(request);
    if (!adminCheck.authorized) {
      return NextResponse.json(
        { success: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    const result = await syncFuelPricesToMPNGIndex();

    return NextResponse.json({
      success: true,
      message: `Synced MPNG Fuel index: ${result.created} created, ${result.updated} updated`,
      ...result
    });
  } catch (error) {
    console.error("Error syncing fuel prices to MPNG index:", error);
    return NextResponse.json(
      { success: false, error: "Failed to sync fuel prices" },
      { status: 500 }
    );
  }
}

// GET - Check sync status
export async function GET(request: NextRequest) {
  try {
    // Get MPNG Fuel price index
    const mpngIndex = await prisma.priceIndex.findFirst({
      where: { name: "MPNG Fuel" },
      include: {
        monthlyValues: {
          orderBy: { month: "desc" },
          take: 12
        }
      }
    });

    if (!mpngIndex) {
      return NextResponse.json({
        success: false,
        error: "MPNG Fuel price index not found"
      }, { status: 404 });
    }

    // Get distinct months from daily fuel prices
    const fuelMonths = await prisma.dailyFuelPrice.groupBy({
      by: ["date"],
      _count: true
    });

    const uniqueFuelMonths = new Set(
      fuelMonths.map(f => format(f.date, "yyyy-MM"))
    );

    const mpngMonths = new Set(
      mpngIndex.monthlyValues.map(v => format(v.month, "yyyy-MM"))
    );

    // Find months with fuel data but no MPNG index
    const missingMonths: string[] = [];
    for (const month of uniqueFuelMonths) {
      if (!mpngMonths.has(month)) {
        missingMonths.push(month);
      }
    }

    return NextResponse.json({
      success: true,
      fuelDataMonths: uniqueFuelMonths.size,
      mpngIndexMonths: mpngMonths.size,
      missingMonths: missingMonths.sort(),
      recentMPNGValues: mpngIndex.monthlyValues.map(v => ({
        month: format(v.month, "yyyy-MM"),
        value: v.value,
        isProvisional: v.isProvisional
      }))
    });
  } catch (error) {
    console.error("Error checking sync status:", error);
    return NextResponse.json(
      { success: false, error: "Failed to check sync status" },
      { status: 500 }
    );
  }
}
