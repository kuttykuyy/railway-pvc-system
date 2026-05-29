
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = "force-dynamic";

// GET /api/report-templates - Get all templates for the current user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    const templates = await prisma.reportTemplate.findMany({
      where: {
        OR: [
          { userId: user.id },      // User's own templates
          { isGlobal: true }         // Global templates (admin-created)
        ]
      },
      orderBy: [
        { isGlobal: 'desc' },       // Global templates first
        { isDefault: 'desc' },
        { createdAt: 'desc' }
      ],
      include: {
        user: {
          select: {
            name: true,
            role: true
          }
        }
      }
    });
    
    return NextResponse.json(templates);
  } catch (error) {
    console.error('Error fetching report templates:', error);
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
  }
}

// POST /api/report-templates - Create a new template
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    const body = await request.json();
    const { name, description, isDefault, isGlobal, sections, fields } = body;
    
    // Validate required fields
    if (!name) {
      return NextResponse.json({ error: 'Template name is required' }, { status: 400 });
    }
    
    // Only admins can create global templates
    const isAdmin = user.role === 'admin';
    const shouldBeGlobal = isGlobal && isAdmin;
    
    // If setting as default, unset other default templates
    if (isDefault) {
      await prisma.reportTemplate.updateMany({
        where: { userId: user.id, isDefault: true },
        data: { isDefault: false }
      });
    }
    
    // Create the template
    const template = await prisma.reportTemplate.create({
      data: {
        userId: user.id,
        name,
        description: description || null,
        isDefault: isDefault || false,
        isGlobal: shouldBeGlobal || false,
        sections: sections || {
          contractDetails: true,
          workClassification: true,
          allBillsTable: true,
          monthlyIndices: true,
          pvcCalculation: true,
          componentIndexDocuments: true
        },
        fields: fields || {
          contractDetails: {
            agreementNo: true,
            loaNo: true,
            contractorName: true,
            workDescription: true,
            dateOfOpening: true,
            baseMonth: true,
            pvcNumber: true,
            isFinalPvc: true,
            zone: true
          },
          workClassification: {
            code: true,
            name: true,
            description: true,
            componentBreakdown: true,
            subClassifications: true,
            nonScheduleItems: true
          },
          pvcCalculation: {
            componentWise: true,
            dedicatedAmounts: true,
            summary: true,
            quarterlyData: true
          }
        }
      }
    });
    
    return NextResponse.json(template);
  } catch (error) {
    console.error('Error creating report template:', error);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}
