/**
 * Merge extracted volumes into the single data file the importer reads.
 *
 * Usage: node scripts/build-rate-book-data.js <edition> <source> <out.json> <vol.json...>
 */
const fs = require('fs');
const path = require('path');

const [, , edition, source, outFile, ...volumes] = process.argv;
if (!edition || !source || !outFile || !volumes.length) {
  console.error('Usage: node scripts/build-rate-book-data.js <edition> <source> <out.json> <vol.json...>');
  process.exit(1);
}

const items = [];
for (const file of volumes) {
  for (const item of JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')).items) {
    items.push({ c: item.code, s: item.subHead, n: item.subHeadName, d: item.description, own: item.own || item.description, u: item.unit || '', r: item.rate });
  }
}

/**
 * Which chapter an item belongs to, taken from its own code rather than from the
 * heading last seen above it.
 *
 * DSR numbers an item for its sub-head — 2.1 is the first item of 2.0 EARTH WORK — and
 * USSOR puts the chapter in the first two digits — 082011 is chapter 8. Reading the
 * printed heading instead means that wherever one was missed, every item after it
 * inherits the wrong chapter until the next heading is found: 431 of DSR 2023's items
 * were filed under CARRIAGE OF MATERIALS that way. The code cannot drift.
 */
const chapterOf = (code) => (/^\d{6}$/.test(code)
  ? String(Number(code.slice(0, 2)))
  : `${code.split('.')[0]}.0`);

// One chapter, one name — voted on by the headings that WERE read. DSR prints
// "ALUMIINIUM WORK" on a page of sub-head 21.0 and "ALUMINIUM WORK" on the rest.
const nameVotes = new Map();
for (const item of items) {
  if (chapterOf(item.c) !== item.s) continue; // a heading that had drifted names nothing
  const key = `${item.s}|${item.n}`;
  nameVotes.set(key, (nameVotes.get(key) || 0) + 1);
}
const bestName = new Map();
for (const [key, count] of nameVotes) {
  const [chapter, name] = key.split('|');
  if (!bestName.has(chapter) || bestName.get(chapter).count < count) bestName.set(chapter, { name, count });
}
for (const item of items) {
  item.s = chapterOf(item.c);
  item.n = bestName.get(item.s)?.name || item.n;
}

/**
 * One row per code. A code belongs to the chapter it is numbered under — 3.1 is a
 * mortar item of sub-head 3.0 — so where the same code was also read elsewhere, the
 * chapter matching the code wins. DSR sub-head 26 quotes items from other sub-heads
 * inside component tables, and those quotes carry rates of their own.
 */
const byCode = new Map();
for (const item of items) {
  const score = (item.r !== null ? 10 : 0) + Math.min(item.d.length / 100, 5);
  const held = byCode.get(item.c);
  if (!held || held.score < score) byCode.set(item.c, { item, score });
}

/**
 * Give every DSR item its parents' wording.
 *
 * DSR numbers a variant inside its item — 2.7 holds "Earth work in excavation by
 * mechanical means over areas exceeding 30 cm in depth", and 2.7.2 prints only "Hard
 * rock (requiring blasting)". Reading the parent off the page depended on it ending in
 * a colon, which DSR 2023 often does not, and 654 of its items were left as three or
 * four words that say nothing about the work. The code says who the parent is, so the
 * chain is composed from the codes instead of from punctuation.
 *
 * USSOR is untouched: its six-digit codes carry no ancestry, so its parents are found
 * by position when the book is read and are already in place.
 */
const ownByCode = new Map([...byCode.values()].map(entry => [entry.item.c, entry.item.own]));
for (const { item } of byCode.values()) {
  if (!item.c.includes('.')) continue;
  const segments = item.c.split('.');
  const chain = [];
  for (let depth = 1; depth <= segments.length; depth += 1) {
    const own = ownByCode.get(segments.slice(0, depth).join('.'));
    if (own) chain.push(own.replace(/\s*:$/, '').trim());
  }
  if (chain.length > 1) item.d = chain.join(' — ').replace(/\s+/g, ' ').trim();
}
for (const { item } of byCode.values()) delete item.own;

const merged = [...byCode.values()].map(entry => entry.item)
  .sort((left, right) => left.c.localeCompare(right.c, undefined, { numeric: true }));
fs.writeFileSync(outFile, JSON.stringify({ edition, source, items: merged }));
console.log(`${edition}: ${items.length} rows -> ${merged.length} codes, ${bestName.size} chapters, ${fs.statSync(outFile).size} bytes`);
