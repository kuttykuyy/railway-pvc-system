import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Checking Price Indices ---');
  
  // 1. Get core price indices (excluding city-specific ones)
  const allPriceIndices = await prisma.priceIndex.findMany({
    select: { id: true, name: true }
  });
  
  const citySpecificPattern = / - (Delhi|Mumbai|Chennai|Kolkata)$/;
  const corePriceIndices = allPriceIndices.filter(idx => !citySpecificPattern.test(idx.name));
  
  console.log(`Core indices found (${corePriceIndices.length}):`);
  corePriceIndices.forEach(idx => console.log(` - [${idx.id}] ${idx.name}`));

  // 2. Fetch all monthly values
  const allValues = await prisma.monthlyIndexValue.findMany({
    select: {
      month: true,
      priceIndexId: true,
      value: true,
      isProvisional: true,
      source: true
    },
    orderBy: { month: 'asc' }
  });

  // Group by month
  const monthMap = new Map<string, Array<any>>();
  for (const v of allValues) {
    const monthKey = v.month.toISOString().substring(0, 7);
    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, []);
    }
    monthMap.get(monthKey)!.push(v);
  }

  console.log('\n--- Monthly Completion Analysis ---');
  const sortedMonths = Array.from(monthMap.keys()).sort();
  
  for (const month of sortedMonths) {
    const values = monthMap.get(month)!;
    const presentIndexIds = new Set(values.map(v => v.priceIndexId));
    
    // Find missing core indices
    const missingIndices = corePriceIndices.filter(pi => !presentIndexIds.has(pi.id));
    
    const status = missingIndices.length === 0 
      ? '✅ COMPLETE' 
      : `❌ INCOMPLETE (${values.length}/${corePriceIndices.length} values)`;
      
    console.log(`\nMonth: ${month} -> ${status}`);
    if (missingIndices.length > 0) {
      console.log('Missing Core Indices:');
      missingIndices.forEach(mi => console.log(`  - ${mi.name} [ID: ${mi.id}]`));
    } else {
      console.log('Uploaded Indices:');
      values.forEach(v => {
        const name = corePriceIndices.find(pi => pi.id === v.priceIndexId)?.name;
        if (name) {
          console.log(`  - ${name}: ${v.value} (Provisional: ${v.isProvisional}, Source: ${v.source})`);
        }
      });
    }
  }

  // Check labour index documents
  console.log('\n--- Labour Index PDF Documents Uploaded ---');
  const documents = await prisma.labourIndexDocument.findMany({
    select: {
      id: true,
      componentType: true,
      year: true,
      months: true,
      fileName: true,
      cloudStoragePath: true,
      createdAt: true
    },
    orderBy: [
      { componentType: 'asc' },
      { year: 'desc' }
    ]
  });

  if (documents.length === 0) {
    console.log('No labor/component PDF documents uploaded.');
  } else {
    console.log(`Total PDF documents: ${documents.length}`);
    documents.forEach(doc => {
      console.log(` - [${doc.componentType}] Year ${doc.year}, Months: [${doc.months.join(',')}], File: ${doc.fileName}`);
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
