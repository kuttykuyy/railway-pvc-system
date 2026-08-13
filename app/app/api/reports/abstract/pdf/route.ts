import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { checkUserContractAccess } from '@/lib/permissions';
import { format } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';
import { generateAbstractPdf, AbstractNotAvailableError } from '@/lib/pdf/generators/abstract-report';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  try {
    const contractId = new URL(request.url).searchParams.get('contractId');
    if (!contractId) {
      return NextResponse.json({ error: 'Contract ID is required' }, { status: 400 });
    }

    // Ownership, checked before anything is generated. This route took a contract id
    // and streamed the whole abstract with no check at all — any signed-in user could
    // read any contract's bills by id. The combined-pdf route calls this internally
    // with the caller's own cookie, so it passes the same gate its caller already did.
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const requester = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    const access = requester ? await checkUserContractAccess(requester.id, contractId) : null;
    if (!access?.canView) {
      return NextResponse.json({ error: 'You do not have access to this contract.' }, { status: 403 });
    }

    const { pdfBuffer, agreementNo } = await generateAbstractPdf(contractId);

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Abstract_${agreementNo}_${format(toISTDate(new Date()), 'yyyy-MM-dd')}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (error: any) {
    if (error instanceof AbstractNotAvailableError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('Error generating abstract PDF:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate abstract PDF',
        details: error?.message || 'Unknown error',
        stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
      },
      { status: 500 },
    );
  }
}
