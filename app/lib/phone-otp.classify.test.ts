import { describe, expect, it } from 'vitest';
import { classifyOtpDeliveryFailure } from './otp-failure-kind';

describe('classifyOtpDeliveryFailure', () => {
  it('recognises the provider-side failures the breaker exists for', () => {
    expect(classifyOtpDeliveryFailure('(#132001) Template name does not exist in the translation')).toBe('provider');
    expect(classifyOtpDeliveryFailure('WhatsApp API not configured')).toBe('provider');
    expect(classifyOtpDeliveryFailure('MSG91 returned 502: Bad Gateway')).toBe('provider');
    expect(classifyOtpDeliveryFailure('fetch failed')).toBe('provider');
    expect(classifyOtpDeliveryFailure('Unauthorized')).toBe('provider');
  });

  it('treats a number the provider will not deliver to as that number\'s problem', () => {
    expect(classifyOtpDeliveryFailure('Not a usable mobile number: +4479')).toBe('recipient');
    expect(classifyOtpDeliveryFailure('(#131026) Message undeliverable')).toBe('recipient');
    expect(classifyOtpDeliveryFailure('Invalid phone number')).toBe('recipient');
    expect(classifyOtpDeliveryFailure('Recipient is not a valid WhatsApp user')).toBe('recipient');
  });

  it('fails closed on anything it does not recognise', () => {
    expect(classifyOtpDeliveryFailure('Failed to send OTP')).toBe('unknown');
    expect(classifyOtpDeliveryFailure(undefined)).toBe('unknown');
  });
});
