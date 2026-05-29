import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import * as XLSX from 'xlsx';

export const dynamic = "force-dynamic";

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const INDEX_NAME_MAP: Record<string, string> = {
  'Labour': 'Labour',
  'MPNG Fuel': 'MPNG Fuel',
  'RBI Cement': 'RBI Cement',
  'RBI Explosives': 'RBI Explosives',
  'RBI Other Materials': 'RBI Other Materials',
  'RBI Plant Machinery': 'RBI Plant Machinery',
  'Steel Angle/Channel': 'Steel Angle/Channel',
  'Steel Other Sections': 'Steel Other Sections',
  'Steel Plates': 'Steel Plates',
  'Steel TMT Bars': 'Steel TMT Bars',
};

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));

    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59);

    const indices = await prisma.priceIndex.findMany({
      include: {
        monthlyValues: {
          where: {
            month: { gte: startDate, lte: endDate },
          },
          orderBy: { month: 'asc' },
        },
      },
    });

    // Fetch fuel prices for the year
    const fuelPrices = await prisma.dailyFuelPrice.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
      },
    });

    // Calculate monthly fuel averages
    const fuelAverages: Record<number, number> = {};
    const fuelMonthlyData: Record<number, number[]> = {};
    
    fuelPrices.forEach((fp) => {
      const month = new Date(fp.date).getMonth();
      if (!fuelMonthlyData[month]) fuelMonthlyData[month] = [];
      const avg = (fp.delhi + fp.mumbai + fp.chennai + fp.kolkata) / 4;
      fuelMonthlyData[month].push(avg);
    });

    Object.keys(fuelMonthlyData).forEach(monthStr => {
      const month = parseInt(monthStr);
      const prices = fuelMonthlyData[month];
      fuelAverages[month] = prices.reduce((a, b) => a + b, 0) / prices.length;
    });

    // Build Excel data
    const headers = ['Month', 'Labour', 'MPNG Fuel', 'RBI Cement', 'RBI Explosives', 'RBI Other Materials', 'RBI Plant Machinery', 'Steel Angle/Channel', 'Steel Other Sections', 'Steel Plates', 'Steel TMT Bars'];
    
    const rows = MONTHS.map((monthName, monthIndex) => {
      const row: (string | number | null)[] = [monthName];

      // Add values in column order
      const columnOrder = ['Labour', 'MPNG Fuel', 'RBI Cement', 'RBI Explosives', 'RBI Other Materials', 'RBI Plant Machinery', 'Steel Angle/Channel', 'Steel Other Sections', 'Steel Plates', 'Steel TMT Bars'];
      
      columnOrder.forEach(colName => {
        if (colName === 'MPNG Fuel' && fuelAverages[monthIndex] !== undefined) {
          row.push(Math.round(fuelAverages[monthIndex] * 100) / 100);
        } else {
          const index = indices.find((i: { name: string }) => i.name === colName);
          if (index) {
            const monthValue = index.monthlyValues.find((mv: { month: Date }) => {
              const mvMonth = new Date(mv.month).getMonth();
              return mvMonth === monthIndex;
            });
            row.push(monthValue ? Math.round(monthValue.value * 100) / 100 : null);
          } else {
            row.push(null);
          }
        }
      });

      return row;
    });

    // Create workbook
    const wb = XLSX.utils.book_new();
    const wsData = [
      [`Year ${year}`],
      headers,
      ...rows
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Set column widths
    ws['!cols'] = [
      { wch: 8 },  // Month
      { wch: 10 }, // Labour
      { wch: 12 }, // MPNG Fuel
      { wch: 12 }, // RBI Cement
      { wch: 14 }, // RBI Explosives
      { wch: 18 }, // RBI Other Materials
      { wch: 18 }, // RBI Plant Machinery
      { wch: 18 }, // Steel Angle/Channel
      { wch: 18 }, // Steel Other Sections
      { wch: 12 }, // Steel Plates
      { wch: 14 }, // Steel TMT Bars
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Price Indices');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Price_Indices_${year}.xlsx"`,
      },
    });
  } catch (error) {
    console.error('Error exporting indices:', error);
    return NextResponse.json({ error: 'Failed to export' }, { status: 500 });
  }
}
