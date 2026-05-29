
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Map old subcategory codes to new ones
const subcategoryMap: Record<string, string> = {
  '1A': 'I',
  '2A': 'II',
  '3A': 'III'
};

async function migrateExtensionSubcategories() {
  console.log('🔄 Migrating extension subcategories...');

  try {
    // Find all extensions with old subcategory format
    const extensions = await prisma.contractExtension.findMany({
      where: {
        extensionSubcategory: {
          in: ['1A', '2A', '3A']
        }
      }
    });

    console.log(`Found ${extensions.length} extensions to migrate`);

    for (const extension of extensions) {
      const oldCode = extension.extensionSubcategory;
      const newCode = oldCode ? subcategoryMap[oldCode] : null;

      if (newCode) {
        await prisma.contractExtension.update({
          where: { id: extension.id },
          data: { extensionSubcategory: newCode }
        });
        console.log(`✅ Migrated extension ${extension.id}: ${oldCode} → ${newCode}`);
      }
    }

    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Error during migration:', error);
    throw error;
  }
}

migrateExtensionSubcategories()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
