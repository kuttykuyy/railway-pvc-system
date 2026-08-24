import { describe, expect, it } from 'vitest';
import {
  REPLY_TEMPLATES, parseFailureReplyHtml, replyStamp,
  wasReviewRequested, wasReplied, lastReplyText,
} from './parse-failure-reply';

describe('REPLY_TEMPLATES', () => {
  it('offers the two answers nearly every case needs', () => {
    expect(REPLY_TEMPLATES.map(t => t.key)).toEqual(['fixed', 'scan']);
    for (const template of REPLY_TEMPLATES) {
      expect(template.subject.length).toBeGreaterThan(10);
      expect(template.body.length).toBeGreaterThan(80);
    }
  });

  it('sends someone with a scan to the spreadsheet, by name', () => {
    const scan = REPLY_TEMPLATES.find(t => t.key === 'scan')!;
    expect(scan.body).toMatch(/spreadsheet/i);
    expect(scan.body).toMatch(/schedule, item number, quantity and rate/i);
  });

  it('promises no dates — a reply that says "soon" and goes quiet is worse than silence', () => {
    for (const template of REPLY_TEMPLATES) {
      expect(template.body).not.toMatch(/\b(soon|shortly|within \d|by (monday|tomorrow|next))\b/i);
    }
  });
});

describe('parseFailureReplyHtml', () => {
  it('names the bill, so somebody with three open cases knows which this answers', () => {
    const html = parseFailureReplyHtml({ message: 'Fixed.', fileName: '17_CC_Kashi.pdf' });
    expect(html).toContain('17_CC_Kashi.pdf');
  });

  it('leaves the file line out when there is no file name', () => {
    // The colon: the page title is also "About your bill", and matching that would
    // have passed this test while the line was still there.
    expect(parseFailureReplyHtml({ message: 'Fixed.', fileName: null })).not.toContain('About your bill:');
  });

  it('keeps paragraphs as paragraphs', () => {
    const html = parseFailureReplyHtml({ message: 'One.\n\nTwo.' });
    expect(html.match(/<p style="font-size:16px/g)).toHaveLength(2);
  });

  it('escapes what the admin typed — it goes straight into the markup', () => {
    const html = parseFailureReplyHtml({ message: '<script>alert(1)</script>', fileName: '"><b>x' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;&gt;&lt;b&gt;x');
  });
});

describe('the stamps on the failure row', () => {
  it('sees a review request', () => {
    expect(wasReviewRequested('boom\n\n🙋 REVIEW REQUESTED by the user at 2026-01-01')).toBe(true);
    expect(wasReviewRequested('boom')).toBe(false);
    expect(wasReviewRequested(null)).toBe(false);
  });

  it('sees a reply, and reads back what was said', () => {
    const error = 'boom' + replyStamp('We have taught the reader this layout.', new Date('2026-08-24T10:00:00Z'), 'admin@irpvc.in');
    expect(wasReplied(error)).toBe(true);
    expect(lastReplyText(error)).toBe('We have taught the reader this layout.');
  });

  it('reads back the LAST reply when there have been several', () => {
    let error = 'boom';
    error += replyStamp('First answer.', new Date('2026-08-24T10:00:00Z'), 'a@b.c');
    error += replyStamp('Second answer.', new Date('2026-08-25T10:00:00Z'), 'a@b.c');
    expect(lastReplyText(error)).toBe('Second answer.');
  });

  it('has nothing to read back when nobody has replied', () => {
    expect(lastReplyText('boom')).toBeNull();
    expect(wasReplied('boom')).toBe(false);
  });

  it('flattens a multi-line reply into the stamp', () => {
    const stamp = replyStamp('Line one.\n\nLine two.', new Date('2026-08-24T10:00:00Z'), 'a@b.c');
    expect(stamp).not.toContain('\n\nLine two');
    expect(stamp).toContain('Line one. Line two.');
  });
});
