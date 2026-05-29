import { PrismaClient } from '@prisma/client';
import { format, startOfMonth } from 'date-fns';

const prisma = new PrismaClient();

async function syncFuelPricesToMPNGIndex() {
  const mpngIndex = await prisma.priceIndex.findFirst({
    where: { name: "MPNG Fuel" }
  });

  if (!mpngIndex) {
    throw new Error("MPNG Fuel price index not found");
  }

  console.log("Found MPNG Fuel index:", mpngIndex.id);

  const allFuelPrices = await prisma.dailyFuelPrice.findMany({
    orderBy: { date: "asc" }
  });

  console.log("Total daily fuel prices:", allFuelPrices.length);

  // Group by month
  const monthlyData: Map<string, { prices: number[]; firstDate: Date }> = new Map();

  for (const fp of allFuelPrices) {
    const monthKey = format(fp.date, "yyyy-MM");
    const fourCityAvg = (fp.delhi + fp.mumbai + fp.chennai + fp.kolkata) / 4;
    
    if (!monthlyData.has(monthKey)) {
      monthlyData.set(monthKey, { prices: [], firstDate: startOfMonth(fp.date) });
    }
    monthlyData.get(monthKey)!.prices.push(fourCityAvg);
  }

  console.log("Unique months with fuel data:", monthlyData.size);

  let created = 0;
  let updated = 0;

  for (const [monthKey, data] of monthlyData) {
    const monthlyAvg = data.prices.reduce((a, b) => a + b, 0) / data.prices.length;
    const roundedAvg = Math.round(monthlyAvg * 100) / 100;
    const monthDate = data.firstDate;

    const existing = await prisma.monthlyIndexValue.findFirst({
      where: {
        priceIndexId: mpngIndex.id,
        month: monthDate
      }
    });

    if (existing) {
      if (Math.abs(existing.value - roundedAvg) > 0.001) {
        await prisma.monthlyIndexValue.update({
          where: { id: existing.id },
          data: {
            value: roundedAvg,
            source: "PPAC Daily Average",
            updatedAt: new Date()
          }
        });
        updated++;
        console.log("Updated " + monthKey + ": " + roundedAvg);
      }
    } else {
      await prisma.monthlyIndexValue.create({
        data: {
          priceIndexId: mpngIndex.id,
          month: monthDate,
          value: roundedAvg,
          isProvisional: false,
          source: "PPAC Daily Average"
        }
      });
      created++;
      console.log("Created " + monthKey + ": " + roundedAvg);
    }
  }

  console.log("\nSync complete: " + created + " created, " + updated + " updated");
  await prisma.$disconnect();
}

syncFuelPricesToMPNGIndex();
