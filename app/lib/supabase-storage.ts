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

/**
 * What kind of pass this key is, read from its label — never its secret.
 *
 * Supabase keys come in two shapes and each must be presented differently: a legacy JWT
 * goes in the Authorization header, a new sb_secret_ key must NOT — the gateway tries to
 * verify anything in Authorization as a JWT and answers "signature verification failed",
 * which reads like a broken key when the key is fine and merely in the wrong pocket.
 *
 * A JWT also states, readably and unsecretly, which project issued it and as what role —
 * exactly the two ways a syntactically fine key can still be the wrong one.
 */
function describeKey(key: string): {
  kind: 'jwt' | 'secret' | 'publishable' | 'unknown';
  role?: string;
  projectRef?: string;
} {
  if (key.startsWith('sb_secret_')) return { kind: 'secret' };
  if (key.startsWith('sb_publishable_')) return { kind: 'publishable' };
  if (key.startsWith('eyJ')) {
    try {
      const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
      return { kind: 'jwt', role: payload.role, projectRef: payload.ref };
    } catch {
      return { kind: 'jwt' };
    }
  }
  return { kind: 'unknown' };
}

/** The project ref the endpoint points at, for comparing against the key's own claim. */
function endpointProjectRef(): string | null {
  const base = restBase();
  const match = base?.match(/^https?:\/\/([a-z0-9]+)\.(?:storage\.)?supabase\.(?:co|in|com)/i);
  return match ? match[1] : null;
}

export function isRestUploadAvailable(): boolean {
  return !!restBase() && !!serviceKey();
}

export function getRestUploadDiagnostics() {
  const key = serviceKey();
  const described = key ? describeKey(key) : null;
  const endpointRef = endpointProjectRef();
  return {
    restUploadAvailable: isRestUploadAvailable(),
    restBaseFound: !!restBase(),
    restKeySetVia: process.env.SUPABASE_SERVICE_ROLE_KEY
      ? 'SUPABASE_SERVICE_ROLE_KEY'
      : process.env.SUPABASE_SECRET_KEY
        ? 'SUPABASE_SECRET_KEY'
        : null,
    // The label of the pass, never its secret: shape, claimed role, claimed project —
    // the three ways a present key can still be the wrong one.
    restKeyKind: described?.kind ?? null,
    restKeyRole: described?.role ?? null,
    restKeyProjectRef: described?.projectRef ?? null,
    restKeyMatchesProject: described?.projectRef && endpointRef
      ? described.projectRef === endpointRef
      : null,
  };
}

/**
 * Ask Supabase to sign a one-time browser upload URL for this key.
 *
 * The returned URL is complete — the browser PUTs the file to it with a Content-Type
 * header and nothing else. Tokens are single-use and expire on Supabase's schedule.
 */
/**
 * Ask Supabase to sign a short-lived browser DOWNLOAD URL for this key.
 *
 * Same door as the uploads, opposite direction, and for the same reason: the S3 door's
 * signed GETs work as page navigations but a browser fetch of one is refused, so
 * anything that must READ the bytes in the page — a canvas PDF viewer, for one — needs
 * a URL from the REST door, which speaks CORS.
 */
export async function createRestSignedDownloadUrl(bucket: string, key: string, expiresInSeconds = 600): Promise<string> {
  const base = restBase();
  const token = serviceKey();
  if (!base || !token) {
    throw new Error('Signed downloads are not configured — set SUPABASE_SERVICE_ROLE_KEY.');
  }
  const described = describeKey(token);
  const headers: Record<string, string> = {
    apikey: token,
    'Content-Type': 'application/json',
  };
  if (described.kind !== 'secret') headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${base}/object/sign/${bucket}/${key}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ expiresIn: expiresInSeconds }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Supabase refused to sign a download: ${res.status} ${data?.message || data?.error || ''}`.trim());
  }
  const url: string | undefined = data?.signedURL || data?.signedUrl || data?.url;
  if (!url) throw new Error('Supabase returned no download URL');
  return url.startsWith('http') ? url : `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

export async function createRestSignedUploadUrl(bucket: string, key: string): Promise<string> {
  const base = restBase();
  const token = serviceKey();
  if (!base || !token) {
    throw new Error('Browser upload signing is not configured — set SUPABASE_SERVICE_ROLE_KEY.');
  }

  // Presented per shape. Anything placed in Authorization gets verified as a JWT, so a
  // new-style sb_secret_ key must stay out of that header or the gateway answers
  // "signature verification failed" about a perfectly good key.
  const described = describeKey(token);
  const headers: Record<string, string> = {
    apikey: token,
    'Content-Type': 'application/json',
  };
  if (described.kind !== 'secret') headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${base}/object/upload/sign/${bucket}/${key}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    // A refused key has exactly three usual causes, and the key's own label plus the
    // endpoint name between them: wrong role, wrong project, or a key
    // invalidated by a JWT-secret rotation. Name the one the evidence supports.
    const refused = `${data?.message || data?.error || ''}`.trim();
    const endpointRef = endpointProjectRef();
    let why = '';
    if (described.kind === 'jwt' && described.role && described.role !== 'service_role') {
      why = ` The key in use is the "${described.role}" key — signing uploads needs the service_role (or sb_secret_) key.`;
    } else if (described.kind === 'jwt' && described.projectRef && endpointRef && described.projectRef !== endpointRef) {
      why = ` The key belongs to project ${described.projectRef}, but storage is project ${endpointRef} — it is from a different Supabase project.`;
    } else if (described.kind === 'jwt' && /signature verification failed/i.test(refused)) {
      why = ' The key is for the right project but its signature no longer verifies — this happens when the JWT secret was rotated after the key was copied. Copy a fresh service_role key (or an sb_secret_ key) from the Supabase dashboard.';
    } else if (described.kind === 'publishable') {
      why = ' The key in use is the publishable one — signing uploads needs the secret key.';
    }
    throw new Error(`Supabase refused to sign an upload: ${res.status} ${refused}.${why}`.trim());
  }
  const url: string | undefined = data?.url;
  if (!url) throw new Error('Supabase returned no upload URL');
  return url.startsWith('http') ? url : `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}
