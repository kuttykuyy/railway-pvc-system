import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getUploadPresignedUrl, isS3Configured } from "@/lib/s3";
import { ComponentType } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if S3 is active
    if (!isS3Configured()) {
      return NextResponse.json({ 
        s3Available: false,
        message: "S3 is not configured. Falling back to database storage." 
      });
    }

    const { fileName, fileType, componentType, year, months } = await request.json();

    if (!fileName || !fileType || !componentType || !year || !months) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Generate S3 key with component type and timestamp
    const timestamp = Date.now();
    const monthsStr = months.sort((a: number, b: number) => a - b).join('-');
    const generatedFileName = `${componentType.toLowerCase()}-${year}-${monthsStr}-${timestamp}.pdf`;
    const s3Key = `component-indices/${componentType.toLowerCase()}/${generatedFileName}`;

    // Generate presigned URL
    const presignedUrl = await getUploadPresignedUrl(s3Key, fileType);

    return NextResponse.json({
      s3Available: true,
      presignedUrl,
      cloudStoragePath: s3Key,
      fileName: generatedFileName
    });
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    return NextResponse.json(
      { error: `Presigned URL generation failed: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
