import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateApiAccess } from '@/lib/payment-validation';
import {
  calculateDsrCementRequirement,
  inferCementCoefficientFromMix,
  normalizeDsrCode,
  summarizeCementCalculation,
} from '@/lib/dsr-cement-calculation';

export const dynamic = 'force-dynamic';

interface ExtractedCementItem {
  dsrCode: string;
  itemNo?: string;
  description: string;
  unit: string;
  quantitySinceLastBill: number;
  amountSinceLastBill?: number;
  confidence?: 'high' | 'medium' | 'low';
  reason?: string;
}

function parseNumber(value: FormDataEntryValue | null): number | null {
  if (value === null) return null;
  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseAiJson(content: string) {
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '');
  return JSON.parse(cleaned);
}

async function extractCementItemsWithAi(file: File): Promise<ExtractedCementItem[]> {
  const apiKey = process.env.ABACUSAI_API_KEY;
  if (!apiKey) {
    throw new Error('AI extraction is not configured. Missing ABACUSAI_API_KEY.');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileData = `data:${file.type};base64,${buffer.toString('base64')}`;

  const prompt = `You are extracting cement-affected CPWD DSR 2021 bill items from an Indian Railway IREPS running account bill PDF.

Return JSON only:
{
  "items": [
    {
      "dsrCode": "DSR code like 4.1.6 or 5.1.2",
      "itemNo": "visible item number if different",
      "description": "full item description",
      "unit": "Cum/Sqm/Kg/MT/etc",
      "quantitySinceLastBill": number,
      "amountSinceLastBill": number,
      "confidence": "high|medium|low",
      "reason": "short reason why this is cement affected"
    }
  ]
}

Rules:
- Extract only work items where cement is consumed inside the work, such as concrete, RCC, mortar, plaster, pointing, flooring, masonry, precast CC blocks.
- Do not include pure cement supply items such as "Ordinary Portland Cement 43 grade" as cement-affected work.
- Do not include steel reinforcement items.
- Use the DSR code printed in the bill, not the schedule serial number.
- For non-schedule cement/concrete items without a DSR code, return dsrCode as MIX-1:2:4, MIX-1:3:6, MIX-1:1.5:3, etc. based on the visible mix ratio.
- quantitySinceLastBill must be the current payable quantity for this bill. If current quantity is zero, include it only if the item is needed for audit and set quantitySinceLastBill to 0.
- amountSinceLastBill must be the current payable amount including special condition if available.
- If the PDF has split decimals across lines, reconstruct them.
- If uncertain, include the item with confidence "low".`;

  const response = await fetch('https://routellm.abacus.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'route-llm',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file: {
                filename: file.name,
                file_data: fileData,
              },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 5000,
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`AI extraction failed: ${details || response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI extraction returned no content.');

  const parsed = parseAiJson(content);
  return Array.isArray(parsed.items) ? parsed.items : [];
}

export async function POST(request: NextRequest) {
  try {
    const { authorized, message } = await validateApiAccess(request);
    if (!authorized) {
      return NextResponse.json({ error: message || 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const cementRatePerUnit = parseNumber(formData.get('cementRatePerUnit'));

    if (!file) {
      return NextResponse.json({ error: 'No PDF file provided' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
    }

    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size too large. Maximum size is 25MB.' }, { status: 400 });
    }

    const extractedItems = await extractCementItemsWithAi(file);
    const dsrCodes = Array.from(new Set(extractedItems.map(item => normalizeDsrCode(item.dsrCode)).filter(Boolean)));

    const coefficients = await prisma.dsrCementCoefficient.findMany({
      where: {
        dsrCode: { in: dsrCodes },
        isActive: true,
      },
    });
    const coefficientByCode = new Map(coefficients.map(item => [item.dsrCode, item]));

    const calculationItems = extractedItems.map(item => {
      const dsrCode = normalizeDsrCode(item.dsrCode);
      return {
        dsrCode,
        description: item.description,
        unit: item.unit,
        quantity: Number(item.quantitySinceLastBill || 0),
        amount: Number(item.amountSinceLastBill || 0),
        coefficient: coefficientByCode.get(dsrCode) || inferCementCoefficientFromMix(item.description, item.unit),
      };
    });

    const results = calculateDsrCementRequirement(calculationItems, cementRatePerUnit);
    const summary = summarizeCementCalculation(results);

    return NextResponse.json({
      success: true,
      data: {
        extractedItems,
        cementRatePerUnit,
        results,
        summary,
        warnings: summary.unmatchedItemCount > 0
          ? [`${summary.unmatchedItemCount} item(s) need DSR cement coefficients before cement amount can be finalized.`]
          : [],
      },
    });
  } catch (error: any) {
    console.error('Cement analysis failed:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to analyse cement from bill PDF' },
      { status: 500 }
    );
  }
}
