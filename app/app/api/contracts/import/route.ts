import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateApiAccess } from '@/lib/payment-validation';
import { getBaseMonth } from '@/lib/pvc-calculations';
import { checkPvcEligibility, generateEligibilityNote } from '@/lib/gcc-compliance';
import { normalizeAgreementNo } from '@/lib/railway-division-helper';
import { checkRailwayOfficialContractQuota } from '@/lib/admin-settings';

export const dynamic = 'force-dynamic';

export interface ImportRow {
  rowIndex: number;
  agreementNo: string;
  loaNo?: string;
  contractorName: string;
  workDescription: string;
  dateOfOpening: string; // DD-MM-YYYY or YYYY-MM-DD
  contractValue?: number;
  tenderAdvertisedValue?: number;
  completionPeriodMonths?: number;
}

export interface ImportResult {
  rowIndex: number;
  agreementNo: string;
  status: 'success' | 'error';
  error?: string;
  contractId?: string;
}

function parseDate(raw: string): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();

  // DD-MM-YYYY or DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const d = new Date(`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`);
    return isNaN(d.getTime()) ? null : d;
  }

  // YYYY-MM-DD
  const ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymd) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  // Excel serial number
  const serial = Number(s);
  if (!isNaN(serial) && serial > 10000) {
    const d = new Date((serial - 25569) * 86400 * 1000);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

// POST /api/contracts/import
// Body: { rows: ImportRow[] }
// Returns: { results: ImportResult[], succeeded: number, failed: number }
export async function POST(req: NextRequest) {
  try {
    const { authorized, user } = await validateApiAccess(req);
    if (!authorized || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { rows }: { rows: ImportRow[] } = await req.json();

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
    }

    if (rows.length > 200) {
      return NextResponse.json({ error: 'Maximum 200 rows per import' }, { status: 400 });
    }

    // Railway official quota check
    if (user.role === 'railway_official') {
      const quota = await checkRailwayOfficialContractQuota(user.id);
      const willExceed = quota.limit > 0 && (quota.used + rows.length) > quota.limit;
      if (willExceed) {
        return NextResponse.json({
          error: `Import would exceed your contract limit (${quota.used}/${quota.limit} used). You can import at most ${quota.remaining} more contracts.`
        }, { status: 429 });
      }
    }

    const results: ImportResult[] = [];

    for (const row of rows) {
      const { rowIndex, agreementNo, contractorName, workDescription, dateOfOpening } = row;

      // Required field validation
      if (!agreementNo?.trim()) {
        results.push({ rowIndex, agreementNo: agreementNo || '', status: 'error', error: 'Agreement No is required' });
        continue;
      }
      if (!contractorName?.trim()) {
        results.push({ rowIndex, agreementNo, status: 'error', error: 'Contractor Name is required' });
        continue;
      }
      if (!workDescription?.trim()) {
        results.push({ rowIndex, agreementNo, status: 'error', error: 'Work Description is required' });
        continue;
      }
      if (!dateOfOpening) {
        results.push({ rowIndex, agreementNo, status: 'error', error: 'Date of Opening is required (DD-MM-YYYY)' });
        continue;
      }

      const normalizedNo = normalizeAgreementNo(agreementNo.trim());
      if (!normalizedNo) {
        results.push({ rowIndex, agreementNo, status: 'error', error: 'Invalid Agreement Number format' });
        continue;
      }

      const openingDate = parseDate(String(dateOfOpening));
      if (!openingDate) {
        results.push({ rowIndex, agreementNo, status: 'error', error: 'Invalid date format. Use DD-MM-YYYY' });
        continue;
      }

      // Duplicate check
      const existing = await prisma.contract.findFirst({
        where: { OR: [{ agreementNo: normalizedNo }, { agreementNo: agreementNo.trim() }] },
        select: { id: true },
      });
      if (existing) {
        results.push({ rowIndex, agreementNo, status: 'error', error: 'Agreement No already exists' });
        continue;
      }

      try {
        const baseMonth = getBaseMonth(openingDate);
        const tav = row.tenderAdvertisedValue ? Number(row.tenderAdvertisedValue) : null;
        const cv = row.contractValue ? Number(row.contractValue) : null;
        const cpm = row.completionPeriodMonths ? Number(row.completionPeriodMonths) : null;

        const pvcResult = checkPvcEligibility(tav || cv || null, cpm);
        const pvcNote = generateEligibilityNote(tav || cv || null, cpm);

        const contract = await prisma.contract.create({
          data: {
            agreementNo: normalizedNo,
            loaNo: row.loaNo?.trim() || null,
            contractorName: contractorName.trim(),
            workDescription: workDescription.trim(),
            dateOfOpening: openingDate,
            baseMonth,
            contractValue: cv,
            tenderAdvertisedValue: tav,
            completionPeriodMonths: cpm,
            pvcApplicable: pvcResult.isEligible,
            pvcEligibilityNote: pvcNote,
            userId: user.id,
            schedules: [],
          },
          select: { id: true },
        });

        results.push({ rowIndex, agreementNo: normalizedNo, status: 'success', contractId: contract.id });
      } catch (err: any) {
        results.push({ rowIndex, agreementNo, status: 'error', error: err?.message || 'Database error' });
      }
    }

    const succeeded = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'error').length;

    return NextResponse.json({ results, succeeded, failed });
  } catch (err: any) {
    console.error('Contract import error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
