import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { recordAiUsage } from '@/lib/ai-usage';
import rateLimiter, { RATE_LIMITS, getIdentifier } from '@/lib/rate-limiter';
import { PDFDocument } from 'pdf-lib';

// Every field we need (agreement no, LOA, contractor, work description, closing
// date, values) is on the opening pages; a full 70+ page agreement overwhelms the
// AI request, so we only send the first PAGES_TO_SEND pages.
const PAGES_TO_SEND = 12;

export const dynamic = 'force-dynamic';

const ABACUS_ENDPOINT = 'https://routellm.abacus.ai/v1/chat/completions';

/**
 * Reads an uploaded railway agreement PDF and returns the fields needed to
 * pre-fill the "create contract" form. Free feature, but auth-gated + rate
 * limited so it can't be used anonymously to burn the AI key.
 *
 * Base-month rule: the PVC base month is the month BEFORE the tender closing
 * date. The app derives baseMonth server-side as (dateOfOpening - 1 month), so
 * we map the extracted closing date onto `dateOfOpening` to get the right base
 * month automatically.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const rl = rateLimiter.check(getIdentifier(request), RATE_LIMITS.EXPENSIVE.limit, RATE_LIMITS.EXPENSIVE.windowMs);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many requests. Please wait ${Math.ceil(rl.resetIn / 1000)}s and try again.` },
        { status: 429, headers: { 'Retry-After': Math.ceil(rl.resetIn / 1000).toString() } },
      );
    }

    const apiKey = process.env.ABACUSAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'AI service is not configured.' }, { status: 503 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Please upload the agreement as a PDF.' }, { status: 400 });
    }
    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Maximum size is 100MB.' }, { status: 400 });
    }

    const original = Buffer.from(await file.arrayBuffer());
    // Trim to the first few pages so the AI request stays small and reliable.
    let pdfBytes: Uint8Array = new Uint8Array(original);
    try {
      const src = await PDFDocument.load(original, { ignoreEncryption: true });
      const total = src.getPageCount();
      if (total > PAGES_TO_SEND) {
        const trimmed = await PDFDocument.create();
        const pages = await trimmed.copyPages(src, Array.from({ length: PAGES_TO_SEND }, (_, i) => i));
        pages.forEach((p) => trimmed.addPage(p));
        pdfBytes = await trimmed.save();
      }
    } catch (err) {
      console.warn('extract-agreement: could not trim PDF, sending original:', err);
    }
    const dataUri = `data:application/pdf;base64,${Buffer.from(pdfBytes).toString('base64')}`;

    const prompt = `You are extracting fields from an Indian Railway "Contract Agreement of Works" / e-tender agreement PDF to pre-fill a form. Read the whole document.

Return ONLY raw JSON (no markdown, no code fences) with these keys. Use null when a value is not clearly present. Convert every date to "YYYY-MM-DD". Convert money to a plain number (no commas, no ₹).

{
  "agreementNo": "Contract Agreement No (e.g. SR/TPJ/Civil/2026/0068)",
  "loaNo": "LOA Number",
  "loaDate": "LOA Date (YYYY-MM-DD)",
  "contractorName": "Contractor's name",
  "contractorPhone": "Contractor phone/mobile if present, else null",
  "workDescription": "Full name/description of the work",
  "closingDate": "Tender Closing Date (the 'Closing Date/Time' field), YYYY-MM-DD",
  "completionDate": "Date of Completion, YYYY-MM-DD",
  "completionPeriodMonths": "Period of Completion in whole months (number)",
  "tenderAdvertisedValue": "Advertised Value / Tender Amount (number)",
  "agreementAmount": "LOA Amount / accepted contract value (number)",
  "railwayName": "Railway zone name (e.g. Southern Railway)",
  "division": "Division/Unit (e.g. Tiruchchirappalli / TPJ)"
}`;

    const messages = [
      {
        role: 'user',
        content: [
          { type: 'file', file: { filename: file.name, file_data: dataUri } },
          { type: 'text', text: prompt },
        ],
      },
    ];

    let response: Response;
    try {
      response = await fetch(ABACUS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'route-llm', messages, response_format: { type: 'json_object' }, max_tokens: 2000, temperature: 0.1 }),
        signal: AbortSignal.timeout(60000),
      });
    } catch {
      await recordAiUsage({ operation: 'agreement-extraction', success: false, errorType: 'network' });
      return NextResponse.json({ error: 'The AI request failed. Please try again.' }, { status: 502 });
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error(`extract-agreement: AI HTTP ${response.status}:`, text.slice(0, 500));
      const outOfCredit = response.status === 402 || /no remaining credits|insufficient credits|credit balance/i.test(text);
      await recordAiUsage({ operation: 'agreement-extraction', success: false, errorType: outOfCredit ? 'out_of_credit' : `http_${response.status}` });
      return NextResponse.json(
        {
          error: outOfCredit
            ? 'The AI service is out of credit. Please try again later.'
            : `Could not read the agreement (AI error ${response.status}). Please try again, or fill the form manually.`,
        },
        { status: outOfCredit ? 402 : 502 },
      );
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    let extracted: any = {};
    try {
      extracted = JSON.parse(content);
    } catch {
      await recordAiUsage({ operation: 'agreement-extraction', success: false, errorType: 'parse_error' });
      return NextResponse.json({ error: 'Could not read the agreement clearly. Please fill the form manually.' }, { status: 502 });
    }

    const usage = data?.usage || {};
    await recordAiUsage({
      operation: 'agreement-extraction',
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      success: true,
    });

    // Base-month rule: baseMonth = month BEFORE the closing date, and the server
    // derives it from dateOfOpening. So map the closing date onto dateOfOpening.
    const dateOfOpening = extracted.closingDate || extracted.dateOfOpening || null;

    return NextResponse.json({
      data: {
        agreementNo: extracted.agreementNo ?? null,
        loaNo: extracted.loaNo ?? null,
        loaDate: extracted.loaDate ?? null,
        contractorName: extracted.contractorName ?? null,
        contractorPhone: extracted.contractorPhone ?? null,
        workDescription: extracted.workDescription ?? null,
        dateOfOpening,
        closingDate: extracted.closingDate ?? null,
        completionDate: extracted.completionDate ?? null,
        completionPeriodMonths: extracted.completionPeriodMonths ?? null,
        tenderAdvertisedValue: extracted.tenderAdvertisedValue ?? null,
        agreementAmount: extracted.agreementAmount ?? null,
        railwayName: extracted.railwayName ?? null,
        division: extracted.division ?? null,
      },
    });
  } catch (error) {
    console.error('extract-agreement error:', error);
    return NextResponse.json({ error: 'Failed to read the agreement.' }, { status: 500 });
  }
}
