
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { PrismaClient } from '@prisma/client';
import { AVAILABLE_PAGES, getNonAdminPages } from '@/lib/page-permissions';

const prisma = new PrismaClient();

// Get all user permissions
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true, id: true }
    });

    if (user?.role !== 'admin') {
      return NextResponse.json({ error: 'Access denied - Admin required' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (userId) {
      // Get permissions for specific user
      const userPermissions = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          contractAccess: {
            select: {
              id: true,
              canView: true,
              canEdit: true,
              canDelete: true,
              canCreateBills: true,
              notes: true,
              expiresAt: true,
              createdAt: true,
              contract: {
                select: {
                  id: true,
                  agreementNo: true,
                  contractorName: true,
                  workDescription: true
                }
              }
            }
          },
          billAccess: {
            select: {
              id: true,
              canView: true,
              canEdit: true,
              canDelete: true,
              canDownloadPdf: true,
              notes: true,
              expiresAt: true,
              createdAt: true,
              bill: {
                select: {
                  id: true,
                  billNo: true,
                  billAmount: true,
                  dateOfMeasurement: true,
                  contract: {
                    select: {
                      id: true,
                      agreementNo: true,
                      contractorName: true
                    }
                  }
                }
              }
            }
          },
          pageAccess: {
            select: {
              id: true,
              pagePath: true,
              pageName: true,
              pageCategory: true,
              canAccess: true,
              notes: true,
              expiresAt: true,
              createdAt: true,
              isActive: true
            },
            orderBy: {
              pageCategory: 'asc'
            }
          }
        }
      });

      if (!userPermissions) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      return NextResponse.json(userPermissions);
    }

    // Get all users with their permissions summary (contractor + user roles)
    const users = await prisma.user.findMany({
      where: { 
        role: {
          in: ['contractor', 'user']
        }
      },
      select: {
        id: true,
        name: true,
        email: true,
        companyName: true,
        createdAt: true,
        _count: {
          select: {
            contractAccess: true,
            billAccess: true,
            pageAccess: true,
            contracts: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error('Error fetching user permissions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Grant contract access to user
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true, id: true }
    });

    if (user?.role !== 'admin') {
      return NextResponse.json({ error: 'Access denied - Admin required' }, { status: 403 });
    }

    const body = await req.json();
    const { 
      userId, 
      contractId, 
      billId, 
      pagePath,
      pageName,
      pageCategory,
      type, // 'contract', 'bill', or 'page'
      permissions, 
      notes, 
      expiresAt 
    } = body;

    if (!userId || !type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (type === 'page' && pagePath) {
      // Grant page access
      const pageAccess = await prisma.userPageAccess.upsert({
        where: {
          userId_pagePath: {
            userId,
            pagePath
          }
        },
        create: {
          userId,
          pagePath,
          pageName: pageName || pagePath,
          pageCategory: pageCategory || 'Other',
          canAccess: permissions?.canAccess !== undefined ? permissions.canAccess : true,
          grantedByUserId: user.id,
          notes,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined
        },
        update: {
          canAccess: permissions?.canAccess !== undefined ? permissions.canAccess : true,
          notes,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
          isActive: true,
          updatedAt: new Date()
        },
        select: {
          id: true,
          pagePath: true,
          pageName: true,
          pageCategory: true,
          canAccess: true,
          notes: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              name: true,
              email: true
            }
          }
        }
      });

      return NextResponse.json(pageAccess);
    }

    if (!permissions) {
      return NextResponse.json({ error: 'Missing permissions' }, { status: 400 });
    }

    if (type === 'contract' && contractId) {
      // Grant contract access
      const contractAccess = await prisma.userContractAccess.upsert({
        where: {
          userId_contractId: {
            userId,
            contractId
          }
        },
        create: {
          userId,
          contractId,
          canView: permissions.canView || true,
          canEdit: permissions.canEdit || false,
          canDelete: permissions.canDelete || false,
          canCreateBills: permissions.canCreateBills || true,
          grantedByUserId: user.id,
          notes,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined
        },
        update: {
          canView: permissions.canView || true,
          canEdit: permissions.canEdit || false,
          canDelete: permissions.canDelete || false,
          canCreateBills: permissions.canCreateBills || true,
          notes,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
          updatedAt: new Date()
        },
        select: {
          id: true,
          canView: true,
          canEdit: true,
          canDelete: true,
          canCreateBills: true,
          notes: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
          contract: {
            select: {
              agreementNo: true,
              contractorName: true
            }
          },
          user: {
            select: {
              name: true,
              email: true
            }
          }
        }
      });

      return NextResponse.json(contractAccess);
    } 
    
    if (type === 'bill' && billId) {
      // Grant bill access
      const billAccess = await prisma.userBillAccess.upsert({
        where: {
          userId_billId: {
            userId,
            billId
          }
        },
        create: {
          userId,
          billId,
          canView: permissions.canView || true,
          canEdit: permissions.canEdit || false,
          canDelete: permissions.canDelete || false,
          canDownloadPdf: permissions.canDownloadPdf || true,
          grantedByUserId: user.id,
          notes,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined
        },
        update: {
          canView: permissions.canView || true,
          canEdit: permissions.canEdit || false,
          canDelete: permissions.canDelete || false,
          canDownloadPdf: permissions.canDownloadPdf || true,
          notes,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
          updatedAt: new Date()
        },
        select: {
          id: true,
          canView: true,
          canEdit: true,
          canDelete: true,
          canDownloadPdf: true,
          notes: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
          bill: {
            select: {
              billNo: true,
              billAmount: true,
              contract: {
                select: {
                  agreementNo: true,
                  contractorName: true
                }
              }
            }
          },
          user: {
            select: {
              name: true,
              email: true
            }
          }
        }
      });

      return NextResponse.json(billAccess);
    }

    return NextResponse.json({ error: 'Invalid request type or missing IDs' }, { status: 400 });
  } catch (error) {
    console.error('Error granting permissions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Revoke access
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true, id: true }
    });

    if (user?.role !== 'admin') {
      return NextResponse.json({ error: 'Access denied - Admin required' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const accessId = searchParams.get('accessId');
    const type = searchParams.get('type'); // 'contract', 'bill', or 'page'

    if (!accessId || !type) {
      return NextResponse.json({ error: 'Missing access ID or type' }, { status: 400 });
    }

    if (type === 'contract') {
      await prisma.userContractAccess.delete({
        where: { id: accessId }
      });
    } else if (type === 'bill') {
      await prisma.userBillAccess.delete({
        where: { id: accessId }
      });
    } else if (type === 'page') {
      await prisma.userPageAccess.delete({
        where: { id: accessId }
      });
    } else {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    return NextResponse.json({ message: 'Access revoked successfully' });
  } catch (error) {
    console.error('Error revoking access:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
