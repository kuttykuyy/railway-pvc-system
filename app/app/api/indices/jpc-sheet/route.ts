import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ComponentType } from "@prisma/client";
import { createRestSignedDownloadUrl } from "@/lib/supabase-storage";
import { getBucketConfig } from "@/lib/aws-config";

/**
 * The official JPC sheet, for reading beside the numbers.
 *
 * The JPC view page shows the figures the app extracted; a contractor checking a claim
 * wants to see them on the sheet itself. This serves the uploaded sheet to any signed-in
 * user — VIEWING only: the page renders it to canvas with no download control, and the
 * URLs handed out here live minutes, not hours.
 *
 * That is a deterrent, not a lock — nothing a browser can display is truly undownloadable
 * — but it keeps the app on the right side of how these sheets already circulate: read
 * against a claim, not republished. Only steel (JPC) component types are served here;
 * everything else keeps its existing owner-or-admin access.
 */

const JPC_TYPES: ComponentType[] = [
  ComponentType.TMT_BARS,
  ComponentType.ANGLE_CHANNEL,
  ComponentType.PLATES,
  ComponentType.OTHER_SECTIONS,
];

/**
 * Whether this account may read the official sheets: free-role accounts, a paid
 * viewing month (jpcViewUntil in the future), or a JPC report-attach purchase in the
 * last 30 days — a paying customer is not asked to pay twice in the same month.
 */
async function jpcViewAccess(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, isFreeAccount: true, customProcessingFee: true },
  });
  if (!user) return { allowed: false, userId: null as string | null };
  const freeRole = user.isFreeAccount || user.customProcessingFee === 0
    || ['admin', 'superadmin', 'railway_official', 'accounts_official'].includes(user.role || '');
  if (freeRole) return { allowed: true, userId: user.id };
  // Raw, not a schema field: declaring the column before the database had it made
  // Prisma select it on EVERY user read — including the login lookup — and locked the
  // whole app out. Until the pending change is applied this read fails and simply
  // means "not unlocked yet".
  try {
    const rows = await prisma.$queryRaw<Array<{ jpcViewUntil: Date | null }>>`SELECT "jpcViewUntil" FROM "public"."User" WHERE id = ${user.id}`;
    const until = rows[0]?.jpcViewUntil;
    if (until && new Date(until) > new Date()) return { allowed: true, userId: user.id };
  } catch {
    // Column not applied yet — treated as locked.
  }
  const recentAttach = await prisma.creditTransaction.findFirst({
    where: {
      userId: user.id,
      reason: { startsWith: 'JPC index documents' },
      createdAt: { gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    select: { id: true },
  });
  return { allowed: !!recentAttach, userId: user.id };
}

async function paywallResponse() {
  const { getBillingSettings } = await import('@/lib/admin-settings');
  const billing = await getBillingSettings();
  return NextResponse.json(
    {
      error: 'Viewing the official JPC sheets is a paid feature.',
      needsUnlock: true,
      cost: billing.jpcViewMonthlyCost,
      days: 30,
    },
    { status: 402 },
  );
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await jpcViewAccess(session.user.email)).allowed) {
    return paywallResponse();
  }

  const { searchParams } = new URL(request.url);

  // ?stream=<id>: the bytes themselves, for documents stored in the database. Cloud
  // documents never pass through here — they can be 16 MB, past what a function may
  // return — they get a signed URL from the POST instead.
  const streamId = searchParams.get("stream");
  if (streamId) {
    const doc = await prisma.labourIndexDocument.findFirst({
      where: { id: streamId, componentType: { in: JPC_TYPES } },
    });
    if (!doc || !doc.remarks?.startsWith("base64:")) {
      return new NextResponse("Not found", { status: 404 });
    }
    const bytes = Buffer.from(doc.remarks.substring(7).split("|")[0], "base64");
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        // inline, never attachment — this endpoint exists to be read, not saved.
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=300",
      },
    });
  }

  // ?year=&month=: which sheets cover this month.
  const year = parseInt(searchParams.get("year") || "", 10);
  const month = parseInt(searchParams.get("month") || "", 10);
  if (!year || !month) {
    return NextResponse.json({ error: "year and month are required" }, { status: 400 });
  }

  const docs = await prisma.labourIndexDocument.findMany({
    where: { componentType: { in: JPC_TYPES }, year },
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true, componentType: true, months: true, cloudStoragePath: true },
  });

  // One physical file is often registered under several steel types — offer it once.
  // Prefer documents whose recorded months include the asked-for month; fall back to
  // any sheet of the year so an imprecisely-tagged upload is still reachable.
  const byPath = new Map<string, (typeof docs)[number]>();
  for (const doc of docs) {
    if (!byPath.has(doc.cloudStoragePath)) byPath.set(doc.cloudStoragePath, doc);
  }
  const unique = [...byPath.values()];
  // Every file the year holds, with the one covering the asked-for month first so it
  // opens by default. Returning ONLY the covering file hid the rest from the viewer's
  // file picker, which is how months living in a second upload became unreachable.
  const covering = unique.filter((d) => d.months.includes(month));
  const others = unique.filter((d) => !d.months.includes(month));
  const offered = [...covering, ...others].map((d) => ({
    id: d.id,
    fileName: d.fileName,
    months: d.months,
    coversMonth: d.months.includes(month),
  }));

  // When the year has nothing, say which years DO have sheets — the difference between
  // "this feature is broken" and "the 2026 sheet has not been uploaded yet".
  let availableYears: number[] = [];
  if (offered.length === 0) {
    const years = await prisma.labourIndexDocument.findMany({
      where: { componentType: { in: JPC_TYPES } },
      select: { year: true },
      distinct: ["year"],
      orderBy: { year: "desc" },
    });
    availableYears = years.map((y) => y.year);
  }

  return NextResponse.json({ sheets: offered, availableYears });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, unlock } = await request.json().catch(() => ({}));

  // ?unlock: Rs 249 from credits buys 30 days of viewing, stacked on any time left.
  // The stamp is written inside the same transaction as the charge, so a double-click
  // cannot pay twice for the same month.
  if (unlock === true) {
    const { getBillingSettings } = await import('@/lib/admin-settings');
    const billing = await getBillingSettings();
    const cost = billing.jpcViewMonthlyCost;
    const buyer = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!buyer) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    // The column must exist before money moves — otherwise the charge would land and
    // the unlock would not.
    let currentUntil: Date | null = null;
    try {
      const rows = await prisma.$queryRaw<Array<{ jpcViewUntil: Date | null }>>`SELECT "jpcViewUntil" FROM "public"."User" WHERE id = ${buyer.id}`;
      currentUntil = rows[0]?.jpcViewUntil ?? null;
    } catch {
      return NextResponse.json(
        { error: 'Viewing unlock is not ready yet — the admin must apply Pending DB Changes first.' },
        { status: 503 },
      );
    }
    try {
      await prisma.$transaction(async (tx) => {
        const account = await tx.customerAccount.findUnique({
          where: { userId: buyer.id },
          select: { creditBalance: true },
        });
        const balanceBefore = account?.creditBalance ?? 0;
        if (balanceBefore < cost) throw new Error('INSUFFICIENT_BALANCE');
        await tx.customerAccount.update({
          where: { userId: buyer.id },
          data: { creditBalance: { decrement: cost } },
        });
        await tx.creditTransaction.create({
          data: {
            userId: buyer.id,
            amount: -cost,
            type: 'bill_usage',
            reason: 'JPC sheet viewing (30 days)',
            balanceBefore,
            balanceAfter: balanceBefore - cost,
          },
        });
        const base = currentUntil && new Date(currentUntil) > new Date() ? new Date(currentUntil) : new Date();
        const newUntil = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
        await tx.$executeRaw`UPDATE "public"."User" SET "jpcViewUntil" = ${newUntil} WHERE id = ${buyer.id}`;
      });
    } catch (err: any) {
      if (String(err?.message).includes('INSUFFICIENT_BALANCE')) {
        return NextResponse.json(
          { error: `You need Rs ${cost} in credits to unlock viewing. Top up and try again.` },
          { status: 402 },
        );
      }
      throw err;
    }
    return NextResponse.json({ ok: true });
  }

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (!(await jpcViewAccess(session.user.email)).allowed) {
    return paywallResponse();
  }

  const doc = await prisma.labourIndexDocument.findFirst({
    where: { id, componentType: { in: JPC_TYPES } },
    select: { cloudStoragePath: true },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (doc.cloudStoragePath.startsWith("db://")) {
    return NextResponse.json({ url: `/api/indices/jpc-sheet?stream=${id}` });
  }

  // Minutes, not hours: long enough to read, short enough that a shared link dies.
  // Signing can fail for reasons that are the DOCUMENT's problem, not the server's —
  // the storage project this file lived in was deleted, taking the file with it. An
  // unhandled throw here sent the browser an empty 500 and the viewer showed
  // "Unexpected end of JSON input"; the entry's actual state is said instead.
  try {
    const url = await createRestSignedDownloadUrl(getBucketConfig().bucketName, doc.cloudStoragePath, 600);
    return NextResponse.json({ url });
  } catch (err: any) {
    console.error('jpc-sheet: could not sign download:', err?.message || err);
    return NextResponse.json(
      { error: "This sheet's file is gone — it lived in cloud storage that no longer exists. Delete this entry in Component Index Documents and upload the sheet again; new uploads are stored safely in the database." },
      { status: 502 },
    );
  }
}
