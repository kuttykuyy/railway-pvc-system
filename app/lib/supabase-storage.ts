/**
 * Supabase's browser door for uploads.
 *
 * Supabase Storage has two doors. The S3-protocol door is for servers: hosted Supabase
 * offers no way to permit a cross-origin PUT through it, so every browser upload dies
 * there while server uploads sail through — a documented, unresolved limitation, and the
 * root of a long chain of misdiagnosed upload failures here. The storage REST door is
 * the one Supabase's own browser SDK uses, and it speaks CORS properly.
 *
 * So: server-side transfers keep using S3 (lib/s3.ts — it works), and anything a browser
 * will PUT directly gets a signed URL through this door instead.
 */

function restBase(): string | null {
  // The S3 endpoint is definitely configured (uploads depend on it) and the REST door
  // lives one path segment up from it, so derive rather than demand another variable.
  const s3 = process.env.S3_ENDPOINT_URL || process.env.SUPABASE_S3_ENDPOINT;
  if (s3 && /supabase/i.test(s3)) return s3.replace(/\/+$/, '').replace(/\/s3$/, '');
  const url = process.env.SUPABASE_URL;
  if (url) return `${url.replace(/\/+$/, '')}/storage/v1`;
  return null;
}

function serviceKey(): string | null {
  // Signing REST upload URLs is an admin act; the S3 keys carry no weight at this door.
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || null;
}

export function isRestUploadAvailable(): boolean {
  return !!restBase() && !!serviceKey();
}

export function getRestUploadDiagnostics() {
  return {
    restUploadAvailable: isRestUploadAvailable(),
    restBaseFound: !!restBase(),
    restKeySetVia: process.env.SUPABASE_SERVICE_ROLE_KEY
      ? 'SUPABASE_SERVICE_ROLE_KEY'
      : process.env.SUPABASE_SECRET_KEY
        ? 'SUPABASE_SECRET_KEY'
        : null,
  };
}

/**
 * Ask Supabase to sign a one-time browser upload URL for this key.
 *
 * The returned URL is complete — the browser PUTs the file to it with a Content-Type
 * header and nothing else. Tokens are single-use and expire on Supabase's schedule.
 */
export async function createRestSignedUploadUrl(bucket: string, key: string): Promise<string> {
  const base = restBase();
  const token = serviceKey();
  if (!base || !token) {
    throw new Error('Browser upload signing is not configured — set SUPABASE_SERVICE_ROLE_KEY.');
  }

  const res = await fetch(`${base}/object/upload/sign/${bucket}/${key}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Supabase refused to sign an upload: ${res.status} ${data?.message || data?.error || ''}`.trim());
  }
  const url: string | undefined = data?.url;
  if (!url) throw new Error('Supabase returned no upload URL');
  return url.startsWith('http') ? url : `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}
