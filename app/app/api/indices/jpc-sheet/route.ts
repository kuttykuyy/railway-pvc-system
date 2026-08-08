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

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const covering = unique.filter((d) => d.months.includes(month));
  const offered = (covering.length ? covering : unique).map((d) => ({
    id: d.id,
    fileName: d.fileName,
    months: d.months,
    coversMonth: d.months.includes(month),
  }));

  return NextResponse.json({ sheets: offered });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await request.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const doc = await prisma.labourIndexDocument.findFirst({
    where: { id, componentType: { in: JPC_TYPES } },
    select: { cloudStoragePath: true },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (doc.cloudStoragePath.startsWith("db://")) {
    return NextResponse.json({ url: `/api/indices/jpc-sheet?stream=${id}` });
  }

  // Minutes, not hours: long enough to read, short enough that a shared link dies.
  const url = await createRestSignedDownloadUrl(getBucketConfig().bucketName, doc.cloudStoragePath, 600);
  return NextResponse.json({ url });
}
