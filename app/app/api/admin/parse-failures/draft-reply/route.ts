import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { schemaQualified } from '@/lib/db-schema';
import { REPLY_TEMPLATES } from '@/lib/parse-failure-reply';
import { completeJson, aiProviderConfigured } from '@/lib/ai/llm-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Draft a reply to a parse failure with the AI.
 *
 * The ready-made templates answer the common cases. The rest need a sentence or two
 * about THIS file — "this is a Measurement Book, not the bill", "page 3 is a scan" —
 * and writing that from scratch is what turns a two-minute reply into tomorrow's. The
 * model gets the exact error, the file name, a sample of the PDF's own text and any
 * hint the admin typed, and returns a subject and body the admin edits before sending.
 * Nothing is sent from here.
 */
async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { role: true } });
  return user?.role === 'admin' || user?.role === 'superadmin' ? session : null;
}

const MAX_TEXT_SAMPLE = 3500;

export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  if (!aiProviderConfigured()) {
    return NextResponse.json({ error: 'AI is not configured on this server.' }, { status: 503 });
  }
  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);
  const hint = String(body?.hint || '').trim().slice(0, 600);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Which failure? Send an id.' }, { status: 400 });
  }

  const table = await schemaQualified('parse_failures');
  const rows = await prisma.$queryRawUnsafe<Array<{ userEmail: string | null; fileName: string | null; error: string; pdfBase64: string | null }>>(
    `SELECT "userEmail", "fileName", "error", "pdfBase64" FROM ${table} WHERE id = $1`, id);
  const failure = rows[0];
  if (!failure) return NextResponse.json({ error: 'No such failure.' }, { status: 404 });

  // What the PDF itself says, so the reply can name what the person actually sent
  // (a Measurement Book, an LOA, a scanned page) instead of guessing from the error.
  let textSample = '';
  let pageCount: number | null = null;
  if (failure.pdfBase64) {
    try {
      const { extractPositionedPdfPages } = await import('@/lib/pdf-layout-extract');
      const pages = await extractPositionedPdfPages(Buffer.from(failure.pdfBase64, 'base64'));
      pageCount = pages.length;
      textSample = pages
        .slice(0, 3)
        .map((page, i) => `--- page ${i + 1} ---\n` + page.items.map(item => item.text).join(' ').replace(/\s+/g, ' ').trim())
        .join('\n')
        .slice(0, MAX_TEXT_SAMPLE);
    } catch (err) {
      textSample = `(the PDF's text could not be extracted: ${(err as Error)?.message || err})`;
    }
  }

  // The error text carries the stamps of earlier replies; the model should see only
  // the reader's own message.
  const readerError = String(failure.error || '').split('\n').filter(line => !/REVIEW REQUESTED|REPLIED/.test(line)).join('\n').slice(0, 1500);

  const prompt = `You write short, plain-English support emails for IR-PVC (irpvc.in), a web app that reads Indian Railways IREPS running-account bill PDFs and works out the Price Variation Clause (PVC) amount.

Facts about the product you may rely on:
- The reader needs the ORIGINAL bill PDF downloaded from IRWCMS / IREPS (the "Signed Bill" or "RA Bill" PDF). It has real text in it and prints item rows with quantity, agreement rate and amount.
- A Measurement Book (MB), an LOA, a tender document, a deviation statement or a covering letter is not a bill and cannot be read as one.
- A scanned or screenshotted PDF has no text and can never be read. The way through is the spreadsheet: on the Create Bill page, under the upload button, "Bill is a scan, or made by hand?" gives a sheet with four columns (schedule, item number, quantity, rate) to fill and upload.
- Nothing is charged for an attempt that fails.
- Never promise a date or say "soon". Never invent facts about the file that the evidence below does not support.

Here are the house templates, for tone and length:
${REPLY_TEMPLATES.map(t => `[${t.label}]\n${t.body}`).join('\n\n')}

Now write a reply for THIS failure.
File name: ${failure.fileName || '(unnamed)'}
Pages: ${pageCount ?? 'unknown'}
Reader's error: ${readerError || '(none recorded)'}
${hint ? `What the admin wants to say (follow this): ${hint}\n` : ''}
Text found in the PDF (first pages, may be empty for a scan):
${textSample || '(no text)'}

Rules: 90 to 170 words. Start with "Thank you for sending this one over." Say in one or two sentences what the file is and why it could not be read, naming what you can see in it. Then say exactly what to do next. End with "— The IR-PVC team". No placeholders, no markdown, no bullet points. Blank lines between paragraphs.

Return ONLY raw JSON (no code fences): {"subject": "...", "body": "..."}. The subject ends with " — IR-PVC".`;

  try {
    const completion = await completeJson({ operation: 'parse-failure-reply', prompt, maxTokens: 900 });
    const raw = completion.content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(raw);
    const subject = String(parsed?.subject || '').trim();
    const draft = String(parsed?.body || '').trim();
    if (!draft) throw new Error('The model returned no body.');
    return NextResponse.json({
      subject: subject || 'About your bill — IR-PVC',
      body: draft,
      model: completion.model,
      sawPdfText: textSample.length > 0 && !textSample.startsWith('('),
    });
  } catch (err: any) {
    console.error('parse-failures draft-reply failed:', err);
    return NextResponse.json({ error: `Could not draft a reply: ${err?.message || 'unknown error'}` }, { status: 502 });
  }
}
