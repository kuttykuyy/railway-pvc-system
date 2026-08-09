/**
 * Merge the extracted DSR volumes into the single data file the importer reads.
 *
 * Usage: node scripts/build-dsr-data.js <vol1.json> <vol2.json> <out.json>
 */
const fs = require('fs');
const path = require('path');

const [, , ...args] = process.argv;
const outFile = args.pop();
const items = [];
for (const file of args) {
  for (const item of JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')).items) {
    items.push({ c: item.code, s: item.subHead, n: item.subHeadName, d: item.description, u: item.unit || '', r: item.rate });
  }
}

// One sub-head, one name. The book prints "ALUMIINIUM WORK" on one page of sub-head
// 21.0 and "ALUMINIUM WORK" on the rest; the spelling it uses most often wins.
const nameVotes = new Map();
for (const item of items) {
  const key = `${item.s}|${item.n}`;
  nameVotes.set(key, (nameVotes.get(key) || 0) + 1);
}
const bestName = new Map();
for (const [key, count] of nameVotes) {
  const [sub, name] = key.split('|');
  if (!bestName.has(sub) || bestName.get(sub).count < count) bestName.set(sub, { name, count });
}
for (const item of items) item.n = bestName.get(item.s).name;

/**
 * One row per code. A code belongs to the sub-head it is numbered under — 3.1 is a
 * mortar item in sub-head 3.0 — so where the same code was also read under another
 * sub-head, the one whose number matches the code wins. Sub-head 26 quotes items from
 * elsewhere in a component table, and those quotes carried rates of their own.
 */
const byCode = new Map();
for (const item of items) {
  const belongs = item.s.split('.')[0] === item.c.split('.')[0];
  const score = (belongs ? 100 : 0) + (item.r !== null ? 10 : 0) + Math.min(item.d.length / 100, 5);
  const held = byCode.get(item.c);
  if (!held || held.score < score) byCode.set(item.c, { item, score });
}

const merged = [...byCode.values()].map(entry => entry.item)
  .sort((left, right) => left.c.localeCompare(right.c, undefined, { numeric: true }));
fs.writeFileSync(outFile, JSON.stringify({
  edition: 'DSR 2021',
  source: 'CPWD Delhi Schedule of Rates 2021, Vol 1 & 2 (updated Dec 2021), cpwd.gov.in',
  items: merged,
}));
console.log(`${items.length} rows read -> ${merged.length} unique codes, ${bestName.size} sub-heads`);
console.log(`${fs.statSync(outFile).size} bytes`);
