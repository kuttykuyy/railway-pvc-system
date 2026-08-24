import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { schemaQualified } from '@/lib/db-schema';
import {
  REPLY_TEMPLATES, parseFailureReplyHtml, replyStamp,
  wasReviewRequested, wasReplied, lastReplyText,
} from '@/lib/parse-failure-reply';

export const dynamic = 'force-dynamic';

/** The collected reader failures: list without the PDFs, download one, delete one. */
async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });
  return user?.role === 'admin' || user?.role === 'superadmin' ? session : null;
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  const table = await schemaQualified('parse_failures').catch(() => null);
  if (!table) {
    return NextResponse.json({ failures: [], note: 'Apply Pending DB Changes to create the table.' });
  }
  const id = new URL(request.url).searchParams.get('id');
  if (id) {
    const rows = await prisma.$queryRawUnsafe<Array<{ pdfBase64: string | null; fileName: string | null }>>(
      `SELECT "pdfBase64", "fileName" FROM ${table} WHERE id = $1`, Number(id));
    if (!rows[0]?.pdfBase64) return NextResponse.json({ error: 'No PDF stored for this failure' }, { status: 404 });
    return new NextResponse(new Uint8Array(Buffer.from(rows[0].pdfBase64, 'base64')), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${(rows[0].fileName || `failure-${id}.pdf`).replace(/[^A-Za-z0-9._-]+/g, '_')}"`,
      },
    });
  }
  // The list never ships the PDFs — a page of failures is filenames and errors, not
  // a hundred megabytes of base64.
  const failures = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT id, "createdAt", "userEmail", "fileName", "error",
            ("pdfBase64" IS NOT NULL) AS "hasPdf"
     FROM ${table} ORDER BY "createdAt" DESC LIMIT 100`);
  // Who is waiting, and who has been answered — read off the stamps in the error text,
  // so the page can put the unanswered ones first instead of leaving somebody to spot
  // them by eye.
  return NextResponse.json({
    // The ready-made answers travel with the list, so the page does not keep its own
    // copy of wording that would then drift from the one actually sent.
    templates: REPLY_TEMPLATES,
    failures: failures.map(f => ({
      ...f,
      id: Number(f.id),
      reviewRequested: wasReviewRequested(f.error as string),
      replied: wasReplied(f.error as string),
      lastReply: lastReplyText(f.error as string),
    })),
  });
}

export async function DELETE(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const table = await schemaQualified('parse_failures');
  await prisma.$executeRawUnsafe(`DELETE FROM ${table} WHERE id = $1`, Number(id));
  return NextResponse.json({ ok: true });
}

/**
 * Reply to somebody who asked for their bill to be looked at.
 *
 * Sends the email, then stamps the failure row with what was said and when. The stamp is
 * the point as much as the email: without it there is no record of who has been answered,
 * and the ones that fall through are exactly the ones nobody remembers.
 *
 * The email is sent FIRST and the stamp only if it went. A row marked replied when
 * nothing arrived is worse than no mark at all — it is a promise the list makes to you
 * that the person never received.
 */
export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);
  const message = String(body?.message || '').trim();
  const subject = String(body?.subject || '').trim() || 'About your bill — IR-PVC';
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Which failure? Send an id.' }, { status: 400 });
  }
  if (message.length < 10) {
    return NextResponse.json({ error: 'Write something to send — at least a sentence.' }, { status: 400 });
  }

  const table = await schemaQualified('parse_failures');
  const rows = await prisma.$queryRawUnsafe<Array<{ userEmail: string | null; fileName: string | null }>>(
    `SELECT "userEmail", "fileName" FROM ${table} WHERE id = $1`, id);
  const failure = rows[0];
  if (!failure) return NextResponse.json({ error: 'No such failure.' }, { status: 404 });
  if (!failure.userEmail) {
    return NextResponse.json(
      { error: 'That failure has no email address on it — there is nobody to reply to.' },
      { status: 400 },
    );
  }

  try {
    const { resend } = await import('@/lib/resend');
    const { error } = await resend.emails.send({
      from: 'IR-PVC <noreply@irpvc.in>',
      to: failure.userEmail,
      subject,
      html: parseFailureReplyHtml({ message, fileName: failure.fileName }),
    });
    if (error) throw new Error(typeof error === 'string' ? error : (error as any).message || 'send failed');
  } catch (err: any) {
    console.error('parse-failures reply: could not send', err);
    return NextResponse.json(
      { error: `The email could not be sent: ${err?.message || 'unknown error'}. Nothing was marked as replied.` },
      { status: 502 },
    );
  }

  const by = session.user?.email || 'admin';
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE ${table} SET "error" = "error" || $1 WHERE id = $2`,
      replyStamp(message, new Date(), by), id);
  } catch (err) {
    // The person HAS been answered; only our own record of it failed. Say so rather
    // than reporting a failure that would have the admin write to them twice.
    console.error('parse-failures reply: sent, but could not stamp the row', err);
    return NextResponse.json({ ok: true, stamped: false, sentTo: failure.userEmail });
  }

  return NextResponse.json({ ok: true, stamped: true, sentTo: failure.userEmail });
}
