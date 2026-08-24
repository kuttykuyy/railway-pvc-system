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
  const rawBody = await res.text().catch(() => '');
  let data: any = {};
  try { data = rawBody ? JSON.parse(rawBody) : {}; } catch { data = {}; }
  if (!res.ok) {
    const refused = (`${data?.message || data?.error || ''}`.trim())
      || rawBody.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    // A paused project (410) or one restricted for exceeding a quota (402) serves
    // nothing at all — which is why a document cannot even be read out of it.
    const platform = res.status === 410
      ? ' The project is paused, so Supabase is serving nothing for it. Resume it from the Supabase dashboard.'
      : res.status === 402
        ? ' The project is restricted for exceeding a quota — usually egress.'
        : '';
    throw new Error(`Supabase refused to sign a download: ${res.status} ${refused}.${platform}`.trim());
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
  // Read once as text: a refusal from the platform gateway — a paused or restricted
  // project — is not JSON, and parsing it as JSON threw the whole explanation away.
  const rawBody = await res.text().catch(() => '');
  let data: any = {};
  try { data = rawBody ? JSON.parse(rawBody) : {}; } catch { data = {}; }
  if (!res.ok) {
    // A refused key has exactly three usual causes, and the key's own label plus the
    // endpoint name between them: wrong role, wrong project, or a key
    // invalidated by a JWT-secret rotation. Name the one the evidence supports.
    // The gateway answers in plain text or HTML when it refuses at the platform level,
    // so fall back to the body itself rather than reporting a bare status.
    const refused = (`${data?.message || data?.error || ''}`.trim())
      || rawBody.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
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

    // Nothing to do with the key: the platform has stopped serving this project.
    // 410 is a paused project, 402 one restricted for exceeding a quota — both refuse
    // downloads as well as uploads, which is why nothing can be moved out either.
    if (res.status === 410) {
      why = ' The project is paused, so Supabase is serving nothing for it —'
        + ' storage, database and all. Resume it from the Supabase dashboard;'
        + ' a project restricted for exceeding its egress quota is paused this way,'
        + ' and resumes when the billing cycle resets, the plan is upgraded, or the'
        + ' spend cap is removed.';
    } else if (res.status === 402) {
      why = ' The project is restricted for exceeding a quota — usually egress.'
        + ' It clears at the start of the next billing cycle, or at once if the plan'
        + ' is upgraded or the spend cap removed.';
    }
    throw new Error(`Supabase refused to sign an upload: ${res.status} ${refused}.${why}`.trim());
  }
  const url: string | undefined = data?.url;
  if (!url) throw new Error('Supabase returned no upload URL');
  return url.startsWith('http') ? url : `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * Put a file in the bucket from the SERVER, through the REST door.
 *
 * The note at the top of this file says server transfers keep using S3 because it works.
 * It stopped working: production logs show every bill upload failing with
 *
 *     S3 upload failed: char 'P' is not expected.:1:1   httpStatusCode: 410
 *
 * — a 410 Gone from the S3 endpoint, with a body that is not even the XML the SDK
 * expects, so the error arrives as a parser complaint about the letter P rather than as
 * "the door is shut". Whatever changed at Supabase, the REST door is the one their own
 * client uses and it is already trusted here for signing browser uploads. So it becomes
 * the fallback rather than the file being lost.
 *
 * Returns true when the object is stored.
 */
export async function restUploadFile(
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<boolean> {
  const base = restBase();
  const token = serviceKey();
  if (!base || !token) return false;

  // Presented per shape, for the reason described on describeKey: a new-style
  // sb_secret_ key put in Authorization is verified as a JWT and refused.
  const described = describeKey(token);
  const headers: Record<string, string> = {
    apikey: token,
    'Content-Type': contentType || 'application/octet-stream',
    // Same key twice is the same file; overwriting is the harmless answer.
    'x-upsert': 'true',
  };
  if (described.kind !== 'secret') headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(`${base}/object/${bucket}/${key}`, {
      method: 'POST',
      headers,
      body: new Uint8Array(body),
    });
    if (response.ok) return true;
    const detail = (await response.text().catch(() => ''))
      .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    console.error(`[supabase-storage] REST upload refused (${response.status}): ${detail}`);
    return false;
  } catch (error: any) {
    console.error('[supabase-storage] REST upload failed:', error?.message || error);
    return false;
  }
}
