
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { PDFDocument } from 'pdf-lib';
import { generateCoveringLetter } from '@/lib/pdf/generators/covering-letter-generator';
import { emailLinkOrigin } from '@/lib/email-link-origin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 seconds for combining multiple PDFs

interface CombinedPDFRequest {
  coveringLetterData: {
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
  };
}

// POST /api/bills/[id]/combined-pdf - Generate combined PDF with covering letter, bill, abstract, and previous bills
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const billId = id;
    const body: CombinedPDFRequest = await request.json();

    // Get the bill with contract details
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      include: {
        contract: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!bill) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
    }

    // Check permissions
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify user owns this bill or is admin
    if (bill.contract.userId !== user.id && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Create the combined PDF
    const combinedPdf = await PDFDocument.create();

    // 1. Generate and add covering letter
    console.log('Generating covering letter...');
    const coveringLetterBuffer = await generateCoveringLetter(body.coveringLetterData);
    const coveringLetterPdf = await PDFDocument.load(coveringLetterBuffer);
    const coveringLetterPages = await combinedPdf.copyPages(
      coveringLetterPdf,
      coveringLetterPdf.getPageIndices()
    );
    coveringLetterPages.forEach((page) => combinedPdf.addPage(page));
    console.log('✓ Covering letter added');

    // 2. Generate and add current bill PDF
    console.log('Generating current bill PDF...');
    const billPdfResponse = await fetch(
      // emailLinkOrigin(), not NEXTAUTH_URL: on this deployment that names the platform
      // host, and a fetch to the wrong host can answer 200 with an HTML page that then
      // gets stitched into the combined PDF as if it were a report.
      `${emailLinkOrigin()}/api/bills/${billId}/pdf-report`,
      {
        headers: {
          Cookie: request.headers.get('cookie') || '',
        },
      }
    );

    if (billPdfResponse.ok) {
      const billPdfBuffer = await billPdfResponse.arrayBuffer();
      const billPdf = await PDFDocument.load(billPdfBuffer);
      const billPages = await combinedPdf.copyPages(billPdf, billPdf.getPageIndices());
      billPages.forEach((page) => combinedPdf.addPage(page));
      console.log('✓ Current bill PDF added');
    } else {
      console.warn('Warning: Could not generate current bill PDF');
    }

    // 3. Generate and add abstract PDF
    console.log('Generating abstract PDF...');
    try {
      const abstractPdfResponse = await fetch(
        `${emailLinkOrigin()}/api/reports/abstract/pdf?contractId=${bill.contractId}`,
        {
          headers: {
            Cookie: request.headers.get('cookie') || '',
          },
        }
      );

      if (abstractPdfResponse.ok) {
        const abstractPdfBuffer = await abstractPdfResponse.arrayBuffer();
        const abstractPdf = await PDFDocument.load(abstractPdfBuffer);
        const abstractPages = await combinedPdf.copyPages(
          abstractPdf,
          abstractPdf.getPageIndices()
        );
        abstractPages.forEach((page) => combinedPdf.addPage(page));
        console.log('✓ Abstract PDF added');
      } else {
        console.warn('Warning: Could not generate abstract PDF');
      }
    } catch (error) {
      console.warn('Warning: Error generating abstract PDF:', error);
    }

    // 4. Get and add all previous bills PDFs for this contract
    console.log('Fetching previous bills...');
    const previousBills = await prisma.bill.findMany({
      where: {
        contractId: bill.contractId,
        id: { not: billId }, // Exclude current bill since we already added it
      },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`Found ${previousBills.length} previous bills`);
    for (const prevBill of previousBills) {
      try {
        console.log(`Generating PDF for bill ${prevBill.billNo}...`);
        const prevBillPdfResponse = await fetch(
          `${emailLinkOrigin()}/api/bills/${prevBill.id}/pdf-report`,
          {
            headers: {
              Cookie: request.headers.get('cookie') || '',
            },
          }
        );

        if (prevBillPdfResponse.ok) {
          const prevBillPdfBuffer = await prevBillPdfResponse.arrayBuffer();
          const prevBillPdf = await PDFDocument.load(prevBillPdfBuffer);
          const prevBillPages = await combinedPdf.copyPages(
            prevBillPdf,
            prevBillPdf.getPageIndices()
          );
          prevBillPages.forEach((page) => combinedPdf.addPage(page));
          console.log(`✓ Added bill ${prevBill.billNo}`);
        } else {
          console.warn(`Warning: Could not generate PDF for bill ${prevBill.billNo}`);
        }
      } catch (error) {
        console.warn(`Warning: Error generating PDF for bill ${prevBill.billNo}:`, error);
      }
    }

    // Save the combined PDF
    console.log('Saving combined PDF...');
    const combinedPdfBytes = await combinedPdf.save();
    console.log('✓ Combined PDF saved');

    // Return the combined PDF
    return new NextResponse(combinedPdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Combined_Report_${bill.billNo.replace(/\//g, '_')}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error generating combined PDF:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate combined PDF',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
