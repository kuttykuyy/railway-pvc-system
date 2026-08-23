
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = "force-dynamic";

// GET /api/report-templates/[id] - Get a specific template
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
    
    const template = await prisma.reportTemplate.findFirst({
      where: {
        id: id,
        OR: [
          { userId: user.id },      // User's own template
          { isGlobal: true }         // Global template
        ]
      }
    });
    
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }
    
    return NextResponse.json(template);
  } catch (error) {
    console.error('Error fetching report template:', error);
    return NextResponse.json({ error: 'Failed to fetch template' }, { status: 500 });
  }
}

// PUT /api/report-templates/[id] - Update a template
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
    
    // Verify ownership
    const existingTemplate = await prisma.reportTemplate.findFirst({
      where: {
        id: id,
        userId: user.id
      }
    });
    
    if (!existingTemplate) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }
    
    const body = await request.json();
    const { name, description, isDefault, isGlobal, sections, fields } = body;
    
    // Only admins can modify isGlobal
    const isAdmin = user.role === 'admin';
    const shouldBeGlobal = isGlobal !== undefined && isAdmin 
      ? isGlobal 
      : existingTemplate.isGlobal;
    
    // If setting as default, unset other default templates
    if (isDefault) {
      await prisma.reportTemplate.updateMany({
        where: {
          userId: user.id,
          isDefault: true,
          id: { not: id }
        },
        data: { isDefault: false }
      });
    }
    
    // Update the template
    const template = await prisma.reportTemplate.update({
      where: { id: id },
      data: {
        name: name || existingTemplate.name,
        description: description !== undefined ? description : existingTemplate.description,
        isDefault: isDefault !== undefined ? isDefault : existingTemplate.isDefault,
        isGlobal: shouldBeGlobal,
        sections: sections || existingTemplate.sections,
        fields: fields || existingTemplate.fields
      }
    });
    
    return NextResponse.json(template);
  } catch (error) {
    console.error('Error updating report template:', error);
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
}

// DELETE /api/report-templates/[id] - Delete a template
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
    
    // Verify ownership
    const template = await prisma.reportTemplate.findFirst({
      where: {
        id: id,
        userId: user.id
      }
    });
    
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // The default is the template every PDF falls back to when none is chosen. Deleting
    // it left the account with no default until the next list load silently re-created
    // one — with the stock settings, not theirs. Make another template the default
    // first; then this one can go.
    if (template.isDefault) {
      return NextResponse.json(
        { error: 'This is your default template, so every report without a chosen template uses it. Make another template the default first, then delete this one.' },
        { status: 409 },
      );
    }

    await prisma.reportTemplate.delete({
      where: { id: id }
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting report template:', error);
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
  }
}
