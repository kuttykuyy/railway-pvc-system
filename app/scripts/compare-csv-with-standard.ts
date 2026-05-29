import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { GCC_CLASSIFICATIONS } from '../lib/gcc-classifications-data';

interface CsvSubClass {
  cement: string;
  code: string;
  createdAt: string;
  description: string;
  explosives: string;
  fixed: string;
  fuel: string;
  id: string;
  isActive: string;
  isDefault: string;
  labour: string;
  name: string;
  otherMaterials: string;
  plantMachinery: string;
  steel: string;
  subClassifications: string;
  updatedAt: string;
}

async function main() {
  const csvPath = 'C:\\Users\\Admin\\Downloads\\data (2).csv';
  console.log(`🌱 Reading CSV file from: ${csvPath}`);
  
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV file not found at ${csvPath}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(csvPath, 'utf-8');
  const records: CsvSubClass[] = parse(fileContent, {
    columns: true,
    skip_empty_lines: true
  });

  console.log(`📊 Loaded ${records.length} records from CSV.`);

  let mismatchCount = 0;

  for (const record of records) {
    const stdSub = GCC_CLASSIFICATIONS.find(c => c.code === record.code);

    if (!stdSub) {
      console.log(`⚠️  CSV classification ${record.code} (${record.name}) not found in standard GCC definitions!`);
      continue;
    }

    const components = ['fixed', 'labour', 'steel', 'cement', 'plantMachinery', 'fuel', 'otherMaterials', 'explosives'] as const;
    const diffs: string[] = [];

    for (const comp of components) {
      const csvVal = parseFloat(record[comp]);
      const stdVal = stdSub.components[comp];

      if (csvVal !== stdVal) {
        diffs.push(`${comp}: CSV=${csvVal}%, Std=${stdVal}%`);
      }
    }

    if (diffs.length > 0) {
      mismatchCount++;
      console.log(`❌ MISMATCH in ${record.code} - ${record.name}:`);
      diffs.forEach(diff => console.log(`   - ${diff}`));
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Total subclassifications checked: ${records.length}`);
  console.log(`Mismatches found: ${mismatchCount}`);
}

main().catch(console.error);
