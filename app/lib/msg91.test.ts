import { describe, expect, it } from 'vitest';
import { toMsg91Mobile, buildMsg91Payload, readMsg91Response } from './msg91';

const config = { authKey: 'k', templateId: 't1', otpVariable: 'otp' };

describe('toMsg91Mobile', () => {
  it('sends digits with the country code and no plus, however it was typed', () => {
    for (const typed of ['9876543210', '+919876543210', '919876543210', '+91 98765 43210']) {
      expect(toMsg91Mobile(typed)).toBe('919876543210');
    }
  });

  it('refuses what is not a usable number rather than sending it', () => {
    expect(toMsg91Mobile('12345')).toBeNull();
    expect(toMsg91Mobile('')).toBeNull();
  });
});

describe('buildMsg91Payload', () => {
  it('puts the code under the template variable name', () => {
    const payload = buildMsg91Payload(config, '919876543210', '123456');
    expect(payload.recipients[0]).toEqual({ mobiles: '919876543210', otp: '123456' });
    expect(payload.template_id).toBe('t1');
  });

  it('honours a template whose variable is named something else', () => {
    const payload = buildMsg91Payload({ ...config, otpVariable: 'var1' }, '91987', '999999');
    expect(payload.recipients[0]).toEqual({ mobiles: '91987', var1: '999999' });
  });

  it('asks for the real outcome, not an acknowledgement', () => {
    // A queued message later refused, reported as success, leaves somebody waiting for
    // a code that was never going to arrive.
    expect(buildMsg91Payload(config, '91987', '1').realTimeResponse).toBe('1');
  });
});

describe('readMsg91Response', () => {
  it('accepts only an explicit success', () => {
    expect(readMsg91Response({ type: 'success', message: 'abc123' })).toEqual({ ok: true, detail: 'abc123' });
  });

  it('reports the provider’s own words on an error', () => {
    expect(readMsg91Response({ type: 'error', message: 'Template not approved' }))
      .toEqual({ ok: false, detail: 'Template not approved' });
  });

  it('does not assume success from a shape it does not recognise', () => {
    const verdict = readMsg91Response({ something: 'else' });
    expect(verdict.ok).toBe(false);
    expect(verdict.detail).toMatch(/Unexpected reply/);
  });

  it('survives a body that is not an object at all', () => {
    expect(readMsg91Response(null).ok).toBe(false);
    expect(readMsg91Response('boom').ok).toBe(false);
  });
});
