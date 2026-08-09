import { prisma } from './db';

/**
 * The GCC 2022 Clause 46A.9 steel index arithmetic and its write-back to the monthly
 * indices — moved out of the jpc-items route so the cross-check's fix endpoint uses the
 * IDENTICAL formulas. Two places computing "the same" averages is how a corrected rate
 * ends up feeding a stale index.
 *
 * TMT Bars: (10mm_F1 + 10mm_F2 + 25mm_F1 + 25mm_F2) ÷ 4
 * Angle/Channel: Average of [ISA 75x6 avg, MS Plate-10mm avg, ISMC 150x75 avg]
 * Plates: Average of [MS Plate-10mm avg, MS Plate-25mm avg]
 * Other Sections: (TMT + Angle/Channel + Plates) ÷ 3 [GCC 46A.9]
 */
export function calculateAveragesFromGetValues(
  getValues: (itemId: string) => { f1: number; f2: number; avg: number }
): Record<string, { value: number; formula: string }> {
  const result: Record<string, { value: number; formula: string }> = {};

  // TMT Bars: Average of all 4 F1/F2 values - keep 2 decimal places
  const tmt10 = getValues('tmt_10mm');
  const tmt25 = getValues('tmt_25mm');
  const tmtValues = [tmt10.f1, tmt10.f2, tmt25.f1, tmt25.f2].filter(v => v > 0);
  if (tmtValues.length > 0) {
    const sum = tmtValues.reduce((a, b) => a + b, 0);
    result.TMT = {
      value: parseFloat((sum / tmtValues.length).toFixed(2)),
      formula: `(${tmt10.f1 || '-'} + ${tmt10.f2 || '-'} + ${tmt25.f1 || '-'} + ${tmt25.f2 || '-'}) ÷ ${tmtValues.length}`
    };
  } else {
    result.TMT = { value: 0, formula: '-' };
  }

  // Angle/Channel: Average of item averages - keep 2 decimal places
  const isaAvg = getValues('angle_75x75x6mm').avg;
  const plateAvg = getValues('plate_10mm').avg;
  const ismcAvg = getValues('channel_150x75mm').avg;
  const angleValues = [isaAvg, plateAvg, ismcAvg].filter(v => v > 0);
  if (angleValues.length > 0) {
    const sum = angleValues.reduce((a, b) => a + b, 0);
    result.ANGLE_CHANNEL = {
      value: parseFloat((sum / angleValues.length).toFixed(2)),
      formula: `(${isaAvg || '-'} + ${plateAvg || '-'} + ${ismcAvg || '-'}) ÷ ${angleValues.length}`
    };
  } else {
    result.ANGLE_CHANNEL = { value: 0, formula: '-' };
  }

  // Plates: Average of item averages - keep 2 decimal places
  const plate10Avg = getValues('plate_10mm').avg;
  const plate25Avg = getValues('plate_25mm').avg;
  const platesValues = [plate10Avg, plate25Avg].filter(v => v > 0);
  if (platesValues.length > 0) {
    const sum = platesValues.reduce((a, b) => a + b, 0);
    result.PLATES = {
      value: parseFloat((sum / platesValues.length).toFixed(2)),
      formula: `(${plate10Avg || '-'} + ${plate25Avg || '-'}) ÷ ${platesValues.length}`
    };
  } else {
    result.PLATES = { value: 0, formula: '-' };
  }

  // Other Sections: (TMT + Angle/Channel + Plates) ÷ 3 as per GCC 2022 Clause 46A.9
  const tmtVal = result.TMT.value;
  const angleVal = result.ANGLE_CHANNEL.value;
  const platesVal = result.PLATES.value;

  const validIndices = [tmtVal, angleVal, platesVal].filter(v => v > 0);
  if (validIndices.length > 0) {
    const sum = validIndices.reduce((a, b) => a + b, 0);
    result.OTHER_SECTIONS = {
      value: parseFloat((sum / validIndices.length).toFixed(2)),
      formula: `(${tmtVal || '-'} + ${angleVal || '-'} + ${platesVal || '-'}) ÷ ${validIndices.length} [GCC 46A.9]`
    };
  } else {
    result.OTHER_SECTIONS = { value: 0, formula: '-' };
  }

  return result;
}

/** Averages from JpcSteelItem rows keyed by itemCode (database shape). */
export function calculateIndexAveragesFromItemsMap(
  itemsMap: Record<string, { f1: number | null; f2: number | null; average: number | null } | undefined>
): Record<string, { value: number; formula: string }> {
  return calculateAveragesFromGetValues((itemId) => {
    const item = itemsMap[itemId];
    return {
      f1: item?.f1 || 0,
      f2: item?.f2 || 0,
      avg: item?.average || 0
    };
  });
}

/**
 * Import calculated averages to steel indices (MonthlyIndexValue)
 * Saves to both the default (Chennai-based) indices AND city-specific indices
 */
export async function importToSteelIndices(
  monthDate: Date,
  indexAverages: Record<string, { value: number; formula: string }>,
  isProvisional: boolean,
  city: string = 'Chennai'
): Promise<{ created: number; updated: number }> {
  const results = { created: 0, updated: 0 };

  const indexNameMap: Record<string, string> = {
    TMT: 'Steel TMT Bars',
    ANGLE_CHANNEL: 'Steel Angle/Channel',
    PLATES: 'Steel Plates',
    OTHER_SECTIONS: 'Steel Other Sections'
  };

  for (const [indexKey, calcResult] of Object.entries(indexAverages)) {
    const avgValue = calcResult.value;
    if (!avgValue || avgValue === 0) continue;

    const baseIndexName = indexNameMap[indexKey];
    if (!baseIndexName) continue;

    // Build list of index names to update:
    // 1. Default index (for Chennai only, backward compatibility)
    // 2. City-specific index (e.g., "Steel TMT Bars - Delhi")
    const indexNames: string[] = [];
    if (city === 'Chennai') {
      indexNames.push(baseIndexName); // Update default (Chennai) index
    }
    indexNames.push(`${baseIndexName} - ${city}`); // Always update city-specific index

    for (const indexName of indexNames) {
      const priceIndex = await prisma.priceIndex.findFirst({
        where: { name: indexName }
      });

      if (!priceIndex) {
        console.warn(`Price index not found: ${indexName}`);
        continue;
      }

      // Check if value exists
      const existing = await prisma.monthlyIndexValue.findUnique({
        where: {
          priceIndexId_month: {
            priceIndexId: priceIndex.id,
            month: monthDate
          }
        }
      });

      if (existing) {
        await prisma.monthlyIndexValue.update({
          where: { id: existing.id },
          data: {
            value: avgValue,
            isProvisional,
            source: `JPC ${city}`
          }
        });
        results.updated++;
      } else {
        await prisma.monthlyIndexValue.create({
          data: {
            priceIndexId: priceIndex.id,
            month: monthDate,
            value: avgValue,
            isProvisional,
            source: `JPC ${city}`
          }
        });
        results.created++;
      }
    }
  }

  return results;
}
