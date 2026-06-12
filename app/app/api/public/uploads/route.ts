import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import path from "path";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true }
    });

    if (!user) {
      return new NextResponse("User not found", { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");
    if (!key) {
      return new NextResponse("Key is required", { status: 400 });
    }

    const doc = await prisma.labourIndexDocument.findFirst({
      where: { cloudStoragePath: key }
    });

    if (!doc || (doc.uploadedBy !== user.id && user.role !== 'admin')) {
      return new NextResponse("File not found or access denied", { status: 404 });
    }

    if (!doc.remarks || !doc.remarks.startsWith('base64:')) {
      console.warn(`Database file document lacks base64 data for key: ${key}`);
      return new NextResponse("File not found", { status: 404 });
    }

    const base64Data = doc.remarks.substring(7).split('|')[0]; // Remove 'base64:' prefix and remarks suffix
    const fileBuffer = Buffer.from(base64Data, 'base64');

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${path.basename(doc.fileName)}"`,
      },
    });
  } catch (error) {
    console.error("Error serving database upload file:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
