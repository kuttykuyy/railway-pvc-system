import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import crypto from 'crypto';

// Generate a secure API key
function generateApiKey(): string {
  const prefix = 'irpvc';
  const randomPart = crypto.randomBytes(32).toString('hex');
  return `${prefix}_${randomPart}`;
}

// Hash API key for storage
function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// GET - List all API keys (admin only)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 401 }
      );
    }

    const apiKeys = await prisma.apiKey.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Don't send the actual keys in the response
    const sanitizedKeys = apiKeys.map((key: any) => ({
      ...key,
      key: `${key.key.substring(0, 10)}...${key.key.substring(key.key.length - 4)}`
    }));

    return NextResponse.json(sanitizedKeys);
  } catch (error) {
    console.error('Error fetching API keys:', error);
    return NextResponse.json(
      { error: 'Failed to fetch API keys' },
      { status: 500 }
    );
  }
}

// POST - Create new API key (admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, description, scopes, expiresAt, rateLimit, userId } = body;

    if (!name || !userId) {
      return NextResponse.json(
        { error: 'Name and userId are required' },
        { status: 400 }
      );
    }

    // Generate API key
    const apiKey = generateApiKey();
    const hashedKey = hashApiKey(apiKey);

    // Create API key in database
    const newApiKey = await prisma.apiKey.create({
      data: {
        name,
        key: hashedKey,
        userId,
        description: description || null,
        scopes: scopes || [],
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        rateLimit: rateLimit || 100,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        }
      }
    });

    // Return the plaintext API key only once
    return NextResponse.json({
      ...newApiKey,
      plainKey: apiKey, // Only returned once!
      key: `${hashedKey.substring(0, 10)}...${hashedKey.substring(hashedKey.length - 4)}`
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    return NextResponse.json(
      { error: 'Failed to create API key' },
      { status: 500 }
    );
  }
}
