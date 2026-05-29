import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function main() {
  // First, delete all existing fuel prices (which were petrol)
  console.log('Deleting existing petrol data...');
  const deleted = await prisma.dailyFuelPrice.deleteMany({});
  console.log(`Deleted ${deleted.count} petrol records`);
  
  // Read the diesel JSON
  const data = JSON.parse(fs.readFileSync('/tmp/diesel_prices.json', 'utf8'));
  
  console.log(`\nImporting ${data.length} DIESEL price records...`);
  
  let processed = 0;
  let errors = 0;
  
  // Process in batches of 100
  const batchSize = 100;
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    
    for (const record of batch) {
      try {
        const dateObj = new Date(record.date);
        
        await prisma.dailyFuelPrice.create({
          data: {
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
      console.log(`Progress: ${Math.min(i + batchSize, data.length)}/${data.length}`);
    }
  }
  
  console.log(`\nImport complete!`);
  console.log(`  Processed: ${processed}`);
  console.log(`  Errors: ${errors}`);
  
  // Verify Feb 2025 average
  const feb2025 = await prisma.dailyFuelPrice.findMany({
    where: {
      date: {
        gte: new Date('2025-02-01'),
        lte: new Date('2025-02-28'),
      }
    }
  });
  
  if (feb2025.length > 0) {
    const avg = feb2025.reduce((sum: any, r: any) => sum + (r.delhi + r.mumbai + r.chennai + r.kolkata) / 4, 0) / feb2025.length;
    console.log(`\nFeb 2025 Diesel Average: ₹${avg.toFixed(2)}`);
  }
  
  // Total count
  const count = await prisma.dailyFuelPrice.count();
  console.log(`Total records in database: ${count}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
