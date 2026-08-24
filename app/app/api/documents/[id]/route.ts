import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { checkUserBillAccess, checkUserContractAccess } from '@/lib/permissions';
import { readUploadedDocument, purgeUploadedDocuments } from '@/lib/uploaded-documents';

export const dynamic = 'force-dynamic';

/**
 * A kept bill or LOA PDF, handed back to someone entitled to see it.
 *
 * Entitlement is the document's OWNING RECORD, never the document id: whoever can open
 * the bill can open the bill's PDF, and nobody else. An unattached document — uploaded
 * a moment ago and not yet saved as a bill — is readable only by the person who
 * uploaded it, which is what makes the upload-then-save flow work without opening a
 * hole. Ids are sequential, so this check is the only thing standing between them.
 */
async function mayRead(userId: string, doc: { userId: string | null; billId: string | null; contractId: string | null }) {
  if (doc.billId) {
    const access = await checkUserBillAccess(userId, doc.billId);
    if (access?.canView) return true;
  }
  if (doc.contractId) {
    const access = await checkUserContractAccess(userId, doc.contractId);
    if (access?.canView) return true;
  }
  // Not yet attached to anything: only its uploader.
  if (!doc.billId && !doc.contractId && doc.userId && doc.userId === userId) return true;
  return false;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { id } = await context.params;
  const documentId = Number(id);
  if (!Number.isFinite(documentId) || documentId <= 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const doc = await readUploadedDocument(documentId);
  // Same answer for "no such document" and "not yours" — otherwise walking the ids
  // tells you how many bills exist and which ones you are not allowed to see.
  if (!doc || !(await mayRead(user.id, doc))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (new Date(doc.expiresAt).getTime() < Date.now()) {
    return NextResponse.json(
      { error: 'This file is no longer kept. Uploaded documents are held for 90 days.' },
      { status: 410 },
    );
  }

  const disposition = request.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline';
  const safeName = (doc.fileName || `document-${documentId}.pdf`).replace(/[^A-Za-z0-9._-]+/g, '_');

  if (doc.storagePath) {
    try {
      const { getFileUrl } = await import('@/lib/s3');
      return NextResponse.redirect(await getFileUrl(doc.storagePath, 300));
    } catch {
      return NextResponse.json({ error: 'The file could not be opened right now.' }, { status: 502 });
    }
  }

  if (!doc.pdfBase64) {
    return NextResponse.json(
      { error: doc.note || 'The file itself was not kept — only its details.' },
      { status: 404 },
    );
  }

  return new NextResponse(new Uint8Array(Buffer.from(doc.pdfBase64, 'base64')), {
    headers: {
      'Content-Type': doc.contentType || 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${safeName}"`,
      // Private: a shared cache must never hold somebody's contract.
      'Cache-Control': 'private, max-age=0, no-store',
    },
  });
}

/** Delete a kept file early. Anyone who could delete the bill can delete its PDF. */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { id } = await context.params;
  const documentId = Number(id);
  const doc = Number.isFinite(documentId) ? await readUploadedDocument(documentId) : null;
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let mayDelete = !doc.billId && !doc.contractId && doc.userId === user.id;
  if (doc.billId) mayDelete = !!(await checkUserBillAccess(user.id, doc.billId))?.canDelete;
  else if (doc.contractId) mayDelete = !!(await checkUserContractAccess(user.id, doc.contractId))?.canDelete;
  if (!mayDelete) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await purgeUploadedDocuments({ ids: [documentId] });
  return NextResponse.json({ ok: true });
}
