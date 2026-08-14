
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteFile } from "@/lib/s3";

export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get("id");

    if (!documentId) {
      return NextResponse.json(
        { error: "Document ID is required" },
        { status: 400 }
      );
    }

    // Find the document
    const document = await prisma.labourIndexDocument.findUnique({
      where: { id: documentId },
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
        { error: "You don't have permission to delete this document" },
        { status: 403 }
      );
    }

    // Delete from S3
    try {
      await deleteFile(document.cloudStoragePath);
    } catch (s3Error) {
      console.error("Error deleting file from S3:", s3Error);
      // Continue with database deletion even if S3 deletion fails
    }

    // Delete every registration of the same physical file. A JPC sheet is one PDF
    // registered under four steel types, and deleting one row while the siblings kept
    // showing the "same" sheet under other tabs left half-deleted families. Siblings
    // are matched on the underlying KEY, not the exact address: the partial storage
    // migration left mixed families where some registrations moved to db:// while the
    // rest kept the cloud address.
    const baseKey = document.cloudStoragePath.replace(/^(db|staging):\/\//, '');
    const removed = await prisma.labourIndexDocument.deleteMany({
      where: {
        cloudStoragePath: { in: [baseKey, `db://${baseKey}`, `staging://${baseKey}`] },
      },
    });

    return NextResponse.json({
      message: removed.count > 1
        ? `Deleted this sheet and its ${removed.count - 1} other registration(s) — they were the same file.`
        : "Document deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting component index document:", error);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    );
  }
}
