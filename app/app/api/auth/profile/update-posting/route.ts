
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    console.log('=== Update Posting Details API Called ===');
    
    const session = await getServerSession(authOptions);
    console.log('Session:', session?.user?.email);
    
    if (!session?.user?.email) {
      console.error('No session or email found');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const data = await request.json();
    console.log('Received data:', JSON.stringify(data, null, 2));
    
    // Validate required fields for railway officials
    if (!data.designation || !data.department || !data.railwayZone || !data.division) {
      console.error('Missing required fields:', {
        designation: !!data.designation,
        department: !!data.department,
        railwayZone: !!data.railwayZone,
        division: !!data.division
      });
      return NextResponse.json(
        { error: 'Required fields missing: designation, department, zone, and division' },
        { status: 400 }
      );
    }

    console.log('Updating user:', session.user.email);
    
    // Update user posting details
    const updatedUser = await prisma.user.update({
      where: { email: session.user.email },
      data: {
        designation: data.designation,
        department: data.department,
        railwayZone: data.railwayZone,
        railwayZoneName: data.railwayZoneName,
        division: data.division,
        divisionName: data.divisionName,
        isCurrentPosting: true,
      },
    });

    console.log('User updated successfully:', {
      id: updatedUser.id,
      designation: updatedUser.designation,
      department: updatedUser.department,
      railwayZone: updatedUser.railwayZone,
      division: updatedUser.division
    });

    return NextResponse.json({
      success: true,
      message: 'Posting details updated successfully',
      user: {
        id: updatedUser.id,
        designation: updatedUser.designation,
        department: updatedUser.department,
        railwayZone: updatedUser.railwayZone,
        railwayZoneName: updatedUser.railwayZoneName,
        division: updatedUser.division,
        divisionName: updatedUser.divisionName,
      },
    });
  } catch (error: any) {
    console.error('Error updating posting details:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json(
      { error: error.message || 'Failed to update posting details' },
      { status: 500 }
    );
  }
}
