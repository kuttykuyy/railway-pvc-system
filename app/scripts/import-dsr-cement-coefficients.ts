import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { prisma } from '../lib/db';
import { normalizeDsrCode } from '../lib/dsr-cement-calculation';

function readRows(filePath: string): Record<string, any>[] {
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
}

function getValue(row: Record<string, any>, keys: string[]) {
  const entries = Object.entries(row).map(([key, value]) => [
    key.toLowerCase().replace(/[\s_-]/g, ''),
    value,
  ]);
  for (const key of keys) {
    const normalizedKey = key.toLowerCase().replace(/[\s_-]/g, '');
    const found = entries.find(([entryKey]) => entryKey === normalizedKey);
    if (found) return found[1];
  }
  return undefined;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npx tsx scripts/import-dsr-cement-coefficients.ts <xlsx-or-csv-file>');
    console.error('Required columns: dsrCode, description, workUnit, cementQuantityPerUnit, cementUnit');
    process.exit(1);
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }

  const rows = readRows(resolved);
  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const dsrCode = normalizeDsrCode(String(getValue(row, ['dsrCode', 'DSR Code', 'Code']) || ''));
    const description = String(getValue(row, ['description', 'Description']) || '').trim();
    const workUnit = String(getValue(row, ['workUnit', 'Work Unit', 'Unit']) || '').trim();
    const cementQuantityPerUnit = Number(getValue(row, ['cementQuantityPerUnit', 'Cement Quantity Per Unit', 'Coefficient']));
    const cementUnit = String(getValue(row, ['cementUnit', 'Cement Unit']) || 'MT').trim();
    const source = String(getValue(row, ['source', 'Source']) || 'DSR 2021 Analysis of Rates').trim();
    const notes = String(getValue(row, ['notes', 'Notes']) || '').trim() || null;

    if (!dsrCode || !description || !workUnit || !Number.isFinite(cementQuantityPerUnit) || cementQuantityPerUnit <= 0) {
      skipped++;
      continue;
    }

    await prisma.dsrCementCoefficient.upsert({
      where: { dsrCode },
      create: {
        dsrCode,
        description,
        workUnit,
        cementQuantityPerUnit,
        cementUnit,
        source,
        notes,
      },
      update: {
        description,
        workUnit,
        cementQuantityPerUnit,
        cementUnit,
        source,
        notes,
        isActive: true,
      },
    });
    imported++;
  }

  console.log(`Imported/updated: ${imported}`);
  console.log(`Skipped: ${skipped}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
