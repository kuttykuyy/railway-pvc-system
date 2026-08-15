import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateAdminAccess } from "@/lib/role-auth";
import { isPlausibleDieselPrice } from "@/lib/validation";

// GET - Fetch daily fuel prices for a date range
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: any = {};
    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const fuelPrices = await prisma.dailyFuelPrice.findMany({
      where,
      orderBy: { date: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: fuelPrices,
      count: fuelPrices.length,
    });
  } catch (error) {
    console.error("Error fetching fuel prices:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch fuel prices" },
      { status: 500 }
    );
  }
}

// POST - Import daily fuel prices (admin only)
export async function POST(request: NextRequest) {
  try {
    const adminCheck = await validateAdminAccess(request);
    if (!adminCheck.authorized) {
      return NextResponse.json(
        { success: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { prices } = body;

    if (!prices || !Array.isArray(prices) || prices.length === 0) {
      return NextResponse.json(
        { success: false, error: "No price data provided" },
        { status: 400 }
      );
    }

    // Validate and process each price entry
    const validPrices = [];
    const errors = [];

    for (let i = 0; i < prices.length; i++) {
      const price = prices[i];
      
      // Validate required fields
      if (!price.date) {
        errors.push(`Row ${i + 1}: Missing date`);
        continue;
      }

      const delhi = parseFloat(price.delhi);
      const mumbai = parseFloat(price.mumbai);
      const chennai = parseFloat(price.chennai);
      const kolkata = parseFloat(price.kolkata);

      // A diesel price has to be a positive, plausible rupees-per-litre figure.
      // NaN was already refused; zero, negative and fat-fingered values were not, and
      // a single bad row here is not one bad record — every bill priced from a quarter
      // containing it carries the error, silently and for good.
      const cities: Array<[string, number]> = [
        ['Delhi', delhi], ['Mumbai', mumbai], ['Chennai', chennai], ['Kolkata', kolkata],
      ];
      const badCity = cities.find(([, v]) => !isPlausibleDieselPrice(v));
      if (badCity) {
        const [city, value] = badCity;
        errors.push(
          Number.isFinite(value)
            ? `Row ${i + 1}: ${city} diesel price of ${value} is not a believable rate per litre`
            : `Row ${i + 1}: Invalid price values`,
        );
        continue;
      }

      validPrices.push({
        date: new Date(price.date),
        delhi,
        mumbai,
        chennai,
        kolkata,
        source: price.source || "PPAC",
      });
    }

    if (validPrices.length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid price data", details: errors },
        { status: 400 }
      );
    }

    // Upsert prices (update if exists, create if not)
    let created = 0;
    let updated = 0;

    for (const priceData of validPrices) {
      const existing = await prisma.dailyFuelPrice.findUnique({
        where: { date: priceData.date },
      });

      if (existing) {
        await prisma.dailyFuelPrice.update({
          where: { date: priceData.date },
          data: priceData,
        });
        updated++;
      } else {
        await prisma.dailyFuelPrice.create({
          data: priceData,
        });
        created++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Imported ${validPrices.length} fuel prices (${created} created, ${updated} updated)`,
      created,
      updated,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error importing fuel prices:", error);
    return NextResponse.json(
      { success: false, error: "Failed to import fuel prices" },
      { status: 500 }
    );
  }
}

// DELETE - Delete fuel prices for a date range (admin only)
export async function DELETE(request: NextRequest) {
  try {
    const adminCheck = await validateAdminAccess(request);
    if (!adminCheck.authorized) {
      return NextResponse.json(
        { success: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: "Start and end dates required" },
        { status: 400 }
      );
    }

    const result = await prisma.dailyFuelPrice.deleteMany({
      where: {
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: `Deleted ${result.count} fuel price records`,
      count: result.count,
    });
  } catch (error) {
    console.error("Error deleting fuel prices:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete fuel prices" },
      { status: 500 }
    );
  }
}
