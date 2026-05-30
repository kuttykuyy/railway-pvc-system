
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { uploadFile } from "@/lib/s3";
import { ComponentType } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const year = parseInt(formData.get("year") as string);
    const monthsString = formData.get("months") as string;
    const componentType = formData.get("componentType") as ComponentType;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Parse months array
    let months: number[];
    try {
      months = JSON.parse(monthsString);
      if (!Array.isArray(months) || months.length === 0) {
        throw new Error("Invalid months array");
      }
      // Validate month values
      if (months.some(m => m < 1 || m > 12)) {
        throw new Error("Month values must be between 1 and 12");
      }
    } catch (error) {
      return NextResponse.json(
        { error: "Invalid months format" },
        { status: 400 }
      );
    }

    if (!year || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: "Invalid year" },
        { status: 400 }
      );
    }

    if (!componentType || !Object.values(ComponentType).includes(componentType)) {
      return NextResponse.json(
        { error: "Invalid component type" },
        { status: 400 }
      );
    }

    // Check if file is PDF
    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Only PDF files are allowed" },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Generate S3 key with component type and timestamp
    const timestamp = Date.now();
    const monthsStr = months.sort((a, b) => a - b).join('-');
    const fileName = `${componentType.toLowerCase()}-${year}-${monthsStr}-${timestamp}.pdf`;
    const s3Key = `component-indices/${componentType.toLowerCase()}/${fileName}`;

    // Upload to S3
    const cloudStoragePath = await uploadFile(buffer, s3Key);

    // Create new document
    const newDoc = await prisma.labourIndexDocument.create({
      data: {
        componentType,
        year,
        months,
        fileName,
        cloudStoragePath,
        uploadedBy: user.id,
      },
    });

    return NextResponse.json({
      message: "Component index document uploaded successfully",
      document: newDoc,
    });
  } catch (error) {
    console.error("Error uploading component index:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Upload failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
