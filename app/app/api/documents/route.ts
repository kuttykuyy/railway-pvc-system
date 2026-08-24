import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { checkUserBillAccess, checkUserContractAccess } from '@/lib/permissions';
import { listUploadedDocuments, DOCUMENT_RETENTION_DAYS } from '@/lib/uploaded-documents';

export const dynamic = 'force-dynamic';

/**
 * What source PDFs are being held for one bill or one contract.
 *
 * Metadata only — name, size, when it was taken, when it goes. The file itself comes
 * from /api/documents/[id], which checks the same permission again rather than trusting
 * that this list was reached legitimately.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const billId = request.nextUrl.searchParams.get('billId');
  const contractId = request.nextUrl.searchParams.get('contractId');
  if (!billId && !contractId) {
    return NextResponse.json({ error: 'billId or contractId is required' }, { status: 400 });
  }

  const allowed = billId
    ? (await checkUserBillAccess(user.id, billId))?.canView
    : (await checkUserContractAccess(user.id, contractId!))?.canView;
  // An empty list, not a 403: a page that shows kept documents should render normally
  // for someone who cannot see them, not break.
  if (!allowed) return NextResponse.json({ documents: [], retentionDays: DOCUMENT_RETENTION_DAYS });

  const documents = await listUploadedDocuments({ billId, contractId });
  return NextResponse.json({
    retentionDays: DOCUMENT_RETENTION_DAYS,
    documents: documents.map(doc => ({
      id: doc.id,
      kind: doc.kind,
      fileName: doc.fileName,
      byteSize: doc.byteSize,
      createdAt: doc.createdAt,
      expiresAt: doc.expiresAt,
      /** False when only the details were kept — see the note for why. */
      hasFile: !!doc.storagePath || !doc.note,
      note: doc.note,
    })),
  });
}
