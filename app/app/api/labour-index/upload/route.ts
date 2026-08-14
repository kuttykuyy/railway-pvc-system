
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { uploadFile } from "@/lib/s3";
import { ComponentType } from "@prisma/client";

// Only reached on the S3 path: a request that carries the file itself is capped at
// 4.5 MB by Vercel long before this, whatever we put here. With S3 configured the file
// goes straight to the bucket and a year of sheets can be uploaded at full quality.
const MAX_FILE_SIZE = 40 * 1024 * 1024; // 40 MB

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

    // Admins only. These documents are the official index sheets every user's bills are
    // verified against — an open door here lets any signed-in contractor register a
    // forged "official" sheet that the viewer and every bill then present as authority.
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const cloudStoragePathParam = formData.get("cloudStoragePath") as string | null;
    const year = parseInt(formData.get("year") as string);
    const monthsString = formData.get("months") as string;
    
    // Support multiple component types or single component type
    const componentTypesString = formData.get("componentTypes") as string | null;
    const componentTypeSingle = formData.get("componentType") as ComponentType | null;

    let componentTypes: ComponentType[] = [];
    try {
      if (componentTypesString) {
        componentTypes = JSON.parse(componentTypesString);
      } else if (componentTypeSingle) {
        componentTypes = [componentTypeSingle];
      }
    } catch (e) {
      return NextResponse.json(
        { error: "Invalid componentTypes format" },
        { status: 400 }
      );
    }

    if (!file && !cloudStoragePathParam) {
      return NextResponse.json(
        { error: "No file or cloud storage path provided" },
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

    if (componentTypes.length === 0) {
      return NextResponse.json(
        { error: "No component type selected" },
        { status: 400 }
      );
    }

    // Validate component types
    for (const cType of componentTypes) {
      if (!Object.values(ComponentType).includes(cType)) {
        return NextResponse.json(
          { error: `Invalid component type: ${cType}` },
          { status: 400 }
        );
      }
    }

    const firstComponentType = componentTypes[0];
    const folderName = componentTypes.length === 1 ? firstComponentType.toLowerCase() : "multi";
    
    let cloudStoragePath = "";
    let fileName = "";
    let remarksValue: string | undefined = undefined;

    if (cloudStoragePathParam) {
      // Only keys the upload flow itself mints. A verbatim client key let a caller
      // register ANY object in the bucket under their own name and then collect a
      // signed URL for it from the viewer route — the per-document owner check
      // defeated by naming someone else's object at registration time.
      if (!/^component-indices\/[a-z0-9_-]+\/[A-Za-z0-9._-]+\.pdf$/i.test(cloudStoragePathParam)) {
        return NextResponse.json(
          { error: "cloudStoragePath must be a component-indices key issued by the upload flow" },
          { status: 400 }
        );
      }
      // A chunked upload staged its bytes in the database; registration adopts them.
      // The SQL copy keeps the 20 MB payload inside Postgres instead of hauling it
      // through this function once per component type.
      const staged = await prisma.labourIndexDocument.findFirst({
        where: { cloudStoragePath: `staging://${cloudStoragePathParam}` },
        select: { id: true },
      });
      if (staged) {
        cloudStoragePath = `db://${cloudStoragePathParam}`;
        remarksValue = 'FROM_STAGING:' + staged.id;
      } else {
        cloudStoragePath = cloudStoragePathParam;
      }
      fileName = cloudStoragePathParam.split("/").pop() || `${folderName}-${year}-${months.join("-")}.pdf`;
    } else if (file) {
      // Check if file is PDF
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        return NextResponse.json(
          { error: "Only PDF files are allowed" },
          { status: 400 }
        );
      }

      // Enforce maximum file size
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File size exceeds the ${MAX_FILE_SIZE / 1024 / 1024} MB limit` },
          { status: 400 }
        );
      }

      // Convert file to buffer
      const buffer = Buffer.from(await file.arrayBuffer());

      // Generate S3 key
      const timestamp = Date.now();
      const monthsStr = months.sort((a, b) => a - b).join('-');
      fileName = `${folderName}-${year}-${monthsStr}-${timestamp}.pdf`;
      const s3Key = `component-indices/${folderName}/${fileName}`;

      // Storage, not the database: Supabase counts egress across both, so a row costs
      // the same to read as an object and base64 makes it a third bigger. What actually
      // reduces the bill is not reading the file again, which the embedder now handles.
      cloudStoragePath = await uploadFile(buffer, s3Key);
      remarksValue = cloudStoragePath.startsWith('db://') ? `base64:${buffer.toString('base64')}` : undefined;
    }

    // Create database records inside a loop for each selected component type
    const createdDocs = [];
    for (const cType of componentTypes) {
      const newDoc = await prisma.labourIndexDocument.create({
        data: {
          componentType: cType,
          year,
          months,
          fileName,
          cloudStoragePath,
          uploadedBy: user.id,
          remarks: remarksValue,
        },
      });
      createdDocs.push(newDoc);
    }

    // Rows registered from a staged chunked upload carry a FROM_STAGING marker; the
    // bytes are copied onto them in SQL — the 20 MB payload never leaves Postgres —
    // and the staging row is deleted once every registration holds its own copy.
    const stagingIds = [...new Set(
      createdDocs
        .map((d: any) => (typeof d.remarks === 'string' && d.remarks.startsWith('FROM_STAGING:') ? d.remarks.slice('FROM_STAGING:'.length) : null))
        .filter(Boolean),
    )] as string[];
    for (const stagedId of stagingIds) {
      await prisma.$executeRaw`UPDATE "public"."labour_index_documents" SET remarks = (SELECT remarks FROM "public"."labour_index_documents" WHERE id = ${stagedId}) WHERE remarks = ${'FROM_STAGING:' + stagedId}`;
      await prisma.labourIndexDocument.deleteMany({ where: { id: stagedId } });
    }

    return NextResponse.json({
      message: "Component index document uploaded successfully",
      document: createdDocs[0],
      documents: createdDocs,
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
