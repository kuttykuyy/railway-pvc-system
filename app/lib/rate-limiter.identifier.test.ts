import { describe, expect, it } from 'vitest';
import { getIdentifier } from './rate-limiter';

const req = (headers: Record<string, string>) => new Request('http://x', { headers });

describe('getIdentifier', () => {
  it('keys on the user when there is one', () => {
    expect(getIdentifier(req({ 'x-real-ip': '1.2.3.4' }), 'u1')).toBe('user:u1');
  });

  it('prefers the platform-set x-real-ip over a client-seedable forwarded list', () => {
    expect(getIdentifier(req({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1, 9.9.9.9' }))).toBe('ip:9.9.9.9');
  });

  it('falls back to the forwarded list, then to unknown', () => {
    expect(getIdentifier(req({ 'x-forwarded-for': '5.5.5.5, 6.6.6.6' }))).toBe('ip:5.5.5.5');
    expect(getIdentifier(req({}))).toBe('ip:unknown');
  });
});
