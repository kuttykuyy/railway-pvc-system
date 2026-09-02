/**
 * What an AI call costs, priced by the model that actually answered it.
 *
 * Every request goes to Abacus as "route-llm", and Abacus bills it under whichever
 * model it routed to — this month GPT-4.1, GPT-5.x and Gemini Flash, each at its own
 * rate. The usage page priced everything at Claude Sonnet's rate ($3 / $15 per million)
 * and came out about a third above the bill. The rates below are Abacus's own, read off
 * its usage page (USD per 1,000 tokens), keyed by the model name it reports.
 *
 * Client-safe: no database, no environment.
 */
export interface ModelRate {
  /** USD per 1,000 prompt tokens. */
  input: number;
  /** USD per 1,000 completion tokens. */
  output: number;
}

interface KnownModel {
  match: RegExp;
  label: string;
  rate: ModelRate;
}

const KNOWN_MODELS: KnownModel[] = [
  { match: /gpt[-_ ]?4[._-]?1/i, label: 'OpenAI GPT-4.1', rate: { input: 0.0020, output: 0.0080 } },
  { match: /gpt[-_ ]?5/i, label: 'OpenAI GPT-5.x', rate: { input: 0.0002, output: 0.0012 } },
  { match: /gemini.*flash/i, label: 'Gemini Flash', rate: { input: 0.0008, output: 0.0037 } },
  // Anthropic first-party API rates (USD per 1K tokens), for models named directly.
  { match: /fable|mythos/i, label: 'Claude Fable 5.x', rate: { input: 0.0100, output: 0.0500 } },
  { match: /opus[-_ ]?5|opus[-_ ]?4[-_.]?[678]/i, label: 'Claude Opus', rate: { input: 0.0050, output: 0.0250 } },
  { match: /sonnet[-_ ]?5/i, label: 'Claude Sonnet 5', rate: { input: 0.0020, output: 0.0100 } },
  { match: /claude.*sonnet|sonnet/i, label: 'Claude Sonnet 4.x', rate: { input: 0.0030, output: 0.0150 } },
  { match: /claude.*haiku|haiku/i, label: 'Claude Haiku', rate: { input: 0.0010, output: 0.0050 } },
  { match: /supporting\s*service/i, label: 'Supporting services', rate: { input: 0, output: 0 } },
];

/**
 * A call recorded before the routed model was written down, or routed to a model not
 * listed above. Priced as GPT-4.1, the model Abacus billed most of this month's calls
 * to — closer to the bill than Sonnet's rate, and marked as an estimate on the page.
 */
export const FALLBACK_RATE: ModelRate = { input: 0.0020, output: 0.0080 };
export const FALLBACK_LABEL = 'route-llm (model not recorded)';

export function rateForModel(model: string | null | undefined): { rate: ModelRate; label: string; known: boolean } {
  const name = String(model || '').trim();
  const hit = name ? KNOWN_MODELS.find((m) => m.match.test(name)) : undefined;
  if (hit) return { rate: hit.rate, label: hit.label, known: true };
  return { rate: FALLBACK_RATE, label: name && name !== 'route-llm' ? `${name} (rate unknown)` : FALLBACK_LABEL, known: false };
}

/** Cost in USD of one call or one aggregate, by the model that served it. */
export function estimateCostUsd(model: string | null | undefined, promptTokens: number, completionTokens: number): number {
  const { rate } = rateForModel(model);
  return ((Number(promptTokens) || 0) / 1000) * rate.input + ((Number(completionTokens) || 0) / 1000) * rate.output;
}
