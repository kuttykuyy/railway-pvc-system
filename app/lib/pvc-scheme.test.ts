import { describe, expect, it } from 'vitest';
import {
  resolvePvcScheme, isRailwayScheme, assertSchemeImplemented, DEFAULT_PVC_SCHEME,
} from './pvc-scheme';

describe('resolvePvcScheme', () => {
  it('defaults to the Railway engine when no scheme is stored — every contract today', () => {
    expect(resolvePvcScheme({})).toBe('railway-46a');
    expect(resolvePvcScheme(null)).toBe('railway-46a');
    expect(resolvePvcScheme(undefined)).toBe('railway-46a');
    expect(resolvePvcScheme({ pvcScheme: null })).toBe('railway-46a');
    expect(resolvePvcScheme({ pvcScheme: '' })).toBe('railway-46a');
  });

  it('reads a known stored scheme', () => {
    expect(resolvePvcScheme({ pvcScheme: 'railway-46a' })).toBe('railway-46a');
    expect(resolvePvcScheme({ pvcScheme: 'cpwd-10ca' })).toBe('cpwd-10ca');
    expect(resolvePvcScheme({ pvcScheme: '  cpwd-10ca  ' })).toBe('cpwd-10ca');
  });

  it('falls back rather than throwing on an unrecognised value — never breaks a real bill', () => {
    expect(resolvePvcScheme({ pvcScheme: 'something-else' })).toBe('railway-46a');
    expect(resolvePvcScheme({ pvcScheme: 'RAILWAY-46A' })).toBe('railway-46a'); // case-sensitive keys
  });

  it('the default is the Railway engine', () => {
    expect(DEFAULT_PVC_SCHEME).toBe('railway-46a');
  });
});

describe('isRailwayScheme', () => {
  it('is true only for the Railway engine', () => {
    expect(isRailwayScheme('railway-46a')).toBe(true);
    expect(isRailwayScheme('cpwd-10ca')).toBe(false);
  });
});

describe('assertSchemeImplemented', () => {
  it('passes for the Railway engine', () => {
    expect(() => assertSchemeImplemented('railway-46a')).not.toThrow();
  });

  it('throws for a declared-but-unbuilt engine, naming it', () => {
    expect(() => assertSchemeImplemented('cpwd-10ca')).toThrow(/cpwd-10ca/);
    expect(() => assertSchemeImplemented('cpwd-10ca')).toThrow(/not built yet/i);
  });
});
