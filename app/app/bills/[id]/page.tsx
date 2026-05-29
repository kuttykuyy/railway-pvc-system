
import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { BillDetailClient } from './bill-detail-client';
import { getQuarterlyAverages } from '@/lib/db-utils';
import { getQuarterFromDate, getQuarterMonths } from '@/lib/pvc-calculations';
import { getSteelCityForZone, getFuelIndexNameForBill } from '@/lib/zone-steel-city-mapping';

export const metadata: Metadata = {
  title: 'Bill Summary',
  description: 'View detailed bill summary and PVC calculation breakdown'
};

interface BillDetailPageProps {
  params: {
    id: string;
  };
}

export default async function BillDetailPage({ params }: BillDetailPageProps) {
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
    where: { id: params.id },
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

  // Contractors can only view their own bills
  if (isContractor && bill.contract.userId !== user.id) {
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

    // Fetch base month indices
    const normalizedBaseMonth = new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1);
    const baseIndices: { [key: string]: number } = {};
    
    for (const index of allIndices) {
      const baseMonthValue = await prisma.monthlyIndexValue.findFirst({
        where: {
          priceIndexId: index.id,
          month: {
            gte: normalizedBaseMonth,
            lt: new Date(normalizedBaseMonth.getFullYear(), normalizedBaseMonth.getMonth() + 1, 1)
          }
        },
        orderBy: {
          month: 'desc'
        }
      });
      
      baseIndices[index.name] = baseMonthValue?.value || index.baseValue;
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

    // Fetch detailed monthly indices with quarterly grouping (from base month to end of measurement quarter)
    const startMonth = new Date(baseMonth);
    
    // Calculate the end date as the last day of the measurement quarter's last month
    const measurementQuarterMonths = getQuarterMonths(measurementQuarter, baseMonth);
    const lastMonthOfQuarter = measurementQuarterMonths[2]; // Third month of the quarter
    const measurementEndDate = new Date(lastMonthOfQuarter.getFullYear(), lastMonthOfQuarter.getMonth() + 1, 0);
    
    const detailedData: any[] = [];
    
    // Add base month row
    const baseRow: any = {
      type: 'base',
      period: baseMonth,
      label: `BASE (${baseMonth.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', month: 'short', year: 'numeric' })}) [Base Month]`,
      values: baseIndices
    };
    detailedData.push(baseRow);
    
    // Process quarters and months
    const currentMonth = new Date(startMonth);
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
          
          // Calculate averages using all 3 months of the quarter
          for (const index of allIndices) {
            let sum = 0;
            for (const month of fullQuarterMonths) {
              const monthValue = await prisma.monthlyIndexValue.findFirst({
                where: {
                  priceIndexId: index.id,
                  month: {
                    gte: new Date(month.getFullYear(), month.getMonth(), 1),
                    lt: new Date(month.getFullYear(), month.getMonth() + 1, 1)
                  }
                },
                orderBy: { month: 'desc' }
              });
              sum += monthValue?.value || index.baseValue;
            }
            // Always divide by 3 for a proper quarterly average
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
        const monthValue = await prisma.monthlyIndexValue.findFirst({
          where: {
            priceIndexId: index.id,
            month: {
              gte: new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1),
              lt: new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
            }
          },
          orderBy: { month: 'desc' }
        });
        monthRow.values[index.name] = monthValue?.value || index.baseValue;
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
      
      // Calculate averages using all 3 months of the quarter
      for (const index of allIndices) {
        let sum = 0;
        for (const month of fullQuarterMonths) {
          const monthValue = await prisma.monthlyIndexValue.findFirst({
            where: {
              priceIndexId: index.id,
              month: {
                gte: new Date(month.getFullYear(), month.getMonth(), 1),
                lt: new Date(month.getFullYear(), month.getMonth() + 1, 1)
              }
            },
            orderBy: { month: 'desc' }
          });
          sum += monthValue?.value || index.baseValue;
        }
        // Always divide by 3 for a proper quarterly average
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
      const currentMonth = new Date(startMonth);
      currentMonth.setMonth(currentMonth.getMonth() + 1);
      while (currentMonth <= measurementEndDate) {
        const monthKey = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
        const monthlyValue = await prisma.monthlyIndexValue.findFirst({
          where: {
            priceIndexId: index.id,
            month: {
              gte: new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1),
              lt: new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
            }
          },
          orderBy: { month: 'desc' }
        });
        allMonthlyValues[index.name][monthKey] = monthlyValue?.value || index.baseValue;
        currentMonth.setMonth(currentMonth.getMonth() + 1);
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
