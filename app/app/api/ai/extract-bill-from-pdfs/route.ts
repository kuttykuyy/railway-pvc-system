import { NextRequest, NextResponse } from 'next/server';
import { prisma, ensureConnection } from '@/lib/db';
import { validateApiAccess } from '@/lib/payment-validation';
import { GCC_CLASSIFICATIONS } from '@/lib/gcc-classifications-data';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Allow large PDF uploads (up to 50MB base64 encoded)
export const fetchCache = 'force-no-store';

const LLM_API_URL = 'https://apps.abacus.ai/v1/chat/completions';
const LLM_MODEL = 'gemini-2.5-flash';

// Build multimodal message content with PDF file + text prompt for direct LLM processing
function buildPdfMessage(base64Data: string, prompt: string, filename: string = 'document.pdf'): any[] {
  // Strip data URL prefix if present
  const raw = base64Data.startsWith('data:') ? base64Data.split(',')[1] : base64Data;
  return [
    {
      type: 'file',
      file: {
        filename,
        content_type: 'application/pdf',
        data: raw,
      },
    },
    {
      type: 'text',
      text: prompt,
    },
  ];
}

interface ExtractedLineItem {
  itemNo: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  chapter?: string;
}

interface ExtractionResult {
  agreementNo: string;
  billNo: string;
  contractorName: string;
  workDescription: string;
  dateOfMeasurement: string;
  dateOfCommencement: string;
  grossBillAmount: number;
  lineItems: ExtractedLineItem[];
  suggestedClassifications: {
    itemDescription: string;
    suggestedCode: string;
    suggestedName: string;
    confidence: string;
    amount: number;
  }[];
}

async function callLLM(promptOrContent: string | any[], retries = 2): Promise<string> {
  const apiKey = process.env.ABACUSAI_API_KEY;
  if (!apiKey) throw new Error('LLM API key not configured');

  // Support both plain text prompts and multimodal content arrays
  const messageContent = typeof promptOrContent === 'string' ? promptOrContent : promptOrContent;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`  ↻ LLM retry attempt ${attempt}/${retries}...`);
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }

      const response = await fetch(LLM_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: LLM_MODEL,
          messages: [{ role: 'user', content: messageContent }],
          max_tokens: 16000,
          temperature: attempt > 0 ? 0.05 : 0.1,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        try {
          const errJson = JSON.parse(errText);
          if (errJson.error?.includes('no remaining credits') || errJson.error?.includes('credits')) {
            throw new Error('LLM API credits exhausted. Please contact the admin to recharge credits.');
          }
          throw new Error(errJson.error || `LLM API error: ${response.status}`);
        } catch (e: any) {
          if (e.message.includes('credits') || e.message.includes('LLM API')) throw e;
          throw new Error(`LLM API error: ${response.status} - ${errText}`);
        }
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '';
      const finishReason = data.choices?.[0]?.finish_reason || '';
      
      if (!text.trim()) {
        throw new Error('LLM returned empty response');
      }

      if (finishReason === 'length') {
        console.warn(`  ⚠ LLM response was truncated (finish_reason=length). Response length: ${text.length} chars`);
      }

      parseJsonResponse(text);
      return text;
    } catch (err: any) {
      lastError = err;
      console.warn(`  ⚠ LLM attempt ${attempt + 1} failed: ${err.message?.slice(0, 200)}`);
      if (err.message?.includes('credits')) break;
      if (attempt === retries) break;
    }
  }

  throw lastError || new Error('LLM call failed after retries');
}

function buildExtractionPrompt(docType: 'bill' | 'rm'): string {
  if (docType === 'bill') {
    return `You are an expert at extracting data from Indian Railway running account bills (PDF documents).

Analyze this bill document carefully and extract ALL the following information:

1. **Header Information:**
   - Agreement Number (format like XX/TPJ/Civil/YYYY/NNNN)
   - Bill Number (full bill reference)
   - Contractor Name
   - Work Description / Name of Work
   - Date of Commencement
   - Bill Date

2. **Line Items (EVERY item):**
   For each work item found in the bill, extract:
   - Item Number (e.g., B1.1, B3.1, etc.)
   - Full Description of the work
   - Unit (Sqm, Metre, MT, Each, Cum, RM, etc.)
   - Quantity executed ("Up to date" or latest quantity)
   - Rate
   - Amount (the final amount for each item, use "Up to date" amount if available)
   - Chapter/Section if mentioned

3. **Gross Bill Amount** - the total of all items

IMPORTANT:
- This is a PDF document, read the text carefully
- Some pages may be landscape orientation
- Look for tables with columns like: Item No, Description, Unit, Rate, Quantity, Amount
- Amount columns may have "Executed up to last bill", "Since last bill", "Up to date" - use "Up to date" values
- Capture ALL items across ALL pages
- If you can't read a value clearly, use your best guess and note it

Respond in JSON format:
{
  "agreementNo": "string",
  "billNo": "string", 
  "contractorName": "string",
  "workDescription": "string",
  "dateOfCommencement": "YYYY-MM-DD or original format",
  "billDate": "YYYY-MM-DD or original format",
  "grossBillAmount": number,
  "lineItems": [
    {
      "itemNo": "string",
      "description": "string",
      "unit": "string",
      "quantity": number,
      "rate": number,
      "amount": number,
      "chapter": "string or null"
    }
  ]
}

CRITICAL: Your entire response must be a single valid JSON object. Do NOT include any text, explanation, or markdown before or after the JSON. Start your response with { and end with }.`;
  } else {
    return `You are an expert at extracting data from Indian Railway Running Measurement (RM) / Measurement Book PDF documents.

Analyze this measurement document and extract:

1. **Header Information:**
   - MB Number (Measurement Book number)
   - Agreement Number
   - Contractor Name
   - Date of Measurement (the actual measurement dates)
   - Work Description / Name of Work

2. **Measurement Details:**
   For each measured item/chapter:
   - Chapter number
   - Work description
   - Individual measurements (length, breadth, height if applicable)
   - Total quantity

IMPORTANT:
- This is a PDF document of a measurement book
- The Date of Measurement is CRITICAL - look for it in headers or signatures
- Look for "Date of Measurement", "Date of commencement", "Date of completion" fields
- Some entries may be handwritten (if scanned)

Respond in JSON format:
{
  "mbNumber": "string",
  "agreementNo": "string",
  "contractorName": "string",
  "dateOfMeasurement": "YYYY-MM-DD or original format (use the LATEST date if range)",
  "workDescription": "string",
  "chapters": [
    {
      "chapterNo": "string",
      "description": "string",
      "totalQuantity": number or null
    }
  ]
}

CRITICAL: Your entire response must be a single valid JSON object. Do NOT include any text, explanation, or markdown before or after the JSON. Start your response with { and end with }.`;
  }
}

function buildClassificationPrompt(lineItems: ExtractedLineItem[]): string {
  const gccSummary = GCC_CLASSIFICATIONS.map(c => 
    `${c.code} - ${c.mainClassification}: ${c.subClassification} | Keywords: ${c.keywords.slice(0, 5).join(', ')}`
  ).join('\n');

  const itemsSummary = lineItems.map(item => 
    `- ${item.itemNo}: ${item.description} (Amount: ₹${item.amount})`
  ).join('\n');

  return `You are an expert at classifying Indian Railway work items into GCC 46A classification codes.

Given these work items from a railway bill:
${itemsSummary}

Available GCC 46A Classifications:
${gccSummary}

For EACH line item, suggest the most appropriate GCC classification code.
Group items that belong to the same classification together.

Also suggest an OVERALL classification for the entire bill based on the majority of work.

Respond in JSON format:
{
  "itemClassifications": [
    {
      "itemNo": "string",
      "description": "brief description",
      "suggestedCode": "code like 7A, 7B, etc",
      "suggestedName": "full classification name",
      "confidence": "high/medium/low",
      "amount": number
    }
  ],
  "overallClassification": {
    "code": "string",
    "name": "string",
    "reason": "string"
  },
  "groupedByClassification": [
    {
      "code": "string",
      "name": "string",
      "totalAmount": number,
      "itemCount": number,
      "items": ["item descriptions"]
    }
  ]
}

CRITICAL: Your entire response must be a single valid JSON object. Do NOT include any text, explanation, or markdown before or after the JSON. Start your response with { and end with }.`;
}

function parseJsonResponse(text: string): any {
  if (!text || !text.trim()) {
    throw new Error('Empty response from LLM');
  }

  // Step 1: Clean the raw response
  let cleaned = text.trim();

  // Strip thinking/reasoning tags (Gemini sometimes adds these)
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  cleaned = cleaned.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '').trim();
  cleaned = cleaned.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '').trim();

  // Remove control characters except newlines/tabs
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Try direct parse first
  try { return JSON.parse(cleaned); } catch {}

  // Try extracting from markdown code fence
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch {}
  }

  // Try finding first { to last }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    let jsonCandidate = cleaned.slice(start, end + 1);
    try { return JSON.parse(jsonCandidate); } catch {}

    // Fix common issues
    let fixed = jsonCandidate
      .replace(/,\s*}/g, '}')        // trailing comma before }
      .replace(/,\s*]/g, ']')        // trailing comma before ]
      .replace(/\/\/[^\n]*/g, '')     // single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, '') // multi-line comments
      .replace(/\n/g, ' ')
      .replace(/\t/g, ' ');
    try { return JSON.parse(fixed); } catch {}

    // Handle NaN, Infinity, -Infinity (non-standard JSON values)
    fixed = fixed
      .replace(/:\s*NaN\b/g, ': 0')
      .replace(/:\s*Infinity\b/g, ': 0')
      .replace(/:\s*-Infinity\b/g, ': 0')
      .replace(/:\s*undefined\b/g, ': null');
    try { return JSON.parse(fixed); } catch {}

    // Try fixing unescaped quotes inside string values
    // Replace sequences like "value with "quotes" inside" by escaping inner quotes
    fixed = fixed.replace(/"([^"]*?)"/g, (match, content) => {
      // Only fix if there are unescaped quotes that suggest nested quotes
      return match;
    });
    
    // Try removing any BOM or zero-width characters
    fixed = fixed.replace(/[\uFEFF\u200B\u200C\u200D\u2060]/g, '');
    try { return JSON.parse(fixed); } catch {}
  }

  // Try finding first [ to last ] (array response)
  const arrStart = cleaned.indexOf('[');
  const arrEnd = cleaned.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
    try { return JSON.parse(cleaned.slice(arrStart, arrEnd + 1)); } catch {}
  }

  // Last resort: try to fix truncated JSON by closing open brackets/braces
  if (start !== -1) {
    let truncated = cleaned.slice(start);
    // Count open/close braces and brackets
    let openBraces = 0, openBrackets = 0;
    let inString = false, escaped = false;
    for (const ch of truncated) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') openBraces++;
      if (ch === '}') openBraces--;
      if (ch === '[') openBrackets++;
      if (ch === ']') openBrackets--;
    }

    if (openBraces > 0 || openBrackets > 0) {
      console.warn(`  ⚠ Detected truncated JSON (${openBraces} unclosed braces, ${openBrackets} unclosed brackets). Attempting repair...`);
      // Remove any trailing partial value (incomplete string or number)
      truncated = truncated.replace(/,\s*"[^"]*$/, '');  // partial key
      truncated = truncated.replace(/,\s*"[^"]*":\s*"?[^",}\]]*$/, ''); // partial key:value
      truncated = truncated.replace(/,\s*$/, ''); // trailing comma
      // Close remaining brackets and braces
      for (let b = 0; b < openBrackets; b++) truncated += ']';
      for (let b = 0; b < openBraces; b++) truncated += '}';
      try { return JSON.parse(truncated); } catch {}

      // Also try with trailing comma fixes
      const fixedTruncated = truncated
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']');
      try { return JSON.parse(fixedTruncated); } catch {}
    }
  }

  // Log for debugging
  console.error('Failed to parse LLM response. Length:', cleaned.length, 'First 500 chars:', cleaned.slice(0, 500));
  console.error('Last 200 chars:', cleaned.slice(-200));
  throw new Error('Failed to parse LLM response as JSON');
}

export async function POST(request: NextRequest) {
  try {
    const { authorized, user, message } = await validateApiAccess(request);
    if (!authorized) {
      return NextResponse.json({ error: message || 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { billPdf, rmPdf, billPages, rmPages, step } = body;

    // Step 1: Extract data from bill PDF
    if (step === 'extract-bill') {
      if (!billPdf && (!billPages || !Array.isArray(billPages) || billPages.length === 0)) {
        return NextResponse.json({ error: 'No bill document provided' }, { status: 400 });
      }

      if (billPdf) {
        // Send PDF directly to Gemini LLM (supports native PDF input)
        // This avoids pdfjs-dist worker issues in standalone production builds
        console.log(`\n📄 Sending bill PDF directly to LLM for extraction...`);
        const prompt = buildExtractionPrompt('bill');
        const pdfContent = buildPdfMessage(billPdf, prompt, 'bill.pdf');
        const result = await callLLM(pdfContent);
        const parsed = parseJsonResponse(result);
        return NextResponse.json({ success: true, data: parsed, step: 'bill-extracted' });
      } else {
        // Legacy: Process image pages in batches (for scanned/image PDFs)
        console.log(`\n📄 Extracting bill data from ${billPages.length} image pages...`);
        return NextResponse.json({ error: 'Image-based extraction is no longer supported. Please upload the PDF file directly.' }, { status: 400 });
      }
    }

    // Step 2: Extract data from RM PDF
    if (step === 'extract-rm') {
      if (!rmPdf && (!rmPages || !Array.isArray(rmPages) || rmPages.length === 0)) {
        return NextResponse.json({ error: 'No RM document provided' }, { status: 400 });
      }

      if (rmPdf) {
        // Send RM PDF directly to Gemini LLM (supports native PDF input)
        console.log(`\n📏 Sending RM PDF directly to LLM for extraction...`);
        const prompt = buildExtractionPrompt('rm');
        const pdfContent = buildPdfMessage(rmPdf, prompt, 'rm.pdf');
        const result = await callLLM(pdfContent);
        const parsed = parseJsonResponse(result);
        return NextResponse.json({ success: true, data: parsed, step: 'rm-extracted' });
      } else {
        console.log(`\n📏 RM image pages not supported...`);
        return NextResponse.json({ error: 'Image-based extraction is no longer supported. Please upload the PDF file directly.' }, { status: 400 });
      }
    }

    // Step 3: Classify line items
    if (step === 'classify') {
      const { lineItems } = body;
      if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
        return NextResponse.json({ error: 'No line items to classify' }, { status: 400 });
      }

      console.log(`\n🏷️ Classifying ${lineItems.length} line items...`);
      const prompt = buildClassificationPrompt(lineItems);
      const result = await callLLM(prompt);
      const parsed = parseJsonResponse(result);

      // Refresh DB connection after long LLM processing
      await ensureConnection();
      
      // Match suggested codes to actual SubClassification records in DB
      const subClassifications = await prisma.subClassification.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true, groupId: true, fixed: true, labour: true, steel: true, cement: true, plantMachinery: true, fuel: true, otherMaterials: true, explosives: true },
      });

      const enrichedGroups = (parsed.groupedByClassification || []).map((group: any) => {
        const matchedSub = subClassifications.find(s => s.code === group.code) ||
          subClassifications.find(s => s.code.startsWith(group.code?.replace(/[ABC]$/, '')));
        return {
          ...group,
          subClassificationId: matchedSub?.id || null,
          subClassificationCode: matchedSub?.code || group.code,
          subClassificationName: matchedSub?.name || group.name,
          components: matchedSub ? {
            fixed: matchedSub.fixed,
            labour: matchedSub.labour,
            steel: matchedSub.steel,
            cement: matchedSub.cement,
            plantMachinery: matchedSub.plantMachinery,
            fuel: matchedSub.fuel,
            otherMaterials: matchedSub.otherMaterials,
            explosives: matchedSub.explosives,
          } : null,
        };
      });

      return NextResponse.json({
        success: true,
        data: {
          ...parsed,
          groupedByClassification: enrichedGroups,
          availableSubClassifications: subClassifications.map(s => ({ id: s.id, code: s.code, name: s.name })),
        },
        step: 'classified',
      });
    }

    // Step 4: Match contract
    if (step === 'match-contract') {
      const { agreementNo } = body;
      if (!agreementNo) {
        return NextResponse.json({ error: 'No agreement number provided' }, { status: 400 });
      }

      console.log(`\n🔍 Matching contract for agreement: ${agreementNo}`);

      // Refresh DB connection after long LLM processing
      await ensureConnection();

      // Try exact match first
      let contract = await prisma.contract.findFirst({
        where: { 
          agreementNo: { contains: agreementNo, mode: 'insensitive' },
          ...(user?.id ? {
            OR: [
              { userId: user.id },
              { userAccess: { some: { userId: user.id } } }
            ]
          } : {})
        },
        select: { id: true, agreementNo: true, contractorName: true, workDescription: true, baseMonth: true, dateOfOpening: true },
      });

      // Try partial match
      if (!contract) {
        const parts = agreementNo.split('/');
        const yearPart = parts.find((p: string) => /^20\d{2}$/.test(p));
        const numPart = parts[parts.length - 1];
        
        if (yearPart && numPart) {
          contract = await prisma.contract.findFirst({
            where: {
              agreementNo: { contains: numPart, mode: 'insensitive' },
              ...(user?.id ? {
                OR: [
                  { userId: user.id },
                  { userAccess: { some: { userId: user.id } } }
                ]
              } : {})
            },
            select: { id: true, agreementNo: true, contractorName: true, workDescription: true, baseMonth: true, dateOfOpening: true },
          });
        }
      }

      // Get all user contracts as fallback
      const allContracts = await prisma.contract.findMany({
        where: user?.id ? {
          OR: [
            { userId: user.id },
            { userAccess: { some: { userId: user.id } } }
          ]
        } : {},
        select: { id: true, agreementNo: true, contractorName: true, workDescription: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      return NextResponse.json({
        success: true,
        matchedContract: contract || null,
        allContracts,
        step: 'contract-matched',
      });
    }

    return NextResponse.json({ error: 'Invalid step. Use: extract-bill, extract-rm, classify, match-contract' }, { status: 400 });

  } catch (error: any) {
    console.error('AI extraction error:', error);
    return NextResponse.json(
      { error: 'Failed to process PDFs', details: error.message },
      { status: 500 }
    );
  }
}

function mergeExtractionResults(results: any[]): any {
  if (results.length === 0) return {};
  if (results.length === 1) return results[0];

  const base = { ...results[0] };
  const seenItems = new Set(base.lineItems?.map((i: any) => `${i.itemNo}-${i.description?.slice(0, 30)}`) || []);

  for (let i = 1; i < results.length; i++) {
    const r = results[i];
    if (r.lineItems) {
      for (const item of r.lineItems) {
        const key = `${item.itemNo}-${item.description?.slice(0, 30)}`;
        if (!seenItems.has(key)) {
          seenItems.add(key);
          base.lineItems = base.lineItems || [];
          base.lineItems.push(item);
        }
      }
    }
    // Use non-empty values from later results for headers
    if (!base.agreementNo && r.agreementNo) base.agreementNo = r.agreementNo;
    if (!base.billNo && r.billNo) base.billNo = r.billNo;
    if (!base.contractorName && r.contractorName) base.contractorName = r.contractorName;
    if (!base.grossBillAmount && r.grossBillAmount) base.grossBillAmount = r.grossBillAmount;
  }

  // Recalculate gross amount from items if not set
  if (!base.grossBillAmount && base.lineItems?.length > 0) {
    base.grossBillAmount = base.lineItems.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
  }

  return base;
}
