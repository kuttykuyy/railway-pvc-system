import { prisma } from '../lib/db';
import { GCC_CLASSIFICATIONS } from '../lib/gcc-classifications-data';

async function main() {
  console.log('🌱 Starting synchronization of database classifications with standard GCC definitions...');

  // 1. Sync SubClassification table
  const dbSubClassifications = await prisma.subClassification.findMany();
  console.log(`📊 Found ${dbSubClassifications.length} subclassifications in DB.`);

  let subUpdated = 0;

  for (const dbSub of dbSubClassifications) {
    const stdSub = GCC_CLASSIFICATIONS.find(c => c.code === dbSub.code);

    if (!stdSub) {
      console.log(`⚠️  DB subclassification ${dbSub.code} (${dbSub.name}) not found in standard GCC definitions.`);
      continue;
    }

    const components = ['fixed', 'labour', 'steel', 'cement', 'plantMachinery', 'fuel', 'otherMaterials', 'explosives'] as const;
    const updateData: any = {};
    const changes: string[] = [];

    for (const comp of components) {
      const dbVal = dbSub[comp];
      const stdVal = stdSub.components[comp];

      if (dbVal !== stdVal) {
        updateData[comp] = stdVal;
        changes.push(`${comp}: ${dbVal}% -> ${stdVal}%`);
      }
    }

    if (changes.length > 0) {
      console.log(`🔧 Updating SubClassification ${dbSub.code} (${dbSub.name}):`);
      changes.forEach(c => console.log(`   - ${c}`));

      await prisma.subClassification.update({
        where: { id: dbSub.id },
        data: updateData
      });
      subUpdated++;
    }
  }

  // 2. Sync legacy Classification table
  const dbClassifications = await prisma.classification.findMany();
  console.log(`📊 Found ${dbClassifications.length} legacy classifications in DB.`);

  let classUpdated = 0;

  for (const dbClass of dbClassifications) {
    const stdSub = GCC_CLASSIFICATIONS.find(c => c.code === dbClass.code);

    if (!stdSub) {
      console.log(`⚠️  DB legacy classification ${dbClass.code} (${dbClass.name}) not found in standard GCC definitions.`);
      continue;
    }

    const components = ['fixed', 'labour', 'steel', 'cement', 'plantMachinery', 'fuel', 'otherMaterials', 'explosives'] as const;
    const updateData: any = {};
    const changes: string[] = [];

    for (const comp of components) {
      const dbVal = dbClass[comp];
      const stdVal = stdSub.components[comp];

      if (dbVal !== stdVal) {
        updateData[comp] = stdVal;
        changes.push(`${comp}: ${dbVal}% -> ${stdVal}%`);
      }
    }

    if (changes.length > 0) {
      console.log(`🔧 Updating Legacy Classification ${dbClass.code} (${dbClass.name}):`);
      changes.forEach(c => console.log(`   - ${c}`));

      await prisma.classification.update({
        where: { id: dbClass.id },
        data: updateData
      });
      classUpdated++;
    }
  }

  console.log('\n--- Sync Summary ---');
  console.log(`SubClassifications updated: ${subUpdated}`);
  console.log(`Legacy Classifications updated: ${classUpdated}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
