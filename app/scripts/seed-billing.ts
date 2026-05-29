
import { PrismaClient } from '@prisma/client';
import { PRICING_TIERS } from '../lib/billing';

const prisma = new PrismaClient();

async function seedBillingData() {
  console.log('🌱 Seeding billing data...');

  try {
    // Clear existing pricing tiers
    await prisma.pricingTier.deleteMany();
    console.log('📧 Cleared existing pricing tiers');

    // Create pricing tiers
    for (const tier of PRICING_TIERS) {
      const createdTier = await prisma.pricingTier.create({
        data: {
          name: tier.name,
          displayName: tier.displayName,
          minBillsPerMonth: tier.minBills,
          maxBillsPerMonth: tier.maxBills,
          pricePerBill: tier.pricePerBill,
          discountPercent: tier.discountPercent,
          description: `${tier.discountPercent > 0 ? `${tier.discountPercent}% discount - ` : ''}For ${tier.minBills}${tier.maxBills ? `-${tier.maxBills}` : '+'} bills per month`
        }
      });
      console.log(`✅ Created pricing tier: ${createdTier.displayName} - ₹${createdTier.pricePerBill}/bill`);
    }

    // Create demo customer accounts if users exist
    const users = await prisma.user.findMany();
    console.log(`👥 Found ${users.length} existing users`);

    for (const user of users) {
      // Check if customer account already exists
      const existingAccount = await prisma.customerAccount.findUnique({
        where: { userId: user.id }
      });

      if (!existingAccount) {
        const account = await prisma.customerAccount.create({
          data: {
            userId: user.id,
            status: 'active',
            currentTier: 'standard',
            monthlyBillCount: 0,
            creditBalance: 0,
            outstandingAmount: 0
          }
        });
        console.log(`💼 Created customer account for user: ${user.email}`);
      } else {
        console.log(`💼 Customer account already exists for user: ${user.email}`);
      }
    }

    console.log('✨ Billing data seeding completed successfully!');

  } catch (error) {
    console.error('❌ Error seeding billing data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed function
if (require.main === module) {
  seedBillingData()
    .catch((error) => {
      console.error('❌ Seeding failed:', error);
      process.exit(1);
    });
}

export default seedBillingData;
