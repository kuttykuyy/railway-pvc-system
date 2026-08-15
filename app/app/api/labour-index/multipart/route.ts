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
      // Sweep abandoned staging rows before starting another. A closed tab or a crash
      // leaves one behind holding up to ~27 MB of base64 with nothing to finish it,
      // and nothing else ever removes them — on a database-only storage policy that
      // is dead weight that only grows. A day is far longer than any real upload.
      try {
        const aDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const swept = await prisma.labourIndexDocument.deleteMany({
          where: {
            cloudStoragePath: { startsWith: 'staging://' },
            createdAt: { lt: aDayAgo },
          },
        });
        if (swept.count > 0) console.info(`[multipart] removed ${swept.count} abandoned staged upload(s)`);
      } catch (e) {
        console.error('Could not sweep abandoned staged uploads:', e);
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
      // Actually verify — the doc comment always promised this and the code never did
      // it: every part except the last is exactly PART_ENCODED_CHARS, so the sealed
      // length must sit in the (expectedParts-1)..expectedParts window and decode
      // cleanly (multiple of 4). A duplicated or missing part fails here, at seal
      // time, instead of surfacing as a corrupt PDF for a paying viewer.
      const payloadLen = staged.remarks.length - 'base64:'.length;
      const parts = Number(expectedParts);
      const minLen = (parts - 1) * PART_ENCODED_CHARS;
      const maxLen = parts * PART_ENCODED_CHARS;
      if (payloadLen % 4 !== 0 || payloadLen <= minLen || payloadLen > maxLen) {
        return NextResponse.json(
          { error: `Upload is incomplete or corrupted (${payloadLen} chars for ${parts} parts). Abort and upload again.` },
          { status: 409 },
        );
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
 *
 * The append is conditional on the row holding exactly the parts BEFORE this one, so
 * it is idempotent: a client retry after a response was lost in transit (the server
 * had committed, the browser saw a network error) matches nothing, is recognised as
 * already-applied, and answers ok instead of appending the same 3 MB twice.
 */
// Mirrors PART_BYTES (3 MB) in app/indices/component-documents/page.tsx: base64 of a
// full part is 3145728 / 3 * 4 characters. Change the two together.
const PART_ENCODED_CHARS = (3 * 1024 * 1024 / 3) * 4;

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
  const part = parseInt(searchParams.get('part') || '', 10);
  if (!uploadId || !key || !key.startsWith('component-indices/')) {
    return NextResponse.json({ error: 'uploadId and key are required' }, { status: 400 });
  }
  if (!Number.isFinite(part) || part < 1) {
    return NextResponse.json({ error: 'part number is required' }, { status: 400 });
  }
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length === 0) return NextResponse.json({ error: 'Empty part' }, { status: 400 });
  const encoded = bytes.toString('base64');
  const { schemaQualified } = await import('@/lib/db-schema');
  const docsTable = await schemaQualified('labour_index_documents');
  // Part N may append only onto exactly parts 1..N-1 (each full part encodes to a
  // fixed length — the client uploads sequentially, so only the last part is short).
  const expectedLen = 'base64:'.length + (part - 1) * PART_ENCODED_CHARS;
  const updated = await prisma.$executeRawUnsafe(
    `UPDATE ${docsTable} SET remarks = remarks || $1 WHERE id = $2 AND "cloudStoragePath" = $3 AND length(remarks) = $4`,
    encoded, uploadId, 'staging://' + key, expectedLen,
  );
  if (Number(updated) === 0) {
    const row = await prisma.$queryRawUnsafe<Array<{ len: number }>>(
      `SELECT length(remarks) AS len FROM ${docsTable} WHERE id = $1 AND "cloudStoragePath" = $2`,
      uploadId, 'staging://' + key,
    );
    if (!row.length) {
      return NextResponse.json({ error: 'Upload session not found' }, { status: 404 });
    }
    // The retry case: this exact part already landed (the earlier response was lost
    // on the wire). Appending again is what used to corrupt the sealed PDF.
    if (Number(row[0].len) === expectedLen + encoded.length) {
      return NextResponse.json({ ok: true, alreadyApplied: true });
    }
    return NextResponse.json(
      { error: `Part ${part} arrived out of order. Abort and upload again.` },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}
