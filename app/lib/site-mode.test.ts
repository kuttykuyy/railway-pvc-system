import { describe, expect, it } from 'vitest';
import { siteModeFromHost } from './site-mode';

describe('siteModeFromHost', () => {
  it('is cpwd for the CPWD subdomain', () => {
    expect(siteModeFromHost('cpwd.irpvc.in')).toBe('cpwd');
    expect(siteModeFromHost('CPWD.IRPVC.IN')).toBe('cpwd');
    expect(siteModeFromHost('cpwd.irpvc.in:3000')).toBe('cpwd');
  });

  it('is railway for the main domain and anything else', () => {
    expect(siteModeFromHost('irpvc.in')).toBe('railway');
    expect(siteModeFromHost('www.irpvc.in')).toBe('railway');
    expect(siteModeFromHost('railway-pvc-system.vercel.app')).toBe('railway');
    expect(siteModeFromHost('localhost:3000')).toBe('railway');
    expect(siteModeFromHost('')).toBe('railway');
    expect(siteModeFromHost(null)).toBe('railway');
  });

  it('does not mistake a substring for the subdomain', () => {
    expect(siteModeFromHost('mycpwdsite.com')).toBe('railway'); // no cpwd. label
  });
});
