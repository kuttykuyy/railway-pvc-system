import { logger } from '@/lib/logger';

import { getFileUrl } from "@/lib/s3";
import { prisma } from "@/lib/db";
import { PDFDocument } from "pdf-lib";
import { ComponentType } from "@prisma/client";
import { highlightJpcSheet } from "./jpc-highlighter";

interface ComponentIndexOptions {
  year: number;
  month: number;
  componentTypes?: ComponentType[];
}

interface ComponentIndexRangeOptions {
  startDate: Date;
  endDate: Date;
  componentTypes?: ComponentType[];
  /**
   * The bill's JPC city. When given, the steel sheets are shaded on the six items and
   * the one column the bill's indices were built from — the sheet holds 96 figures and
   * only seven of them were used, which a reader otherwise has to find by eye.
   * Leave unset to attach the sheets unmarked.
   */
  jpcCity?: string;
  /** Printed beside the note on each marked sheet, e.g. the agreement and bill number. */
  jpcCaption?: string;
}

/** The component types whose documents are JPC price sheets. */
const JPC_SHEET_TYPES: ComponentType[] = [
  ComponentType.TMT_BARS,
  ComponentType.ANGLE_CHANNEL,
  ComponentType.PLATES,
  ComponentType.OTHER_SECTIONS,
];

/**
 * Fetch and embed component index documents into a PDF
 * @deprecated Use embedComponentIndices instead
 */
export async function embedLabourIndex(
  mainPdfBytes: Uint8Array,
  options: ComponentIndexOptions
): Promise<Uint8Array> {
  return embedComponentIndices(mainPdfBytes, options);
}

/**
 * Fetch and embed component index documents into a PDF
 */
export async function embedComponentIndices(
  mainPdfBytes: Uint8Array,
  options: ComponentIndexOptions
): Promise<Uint8Array> {
  try {
    const { year, month, componentTypes } = options;

    // If no component types specified, fetch all component types
    const typesToFetch = componentTypes || Object.values(ComponentType);

    // Fetch all relevant component index documents
    const documents = await prisma.labourIndexDocument.findMany({
      where: {
        componentType: {
          in: typesToFetch,
        },
        year,
        months: {
          has: month,
        },
      },
      orderBy: [
        { componentType: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    if (documents.length === 0) {
      logger.log(`No component index documents found for ${year}-${month}`);
      return mainPdfBytes;
    }

    // Remove duplicates (keep the most recent for each component type)
    const uniqueDocuments = documents.reduce((acc, doc) => {
      if (!acc.find((d) => d.componentType === doc.componentType)) {
        acc.push(doc);
      }
      return acc;
    }, [] as typeof documents);

    // Further deduplicate by cloud storage path to avoid embedding the same physical document multiple times
    // This handles cases where the same JPC document might be referenced under different component types
    const documentsByPath = new Map<string, typeof uniqueDocuments[0]>();
    for (const doc of uniqueDocuments) {
      if (!documentsByPath.has(doc.cloudStoragePath)) {
        documentsByPath.set(doc.cloudStoragePath, doc);
      }
    }
    
    const deduplicatedDocuments = Array.from(documentsByPath.values());
    logger.log(`Found ${uniqueDocuments.length} total documents, ${deduplicatedDocuments.length} unique by file (deduped by cloud storage path)`);

    // Load main PDF
    const mainPdf = await PDFDocument.load(mainPdfBytes);

    // Embed each unique component index document
    for (const doc of deduplicatedDocuments) {
      try {
        // Get PDF bytes from database (Base64) or fallback to S3/URL download
        let indexBytes: ArrayBuffer;
        if (doc.cloudStoragePath.startsWith('db://') && doc.remarks?.startsWith('base64:')) {
          const base64Data = doc.remarks.substring(7).split('|')[0];
          indexBytes = Buffer.from(base64Data, 'base64').buffer;
        } else {
          const indexUrl = await getFileUrl(doc.cloudStoragePath);
          const indexResponse = await fetch(indexUrl);
          indexBytes = await indexResponse.arrayBuffer();
        }

        // Load component index PDF
        const indexPdf = await PDFDocument.load(indexBytes);

        // Copy all pages from component index PDF to main PDF
        const copiedPages = await mainPdf.copyPages(
          indexPdf,
          indexPdf.getPageIndices()
        );

        // Add copied pages to the end of main PDF
        copiedPages.forEach((page) => {
          mainPdf.addPage(page);
        });

        logger.log(`Embedded ${doc.componentType} index document`);
      } catch (error) {
        console.error(`Error embedding ${doc.componentType} index:`, error);
        // Continue with other documents even if one fails
      }
    }

    // Save the combined PDF
    const combinedPdfBytes = await mainPdf.save();
    return combinedPdfBytes;
  } catch (error) {
    console.error("Error embedding component indices:", error);
    // Return original PDF if embedding fails
    return mainPdfBytes;
  }
}

/**
 * Fetch and embed component index documents for a date range into a PDF
 * Fetches one document per component per year within the date range
 */
export async function embedComponentIndicesRange(
  mainPdfBytes: Uint8Array,
  options: ComponentIndexRangeOptions
): Promise<Uint8Array> {
  try {
    const { startDate, endDate, componentTypes, jpcCity, jpcCaption } = options;

    // If no component types specified, fetch all component types
    const typesToFetch = componentTypes || Object.values(ComponentType);

    // Generate list of all years in the range
    const startYear = startDate.getFullYear();
    const endYear = endDate.getFullYear();
    const yearsInRange: number[] = [];
    
    for (let year = startYear; year <= endYear; year++) {
      yearsInRange.push(year);
    }

    logger.log(`Fetching component indices for years ${yearsInRange.join(', ')} from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // Fetch documents for all years in range
    // Using Map with "componentType-year" as key to ensure one document per component per year
    const allDocuments: Map<string, any> = new Map();

    for (const year of yearsInRange) {
      const documents = await prisma.labourIndexDocument.findMany({
        where: {
          componentType: {
            in: typesToFetch,
          },
          year,
        },
        orderBy: [
          { componentType: 'asc' },
          { createdAt: 'desc' },
        ],
      });

      // Add documents to map, using component type + year as key
      // This ensures only one document per component per year (most recent one)
      for (const doc of documents) {
        const key = `${doc.componentType}-${year}`;
        if (!allDocuments.has(key)) {
          allDocuments.set(key, { ...doc, displayYear: year });
        }
      }
    }

    const uniqueDocuments = Array.from(allDocuments.values());

    if (uniqueDocuments.length === 0) {
      logger.log(`No component index documents found for years ${yearsInRange.join(', ')}`);
      return mainPdfBytes;
    }

    // Deduplicate by cloud storage path to avoid embedding the same physical document multiple times
    // This handles cases where the same JPC document might be referenced under different component types
    const documentsByPath = new Map<string, any>();
    for (const doc of uniqueDocuments) {
      if (!documentsByPath.has(doc.cloudStoragePath)) {
        documentsByPath.set(doc.cloudStoragePath, doc);
      }
    }
    
    const deduplicatedDocuments = Array.from(documentsByPath.values());
    logger.log(`Found ${uniqueDocuments.length} total documents, ${deduplicatedDocuments.length} unique by file (deduped by cloud storage path)`);

    // Load main PDF
    const mainPdf = await PDFDocument.load(mainPdfBytes);

    // Sort deduplicated documents by component type, then by year
    const sortedDocuments = deduplicatedDocuments.sort((a: any, b: any) => {
      const typeCompare = a.componentType.localeCompare(b.componentType);
      if (typeCompare !== 0) return typeCompare;
      return (a.displayYear || a.year) - (b.displayYear || b.year);
    });

    // Embed unique documents (sorted by component type, then by year)
    for (const doc of sortedDocuments) {
        try {
          // Get PDF bytes from database (Base64) or fallback to S3/URL download
          let indexBytes: ArrayBuffer;
          if (doc.cloudStoragePath.startsWith('db://') && doc.remarks?.startsWith('base64:')) {
            const base64Data = doc.remarks.substring(7).split('|')[0];
            indexBytes = Buffer.from(base64Data, 'base64').buffer;
          } else {
            const indexUrl = await getFileUrl(doc.cloudStoragePath);
            const indexResponse = await fetch(indexUrl);
            indexBytes = await indexResponse.arrayBuffer();
          }

          // Mark the cells this bill's steel indices came from, on JPC sheets only.
          // Best-effort by design: the highlighter returns the document untouched if the
          // page is not the layout it knows, so a supporting document is never lost to a
          // failed marking.
          if (jpcCity && JPC_SHEET_TYPES.includes(doc.componentType)) {
            try {
              const marked = await highlightJpcSheet(new Uint8Array(indexBytes), {
                city: jpcCity as any,
                caption: jpcCaption,
              });
              if (marked.marked) {
                indexBytes = marked.bytes.buffer.slice(
                  marked.bytes.byteOffset,
                  marked.bytes.byteOffset + marked.bytes.byteLength,
                ) as ArrayBuffer;
                logger.log(`Marked ${marked.pagesMarked} JPC page(s) for ${jpcCity} on ${doc.componentType}`);
              } else {
                logger.log(`JPC sheet left unmarked (${marked.reason}) for ${doc.componentType}`);
              }
            } catch (markError) {
              console.error('JPC marking failed, attaching the sheet as it is:', markError);
            }
          }

          // Load component index PDF
          const indexPdf = await PDFDocument.load(indexBytes);

          // Copy all pages from component index PDF to main PDF
          const copiedPages = await mainPdf.copyPages(
            indexPdf,
            indexPdf.getPageIndices()
          );

          // Add copied pages to the end of main PDF
          copiedPages.forEach((page) => {
            mainPdf.addPage(page);
          });

          logger.log(`Embedded ${doc.componentType} index document for year ${doc.displayYear}`);
        } catch (error) {
          console.error(`Error embedding ${doc.componentType} index for year ${doc.displayYear}:`, error);
          // Continue with other documents even if one fails
        }
    }

    // Save the combined PDF
    const combinedPdfBytes = await mainPdf.save();
    return combinedPdfBytes;
  } catch (error) {
    console.error("Error embedding component indices range:", error);
    // Return original PDF if embedding fails
    return mainPdfBytes;
  }
}

/**
 * Check if component index exists for a specific period
 */
export async function hasComponentIndex(
  year: number,
  month: number,
  componentType?: ComponentType
): Promise<boolean> {
  try {
    const where: any = {
      year,
      months: {
        has: month,
      },
    };

    if (componentType) {
      where.componentType = componentType;
    }

    const count = await prisma.labourIndexDocument.count({ where });
    return count > 0;
  } catch (error) {
    console.error("Error checking component index:", error);
    return false;
  }
}

/**
 * Check if labour index exists for a specific period
 * @deprecated Use hasComponentIndex instead
 */
export async function hasLabourIndex(
  year: number,
  month: number
): Promise<boolean> {
  return hasComponentIndex(year, month, ComponentType.LABOUR);
}

/**
 * Get component index documents for a specific period
 */
export async function getComponentIndexDocuments(
  year: number,
  month: number,
  componentType?: ComponentType
) {
  try {
    const where: any = {
      year,
      months: {
        has: month,
      },
    };

    if (componentType) {
      where.componentType = componentType;
    }

    return await prisma.labourIndexDocument.findMany({
      where,
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: [
        { componentType: 'asc' },
        { createdAt: 'desc' },
      ],
    });
  } catch (error) {
    console.error("Error fetching component index documents:", error);
    return [];
  }
}

/**
 * Get labour index document details
 * @deprecated Use getComponentIndexDocuments instead
 */
export async function getLabourIndexDocument(year: number, month: number) {
  const documents = await getComponentIndexDocuments(year, month, ComponentType.LABOUR);
  return documents.length > 0 ? documents[0] : null;
}

/**
 * Get MPNG Fuel monthly indices and calculate average for a date range
 */
export async function getMPNGFuelMonthlyAverage(
  startDate: Date,
  endDate: Date,
  options?: {
    fuelPriceType?: string | null;
    zone?: string | null;
  }
): Promise<{
  average: number;
  monthlyValues: Array<{ 
    month: string; 
    value: number; 
    dailyPrices: Array<{ 
      date: string; 
      delhi: number;
      mumbai: number;
      chennai: number;
      kolkata: number;
      average: number;
    }> 
  }>;
  totalMonths: number;
  sum: number;
  dataSource: 'ppac' | 'index'; // Indicates whether actual PPAC data or MPNG Fuel index was used
  fuelBasis: 'four_city_avg' | 'zone_city';
  cityName?: string; // The specific city used when fuelBasis is 'zone_city'
} | null> {
  // Determine if we should use a specific city or 4-city average
  const isZoneCity = options?.fuelPriceType === 'zone_city' && options?.zone;
  let cityName: string | undefined;
  if (isZoneCity) {
    // Import dynamically to avoid circular deps
    const { getSteelCityForZone } = await import('@/lib/zone-steel-city-mapping');
    cityName = getSteelCityForZone(options!.zone);
  }

  // Helper to extract single city value from a daily fuel price record
  const getCityValue = (dp: { delhi: number; mumbai: number; chennai: number; kolkata: number }): number => {
    if (!isZoneCity || !cityName) {
      return (dp.delhi + dp.mumbai + dp.chennai + dp.kolkata) / 4;
    }
    switch (cityName) {
      case 'Delhi': return dp.delhi;
      case 'Mumbai': return dp.mumbai;
      case 'Chennai': return dp.chennai;
      case 'Kolkata': return dp.kolkata;
      default: return (dp.delhi + dp.mumbai + dp.chennai + dp.kolkata) / 4;
    }
  };

  try {
    // First, try to fetch actual city-wise daily prices from PPAC data
    const dailyFuelPrices = await prisma.dailyFuelPrice.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { date: "asc" },
    });

    // If we have actual PPAC data, use it
    if (dailyFuelPrices.length > 0) {
      logger.log(`Found ${dailyFuelPrices.length} PPAC daily fuel prices (basis: ${isZoneCity ? cityName : '4-city avg'})`);
      
      // Group daily prices by month
      const monthlyGroups: Map<string, typeof dailyFuelPrices> = new Map();
      
      for (const dp of dailyFuelPrices) {
        const monthKey = dp.date.toISOString().substring(0, 7); // YYYY-MM
        if (!monthlyGroups.has(monthKey)) {
          monthlyGroups.set(monthKey, []);
        }
        monthlyGroups.get(monthKey)!.push(dp);
      }

      // Calculate monthly averages from actual daily prices
      const monthlyValues: Array<{
        month: string;
        value: number;
        dailyPrices: Array<{
          date: string;
          delhi: number;
          mumbai: number;
          chennai: number;
          kolkata: number;
          average: number;
        }>;
      }> = [];

      let totalSum = 0;

      // Gap-filled monthly averages (a diesel price holds until the next revision),
      // so a month with only a few recorded days still gets the right value.
      const { computeMonthlyFuelAverages } = await import('@/lib/fuel-monthly-average');
      const ffCity = (!isZoneCity || !cityName) ? 'fourCity' : (cityName.toLowerCase() as any);
      const monthlyFF = computeMonthlyFuelAverages(dailyFuelPrices, ffCity);

      for (const [monthKey, dailyPrices] of monthlyGroups) {
        let monthSum = 0;
        const formattedDailyPrices = dailyPrices.map((dp) => {
          const dayValue = getCityValue(dp);
          monthSum += dayValue;
          return {
            date: dp.date.toISOString().substring(0, 10),
            delhi: dp.delhi,
            mumbai: dp.mumbai,
            chennai: dp.chennai,
            kolkata: dp.kolkata,
            average: Math.round(dayValue * 100) / 100,
          };
        });

        const monthAvg = monthlyFF.get(monthKey) ?? (monthSum / dailyPrices.length);
        totalSum += monthAvg;

        monthlyValues.push({
          month: monthKey,
          value: Math.round(monthAvg * 100) / 100,
          dailyPrices: formattedDailyPrices,
        });
      }

      // Sort by month
      monthlyValues.sort((a, b) => a.month.localeCompare(b.month));

      const overallAverage = totalSum / monthlyValues.length;

      return {
        average: Math.round(overallAverage * 100) / 100,
        monthlyValues,
        totalMonths: monthlyValues.length,
        sum: Math.round(totalSum * 100) / 100,
        dataSource: 'ppac',
        fuelBasis: isZoneCity ? 'zone_city' : 'four_city_avg',
        cityName,
      };
    }

    // Fallback: Use the appropriate MPNG Fuel index
    const fuelIndexName = isZoneCity ? `MPNG Fuel - ${cityName}` : 'MPNG Fuel';
    logger.log(`No PPAC daily data found, falling back to index: ${fuelIndexName}`);
    
    const mpngFuelIndex = await prisma.priceIndex.findUnique({
      where: { name: fuelIndexName },
      include: {
        monthlyValues: {
          where: {
            month: {
              gte: startDate,
              lte: endDate,
            },
          },
          orderBy: {
            month: "asc",
          },
        },
      },
    });

    if (!mpngFuelIndex || mpngFuelIndex.monthlyValues.length === 0) {
      logger.log("No MPNG Fuel indices found for date range");
      return null;
    }

    // Calculate average
    const sum = mpngFuelIndex.monthlyValues.reduce(
      (acc, val) => acc + val.value,
      0
    );
    const average = sum / mpngFuelIndex.monthlyValues.length;

    // Format monthly values with daily breakdown
    const monthlyValues = mpngFuelIndex.monthlyValues.map((val) => {
      const monthDate = new Date(val.month);
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();
      
      // Get number of days in this month
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      
      // Use the stored index value for all cities (fallback behavior)
      const indexValue = val.value;
      
      const dailyPrices = [];
      for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(year, month, day);
        
        dailyPrices.push({
          date: dateObj.toISOString().substring(0, 10),
          delhi: indexValue,
          mumbai: indexValue,
          chennai: indexValue,
          kolkata: indexValue,
          average: indexValue,
        });
      }

      return {
        month: val.month.toISOString().substring(0, 7),
        value: val.value,
        dailyPrices,
      };
    });

    return {
      average: Math.round(average * 100) / 100,
      monthlyValues,
      totalMonths: mpngFuelIndex.monthlyValues.length,
      sum: Math.round(sum * 100) / 100,
      dataSource: 'index',
      fuelBasis: isZoneCity ? 'zone_city' : 'four_city_avg',
      cityName,
    };
  } catch (error) {
    console.error("Error fetching MPNG Fuel monthly average:", error);
    return null;
  }
}

