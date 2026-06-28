import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/db';

const filePath = 'C:\\Users\\Admin\\Downloads\\Cement_Coe_Eng.md';

function normalizeWorkUnit(unit: string): string {
  const u = unit.trim().toLowerCase();
  if (u === 'cum') return 'Cum';
  if (u === 'sqm') return 'Sqm';
  if (u === 'each') return 'Each';
  if (u === 'm') return 'M';
  if (u === 'rm') return 'Rm';
  if (u.includes('100') && u.includes('sqm')) return '100 Sqm';
  if (u.includes('10') && u.includes('sqm')) return '10 Sqm';
  if (u.includes('10') && u.includes('m')) return '10 M';
  return unit.charAt(0).toUpperCase() + unit.slice(1);
}

function parseMarkdownCoefficients(): any[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const results: any[] = [];
  
  let currentItem: any = null;

  const codeRegex = /^(\d+\.\d+(?:\.\d+)*[A-Za-z]?)\s+(.*)$/;
  const endUnitCoeffRegex = /\s+(cum|sqm|each|10\s*sqm|m|10\s*m|rm|100\s*sqm|bag|tonne)\s+(\d+(?:\.\d+)?)(?:\s*["*]?)\s*$/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/^## Page|^---|COEFFICIENTS FOR CEMENT/i.test(trimmed)) {
      continue;
    }

    const codeMatch = trimmed.match(codeRegex);
    if (codeMatch) {
      if (currentItem && currentItem.unit && currentItem.coeff) {
        results.push(currentItem);
      }
      
      const code = codeMatch[1];
      const rest = codeMatch[2].trim();
      
      currentItem = {
        code,
        description: rest,
        unit: '',
        coeff: null
      };

      const endMatch = rest.match(endUnitCoeffRegex);
      if (endMatch) {
        currentItem.unit = endMatch[1];
        currentItem.coeff = parseFloat(endMatch[2]);
        currentItem.description = rest.slice(0, rest.length - endMatch[0].length).trim();
        results.push(currentItem);
        currentItem = null;
      }
      continue;
    }

    if (currentItem) {
      const endMatch = trimmed.match(endUnitCoeffRegex);
      if (endMatch) {
        currentItem.unit = endMatch[1];
        currentItem.coeff = parseFloat(endMatch[2]);
        const cleanLine = trimmed.slice(0, trimmed.length - endMatch[0].length).trim();
        if (cleanLine) {
          currentItem.description += ' ' + cleanLine;
        }
        results.push(currentItem);
        currentItem = null;
      } else {
        currentItem.description += ' ' + trimmed;
      }
    }
  }

  if (currentItem && currentItem.unit && currentItem.coeff) {
    results.push(currentItem);
  }

  // Filter and normalize
  const validItems = results
    .filter(item => {
      // Exclude category headers ending in .0
      if (item.code.endsWith('.0')) return false;
      // Ensure description is valid and coefficient is non-zero
      if (!item.description || item.coeff <= 0) return false;
      return true;
    })
    .map(item => {
      // Convert Quintals to Metric Tonnes (MT) by dividing by 10
      const mtCoeff = Math.round((item.coeff / 10) * 100000) / 100000;
      return {
        dsrCode: item.code,
        description: item.description.replace(/\s+/g, ' ').trim(),
        workUnit: normalizeWorkUnit(item.unit),
        cementQuantityPerUnit: mtCoeff,
        cementUnit: 'MT',
        notes: `Imported from Cement_Coe_Eng.md. Original: ${item.coeff} Quintals per ${item.unit}.`,
      };
    });

  return validItems;
}

async function main() {
  console.log('Parsing coefficients from markdown file...');
  const items = parseMarkdownCoefficients();
  console.log(`Parsed ${items.length} valid coefficients.`);

  console.log('Seeding database...');
  let seeded = 0;
  for (const item of items) {
    await prisma.dsrCementCoefficient.upsert({
      where: { dsrCode: item.dsrCode },
      create: {
        dsrCode: item.dsrCode,
        description: item.description,
        workUnit: item.workUnit,
        cementQuantityPerUnit: item.cementQuantityPerUnit,
        cementUnit: item.cementUnit,
        source: 'DSR 2021 cement consumption coefficient table',
        notes: item.notes,
        isActive: true,
      },
      update: {
        description: item.description,
        workUnit: item.workUnit,
        cementQuantityPerUnit: item.cementQuantityPerUnit,
        cementUnit: item.cementUnit,
        source: 'DSR 2021 cement consumption coefficient table',
        notes: item.notes,
        isActive: true,
      },
    });
    seeded++;
    if (seeded % 50 === 0) {
      console.log(`Seeded ${seeded}/${items.length} items...`);
    }
  }

  console.log(`🎉 Successfully seeded ${seeded} DSR cement coefficients to the database.`);
}

main()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
