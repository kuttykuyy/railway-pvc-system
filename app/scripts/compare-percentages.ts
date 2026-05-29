import { prisma } from '../lib/db';
import { GCC_CLASSIFICATIONS } from '../lib/gcc-classifications-data';

async function main() {
  console.log('🌱 Starting comparison of database subclassifications with standard GCC definitions...');

  const dbSubClassifications = await prisma.subClassification.findMany({
    orderBy: { code: 'asc' }
  });

  console.log(`📊 Found ${dbSubClassifications.length} subclassifications in DB.`);

  let mismatchCount = 0;

  for (const dbSub of dbSubClassifications) {
    const stdSub = GCC_CLASSIFICATIONS.find(c => c.code === dbSub.code);

    if (!stdSub) {
      console.log(`⚠️  DB subclassification ${dbSub.code} (${dbSub.name}) not found in standard GCC definitions!`);
      continue;
    }

    const components = ['fixed', 'labour', 'steel', 'cement', 'plantMachinery', 'fuel', 'otherMaterials', 'explosives'] as const;
    const diffs: string[] = [];

    for (const comp of components) {
      const dbVal = dbSub[comp];
      const stdVal = stdSub.components[comp];

      if (dbVal !== stdVal) {
        diffs.push(`${comp}: DB=${dbVal}%, Std=${stdVal}%`);
      }
    }

    if (diffs.length > 0) {
      mismatchCount++;
      console.log(`❌ MISMATCH in ${dbSub.code} - ${dbSub.name}:`);
      diffs.forEach(diff => console.log(`   - ${diff}`));
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Total subclassifications checked: ${dbSubClassifications.length}`);
  console.log(`Mismatches found: ${mismatchCount}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
