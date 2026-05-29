/**
 * Seed GCC Classifications from gcc-classifications-data.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { GCC_CLASSIFICATIONS } from '../lib/gcc-classifications-data';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting GCC classifications seed...');

  try {
    // Check existing classifications
    const existingCount = await prisma.classification.count();
    console.log(`📊 Found ${existingCount} existing classifications`);

    // Create classifications from GCC data
    let created = 0;
    let skipped = 0;

    for (const gcc of GCC_CLASSIFICATIONS) {
      // Check if classification with this code already exists
      const existing = await prisma.classification.findUnique({
        where: { code: gcc.code }
      });

      if (existing) {
        console.log(`⏭️  Skipped: ${gcc.code} (already exists)`);
        skipped++;
        continue;
      }

      // Create new classification
      await prisma.classification.create({
        data: {
          code: gcc.code,
          name: gcc.subClassification,
          description: gcc.description,
          fixed: gcc.components.fixed,
          labour: gcc.components.labour,
          steel: gcc.components.steel,
          cement: gcc.components.cement,
          plantMachinery: gcc.components.plantMachinery,
          fuel: gcc.components.fuel,
          otherMaterials: gcc.components.otherMaterials,
          explosives: gcc.components.explosives,
          isActive: true,
          isDefault: false
        }
      });

      console.log(`✅ Created: ${gcc.code} - ${gcc.mainClassification} / ${gcc.subClassification}`);
      created++;
    }

    console.log('\n✨ Seed completed successfully!');
    console.log(`📊 Summary:`);
    console.log(`   - Created: ${created}`);
    console.log(`   - Skipped: ${skipped}`);
    console.log(`   - Total now: ${existingCount + created}`);

  } catch (error) {
    console.error('❌ Error seeding classifications:', error);
    throw error;
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
