import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateAdminAccess } from "@/lib/role-auth";
import { format } from "date-fns";
import { syncFuelPricesToMPNGIndex } from "@/lib/fuel-sync";

export const dynamic = "force-dynamic";



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
