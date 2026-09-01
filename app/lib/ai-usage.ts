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

/**
 * The token counts from a provider response, whatever it called them.
 *
 * Abacus RouteLLM reports usage as input_tokens / output_tokens, not the OpenAI names
 * prompt_tokens / completion_tokens. Three of the four recorders read only the OpenAI
 * names, so their calls were counted but as zero tokens — the usage page undercounted
 * every agreement read, JPC sheet and justification. Every recorder now goes through
 * this, so the next caller cannot make the same mistake.
 */
export function tokensFromUsage(usage: any): { promptTokens: number; completionTokens: number; totalTokens: number } {
  const u = usage && typeof usage === 'object' ? usage : {};
  const prompt = Number(u.prompt_tokens ?? u.input_tokens ?? 0) || 0;
  const completion = Number(u.completion_tokens ?? u.output_tokens ?? 0) || 0;
  const total = Number(u.total_tokens ?? 0) || prompt + completion;
  return { promptTokens: prompt, completionTokens: completion, totalTokens: total };
}

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
  /** This month, per feature — which screen is spending the credit. */
  byOperation: Array<{ operation: string; calls: number; promptTokens: number; completionTokens: number; tokens: number; failures: number }>;
  /** Successful calls this month that carry no token count at all — calls the provider
   *  answered but whose usage field was missing or unreadable. A number here means the
   *  totals above are an undercount. */
  untokenedCalls: number;
  recent: Array<{
    id: string;
    operation: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
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

  const [all, failures, today, month, recent, lastFailure, byOp, byOpFailures, untokened] = await Promise.all([
    prisma.aiUsageLog.aggregate({ _sum: { totalTokens: true }, _count: true }),
    prisma.aiUsageLog.count({ where: { success: false } }),
    prisma.aiUsageLog.aggregate({ _sum: { totalTokens: true }, _count: true, where: { createdAt: { gte: startOfToday } } }),
    prisma.aiUsageLog.aggregate({ _sum: { totalTokens: true }, _count: true, where: { createdAt: { gte: startOfMonth } } }),
    prisma.aiUsageLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { id: true, operation: true, model: true, promptTokens: true, completionTokens: true, totalTokens: true, success: true, errorType: true, createdAt: true },
    }),
    prisma.aiUsageLog.findFirst({ where: { success: false }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    prisma.aiUsageLog.groupBy({
      by: ['operation'],
      where: { createdAt: { gte: startOfMonth } },
      _count: true,
      _sum: { totalTokens: true, promptTokens: true, completionTokens: true },
    }),
    prisma.aiUsageLog.groupBy({
      by: ['operation'],
      where: { createdAt: { gte: startOfMonth }, success: false },
      _count: true,
    }),
    prisma.aiUsageLog.count({ where: { createdAt: { gte: startOfMonth }, success: true, totalTokens: 0 } }),
  ]);

  const failuresByOp = new Map(byOpFailures.map(r => [r.operation, r._count]));
  const byOperation = byOp
    .map(r => ({
      operation: r.operation,
      calls: r._count,
      promptTokens: r._sum.promptTokens || 0,
      completionTokens: r._sum.completionTokens || 0,
      tokens: r._sum.totalTokens || 0,
      failures: failuresByOp.get(r.operation) || 0,
    }))
    .sort((a, b) => b.tokens - a.tokens || b.calls - a.calls);

  return {
    total: { calls: all._count, tokens: all._sum.totalTokens || 0, failures },
    today: { calls: today._count, tokens: today._sum.totalTokens || 0 },
    month: { calls: month._count, tokens: month._sum.totalTokens || 0 },
    byOperation,
    untokenedCalls: untokened,
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
