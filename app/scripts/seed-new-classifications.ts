/**
 * Seed Classification Groups and Sub-Classifications from GCC data
 * Populates classification_groups and sub_classifications tables.
 *
 * Run: npx tsx scripts/seed-new-classifications.ts
 */

import { PrismaClient } from '@prisma/client';
import { GCC_CLASSIFICATIONS } from '../lib/gcc-classifications-data';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Classification Groups and Sub-Classifications seed...');

  try {
    // 1. Group the GCC_CLASSIFICATIONS by their group code
    const groupsMap = new Map<string, { name: string; items: typeof GCC_CLASSIFICATIONS }>();

    for (const gcc of GCC_CLASSIFICATIONS) {
      // Group code is the number part of the classification code, e.g., "1A" -> "1", "3E" -> "3", "2" -> "2"
      const groupCode = gcc.code.replace(/[A-Z]/g, '');
      const groupName = gcc.mainClassification;

      if (!groupsMap.has(groupCode)) {
        groupsMap.set(groupCode, {
          name: groupName,
          items: []
        });
      }

      groupsMap.get(groupCode)!.items.push(gcc);
    }

    console.log(`📊 Found ${groupsMap.size} classification groups to process.`);

    let groupsCreated = 0;
    let subsCreated = 0;

    for (const [groupCode, groupData] of groupsMap.entries()) {
      // Upsert ClassificationGroup
      let group = await prisma.classificationGroup.findUnique({
        where: { code: groupCode }
      });

      if (!group) {
        group = await prisma.classificationGroup.create({
          data: {
            code: groupCode,
            name: groupData.name,
            description: `GCC 46A Group ${groupCode} - ${groupData.name}`,
            isActive: true
          }
        });
        groupsCreated++;
        console.log(`✅ Created Group: ${groupCode} - ${groupData.name}`);
      } else {
        console.log(`⏭️  Group ${groupCode} already exists`);
      }

      // Upsert SubClassifications for this group
      for (const item of groupData.items) {
        const subCode = item.code;
        const subName = item.subClassification;

        const existingSub = await prisma.subClassification.findUnique({
          where: { code: subCode }
        });

        if (!existingSub) {
          await prisma.subClassification.create({
            data: {
              code: subCode,
              name: subName,
              description: item.description,
              groupId: group.id,
              fixed: item.components.fixed,
              labour: item.components.labour,
              steel: item.components.steel,
              cement: item.components.cement,
              plantMachinery: item.components.plantMachinery,
              fuel: item.components.fuel,
              otherMaterials: item.components.otherMaterials,
              explosives: item.components.explosives,
              isActive: true,
              isDefault: false
            }
          });
          subsCreated++;
          console.log(`   + Created Sub-Classification: ${subCode} - ${subName}`);
        }
      }
    }

    console.log('\n✨ Seed completed successfully!');
    console.log(`📊 Summary:`);
    console.log(`   - Groups Created: ${groupsCreated}`);
    console.log(`   - Sub-Classifications Created: ${subsCreated}`);

  } catch (error) {
    console.error('❌ Error seeding classification groups/subs:', error);
    throw error;
  }
}

main()
  .catch(e => { console.error('Fatal error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
