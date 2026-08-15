/**
 * ONE-OFF admin tool — delete after the send.
 *
 * Emails the contractors who set up a contract, never made a bill, and still have their
 * free one unused. Written as an endpoint rather than a script because the mail
 * credentials live only in production.
 *
 * GET                     — dry run: exactly who would be written to, and the rendered
 *                           text for the first of them. Sends nothing.
 * GET ?send=SEND-NOW      — sends, once, and reports the result for each address.
 * GET ?only=<email>       — restrict to one address, for retrying a single failure
 *                           without writing to anyone who already received it.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

// Excluded by hand: the owner's own accounts and the test account.
const OWN_ACCOUNTS = ['30prasath93@gmail.com', 'sithudotgamer@gmail.com', 'admin@illall.in', 'sithuown@gmail.com', 'pk@illall.in'];

interface Recipient {
  email: string;
  name: string;
  agreementNo: string;
  addedOn: string;
}

function renderEmail(r: Recipient) {
  const subject = 'Your first PVC report on irpvc.in is free';
  const text =
`Hello ${r.name},

You set up ${r.agreementNo} on irpvc.in on ${r.addedOn}, but haven't made a bill against it yet.

Your first PVC report is free — no credits needed. Upload the signed bill PDF and the report is calculated and ready to download in a couple of minutes.

If you tried and something didn't work, just reply and tell me what happened — I'll fix it.

Prasath
irpvc.in`;

  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#222;line-height:1.6">
  <p>Hello ${r.name},</p>
  <p>You set up <strong>${r.agreementNo}</strong> on irpvc.in on ${r.addedOn}, but haven't made a bill against it yet.</p>
  <p><strong>Your first PVC report is free</strong> — no credits needed. Upload the signed bill PDF and the report is calculated and ready to download in a couple of minutes.</p>
  <p style="margin:22px 0"><a href="https://irpvc.in/bills/new" style="background:#059669;color:#fff;padding:11px 20px;border-radius:7px;text-decoration:none">Upload your bill</a></p>
  <p>If you tried and something didn't work, just reply and tell me what happened — I'll fix it.</p>
  <p style="margin-top:22px">Prasath<br><a href="https://irpvc.in" style="color:#059669">irpvc.in</a></p>
</div>`;
  return { subject, text, html };
}

async function recipients(): Promise<Recipient[]> {
  const contracts = await prisma.contract.findMany({
    where: {
      bills: { none: {} },
      user: {
        role: 'contractor',
        freeTrialUsed: 0,
        email: { notIn: OWN_ACCOUNTS },
      },
    },
    select: {
      agreementNo: true,
      createdAt: true,
      user: { select: { email: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const byEmail = new Map<string, Recipient>();
  for (const c of contracts) {
    const email = (c.user?.email || '').trim().toLowerCase();
    // Throwaway signups: a disposable domain, no real person behind it.
    if (!email || email.endsWith('@googxs.com')) continue;
    if (byEmail.has(email)) continue; // one message per person, their first contract
    byEmail.set(email, {
      email,
      name: (c.user?.name || '').trim() || 'there',
      agreementNo: c.agreementNo,
      addedOn: new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
    });
  }
  return [...byEmail.values()];
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const viewer = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });
  if (viewer?.role !== 'admin' && viewer?.role !== 'superadmin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const only = (request.nextUrl.searchParams.get('only') || '').trim().toLowerCase();
  const all = await recipients();
  const list = only ? all.filter(r => r.email === only) : all;
  const send = request.nextUrl.searchParams.get('send') === 'SEND-NOW';

  if (only && list.length === 0) {
    return NextResponse.json(
      { error: `No pending recipient matches "${only}".`, known: all.map(r => r.email) },
      { status: 404 },
    );
  }

  if (!send) {
    return NextResponse.json({
      mode: 'DRY RUN — nothing sent',
      count: list.length,
      recipients: list,
      preview: list.length ? renderEmail(list[0]) : null,
      toSend: 'add ?send=SEND-NOW to this URL',
    });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'RESEND_API_KEY is not configured' }, { status: 503 });
  const resend = new Resend(apiKey);

  const results: Array<{ email: string; sent: boolean; error?: string }> = [];
  let first = true;
  for (const r of list) {
    // Resend allows 10 sends a second, and an unpaced loop hit that ceiling on the
    // eleventh address — the message simply did not go. A fifth of a second between
    // sends keeps it well under, and eleven emails are in no hurry.
    if (!first) await new Promise(resolve => setTimeout(resolve, 200));
    first = false;
    const { subject, text, html } = renderEmail(r);
    try {
      const { error } = await resend.emails.send({
        from: 'Prasath — IR-PVC <noreply@irpvc.in>',
        replyTo: 'admin@illall.in',
        to: r.email,
        subject,
        text,
        html,
      });
      if (error) throw new Error((error as any)?.message || JSON.stringify(error));
      results.push({ email: r.email, sent: true });
    } catch (e: any) {
      results.push({ email: r.email, sent: false, error: String(e?.message || e).slice(0, 160) });
    }
  }

  return NextResponse.json({
    mode: 'SENT',
    attempted: results.length,
    delivered: results.filter(r => r.sent).length,
    failed: results.filter(r => !r.sent),
    results,
  });
}
