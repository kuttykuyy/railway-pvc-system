import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding PVC comparison payment settings...');

  // Add admin setting for PVC comparison payment toggle
  await prisma.adminSettings.upsert({
    where: { key: 'pvc_comparison_payment_enabled' },
    update: {},
    create: {
      key: 'pvc_comparison_payment_enabled',
      value: 'false',
      description: 'Enable payment for PVC comparison (250 INR per session for contractor users)',
      dataType: 'boolean',
    },
  });

  console.log('✓ PVC comparison payment settings seeded successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
