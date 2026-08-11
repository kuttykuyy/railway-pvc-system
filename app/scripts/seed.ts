
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
    // Pre-2022 GCC contracts only. That clause prices fuel on the WPI Fuel & Power group
    // and steel on WPI mild steel, where GCC-2022 uses PPAC diesel and JPC rates. Fuel,
    // bright bars and angles are filled by the WPI import; flat products and other
    // sections are entered by hand — see the note in lib/wpi-fetcher.ts for why the
    // 2022-23 rebase left them without a defensible mapping.
    { name: 'WPI Fuel & Power', baseValue: 94.00, description: 'WPI Fuel & Power group (pre-2022 GCC fuel component)' },
    { name: 'WPI Steel Bright Bars', baseValue: 98.00, description: 'WPI MS Bright Bars (pre-2022 GCC Cl.46A.9(1) reinforcement)' },
    { name: 'WPI Steel Angles & Channels', baseValue: 97.80, description: 'WPI Angles, Channels, Sections (pre-2022 GCC Cl.46A.9(2))' },
    { name: 'WPI Steel Flat Products', baseValue: 93.80, description: 'WPI Mild Steel Flat Products (pre-2022 GCC Cl.46A.9(3) plates) - entered manually' },
    { name: 'WPI Steel Other Sections', baseValue: 96.53, description: 'Average of the three WPI steel categories (pre-2022 GCC Cl.46A.9(4)) - entered manually' },
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
