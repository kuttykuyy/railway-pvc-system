
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PUT(request: NextRequest) {
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

    const body = await request.json();
    const { id, isProvisional, remarks, months } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Document ID is required" },
        { status: 400 }
      );
    }

    // Find the document
    const document = await prisma.labourIndexDocument.findUnique({
      where: { id },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    // Check if user is admin or the uploader
    if (user.role !== "admin" && document.uploadedBy !== user.id) {
      return NextResponse.json(
        { error: "You don't have permission to update this document" },
        { status: 403 }
      );
    }

    // Prepare update data
    const updateData: any = {};
    if (typeof isProvisional === "boolean") {
      updateData.isProvisional = isProvisional;
    }
    if (remarks !== undefined) {
      updateData.remarks = remarks;
    }
    if (months && Array.isArray(months) && months.length > 0) {
      // Validate month values
      if (months.some((m: number) => m < 1 || m > 12)) {
        return NextResponse.json(
          { error: "Month values must be between 1 and 12" },
          { status: 400 }
        );
      }
      updateData.months = months;
    }

    // Update the document
    const updatedDocument = await prisma.labourIndexDocument.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({
      message: "Document updated successfully",
      document: updatedDocument,
    });
  } catch (error) {
    console.error("Error updating component index document:", error);
    return NextResponse.json(
      { error: "Failed to update document" },
      { status: 500 }
    );
  }
}
