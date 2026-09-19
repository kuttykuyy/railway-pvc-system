/**
 * Drop the previous item's wording from the front of a USSOR item.
 *
 * USSOR's six-digit codes carry no ancestry, so when the book is read the parent
 * heading of an item is the paragraph found above it on the page. Where a group ends
 * and a new one starts, that "parent" is simply the item before — and the new item is
 * stored as [previous item's wording] + [its own]. USSOR 041370 is the case that showed
 * it: the book had it as "Longitudinally slewing of steel plate girders of span 12.2m to
 * 24.4m under traffic block …" (item 041350's heading, billed per Each) followed by its
 * real wording, "Supplying fabricating and erecting welded and/or bolted and/or riveted
 * steel work in built up sections … with contractors own steel …" (per MT). The bill
 * printed only the second, and the book's wording goes in front of the bill's, so the
 * review screen described the item as slewing girders — work it has nothing to do with.
 *
 * A genuine parent is kept. Real siblings differ only by a short variant at the end
 * ("12 MT capacity", "For Span above 18.3 M to 24.4 M", "Up to 12.2m clear span"), so
 * a shared opening is only treated as a carried-over heading when what follows it is a
 * full item description of its own: a new sentence of at least 120 characters that
 * either opens with the kind of word a schedule item opens with, or is the very
 * wording the item after it begins with.
 *
 * DSR is not touched. Its items are numbered for their parents, so the build composes
 * their wording from the code chain and never from position.
 */

const ITEM_OPENERS = /^(?:supply|supplying|providing|provision|fabricat\w*|manufactur\w*|removing|removal|painting|paint|launching|delaunching|cleaning|surface|design|designing|erection|erecting|arresting|casting|laying|fixing|extra|boring|welding|dismantling|excavation|earth|dressing|drilling|filling|grouting|hire|hiring|installation|installing|loading|unloading|making|carriage|transport\w*|replacing|renewal|repair\w*|constructing|construction|cutting|screening|shifting|strengthening|testing|training|widening|jacketing|sealing|anchoring|bailing|dewatering)\b/i;

/** How much of an item description has to be its own before it counts as one. */
const MIN_OWN_LENGTH = 120;

function commonPrefix(left, right) {
  let length = 0;
  const shortest = Math.min(left.length, right.length);
  while (length < shortest && left[length] === right[length]) length += 1;
  return left.slice(0, length);
}

/** The shared opening cut back to the end of its last complete sentence. */
function wholeSentencesOf(prefix) {
  // The whole of it, when the item before ended exactly there — a heading row is
  // stored as the heading alone, so the shared opening runs to its final full stop
  // with no space after it to find.
  if (/\.\s*$/.test(prefix)) return prefix;
  const end = prefix.lastIndexOf('. ');
  return end < 0 ? '' : prefix.slice(0, end + 2);
}

/**
 * Strips the carried-over heading from every item that has one, in place.
 * Returns the codes that changed, so the build can report them.
 *
 * Repeated until a pass finds nothing: stripping an item changes what the item after
 * it is compared with, which can reveal a heading the first pass could not see. The
 * result is therefore stable — running it again over its own output changes nothing.
 */
function stripCarriedOverHeadings(items) {
  const stripped = [];
  let pass = onePass(items);
  while (pass.length > 0) {
    stripped.push(...pass);
    pass = onePass(items);
  }
  return stripped;
}

function onePass(items) {
  const stripped = [];
  // Each item is compared with what the item before it ORIGINALLY said. Reading the
  // running array instead would compare against a description already stripped, and a
  // run of consecutive items carrying the same stale heading would keep all but the
  // first of them.
  const asRead = items.map(item => String(item.d || ''));
  for (let index = 1; index < items.length; index += 1) {
    const previous = asRead[index - 1];
    const current = asRead[index];
    const shared = wholeSentencesOf(commonPrefix(previous, current));
    if (!shared) continue;
    const own = current.slice(shared.length).trim();
    if (own.length < MIN_OWN_LENGTH) continue;
    if (!/^[A-Z]/.test(own)) continue;
    // Or it is a heading row, and what follows the shared opening is the heading the
    // items under it all begin with — 041350 carries 041344's wording in front of
    // "Longitudinally slewing of steel plate girders …", which 041351 and 041352 then
    // open with. That is proof, where the opening word alone is only a guess.
    const opensTheNextItem = index + 1 < items.length && asRead[index + 1].startsWith(own);
    if (!ITEM_OPENERS.test(own) && !opensTheNextItem) continue;
    items[index].d = own;
    stripped.push(items[index].c);
  }
  return stripped;
}

module.exports = { stripCarriedOverHeadings };
