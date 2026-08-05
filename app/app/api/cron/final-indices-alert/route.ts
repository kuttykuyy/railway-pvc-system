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
import { recalculateBillPvc } from '@/lib/recalculate-bill-pvc';

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

    // Refresh the drafts. A draft has been sent to nobody, so its provisional figure was
    // only ever a placeholder and replacing it costs nothing. Anything submitted or
    // approved is left exactly as it is: the paper is already with the accounts office,
    // and quietly changing the amount underneath it is how a proposal and its statement
    // come to disagree. Those keep the Regenerate button, to be applied deliberately.
    const recalculated: Array<{ billNo: string; from: number; to: number }> = [];
    let draftsProcessed = 0;
    let draftsFailed = 0;
    if (!dryRun) {
      for (const bill of affected.filter(b => b.status === 'draft')) {
        try {
          const before = bill.totalPvc;
          const result = await recalculateBillPvc(bill.billId);
          const after = result.pvcCalculation?.totalPvc ?? before;
          draftsProcessed += 1;
          if (Math.abs(after - before) >= 0.01) {
            recalculated.push({ billNo: bill.billNo, from: before, to: after });
          }
        } catch (err) {
          // One bad bill must not stop the sweep — the rest still need refreshing.
          draftsFailed += 1;
          console.error(`[final-indices-alert] could not recalculate ${bill.billNo}:`, err);
        }
      }
    }

    const byOwner = groupByOwner(affected);
    const results: Array<{ owner: string; ownerName: string; bills: number; sent: boolean; reason?: string }> = [];

    for (const [ownerId, bills] of byOwner) {
      const first = bills[0];
      const phone = first.ownerPhone;

      if (!phone || !validatePhoneNumber(phone)) {
        results.push({ owner: ownerId, ownerName: first.ownerName, bills: bills.length, sent: false, reason: 'no usable WhatsApp number' });
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
        results.push({ owner: ownerId, ownerName: first.ownerName, bills: bills.length, sent: false, reason: 'dry run' });
        continue;
      }

      const sent = await sendTextTemplateWhatsApp({
        contact: phone,
        template: 'pvc_indices_final',
        params,
      });
      results.push({
        owner: ownerId,
        ownerName: first.ownerName,
        bills: bills.length,
        sent: sent.success,
        reason: sent.success ? undefined : sent.error,
      });
    }

    return NextResponse.json({
      success: true,
      dryRun,
      billsAffected: affected.length,
      // Recalculated vs actually moved. Reporting only the movements read as though the
      // other bills had been skipped, when in fact they were recomputed and came out the
      // same — which is the normal case once an index is republished unchanged.
      draftsRecalculated: draftsProcessed,
      draftsChanged: recalculated.length,
      draftsFailed,
      // On a dry run nothing is recalculated, so list what a live run would touch —
      // otherwise the output is a count with nothing to verify it against.
      wouldRefresh: dryRun
        ? affected.filter(b => b.status === 'draft').map(b => ({
          billNo: b.billNo,
          agreementNo: b.agreementNo,
          quarter: b.quarter,
          currentPvc: b.totalPvc,
        }))
        : undefined,
      // Named individually: a sweep that rewrites amounts unattended should leave a record
      // of exactly which, and from what to what.
      changes: recalculated,
      awaitingDecision: affected.filter(b => b.status !== 'draft').map(b => ({
        billNo: b.billNo, agreementNo: b.agreementNo, status: b.status, currentPvc: b.totalPvc,
      })),
      ownersNotified: results.filter(r => r.sent).length,
      results,
    });
  } catch (error: any) {
    console.error('[final-indices-alert] failed:', error);
    return NextResponse.json({ error: error?.message || 'Alert run failed' }, { status: 500 });
  }
}
