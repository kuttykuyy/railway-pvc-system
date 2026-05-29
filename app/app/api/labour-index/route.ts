
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getFileUrl } from "@/lib/s3";
import { ComponentType } from "@prisma/client";

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

    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year");
    const month = searchParams.get("month");
    const componentType = searchParams.get("componentType") as ComponentType;

    if (!year || !month || !componentType) {
      return NextResponse.json(
        { error: "Year, month, and componentType are required" },
        { status: 400 }
      );
    }

    // Find documents that match the component type, year, and include the requested month
    const documents = await prisma.labourIndexDocument.findMany({
      where: {
        componentType,
        year: parseInt(year),
        months: {
          has: parseInt(month),
        },
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (documents.length === 0) {
      return NextResponse.json(
        { error: "No component index document found for this period" },
        { status: 404 }
      );
    }

    // Get the most recent document
    const document = documents[0];

    // Generate signed URL for download
    const signedUrl = await getFileUrl(document.cloudStoragePath);

    return NextResponse.json({
      document: {
        ...document,
        downloadUrl: signedUrl,
      },
    });
  } catch (error) {
    console.error("Error fetching component index:", error);
    return NextResponse.json(
      { error: "Failed to fetch component index document" },
      { status: 500 }
    );
  }
}
