import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function verify() {
  // Get sample data for Jan 2026
  const jan2026 = await prisma.dailyFuelPrice.findMany({
    where: {
      date: {
        gte: new Date('2026-01-01'),
        lte: new Date('2026-01-16'),
      }
    },
    orderBy: { date: 'desc' },
    take: 5
  });
  
  console.log('Latest records (Jan 2026):');
  jan2026.forEach((r: any) => {
    console.log(`  ${r.date.toISOString().split('T')[0]}: Delhi=Rs.${r.delhi}, Mumbai=Rs.${r.mumbai}, Chennai=Rs.${r.chennai}, Kolkata=Rs.${r.kolkata}`);
  });
  
  // Get count by year
  const stats: any = await prisma.$queryRaw`
    SELECT 
      EXTRACT(YEAR FROM date) as year,
      COUNT(*) as count
    FROM daily_fuel_prices 
    GROUP BY EXTRACT(YEAR FROM date)
    ORDER BY year
  `;
  
  console.log('\nRecords by Year:');
  stats.forEach((s: any) => {
    console.log(`  ${s.year}: ${s.count} days`);
  });
  
  await prisma.$disconnect();
}
verify();
