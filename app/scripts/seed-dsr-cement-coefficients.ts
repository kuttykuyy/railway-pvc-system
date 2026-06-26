import { prisma } from '../lib/db';

const coefficients = [
  {
    dsrCode: '4.1.2',
    description: 'P/L cement concrete 1:1.5:3, 20 mm aggregate',
    workUnit: 'Cum',
    cementQuantityPerUnit: 0.4,
    notes: 'Original coefficient: 4.00 quintals per cum.',
  },
  {
    dsrCode: '4.1.3',
    description: 'P/L cement concrete 1:2:4, 20 mm aggregate',
    workUnit: 'Cum',
    cementQuantityPerUnit: 0.32,
    notes: 'Original coefficient: 3.20 quintals per cum.',
  },
  {
    dsrCode: '4.1.4',
    description: 'P/L cement concrete 1:2:4, 40 mm aggregate',
    workUnit: 'Cum',
    cementQuantityPerUnit: 0.32,
    notes: 'Original coefficient: 3.20 quintals per cum.',
  },
  {
    dsrCode: '4.1.5',
    description: 'P/L cement concrete 1:3:6, 20 mm aggregate',
    workUnit: 'Cum',
    cementQuantityPerUnit: 0.22,
    notes: 'Original coefficient: 2.20 quintals per cum.',
  },
  {
    dsrCode: '4.1.6',
    description: 'P/L cement concrete 1:3:6, 40 mm aggregate',
    workUnit: 'Cum',
    cementQuantityPerUnit: 0.22,
    notes: 'Original coefficient: 2.20 quintals per cum.',
  },
  {
    dsrCode: '4.1.8',
    description: 'P/L cement concrete 1:4:8, 40 mm aggregate',
    workUnit: 'Cum',
    cementQuantityPerUnit: 0.17,
    notes: 'Original coefficient: 1.70 quintals per cum.',
  },
  {
    dsrCode: '4.1.10',
    description: 'P/L cement concrete 1:5:10, 40 mm aggregate',
    workUnit: 'Cum',
    cementQuantityPerUnit: 0.13,
    notes: 'Original coefficient: 1.30 quintals per cum.',
  },
  {
    dsrCode: '5.1.1',
    description: 'P/L RCC 1:1:2 upto plinth level, 20 mm aggregate',
    workUnit: 'Cum',
    cementQuantityPerUnit: 0.61,
    notes: 'Original coefficient: 6.10 quintals per cum.',
  },
  {
    dsrCode: '5.1.2',
    description: 'P/L RCC 1:1.5:3 upto plinth level, 20 mm aggregate',
    workUnit: 'Cum',
    cementQuantityPerUnit: 0.4,
    notes: 'Original coefficient: 4.00 quintals per cum.',
  },
  {
    dsrCode: '5.1.3',
    description: 'P/L RCC 1:2:4 upto plinth level, 20 mm aggregate',
    workUnit: 'Cum',
    cementQuantityPerUnit: 0.32,
    notes: 'Original coefficient: 3.20 quintals per cum.',
  },
  {
    dsrCode: '13.33.1',
    description: 'Flush / ruled pointing on stone work with cement mortar 1:3',
    workUnit: 'Sqm',
    cementQuantityPerUnit: 0.00117,
    notes: 'Original coefficient: 1.17 quintals per 100 sqm.',
  },
  {
    dsrCode: '13.33.2',
    description: 'Raised and cut pointing on stone work with cement mortar 1:3',
    workUnit: 'Sqm',
    cementQuantityPerUnit: 0.00235,
    notes: 'Original coefficient: 2.35 quintals per 100 sqm.',
  },
];

async function main() {
  for (const coefficient of coefficients) {
    await prisma.dsrCementCoefficient.upsert({
      where: { dsrCode: coefficient.dsrCode },
      create: {
        ...coefficient,
        cementUnit: 'MT',
        source: 'DSR 2021 cement consumption coefficient table',
      },
      update: {
        ...coefficient,
        cementUnit: 'MT',
        source: 'DSR 2021 cement consumption coefficient table',
        isActive: true,
      },
    });
  }

  console.log(`Seeded ${coefficients.length} DSR cement coefficients.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
