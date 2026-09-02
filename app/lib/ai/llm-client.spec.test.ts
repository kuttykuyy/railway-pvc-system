import { afterEach, describe, expect, it } from 'vitest';
import { anthropicModelOf, currentModelSpec, isAnthropicSpec, withModelSpec } from './model-spec';

describe('model spec resolution', () => {
  const saved = process.env.BILL_AI_MODEL;
  afterEach(() => { if (saved === undefined) delete process.env.BILL_AI_MODEL; else process.env.BILL_AI_MODEL = saved; });

  it('defaults to the Abacus router', () => {
    delete process.env.BILL_AI_MODEL;
    expect(currentModelSpec()).toBe('route-llm');
    expect(isAnthropicSpec(currentModelSpec())).toBe(false);
  });

  it('reads the deployment default from the environment', () => {
    process.env.BILL_AI_MODEL = 'anthropic:claude-sonnet-5';
    expect(currentModelSpec()).toBe('anthropic:claude-sonnet-5');
    expect(anthropicModelOf(currentModelSpec())).toBe('claude-sonnet-5');
  });

  it('lets a caller pin a model for everything inside its scope, and only there', async () => {
    delete process.env.BILL_AI_MODEL;
    const inside = await withModelSpec('anthropic:claude-opus-5', async () => {
      await Promise.resolve();
      return currentModelSpec();
    });
    expect(inside).toBe('anthropic:claude-opus-5');
    expect(currentModelSpec()).toBe('route-llm');
    expect(await withModelSpec('', async () => currentModelSpec())).toBe('route-llm');
  });
});
