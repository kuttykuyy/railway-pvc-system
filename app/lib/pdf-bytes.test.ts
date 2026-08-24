import { describe, expect, it } from 'vitest';
import { looksLikePdf, describeNonPdf } from './pdf-bytes';

describe('looksLikePdf', () => {
  it('accepts a real PDF header', () => {
    expect(looksLikePdf(Buffer.from('%PDF-1.7\n%âãÏÓ', 'latin1'))).toBe(true);
  });

  it('rejects the HTML page a wrong host answers with', () => {
    const html = Buffer.from('<!DOCTYPE html><html><head><title>Sign in</title>');
    expect(looksLikePdf(html)).toBe(false);
    expect(describeNonPdf(html)).toMatch(/DOCTYPE html/);
  });

  it('rejects a JSON error body served with a 200', () => {
    expect(looksLikePdf(Buffer.from('{"error":"Authentication required"}'))).toBe(false);
  });

  it('rejects an empty response and says so', () => {
    expect(looksLikePdf(Buffer.alloc(0))).toBe(false);
    expect(describeNonPdf(Buffer.alloc(0))).toBe('(empty response)');
  });

  it('rejects something shorter than the header itself', () => {
    expect(looksLikePdf(Buffer.from('%PDF'))).toBe(false);
  });

  it('works on an ArrayBuffer, which is what fetch hands back', () => {
    const buf = Buffer.from('%PDF-1.4');
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    expect(looksLikePdf(ab)).toBe(true);
  });
});
