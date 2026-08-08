import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getUploadPresignedUrl, getDeletePresignedUrl, isS3Configured, getS3Diagnostics, testS3RoundTrip } from "@/lib/s3";
import { isRestUploadAvailable, getRestUploadDiagnostics, createRestSignedUploadUrl } from "@/lib/supabase-storage";
import { getBucketConfig } from "@/lib/aws-config";
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

  // The server reaching storage says nothing about the browser reaching it — they use
  // different doors, and Supabase's S3 door blocks browsers outright. Hand back signed
  // URLs for two probes the browser sends itself, through the SAME door real uploads
  // will use: a tiny one (does this door work from a browser at all?) and a 6 MB one
  // (does anything on the way choke on size?).
  let browserProbe: {
    kind: 'rest' | 's3';
    tiny: { putUrl: string; deleteUrl: string };
    big: { putUrl: string; deleteUrl: string };
  } | undefined;
  if (connection?.ok) {
    try {
      const stamp = Date.now();
      const tinyKey = `connection-test/browser-tiny-${stamp}.bin`;
      const bigKey = `connection-test/browser-big-${stamp}.bin`;
      const rest = isRestUploadAvailable();
      const sign = (key: string) => rest
        ? createRestSignedUploadUrl(getBucketConfig().bucketName, key)
        : getUploadPresignedUrl(key, 'application/octet-stream');
      browserProbe = {
        kind: rest ? 'rest' : 's3',
        tiny: {
          putUrl: await sign(tinyKey),
          // Cleanup goes through S3 regardless — the server's door works fine.
          deleteUrl: await getDeletePresignedUrl(tinyKey),
        },
        big: {
          putUrl: await sign(bigKey),
          deleteUrl: await getDeletePresignedUrl(bigKey),
        },
      };
    } catch {
      // The server-side verdict still stands on its own.
    }
  }

  return NextResponse.json({
    s3Available: configured,
    message: configured
      ? 'Cloud storage is on. Sheets upload at their original quality.'
      : 'Cloud storage is off, so every sheet is compressed to fit under the 4.5 MB request limit.',
    ...(isAdmin ? { diagnostics: { ...getS3Diagnostics(), ...getRestUploadDiagnostics() } } : {}),
    ...(connection ? { connection } : {}),
    ...(browserProbe ? { browserProbe } : {}),
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

    // The browser cannot use an S3-signed URL on hosted Supabase — the S3 door answers
    // preflights but blocks the actual cross-origin PUT, with no setting to open it. So
    // browsers get a URL signed at Supabase's REST door (the one its own browser SDK
    // uses), and the S3 signature remains only as a fallback for non-Supabase storage.
    if (isRestUploadAvailable()) {
      const restUrl = await createRestSignedUploadUrl(getBucketConfig().bucketName, s3Key);
      return NextResponse.json({
        s3Available: true,
        presignedUrl: restUrl,
        urlKind: "rest",
        cloudStoragePath: s3Key,
        fileName: generatedFileName
      });
    }

    const presignedUrl = await getUploadPresignedUrl(s3Key, fileType);

    return NextResponse.json({
      s3Available: true,
      presignedUrl,
      urlKind: "s3",
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
