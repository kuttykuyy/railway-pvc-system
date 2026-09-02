import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { recordAiUsage, tokensFromUsage } from '@/lib/ai-usage';
import rateLimiter, { RATE_LIMITS, getIdentifier } from '@/lib/rate-limiter';

export const dynamic = 'force-dynamic';

const ABACUS_ENDPOINT = 'https://routellm.abacus.ai/v1/chat/completions';
const AI_JUSTIFICATION_FEE = 99;

/**
 * Generates a short, formal GCC-46A justification for why a work item belongs
 * under a (typically manually-selected) classification, using the AI provider.
 *
 * This is a PAID feature: ₹{AI_JUSTIFICATION_FEE} is charged from the user's credit
 * balance on each successful generation. The charge is decided and taken HERE, on
 * the server, at the moment the AI runs — not from a client flag at bill save — so
 * it cannot be bypassed via bill edit, bulk/external create, or dev-tools. Free-type
 * accounts (admin / superadmin / railway official / free account / ₹0 custom fee) are
 * not charged. The fee is only taken when generation actually succeeds.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Rate-limit to blunt credit-burning by repeated calls. Key on the authenticated
    // user, not the spoofable X-Forwarded-For IP.
    const rl = rateLimiter.check(getIdentifier(request, session.user.email), RATE_LIMITS.EXPENSIVE.limit, RATE_LIMITS.EXPENSIVE.windowMs);
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

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { customerAccount: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    // Who pays: everyone except always-free account types.
    const isFreeUser =
      user.role === 'admin' ||
      user.role === 'superadmin' ||
      user.role === 'railway_official' ||
      user.isFreeAccount ||
      user.customProcessingFee === 0;

    const balance = user.customerAccount?.creditBalance || 0;
    if (!isFreeUser && balance < AI_JUSTIFICATION_FEE) {
      return NextResponse.json(
        {
          error: `Generate with AI costs ₹${AI_JUSTIFICATION_FEE}. Your balance is ₹${balance}. Please add credits to use it.`,
          requiredPayment: AI_JUSTIFICATION_FEE,
        },
        { status: 402 },
      );
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

    await recordAiUsage({
      operation: 'classification-justification',
      model: data?.model,
      ...tokensFromUsage(data?.usage),
      success: !!justification,
      errorType: justification ? null : 'empty_response',
    });

    if (!justification) {
      return NextResponse.json({ error: 'The AI returned an empty justification. Please try again.' }, { status: 502 });
    }

    // Charge only now that generation succeeded. Read the balance inside the
    // transaction so the recorded balanceAfter is correct under concurrent charges.
    let charged = 0;
    if (!isFreeUser) {
      try {
        await prisma.$transaction(async (tx) => {
          const account = await tx.customerAccount.findUnique({
            where: { userId: user.id },
            select: { creditBalance: true },
          });
          const balanceBefore = account?.creditBalance ?? 0;
          const balanceAfter = balanceBefore - AI_JUSTIFICATION_FEE;
          await tx.customerAccount.update({
            where: { userId: user.id },
            data: { creditBalance: { decrement: AI_JUSTIFICATION_FEE } },
          });
          await tx.creditTransaction.create({
            data: {
              userId: user.id,
              amount: -AI_JUSTIFICATION_FEE,
              type: 'deduct',
              reason: 'AI classification justification',
              balanceBefore,
              balanceAfter,
            },
          });
        });
        charged = AI_JUSTIFICATION_FEE;
      } catch (err) {
        // Generation already spent AI credit; if the deduction fails we still return
        // the text but log it so the shortfall is visible rather than silently lost.
        console.error('classification-justification: charge failed after generation:', err);
      }
    }

    return NextResponse.json({ justification, charged });
  } catch (error) {
    console.error('classification-justification error:', error);
    return NextResponse.json({ error: 'Failed to generate justification.' }, { status: 500 });
  }
}
