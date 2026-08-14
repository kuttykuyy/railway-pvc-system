import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  isS3Configured,
  createMultipartUpload,
  getPartPresignedUrl,
  completeMultipartUpload,
  abortMultipartUpload,
} from "@/lib/s3";

/**
 * Chunked upload for JPC sheets.
 *
 * A whole scanned sheet sent as one transfer lives or dies on the connection holding for
 * all of it, and on the connections these are uploaded from it repeatedly did not. This
 * route lets the browser send the sheet in 5 MB parts — start, sign each part, seal —
 * so a drop repeats one part instead of losing the file.
 *
 * Sealing verifies with storage that every part arrived; the browser's word is not taken
 * for it.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Admins only, same as the single-shot presigned route — chunked writes into the
    // official sheets bucket are no less an admin act for arriving in parts.
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Database-backed, uncompressed, same four actions the S3 protocol used — the
    // client is unchanged except its part size. 'sign-part' returns a URL on OUR
    // origin; the PUT handler below base64-appends each raw part onto a staging row,
    // and 'complete' seals it. Files arrive exact: no compression, ever.
    const body = await request.json();
    const action = body.action as string;

    if (action === "create") {
      const { year, months } = body;
      const componentTypes = (body.componentTypes as string[]) || [];
      if (componentTypes.length === 0 || !year || !months?.length) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }
      const folderName = componentTypes.length === 1 ? componentTypes[0].toLowerCase() : "multi";
      const monthsStr = [...months].sort((a: number, b: number) => a - b).join("-");
      const generatedFileName = `${folderName}-${year}-${monthsStr}-${Date.now()}.pdf`;
      const key = `component-indices/${folderName}/${generatedFileName}`;
      const staged = await prisma.labourIndexDocument.create({
        data: {
          componentType: componentTypes[0] as any,
          year: Number(year),
          months: months.map(Number),
          fileName: generatedFileName,
          cloudStoragePath: `staging://${key}`,
          uploadedBy: user.id,
          remarks: 'base64:',
        },
      });
      return NextResponse.json({ s3Available: true, uploadId: staged.id, key, fileName: generatedFileName });
    }

    if (action === "sign-part") {
      const { key, uploadId, partNumber } = body;
      if (!key || !uploadId || !partNumber) {
        return NextResponse.json({ error: "Missing key, uploadId, or partNumber" }, { status: 400 });
      }
      return NextResponse.json({
        url: `/api/labour-index/multipart?uploadId=${encodeURIComponent(uploadId)}&key=${encodeURIComponent(key)}&part=${partNumber}`,
      });
    }

    if (action === "complete") {
      const { key, uploadId, expectedParts } = body;
      if (!key || !uploadId || !expectedParts) {
        return NextResponse.json({ error: "Missing key, uploadId, or expectedParts" }, { status: 400 });
      }
      const staged = await prisma.labourIndexDocument.findFirst({
        where: { id: uploadId, cloudStoragePath: `staging://${key}` },
        select: { id: true, remarks: true },
      });
      if (!staged || !staged.remarks || staged.remarks.length <= 'base64:'.length) {
        return NextResponse.json({ error: 'No parts arrived for this upload.' }, { status: 400 });
      }
      // Sealed but still staged: the register step copies the bytes onto the real rows.
      return NextResponse.json({ ok: true, key });
    }

    if (action === "abort") {
      const { key, uploadId } = body;
      if (key && uploadId) {
        await prisma.labourIndexDocument.deleteMany({
          where: { id: uploadId, cloudStoragePath: `staging://${key}` },
        });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error("Multipart upload error:", error);
    return NextResponse.json(
      { error: `Multipart upload failed: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

/**
 * One raw part of a staged upload. The client PUTs each slice here; it is base64
 * encoded and appended to the staging row. Parts are 3 MB and divisible by 3, so the
 * appended encodings concatenate into one valid base64 stream — no reassembly step.
 */
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true, role: true } });
  if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const uploadId = searchParams.get('uploadId');
  const key = searchParams.get('key');
  if (!uploadId || !key || !key.startsWith('component-indices/')) {
    return NextResponse.json({ error: 'uploadId and key are required' }, { status: 400 });
  }
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length === 0) return NextResponse.json({ error: 'Empty part' }, { status: 400 });
  const encoded = bytes.toString('base64');
  const updated = await prisma.$executeRaw`UPDATE "labour_index_documents" SET remarks = remarks || ${encoded} WHERE id = ${uploadId} AND "cloudStoragePath" = ${'staging://' + key}`;
  if (Number(updated) === 0) {
    return NextResponse.json({ error: 'Upload session not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
