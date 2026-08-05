/**
 * Tells a bill's owner, on WhatsApp, when the provisional indices their bill was
 * calculated on have been published as final — so the bill can be regenerated.
 *
 * Runs after the WPI and PPAC imports so it sees whatever they brought in, and picks up
 * indices entered by hand (steel fortnightlies, labour) just the same, because it reads
 * the resulting status rather than watching any one importer.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. A manual trigger with
 * `?secret=<CRON_SECRET>` is also accepted. Fails closed if CRON_SECRET is unset.
 *
 * Sends nothing on a dry run (`?dryRun=1`), which is how to see who would be messaged
 * before letting it loose.
 */

import { NextRequest, NextResponse } from 'next/server';
import { findBillsWithNewlyFinalIndices, groupByOwner } from '@/lib/final-indices-alert';
import { sendTextTemplateWhatsApp, validatePhoneNumber } from '@/lib/whatsapp-mydreams';
import { formatTemplateParams } from '@/lib/whatsapp-templates';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed
  if (request.headers.get('authorization') === `Bearer ${secret}`) return true;
  return request.nextUrl.searchParams.get('secret') === secret;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';

  try {
    const affected = await findBillsWithNewlyFinalIndices();
    const byOwner = groupByOwner(affected);

    const results: Array<{ owner: string; bills: number; sent: boolean; reason?: string }> = [];

    for (const [ownerId, bills] of byOwner) {
      const first = bills[0];
      const phone = first.ownerPhone;

      if (!phone || !validatePhoneNumber(phone)) {
        results.push({ owner: ownerId, bills: bills.length, sent: false, reason: 'no usable WhatsApp number' });
        continue;
      }

      // Name the indices once, not once per bill — the owner cares which figures moved,
      // not that three bills each list the same four.
      const indexNames = Array.from(new Set(bills.flatMap(b => b.finalisedIndices))).slice(0, 4).join(', ');
      const params = formatTemplateParams('pvc_indices_final', {
        userName: first.ownerName,
        billCount: String(bills.length),
        agreementNo: first.agreementNo,
        indexNames: indexNames || 'all indices',
      });

      if (dryRun) {
        results.push({ owner: ownerId, bills: bills.length, sent: false, reason: 'dry run' });
        continue;
      }

      const sent = await sendTextTemplateWhatsApp({
        contact: phone,
        template: 'pvc_indices_final',
        params,
      });
      results.push({
        owner: ownerId,
        bills: bills.length,
        sent: sent.success,
        reason: sent.success ? undefined : sent.error,
      });
    }

    return NextResponse.json({
      success: true,
      dryRun,
      billsAffected: affected.length,
      ownersNotified: results.filter(r => r.sent).length,
      results,
    });
  } catch (error: any) {
    console.error('[final-indices-alert] failed:', error);
    return NextResponse.json({ error: error?.message || 'Alert run failed' }, { status: 500 });
  }
}
