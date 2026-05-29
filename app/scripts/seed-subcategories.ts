
import { PrismaClient } from '@prisma/client';
import { DEFAULT_17A_SUBCATEGORIES } from '../lib/extension-subcategories';

const prisma = new PrismaClient();

async function seedSubcategories() {
  console.log('🌱 Seeding extension subcategories...');

  for (const subcategory of DEFAULT_17A_SUBCATEGORIES) {
    await prisma.extensionSubcategory.upsert({
      where: { code: subcategory.code },
      update: {
        name: subcategory.name,
        description: subcategory.description,
        displayOrder: subcategory.displayOrder,
        isActive: subcategory.isActive
      },
      create: subcategory
    });
    console.log(`✅ Seeded subcategory: ${subcategory.code} - ${subcategory.name}`);
  }

  console.log('✅ Extension subcategories seeded successfully!');
}

seedSubcategories()
  .catch((error) => {
    console.error('❌ Error seeding subcategories:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
