
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generateCoveringLetter } from '@/lib/pdf/generators/covering-letter-generator';

interface CoveringLetterRequest {
  toDesignation: string;
  toOrganization: string;
  toDivision: string;
  workDescription: string;
  loaNumber: string;
  loaDate: string;
  agreementNumber: string;
  billNumber: string;
  billAmount: string;
  companyName: string;
  companyGSTIN: string;
  date?: string;
  signatory?: string;
  bodyText?: string;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: CoveringLetterRequest = await request.json();

    // Validate required fields
    if (!body.companyName) {
      return NextResponse.json(
        { error: 'Company name is required' },
        { status: 400 }
      );
    }

    if (!body.billNumber) {
      return NextResponse.json(
        { error: 'Bill number is required' },
        { status: 400 }
      );
    }

    // Generate covering letter PDF
    const pdfBuffer = await generateCoveringLetter({
      toDesignation: body.toDesignation,
      toOrganization: body.toOrganization,
      toDivision: body.toDivision,
      workDescription: body.workDescription,
      loaNumber: body.loaNumber,
      loaDate: body.loaDate,
      agreementNumber: body.agreementNumber,
      billNumber: body.billNumber,
      billAmount: body.billAmount,
      companyName: body.companyName,
      companyGSTIN: body.companyGSTIN,
      date: body.date,
      signatory: body.signatory,
      bodyText: body.bodyText,
    });

    // Return PDF
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Covering_Letter_${body.billNumber}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error generating covering letter:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate covering letter',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
