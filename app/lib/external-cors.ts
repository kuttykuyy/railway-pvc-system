import { NextRequest } from 'next/server';

/**
 * Determine the allowed origin for external API CORS.
 * Reads ALLOWED_EXTERNAL_ORIGINS (comma-separated) from env.
 * Returns the matching origin if the request Origin header is allowed,
 * otherwise returns undefined (no CORS headers).
 */
function getAllowedOrigin(request: NextRequest): string | undefined {
  const allowedOrigins = process.env.ALLOWED_EXTERNAL_ORIGINS
    ? process.env.ALLOWED_EXTERNAL_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : [];

  if (allowedOrigins.length === 0) {
    return undefined;
  }

  const origin = request.headers.get('origin');
  if (!origin) {
    return undefined;
  }

  return allowedOrigins.find(o => o.toLowerCase() === origin.toLowerCase());
}

/**
 * Build CORS headers for external API responses.
 * If no origin is allowed, returns an empty object so browsers fall back
 * to same-origin restrictions.
 */
export function getExternalCorsHeaders(request: NextRequest): Record<string, string> {
  const allowedOrigin = getAllowedOrigin(request);
  if (!allowedOrigin) {
    return {};
  }

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
  };
}
