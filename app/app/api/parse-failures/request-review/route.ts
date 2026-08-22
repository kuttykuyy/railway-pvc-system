/**
 * "Ask IR-PVC to check this bill" — the one-click version of "please send us the PDF".
 *
 * The PDF is already kept: every reader failure lands in parse_failures with the file
 * and the exact error the moment it happens. What was missing was the person's voice —
 * a way to say "this one matters to me, please look" without finding an email address.
 * This marks the latest failure for this user and file as review-requested (a line
 * appended to its error text: no new column, so no DDL to ship) and pings the admin.
 *
 * Never fails the user over bookkeeping: if the row cannot be found or the table is not
 * there, the admin is still pinged with everything needed, and the user still hears
 * "sent".
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { schemaQualified } from '@/lib/db-schema';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userEmail = session.user.email;

  const body = await request.json().catch(() => ({}));
  const fileName = typeof body.fileName === 'string' && body.fileName.trim() ? body.fileName.trim().slice(0, 300) : null;
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 2000) : '';
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';

  let marked = false;
  try {
    const table = await schemaQualified('parse_failures');
    const stamp = `\n\n🙋 REVIEW REQUESTED by the user at ${new Date().toISOString()}${note ? ` — "${note}"` : ''}`;
    // The latest failure by this user for this file (or their latest failure at all,
    // when the file name did not travel with the request).
    const updated: number = await prisma.$executeRawUnsafe(
      `UPDATE ${table} SET "error" = "error" || $1
         WHERE "id" = (
           SELECT "id" FROM ${table}
            WHERE "userEmail" = $2 AND ($3::text IS NULL OR "fileName" = $3)
            ORDER BY "createdAt" DESC LIMIT 1
         )`,
      stamp,
      userEmail,
      fileName,
    );
    marked = updated > 0;
  } catch (err) {
    console.error('request-review: could not mark the failure row:', err);
  }

  try {
    const { notifyTelegramAdmin } = await import('@/lib/telegram-api');
    await notifyTelegramAdmin(
      `🙋 A user asks for a bill to be checked\nUser: ${userEmail}\nFile: ${fileName || '(unnamed)'}`
        + (note ? `\nNote: ${note}` : '')
        + (reason ? `\nReader said: ${reason.slice(0, 400)}` : '')
        + `\n\n${marked ? 'The PDF is saved under Admin → Parse Failures (marked REVIEW REQUESTED).' : 'No stored failure row matched — check Admin → Parse Failures for the latest from this user.'}`,
    );
  } catch (err) {
    console.error('request-review: telegram alert failed:', err);
  }

  return NextResponse.json({ ok: true, marked });
}
