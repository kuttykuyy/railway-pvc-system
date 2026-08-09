import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAccess } from '@/lib/role-auth';
import { extractJpcSheets } from '@/lib/ai/jpc-extractor';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_PDF_BYTES = 15 * 1024 * 1024;

/**
 * POST /api/indices/jpc-extract — read a scanned JPC price sheet.
 *
 * Returns what was read, and saves nothing. The entry screen shows the grid for the
 * admin to check against the sheet before they save it, because a misread digit here
 * moves the steel component of every PVC in the system and there is no printed total to
 * catch it, as there is on a bill.
 */
export async function POST(request: NextRequest) {
  const { authorized, message } = await validateAdminAccess(request);
  if (!authorized) {
    return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Attach the JPC sheet as "file".' }, { status: 400 });
    }
    if (file.size > MAX_PDF_BYTES) {
      return NextResponse.json({ error: 'That PDF is too large (max 15 MB).' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    // Reads every page — a bound PDF holds a month's two fortnights, sometimes several
    // months, and reading only its first page silently discarded the rest.
    const result = await extractJpcSheets(buffer, file.name || 'jpc.pdf');
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status || 502 });
    }

    const sheets = result.sheets!.map(data => {
      const priced = data.rows.filter(r => Object.values(r.prices).some(v => v !== null)).length;
      return {
        ...data,
        summary: {
          rowsRead: data.rows.length,
          rowsWithPrices: priced,
          unmatchedCount: data.unmatched.length,
          missingCount: data.missing.length,
        },
        warning: !data.month || !data.fortnight
          ? 'The sheet date could not be read, so the month and fortnight need setting by hand.'
          : data.missing.length > 0
            ? `${data.missing.length} item(s) were not found on the sheet and will be left blank.`
            : null,
      };
    });

    // The first sheet also spreads onto the top level so an older client keeps working.
    return NextResponse.json({
      ...sheets[0],
      sheets,
      pagesTotal: result.pagesTotal,
      pagesSkipped: result.pagesSkipped,
    });
  } catch (error: any) {
    console.error('JPC extraction failed:', error);
    return NextResponse.json({ error: error?.message || 'Could not read that sheet' }, { status: 500 });
  }
}
