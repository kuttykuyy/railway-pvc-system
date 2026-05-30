import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as xlsx from 'xlsx';
import { format, startOfMonth } from 'date-fns';

const prisma = new PrismaClient();

// City-specific fuel index names
const FUEL_CITY_INDICES = [
  { name: "MPNG Fuel - Delhi", cityKey: "delhi" as const, description: "MPNG Fuel - Delhi diesel prices" },
  { name: "MPNG Fuel - Mumbai", cityKey: "mumbai" as const, description: "MPNG Fuel - Mumbai diesel prices" },
  { name: "MPNG Fuel - Chennai", cityKey: "chennai" as const, description: "MPNG Fuel - Chennai diesel prices" },
  { name: "MPNG Fuel - Kolkata", cityKey: "kolkata" as const, description: "MPNG Fuel - Kolkata diesel prices" },
];

async function ensureCityFuelIndicesExist() {
  console.log('Ensuring city-specific fuel price indices exist...');
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

async function main() {
  const file = path.resolve('C:/Users/Admin/Downloads/PPAC_Diesel_Prices_2026-04-20.xlsx');
  console.log(`Reading Excel file: ${file}`);
  
  const wb = xlsx.readFile(file);
  const monthSheetRegex = /^[A-Za-z]{3}-\d{2}$/;
  const sheets = wb.SheetNames.filter(name => monthSheetRegex.test(name));
  
  console.log(`Found ${sheets.length} monthly sheets to parse.`);
  
  // Make sure indices exist
  await ensureCityFuelIndicesExist();
  
  const dailyPricesToInsert: any[] = [];
  
  for (const sheetName of sheets) {
    const sheet = wb.Sheets[sheetName];
    const rows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    
    // Skip header row
    for (const row of rows.slice(1)) {
      if (!row[0]) continue;
      
      const dateStr = row[0].toString().trim();
      const dateObj = new Date(dateStr);
      if (isNaN(dateObj.getTime())) {
        console.warn(`Invalid date format in sheet ${sheetName}: ${dateStr}`);
        continue;
      }
      
      const delhi = parseFloat(row[1]);
      const mumbai = parseFloat(row[2]);
      const chennai = parseFloat(row[3]);
      const kolkata = parseFloat(row[4]);
      
      if (isNaN(delhi) || isNaN(mumbai) || isNaN(chennai) || isNaN(kolkata)) {
        continue;
      }
      
      dailyPricesToInsert.push({
        date: dateObj,
        delhi,
        mumbai,
        chennai,
        kolkata,
        source: 'PPAC'
      });
    }
  }
  
  console.log(`Parsed ${dailyPricesToInsert.length} daily price records. Upserting into DB...`);
  
  // Upsert daily fuel prices in batches to avoid Prisma/DB overload
  const BATCH_SIZE = 100;
  let created = 0;
  let updated = 0;
  
  for (let i = 0; i < dailyPricesToInsert.length; i += BATCH_SIZE) {
    const batch = dailyPricesToInsert.slice(i, i + BATCH_SIZE);
    
    await Promise.all(batch.map(async (record) => {
      try {
        const existing = await prisma.dailyFuelPrice.findUnique({
          where: { date: record.date }
        });
        
        if (existing) {
          if (
            existing.delhi !== record.delhi ||
            existing.mumbai !== record.mumbai ||
            existing.chennai !== record.chennai ||
            existing.kolkata !== record.kolkata
          ) {
            await prisma.dailyFuelPrice.update({
              where: { date: record.date },
              data: {
                delhi: record.delhi,
                mumbai: record.mumbai,
                chennai: record.chennai,
                kolkata: record.kolkata,
                source: 'PPAC'
              }
            });
            updated++;
          }
        } else {
          await prisma.dailyFuelPrice.create({
            data: record
          });
          created++;
        }
      } catch (e: any) {
        console.error(`Error upserting record for ${record.date.toISOString()}:`, e.message);
      }
    }));
    
    process.stdout.write(`  Processed ${Math.min(i + BATCH_SIZE, dailyPricesToInsert.length)}/${dailyPricesToInsert.length} records\r`);
  }
  
  console.log(`\nDaily prices import finished. Created: ${created}, Updated: ${updated}`);
  
  // Now sync these daily prices to the monthly indices (4-city average and per-city indices)
  console.log('\nSyncing daily fuel prices to monthly price indices...');
  
  const mpngIndex = await prisma.priceIndex.findFirst({ where: { name: "MPNG Fuel" } });
  if (!mpngIndex) throw new Error("MPNG Fuel price index not found");
  
  const cityIndices: Record<string, string> = {};
  for (const cityIdx of FUEL_CITY_INDICES) {
    const idx = await prisma.priceIndex.findFirst({ where: { name: cityIdx.name } });
    if (idx) cityIndices[cityIdx.cityKey] = idx.id;
  }
  
  // Group by month
  const monthlyData: Map<string, {
    fourCityPrices: number[];
    cityPrices: Record<string, number[]>;
    firstDate: Date;
  }> = new Map();
  
  const allFuelPrices = await prisma.dailyFuelPrice.findMany({ orderBy: { date: "asc" } });
  
  for (const fp of allFuelPrices) {
    const monthKey = format(fp.date, "yyyy-MM");
    const fourCityAvg = (fp.delhi + fp.mumbai + fp.chennai + fp.kolkata) / 4;
    
    if (!monthlyData.has(monthKey)) {
      monthlyData.set(monthKey, {
        fourCityPrices: [],
        cityPrices: { delhi: [], mumbai: [], chennai: [], kolkata: [] },
        firstDate: startOfMonth(fp.date)
      });
    }
    const md = monthlyData.get(monthKey)!;
    md.fourCityPrices.push(fourCityAvg);
    md.cityPrices.delhi.push(fp.delhi);
    md.cityPrices.mumbai.push(fp.mumbai);
    md.cityPrices.chennai.push(fp.chennai);
    md.cityPrices.kolkata.push(fp.kolkata);
  }
  
  console.log(`Syncing ${monthlyData.size} months of monthly fuel index values...`);
  
  let monthlyCreated = 0;
  let monthlyUpdated = 0;
  
  const upsertMonthlyValue = async (priceIndexId: string, monthDate: Date, value: number, source: string) => {
    const existing = await prisma.monthlyIndexValue.findFirst({
      where: { priceIndexId, month: monthDate }
    });
    
    if (existing) {
      if (Math.abs(existing.value - value) > 0.001) {
        await prisma.monthlyIndexValue.update({
          where: { id: existing.id },
          data: { value, source, updatedAt: new Date() }
        });
        monthlyUpdated++;
      }
    } else {
      await prisma.monthlyIndexValue.create({
        data: { priceIndexId, month: monthDate, value, isProvisional: false, source }
      });
      monthlyCreated++;
    }
  };
  
  for (const [monthKey, data] of monthlyData) {
    const monthDate = data.firstDate;
    const round2 = (arr: number[]) => Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100;
    
    // 4-city average (MPNG Fuel)
    const fourCityAvg = round2(data.fourCityPrices);
    await upsertMonthlyValue(mpngIndex.id, monthDate, fourCityAvg, "PPAC Daily Average (4-city)");
    
    // Per-city averages
    for (const [cityKey, indexId] of Object.entries(cityIndices)) {
      const cityAvg = round2(data.cityPrices[cityKey]);
      await upsertMonthlyValue(indexId, monthDate, cityAvg, `PPAC Daily Average (${cityKey})`);
    }
  }
  
  console.log(`Monthly index sync completed. Created: ${monthlyCreated}, Updated: ${monthlyUpdated}`);
}

main()
  .catch(e => {
    console.error('Error during daily fuel import:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
