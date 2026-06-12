
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { getBaseMonth } from '../lib/pvc-calculations';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create admin user
  console.log('Creating admin user...');

  const adminEmail = process.env.ADMIN_SEED_EMAIL || 'admin@railway.gov.in';
  const adminPasswordPlain = process.env.ADMIN_SEED_PASSWORD;
  if (!adminPasswordPlain) {
    console.error('ADMIN_SEED_PASSWORD environment variable is required to seed the admin user.');
    process.exit(1);
  }

  const adminPassword = await bcrypt.hash(adminPasswordPlain, 12);
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      emailVerified: new Date(),
    },
    create: {
      email: adminEmail,
      password: adminPassword,
      name: 'Railway Admin',
      role: 'admin', // Set as admin
      emailVerified: new Date(),
    }
  });

  // Create base price indices
  const baseIndices = [
    { name: 'Labour', baseValue: 129.90, description: 'Labour price index' },
    { name: 'RBI Plant Machinery', baseValue: 83.90, description: 'RBI Plant Machinery & Spares index' },
    { name: 'MPNG Fuel', baseValue: 93.06, description: 'MPNG Fuel & Lubricants index' },
    { name: 'RBI Other Materials', baseValue: 154.00, description: 'RBI Other Materials index' },
    { name: 'RBI Cement', baseValue: 137.40, description: 'RBI Cement index' },
    { name: 'RBI Explosives', baseValue: 190.10, description: 'RBI Explosives index' },
    { name: 'Steel TMT Bars', baseValue: 70150.00, description: 'Steel TMT Bars index' },
    { name: 'Steel Angle/Channel', baseValue: 69740.00, description: 'Steel Angle/Channel index' },
    { name: 'Steel Plates', baseValue: 75540.00, description: 'Steel Plates index' },
    { name: 'Steel Other Sections', baseValue: 71810.00, description: 'Steel Other Sections index' },
    // City-wise steel indices
    { name: 'Steel TMT Bars - Delhi', baseValue: 70150.00, description: 'Steel TMT Bars index (Delhi JPC rates)' },
    { name: 'Steel Angle/Channel - Delhi', baseValue: 69740.00, description: 'Steel Angle/Channel index (Delhi JPC rates)' },
    { name: 'Steel Plates - Delhi', baseValue: 75540.00, description: 'Steel Plates index (Delhi JPC rates)' },
    { name: 'Steel Other Sections - Delhi', baseValue: 71810.00, description: 'Steel Other Sections index (Delhi JPC rates)' },
    { name: 'Steel TMT Bars - Mumbai', baseValue: 70150.00, description: 'Steel TMT Bars index (Mumbai JPC rates)' },
    { name: 'Steel Angle/Channel - Mumbai', baseValue: 69740.00, description: 'Steel Angle/Channel index (Mumbai JPC rates)' },
    { name: 'Steel Plates - Mumbai', baseValue: 75540.00, description: 'Steel Plates index (Mumbai JPC rates)' },
    { name: 'Steel Other Sections - Mumbai', baseValue: 71810.00, description: 'Steel Other Sections index (Mumbai JPC rates)' },
    { name: 'Steel TMT Bars - Chennai', baseValue: 70150.00, description: 'Steel TMT Bars index (Chennai JPC rates)' },
    { name: 'Steel Angle/Channel - Chennai', baseValue: 69740.00, description: 'Steel Angle/Channel index (Chennai JPC rates)' },
    { name: 'Steel Plates - Chennai', baseValue: 75540.00, description: 'Steel Plates index (Chennai JPC rates)' },
    { name: 'Steel Other Sections - Chennai', baseValue: 71810.00, description: 'Steel Other Sections index (Chennai JPC rates)' },
    { name: 'Steel TMT Bars - Kolkata', baseValue: 70150.00, description: 'Steel TMT Bars index (Kolkata JPC rates)' },
    { name: 'Steel Angle/Channel - Kolkata', baseValue: 69740.00, description: 'Steel Angle/Channel index (Kolkata JPC rates)' },
    { name: 'Steel Plates - Kolkata', baseValue: 75540.00, description: 'Steel Plates index (Kolkata JPC rates)' },
    { name: 'Steel Other Sections - Kolkata', baseValue: 71810.00, description: 'Steel Other Sections index (Kolkata JPC rates)' }
  ];

  console.log('Creating price indices...');
  for (const index of baseIndices) {
    await prisma.priceIndex.upsert({
      where: { name: index.name },
      update: {},
      create: index
    });
  }

  // Sample contract and monthly values removed - these will be created manually by users
  console.log('Skipping sample contract and monthly index values - these should be created manually by users.');

  console.log('Database seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
