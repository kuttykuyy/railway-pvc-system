import { logger } from './logger';
/**
 * PPAC (Petroleum Planning & Analysis Cell) Fetcher
 * Automatically fetches diesel prices from ppac.gov.in
 */

import { prisma } from './db';

/**
 * Extracts raw text from a base64-encoded PDF using pdf-parse (no canvas required).
 */
async function extractTextFromPdf(base64: string): Promise<string> {
  // pdfjs-dist (bundled inside pdf-parse) references these canvas globals at
  // module-init time even when only doing text extraction. Stub them out so
  // the module loads without crashing in Vercel's serverless environment.
  if (typeof (globalThis as any).DOMMatrix === 'undefined') {
    (globalThis as any).DOMMatrix = class DOMMatrix { constructor() {} };
  }
  if (typeof (globalThis as any).ImageData === 'undefined') {
    (globalThis as any).ImageData = class ImageData { constructor() {} };
  }
  if (typeof (globalThis as any).Path2D === 'undefined') {
    (globalThis as any).Path2D = class Path2D { constructor() {} };
  }

  const buffer = Buffer.from(base64, 'base64');
  const mod = await import('pdf-parse');
  const fn = (typeof mod === 'function' ? mod : (mod as any).default ?? mod) as (buf: Buffer) => Promise<{ text: string }>;
  const data = await fn(buffer);
  return data.text;
}

const PPAC_BASE_URL = 'https://ppac.gov.in';
const PPAC_RSP_PAGE = 'https://ppac.gov.in/retail-selling-price-rsp-of-petrol-diesel-and-domestic-lpg/rsp-of-petrol-and-diesel-in-metro-cities-since-16-6-2017';

export interface PPACPdfInfo {
  url: string;
  filename: string;
  date?: string;  // Extracted date from filename if available
}

export interface FuelPriceEntry {
  date: string;  // YYYY-MM-DD format
  delhi: number;
  mumbai: number;
  chennai: number;
  kolkata: number;
}

/**
 * Scrapes the PPAC page to get the latest PDF link
 */
export async function getLatestPPACPdfUrl(): Promise<PPACPdfInfo | null> {
  try {
    logger.log('[PPAC Fetcher] Fetching PPAC RSP page...');
    const response = await fetch(PPAC_RSP_PAGE, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch PPAC page: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    
    // Pattern to find the "Current" PDF link
    // Example: https://ppac.gov.in/uploads/page-images/1769144338_PP_9_a_DailyPriceMSHSD_Metro_23.01.2026.pdf
    const pdfPattern = /https:\/\/ppac\.gov\.in\/uploads\/page-images\/[\d]+_PP_9_a_DailyPriceMSHSD_Metro_[\d\.]+\.pdf/g;
    const matches = html.match(pdfPattern);
    
    if (!matches || matches.length === 0) {
      // Try alternative pattern for different filename formats
      const altPattern = /https:\/\/ppac\.gov\.in\/uploads\/[^"'\s]+DailyPrice[^"'\s]+\.pdf/gi;
      const altMatches = html.match(altPattern);
      
      if (!altMatches || altMatches.length === 0) {
        logger.log('[PPAC Fetcher] No PDF links found on page');
        return null;
      }
      
      const pdfUrl = altMatches[0];
      const filename = pdfUrl.split('/').pop() || 'ppac-daily-prices.pdf';
      
      return {
        url: pdfUrl,
        filename,
        date: extractDateFromFilename(filename),
      };
    }
    
    // Get the first (current) PDF
    const pdfUrl = matches[0];
    const filename = pdfUrl.split('/').pop() || 'ppac-daily-prices.pdf';
    
    logger.log(`[PPAC Fetcher] Found PDF: ${filename}`);
    
    return {
      url: pdfUrl,
      filename,
      date: extractDateFromFilename(filename),
    };
  } catch (error: any) {
    console.error('[PPAC Fetcher] Error getting PDF URL:', error.message);
    throw error;
  }
}

/**
 * Extracts date from PPAC filename
 * Example: 1769144338_PP_9_a_DailyPriceMSHSD_Metro_23.01.2026.pdf -> 2026-01-23
 */
function extractDateFromFilename(filename: string): string | undefined {
  // Pattern: DD.MM.YYYY
  const dateMatch = filename.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (dateMatch) {
    const [, day, month, year] = dateMatch;
    return `${year}-${month}-${day}`;
  }
  return undefined;
}

/**
 * Downloads the PDF and returns as base64
 */
export async function downloadPPACPdf(url: string): Promise<string> {
  try {
    logger.log(`[PPAC Fetcher] Downloading PDF from ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/pdf,*/*',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    
    logger.log(`[PPAC Fetcher] Downloaded PDF, size: ${Math.round(arrayBuffer.byteLength / 1024)} KB`);
    
    return base64;
  } catch (error: any) {
    console.error('[PPAC Fetcher] Error downloading PDF:', error.message);
    throw error;
  }
}

/**
 * Calls AbacusAI RouteLLM to extract fuel prices from PDF.
 * Extracts PDF text locally first (route-llm is text-only), then sends
 * the raw table text to the LLM for structured JSON extraction.
 */
export async function extractFuelPricesWithAI(base64: string): Promise<FuelPriceEntry[]> {
  const apiKey = process.env.ABACUSAI_API_KEY;
  if (!apiKey) {
    throw new Error('ABACUSAI_API_KEY not configured');
  }

  // Extract text from PDF locally — route-llm doesn't support file attachments
  logger.log('[PPAC Fetcher] Extracting text from PDF...');
  const pdfText = await extractTextFromPdf(base64);
  logger.log(`[PPAC Fetcher] Extracted ${pdfText.length} chars of PDF text`);

  if (!pdfText.trim()) {
    throw new Error('No text could be extracted from the PPAC PDF (scanned/image PDF?)');
  }

  logger.log('[PPAC Fetcher] Calling RouteLLM to parse diesel prices from text...');

  const requestBody = JSON.stringify({
    model: 'route-llm',
    max_tokens: 16000,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: `Extract all DIESEL/HSD retail selling prices from the following PPAC (Petroleum Planning & Analysis Cell) text data for Delhi, Mumbai, Chennai, and Kolkata.

IMPORTANT: Extract DIESEL/HSD prices only (NOT Petrol/MS prices). In PPAC tables, Diesel prices are usually in the right half.

Return a JSON object with a single key "prices" containing an array:
{"prices": [
  {"date": "YYYY-MM-DD", "delhi": 87.67, "mumbai": 90.03, "chennai": 92.39, "kolkata": 92.02},
  ...
]}

Rules:
1. Use YYYY-MM-DD date format (e.g., 2025-02-15)
2. All price values must be numbers (not strings)
3. Extract ALL date rows present in the text
4. For dates like "15-Feb-25" convert to "2025-02-15", for "15/02/2025" convert to "2025-02-15"
5. Respond with raw JSON only — no markdown, no code blocks

PDF TEXT:
${pdfText.substring(0, 12000)}`,
      },
    ],
  });

  const MAX_RETRIES = 2;
  let lastError: Error | null = null;
  let content = '';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.log(`[PPAC Fetcher] AI request attempt ${attempt}/${MAX_RETRIES}...`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s timeout

      const response = await fetch('https://routellm.abacus.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: requestBody,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        if ((response.status >= 500 || response.status === 524) && attempt < MAX_RETRIES) {
          logger.warn(`[PPAC Fetcher] AI API error ${response.status} on attempt ${attempt}, retrying in 5s...`);
          lastError = new Error(`AI API error ${response.status}: ${errorText.substring(0, 200)}`);
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }
        throw new Error(`AI API error ${response.status}: ${errorText.substring(0, 500)}`);
      }

      const data = await response.json();
      content = data.choices?.[0]?.message?.content || '';
      lastError = null;
      break; // Success, exit retry loop

    } catch (error: any) {
      if (error.name === 'AbortError') {
        lastError = new Error(`AI API request timed out after 90s (attempt ${attempt}/${MAX_RETRIES})`);
        logger.warn(`[PPAC Fetcher] ${lastError.message}`);
      } else if (error.message?.includes('AI API error')) {
        throw error; // Non-retryable API errors
      } else {
        lastError = error;
        logger.warn(`[PPAC Fetcher] Request failed on attempt ${attempt}: ${error.message}`);
      }

      if (attempt < MAX_RETRIES) {
        logger.log(`[PPAC Fetcher] Retrying in 5s...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }
  
  if (lastError || !content) {
    throw lastError || new Error('AI API returned empty response after all retries');
  }
  
  logger.log('[PPAC Fetcher] AI response length:', content.length);
  logger.log('[PPAC Fetcher] AI response preview:', content.substring(0, 500));
  
  // Parse JSON from response - try multiple extraction strategies
  let jsonStr = '';

  // Strategy 1: Try entire content as JSON (handles {"prices":[...]} and [...] directly)
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    jsonStr = trimmed;
    logger.log('[PPAC Fetcher] Using entire content as JSON');
  }

  // Strategy 2: Extract array from markdown code block ```json ... ```
  if (!jsonStr) {
    const codeBlockMatch = content.match(/```(?:json)?\s*([\[{][\s\S]*?[\]}])\s*```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1];
      logger.log('[PPAC Fetcher] Extracted JSON from code block');
    }
  }

  // Strategy 3: Extract bare JSON array from anywhere in the response
  if (!jsonStr) {
    const directMatch = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (directMatch) {
      jsonStr = directMatch[0];
      logger.log('[PPAC Fetcher] Extracted JSON array via direct match');
    }
  }

  if (!jsonStr) {
    console.error('[PPAC Fetcher] Failed to extract JSON. Full AI response:', content);
    throw new Error('Failed to extract JSON from AI response');
  }
  
  // Parse JSON — fall back to extracting complete entries if response was truncated
  let pricesArray: any[] | null = null;
  try {
    const parsedJson = JSON.parse(jsonStr);
    pricesArray = Array.isArray(parsedJson)
      ? parsedJson
      : (parsedJson.prices || parsedJson.data || Object.values(parsedJson).find((v: any) => Array.isArray(v)) as any[] || null);
  } catch (parseError: any) {
    // Response was truncated mid-JSON — extract all complete price objects via regex
    logger.warn(`[PPAC Fetcher] JSON parse failed (${parseError.message}), attempting partial recovery...`);
    const entryPattern = /\{\s*"date"\s*:\s*"(\d{4}-\d{2}-\d{2})"\s*,\s*"delhi"\s*:\s*([\d.]+)\s*,\s*"mumbai"\s*:\s*([\d.]+)\s*,\s*"chennai"\s*:\s*([\d.]+)\s*,\s*"kolkata"\s*:\s*([\d.]+)\s*\}/g;
    const recovered: FuelPriceEntry[] = [];
    let match;
    while ((match = entryPattern.exec(content)) !== null) {
      recovered.push({
        date: match[1],
        delhi: parseFloat(match[2]),
        mumbai: parseFloat(match[3]),
        chennai: parseFloat(match[4]),
        kolkata: parseFloat(match[5]),
      });
    }
    if (recovered.length > 0) {
      logger.log(`[PPAC Fetcher] Recovered ${recovered.length} entries from truncated response`);
      pricesArray = recovered;
    }
  }

  if (!Array.isArray(pricesArray) || pricesArray.length === 0) {
    console.error('[PPAC Fetcher] Could not extract price entries from AI response');
    throw new Error('AI response does not contain a valid prices array');
  }

  const prices: FuelPriceEntry[] = pricesArray;
  logger.log(`[PPAC Fetcher] Extracted ${prices.length} diesel price entries`);

  return prices;
}

/**
 * Imports fuel prices into the database
 */
export async function importFuelPricesToDatabase(prices: FuelPriceEntry[]): Promise<{
  created: number;
  updated: number;
  errors: number;
  errorDetails: string[];
}> {
  let created = 0;
  let updated = 0;
  let errors = 0;
  const errorDetails: string[] = [];

  for (const price of prices) {
    try {
      // Parse and validate date
      const priceDate = new Date(price.date);
      if (isNaN(priceDate.getTime())) {
        errors++;
        errorDetails.push(`Invalid date: ${price.date}`);
        continue;
      }

      // Check if entry already exists
      const existing = await prisma.dailyFuelPrice.findUnique({
        where: { date: priceDate },
      });

      if (existing) {
        // Update if prices are different
        if (
          existing.delhi !== price.delhi ||
          existing.mumbai !== price.mumbai ||
          existing.chennai !== price.chennai ||
          existing.kolkata !== price.kolkata
        ) {
          await prisma.dailyFuelPrice.update({
            where: { date: priceDate },
            data: {
              delhi: price.delhi,
              mumbai: price.mumbai,
              chennai: price.chennai,
              kolkata: price.kolkata,
              source: 'PPAC_AUTO',
            },
          });
          updated++;
        }
      } else {
        // Create new entry
        await prisma.dailyFuelPrice.create({
          data: {
            date: priceDate,
            delhi: price.delhi,
            mumbai: price.mumbai,
            chennai: price.chennai,
            kolkata: price.kolkata,
            source: 'PPAC_AUTO',
          },
        });
        created++;
      }
    } catch (error: any) {
      errors++;
      errorDetails.push(`Error for ${price.date}: ${error.message}`);
    }
  }

  logger.log(`[PPAC Fetcher] Import complete: ${created} created, ${updated} updated, ${errors} errors`);
  
  return { created, updated, errors, errorDetails };
}

/**
 * Main function to fetch and import PPAC diesel prices
 */
export async function fetchAndImportPPACPrices(): Promise<{
  success: boolean;
  pdfInfo?: PPACPdfInfo;
  extracted?: number;
  created?: number;
  updated?: number;
  errors?: number;
  errorDetails?: string[];
  message: string;
}> {
  try {
    // Step 1: Get the latest PDF URL
    const pdfInfo = await getLatestPPACPdfUrl();
    if (!pdfInfo) {
      return {
        success: false,
        message: 'Could not find PPAC PDF on the website',
      };
    }

    // Step 2: Download the PDF
    const base64 = await downloadPPACPdf(pdfInfo.url);

    // Step 3: Extract prices using AI
    const prices = await extractFuelPricesWithAI(base64);
    
    if (prices.length === 0) {
      return {
        success: false,
        pdfInfo,
        message: 'No prices extracted from PDF',
      };
    }

    // Step 4: Import to database
    const result = await importFuelPricesToDatabase(prices);

    return {
      success: true,
      pdfInfo,
      extracted: prices.length,
      ...result,
      message: `Successfully imported: ${result.created} new, ${result.updated} updated`,
    };
  } catch (error: any) {
    console.error('[PPAC Fetcher] Error:', error);
    return {
      success: false,
      message: error.message || 'Unknown error during PPAC fetch',
    };
  }
}

