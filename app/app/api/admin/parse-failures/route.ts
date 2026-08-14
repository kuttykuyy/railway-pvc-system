import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { schemaQualified } from '@/lib/db-schema';

export const dynamic = 'force-dynamic';

/** The collected reader failures: list without the PDFs, download one, delete one. */
async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });
  return user?.role === 'admin' || user?.role === 'superadmin' ? session : null;
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  const table = await schemaQualified('parse_failures').catch(() => null);
  if (!table) {
    return NextResponse.json({ failures: [], note: 'Apply Pending DB Changes to create the table.' });
  }
  const id = new URL(request.url).searchParams.get('id');
  if (id) {
    const rows = await prisma.$queryRawUnsafe<Array<{ pdfBase64: string | null; fileName: string | null }>>(
      `SELECT "pdfBase64", "fileName" FROM ${table} WHERE id = $1`, Number(id));
    if (!rows[0]?.pdfBase64) return NextResponse.json({ error: 'No PDF stored for this failure' }, { status: 404 });
    return new NextResponse(new Uint8Array(Buffer.from(rows[0].pdfBase64, 'base64')), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${(rows[0].fileName || `failure-${id}.pdf`).replace(/[^A-Za-z0-9._-]+/g, '_')}"`,
      },
    });
  }
  // The list never ships the PDFs — a page of failures is filenames and errors, not
  // a hundred megabytes of base64.
  const failures = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT id, "createdAt", "userEmail", "fileName", "error",
            ("pdfBase64" IS NOT NULL) AS "hasPdf"
     FROM ${table} ORDER BY "createdAt" DESC LIMIT 100`);
  return NextResponse.json({ failures: failures.map(f => ({ ...f, id: Number(f.id) })) });
}

export async function DELETE(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const table = await schemaQualified('parse_failures');
  await prisma.$executeRawUnsafe(`DELETE FROM ${table} WHERE id = $1`, Number(id));
  return NextResponse.json({ ok: true });
}
