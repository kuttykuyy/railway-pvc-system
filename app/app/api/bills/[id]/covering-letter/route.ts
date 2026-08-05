
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { generateCoveringLetter } from '@/lib/pdf/generators/covering-letter-generator';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    console.log('=== Covering Letter Generation Started ===');
    console.log('Bill ID:', id);
    
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      console.log('❌ Unauthorized: No session found');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id as string;
    const userRole = (session.user as any).role as string;
    console.log('User:', userId, 'Role:', userRole);

    const billId = id;

    // Fetch bill with contract details
    console.log('Fetching bill data...');
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      select: {
        id: true,
        billNo: true,
        status: true,
        pvcCalculation: {
          select: {
            totalPvc: true,
          },
        },
        contract: {
          select: {
            userId: true,
            workDescription: true,
            loaNo: true,
            loaDate: true,
            agreementNo: true,
            coveringLetterDesignation: true,
            user: {
              select: {
                companyName: true,
                name: true,
                gstin: true,
                division: true,
                divisionName: true,
                railwayZone: true,
                railwayZoneName: true,
              },
            },
          },
        },
        userAccess: {
          where: {
            userId: userId,
          },
          select: {
            id: true,
          },
        },
      },
    });

    if (!bill) {
      console.log('❌ Bill not found');
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
    }

    console.log('✓ Bill found:', bill.billNo);

    // Check access permissions:
    // 1. User owns the contract
    // 2. User is admin
    // 3. User is railway official
    // 4. User has explicit UserBillAccess
    const isContractOwner = bill.contract.userId === userId;
    const isAdmin = userRole === 'admin';
    const isRailwayOfficial = userRole === 'railway_official';
    const hasExplicitAccess = bill.userAccess && bill.userAccess.length > 0;

    if (!isContractOwner && !isAdmin && !isRailwayOfficial && !hasExplicitAccess) {
      console.log('❌ Forbidden: User does not have access to this bill');
      console.log('Permission check:', {
        isContractOwner,
        isAdmin,
        isRailwayOfficial,
        hasExplicitAccess,
        userRole,
        userId,
        contractUserId: bill.contract.userId
      });
      return NextResponse.json({ error: 'Forbidden: You do not have access to this bill' }, { status: 403 });
    }

    console.log('✓ Authorization passed:', {
      isContractOwner,
      isAdmin,
      isRailwayOfficial,
      hasExplicitAccess
    });

    // Validate required data
    if (!bill.contract) {
      console.log('❌ Missing contract data');
      return NextResponse.json(
        { error: 'Bill contract data is missing' },
        { status: 400 }
      );
    }

    if (!bill.contract.user) {
      console.log('❌ Missing user data');
      return NextResponse.json(
        { error: 'Contract user data is missing' },
        { status: 400 }
      );
    }

    console.log('✓ Required data validated');

    // Get LOA date from contract field or extract from loaNo
    let loaDate = 'N/A';
    if (bill.contract.loaDate) {
      // Use the loaDate field from contract
      loaDate = new Date(bill.contract.loaDate).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).replace(/\//g, '.');
      console.log('✓ LOA date from contract field:', loaDate);
    } else if (bill.contract.loaNo) {
      // Fallback: extract from loaNo if available (format: XXX dt:DD.MM.YY)
      const dateMatch = bill.contract.loaNo.match(/dt[:\s]*(\d{2}\.\d{2}\.\d{2,4})/);
      if (dateMatch) {
        loaDate = dateMatch[1];
        console.log('✓ LOA date extracted from LOA number:', loaDate);
      } else {
        console.log('⚠ No LOA date found');
      }
    }

    // Extract organization and division from agreement number
    // Format: SR/TPJ/Civil/2025/0029 or SR/MAS/Civil/2023/0025
    let organization = bill.contract.user?.railwayZoneName || 'Indian Railways';
    let division = bill.contract.user?.divisionName || bill.contract.user?.division || 'Division';
    let designation = bill.contract.coveringLetterDesignation || 
                      (bill.contract.user?.divisionName ? `Sr.DEN/${bill.contract.user.divisionName}` : 'Sr.DEN/Division');
    
    if (bill.contract.agreementNo) {
      const parts = bill.contract.agreementNo.split('/');
      if (parts.length >= 2) {
        const zone = parts[0]; // SR
        const divisionCode = parts[1]; // TPJ, MAS, etc.
        
        // Map zone code to full name
        if (zone === 'SR' || zone === 'Southern Railway') {
          organization = 'Southern Railway';
        }
        
        // Map division code to full name
        const divisionMap: Record<string, string> = {
          'TPJ': 'Tiruchirapalli',
          'MAS': 'Chennai',
          'MDU': 'Madurai',
          'SA': 'Salem',
          'TVC': 'Thiruvananthapuram',
          'CBE': 'Coimbatore'
        };
        
        if (divisionMap[divisionCode]) {
          division = divisionMap[divisionCode];
          // Update designation if not set in contract
          if (!bill.contract.coveringLetterDesignation) {
            designation = `Sr.DEN/${divisionCode}`;
          }
        }
        
        console.log('✓ Extracted from agreement number - Organization:', organization, 'Division:', division);
      }
    }

    // Prepare covering letter data
    const coveringLetterData = {
      // TO Section - from agreement number or user profile
      toDesignation: designation,
      toOrganization: organization,
      toDivision: `${division} Division`,
      
      // Subject
      workDescription: bill.contract.workDescription || 'Railway Work',
      
      // Reference
      loaNumber: bill.contract.loaNo || 'N/A',
      loaDate: loaDate,
      agreementNumber: bill.contract.agreementNo || 'N/A',
      
      // Bill details
      billNumber: bill.billNo || `Bill-${bill.id}`,
      // Printed without the minus sign: a recovery is worded as one, so a leading "-"
      // in front of the amount would read as a double negative.
      billAmount: Math.abs(bill.pvcCalculation?.totalPvc || 0).toLocaleString('en-IN', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      }),
      netPvcAmount: bill.pvcCalculation?.totalPvc || 0,
      
      // Company details - from user profile
      companyName: bill.contract.user?.companyName || bill.contract.user?.name || 'Company Name',
      companyGSTIN: bill.contract.user?.gstin || 'N/A',
      
      // Additional
      date: new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }),
      signatory: 'PARTNER',
    };

    console.log('✓ Covering letter data prepared');
    console.log('Data preview:', {
      billNumber: coveringLetterData.billNumber,
      companyName: coveringLetterData.companyName,
      workDescription: coveringLetterData.workDescription.substring(0, 50) + '...'
    });

    // Generate covering letter PDF
    console.log('Generating PDF...');
    const pdfBuffer = await generateCoveringLetter(coveringLetterData);
    console.log('✓ PDF generated successfully, size:', pdfBuffer.length, 'bytes');

    console.log('=== Covering Letter Generation Completed ===');

    // Return PDF
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Covering_Letter_${bill.billNo || billId}.pdf"`,
      },
    });
  } catch (error) {
    console.error('❌ Error generating covering letter:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    // More detailed error message
    let errorMessage = 'Failed to generate covering letter';
    if (error instanceof Error) {
      errorMessage += `: ${error.message}`;
    }
    
    return NextResponse.json(
      { error: errorMessage, details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
