
import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { BillDetailClient } from './bill-detail-client';
import { getQuarterlyAverages } from '@/lib/db-utils';
import { checkUserBillAccess } from '@/lib/permissions';
import { getQuarterFromDate, getQuarterMonths } from '@/lib/pvc-calculations';
import { getSteelCityForZone, getFuelIndexNameForBill } from '@/lib/zone-steel-city-mapping';

export const metadata: Metadata = {
  title: 'Bill Summary',
  description: 'View detailed bill summary and PVC calculation breakdown'
};

interface BillDetailPageProps {
  params: Promise<{id: string;}>;
}

export default async function BillDetailPage({ params }: BillDetailPageProps) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect('/auth/signin');
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  });

  if (!user) {
    redirect('/auth/signin');
  }

  // Get the bill
  const bill = await prisma.bill.findUnique({
    where: { id: id },
    include: {
      contract: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              companyName: true
            }
          }
        }
      },
      pvcCalculation: true,
      classificationEntries: {
        include: {
          classification: true,
          subClassification: true
        }
      },
      approvedByUser: {
        select: {
          name: true,
          designation: true,
          department: true
        }
      },
      // Who passed it for payment at the accounts/audit stage.
      passedByUser: {
        select: {
          name: true,
          designation: true,
          department: true
        }
      },
      billTransaction: true
    }
  });

  if (!bill) {
    notFound();
  }

  // Check permissions
  const isContractor = user.role === 'user' || user.role === 'contractor';
  const isRailwayOfficial = user.role === 'RAILWAY_OFFICIAL' || user.role === 'railway_official';
  const isAdmin = user.role === 'admin';

  // The one gate for this page, and the same one the bill APIs use: owner, admin, an
  // explicit grant, or a department user whose zone matches AND whose bill has been
  // submitted. Before this the page only stopped contractors reading other people's
  // bills — any department user could open any bill in any zone, draft included, by
  // typing its id.
  const access = await checkUserBillAccess(user.id, id);
  if (!access?.canView) {
    redirect('/bills');
  }

  // Fetch base indices, quarterly averages, and monthly indices for display
  let indicesData = null;
  let monthlyIndicesData = null;
  let detailedMonthlyData = null;
  try {
    const baseMonth = new Date(bill.contract.baseMonth);
    const dateOfMeasurement = new Date(bill.dateOfMeasurement);
    const measurementQuarter = getQuarterFromDate(dateOfMeasurement, baseMonth);

    // Get all price indices
    const allIndices = await prisma.priceIndex.findMany();

    const normalizedBaseMonth = new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1);
    const measurementQuarterMonths = getQuarterMonths(measurementQuarter, baseMonth);
    const lastMonthOfQuarter = measurementQuarterMonths[2]; // Third month of the quarter
    const measurementEndDate = new Date(lastMonthOfQuarter.getFullYear(), lastMonthOfQuarter.getMonth() + 1, 0);

    // 1. Fetch all monthly index values in the date range from normalizedBaseMonth to measurementEndDate in ONE single query!
    const monthlyValuesAll = await prisma.monthlyIndexValue.findMany({
      where: {
        month: {
          gte: normalizedBaseMonth,
          lte: measurementEndDate
        }
      }
    });

    // 2. Build index maps in memory for O(1) lookups
    // Map key: `${priceIndexId}_${yyyy-mm}` -> value
    const monthlyValueMap = new Map<string, number>();
    for (const mv of monthlyValuesAll) {
      const monthKey = `${mv.month.getFullYear()}-${String(mv.month.getMonth() + 1).padStart(2, '0')}`;
      monthlyValueMap.set(`${mv.priceIndexId}_${monthKey}`, mv.value);
    }

    // A helper function to look up a value with fallback to static baseValue
    const getInMemoryIndexValue = (priceIndexId: string, baseValue: number | null, date: Date) => {
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return monthlyValueMap.get(`${priceIndexId}_${monthKey}`) ?? baseValue;
    };

    // Fetch base month indices in memory
    const baseIndices: { [key: string]: number } = {};
    for (const index of allIndices) {
      baseIndices[index.name] = getInMemoryIndexValue(index.id, index.baseValue, normalizedBaseMonth) ?? index.baseValue;
    }

    // Fetch quarterly averages
    const indexNames = allIndices.map(idx => idx.name);
    const quarterlyAveragesArray = await getQuarterlyAverages(
      measurementQuarter,
      indexNames,
      bill.contract.baseMonth,
      'auto'
    );

    // Convert array to object with indexName as keys
    const currentIndices: { [key: string]: number } = {};
    quarterlyAveragesArray.forEach((item) => {
      currentIndices[item.indexName] = item.average;
    });

    // Alias city-specific fuel index under 'MPNG Fuel' for zone_city pricing
    const billFuelName = getFuelIndexNameForBill(bill.zone, bill.fuelPriceType);
    if (billFuelName !== 'MPNG Fuel') {
      if (baseIndices[billFuelName] !== undefined) {
        baseIndices['MPNG Fuel'] = baseIndices[billFuelName];
      }
      if (currentIndices[billFuelName] !== undefined) {
        currentIndices['MPNG Fuel'] = currentIndices[billFuelName];
      }
    }

    // Alias city-specific steel indices under base names for zone-aware display
    const billSteelCity = getSteelCityForZone(bill.zone);
    if (billSteelCity) {
      const steelBaseNames = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
      for (const baseName of steelBaseNames) {
        const cityName = `${baseName} - ${billSteelCity}`;
        if (baseIndices[cityName] !== undefined) {
          baseIndices[baseName] = baseIndices[cityName];
        }
        if (currentIndices[cityName] !== undefined) {
          currentIndices[baseName] = currentIndices[cityName];
        }
      }
    }

    indicesData = {
      base: baseIndices,
      current: currentIndices
    };

    const detailedData: any[] = [];
    
    // Add base month row
    const baseRow: any = {
      type: 'base',
      period: baseMonth,
      label: `BASE (${baseMonth.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', month: 'short', year: 'numeric' })}) [Base Month]`,
      values: baseIndices
    };
    detailedData.push(baseRow);
    
    // Process quarters and months in memory
    const currentMonth = new Date(baseMonth);
    currentMonth.setMonth(currentMonth.getMonth() + 1); // Start from month after base
    let currentQuarter = '';
    const quarterMonths: Date[] = [];
    
    while (currentMonth <= measurementEndDate) {
      const quarter = getQuarterFromDate(new Date(currentMonth), baseMonth);
      
      // Add quarter header if new quarter
      if (quarter !== currentQuarter) {
        // Add previous quarter average if we have months
        if (quarterMonths.length > 0 && currentQuarter) {
          // Get all 3 months for the previous quarter to ensure proper averaging
          const fullQuarterMonths = getQuarterMonths(currentQuarter, baseMonth);
          
          const avgRow: any = {
            type: 'quarter_avg',
            label: `${fullQuarterMonths[0].toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', month: 'short' })}-${fullQuarterMonths[2].toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', month: 'short', year: 'numeric' })} AVERAGE`,
            values: {}
          };
          
          for (const index of allIndices) {
            let sum = 0;
            for (const month of fullQuarterMonths) {
              sum += getInMemoryIndexValue(index.id, index.baseValue, month) ?? index.baseValue;
            }
            avgRow.values[index.name] = sum / 3;
          }
          
          detailedData.push(avgRow);
          quarterMonths.length = 0;
        }
        
        currentQuarter = quarter;
        detailedData.push({
          type: 'quarter_header',
          label: `QUARTER ${quarter}`
        });
      }
      
      // Add monthly row
      const monthRow: any = {
        type: 'month',
        period: new Date(currentMonth),
        label: currentMonth.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', month: 'short', year: 'numeric' }),
        isMeasurementQuarter: quarter === measurementQuarter,
        values: {}
      };
      
      for (const index of allIndices) {
        monthRow.values[index.name] = getInMemoryIndexValue(index.id, index.baseValue, currentMonth) ?? index.baseValue;
      }
      
      detailedData.push(monthRow);
      quarterMonths.push(new Date(currentMonth));
      
      currentMonth.setMonth(currentMonth.getMonth() + 1);
    }
    
    // Add final quarter average (measurement quarter)
    if (quarterMonths.length > 0 && currentQuarter) {
      // Get all 3 months for the measurement quarter to ensure proper averaging
      const fullQuarterMonths = getQuarterMonths(currentQuarter, baseMonth);
      
      const avgRow: any = {
        type: 'quarter_avg',
        label: `${fullQuarterMonths[0].toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', month: 'short' })}-${fullQuarterMonths[2].toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', month: 'short', year: 'numeric' })} AVERAGE [Measurement Quarter Avg]`,
        isMeasurementQuarter: true,
        values: {}
      };
      
      for (const index of allIndices) {
        let sum = 0;
        for (const month of fullQuarterMonths) {
          sum += getInMemoryIndexValue(index.id, index.baseValue, month) ?? index.baseValue;
        }
        avgRow.values[index.name] = sum / 3;
      }
      
      detailedData.push(avgRow);
    }
    
    detailedMonthlyData = detailedData;

    // Alias city-specific fuel in detailed monthly data rows
    if (billFuelName !== 'MPNG Fuel') {
      for (const row of detailedData) {
        if (row.values && row.values[billFuelName] !== undefined) {
          row.values['MPNG Fuel'] = row.values[billFuelName];
        }
      }
    }

    // Alias city-specific steel in detailed monthly data rows
    if (billSteelCity) {
      const steelBaseNames = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
      for (const row of detailedData) {
        if (row.values) {
          for (const baseName of steelBaseNames) {
            const cityName = `${baseName} - ${billSteelCity}`;
            if (row.values[cityName] !== undefined) {
              row.values[baseName] = row.values[cityName];
            }
          }
        }
      }
    }

    // Keep simple monthly data for backward compatibility
    const allMonthlyValues: { [key: string]: { [monthKey: string]: number } } = {};
    for (const index of allIndices) {
      allMonthlyValues[index.name] = {};
      const currentMonthCopy = new Date(baseMonth);
      currentMonthCopy.setMonth(currentMonthCopy.getMonth() + 1);
      while (currentMonthCopy <= measurementEndDate) {
        const monthKey = `${currentMonthCopy.getFullYear()}-${String(currentMonthCopy.getMonth() + 1).padStart(2, '0')}`;
        allMonthlyValues[index.name][monthKey] = getInMemoryIndexValue(index.id, index.baseValue, currentMonthCopy) ?? index.baseValue;
        currentMonthCopy.setMonth(currentMonthCopy.getMonth() + 1);
      }
    }
    monthlyIndicesData = allMonthlyValues;
  } catch (error) {
    console.error('Error fetching indices:', error);
  }

  return (
    <BillDetailClient 
      bill={JSON.parse(JSON.stringify(bill))}
      user={JSON.parse(JSON.stringify(user))}
      indicesData={indicesData}
      monthlyIndicesData={monthlyIndicesData}
      detailedMonthlyData={detailedMonthlyData}
    />
  );
}
