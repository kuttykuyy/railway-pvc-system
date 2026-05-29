import { toISTDate } from '@/lib/ist-utils';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import * as XLSX from "xlsx";
import { format, parse } from "date-fns";

export async function GET(request: NextRequest) {
  try {
    // Fetch all fuel prices ordered by date
    const fuelPrices = await prisma.dailyFuelPrice.findMany({
      orderBy: { date: "asc" },
    });

    if (fuelPrices.length === 0) {
      return NextResponse.json(
        { success: false, error: "No fuel price data found" },
        { status: 404 }
      );
    }

    // Group by month
    const monthlyData: Record<string, any[]> = {};
    
    fuelPrices.forEach((price) => {
      const monthKey = format(new Date(price.date), "yyyy-MM");
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = [];
      }
      
      const avg = (price.delhi + price.mumbai + price.chennai + price.kolkata) / 4;
      
      monthlyData[monthKey].push({
        Date: format(new Date(price.date), "dd-MMM-yyyy"),
        Delhi: price.delhi,
        Mumbai: price.mumbai,
        Chennai: price.chennai,
        Kolkata: price.kolkata,
        "4-City Avg": parseFloat(avg.toFixed(2)),
        Source: price.source || "PPAC",
      });
    });

    // Create workbook
    const workbook = XLSX.utils.book_new();

    // Add summary sheet first
    const summaryData: any[] = [];
    Object.keys(monthlyData)
      .sort()
      .forEach((monthKey) => {
        const monthPrices = monthlyData[monthKey];
        const delhiAvg = monthPrices.reduce((sum: number, p: any) => sum + p.Delhi, 0) / monthPrices.length;
        const mumbaiAvg = monthPrices.reduce((sum: number, p: any) => sum + p.Mumbai, 0) / monthPrices.length;
        const chennaiAvg = monthPrices.reduce((sum: number, p: any) => sum + p.Chennai, 0) / monthPrices.length;
        const kolkataAvg = monthPrices.reduce((sum: number, p: any) => sum + p.Kolkata, 0) / monthPrices.length;
        const overallAvg = (delhiAvg + mumbaiAvg + chennaiAvg + kolkataAvg) / 4;

        const [year, month] = monthKey.split("-");
        const monthName = format(parse(monthKey, "yyyy-MM", new Date()), "MMM yyyy");

        summaryData.push({
          Month: monthName,
          Days: monthPrices.length,
          "Delhi Avg": parseFloat(delhiAvg.toFixed(2)),
          "Mumbai Avg": parseFloat(mumbaiAvg.toFixed(2)),
          "Chennai Avg": parseFloat(chennaiAvg.toFixed(2)),
          "Kolkata Avg": parseFloat(kolkataAvg.toFixed(2)),
          "Overall Avg": parseFloat(overallAvg.toFixed(2)),
        });
      });

    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Monthly Summary");

    // Add individual month sheets
    Object.keys(monthlyData)
      .sort()
      .reverse() // Most recent first
      .forEach((monthKey) => {
        const sheetName = format(parse(monthKey, "yyyy-MM", new Date()), "MMM-yy");
        const monthSheet = XLSX.utils.json_to_sheet(monthlyData[monthKey]);
        
        // Set column widths
        monthSheet["!cols"] = [
          { wch: 12 }, // Date
          { wch: 8 },  // Delhi
          { wch: 8 },  // Mumbai
          { wch: 8 },  // Chennai
          { wch: 8 },  // Kolkata
          { wch: 10 }, // Avg
          { wch: 6 },  // Source
        ];
        
        XLSX.utils.book_append_sheet(workbook, monthSheet, sheetName);
      });

    // Generate Excel buffer
    const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    // Return as downloadable file
    const response = new NextResponse(excelBuffer);
    response.headers.set(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    response.headers.set(
      "Content-Disposition",
      `attachment; filename="PPAC_Diesel_Prices_${format(toISTDate(new Date()), "yyyy-MM-dd")}.xlsx"`
    );

    return response;
  } catch (error) {
    console.error("Error exporting fuel prices:", error);
    return NextResponse.json(
      { success: false, error: "Failed to export fuel prices" },
      { status: 500 }
    );
  }
}
