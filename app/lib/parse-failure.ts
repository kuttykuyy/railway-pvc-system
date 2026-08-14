import { prisma } from './db';
import { schemaQualified } from './db-schema';

/**
 * A PDF the reader could not read, kept whole.
 *
 * Failures used to leave only an error message on the user's screen and a plea to
 * "send this PDF to support" — which nobody does. The file and its exact error are
 * stored the moment it happens, the admin is pinged on Telegram, and every collected
 * failure doubles as a regression test: once the reader is taught a layout, the file
 * that taught it is already on hand.
 *
 * Never throws and never blocks the user's request: collection is a side effect of a
 * failure, and a failure to collect must not deepen the original one. Raw SQL because
 * the table ships through Pending DB Changes — a schema field for an unapplied table
 * takes unrelated queries down with it, which is a lesson this codebase has now paid
 * for twice.
 */
export async function recordParseFailure(args: {
  userEmail: string | null;
  fileName: string | null;
  error: string;
  pdfBuffer: Buffer | null;
}): Promise<void> {
  try {
    const table = await schemaQualified('parse_failures');
    await prisma.$executeRawUnsafe(
      `INSERT INTO ${table} ("userEmail", "fileName", "error", "pdfBase64") VALUES ($1, $2, $3, $4)`,
      args.userEmail,
      args.fileName,
      args.error.slice(0, 8000),
      args.pdfBuffer ? args.pdfBuffer.toString('base64') : null,
    );
  } catch (err) {
    console.error('parse-failure: could not store (table not applied yet?):', err);
  }
  try {
    const { notifyTelegramAdmin } = await import('./telegram-api');
    await notifyTelegramAdmin(
      `📄❌ A bill PDF failed to read\nFile: ${args.fileName || '(unnamed)'}\nUser: ${args.userEmail || '(unknown)'}\n${args.error.slice(0, 400)}\n\nThe PDF is saved under Admin → Parse Failures.`,
    );
  } catch (err) {
    console.error('parse-failure: telegram alert failed:', err);
  }
}
