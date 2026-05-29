export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getSteelCityForZone, getSteelIndexNamesForZone } from '@/lib/zone-steel-city-mapping';
import { getQuarterFromDate, getQuarterMonths } from '@/lib/pvc-calculations';

interface QuarterForecast {
  quarter: string;
  quarterLabel: string;
  months: string[];
  averageIndex: number;
  baseIndex: number;
  pvcPerLakh: number;
  trend: 'positive' | 'negative' | 'neutral';
  dataComplete: boolean;
  isEstimated?: boolean;
}

interface IndexTrend {
  month: string;
  monthLabel: string;
  value: number;
  baseValue: number;
}

// GET - Fetch PVC forecast data
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get('contractId');
    const zone = searchParams.get('zone') || 'SR';
    const steelType = searchParams.get('steelType') || 'Steel TMT Bars';
    const billingMonthParam = searchParams.get('billingMonth'); // optional

    let baseMonth: Date;
    let contractName = '';
    let agreementNo = '';

    if (contractId) {
      // Fetch contract details
      const contract = await prisma.contract.findUnique({
        where: { id: contractId },
      });
      if (!contract) {
        return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
      }
      baseMonth = new Date(contract.baseMonth);
      contractName = contract.workDescription || '';
      agreementNo = contract.agreementNo;
    } else {
      // Use provided baseMonth or default to earliest available
      const baseMonthParam = searchParams.get('baseMonth');
      if (!baseMonthParam) {
        return NextResponse.json(
          { error: 'Either contractId or baseMonth is required' },
          { status: 400 }
        );
      }
      baseMonth = new Date(baseMonthParam);
    }

    // Determine the correct steel index name for the zone
    const steelCity = getSteelCityForZone(zone);
    let indexName = steelType;
    if (steelCity !== 'Chennai') {
      // Check if user already passed a city-suffixed name
      if (!steelType.includes(' - ')) {
        indexName = `${steelType} - ${steelCity}`;
      }
    }

    // Fetch the price index
    const priceIndex = await prisma.priceIndex.findUnique({
      where: { name: indexName },
    });

    if (!priceIndex) {
      // Try without city suffix as fallback
      const fallbackIndex = await prisma.priceIndex.findUnique({
        where: { name: steelType },
      });
      if (!fallbackIndex) {
        return NextResponse.json(
          { error: `Steel index "${indexName}" not found` },
          { status: 404 }
        );
      }
      // Use fallback
      return generateForecastResponse(fallbackIndex, baseMonth, contractName, agreementNo, steelType, steelCity, billingMonthParam);
    }

    return generateForecastResponse(priceIndex, baseMonth, contractName, agreementNo, steelType, steelCity, billingMonthParam);
  } catch (error: any) {
    console.error('PVC Forecast error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate forecast' },
      { status: 500 }
    );
  }
}

async function generateForecastResponse(
  priceIndex: { id: string; name: string; baseValue: number },
  baseMonth: Date,
  contractName: string,
  agreementNo: string,
  steelType: string,
  steelCity: string,
  billingMonthParam: string | null
) {
  // Get base month index value
  const normalizedBase = new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1);
  const baseMonthValue = await prisma.monthlyIndexValue.findFirst({
    where: {
      priceIndexId: priceIndex.id,
      month: {
        gte: normalizedBase,
        lt: new Date(normalizedBase.getFullYear(), normalizedBase.getMonth() + 1, 1),
      },
    },
  });

  const baseIndex = baseMonthValue?.value || priceIndex.baseValue;

  // Fetch ALL monthly index values from base month onwards, ordered by month
  const monthlyValues = await prisma.monthlyIndexValue.findMany({
    where: {
      priceIndexId: priceIndex.id,
      month: {
        gte: normalizedBase,
      },
    },
    orderBy: { month: 'asc' },
  });

  // Build monthly trend data
  const indexTrend: IndexTrend[] = monthlyValues.map((mv) => ({
    month: mv.month.toISOString(),
    monthLabel: mv.month.toLocaleDateString('en-IN', {
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    }),
    value: mv.value,
    baseValue: baseIndex,
  }));

  // Calculate quarterly forecasts using getQuarterFromDate to get proper Q-year labels
  const quarterForecasts: QuarterForecast[] = [];
  
  if (monthlyValues.length > 0) {
    // Iterate month by month from base+1 to last available, collect unique quarters
    const baseMonthNum = baseMonth.getMonth();
    const baseYear = baseMonth.getFullYear();
    const startMonth = (baseMonthNum + 1) % 12;
    const startYear = baseMonthNum === 11 ? baseYear + 1 : baseYear;
    
    const lastMonth = monthlyValues[monthlyValues.length - 1].month;
    const totalMonthsFromStart = (lastMonth.getFullYear() - startYear) * 12 + (lastMonth.getMonth() - startMonth);
    const totalQuarters = Math.max(Math.ceil((totalMonthsFromStart + 1) / 3), 1);
    
    for (let q = 1; q <= totalQuarters; q++) {
      // Calculate the quarter year using same logic as getQuarterFromDate
      const quarterStartMonthOffset = startMonth + ((q - 1) * 3);
      const quarterYear = startYear + Math.floor(quarterStartMonthOffset / 12);
      const quarterKey = `Q${q}-${quarterYear}`;
      
      try {
        const quarterMonths = getQuarterMonths(quarterKey, baseMonth);
        
        const quarterValues: number[] = [];
        const monthLabels: string[] = [];
        
        for (const qMonth of quarterMonths) {
          const mv = monthlyValues.find((v) => {
            const vMonth = new Date(v.month);
            return vMonth.getFullYear() === qMonth.getFullYear() && 
                   vMonth.getMonth() === qMonth.getMonth();
          });
          
          monthLabels.push(
            qMonth.toLocaleDateString('en-IN', {
              month: 'short',
              year: 'numeric',
              timeZone: 'Asia/Kolkata',
            })
          );
          
          if (mv) {
            quarterValues.push(mv.value);
          }
        }
        
        // Skip quarters with zero data
        if (quarterValues.length === 0) continue;
        
        const dataComplete = quarterValues.length === 3;
        const avgIndex = quarterValues.reduce((a, b) => a + b, 0) / quarterValues.length;
        
        // PVC per lakh = (1,00,000 × (avgIndex - baseIndex)) / baseIndex
        const pvcPerLakh = baseIndex !== 0 
          ? (100000 * (avgIndex - baseIndex)) / baseIndex 
          : 0;
        
        quarterForecasts.push({
          quarter: quarterKey,
          quarterLabel: `Q${q} (${monthLabels.join(', ')})`,
          months: monthLabels,
          averageIndex: Math.round(avgIndex * 100) / 100,
          baseIndex: Math.round(baseIndex * 100) / 100,
          pvcPerLakh: Math.round(pvcPerLakh * 100) / 100,
          trend: avgIndex > baseIndex ? 'positive' : avgIndex < baseIndex ? 'negative' : 'neutral',
          dataComplete,
        });
      } catch (e) {
        console.error(`Quarter ${quarterKey} calculation error:`, e);
        break;
      }
    }
  }

  // Summary statistics
  const positiveQuarters = quarterForecasts.filter((q) => q.trend === 'positive').length;
  const negativeQuarters = quarterForecasts.filter((q) => q.trend === 'negative').length;
  const latestIndex = monthlyValues.length > 0 ? monthlyValues[monthlyValues.length - 1].value : baseIndex;
  const currentTrend = latestIndex > baseIndex ? 'rising' : latestIndex < baseIndex ? 'falling' : 'stable';

  // Find best and worst quarters
  const sortedByPvc = [...quarterForecasts].sort((a, b) => b.pvcPerLakh - a.pvcPerLakh);
  const bestQuarter = sortedByPvc.length > 0 ? sortedByPvc[0] : null;
  const worstQuarter = sortedByPvc.length > 0 ? sortedByPvc[sortedByPvc.length - 1] : null;

  // Calculate billing quarter info if billingMonth provided
  let billingQuarter: {
    quarter: string;
    quarterLabel: string;
    months: string[];
    averageIndex: number;
    baseIndex: number;
    pvcPerLakh: number;
    trend: 'positive' | 'negative' | 'neutral';
    dataComplete: boolean;
    billingMonth: string;
    isEstimated?: boolean;
    confidence?: 'high' | 'moderate' | 'low';
    confidenceNote?: string;
  } | null = null;

  let billingQuarterUnavailable: string | null = null;

  if (billingMonthParam) {
    try {
      const billingDate = new Date(billingMonthParam);
      if (!isNaN(billingDate.getTime())) {
        const qLabel = getQuarterFromDate(billingDate, baseMonth);
        // Find matching quarter from computed forecasts
        const matchingQ = quarterForecasts.find(q => q.quarter === qLabel);
        if (matchingQ) {
          billingQuarter = {
            ...matchingQ,
            billingMonth: billingDate.toLocaleDateString('en-IN', {
              month: 'long',
              year: 'numeric',
              timeZone: 'Asia/Kolkata',
            }),
          };
        } else if (monthlyValues.length >= 3) {
          // Extrapolate using weighted linear regression from up to 12 months
          const billingMonthLabel = billingDate.toLocaleDateString('en-IN', {
            month: 'long',
            year: 'numeric',
            timeZone: 'Asia/Kolkata',
          });

          try {
            const quarterMonths = getQuarterMonths(qLabel, baseMonth);

            // Use last 12 months (or all available) — wider window captures seasonal patterns
            const lookbackCount = Math.min(12, monthlyValues.length);
            const recentValues = monthlyValues.slice(-lookbackCount);
            const n = recentValues.length;
            const firstMonth = recentValues[0].month;

            // Weighted linear regression — recent months weighted exponentially higher
            // Weight formula: w_i = decay^(n-1-i), decay=0.85 means latest month has weight 1,
            // month before has 0.85, two months back 0.72, etc.
            const decay = 0.85;
            const weights = recentValues.map((_, i) => Math.pow(decay, n - 1 - i));
            const totalWeight = weights.reduce((a, b) => a + b, 0);

            const xs = recentValues.map(v =>
              (v.month.getFullYear() - firstMonth.getFullYear()) * 12 + (v.month.getMonth() - firstMonth.getMonth())
            );
            const ys = recentValues.map(v => v.value);

            // Weighted sums for regression: y = slope*x + intercept
            const wSumX = xs.reduce((acc, x, i) => acc + weights[i] * x, 0);
            const wSumY = ys.reduce((acc, y, i) => acc + weights[i] * y, 0);
            const wSumXY = xs.reduce((acc, x, i) => acc + weights[i] * x * ys[i], 0);
            const wSumX2 = xs.reduce((acc, x, i) => acc + weights[i] * x * x, 0);

            const denom = totalWeight * wSumX2 - wSumX * wSumX;
            const slope = denom !== 0 ? (totalWeight * wSumXY - wSumX * wSumY) / denom : 0;
            const intercept = (wSumY - slope * wSumX) / totalWeight;

            // Calculate R² (coefficient of determination) for confidence
            const meanY = wSumY / totalWeight;
            const ssTot = ys.reduce((acc, y, i) => acc + weights[i] * (y - meanY) * (y - meanY), 0);
            const ssRes = ys.reduce((acc, y, i) => {
              const predicted = slope * xs[i] + intercept;
              return acc + weights[i] * (y - predicted) * (y - predicted);
            }, 0);
            const rSquared = ssTot > 0 ? 1 - (ssRes / ssTot) : 0;

            // Calculate volatility: coefficient of variation of recent values
            const meanVal = ys.reduce((a, b) => a + b, 0) / n;
            const stdDev = Math.sqrt(ys.reduce((acc, y) => acc + (y - meanY) * (y - meanY), 0) / n);
            const coeffOfVariation = meanVal > 0 ? (stdDev / meanVal) * 100 : 0; // percentage

            // Project values for each quarter month
            const estimatedValues: number[] = [];
            const monthLabels: string[] = [];
            const lastAvailableMonth = recentValues[n - 1].month;
            let maxProjectionMonths = 0;

            for (const qMonth of quarterMonths) {
              const offsetFromFirst = (qMonth.getFullYear() - firstMonth.getFullYear()) * 12 + (qMonth.getMonth() - firstMonth.getMonth());
              const actual = monthlyValues.find(v => v.month.getFullYear() === qMonth.getFullYear() && v.month.getMonth() === qMonth.getMonth());
              
              if (actual) {
                estimatedValues.push(actual.value);
              } else {
                const projected = slope * offsetFromFirst + intercept;
                estimatedValues.push(Math.max(0, projected));
                // Track how far ahead we're projecting
                const monthsAhead = (qMonth.getFullYear() - lastAvailableMonth.getFullYear()) * 12 + (qMonth.getMonth() - lastAvailableMonth.getMonth());
                if (monthsAhead > maxProjectionMonths) maxProjectionMonths = monthsAhead;
              }
              
              monthLabels.push(
                qMonth.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
              );
            }

            if (estimatedValues.length > 0) {
              const avgIndex = estimatedValues.reduce((a, b) => a + b, 0) / estimatedValues.length;
              const pvcPerLakh = baseIndex !== 0 ? (100000 * (avgIndex - baseIndex)) / baseIndex : 0;
              const actualCount = quarterMonths.filter(qm => monthlyValues.some(v => v.month.getFullYear() === qm.getFullYear() && v.month.getMonth() === qm.getMonth())).length;

              // Confidence scoring based on multiple factors
              let confidenceScore = 0;
              // Factor 1: Data availability (0-35 points) — more months = better
              confidenceScore += Math.min(35, (n / 12) * 35);
              // Factor 2: R² fit quality (0-25 points) — higher = more predictable trend
              confidenceScore += rSquared * 25;
              // Factor 3: Low volatility (0-20 points) — CV < 2% = full points, > 10% = 0
              confidenceScore += Math.max(0, 20 - (coeffOfVariation / 10) * 20);
              // Factor 4: Projection distance (0-20 points) — closer = better
              // 1-2 months ahead = full, 3-4 = moderate, 5+ = low
              confidenceScore += Math.max(0, 20 - (maxProjectionMonths - 1) * 5);

              const confidence: 'high' | 'moderate' | 'low' =
                confidenceScore >= 65 ? 'high' : confidenceScore >= 40 ? 'moderate' : 'low';

              // Build human-readable confidence note
              const factors: string[] = [];
              factors.push(`${n}-month trend`);
              if (coeffOfVariation < 3) factors.push('low volatility');
              else if (coeffOfVariation < 8) factors.push('moderate volatility');
              else factors.push('high volatility');
              if (maxProjectionMonths <= 2) factors.push(`${maxProjectionMonths}m ahead`);
              else factors.push(`${maxProjectionMonths}m ahead`);
              if (actualCount > 0) factors.push(`${actualCount}/3 months actual`);
              const confidenceNote = factors.join(', ');

              billingQuarter = {
                quarter: qLabel,
                quarterLabel: `${qLabel.split('-')[0]} (${monthLabels.join(', ')})`,
                months: monthLabels,
                averageIndex: Math.round(avgIndex * 100) / 100,
                baseIndex: Math.round(baseIndex * 100) / 100,
                pvcPerLakh: Math.round(pvcPerLakh * 100) / 100,
                trend: avgIndex > baseIndex ? 'positive' : avgIndex < baseIndex ? 'negative' : 'neutral',
                dataComplete: false,
                isEstimated: true,
                confidence,
                confidenceNote,
                billingMonth: billingMonthLabel,
              };

              const confidenceLabel = confidence === 'high' ? 'High' : confidence === 'moderate' ? 'Moderate' : 'Low';
              billingQuarterUnavailable = `Indices for ${billingMonthLabel} are not yet published. Values estimated using weighted ${n}-month trend (Confidence: ${confidenceLabel})${actualCount > 0 ? ` — ${actualCount} of 3 months have actual data` : ''}. Actual PVC may differ once JPC publishes official indices.`;
            }
          } catch {
            // getQuarterMonths failed — show plain unavailable message
            const billingMonthLabel2 = billingDate.toLocaleDateString('en-IN', {
              month: 'long',
              year: 'numeric',
              timeZone: 'Asia/Kolkata',
            });
            billingQuarterUnavailable = `Indices for ${billingMonthLabel2} (${qLabel}) are not yet available. JPC steel indices are typically published 1-2 months after the quarter ends. Check back once the indices are uploaded.`;
          }
        } else {
          // Not enough data to extrapolate
          const billingMonthLabel = billingDate.toLocaleDateString('en-IN', {
            month: 'long',
            year: 'numeric',
            timeZone: 'Asia/Kolkata',
          });
          billingQuarterUnavailable = `Indices for ${billingMonthLabel} (${qLabel}) are not yet available and there is insufficient historical data to estimate. JPC steel indices are typically published 1-2 months after the quarter ends.`;
        }
      }
    } catch {
      // Ignore invalid billing month
    }
  }

  return NextResponse.json({
    contractName,
    agreementNo,
    steelType,
    steelCity,
    indexName: priceIndex.name,
    baseMonth: baseMonth.toISOString(),
    baseIndex: Math.round(baseIndex * 100) / 100,
    latestIndex: Math.round(latestIndex * 100) / 100,
    currentTrend,
    indexTrend,
    quarterForecasts,
    billingQuarter,
    billingQuarterUnavailable,
    summary: {
      totalQuarters: quarterForecasts.length,
      positiveQuarters,
      negativeQuarters,
      bestQuarter: bestQuarter ? {
        quarter: bestQuarter.quarter,
        quarterLabel: bestQuarter.quarterLabel,
        pvcPerLakh: bestQuarter.pvcPerLakh,
      } : null,
      worstQuarter: worstQuarter ? {
        quarter: worstQuarter.quarter,
        quarterLabel: worstQuarter.quarterLabel,
        pvcPerLakh: worstQuarter.pvcPerLakh,
      } : null,
    },
  });
}
