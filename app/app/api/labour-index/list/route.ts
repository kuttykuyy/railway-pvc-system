
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

    // remarks is deliberately NOT selected: for database-stored documents it holds the
    // whole PDF as base64 — a 16 MB sheet is 21 MB of text, times four registrations —
    // and pulling every blob out of Postgres just to strip it made this page take an
    // age to load. The human-readable remark text is cut out IN the database instead.
    const documents = await prisma.labourIndexDocument.findMany({
      where,
      select: {
        id: true, componentType: true, year: true, months: true, fileName: true,
        cloudStoragePath: true, isProvisional: true, createdAt: true, updatedAt: true,
        uploadedBy: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: [
        { createdAt: 'desc' },
      ],
    });

    const ids = documents.map(d => d.id);
    const remarkRows = ids.length
      ? await prisma.$queryRaw<Array<{ id: string; remarks: string | null }>>`
          SELECT id,
                 CASE WHEN remarks LIKE 'base64:%'
                      THEN NULLIF(split_part(remarks, '|', 2), '')
                      ELSE remarks END AS remarks
          FROM "public"."labour_index_documents" WHERE id = ANY(${ids})`
      : [];
    const remarkById = new Map(remarkRows.map(r => [r.id, r.remarks]));
    const cleanedDocuments = documents.map(doc => ({
      ...doc,
      remarks: remarkById.get(doc.id) ?? null,
    }));

    return NextResponse.json({ documents: cleanedDocuments });
  } catch (error) {
    console.error("Error fetching component index documents:", error);
    return NextResponse.json(
      { error: "Failed to fetch documents" },
      { status: 500 }
    );
  }
}
