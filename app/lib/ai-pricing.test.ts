import { describe, expect, it } from 'vitest';
import { estimateCostUsd, rateForModel } from './ai-pricing';

describe('AI pricing by routed model', () => {
  it('prices the models Abacus routes to at their own rates', () => {
    // 95,000 in + 50,540 out on GPT-4.1, as the Abacus usage page lists it
    expect(estimateCostUsd('OPENAI_GPT4_1', 95_000, 50_540)).toBeCloseTo(0.19 + 0.4043, 4);
    expect(rateForModel('gpt-4.1-2025-04-14').label).toBe('OpenAI GPT-4.1');
    expect(rateForModel('OPENAI_GPT5_6_MINI').rate.output).toBe(0.0012);
    expect(rateForModel('GEMINI_3_7_FLASH').rate.input).toBe(0.0008);
    expect(estimateCostUsd('Supporting Services', 4_440, 60)).toBe(0);
  });

  it('prices Claude models named directly at Anthropic rates', () => {
    expect(estimateCostUsd('claude-sonnet-5', 1_000_000, 1_000_000)).toBeCloseTo(12.0, 6);
    expect(estimateCostUsd('claude-opus-5', 1_000_000, 1_000_000)).toBeCloseTo(30.0, 6);
    expect(rateForModel('claude-opus-4-8').label).toBe('Claude Opus');
  });

  it('falls back for calls that never recorded their model, and says so', () => {
    const fallback = rateForModel('route-llm');
    expect(fallback.known).toBe(false);
    expect(estimateCostUsd('route-llm', 1_000_000, 0)).toBeCloseTo(2.0, 6);
    expect(rateForModel(undefined).known).toBe(false);
  });
});
