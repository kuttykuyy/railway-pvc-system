
/**
 * Seed script to populate Classification Groups and Sub-Classifications
 * Based on GCC-2022-ACS2 standards
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Main classification groups with their sub-classifications
// This array is now empty - classifications should be created manually through the UI
const CLASSIFICATION_DATA: any[] = [];

async function main() {
  console.log('🌱 Starting classification seed...');

  try {
    if (CLASSIFICATION_DATA.length === 0) {
      console.log('\n📝 No default classification data found.');
      console.log('👉 Classifications should be created manually through the Classifications page.');
      console.log('   Navigate to: Admin Settings > Classifications');
      console.log('\n✅ Seed script completed - no classifications seeded.');
      return;
    }

    // Check if classifications already exist
    const existingCount = await prisma.classificationGroup.count();
    
    if (existingCount > 0) {
      console.log(`⚠️  Found ${existingCount} existing classification groups.`);
      console.log('Do you want to:');
      console.log('1. Skip seeding (exit now)');
      console.log('2. Delete existing and reseed (run with --force flag)');
      
      // Check for --force flag
      if (!process.argv.includes('--force')) {
        console.log('\n✋ Seeding skipped. Use --force flag to delete and reseed.');
        return;
      }
      
      console.log('\n🗑️  Deleting existing classifications...');
      await prisma.subClassification.deleteMany({});
      await prisma.classificationGroup.deleteMany({});
      console.log('✅ Existing classifications deleted.');
    }

    // Create classification groups and sub-classifications
    for (const groupData of CLASSIFICATION_DATA) {
      console.log(`\n📁 Creating group: ${groupData.code} - ${groupData.name}`);
      
      const group = await prisma.classificationGroup.create({
        data: {
          code: groupData.code,
          name: groupData.name,
          description: groupData.description,
          isActive: true,
          subClassifications: {
            create: groupData.subClassifications.map((sub: any) => ({
              code: sub.code,
              name: sub.name,
              description: sub.description,
              fixed: sub.fixed,
              labour: sub.labour,
              steel: sub.steel,
              cement: sub.cement,
              plantMachinery: sub.plantMachinery,
              fuel: sub.fuel,
              otherMaterials: sub.otherMaterials,
              explosives: sub.explosives,
              isActive: true,
              isDefault: false
            }))
          }
        },
        include: {
          subClassifications: true
        }
      });

      console.log(`   ✅ Created ${group.subClassifications.length} sub-classifications`);
    }

    console.log('\n✨ Classification seed completed successfully!');
    
    // Print summary
    const totalGroups = await prisma.classificationGroup.count();
    const totalSubs = await prisma.subClassification.count();
    console.log(`\n📊 Summary:`);
    console.log(`   - Total Classification Groups: ${totalGroups}`);
    console.log(`   - Total Sub-Classifications: ${totalSubs}`);

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
