import { NextRequest, NextResponse } from 'next/server';
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
