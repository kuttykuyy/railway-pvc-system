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

const DEFAULT_SPEC = 'route-llm';
const specStore = new AsyncLocalStorage<string>();

/** Run `fn` with every extraction call inside it going to `spec`. No spec: unchanged. */
export function withModelSpec<T>(spec: string | undefined | null, fn: () => Promise<T>): Promise<T> {
  const clean = String(spec || '').trim();
  return clean ? specStore.run(clean, fn) : fn();
}

export function currentModelSpec(): string {
  return specStore.getStore() || String(process.env.BILL_AI_MODEL || '').trim() || DEFAULT_SPEC;
}

export function isAnthropicSpec(spec: string): boolean {
  return /^anthropic:/i.test(spec);
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
