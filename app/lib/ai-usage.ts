import { prisma } from './db';

/**
 * AI provider (Abacus RouteLLM) usage tracking + live status.
 *
 * Abacus exposes no "remaining credit" API — the chat endpoint only returns a
 * 402 / "payment required" error once credit is gone. So we cannot show a live
 * balance; instead we (a) record every call's token usage for an admin usage
 * view, and (b) offer an on-demand status probe that reports whether extraction
 * is currently working or out of credit.
 */

const ABACUS_ENDPOINT = 'https://routellm.abacus.ai/v1/chat/completions';

export type AiProviderStatus = 'working' | 'payment_required' | 'out_of_credit' | 'not_configured' | 'error';

/** Records one AI call. Fire-and-forget: never throws, so it can't break extraction. */
export async function recordAiUsage(entry: {
  operation: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  success: boolean;
  errorType?: string | null;
}): Promise<void> {
  try {
    const prompt = Math.max(0, Math.round(entry.promptTokens || 0));
    const completion = Math.max(0, Math.round(entry.completionTokens || 0));
    const total = Math.max(0, Math.round(entry.totalTokens || prompt + completion));
    await prisma.aiUsageLog.create({
      data: {
        operation: entry.operation,
        model: entry.model || 'route-llm',
        promptTokens: prompt,
        completionTokens: completion,
        totalTokens: total,
        success: entry.success,
        errorType: entry.errorType || null,
      },
    });
  } catch {
    // Usage logging must never interfere with the AI request itself.
  }
}

export interface AiUsageSummary {
  total: { calls: number; tokens: number; failures: number };
  today: { calls: number; tokens: number };
  month: { calls: number; tokens: number };
  recent: Array<{
    id: string;
    operation: string;
    model: string;
    totalTokens: number;
    success: boolean;
    errorType: string | null;
    createdAt: Date;
  }>;
  lastFailureAt: Date | null;
}

export async function getAiUsageSummary(): Promise<AiUsageSummary> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [all, failures, today, month, recent, lastFailure] = await Promise.all([
    prisma.aiUsageLog.aggregate({ _sum: { totalTokens: true }, _count: true }),
    prisma.aiUsageLog.count({ where: { success: false } }),
    prisma.aiUsageLog.aggregate({ _sum: { totalTokens: true }, _count: true, where: { createdAt: { gte: startOfToday } } }),
    prisma.aiUsageLog.aggregate({ _sum: { totalTokens: true }, _count: true, where: { createdAt: { gte: startOfMonth } } }),
    prisma.aiUsageLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, operation: true, model: true, totalTokens: true, success: true, errorType: true, createdAt: true },
    }),
    prisma.aiUsageLog.findFirst({ where: { success: false }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ]);

  return {
    total: { calls: all._count, tokens: all._sum.totalTokens || 0, failures },
    today: { calls: today._count, tokens: today._sum.totalTokens || 0 },
    month: { calls: month._count, tokens: month._sum.totalTokens || 0 },
    recent,
    lastFailureAt: lastFailure?.createdAt || null,
  };
}

/**
 * Live status probe. Sends a 1-token request to the provider. When credit is
 * available this costs a negligible amount; when it is exhausted the provider
 * returns 402 for free. Meant to be called on demand from the admin page.
 */
export async function checkAiProviderStatus(): Promise<{ status: AiProviderStatus; detail: string }> {
  const apiKey = process.env.ABACUSAI_API_KEY;
  if (!apiKey) return { status: 'not_configured', detail: 'ABACUSAI_API_KEY is not set on the server.' };
  try {
    const response = await fetch(ABACUS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'route-llm', messages: [{ role: 'user', content: 'ping' }], max_tokens: 1, temperature: 0 }),
      signal: AbortSignal.timeout(20000),
    });
    if (response.ok) return { status: 'working', detail: 'AI extraction is available.' };
    const body = await response.text().catch(() => '');
    // A missing payment method is distinct from running out of credit. The RouteLLM API
    // is billed to a card on the Abacus account and needs a payment method on file even
    // when ChatLLM credits remain — so report it separately, not as "out of credit".
    if (/payment method/i.test(body)) {
      return {
        status: 'payment_required',
        detail: 'The Abacus API needs a valid payment method on the account. This is separate from ChatLLM credits — RouteLLM API usage is billed to a card. Add a payment method in the Abacus dashboard to enable AI extraction.',
      };
    }
    if (response.status === 402 || /no remaining credits|insufficient credits|credit balance/i.test(body)) {
      return { status: 'out_of_credit', detail: 'Abacus reports credits are exhausted. Recharge the account to resume AI extraction.' };
    }
    return { status: 'error', detail: `Provider returned HTTP ${response.status}. ${body.slice(0, 200)}` };
  } catch (error: any) {
    return { status: 'error', detail: error?.message || 'The status request failed.' };
  }
}
