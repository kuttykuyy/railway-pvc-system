
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedPaymentSettings() {
  try {
    console.log('🔧 Seeding payment settings...');

    // Create or update payment_method setting
    const setting = await prisma.adminSettings.upsert({
      where: {
        key: 'payment_method',
      },
      update: {
        value: 'manual', // Default to manual
        description: 'Payment method for credit top-ups (razorpay or manual)',
        dataType: 'string',
      },
      create: {
        key: 'payment_method',
        value: 'manual', // Default to manual
        description: 'Payment method for credit top-ups (razorpay or manual)',
        dataType: 'string',
      },
    });

    console.log('✅ Payment settings seeded successfully');
    console.log('   Payment Method:', setting.value);
    
  } catch (error) {
    console.error('❌ Error seeding payment settings:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed function
seedPaymentSettings()
  .then(() => {
    console.log('✅ Seeding completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  });
