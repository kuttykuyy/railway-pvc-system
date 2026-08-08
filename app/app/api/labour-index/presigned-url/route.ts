import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getUploadPresignedUrl, isS3Configured, getS3Diagnostics, testS3RoundTrip } from "@/lib/s3";
import { ComponentType } from "@prisma/client";

/**
 * GET — is cloud storage actually reachable?
 *
 * Whether a PDF keeps its quality turns on this one fact, and until now the only way to
 * find out was to upload something and watch which messages appeared. Credentials that
 * were mistyped, or set for Preview but not Production, looked exactly like having none
 * at all: the file was quietly squeezed under Vercel's 4.5 MB request cap instead.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const configured = isS3Configured();

  // Admins also get the reason. Which variable NAMES are set, never their values — the
  // point is to show that a secret is missing, not what it is.
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  // ?test=1 puts a real file in the bucket and removes it again. Being configured only
  // means the variables are readable; it says nothing about whether the bucket exists or
  // will accept us, and that gap is where every failure so far has lived.
  const runTest = request.nextUrl.searchParams.get('test') === '1';
  const connection = runTest && isAdmin ? await testS3RoundTrip() : undefined;

  return NextResponse.json({
    s3Available: configured,
    message: configured
      ? 'Cloud storage is on. Sheets upload at their original quality.'
      : 'Cloud storage is off, so every sheet is compressed to fit under the 4.5 MB request limit.',
    ...(isAdmin ? { diagnostics: getS3Diagnostics() } : {}),
    ...(connection ? { connection } : {}),
  });
}

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

    const body = await request.json();
    const { fileName, fileType, year, months } = body;
    const componentTypesParam = body.componentTypes as string[] | null;
    const componentTypeParam = body.componentType as string | null;

    let componentTypes: string[] = [];
    if (componentTypesParam && Array.isArray(componentTypesParam) && componentTypesParam.length > 0) {
      componentTypes = componentTypesParam;
    } else if (componentTypeParam) {
      componentTypes = [componentTypeParam];
    }

    if (!fileName || !fileType || componentTypes.length === 0 || !year || !months) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Generate S3 key with component type folder (use the first one or 'multi' if multiple)
    const folderName = componentTypes.length === 1 ? componentTypes[0].toLowerCase() : "multi";
    const timestamp = Date.now();
    const monthsStr = months.sort((a: number, b: number) => a - b).join('-');
    const generatedFileName = `${folderName}-${year}-${monthsStr}-${timestamp}.pdf`;
    const s3Key = `component-indices/${folderName}/${generatedFileName}`;

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
