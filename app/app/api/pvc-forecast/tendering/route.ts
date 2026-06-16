export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getSteelCityForZone, getFuelIndexNameForBill } from '@/lib/zone-steel-city-mapping';
import { getQuarterMonths, getQuarterFromDate } from '@/lib/pvc-calculations';

interface CoefficientSet {
  labor: number;
  cement: number;
  steel: number;
  fuel: number;
  materials: number;
  machinery: number;
  explosives: number;
  fixed: number;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      totalValue,
      duration,
      startMonth,
      baseMonth,
      zone = 'SR',
      steelTypes = ['TMT'],
      coefficients
    }: {
      totalValue: number;
      duration: number;
      startMonth: string;
      baseMonth: string;
      zone?: string;
      steelTypes?: string[];
      coefficients: CoefficientSet;
    } = body;

    if (!totalValue || !duration || !startMonth || !baseMonth || !coefficients) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const baseMonthDate = new Date(baseMonth + '-01');
    const startMonthDate = new Date(startMonth + '-01');

    // Index names mapping based on zone
    const steelCity = getSteelCityForZone(zone);
    
    // Resolve single steelType fallback for backward compatibility
    let selectedSteelTypes = steelTypes;
    if (!selectedSteelTypes && body.steelType) {
      const mapType = (type: string) => {
        if (type.includes('TMT')) return 'TMT';
        if (type.includes('Angle')) return 'ANGLE_CHANNEL';
        if (type.includes('Plate')) return 'PLATES';
        if (type.includes('Other')) return 'OTHER_SECTIONS';
        return 'TMT';
      };
      selectedSteelTypes = [mapType(body.steelType)];
    }
    if (!selectedSteelTypes || selectedSteelTypes.length === 0) {
      selectedSteelTypes = ['TMT'];
    }

    const getSteelIndexName = (type: string) => {
      const mapping: Record<string, string> = {
        'TMT': 'Steel TMT Bars',
        'ANGLE_CHANNEL': 'Steel Angle/Channel',
        'PLATES': 'Steel Plates',
        'OTHER_SECTIONS': 'Steel Other Sections',
        'TMT_BARS': 'Steel TMT Bars'
      };
      const baseName = mapping[type] || 'Steel TMT Bars';
      if (steelCity !== 'Chennai' && !baseName.includes(' - ')) {
        return `${baseName} - ${steelCity}`;
      }
      return baseName;
    };

    const steelDbNames = Array.from(new Set(selectedSteelTypes.map(t => getSteelIndexName(t))));
    const fuelIndexName = getFuelIndexNameForBill(zone, 'zone_city');

    const nonSteelMapping = {
      labor: 'Labour',
      cement: 'RBI Cement',
      fuel: fuelIndexName,
      materials: 'RBI Other Materials',
      machinery: 'RBI Plant Machinery',
      explosives: 'RBI Explosives'
    };

    const allDbNamesToFetch = [
      ...Object.values(nonSteelMapping),
      ...steelDbNames
    ];

    // Fetch index metadata and historical values in parallel
    const fetchedIndices = await Promise.all(
      allDbNamesToFetch.map(async (name) => {
        const priceIndex = await prisma.priceIndex.findUnique({
          where: { name },
          include: {
            monthlyValues: {
              orderBy: { month: 'asc' }
            }
          }
        });
        return { name, priceIndex };
      })
    );

    const priceIndexMap = new Map<string, any>();
    for (const item of fetchedIndices) {
      priceIndexMap.set(item.name, item.priceIndex);
    }

    const baseIndices: Record<string, number> = {};
    const historicalTrends: Record<string, { month: Date; value: number }[]> = {};
    const dataFreshness: Record<string, string> = {};

    // Determine Base Indices and load histories for non-steel components
    const nonSteelKeys = Object.keys(nonSteelMapping) as Array<keyof typeof nonSteelMapping>;
    for (const key of nonSteelKeys) {
      const name = nonSteelMapping[key];
      const priceIndex = priceIndexMap.get(name);

      if (!priceIndex) {
        baseIndices[key] = 100;
        historicalTrends[key] = [];
        continue;
      }

      // Base month index value
      const baseValRecord = priceIndex.monthlyValues.find(
        (v: any) =>
          v.month.getFullYear() === baseMonthDate.getFullYear() &&
          v.month.getMonth() === baseMonthDate.getMonth()
      );
      baseIndices[key] = baseValRecord?.value || priceIndex.baseValue || 100;
      historicalTrends[key] = priceIndex.monthlyValues.map((v: any) => ({
        month: v.month,
        value: v.value
      }));
      const lastEntry = priceIndex.monthlyValues[priceIndex.monthlyValues.length - 1];
      if (lastEntry) {
        dataFreshness[key] = lastEntry.month.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      }
    }

    // Combine multiple steel indices into a single virtual steel index
    const steelBaseValues: number[] = [];
    const steelHistoriesByMonth = new Map<string, number[]>();

    for (const name of steelDbNames) {
      const priceIndex = priceIndexMap.get(name);
      if (!priceIndex) continue;

      const baseValRecord = priceIndex.monthlyValues.find(
        (v: any) =>
          v.month.getFullYear() === baseMonthDate.getFullYear() &&
          v.month.getMonth() === baseMonthDate.getMonth()
      );
      const baseVal = baseValRecord?.value || priceIndex.baseValue || 100;
      steelBaseValues.push(baseVal);

      for (const v of priceIndex.monthlyValues) {
        const monthKey = `${v.month.getFullYear()}-${v.month.getMonth()}`;
        if (!steelHistoriesByMonth.has(monthKey)) {
          steelHistoriesByMonth.set(monthKey, []);
        }
        steelHistoriesByMonth.get(monthKey)!.push(v.value);
      }
    }

    baseIndices['steel'] = steelBaseValues.length > 0
      ? steelBaseValues.reduce((a, b) => a + b, 0) / steelBaseValues.length
      : 100;

    const steelHistoryMerged: { month: Date; value: number }[] = [];
    for (const [monthKey, vals] of steelHistoriesByMonth.entries()) {
      const [year, month] = monthKey.split('-').map(Number);
      const avgVal = vals.reduce((a, b) => a + b, 0) / vals.length;
      steelHistoryMerged.push({
        month: new Date(year, month, 1),
        value: avgVal
      });
    }
    steelHistoryMerged.sort((a, b) => a.month.getTime() - b.month.getTime());
    historicalTrends['steel'] = steelHistoryMerged;
    if (steelHistoryMerged.length > 0) {
      const lastSteel = steelHistoryMerged[steelHistoryMerged.length - 1];
      dataFreshness['steel'] = lastSteel.month.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    }

    const keys: Array<keyof Omit<CoefficientSet, 'fixed'>> = [
      'labor', 'cement', 'steel', 'fuel', 'materials', 'machinery', 'explosives'
    ];

    // Projections logic using weighted linear regression
    const projectIndex = (
      history: { month: Date; value: number }[],
      baseIndexVal: number,
      targetDate: Date
    ) => {
      // Find actual if already in database
      const actual = history.find(
        (h) => h.month.getFullYear() === targetDate.getFullYear() && h.month.getMonth() === targetDate.getMonth()
      );
      if (actual) return actual.value;

      if (history.length < 3) return baseIndexVal; // Fallback

      const lookback = Math.min(24, history.length);
      const recent = history.slice(-lookback);
      const n = recent.length;
      const firstMonth = recent[0].month;

      const decay = 0.9; // Recent months have higher weight
      const weights = recent.map((_, i) => Math.pow(decay, n - 1 - i));
      const totalWeight = weights.reduce((a, b) => a + b, 0);

      const xs = recent.map(v =>
        (v.month.getFullYear() - firstMonth.getFullYear()) * 12 + (v.month.getMonth() - firstMonth.getMonth())
      );
      const ys = recent.map(v => v.value);

      const wSumX = xs.reduce((acc, x, i) => acc + weights[i] * x, 0);
      const wSumY = ys.reduce((acc, y, i) => acc + weights[i] * y, 0);
      const wSumXY = xs.reduce((acc, x, i) => acc + weights[i] * x * ys[i], 0);
      const wSumX2 = xs.reduce((acc, x, i) => acc + weights[i] * x * x, 0);

      const denom = totalWeight * wSumX2 - wSumX * wSumX;
      const slope = denom !== 0 ? (totalWeight * wSumXY - wSumX * wSumY) / denom : 0;
      const intercept = (wSumY - slope * wSumX) / totalWeight;

      const targetOffset = (targetDate.getFullYear() - firstMonth.getFullYear()) * 12 + (targetDate.getMonth() - firstMonth.getMonth());
      const projected = slope * targetOffset + intercept;
      return Math.max(0, projected);
    };

    // Calculate month offsets and monthly values for project duration
    const projectMonths: Date[] = [];
    for (let i = 0; i < duration; i++) {
      const d = new Date(startMonthDate.getFullYear(), startMonthDate.getMonth() + i, 1);
      projectMonths.push(d);
    }

    // Project monthly index values for Baseline, Aggressive, and Conservative scenarios
    const monthlyValuesForecast: Record<string, { baseline: number; aggressive: number; conservative: number }[]> = {};

    for (const key of keys) {
      monthlyValuesForecast[key] = projectMonths.map((targetMonth, idx) => {
        const history = historicalTrends[key];
        const baseVal = baseIndices[key];
        const baseline = projectIndex(history, baseVal, targetMonth);

        // Aggressive: Compound +0.4% monthly inflation index shift
        const aggressive = baseline * Math.pow(1.004, idx);
        // Conservative: Compound -0.4% monthly index shift
        const conservative = baseline * Math.pow(0.996, idx);

        return {
          baseline: Math.round(baseline * 100) / 100,
          aggressive: Math.round(aggressive * 100) / 100,
          conservative: Math.round(conservative * 100) / 100
        };
      });
    }

    // Organize into quarters relative to baseMonth
    const totalQuarters = Math.ceil(duration / 3);
    const startMonthOffset = (startMonthDate.getFullYear() - baseMonthDate.getFullYear()) * 12 + (startMonthDate.getMonth() - baseMonthDate.getMonth());
    const startQuarter = Math.ceil(startMonthOffset / 3) + 1;

    interface ScenarioResult {
      totalPvc: number;
      quarterBreakdown: {
        quarterKey: string;
        quarterLabel: string;
        pvcAmount: number;
        components: Record<string, number>;
      }[];
    }

    const runScenario = (scenario: 'baseline' | 'aggressive' | 'conservative'): ScenarioResult => {
      let totalPvc = 0;
      const quarterBreakdown: ScenarioResult['quarterBreakdown'] = [];
      const quarterValue = totalValue / totalQuarters;

      for (let q = 0; q < totalQuarters; q++) {
        const qNum = startQuarter + q;
        const quarterKey = `Q${qNum}-${baseMonthDate.getFullYear() + Math.floor((baseMonthDate.getMonth() + (qNum - 1) * 3) / 12)}`;
        
        // Months in this quarter
        const qMonths = getQuarterMonths(quarterKey, baseMonthDate);
        const qComponents: Record<string, number> = {};
        let qPvc = 0;

        for (const key of keys) {
          const coeff = coefficients[key] || 0;
          if (coeff === 0) {
            qComponents[key] = 0;
            continue;
          }

          const baseVal = baseIndices[key];
          const values: number[] = [];

          for (const qMonth of qMonths) {
            const projectIdx = projectMonths.findIndex(
              (pm) => pm.getFullYear() === qMonth.getFullYear() && pm.getMonth() === qMonth.getMonth()
            );
            if (projectIdx !== -1) {
              values.push(monthlyValuesForecast[key][projectIdx][scenario]);
            } else {
              // Fallback to regression
              values.push(projectIndex(historicalTrends[key], baseVal, qMonth));
            }
          }

          const avgIndex = values.reduce((a, b) => a + b, 0) / (values.length || 1);
          // PVC Escalation = Quarter value * coeff % * (avgIndex - baseIndex) / baseIndex
          const esc = baseVal !== 0 ? quarterValue * (coeff / 100) * (avgIndex - baseVal) / baseVal : 0;
          
          qComponents[key] = Math.round(esc);
          qPvc += esc;
        }

        totalPvc += qPvc;
        quarterBreakdown.push({
          quarterKey,
          quarterLabel: `Quarter ${q + 1} (${qMonths[0].toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })} - ${qMonths[qMonths.length - 1].toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })})`,
          pvcAmount: Math.round(qPvc),
          components: qComponents
        });
      }

      return { totalPvc: Math.round(totalPvc), quarterBreakdown };
    };

    const baselineResult = runScenario('baseline');
    const aggressiveResult = runScenario('aggressive');
    const conservativeResult = runScenario('conservative');

    // Risk Analysis & Loading Recommendation Calculation
    // Total inflation risk based on baseline index shifts
    let totalProjectedCostInflation = 0;
    for (const key of keys) {
      const coeff = coefficients[key] || 0;
      const baseVal = baseIndices[key];
      const history = historicalTrends[key];
      
      const lastMonth = projectMonths[projectMonths.length - 1];
      const endVal = projectIndex(history, baseVal, lastMonth);
      const inflationDelta = baseVal !== 0 ? (endVal - baseVal) / baseVal : 0;

      // Contractor's direct spending inflation on this material
      totalProjectedCostInflation += totalValue * (coeff / 100) * inflationDelta;
    }

    // Inflation on fixed component (since fixed component does not escalate in GCC, contractor absorbs 100% of it)
    const fixedCoeff = coefficients.fixed || 0;
    // Assume average commodities/labor inflation applies to the fixed cost overhead
    const avgInflationDelta = keys.reduce((acc, k) => {
      const b = baseIndices[k];
      const e = projectIndex(historicalTrends[k], b, projectMonths[projectMonths.length - 1]);
      return acc + (b !== 0 ? (e - b) / b : 0);
    }, 0) / keys.length;

    totalProjectedCostInflation += totalValue * (fixedCoeff / 100) * avgInflationDelta;

    const uncompensatedInflation = Math.max(0, totalProjectedCostInflation - baselineResult.totalPvc);
    const recommendedLoadingPercent = totalValue > 0 ? (uncompensatedInflation / totalValue) * 100 : 0;

    // Component risk rankings based on volatility
    const componentRisks = keys.map((key) => {
      const history = historicalTrends[key];
      if (history.length < 5) return { key, risk: 'low', stdDev: 0 };

      const values = history.slice(-12).map((h) => h.value);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const stdDev = Math.sqrt(values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / values.length);
      const cv = mean > 0 ? (stdDev / mean) * 100 : 0; // Coefficient of Variation

      return {
        key,
        stdDev: Math.round(stdDev * 100) / 100,
        risk: cv > 8 ? 'high' : cv > 4 ? 'moderate' : 'low'
      };
    });

    const indexTrendData = projectMonths.map((m, idx) => {
      const label = m.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
      const record: Record<string, number> = { monthIndex: idx };
      for (const key of keys) {
        record[`${key}_baseline`] = monthlyValuesForecast[key][idx].baseline;
        record[`${key}_base`] = baseIndices[key];
      }
      return { month: label, ...record };
    });

    return NextResponse.json({
      dataFreshness,
      contractDetails: {
        totalValue,
        duration,
        startMonth: startMonthDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
        baseMonth: baseMonthDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
        zone,
        steelCity,
        selectedSteelTypes,
        coefficients
      },
      baseIndices,
      monthlyIndexTrends: indexTrendData,
      scenarios: {
        baseline: baselineResult,
        aggressive: aggressiveResult,
        conservative: conservativeResult
      },
      biddingIntelligence: {
        totalProjectedCostInflation: Math.round(totalProjectedCostInflation),
        uncompensatedInflation: Math.round(uncompensatedInflation),
        recommendedLoadingPercent: Math.round(recommendedLoadingPercent * 100) / 100,
        riskLevel: recommendedLoadingPercent > 3 ? 'high' : recommendedLoadingPercent > 1 ? 'moderate' : 'low',
        componentRisks
      }
    });

  } catch (error: any) {
    console.error('Tendering Estimator error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to calculate tendering forecast' },
      { status: 500 }
    );
  }
}
