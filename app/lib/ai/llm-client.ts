import { recordAiUsage, tokensFromUsage } from '../ai-usage';
import { anthropicModelOf, currentModelSpec, emitUsage, isAnthropicSpec, type UsageEvent } from './model-spec';

export { withModelSpec, currentModelSpec, isAnthropicSpec, anthropicModelOf, aiProviderConfigured, onUsage, type UsageEvent } from './model-spec';

/**
 * One door to the language model for bill extraction, whichever provider is behind it.
 *
 * Every extraction call used to be a hand-written fetch to Abacus RouteLLM with the model
 * fixed at "route-llm" — Abacus's auto-router, which picks a different model per call.
 * That made results hard to reproduce and impossible to compare: the same bill could be
 * read by GPT-4.1 one day and Gemini Flash the next. This module lets the model be
 * named, per request or per deployment, and adds Anthropic's API as a second provider,
 * so the extraction that decides payable figures can be pinned to one model and
 * measured against another (see scripts/eval-bill-extraction.ts).
 *
 * A model is named by a spec string:
 *   "route-llm"                 Abacus auto-router (the default, as before)
 *   "<abacus model name>"       a specific model through Abacus, e.g. "gpt-4.1"
 *   "anthropic:claude-opus-5"   a Claude model through the Anthropic API directly
 *
 * The spec comes from, in order: the caller (withModelSpec), the BILL_AI_MODEL
 * environment variable, then "route-llm".
 */

export class AiProviderCreditsExhaustedError extends Error {
  constructor() {
    super('AI provider credits are exhausted. The administrator must recharge the AI provider account before extraction can continue.');
    this.name = 'AiProviderCreditsExhaustedError';
  }
}

const ABACUS_ENDPOINT = 'https://routellm.abacus.ai/v1/chat/completions';

export interface JsonCompletion {
  content: string;
  finishReason: string;
  /** The model that answered, as the provider names it. */
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  choiceCount: number;
  messageKeys: string[];
}

function extractAbacusContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) => (typeof part === 'string' ? part : typeof part?.text === 'string' ? part.text : ''))
      .join('');
  }
  return '';
}

/**
 * Ask the model for a JSON answer to `prompt`. Throws on provider failure; the caller
 * decides whether to retry. Usage is recorded on the admin usage log either way.
 */
export async function completeJson(o: {
  operation: string;
  prompt: string;
  maxTokens: number;
  modelSpec?: string;
  abacusApiKey?: string;
}): Promise<JsonCompletion> {
  const spec = String(o.modelSpec || '').trim() || currentModelSpec();
  const startedAt = Date.now();
  const result = isAnthropicSpec(spec)
    ? await completeWithAnthropic(o.operation, anthropicModelOf(spec), o.prompt, o.maxTokens)
    : await completeWithAbacus(o.operation, spec, o.prompt, o.maxTokens, o.abacusApiKey || process.env.ABACUSAI_API_KEY || '');
  const event: UsageEvent = {
    operation: o.operation,
    spec,
    model: result.model,
    promptTokens: result.usage?.promptTokens || 0,
    completionTokens: result.usage?.completionTokens || 0,
    durationMs: Date.now() - startedAt,
  };
  emitUsage(event);
  return result;
}

async function completeWithAbacus(operation: string, model: string, prompt: string, maxTokens: number, apiKey: string): Promise<JsonCompletion> {
  if (!apiKey) throw new Error('AI extraction is not configured. Missing ABACUSAI_API_KEY.');
  const response = await fetch(ABACUS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    const paymentRequired = /payment method/i.test(details);
    const outOfCredit = /no remaining credits|insufficient credits|credit balance/i.test(details);
    const blocked = response.status === 402 || paymentRequired || outOfCredit;
    await recordAiUsage({
      operation,
      model,
      success: false,
      errorType: paymentRequired ? 'payment_required' : outOfCredit ? 'out_of_credit' : blocked ? 'payment_required' : 'error',
    });
    if (blocked) throw new AiProviderCreditsExhaustedError();
    throw new Error(`AI extraction failed: ${details || response.statusText}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  const content = extractAbacusContent(choice?.message?.content);
  const usage = data.usage && typeof data.usage === 'object' ? tokensFromUsage(data.usage) : null;
  const answeredBy = String(data?.model || model);
  await recordAiUsage({ operation, model: answeredBy, success: true, ...(usage || {}) });
  return {
    content,
    finishReason: String(choice?.finish_reason || 'unknown'),
    model: answeredBy,
    usage,
    choiceCount: Array.isArray(data.choices) ? data.choices.length : 0,
    messageKeys: choice?.message && typeof choice.message === 'object' ? Object.keys(choice.message) : [],
  };
}

async function completeWithAnthropic(operation: string, model: string, prompt: string, maxTokens: number): Promise<JsonCompletion> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('AI extraction is not configured. Missing ANTHROPIC_API_KEY.');
  // Loaded on demand so deployments that never name an Anthropic model do not load the SDK.
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ timeout: 120000, maxRetries: 2 });

  let response: any;
  try {
    // Server-side refusal fallback: should the model decline a request on policy grounds,
    // the same request is re-run on the fallback model within the call, so a bill is not
    // left unread over a classifier's judgement of a railway invoice.
    response = await client.beta.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
      betas: ['server-side-fallback-2026-06-01'],
      fallbacks: [{ model: 'claude-opus-4-8' }],
    } as any);
  } catch (error: any) {
    const status = Number(error?.status);
    const errorType = status === 401 ? 'auth' : status === 429 ? 'rate_limited' : status === 402 ? 'payment_required' : status ? `http_${status}` : 'network';
    await recordAiUsage({ operation, model, success: false, errorType });
    if (status === 402) throw new AiProviderCreditsExhaustedError();
    throw new Error(`AI extraction failed: ${error?.message || String(error)}`);
  }

  const answeredBy = String(response?.model || model);
  const usage = response?.usage
    ? {
        promptTokens: Number(response.usage.input_tokens || 0) + Number(response.usage.cache_read_input_tokens || 0) + Number(response.usage.cache_creation_input_tokens || 0),
        completionTokens: Number(response.usage.output_tokens || 0),
        totalTokens: 0,
      }
    : null;
  if (usage) usage.totalTokens = usage.promptTokens + usage.completionTokens;

  if (response?.stop_reason === 'refusal') {
    await recordAiUsage({ operation, model: answeredBy, success: false, errorType: 'refusal', ...(usage || {}) });
    throw new Error(`AI extraction refused: ${response?.stop_details?.explanation || response?.stop_details?.category || 'no reason given'}`);
  }

  const content = (Array.isArray(response?.content) ? response.content : [])
    .filter((block: any) => block?.type === 'text' && typeof block.text === 'string')
    .map((block: any) => block.text)
    .join('');
  await recordAiUsage({ operation, model: answeredBy, success: true, ...(usage || {}) });
  return {
    content,
    finishReason: String(response?.stop_reason || 'unknown'),
    model: answeredBy,
    usage,
    choiceCount: 1,
    messageKeys: Array.isArray(response?.content) ? response.content.map((b: any) => String(b?.type)) : [],
  };
}
