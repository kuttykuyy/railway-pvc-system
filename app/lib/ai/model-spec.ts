import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Which model an extraction call goes to, and a bus for what each call cost.
 *
 * Kept free of database and provider imports so a script or a test can resolve specs
 * and tally usage without loading the app's data layer. The providers themselves live
 * in llm-client.ts.
 *
 * A model is named by a spec string:
 *   "route-llm"                 Abacus auto-router (the default, as before)
 *   "<abacus model name>"       a specific model through Abacus, e.g. "gpt-4.1"
 *   "anthropic:claude-opus-5"   a Claude model through the Anthropic API directly
 *
 * The spec comes from, in order: the caller (withModelSpec), the BILL_AI_MODEL
 * environment variable, then "route-llm".
 */

// The model every Abacus (RouteLLM) call uses by default. Overridable per-deploy with
// BILL_AI_MODEL and per-call with withModelSpec(), so switching models needs no code
// change. Set to Gemini Flash; use 'route-llm' to go back to Abacus's auto-router.
const DEFAULT_SPEC = 'gemini-3.8-flash';
const specStore = new AsyncLocalStorage<string>();

/** Run `fn` with every extraction call inside it going to `spec`. No spec: unchanged. */
export function withModelSpec<T>(spec: string | undefined | null, fn: () => Promise<T>): Promise<T> {
  const clean = String(spec || '').trim();
  return clean ? specStore.run(clean, fn) : fn();
}

export function currentModelSpec(): string {
  return specStore.getStore() || String(process.env.BILL_AI_MODEL || '').trim() || DEFAULT_SPEC;
}

/** A model pinned for this call by withModelSpec(), or null. Beats the admin setting. */
export function pinnedModelSpec(): string | null {
  return specStore.getStore() || null;
}

/** The hardcoded fallback model, exported so the DB-backed resolver can reuse it. */
export const DEFAULT_MODEL_SPEC = DEFAULT_SPEC;

export function isAnthropicSpec(spec: string): boolean {
  return /^anthropic:/i.test(spec);
}

/**
 * The model name to send to the Abacus (RouteLLM) endpoint. Honours BILL_AI_MODEL and
 * withModelSpec(), falling back to DEFAULT_SPEC. An anthropic:* spec is meaningless on
 * the Abacus endpoint, so it maps to the default there.
 */
export function abacusModelName(): string {
  const spec = currentModelSpec();
  return isAnthropicSpec(spec) ? DEFAULT_SPEC : spec;
}

/** The Claude model id inside an "anthropic:<id>" spec. */
export function anthropicModelOf(spec: string): string {
  return spec.replace(/^anthropic:/i, '').trim();
}

/** Whether the provider the spec names has credentials configured. */
export function aiProviderConfigured(spec: string = currentModelSpec()): boolean {
  return isAnthropicSpec(spec) ? !!process.env.ANTHROPIC_API_KEY : !!process.env.ABACUSAI_API_KEY;
}

export interface UsageEvent {
  operation: string;
  spec: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
}

const usageListeners = new Set<(event: UsageEvent) => void>();

/** Observe every completion's tokens and timing — how the evaluation script tallies cost. */
export function onUsage(listener: (event: UsageEvent) => void): () => void {
  usageListeners.add(listener);
  return () => { usageListeners.delete(listener); };
}

export function emitUsage(event: UsageEvent): void {
  for (const listener of usageListeners) {
    try { listener(event); } catch { /* observers never break extraction */ }
  }
}
