/**
 * Production-safe logger.
 * - log / debug / info / warn suppressed in production
 * - error always passes through (needed for monitoring)
 */

const isDev = process.env.NODE_ENV !== 'production';

export const logger = {
  log:   (...args: unknown[]) => { if (isDev) console.log(...args); },
  debug: (...args: unknown[]) => { if (isDev) console.log(...args); },
  info:  (...args: unknown[]) => { if (isDev) console.log(...args); },
  warn:  (...args: unknown[]) => { if (isDev) console.warn(...args); },
  error: (...args: unknown[]) => { console.error(...args); },
};
