
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const componentType = searchParams.get("componentType");
    const year = searchParams.get("year");

    // Build query filter
    const where: any = {};
    if (componentType) {
      where.componentType = componentType;
    }
    if (year) {
      where.year = parseInt(year);
    }

    const documents = await prisma.labourIndexDocument.findMany({
      where,
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: [
        { createdAt: 'desc' },
      ],
    });

    // Strip out base64 string from remarks to keep UI clean, extracting the text remarks if present
    const cleanedDocuments = documents.map(doc => {
      let remarks = doc.remarks;
      if (doc.remarks?.startsWith('base64:')) {
        const parts = doc.remarks.substring(7).split('|');
        remarks = parts[1] || null;
      }
      return {
        ...doc,
        remarks
      };
    });

    return NextResponse.json({ documents: cleanedDocuments });
  } catch (error) {
    console.error("Error fetching component index documents:", error);
    return NextResponse.json(
      { error: "Failed to fetch documents" },
      { status: 500 }
    );
  }
}
