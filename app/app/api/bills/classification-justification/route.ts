import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { recordAiUsage } from '@/lib/ai-usage';

export const dynamic = 'force-dynamic';

const ABACUS_ENDPOINT = 'https://routellm.abacus.ai/v1/chat/completions';

/**
 * Generates a short, formal GCC-46A justification for why a work item belongs
 * under a (typically manually-selected) classification, using the AI provider.
 * On-demand: the bill form calls this when the user clicks "Generate with AI"
 * next to an item's justification field.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const apiKey = process.env.ABACUSAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'AI service is not configured.' }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const {
      itemDescription = '',
      itemNumber = '',
      amount,
      subCode = '',
      subName = '',
      groupCode = '',
      groupName = '',
      workDescription = '',
    } = body || {};

    const item = String(itemDescription || itemNumber || '').trim();
    if (!subCode || !subName) {
      return NextResponse.json({ error: 'A selected classification is required.' }, { status: 400 });
    }
    if (!item) {
      return NextResponse.json(
        { error: 'Add a work description for this item first, then generate the justification.' },
        { status: 400 },
      );
    }

    const prompt = `You are a railway contract engineer writing price-variation (PVC) documentation for a bill under Indian Railways GCC-2022 clause 46A.

Write a concise, formal justification (2-3 sentences, max ~60 words) explaining why the following work item is correctly classified under the given GCC classification. Reference the nature of the work and why it fits that classification/sub-classification. Do not invent component percentages or figures. Write final documentation prose only — no preamble, no "Here is".

Work item: "${item}"${workDescription ? `\nOverall work: "${workDescription}"` : ''}${amount != null && amount !== '' ? `\nItem amount: ${amount}` : ''}
Selected classification: GCC 46A${groupCode ? `, Group ${groupCode}${groupName ? ` - ${groupName}` : ''}` : ''}, Sub-classification ${subCode}${subName ? ` (${subName})` : ''}

Return ONLY JSON: {"justification": "..."}`;

    let response: Response;
    try {
      response = await fetch(ABACUS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'route-llm',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          max_tokens: 400,
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      await recordAiUsage({ operation: 'classification-justification', success: false, errorType: 'network' });
      return NextResponse.json({ error: 'The AI request failed. Please try again.' }, { status: 502 });
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const outOfCredit =
        response.status === 402 || /no remaining credits|insufficient credits|credit balance/i.test(text);
      await recordAiUsage({
        operation: 'classification-justification',
        success: false,
        errorType: outOfCredit ? 'out_of_credit' : `http_${response.status}`,
      });
      return NextResponse.json(
        {
          error: outOfCredit
            ? 'The AI service is out of credit. Please try again later.'
            : 'The AI service could not generate a justification. Please try again.',
        },
        { status: outOfCredit ? 402 : 502 },
      );
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    let justification = '';
    try {
      justification = String(JSON.parse(content)?.justification || '').trim();
    } catch {
      justification = String(content || '').trim();
    }

    const usage = data?.usage || {};
    await recordAiUsage({
      operation: 'classification-justification',
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      success: !!justification,
      errorType: justification ? null : 'empty_response',
    });

    if (!justification) {
      return NextResponse.json({ error: 'The AI returned an empty justification. Please try again.' }, { status: 502 });
    }

    return NextResponse.json({ justification });
  } catch (error) {
    console.error('classification-justification error:', error);
    return NextResponse.json({ error: 'Failed to generate justification.' }, { status: 500 });
  }
}
