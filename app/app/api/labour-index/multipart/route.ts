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

    if (!isS3Configured()) {
      return NextResponse.json({
        s3Available: false,
        message: "S3 is not configured. Falling back to database storage.",
      });
    }

    const body = await request.json();
    const action = body.action as string;

    // Every action after 'create' takes a key from the client; none may reach outside
    // the folder 'create' mints keys in. Defense in depth beside the uploadId secrecy.
    if (body.key && !String(body.key).startsWith('component-indices/')) {
      return NextResponse.json({ error: 'key must be a component-indices path' }, { status: 400 });
    }

    if (action === "create") {
      const { fileType, year, months } = body;
      const componentTypes = (body.componentTypes as string[]) || [];
      if (!fileType || componentTypes.length === 0 || !year || !months?.length) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }
      // The same key shape single-shot uploads use, so nothing downstream can tell the
      // two apart.
      const folderName = componentTypes.length === 1 ? componentTypes[0].toLowerCase() : "multi";
      const timestamp = Date.now();
      const monthsStr = [...months].sort((a: number, b: number) => a - b).join("-");
      const generatedFileName = `${folderName}-${year}-${monthsStr}-${timestamp}.pdf`;
      const key = `component-indices/${folderName}/${generatedFileName}`;

      const uploadId = await createMultipartUpload(key, fileType);
      return NextResponse.json({ s3Available: true, uploadId, key, fileName: generatedFileName });
    }

    if (action === "sign-part") {
      const { key, uploadId, partNumber } = body;
      if (!key || !uploadId || !partNumber) {
        return NextResponse.json({ error: "Missing key, uploadId, or partNumber" }, { status: 400 });
      }
      const url = await getPartPresignedUrl(key, uploadId, Number(partNumber));
      return NextResponse.json({ url });
    }

    if (action === "complete") {
      const { key, uploadId, expectedParts } = body;
      if (!key || !uploadId || !expectedParts) {
        return NextResponse.json({ error: "Missing key, uploadId, or expectedParts" }, { status: 400 });
      }
      await completeMultipartUpload(key, uploadId, Number(expectedParts));
      return NextResponse.json({ ok: true, key });
    }

    if (action === "abort") {
      const { key, uploadId } = body;
      if (key && uploadId) await abortMultipartUpload(key, uploadId);
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
