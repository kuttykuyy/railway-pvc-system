import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = "force-dynamic";

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Map database index names to response keys
const INDEX_NAME_MAP: Record<string, string> = {
  'Labour': 'labour',
  'MPNG Fuel': 'mpngFuel',
  'RBI Cement': 'rbiCite',
  'RBI Explosives': 'rbiExplosives',
  'RBI Other Materials': 'rbiOtherMaterials',
  'RBI Plant Machinery': 'rbiPlantMachinery',
  'Steel Angle/Channel': 'steelAngleChannel',
  'Steel Other Sections': 'steelOtherSections',
  'Steel Plates': 'steelPlates',
  'Steel TMT Bars': 'steelTMTBars',
  // City-wise steel indices
  'Steel TMT Bars - Delhi': 'steelTMTBars_Delhi',
  'Steel Angle/Channel - Delhi': 'steelAngleChannel_Delhi',
  'Steel Plates - Delhi': 'steelPlates_Delhi',
  'Steel Other Sections - Delhi': 'steelOtherSections_Delhi',
  'Steel TMT Bars - Mumbai': 'steelTMTBars_Mumbai',
  'Steel Angle/Channel - Mumbai': 'steelAngleChannel_Mumbai',
  'Steel Plates - Mumbai': 'steelPlates_Mumbai',
  'Steel Other Sections - Mumbai': 'steelOtherSections_Mumbai',
  'Steel TMT Bars - Chennai': 'steelTMTBars_Chennai',
  'Steel Angle/Channel - Chennai': 'steelAngleChannel_Chennai',
  'Steel Plates - Chennai': 'steelPlates_Chennai',
  'Steel Other Sections - Chennai': 'steelOtherSections_Chennai',
  'Steel TMT Bars - Kolkata': 'steelTMTBars_Kolkata',
  'Steel Angle/Channel - Kolkata': 'steelAngleChannel_Kolkata',
  'Steel Plates - Kolkata': 'steelPlates_Kolkata',
  'Steel Other Sections - Kolkata': 'steelOtherSections_Kolkata',
};

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));

    // Fetch all indices with their monthly values for the given year
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59);

    const indices = await prisma.priceIndex.findMany({
      include: {
        monthlyValues: {
          where: {
            month: {
              gte: startDate,
              lte: endDate,
            },
          },
          orderBy: { month: 'asc' },
        },
      },
    });

    // Fetch fuel prices for the year
    const fuelPrices = await prisma.dailyFuelPrice.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    // Calculate monthly fuel averages with breakdown
    const fuelAverages: Record<number, number> = {};
    const fuelBreakdowns: Record<number, { days: number; delhi: number; mumbai: number; chennai: number; kolkata: number }> = {};
    const fuelMonthlyData: Record<number, number[]> = {};
    const fuelCityTotals: Record<number, { delhi: number; mumbai: number; chennai: number; kolkata: number; count: number }> = {};
    
    fuelPrices.forEach((fp) => {
      const month = new Date(fp.date).getMonth();
      if (!fuelMonthlyData[month]) fuelMonthlyData[month] = [];
      if (!fuelCityTotals[month]) fuelCityTotals[month] = { delhi: 0, mumbai: 0, chennai: 0, kolkata: 0, count: 0 };
      // Average of 4 cities
      const avg = (fp.delhi + fp.mumbai + fp.chennai + fp.kolkata) / 4;
      fuelMonthlyData[month].push(avg);
      fuelCityTotals[month].delhi += fp.delhi;
      fuelCityTotals[month].mumbai += fp.mumbai;
      fuelCityTotals[month].chennai += fp.chennai;
      fuelCityTotals[month].kolkata += fp.kolkata;
      fuelCityTotals[month].count += 1;
    });

    Object.keys(fuelMonthlyData).forEach(monthStr => {
      const month = parseInt(monthStr);
      const prices = fuelMonthlyData[month];
      fuelAverages[month] = prices.reduce((a, b) => a + b, 0) / prices.length;
      const ct = fuelCityTotals[month];
      fuelBreakdowns[month] = {
        days: ct.count,
        delhi: parseFloat((ct.delhi / ct.count).toFixed(2)),
        mumbai: parseFloat((ct.mumbai / ct.count).toFixed(2)),
        chennai: parseFloat((ct.chennai / ct.count).toFixed(2)),
        kolkata: parseFloat((ct.kolkata / ct.count).toFixed(2)),
      };
    });

    // Fetch JPC steel items for the year for formula breakdowns
    const jpcItems = await prisma.jpcSteelItem.findMany({
      where: {
        month: { gte: startDate, lte: endDate },
      },
      orderBy: { month: 'asc' },
    });

    // Group JPC items by month+city
    const jpcByMonthCity: Record<string, Record<string, { f1: number | null; f2: number | null; avg: number | null; name: string }>> = {};
    jpcItems.forEach(item => {
      const monthIdx = new Date(item.month).getMonth();
      const key = `${monthIdx}_${item.city}`;
      if (!jpcByMonthCity[key]) jpcByMonthCity[key] = {};
      jpcByMonthCity[key][item.itemCode] = { 
        f1: item.f1, f2: item.f2, avg: item.average, name: item.itemName 
      };
    });

    // Helper to build steel formula string and structured detail from JPC items
    function getSteelFormulaAndDetail(monthIdx: number, city: string, steelType: string): { formula: string | null; detail: any | null } {
      const key = `${monthIdx}_${city}`;
      const items = jpcByMonthCity[key];
      if (!items) return { formula: null, detail: null };

      const fmt = (v: number | null | undefined) => v != null ? v.toFixed(0) : '-';

      if (steelType === 'TMT') {
        const t10 = items['tmt_10mm'];
        const t25 = items['tmt_25mm'];
        if (!t10 && !t25) return { formula: null, detail: null };
        const vals = [t10?.f1, t10?.f2, t25?.f1, t25?.f2].filter(v => v != null && v > 0);
        return {
          formula: `TMT = (10mm F1:${fmt(t10?.f1)} + F2:${fmt(t10?.f2)} + 25mm F1:${fmt(t25?.f1)} + F2:${fmt(t25?.f2)}) ÷ ${vals.length}`,
          detail: {
            type: 'TMT',
            formulaDesc: 'Average of all fortnightly values',
            items: [
              { name: 'TMT 10mm', f1: t10?.f1 ?? null, f2: t10?.f2 ?? null, avg: t10?.avg ?? null },
              { name: 'TMT 25mm', f1: t25?.f1 ?? null, f2: t25?.f2 ?? null, avg: t25?.avg ?? null },
            ],
            count: vals.length,
          }
        };
      }
      if (steelType === 'ANGLE_CHANNEL') {
        const isa = items['angle_75x75x6mm'];
        const plate = items['plate_10mm'];
        const ismc = items['channel_150x75mm'];
        if (!isa && !plate && !ismc) return { formula: null, detail: null };
        return {
          formula: `Angle = Avg(ISA75:${fmt(isa?.avg)}, Plate10:${fmt(plate?.avg)}, ISMC150:${fmt(ismc?.avg)})`,
          detail: {
            type: 'ANGLE_CHANNEL',
            formulaDesc: 'Average of item averages',
            items: [
              { name: 'ISA 75×75×6', f1: isa?.f1 ?? null, f2: isa?.f2 ?? null, avg: isa?.avg ?? null },
              { name: 'MS Plate 10mm', f1: plate?.f1 ?? null, f2: plate?.f2 ?? null, avg: plate?.avg ?? null },
              { name: 'ISMC 150×75', f1: ismc?.f1 ?? null, f2: ismc?.f2 ?? null, avg: ismc?.avg ?? null },
            ],
          }
        };
      }
      if (steelType === 'PLATES') {
        const p10 = items['plate_10mm'];
        const p25 = items['plate_25mm'];
        if (!p10 && !p25) return { formula: null, detail: null };
        return {
          formula: `Plates = Avg(10mm:${fmt(p10?.avg)}, 25mm:${fmt(p25?.avg)})`,
          detail: {
            type: 'PLATES',
            formulaDesc: 'Average of plate averages',
            items: [
              { name: 'MS Plate 10mm', f1: p10?.f1 ?? null, f2: p10?.f2 ?? null, avg: p10?.avg ?? null },
              { name: 'MS Plate 25mm', f1: p25?.f1 ?? null, f2: p25?.f2 ?? null, avg: p25?.avg ?? null },
            ],
          }
        };
      }
      if (steelType === 'OTHER_SECTIONS') {
        return {
          formula: `Other = (TMT + Angle + Plates) ÷ 3 [GCC 46A.9]`,
          detail: {
            type: 'OTHER_SECTIONS',
            formulaDesc: '(TMT + Angle/Channel + Plates) ÷ 3 as per GCC 2022 Clause 46A.9',
            items: [],
          }
        };
      }
      return { formula: null, detail: null };
    }

    // Map steel key suffixes to types
    const steelKeyToType: Record<string, string> = {
      'steelTMTBars': 'TMT', 'steelAngleChannel': 'ANGLE_CHANNEL',
      'steelPlates': 'PLATES', 'steelOtherSections': 'OTHER_SECTIONS',
    };
    const steelCityFromKey = (key: string): string => {
      if (key.endsWith('_Delhi')) return 'Delhi';
      if (key.endsWith('_Mumbai')) return 'Mumbai';
      if (key.endsWith('_Chennai')) return 'Chennai';
      if (key.endsWith('_Kolkata')) return 'Kolkata';
      return 'Chennai'; // Default
    };
    const steelBaseKey = (key: string): string => {
      return key.replace(/_Delhi$|_Mumbai$|_Chennai$|_Kolkata$/, '');
    };

    // Build response data for each month
    const data = MONTHS.map((monthName, monthIndex) => {
      const row: Record<string, any> = { month: monthName };

      // Initialize all columns with null
      Object.values(INDEX_NAME_MAP).forEach(key => {
        row[key] = { value: null, isProvisional: false, formula: null };
      });

      // Add index values with isProvisional
      indices.forEach((index: { name: string; monthlyValues: { id: string; month: Date; value: number; isProvisional?: boolean }[] }) => {
        const key = INDEX_NAME_MAP[index.name];
        if (key) {
          const monthValue = index.monthlyValues.find((mv: { month: Date; value: number }) => {
            const mvMonth = new Date(mv.month).getMonth();
            return mvMonth === monthIndex;
          });
          if (monthValue) {
            row[key] = { id: monthValue.id, value: monthValue.value, isProvisional: monthValue.isProvisional ?? false, formula: null, steelDetail: null };
            
            // Add steel formula if applicable
            const base = steelBaseKey(key);
            const sType = steelKeyToType[base];
            if (sType) {
              const city = steelCityFromKey(key);
              const { formula, detail } = getSteelFormulaAndDetail(monthIndex, city, sType);
              if (formula) row[key].formula = formula;
              if (detail) row[key].steelDetail = detail;
            }
          }
        }
      });

      // Add fuel average (override MPNG Fuel with actual diesel data if available)
      if (fuelAverages[monthIndex] !== undefined) {
        const bd = fuelBreakdowns[monthIndex];
        row.mpngFuel = { 
          value: fuelAverages[monthIndex], 
          isProvisional: false,
          formula: bd ? `Fuel = Avg of ${bd.days} days\nDelhi: ${bd.delhi} | Mumbai: ${bd.mumbai}\nChennai: ${bd.chennai} | Kolkata: ${bd.kolkata}\n= (D+M+C+K)/4 per day, then monthly avg` : null 
        };
      }

      return row;
    });

    return NextResponse.json({ year, data });
  } catch (error) {
    console.error('Error fetching yearly indices:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
