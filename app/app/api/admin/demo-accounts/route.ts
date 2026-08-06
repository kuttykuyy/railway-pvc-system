/**
 * Admin-only helper to create the two department demo accounts — one executive, one
 * accounts/audit — so the approval chain can be walked end to end without hunting for
 * official railway email addresses.
 *
 * Deliberate constraints, because this creates accounts that can see and act on other
 * people's bills:
 *   - Admin session required, like every other route under /api/admin.
 *   - Fixed email addresses and roles. Nothing about who or what is created comes from
 *     the request, so there is no way to mint an arbitrary privileged account with it.
 *   - Passwords are generated here, never stored in the repo, and returned ONCE in the
 *     response. Only the bcrypt hash goes to the database.
 *   - Both accounts are scoped to a zone the caller names, so they see one division's
 *     bills and no more.
 *   - DELETE removes them again, so a demo leaves nothing behind.
 *
 * Re-running POST resets the passwords and returns fresh ones; it never creates a
 * second copy.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { validateAdminAccess } from '@/lib/role-auth';
import { RAILWAY_ZONE_STEEL_CITY_MAP } from '@/lib/zone-steel-city-mapping';
import { generateUniqueReferralCode } from '@/lib/referrals';

export const dynamic = 'force-dynamic';

const DEMO_ACCOUNTS = [
  {
    email: 'demo.executive@irpvc.in',
    name: 'Demo Executive (Sr.DEN)',
    role: 'railway_official',
    what: 'Approves a submitted bill, or sends it back for revision.',
  },
  {
    email: 'demo.accounts@irpvc.in',
    name: 'Demo Accounts / Audit',
    role: 'accounts_official',
    what: 'Vets an approved proposal and passes it for payment, or returns it.',
  },
] as const;

/** A password that satisfies the app's own strength rules and is safe to read aloud once. */
function generatePassword(): string {
  // base64url of 12 bytes, plus a fixed pattern guaranteeing the character classes the
  // signup validator asks for. Random enough that it is never guessable from the code.
  return `Ir${randomBytes(9).toString('base64url')}#7`;
}

export async function GET(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });

  const existing = await prisma.user.findMany({
    where: { email: { in: DEMO_ACCOUNTS.map((a) => a.email) } },
    select: { email: true, role: true, railwayZone: true, createdAt: true },
  });

  return NextResponse.json({
    accounts: DEMO_ACCOUNTS.map((account) => {
      const found = existing.find((u) => u.email === account.email);
      return {
        ...account,
        exists: !!found,
        role: found?.role ?? account.role,
        railwayZone: found?.railwayZone ?? null,
        createdAt: found?.createdAt ?? null,
      };
    }),
  });
}

export async function POST(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });

  try {
    const body = await request.json().catch(() => ({}));
    const zone = String(body.railwayZone || '').trim().toUpperCase();
    if (!zone || !RAILWAY_ZONE_STEEL_CITY_MAP[zone]) {
      return NextResponse.json(
        { error: 'A valid railwayZone is required — it decides which division\'s bills these accounts can see.' },
        { status: 400 },
      );
    }
    const zoneName = RAILWAY_ZONE_STEEL_CITY_MAP[zone]?.name || null;

    const created: Array<{ email: string; password: string; role: string; name: string; isNew: boolean }> = [];

    for (const account of DEMO_ACCOUNTS) {
      const password = generatePassword();
      const hashed = await bcrypt.hash(password, 12);
      const existing = await prisma.user.findUnique({ where: { email: account.email }, select: { id: true } });

      if (existing) {
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            password: hashed,
            name: account.name,
            role: account.role,
            railwayZone: zone,
            railwayZoneName: zoneName,
            emailVerified: new Date(),
          },
        });
      } else {
        await prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              email: account.email,
              password: hashed,
              name: account.name,
              role: account.role,
              railwayZone: zone,
              railwayZoneName: zoneName,
              // Verified on creation: these addresses receive no mail, and an
              // unverifiable account could never sign in.
              emailVerified: new Date(),
              freeTrialUsed: 0,
              isTrialActive: false,
              totalBillsProcessed: 0,
              referralCode: await generateUniqueReferralCode(),
            },
          });
          await tx.customerAccount.create({
            data: {
              userId: user.id,
              status: 'active',
              currentTier: 'standard',
              creditBalance: 0,
              monthlyBillCount: 0,
              currentMonthBills: 0,
              lastMonthBills: 0,
            },
          });
        });
      }

      created.push({ email: account.email, password, role: account.role, name: account.name, isNew: !existing });
    }

    return NextResponse.json({
      success: true,
      zone,
      accounts: created,
      note: 'These passwords are shown once and are not stored anywhere in readable form. Run this again to reset them.',
    });
  } catch (error: any) {
    console.error('demo account seeding failed:', error);
    return NextResponse.json({ error: error?.message || 'Could not create the demo accounts' }, { status: 500 });
  }
}

/**
 * Removes the demo accounts, or — once they have acted on a bill — strips their powers
 * instead.
 *
 * An account that has approved or passed something owns rows in the approval history,
 * and that history is the record of who decided what. Deleting the user would either
 * fail on the foreign key or take the trail with it, so those accounts are demoted to
 * contractor with no zone: they can no longer see or act on anyone's bills, and the
 * history still names them.
 */
export async function DELETE(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });

  try {
    const emails = DEMO_ACCOUNTS.map((a) => a.email);
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true, email: true },
    });

    let deleted = 0;
    const retired: string[] = [];

    for (const user of users) {
      const decisions = await prisma.billApprovalHistory.count({ where: { userId: user.id } });
      if (decisions > 0) {
        await prisma.user.update({
          where: { id: user.id },
          data: { role: 'contractor', railwayZone: null, railwayZoneName: null },
        });
        retired.push(user.email);
        continue;
      }
      await prisma.user.delete({ where: { id: user.id } });
      deleted++;
    }

    return NextResponse.json({
      success: true,
      deleted,
      retired,
      message: [
        deleted ? `${deleted} account(s) deleted.` : '',
        retired.length
          ? `${retired.length} kept but stripped of all access — they appear in the approval history of a bill, which must not lose the name against a decision.`
          : '',
      ].filter(Boolean).join(' ') || 'Nothing to remove.',
    });
  } catch (error: any) {
    console.error('demo account removal failed:', error);
    return NextResponse.json({ error: error?.message || 'Could not remove the demo accounts' }, { status: 500 });
  }
}
