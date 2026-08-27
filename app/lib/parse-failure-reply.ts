/**
 * Answering someone who asked for their bill to be looked at.
 *
 * The asking already worked: a failed read keeps the PDF, stamps the row when the person
 * presses "Ask IR-PVC to check this bill", and pings the admin on Telegram. What was
 * missing was the other half. They were told "Request sent — we'll look at it" and then
 * heard nothing, ever, because there was no way to reply from inside the app at all.
 *
 * Almost every answer is one of a few, so they are written out ready. The interesting
 * ones are the last two: a no-text PDF is never going to be readable as it stands, and the
 * honest reply is not "we are working on it" but either "download the real file from
 * IRWCMS" (when the bill exists there digitally) or "here is the spreadsheet, you can do
 * it now" (when all they have is a scan on paper).
 *
 * The stamps live in the failure row's own error text — appended, the same trick the
 * review request uses — so there is no column to ship and no migration to wait for.
 */

/** Marks appended to a failure's error text. Also how the page tells the state. */
const REVIEW_MARK = '🙋 REVIEW REQUESTED';
const REPLY_MARK = '✉️ REPLIED';

export interface ReplyTemplate {
  key: string;
  /** What the admin sees on the button. */
  label: string;
  subject: string;
  body: string;
}

/**
 * Written to be sent as they stand. Each says what happened, what the person should do
 * now, and does not promise a date — a reply that promises "soon" and then goes quiet is
 * worse than the silence it replaced.
 */
export const REPLY_TEMPLATES: ReplyTemplate[] = [
  {
    key: 'fixed',
    label: 'Reader now handles it',
    subject: 'Your bill can be read now — IR-PVC',
    body:
      'Thank you for sending this one over. We have taught the reader your bill\'s layout, '
      + 'so it should go through now.\n\n'
      + 'Please upload the same PDF again on the Create Bill page. Nothing was charged for '
      + 'the attempt that failed.',
  },
  {
    key: 'irwcms',
    label: 'Download the PDF from IRWCMS',
    subject: 'Your bill needs the original PDF — IR-PVC',
    body:
      'Thank you for sending this one over. This PDF has no readable text in it — the '
      + 'numbers are part of a picture, not text — so the reader has nothing to work with. '
      + 'This usually happens when a bill is printed to PDF, screenshotted, or scanned.\n\n'
      + 'The quick fix: open the bill in IRWCMS and download the original PDF using its own '
      + 'download / save option, then upload that file. That version has real text in it and '
      + 'goes through straight away.\n\n'
      + 'Please do not re-print, screenshot, or scan it first — that turns the text back into '
      + 'a picture. Nothing was charged for the attempt that failed.',
  },
  {
    key: 'scan',
    label: 'It is a scan — use the spreadsheet',
    subject: 'Your bill is a scan — here is the quickest way through',
    body:
      'Thank you for sending this one over. Your bill is a scan — a picture of the pages '
      + 'rather than a document with text in it — so there is nothing for the reader to '
      + 'read, and that will not change however we improve it.\n\n'
      + 'There is a faster way. On the Create Bill page, under the upload button, there is '
      + '"Bill is a scan, or made by hand?". Download the spreadsheet from there and fill '
      + 'in four columns: schedule, item number, quantity and rate. That is all — the '
      + 'description comes from the schedule of rates and the amount is quantity x rate.\n\n'
      + 'Upload the filled spreadsheet in the same place and your bill fills itself in. '
      + 'Check the items on screen before you create it.',
  },
];

/** HTML-safe: an admin's reply and a file name both end up inside the markup. */
function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The reply email. Plain on purpose — this is a person answering, not a campaign. */
export function parseFailureReplyHtml(args: { message: string; fileName?: string | null }): string {
  const paragraphs = String(args.message || '')
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => `<p style="font-size:16px; line-height:25px; color:#334155; margin:16px 0;">${escapeHtml(part).replace(/\n/g, '<br>')}</p>`)
    .join('');

  // Naming the file matters: somebody who sent three bills in a week cannot otherwise
  // tell which one this answers.
  const about = args.fileName
    ? `<p style="font-size:14px; line-height:21px; color:#64748b; margin:0 0 8px;">About your bill: <strong style="color:#0f172a;">${escapeHtml(args.fileName)}</strong></p>`
    : '';

  return `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><title>About your bill</title></head>
  <body style="background-color:#f6f9fc; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; margin:0; padding:0;">
    <div style="background-color:#ffffff; margin:48px auto; max-width:580px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.05); overflow:hidden;">
      <div style="background-color:#1e40af; padding:22px 32px;">
        <h1 style="font-size:20px; font-weight:bold; color:#ffffff; margin:0;">IR-PVC</h1>
      </div>
      <div style="padding:24px 32px 8px;">
        ${about}
        ${paragraphs}
      </div>
      <div style="padding:8px 32px 28px;">
        <hr style="border:none; border-top:1px solid #e5e7eb; margin:16px 0;">
        <p style="font-size:13px; line-height:20px; color:#94a3b8; margin:0;">
          You are receiving this because you asked us to check a bill on
          <a href="https://www.irpvc.in" style="color:#64748b;">irpvc.in</a>.
          Reply to this email if it still is not right.
        </p>
      </div>
    </div>
  </body>
</html>`;
}

/** The line appended to the failure's error text when a reply goes out. */
export function replyStamp(message: string, at: Date, by: string): string {
  const oneLine = String(message || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  return `\n\n${REPLY_MARK} by ${by} at ${at.toISOString()} — "${oneLine}"`;
}

/** Did this person ask for it to be looked at? */
export function wasReviewRequested(errorText: string | null | undefined): boolean {
  return String(errorText || '').includes(REVIEW_MARK);
}

/** Have they been answered? */
export function wasReplied(errorText: string | null | undefined): boolean {
  return String(errorText || '').includes(REPLY_MARK);
}

/** What was said to them last, for the admin list. */
export function lastReplyText(errorText: string | null | undefined): string | null {
  const parts = String(errorText || '').split(REPLY_MARK);
  if (parts.length < 2) return null;
  const tail = parts[parts.length - 1];
  const quoted = tail.match(/—\s*"([\s\S]*?)"\s*$/);
  return quoted ? quoted[1] : tail.trim() || null;
}
