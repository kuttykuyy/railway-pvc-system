/**
 * FAST BULK IMPORT ALL INDICES (using raw SQL batching)
 * ======================================================
 * Uses raw SQL with batched INSERT ... ON CONFLICT DO UPDATE
 * for maximum speed over network connections.
 *
 * Run: npx tsx scripts/bulk-import-all-indices.ts
 */

import { PrismaClient, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
// @ts-ignore
import * as xlsx from 'xlsx';

const prisma = new PrismaClient();

// ─── Types ───────────────────────────────────────────────────────────────────
interface IndexRecord {
  priceIndexId: string;
  month: Date;
  value: number;
  source: string;
  isProvisional: boolean;
}

// ─── Helper: parse "Apr 2022" or "Jun 2017" etc → Date ──────────────────────
function parseMonthLabel(label: string): Date | null {
  const monthNames: Record<string, string> = {
    jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
    jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
  };
  const m = label.trim().match(/^(\w{3})\s+(\d{4})$/);
  if (m) {
    const mo = monthNames[m[1].toLowerCase()];
    if (mo) return new Date(`${m[2]}-${mo}-01T00:00:00.000Z`);
  }
  return null;
}

// ─── Helper: parse "INDX042022" → Date ───────────────────────────────────────
function parseWPICol(col: string): Date | null {
  const m = col.match(/^INDX(\d{2})(\d{4})$/);
  if (!m) return null;
  return new Date(`${m[2]}-${m[1].padStart(2,'0')}-01T00:00:00.000Z`);
}

// ─── Helper: Batch upsert via raw SQL ────────────────────────────────────────
async function batchUpsert(records: IndexRecord[]) {
  if (!records.length) return;

  // Build VALUES string in batches of 200 to avoid query size limits
  const BATCH = 200;
  let total = 0;

  for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH);

    const values = chunk.map(r =>
      `(gen_random_uuid()::text, '${r.priceIndexId}', '${r.month.toISOString()}', ${r.value}, '${r.source.replace(/'/g,"''")}', ${r.isProvisional}, NOW(), NOW())`
    ).join(',\n');

    await prisma.$executeRawUnsafe(`
      INSERT INTO "railway_pvc"."monthly_index_values"
        ("id", "priceIndexId", "month", "value", "source", "isProvisional", "createdAt", "updatedAt")
      VALUES ${values}
      ON CONFLICT ("priceIndexId", "month")
      DO UPDATE SET
        "value" = EXCLUDED."value",
        "source" = EXCLUDED."source",
        "isProvisional" = EXCLUDED."isProvisional",
        "updatedAt" = NOW()
    `);

    total += chunk.length;
    process.stdout.write(`    Batch ${Math.ceil((i+BATCH)/BATCH)}/${Math.ceil(records.length/BATCH)} (${total}/${records.length} records)\r`);
  }
  console.log(`\n`);
}

// ─── Load price index IDs ─────────────────────────────────────────────────────
async function loadPriceIndexMap(): Promise<Record<string, string>> {
  const indices = await prisma.priceIndex.findMany({ select: { id: true, name: true } });
  const map: Record<string, string> = {};
  for (const idx of indices) map[idx.name] = idx.id;
  return map;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. STEEL INDICES
// ═══════════════════════════════════════════════════════════════════════════════
async function importSteelIndices(indexMap: Record<string, string>): Promise<number> {
  console.log('\n🔩 [1/4] Importing Steel Indices...');

  const filePath = path.resolve(__dirname, '../../All_Cities_Steel_Raw_Rates_2022_2026.xlsx');
  if (!fs.existsSync(filePath)) {
    console.error('  ❌ Not found:', filePath); return 0;
  }

  const wb = xlsx.readFile(filePath);
  const cities = ['Chennai','Delhi','Mumbai','Kolkata'];
  const colKeys = ['Steel TMT Bars','Steel Angle/Channel','Steel Plates','Steel Other Sections'];
  const records: IndexRecord[] = [];

  for (const city of cities) {
    const sheetName = `${city} - Indices`;
    if (!wb.SheetNames.includes(sheetName)) { console.warn(`  ⚠️  Sheet missing: ${sheetName}`); continue; }

    const data: any[][] = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });

    for (const row of data.slice(4)) {
      if (!row[0]) continue;
      const month = parseMonthLabel(row[0].toString());
      if (!month) continue;

      for (let c = 0; c < colKeys.length; c++) {
        const value = Math.round(parseFloat(row[c + 1]) * 100) / 100;
        if (!value || isNaN(value)) continue;

        // Default index (Chennai only, backward compat)
        if (city === 'Chennai') {
          const pid = indexMap[colKeys[c]];
          if (pid) records.push({ priceIndexId: pid, month, value, source: 'JPC Chennai', isProvisional: false });
        }

        // City-specific index
        const cityKey = `${colKeys[c]} - ${city}`;
        const pidCity = indexMap[cityKey];
        if (pidCity) records.push({ priceIndexId: pidCity, month, value, source: `JPC ${city}`, isProvisional: false });
      }
    }
    console.log(`  ✅ ${city} parsed`);
  }

  await batchUpsert(records);
  console.log(`  📊 Steel records: ${records.length}`);
  return records.length;
}

// ─── Types for Raw JPC Rates ──────────────────────────────────────────────────
interface JpcRecord {
  itemCode: string;
  itemName: string;
  category: string;
  indexMapping: string;
  month: Date;
  city: string;
  f1: number | null;
  f2: number | null;
  average: number | null;
  source: string;
}

// ─── Helper: Batch JPC upsert via raw SQL ──────────────────────────────────────
async function batchUpsertJpc(records: JpcRecord[]) {
  if (!records.length) return;

  const BATCH = 200;
  let total = 0;

  for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH);

    const values = chunk.map(r => {
      const f1Val = r.f1 !== null ? r.f1 : 'NULL';
      const f2Val = r.f2 !== null ? r.f2 : 'NULL';
      const avgVal = r.average !== null ? r.average : 'NULL';
      return `(gen_random_uuid()::text, '${r.itemCode}', '${r.itemName.replace(/'/g,"''")}', '${r.category}', '${r.indexMapping}', '${r.month.toISOString()}', '${r.city}', ${f1Val}, ${f2Val}, ${avgVal}, '${r.source.replace(/'/g,"''")}', NOW(), NOW())`;
    }).join(',\n');

    await prisma.$executeRawUnsafe(`
      INSERT INTO "railway_pvc"."jpc_steel_items"
        ("id", "itemCode", "itemName", "category", "indexMapping", "month", "city", "f1", "f2", "average", "source", "createdAt", "updatedAt")
      VALUES ${values}
      ON CONFLICT ("itemCode", "month", "city")
      DO UPDATE SET
        "f1" = EXCLUDED."f1",
        "f2" = EXCLUDED."f2",
        "average" = EXCLUDED."average",
        "source" = EXCLUDED."source",
        "updatedAt" = NOW()
    `);

    total += chunk.length;
    process.stdout.write(`    JPC Batch ${Math.ceil((i+BATCH)/BATCH)}/${Math.ceil(records.length/BATCH)} (${total}/${records.length} records)\r`);
  }
  console.log(`\n`);
}

// ─── Function: Import Raw JPC Steel Items ──────────────────────────────────────
async function importJpcSteelItems(): Promise<number> {
  console.log('\n🔩 [1.5] Importing Raw JPC Steel Items (Fortnightly F1 & F2 rates)...');

  const filePath = path.resolve(__dirname, '../../All_Cities_Steel_Raw_Rates_2022_2026.xlsx');
  if (!fs.existsSync(filePath)) {
    console.error('  ❌ Not found:', filePath); return 0;
  }

  const wb = xlsx.readFile(filePath);
  const cities = ['Chennai','Delhi','Mumbai','Kolkata'];
  const jpcSubItems = [
    { itemCode: 'tmt_10mm', itemName: 'TMT 10 MM', category: 'TMT', indexMapping: 'TMT', startCol: 1 },
    { itemCode: 'tmt_25mm', itemName: 'TMT 25 MM', category: 'TMT', indexMapping: 'TMT', startCol: 4 },
    { itemCode: 'angle_75x75x6mm', itemName: 'ANGLES 75X75X6 MM (ISA 75x6)', category: 'ANGLE', indexMapping: 'ANGLE_CHANNEL', startCol: 7 },
    { itemCode: 'plate_10mm', itemName: 'PLATES 10 MM (MS Plate-10mm)', category: 'PLATE', indexMapping: 'PLATES', startCol: 10 },
    { itemCode: 'channel_150x75mm', itemName: 'CHANNELS 150X75 MM (ISMC 150x75)', category: 'CHANNEL', indexMapping: 'ANGLE_CHANNEL', startCol: 13 },
    { itemCode: 'plate_25mm', itemName: 'PLATES 25 MM (MS Plate-25mm)', category: 'PLATE', indexMapping: 'PLATES', startCol: 16 }
  ];
  const records: JpcRecord[] = [];

  for (const city of cities) {
    const sheetName = `${city} - F1, F2, Avg`;
    if (!wb.SheetNames.includes(sheetName)) { console.warn(`  ⚠️  Sheet missing: ${sheetName}`); continue; }

    const data: any[][] = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });

    for (const row of data.slice(4)) {
      if (!row[0]) continue;
      const month = parseMonthLabel(row[0].toString());
      if (!month) continue;

      for (const item of jpcSubItems) {
        const f1Raw = parseFloat(row[item.startCol]);
        const f2Raw = parseFloat(row[item.startCol + 1]);
        const avgRaw = parseFloat(row[item.startCol + 2]);

        const f1 = isNaN(f1Raw) ? null : Math.round(f1Raw * 100) / 100;
        const f2 = isNaN(f2Raw) ? null : Math.round(f2Raw * 100) / 100;
        const average = isNaN(avgRaw) ? null : Math.round(avgRaw * 100) / 100;

        if (f1 === null && f2 === null) continue;

        records.push({
          itemCode: item.itemCode,
          itemName: item.itemName,
          category: item.category,
          indexMapping: item.indexMapping,
          month,
          city,
          f1,
          f2,
          average,
          source: `JPC Bulletin ${row[0].toString()}`
        });
      }
    }
    console.log(`  ✅ Raw rates for ${city} parsed`);
  }

  await batchUpsertJpc(records);
  console.log(`  📊 Raw JPC records loaded: ${records.length}`);
  return records.length;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. LABOUR INDEX (CPI-IW)
// ═══════════════════════════════════════════════════════════════════════════════
async function importLabourIndex(indexMap: Record<string, string>): Promise<number> {
  console.log('\n👷 [2/4] Importing Labour Index (CPI-IW)...');

  const filePath = path.resolve(
    __dirname,
    '../../../Downloads/All India Index   Official website of Labour Bureau, Ministry of Labour and Employment,Government of India.csv'
  );
  if (!fs.existsSync(filePath)) { console.error('  ❌ Not found:', filePath); return 0; }

  const pid = indexMap['Labour'];
  if (!pid) { console.error('  ❌ "Labour" index not in DB'); return 0; }

  const monthNames: Record<string,string> = {
    jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
    jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
  };

  const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n').slice(1);
  const records: IndexRecord[] = [];

  for (const line of lines) {
    const parts = line.split(',').map(p => p.replace(/"/g,'').trim());
    if (parts.length < 5) continue;
    const year = parts[2];
    const mo = monthNames[parts[3].toLowerCase()];
    const value = parseFloat(parts[4]);
    if (!year || !mo || isNaN(value)) continue;
    const month = new Date(`${year}-${mo}-01T00:00:00.000Z`);
    records.push({ priceIndexId: pid, month, value, source: 'Labour Bureau CPI-IW (Base 2016)', isProvisional: false });
  }

  await batchUpsert(records);
  console.log(`  📊 Labour records: ${records.length}`);
  return records.length;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. WPI INDICES
// ═══════════════════════════════════════════════════════════════════════════════
async function importWPIIndices(indexMap: Record<string, string>): Promise<number> {
  console.log('\n📈 [3/4] Importing WPI Indices (Cement, Plant Machinery, Explosives, Other Materials)...');

  const filePath = path.resolve(
    __dirname,
    '../../../Downloads/monthly_index_202512.xls'
  );
  if (!fs.existsSync(filePath)) { console.error('  ❌ Not found:', filePath); return 0; }

  // WPI code → price index name
  const wpiMappings = [
    { code: '1313050000', indexName: 'RBI Cement'          },
    { code: '1318110000', indexName: 'RBI Plant Machinery' },
    { code: '1310070011', indexName: 'RBI Explosives'      },
    { code: '1000000000', indexName: 'RBI Other Materials' },
  ];

  const wb = xlsx.readFile(filePath);
  const data: any[][] = xlsx.utils.sheet_to_json(wb.Sheets['MONTHLY_INDEX'], { header: 1 });
  const headers: string[] = data[0];
  const cutoff = new Date('2022-04-01T00:00:00.000Z');
  const now = new Date();
  const records: IndexRecord[] = [];

  for (const { code, indexName } of wpiMappings) {
    const pid = indexMap[indexName];
    if (!pid) { console.warn(`  ⚠️  Not in DB: ${indexName}`); continue; }

    const row = data.find(r => r[1]?.toString() === code);
    if (!row) { console.warn(`  ⚠️  WPI code not found: ${code}`); continue; }

    let count = 0;
    for (let col = 3; col < headers.length; col++) {
      const hdr = headers[col]?.toString() || '';
      if (!hdr.startsWith('INDX')) continue;
      const month = parseWPICol(hdr);
      if (!month || month < cutoff) continue;
      const value = parseFloat(row[col]);
      if (!value || isNaN(value)) continue;
      const diffMonths = (now.getFullYear() - month.getFullYear()) * 12 + (now.getMonth() - month.getMonth());
      const isProvisional = diffMonths <= 2;
      records.push({ priceIndexId: pid, month, value, source: 'WPI (eaindustry.nic.in)', isProvisional });
      count++;
    }
    console.log(`  ✅ ${indexName}: ${count} months parsed`);
  }

  await batchUpsert(records);
  console.log(`  📊 WPI records: ${records.length}`);
  return records.length;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. MPNG FUEL INDEX (PPAC Diesel)
// ═══════════════════════════════════════════════════════════════════════════════
async function importFuelIndex(indexMap: Record<string, string>): Promise<number> {
  console.log('\n⛽ [4/4] Importing MPNG Fuel Index (PPAC Diesel Prices)...');

  const filePath = path.resolve(
    __dirname,
    '../../../../PPAC_Diesel_Prices_2026-04-20.xlsx'
  );
  if (!fs.existsSync(filePath)) { console.error('  ❌ Not found:', filePath); return 0; }

  const pid = indexMap['MPNG Fuel'];
  if (!pid) { console.error('  ❌ "MPNG Fuel" not in DB'); return 0; }

  const wb = xlsx.readFile(filePath);
  const ws = wb.Sheets['Monthly Summary'];
  if (!ws) { console.error('  ❌ Monthly Summary sheet not found'); return 0; }

  const data: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1 });
  const cutoff = new Date('2022-04-01T00:00:00.000Z');
  const records: IndexRecord[] = [];

  // Row 0 = header: Month | Days | Delhi Avg | Mumbai Avg | Chennai Avg | Kolkata Avg | Overall Avg
  for (const row of data.slice(1)) {
    if (!row[0]) continue;
    const month = parseMonthLabel(row[0].toString());
    if (!month || month < cutoff) continue;

    const overall = parseFloat(row[6]);
    if (!isNaN(overall) && overall > 0) {
      records.push({ priceIndexId: pid, month, value: Math.round(overall * 100) / 100, source: 'PPAC Diesel (Overall Avg)', isProvisional: false });
    }

    // City-specific MPNG Fuel indices if they exist
    const cities = [
      { col: 2, city: 'Delhi'   },
      { col: 3, city: 'Mumbai'  },
      { col: 4, city: 'Chennai' },
      { col: 5, city: 'Kolkata' },
    ];
    for (const { col, city } of cities) {
      const val = parseFloat(row[col]);
      if (isNaN(val) || !val) continue;
      const cityPid = indexMap[`MPNG Fuel - ${city}`];
      if (!cityPid) continue;
      records.push({ priceIndexId: cityPid, month, value: Math.round(val * 100) / 100, source: `PPAC Diesel ${city}`, isProvisional: false });
    }
  }

  await batchUpsert(records);
  console.log(`  📊 MPNG Fuel records: ${records.length}`);
  return records.length;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFY: Check available months after import
// ═══════════════════════════════════════════════════════════════════════════════
async function verifyImport(indexMap: Record<string, string>) {
  console.log('\n🔍 Verifying import...');

  const allPriceIndices = Object.keys(indexMap).filter(n => !/ - (Delhi|Mumbai|Chennai|Kolkata)$/.test(n));
  const coreIds = allPriceIndices.map(n => indexMap[n]).filter(Boolean);

  const allValues = await prisma.monthlyIndexValue.findMany({
    where: { priceIndexId: { in: coreIds } },
    select: { month: true, priceIndexId: true },
    orderBy: { month: 'asc' },
  });

  const monthMap = new Map<string, Set<string>>();
  for (const v of allValues) {
    const key = v.month.toISOString().substring(0, 7);
    if (!monthMap.has(key)) monthMap.set(key, new Set());
    monthMap.get(key)!.add(v.priceIndexId);
  }

  const complete = Array.from(monthMap.entries())
    .filter(([, ids]) => ids.size >= coreIds.length)
    .map(([m]) => m)
    .sort();

  if (complete.length === 0) {
    console.log('  ⚠️  No complete months found (all 10 core indices must be present for a month)');
    // Show partial counts
    const sorted = Array.from(monthMap.entries()).sort(([a],[b]) => a.localeCompare(b));
    sorted.forEach(([m, ids]) => console.log(`    ${m}: ${ids.size}/${coreIds.length} indices`));
  } else {
    console.log(`  ✅ Complete months available: ${complete.length}`);
    console.log(`  📅 Range: ${complete[0]} → ${complete[complete.length - 1]}`);
    console.log(`  First: ${complete[0]}, Last: ${complete[complete.length - 1]}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
  const startTime = Date.now();
  console.log('='.repeat(60));
  console.log('  FAST BULK INDEX IMPORT');
  console.log('='.repeat(60));

  const indexMap = await loadPriceIndexMap();
  console.log(`Found ${Object.keys(indexMap).length} price indices in DB`);

  const r1 = await importSteelIndices(indexMap);
  const r1_5 = await importJpcSteelItems();
  const r2 = await importLabourIndex(indexMap);
  const r3 = await importWPIIndices(indexMap);
  const r4 = await importFuelIndex(indexMap);

  await verifyImport(indexMap);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '='.repeat(60));
  console.log(`  ✅ DONE in ${elapsed}s — Total records: ${r1 + r1_5 + r2 + r3 + r4}`);
  console.log('='.repeat(60));
}

main()
  .catch(e => { console.error('Fatal:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
