import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function main() {
  // Read the parsed JSON
  const data = JSON.parse(fs.readFileSync('/tmp/fuel_prices.json', 'utf8'));
  
  console.log(`Importing ${data.length} fuel price records...`);
  
  let processed = 0;
  let errors = 0;
  
  // Process in batches of 100
  const batchSize = 100;
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    
    for (const record of batch) {
      try {
        const dateObj = new Date(record.date);
        
        // Upsert (update if exists, create if not)
        await prisma.dailyFuelPrice.upsert({
          where: { date: dateObj },
          update: {
            delhi: record.delhi,
            mumbai: record.mumbai,
            chennai: record.chennai,
            kolkata: record.kolkata,
            source: 'PPAC',
          },
          create: {
            date: dateObj,
            delhi: record.delhi,
            mumbai: record.mumbai,
            chennai: record.chennai,
            kolkata: record.kolkata,
            source: 'PPAC',
          },
        });
        processed++;
      } catch (e: any) {
        errors++;
        if (errors < 5) {
          console.error(`Error for ${record.date}:`, e.message);
        }
      }
    }
    
    // Progress update
    if ((i + batchSize) % 500 === 0 || i + batchSize >= data.length) {
      console.log(`Progress: ${Math.min(i + batchSize, data.length)}/${data.length} (processed: ${processed})`);
    }
  }
  
  console.log(`\nImport complete!`);
  console.log(`  Processed: ${processed}`);
  console.log(`  Errors: ${errors}`);
  
  // Verify by counting
  const count = await prisma.dailyFuelPrice.count();
  console.log(`  Total records in database: ${count}`);
  
  // Show date range
  const first = await prisma.dailyFuelPrice.findFirst({ orderBy: { date: 'asc' } });
  const last = await prisma.dailyFuelPrice.findFirst({ orderBy: { date: 'desc' } });
  if (first && last) {
    console.log(`  Date range: ${first.date.toISOString().split('T')[0]} to ${last.date.toISOString().split('T')[0]}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
