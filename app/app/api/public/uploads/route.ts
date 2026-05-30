import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import path from "path";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");
    if (!key) {
      return new NextResponse("Key is required", { status: 400 });
    }

    const doc = await prisma.labourIndexDocument.findFirst({
      where: { cloudStoragePath: key }
    });

    if (!doc || !doc.remarks || !doc.remarks.startsWith('base64:')) {
      console.warn(`Database file document not found or lacks base64 data for key: ${key}`);
      return new NextResponse("File not found", { status: 404 });
    }

    const base64Data = doc.remarks.substring(7); // Remove 'base64:' prefix
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
