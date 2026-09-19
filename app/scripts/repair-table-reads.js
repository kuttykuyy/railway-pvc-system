/**
 * Undo what reading USSOR's rate table out of the PDF leaves behind.
 *
 * Where a page or column break falls inside a table cell, the cell is read twice and
 * the code column is read into the description. One item ends up holding all three:
 *
 *   065031  "065030 Assembling and Laying of Improved Switch Expansion Joint (SEJ) on
 *            Assembling and Laying of Improved Switch Expansion Joint (SEJ) on PSC
 *            sleepers of any rail section ..."
 *
 * — the code 065030, then the first line of the description repeated, then the rest.
 * USSOR 211240 is the case that showed why it matters: it was stored as "Hiring of
 * machinery for minor miscellaneous works ... 211240 Loading of sand/quarry dust filled
 * bags from Railway stacks in to Loading of sand/quarry dust filled bags ... Railway
 * Wagons ...", so the review screen called it machinery hire. Its rate, Rs 13.48 for
 * one Each, is a bag of sand — the neighbouring item 211230, supply and filling of the
 * same bags, is Rs 14.68 — and nothing hires machinery for thirteen rupees.
 *
 * Two repairs, in this order:
 *  1. The item code. Where a bare five or six digit code sits in the description and a
 *     whole item description follows it, the code is where the real item starts, so
 *     what is in front of it belongs to the item before and goes. Where what follows is
 *     only a short variant ("Using H3B electrodes"), the text in front is that item's
 *     own heading and is kept — just the stray code goes.
 *  2. The repeat. A run of words immediately repeated is collapsed to one.
 *
 * Then the carried-over heading rule runs, on text it can now read.
 */

const { ITEM_OPENERS } = require('./strip-carried-over-headings');

/** A bare item code sitting in the text, with a capitalised word right after it. */
const EMBEDDED_CODE = /(^|[^\d\w.])(\d{5,6})\s+(?=[A-Z])/;

/** How much has to follow the code before it counts as the start of a whole item. */
const MIN_ITEM_LENGTH = 120;

/**
 * A phrase immediately repeated: at least eight characters, opening on a word, and
 * followed by a word boundary so "Set Settlement" is not read as "Set" twice.
 */
const REPEATED_RUN = /(\b[A-Za-z][^\n]{7,}?)\s\1(?![\w])/;

/**
 * A repeat is only collapsed when it is plainly text read twice. A run carrying a
 * number is left alone — USSOR 186160 measures a pit "1025mm x 1025mm x 1000mm", which
 * is the same figure written twice on purpose — and a run has to carry a real word, so
 * a repeated unit or abbreviation is not touched either.
 */
function isTextReadTwice(run) {
  if (/\d/.test(run)) return false;
  return /[A-Za-z]{4,}/.test(run);
}

function dropEmbeddedItemCode(text) {
  const found = EMBEDDED_CODE.exec(text);
  if (!found) return text;
  const after = text.slice(found.index + found[0].length).trim();
  const before = text.slice(0, found.index).trim();
  if (after.length >= MIN_ITEM_LENGTH && ITEM_OPENERS.test(after)) return after;
  return `${before} ${after}`.trim();
}

function collapseRepeatedRuns(text) {
  let out = String(text || '');
  let from = 0;
  for (let guard = 0; guard < 50; guard += 1) {
    const found = REPEATED_RUN.exec(out.slice(from));
    if (!found) break;
    const at = from + found.index;
    if (!isTextReadTwice(found[1])) {
      // Step past this one; a genuine repeat may still be further along.
      from = at + found[1].length + 1;
      continue;
    }
    out = out.slice(0, at) + found[1] + out.slice(at + found[0].length);
  }
  return out;
}

/** Repairs every item in place. Returns the codes that changed, so the build can report them. */
function repairTableReads(items) {
  const repaired = [];
  for (const item of items) {
    const was = String(item.d || '');
    const now = collapseRepeatedRuns(dropEmbeddedItemCode(was));
    if (now === was) continue;
    item.d = now;
    repaired.push(item.c);
  }
  return repaired;
}

module.exports = { repairTableReads, collapseRepeatedRuns, dropEmbeddedItemCode };
