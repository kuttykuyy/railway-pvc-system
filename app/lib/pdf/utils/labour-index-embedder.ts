import { logger } from '@/lib/logger';

import { getFileUrl } from "@/lib/s3";
import { prisma } from "@/lib/db";
import { PDFDocument } from "pdf-lib";
import { ComponentType } from "@prisma/client";
import { highlightJpcSheet } from "./jpc-highlighter";
import { highlightComponentSheet, componentSheetIsMarkable } from "./component-sheet-highlighter";

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
/**
 * A document's bytes, fetched once per running instance.
 *
 * The same handful of index documents is embedded into statement after statement, and
 * each one was fetched again every time — 45 MB of files against 7.3 GB of egress.
 * Held here, a warm instance embeds them without asking for them again. Bounded, and
 * keyed by storage path, so it holds the few documents in current use rather than
 * everything ever embedded.
 */
const documentBytesCache = new Map<string, Buffer>();
const DOCUMENT_CACHE_MAX = 24;

/** A detached copy, so a caller that slices or marks it cannot alter the cached one. */
function toArrayBuffer(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function loadDocumentBytes(cloudStoragePath: string): Promise<Buffer> {
  const cached = documentBytesCache.get(cloudStoragePath);
  if (cached) return cached;

  let bytes: Buffer;
  if (cloudStoragePath.startsWith('db://')) {
    // Read the base64 only now, and only for a document that is actually being
    // embedded. Selecting it alongside every candidate is what made this expensive.
    const row = await prisma.labourIndexDocument.findFirst({
      where: { cloudStoragePath },
      select: { remarks: true },
    });
    const remarks = row?.remarks || '';
    if (!remarks.startsWith('base64:')) {
      throw new Error(`${cloudStoragePath} is held in the database but carries no bytes`);
    }
    bytes = Buffer.from(remarks.substring(7).split('|')[0], 'base64');
  } else {
    const url = await getFileUrl(cloudStoragePath);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`download returned HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }

  if (documentBytesCache.size >= DOCUMENT_CACHE_MAX) {
    documentBytesCache.delete(documentBytesCache.keys().next().value as string);
  }
  documentBytesCache.set(cloudStoragePath, bytes);
  return bytes;
}

export async function embedComponentIndices(
  mainPdfBytes: Uint8Array,
  options: ComponentIndexOptions
): Promise<Uint8Array> {
  try {
    const { year, month, componentTypes } = options;

    // If no component types specified, fetch all component types
    const typesToFetch = componentTypes || Object.values(ComponentType);

    // Only the columns needed to CHOOSE documents. remarks holds an entire PDF as
    // base64, and selecting it here dragged every candidate's bytes across the wire —
    // including the duplicates thrown away immediately below. The bytes are fetched
    // afterwards, for the few documents that survive.
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
      select: {
        id: true, componentType: true, year: true, months: true,
        fileName: true, cloudStoragePath: true, createdAt: true,
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
        const indexBytes = toArrayBuffer(await loadDocumentBytes(doc.cloudStoragePath));

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
      // Every document of the year, and remarks holds an entire PDF as base64 — so
      // selecting it here pulled the bytes of every document of every year in range,
      // for the handful that end up embedded. The bytes are loaded afterwards, once
      // each, for the documents that survive the choosing.
      const documents = await prisma.labourIndexDocument.findMany({
        where: {
          componentType: {
            in: typesToFetch,
          },
          year,
        },
        select: {
          id: true, componentType: true, year: true, months: true,
          fileName: true, cloudStoragePath: true, createdAt: true,
        },
        orderBy: [
          { componentType: 'asc' },
          { createdAt: 'desc' },
        ],
      });

      // The months of the bill's range that fall in this year — what the attached
      // documents must cover, together.
      const neededFrom = startDate.getFullYear() === year ? startDate.getMonth() + 1 : 1;
      const neededTo = endDate.getFullYear() === year ? endDate.getMonth() + 1 : 12;

      // One document per component-year used to be kept — the most recent upload, its
      // months ignored. That works for sheets published one page per year, but fuel
      // sheets arrive as several uploads each covering a few months, so only the latest
      // slice was attached and the rest of base-to-measurement went missing. Keep every
      // document that contributes a needed month not already covered, newest first.
      const coveredByType = new Map<string, Set<number>>();
      for (const doc of documents) {
        const covered = coveredByType.get(doc.componentType) || new Set<number>();
        // A document without recorded months is treated as covering its whole year, as
        // the old selection implicitly did.
        const docMonths: number[] = doc.months?.length ? doc.months : Array.from({ length: 12 }, (_, i) => i + 1);
        const contributes = docMonths.filter(m => m >= neededFrom && m <= neededTo && !covered.has(m));
        if (contributes.length === 0) continue;
        contributes.forEach(m => covered.add(m));
        coveredByType.set(doc.componentType, covered);
        allDocuments.set(`${doc.componentType}-${year}-${doc.id}`, { ...doc, displayYear: year });
      }

      // A component whose documents none intersect the needed months keeps the most
      // recent one, as before — an off-months sheet beats an absent one.
      for (const doc of documents) {
        if (coveredByType.has(doc.componentType)) continue;
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
    // This handles cases where the same JPC document might be referenced under different component types.
    //
    // A path shared across records with DIFFERENT year/month tags (one straddling PDF
    // registered under two years, say) is marked slice-unsafe: the kept record's tags
    // speak for only part of the file, and slicing by them would cut away the other
    // record's pages while the selection logic believes them covered. Such documents
    // attach whole — attach-whole is what made path sharing harmless before slicing.
    const documentsByPath = new Map<string, any>();
    for (const doc of uniqueDocuments) {
      const kept = documentsByPath.get(doc.cloudStoragePath);
      if (!kept) {
        documentsByPath.set(doc.cloudStoragePath, doc);
      } else if (
        kept.year !== doc.year ||
        JSON.stringify([...(kept.months || [])].sort()) !== JSON.stringify([...(doc.months || [])].sort())
      ) {
        kept.sliceUnsafe = true;
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
          let indexBytes: ArrayBuffer = toArrayBuffer(await loadDocumentBytes(doc.cloudStoragePath));

          // Mark, on each sheet, the figures this bill's PVC actually used. Best-effort
          // by design: the highlighters return the document untouched if a page is not
          // a layout they know, so a supporting document is never lost to a failed
          // marking. jpcCity doubles as the switch for all marking — it is set exactly
          // when the caller wants marked sheets.
          // The months of the bill's index range that fall in this sheet's year — used
          // to slice the JPC year down and to mark what remains.
          const docYear = doc.displayYear || doc.year;
          const usedFrom = startDate.getFullYear() === docYear ? startDate.getMonth() + 1 : 1;
          const usedTo = endDate.getFullYear() === docYear ? endDate.getMonth() + 1 : 12;
          const usedMonths: number[] = [];
          for (let m = usedFrom; m <= usedTo; m++) usedMonths.push(m);
          const yearInRange = docYear >= startDate.getFullYear() && docYear <= endDate.getFullYear();

          // A JPC document is a whole year — 72 pages — and its pages follow the JPC's
          // own rhythm: two fortnights a month, three pages a fortnight, six pages a
          // month, in the order of the document's recorded month list. A bill that used
          // March to June should carry those months' pages, not the year. The slice is
          // trusted only when the page count fits the rhythm exactly; a document that
          // does not fit attaches whole, since slicing it would put the WRONG months
          // into a legal document while labelling them as the right ones.
          // Whether this document's pages are known to follow the six-per-month rhythm.
          // The marker leans on that rhythm (every third page carries the 24-item
          // table); on a document that does not fit, the same stride lands on the
          // items-25-34 page or the disclaimer and boxes the wrong rows — so marking is
          // only allowed when the rhythm held, or the document is a single sheet.
          let jpcRhythmKnown = false;
          if (JPC_SHEET_TYPES.includes(doc.componentType) && yearInRange && usedMonths.length && !doc.sliceUnsafe) {
            try {
              const PAGES_PER_MONTH = 6;
              const docMonths: number[] = [...(doc.months || [])].sort((a: number, b: number) => a - b);
              const src = await PDFDocument.load(indexBytes);
              const fitsRhythm = docMonths.length > 0 && src.getPageCount() === docMonths.length * PAGES_PER_MONTH;
              jpcRhythmKnown = fitsRhythm || src.getPageCount() === 1;
              const wanted = usedMonths.filter(m => docMonths.includes(m));
              if (fitsRhythm && wanted.length > 0 && wanted.length < docMonths.length) {
                const slicedDoc = await PDFDocument.create();
                const pageIndices = wanted.flatMap(m => {
                  const at = docMonths.indexOf(m) * PAGES_PER_MONTH;
                  return Array.from({ length: PAGES_PER_MONTH }, (_, k) => at + k);
                });
                const pages = await slicedDoc.copyPages(src, pageIndices);
                pages.forEach(p => slicedDoc.addPage(p));
                const slicedBytes = await slicedDoc.save();
                indexBytes = slicedBytes.buffer.slice(
                  slicedBytes.byteOffset,
                  slicedBytes.byteOffset + slicedBytes.byteLength,
                ) as ArrayBuffer;
                console.log(`Sliced ${doc.componentType} ${docYear} to months ${wanted.join(',')} — ${pageIndices.length} of ${docMonths.length * PAGES_PER_MONTH} pages`);
              } else if (!fitsRhythm) {
                console.log(`${doc.componentType} ${docYear} attached whole — ${src.getPageCount()} pages does not fit 6/month for ${docMonths.length} recorded month(s)`);
              }
            } catch (sliceError) {
              console.error('JPC month slicing failed, attaching the whole document:', sliceError);
            }
          }

          // Fuel documents slice by what is printed on them, not by position: their
          // pages have no fixed rhythm, but they carry real text, so a page is kept
          // exactly when its own revision dates fall in the used months. Anything
          // unreadable or fully-used attaches whole. Imported lazily — this is the one
          // path that needs text extraction, and it should cost nothing when unused.
          if (doc.componentType === ComponentType.MPNG_FUEL && yearInRange && usedMonths.length && !doc.sliceUnsafe) {
            try {
              const { sliceFuelSheetByMonths } = await import('./fuel-sheet-slicer');
              // The window spans the BILL's whole period, not this document's year:
              // revision runs cross year boundaries, and the figure governing the first
              // days of the base month sits on the last revision BEFORE it — the window
              // opens 45 days early to keep the page that carries it.
              const windowStart = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), 1) - 45 * 86400000);
              const windowEnd = new Date(Date.UTC(endDate.getFullYear(), endDate.getMonth() + 1, 0, 23, 59, 59));
              const result = await sliceFuelSheetByMonths(new Uint8Array(indexBytes), { windowStart, windowEnd });
              if (result.sliced) {
                indexBytes = result.bytes.buffer.slice(
                  result.bytes.byteOffset,
                  result.bytes.byteOffset + result.bytes.byteLength,
                ) as ArrayBuffer;
                console.log(`Sliced MPNG_FUEL ${docYear} to ${windowStart.toISOString().slice(0, 10)}..${windowEnd.toISOString().slice(0, 10)} — kept ${result.keptPages} of ${result.totalPages} pages`);
              } else {
                console.log(`MPNG_FUEL ${docYear} attached whole (${result.reason})`);
              }
            } catch (sliceError) {
              console.error('Fuel slicing failed, attaching the whole document:', sliceError);
            }
          }

          if (jpcCity && componentSheetIsMarkable(doc.componentType)) {
            try {
              if (yearInRange && usedMonths.length) {
                const marked = await highlightComponentSheet(new Uint8Array(indexBytes), {
                  componentType: doc.componentType,
                  months: usedMonths,
                  caption: jpcCaption,
                });
                if (marked.marked) {
                  indexBytes = marked.bytes.buffer.slice(
                    marked.bytes.byteOffset,
                    marked.bytes.byteOffset + marked.bytes.byteLength,
                  ) as ArrayBuffer;
                  console.log(`Marked ${marked.pagesMarked} page(s) on ${doc.componentType} ${docYear} for months ${usedMonths.join(',')}`);
                } else {
                  console.log(`${doc.componentType} sheet left unmarked (${marked.reason})`);
                }
              }
            } catch (markError) {
              console.error('Component sheet marking failed, attaching as is:', markError);
            }
          }

          if (jpcCity && JPC_SHEET_TYPES.includes(doc.componentType) && jpcRhythmKnown) {
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
                // console, not logger: whether a legal document went out marked or plain
                // must be readable in production logs, where logger.log is silent.
                console.log(`Marked ${marked.pagesMarked} JPC page(s) for ${jpcCity} on ${doc.componentType}`);
              } else {
                console.log(`JPC sheet left unmarked (${marked.reason}) for ${doc.componentType}`);
              }
            } catch (markError) {
              console.error('JPC marking failed, attaching the sheet as it is:', markError);
            }
          } else if (jpcCity && JPC_SHEET_TYPES.includes(doc.componentType)) {
            console.log(`JPC marks skipped for ${doc.componentType} ${doc.displayYear || doc.year} — page rhythm unknown, marking by position would risk boxing the wrong rows`);
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

    // A listing, so no bytes: remarks holds an entire PDF as base64 and nothing here
    // displays it. Included, every load of the documents screen carried every file.
    return await prisma.labourIndexDocument.findMany({
      where,
      select: {
        id: true, componentType: true, year: true, months: true,
        fileName: true, cloudStoragePath: true, createdAt: true, uploadedBy: true,
        user: { select: { name: true, email: true } },
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

