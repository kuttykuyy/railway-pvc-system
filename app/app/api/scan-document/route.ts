import { NextRequest, NextResponse } from 'next/server';
import { validateApiAccess } from '@/lib/payment-validation';
import { GCC_CLASSIFICATIONS } from '@/lib/gcc-classifications-data';
import { PDFDocument } from 'pdf-lib';
import { parseBillPdf } from '@/lib/pdf-text-parser';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const LLM_API_URL = 'https://apps.abacus.ai/v1/chat/completions';
const LLM_MODEL = 'gemini-2.5-flash';
// Max base64 size ~8MB (safe limit for LLM API file processing)
const MAX_BASE64_SIZE_BYTES = 8 * 1024 * 1024;

/**
 * DSR 2021 Chapter-based classification for cement and steel amounts.
 * 
 * Rules:
 * - Chapter 4 (Concrete Work) = CEMENT items
 * - Chapter 5 (RCC Work) = CEMENT items, EXCEPT item 5.22 (TMT bars Fe-500D) which is STEEL
 * - Chapter 10 (Steel Work) = STEEL items
 * - All other chapters = OTHER/General items
 * 
 * Item 5.22 A6 (TMT bars Fe-500D) is a special case: it appears in Chapter 5 (RCC)
 * but is classified as STEEL because it represents reinforcement steel.
 */
function classifyItemByDsrChapter(itemNo: string): 'cement' | 'steel' | 'other' {
  if (!itemNo) return 'other';
  
  // Normalize: remove spaces, convert to lowercase for matching
  const normalized = itemNo.trim().replace(/\s+/g, '');
  
  // Extract the chapter number (first number before the dot)
  // e.g., "4.1.6" -> chapter 4, "5.9.1" -> chapter 5, "10.2" -> chapter 10
  const chapterMatch = normalized.match(/^(\d+)\./);
  if (!chapterMatch) return 'other';
  
  const chapter = parseInt(chapterMatch[1], 10);
  
  // Special case: Item 5.22 (and sub-items like 5.22 A6) is STEEL (TMT bars)
  // despite being in Chapter 5 (RCC)
  if (chapter === 5) {
    // Check if this is item 5.22 or its sub-items (5.22.x, 5.22 A6, etc.)
    const is522 = /^5\.22\b/i.test(normalized);
    if (is522) return 'steel';
    return 'cement';
  }
  
  // Chapter 4: Concrete Work = CEMENT
  if (chapter === 4) return 'cement';
  
  // Chapter 10: Steel Work = STEEL
  if (chapter === 10) return 'steel';
  
  return 'other';
}

/**
 * Post-process LLM-extracted line items to deterministically classify 
 * cement and steel amounts based on DSR 2021 chapter numbers.
 */
function postProcessDsrClassification(parsed: any): any {
  const lineItems = parsed.lineItems;
  if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
    return parsed;
  }
  
  let cementTotal = 0;
  let steelTotal = 0;
  let otherTotal = 0;
  
  const cementItems: { itemNo: string; description: string; amount: number }[] = [];
  const steelItems: { itemNo: string; description: string; amount: number; steelType: string }[] = [];
  const otherItems: { itemNo: string; description: string; amount: number }[] = [];
  
  // Chapter-wise breakdown
  const ch4Total = { amount: 0, items: [] as string[] };
  const ch5CementTotal = { amount: 0, items: [] as string[] };
  const ch5SteelTotal = { amount: 0, items: [] as string[] }; // item 5.22
  const ch10Total = { amount: 0, items: [] as string[] };
  
  for (const item of lineItems) {
    const itemNo = item.itemNo || '';
    const amount = parseFloat(item.amount) || 0;
    if (amount <= 0) continue;
    
    const dsrCategory = classifyItemByDsrChapter(itemNo);
    
    // Override the LLM's category with deterministic DSR classification
    item.dsrCategory = dsrCategory;
    
    const chapterMatch = itemNo.trim().match(/^(\d+)\./);
    const chapter = chapterMatch ? parseInt(chapterMatch[1], 10) : 0;
    
    if (dsrCategory === 'cement') {
      cementTotal += amount;
      cementItems.push({ itemNo, description: item.description || '', amount });
      
      if (chapter === 4) {
        ch4Total.amount += amount;
        ch4Total.items.push(`${itemNo}: ₹${amount.toLocaleString('en-IN')}`);
      } else if (chapter === 5) {
        ch5CementTotal.amount += amount;
        ch5CementTotal.items.push(`${itemNo}: ₹${amount.toLocaleString('en-IN')}`);
      }
    } else if (dsrCategory === 'steel') {
      steelTotal += amount;
      steelItems.push({ 
        itemNo, 
        description: item.description || '', 
        amount,
        steelType: item.steelType || (chapter === 5 ? 'TMT Bars' : 'Structural Steel')
      });
      
      if (chapter === 5) {
        ch5SteelTotal.amount += amount;
        ch5SteelTotal.items.push(`${itemNo} (TMT): ₹${amount.toLocaleString('en-IN')}`);
      } else if (chapter === 10) {
        ch10Total.amount += amount;
        ch10Total.items.push(`${itemNo}: ₹${amount.toLocaleString('en-IN')}`);
      }
    } else {
      otherTotal += amount;
      otherItems.push({ itemNo, description: item.description || '', amount });
    }
  }
  
  // Calculate TMT bars amount (from item 5.22 + any items explicitly marked as TMT)
  let tmtBarsAmount = ch5SteelTotal.amount;
  let angleChannelAmount = 0;
  let platesAmount = 0;
  let otherSectionsAmount = 0;
  
  for (const item of steelItems) {
    const chapterMatch = item.itemNo.trim().match(/^(\d+)\./);
    const chapter = chapterMatch ? parseInt(chapterMatch[1], 10) : 0;
    
    if (chapter === 10) {
      // Classify Ch. 10 steel by type
      const desc = (item.description || '').toLowerCase();
      if (desc.includes('tmt') || desc.includes('bar') || desc.includes('reinforcement')) {
        tmtBarsAmount += item.amount;
      } else if (desc.includes('angle') || desc.includes('channel')) {
        angleChannelAmount += item.amount;
      } else if (desc.includes('plate')) {
        platesAmount += item.amount;
      } else {
        // Default Ch. 10 items to structural steel (angle/channel)
        angleChannelAmount += item.amount;
      }
    }
  }
  
  // Add DSR-based cement summary
  parsed.dsrCementSummary = {
    totalAmount: Math.round(cementTotal * 100) / 100,
    chapter4Amount: Math.round(ch4Total.amount * 100) / 100,
    chapter4Items: ch4Total.items,
    chapter5CementAmount: Math.round(ch5CementTotal.amount * 100) / 100,
    chapter5CementItems: ch5CementTotal.items,
    allItems: cementItems.map(i => `${i.itemNo}: ${i.description} = ₹${i.amount.toLocaleString('en-IN')}`),
    note: 'Cement amount from DSR Ch.4 (Concrete) + Ch.5 (RCC, excluding 5.22 TMT steel)'
  };
  
  // Enhanced steel summary with DSR breakdown
  parsed.dsrSteelSummary = {
    totalAmount: Math.round(steelTotal * 100) / 100,
    tmtBarsAmount: Math.round(tmtBarsAmount * 100) / 100,
    angleChannelAmount: Math.round(angleChannelAmount * 100) / 100,
    platesAmount: Math.round(platesAmount * 100) / 100,
    otherSectionsAmount: Math.round(otherSectionsAmount * 100) / 100,
    chapter5SteelAmount: Math.round(ch5SteelTotal.amount * 100) / 100,
    chapter5SteelItems: ch5SteelTotal.items,
    chapter10Amount: Math.round(ch10Total.amount * 100) / 100,
    chapter10Items: ch10Total.items,
    allItems: steelItems.map(i => `${i.itemNo}: ${i.description} = ₹${i.amount.toLocaleString('en-IN')}`),
    note: 'Steel amount from DSR item 5.22 (TMT bars) + Ch.10 (Steel Work)'
  };
  
  // Set top-level cement and steel amounts from DSR classification
  // These override any LLM-guessed values with deterministic DSR-based values
  if (cementTotal > 0) {
    parsed.cementAmount = Math.round(cementTotal * 100) / 100;
  }
  if (steelTotal > 0) {
    parsed.steelTmtBarsAmount = Math.round(tmtBarsAmount * 100) / 100;
    parsed.steelAngleChannelAmount = Math.round(angleChannelAmount * 100) / 100;
    // Also update steelSummary for backward compatibility
    parsed.steelSummary = {
      ...parsed.steelSummary,
      totalAmount: Math.round(steelTotal * 100) / 100,
      tmtBarsAmount: Math.round(tmtBarsAmount * 100) / 100,
      angleChannelAmount: Math.round(angleChannelAmount * 100) / 100,
      platesAmount: Math.round(platesAmount * 100) / 100,
      otherSectionsAmount: Math.round(otherSectionsAmount * 100) / 100,
    };
  }
  
  // Log DSR classification results
  console.log('📊 DSR 2021 Chapter Classification Results:');
  console.log(`  Cement (Ch.4+5 excl 5.22): ₹${cementTotal.toLocaleString('en-IN')}`);
  console.log(`    Ch.4 Concrete: ₹${ch4Total.amount.toLocaleString('en-IN')} (${ch4Total.items.length} items)`);
  console.log(`    Ch.5 RCC: ₹${ch5CementTotal.amount.toLocaleString('en-IN')} (${ch5CementTotal.items.length} items)`);
  console.log(`  Steel (5.22+Ch.10): ₹${steelTotal.toLocaleString('en-IN')}`);
  console.log(`    5.22 TMT: ₹${ch5SteelTotal.amount.toLocaleString('en-IN')}`);
  console.log(`    Ch.10: ₹${ch10Total.amount.toLocaleString('en-IN')} (${ch10Total.items.length} items)`);
  console.log(`  Other: ₹${otherTotal.toLocaleString('en-IN')} (${otherItems.length} items)`);
  
  return parsed;
}

function buildBillScanPrompt(): string {
  const gccSummary = GCC_CLASSIFICATIONS.slice(0, 30).map(c =>
    `${c.code} - ${c.mainClassification}: ${c.subClassification}`
  ).join('\n');

  return `You are an expert at extracting data from Indian Railway running account bills (PDF documents or images).
These bills follow DSR 2021 (Delhi Schedule of Rates) item numbering.

Analyze this document carefully and extract ALL information:

1. **Header Info:** Agreement Number, Bill Number, Contractor Name, Work Description, Date of Measurement, Date of Commencement
2. **Financial:** Gross Bill Amount (total of all schedules)
3. **Line Items:** For EVERY work item extract: DSR Item Number (e.g., 4.1.6, 5.9.1, 5.22, 10.2), Description, Unit, Quantity (up-to-date), Rate, Amount
4. **DSR Chapter Classification:** Items must preserve their exact DSR item numbers. Key chapters:
   - Chapter 4 (items starting with 4.x) = Concrete Work (cement items)
   - Chapter 5 (items starting with 5.x) = RCC Work (cement items, EXCEPT 5.22 which is TMT steel)
   - Chapter 10 (items starting with 10.x) = Steel Work (steel items)
   - Item 5.22 and sub-items (5.22 A6 etc.) = TMT Bars Fe-500D = STEEL (not cement)
5. **Schedule Breakdown:** If the bill has Schedule A1b (DSR except steel), A3b (DSR steel), A2b (USSOR), identify which items belong to which schedule.
6. **Classification Suggestions:** Based on work descriptions, suggest GCC 46A classification codes

Available GCC Classifications:
${gccSummary}

IMPORTANT: 
- Extract the EXACT DSR item number as printed in the bill (e.g., "4.1.6", "5.9.1", "5.22 A6", "10.2")
- The item number is CRITICAL for automatic cement/steel classification
- If an item has sub-items (like 5.22 A6), include the full item number
- For "amount", use the UP-TO-DATE amount (cumulative), not the "since last" amount

Respond in JSON:
{
  "billNo": "string",
  "agreementNo": "string",
  "contractorName": "string",
  "workDescription": "string",
  "dateOfMeasurement": "YYYY-MM-DD or original format",
  "dateOfCommencement": "YYYY-MM-DD or original format",
  "grossBillAmount": number,
  "cementAmount": number or null,
  "steelTmtBarsAmount": number or null,
  "lineItems": [
    {
      "itemNo": "DSR item number e.g. 4.1.6, 5.9.1, 5.22, 10.2",
      "description": "string",
      "unit": "string",
      "quantity": number,
      "rate": number,
      "amount": number,
      "schedule": "A1b" | "A3b" | "A2b" | "other",
      "category": "steel" | "non-steel",
      "steelType": "TMT Bars" | "Structural Steel" | "Angles" | "Plates" | "Other" | null
    }
  ],
  "steelSummary": {
    "totalAmount": number,
    "tmtBarsAmount": number,
    "angleChannelAmount": number,
    "platesAmount": number,
    "otherSectionsAmount": number,
    "items": ["descriptions of steel items"]
  },
  "nonSteelSummary": {
    "totalAmount": number,
    "items": ["descriptions of non-steel items"]
  },
  "suggestedClassifications": [
    {
      "gccCode": "string",
      "description": "string",
      "amount": number,
      "itemCount": number
    }
  ],
  "nonScheduleItems": [
    { "description": "string", "amount": number }
  ],
  "confidence": "high" | "medium" | "low",
  "notes": "any observations or issues"
}

CRITICAL: Your entire response must be a single valid JSON object. Do NOT include any text before or after the JSON. Start with { and end with }.`;
}

function buildContractScanPrompt(): string {
  return `You are an expert at extracting data from Indian Railway contract documents / Letter of Acceptance (LOA).

Analyze this document and extract:
- Agreement Number
- Contractor Name
- Work Description / Name of Work
- Accepted Tender Value / Contract Amount
- Date of Commencement
- Date of Completion
- Completion Period (months)
- Base Month for price variation
- Division / Zone

Respond in JSON:
{
  "agreementNo": "string",
  "contractorName": "string",
  "workDescription": "string",
  "contractAmount": number or null,
  "dateOfCommencement": "string",
  "dateOfCompletion": "string",
  "completionPeriod": number or null,
  "baseMonth": "YYYY-MM or string",
  "division": "string",
  "confidence": "high" | "medium" | "low",
  "notes": "any observations"
}

CRITICAL: Your entire response must be a single valid JSON object. Start with { and end with }.`;
}

function parseJsonResponse(text: string): any {
  if (!text || !text.trim()) throw new Error('Empty response from LLM');
  let cleaned = text.trim();
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  cleaned = cleaned.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '').trim();
  cleaned = cleaned.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '').trim();
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  try { return JSON.parse(cleaned); } catch {}
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) { try { return JSON.parse(fenceMatch[1].trim()); } catch {} }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    let jsonCandidate = cleaned.slice(start, end + 1);
    try { return JSON.parse(jsonCandidate); } catch {}
    let fixed = jsonCandidate
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/:\s*NaN\b/g, ': 0')
      .replace(/:\s*Infinity\b/g, ': 0')
      .replace(/:\s*-Infinity\b/g, ': 0')
      .replace(/:\s*undefined\b/g, ': null');
    try { return JSON.parse(fixed); } catch {}
  }
  throw new Error('Failed to parse LLM response as JSON');
}

/**
 * Call LLM API with a PDF (as base64 data URI) and a prompt.
 * Returns the raw text response.
 */
async function callLlmWithPdf(
  apiKey: string,
  base64: string,
  mimeType: string,
  filename: string,
  prompt: string,
  maxTokens: number = 16000
): Promise<string> {
  const dataUri = `data:${mimeType};base64,${base64}`;

  const response = await fetch(LLM_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'file',
            file: {
              filename: filename,
              file_data: dataUri,
            },
          },
          {
            type: 'text',
            text: prompt,
          },
        ],
      }],
      max_tokens: maxTokens,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('LLM API error:', errText);
    try {
      const errJson = JSON.parse(errText);
      if (errJson.error?.includes('no remaining credits') || errJson.error?.includes('credits')) {
        throw new Error('LLM API credits exhausted. Please contact the admin to recharge credits.');
      }
      throw new Error(errJson.error || `LLM API error: ${response.status}`);
    } catch (e: any) {
      if (e.message.includes('credits') || e.message.includes('LLM API error')) throw e;
      throw new Error(`LLM API error: ${response.status}`);
    }
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text.trim()) throw new Error('LLM returned empty response');
  return text;
}

/**
 * Split a large PDF into page-range chunks, each under the base64 size limit.
 * Returns an array of { base64, startPage, endPage } for each chunk.
 */
async function splitPdfIntoChunks(
  pdfBytes: Uint8Array,
  maxBase64Bytes: number
): Promise<Array<{ base64: string; startPage: number; endPage: number; totalPages: number }>> {
  const srcDoc = await PDFDocument.load(pdfBytes);
  const totalPages = srcDoc.getPageCount();
  const chunks: Array<{ base64: string; startPage: number; endPage: number; totalPages: number }> = [];

  // Try progressively smaller page ranges to fit within size limit
  let startPage = 0;
  while (startPage < totalPages) {
    let endPage = Math.min(startPage + Math.max(Math.floor(totalPages / 2), 5) - 1, totalPages - 1);
    let chunkBase64 = '';
    let fits = false;

    // Binary search for max pages that fit
    while (endPage >= startPage) {
      const chunkDoc = await PDFDocument.create();
      const pageIndices = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);
      const copiedPages = await chunkDoc.copyPages(srcDoc, pageIndices);
      copiedPages.forEach(page => chunkDoc.addPage(page));
      const chunkBytes = await chunkDoc.save();
      chunkBase64 = Buffer.from(chunkBytes).toString('base64');

      if (chunkBase64.length <= maxBase64Bytes) {
        fits = true;
        break;
      }
      // Reduce pages
      endPage = Math.floor((startPage + endPage) / 2);
    }

    if (!fits) {
      // Single page is too large - still try it (API might handle it)
      const chunkDoc = await PDFDocument.create();
      const [page] = await chunkDoc.copyPages(srcDoc, [startPage]);
      chunkDoc.addPage(page);
      const chunkBytes = await chunkDoc.save();
      chunkBase64 = Buffer.from(chunkBytes).toString('base64');
      endPage = startPage;
    }

    chunks.push({
      base64: chunkBase64,
      startPage: startPage + 1, // 1-indexed for display
      endPage: endPage + 1,
      totalPages,
    });
    startPage = endPage + 1;
  }

  return chunks;
}

/**
 * Merge multiple partial bill scan results into a single combined result.
 */
function mergeBillScanResults(results: any[]): any {
  if (results.length === 0) return {};
  if (results.length === 1) return results[0];

  const merged = { ...results[0] };
  const allLineItems: any[] = [];
  const allSuggestedClassifications: any[] = [];
  const allNonScheduleItems: any[] = [];
  let totalGross = 0;

  for (const result of results) {
    if (result.lineItems && Array.isArray(result.lineItems)) {
      allLineItems.push(...result.lineItems);
    }
    if (result.suggestedClassifications && Array.isArray(result.suggestedClassifications)) {
      allSuggestedClassifications.push(...result.suggestedClassifications);
    }
    if (result.nonScheduleItems && Array.isArray(result.nonScheduleItems)) {
      allNonScheduleItems.push(...result.nonScheduleItems);
    }
    // Use header info from first chunk that has it
    if (result.billNo && !merged.billNo) merged.billNo = result.billNo;
    if (result.agreementNo && !merged.agreementNo) merged.agreementNo = result.agreementNo;
    if (result.contractorName && !merged.contractorName) merged.contractorName = result.contractorName;
    if (result.workDescription && !merged.workDescription) merged.workDescription = result.workDescription;
    if (result.dateOfMeasurement && !merged.dateOfMeasurement) merged.dateOfMeasurement = result.dateOfMeasurement;
    if (result.grossBillAmount) totalGross = Math.max(totalGross, result.grossBillAmount);
  }

  merged.lineItems = allLineItems;
  merged.suggestedClassifications = allSuggestedClassifications;
  merged.nonScheduleItems = allNonScheduleItems;
  if (totalGross > 0) merged.grossBillAmount = totalGross;

  // Deduplicate line items by itemNo + description
  if (merged.lineItems.length > 0) {
    const seen = new Map<string, any>();
    for (const item of merged.lineItems) {
      const key = `${item.itemNo || ''}_${(item.description || '').substring(0, 50)}`;
      if (!seen.has(key) || (item.amount || 0) > (seen.get(key).amount || 0)) {
        seen.set(key, item);
      }
    }
    merged.lineItems = Array.from(seen.values());
  }

  return merged;
}

export async function POST(request: NextRequest) {
  try {
    const { authorized, user, message } = await validateApiAccess(request);
    if (!authorized) {
      return NextResponse.json({ error: message || 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const documentType = (formData.get('documentType') as string) || 'bill';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const apiKey = process.env.ABACUSAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'LLM API key not configured' }, { status: 500 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdfBytes = new Uint8Array(arrayBuffer);
    const mimeType = file.type || 'application/pdf';

    console.log(`📄 Scanning ${documentType} document: ${file.name} (${mimeType}, ${(file.size / 1024).toFixed(0)}KB)`);

    if (mimeType !== 'application/pdf') {
      return NextResponse.json({ error: 'Please upload a PDF file.' }, { status: 400 });
    }

    // ===== STEP 1: Try text-based extraction first (no AI, instant, works for text PDFs) =====
    if (documentType === 'bill') {
      try {
        console.log('📝 Attempting text-based PDF extraction (no AI)...');
        const textResult = await parseBillPdf(arrayBuffer);
        if (textResult && textResult.lineItems.length > 0) {
          console.log(`✅ Text extraction successful: ${textResult.lineItems.length} items, confidence=${textResult.confidence}`);
          // Apply DSR classification post-processing
          const processed = postProcessDsrClassification(textResult);
          console.log('✅ DSR 2021 chapter-based cement/steel classification applied');
          return NextResponse.json({ success: true, data: processed });
        }
        if (textResult === null) {
          console.log('📄 PDF is scanned/image-based, falling back to AI extraction...');
        } else {
          console.log('⚠️ Text extraction found no line items, falling back to AI extraction...');
        }
      } catch (textErr: any) {
        console.warn('⚠️ Text extraction failed, falling back to AI:', textErr.message);
      }
    }

    // ===== STEP 2: Fall back to LLM-based extraction (for scanned/image PDFs) =====
    const base64Full = Buffer.from(arrayBuffer).toString('base64');
    console.log(`📄 Using AI extraction: base64 size ${(base64Full.length / 1024).toFixed(0)}KB`);
    
    const basePrompt = documentType === 'bill' ? buildBillScanPrompt() : buildContractScanPrompt();

    // Check if file is small enough to send directly
    if (base64Full.length <= MAX_BASE64_SIZE_BYTES) {
      console.log('📤 Sending full PDF to LLM API (within size limit)');
      const text = await callLlmWithPdf(apiKey, base64Full, mimeType, file.name, basePrompt);
      let parsed = parseJsonResponse(text);
      console.log(`✅ Document scanned successfully: ${Object.keys(parsed).length} fields extracted`);

      if (documentType === 'bill') {
        parsed = postProcessDsrClassification(parsed);
        console.log('✅ DSR 2021 chapter-based cement/steel classification applied');
      }

      return NextResponse.json({ success: true, data: parsed });
    }

    // Large PDF: split into page-range chunks
    console.log(`📦 PDF too large (${(base64Full.length / 1024 / 1024).toFixed(1)}MB base64), splitting into chunks...`);
    const chunks = await splitPdfIntoChunks(pdfBytes, MAX_BASE64_SIZE_BYTES);
    console.log(`📦 Split into ${chunks.length} chunks: ${chunks.map(c => `pages ${c.startPage}-${c.endPage}`).join(', ')}`);

    const chunkResults: any[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkPrompt = `${basePrompt}\n\nNOTE: This is part ${i + 1} of ${chunks.length} of a larger document (pages ${chunk.startPage}-${chunk.endPage} of ${chunk.totalPages}). Extract all items visible in these pages. If header info (bill number, date, etc.) is not on these pages, set those fields to null.`;

      console.log(`📤 Processing chunk ${i + 1}/${chunks.length} (pages ${chunk.startPage}-${chunk.endPage}, ${(chunk.base64.length / 1024).toFixed(0)}KB)`);

      try {
        const text = await callLlmWithPdf(
          apiKey,
          chunk.base64,
          mimeType,
          `${file.name}_pages_${chunk.startPage}-${chunk.endPage}.pdf`,
          chunkPrompt
        );
        const parsed = parseJsonResponse(text);
        chunkResults.push(parsed);
        console.log(`✅ Chunk ${i + 1}: ${parsed.lineItems?.length || 0} line items extracted`);
      } catch (err: any) {
        console.error(`⚠️ Chunk ${i + 1} failed: ${err.message}`);
        // Continue with other chunks
      }
    }

    if (chunkResults.length === 0) {
      throw new Error('All PDF chunks failed to process. The PDF may be corrupted or contain only scanned images that are too large.');
    }

    // Merge results from all chunks
    let parsed = mergeBillScanResults(chunkResults);
    console.log(`✅ Merged ${chunkResults.length} chunks: ${parsed.lineItems?.length || 0} total line items`);

    if (documentType === 'bill') {
      parsed = postProcessDsrClassification(parsed);
      console.log('✅ DSR 2021 chapter-based cement/steel classification applied');
    }

    return NextResponse.json({ success: true, data: parsed });
  } catch (error: any) {
    console.error('Scan document error:', error);
    return NextResponse.json(
      { error: 'Failed to scan document', details: error.message },
      { status: 500 }
    );
  }
}
