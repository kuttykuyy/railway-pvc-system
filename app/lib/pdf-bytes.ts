/**
 * Is this actually a PDF?
 *
 * Every PDF file begins with the five bytes "%PDF-". The check exists because a fetch
 * that answers 200 with an HTML page — a wrong host, a login redirect, an error page —
 * used to be relabelled application/pdf and handed to WhatsApp, which is an attachment
 * that downloads and then will not open. Nothing logged it, so "the PDF is corrupted"
 * was the only symptom anyone had to go on.
 *
 * Deliberately only the magic bytes: this is a guard against the wrong KIND of thing,
 * not a validity check on the PDF itself.
 */
export function looksLikePdf(bytes: ArrayBuffer | Buffer | Uint8Array): boolean {
  const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(
    bytes.buffer, bytes.byteOffset, bytes.byteLength,
  );
  if (view.byteLength < 5) return false;
  // "%PDF-"
  return view[0] === 0x25 && view[1] === 0x50 && view[2] === 0x44 && view[3] === 0x46 && view[4] === 0x2d;
}

/** The opening bytes as readable text, for a log line that says what arrived instead. */
export function describeNonPdf(bytes: ArrayBuffer | Buffer | Uint8Array, limit = 200): string {
  const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(
    bytes.buffer, bytes.byteOffset, bytes.byteLength,
  );
  if (view.byteLength === 0) return '(empty response)';
  return Buffer.from(view.slice(0, limit)).toString('utf8').replace(/\s+/g, ' ').trim();
}
