/**
 * AI classification for a bill typed in from a spreadsheet.
 *
 * A PDF bill's items arrive with an AI-suggested classification code from the
 * extraction pass; a spreadsheet's items had only the deterministic keyword
 * classifier, which knows the item wording but not the judgement — "is this
 * fabrication including steel (D) or excluding it (E)?" — that an officer applies.
 * This asks the model that one question per item, in one call, and hands the
 * answers to the same deterministic classifier the PDF path uses, which already
 * honours a valid AI code and writes the justification around it.
 *
 * Pure: the prompt is built here and the reply applied here; the network call is
 * the caller's, so this can be tested without a model.
 */

export interface SheetClassificationItem {
  itemNo: string;
  description: string;
  unit?: string;
  amountSinceLastBill?: number;
  isSteelItem?: boolean;
  steelType?: string;
  isCementAffected?: boolean;
  suggestedClassificationCode?: string;
  suggestedClassificationReason?: string;
}

const CODE_RE = /^[1-9][A-E]?$/;

/** The main groups, exactly as GCC-2022 Clause 46A names them. */
const MAIN_GROUPS = [
  '1 earthwork in formation', '2 ballast supply', '3 tunnelling without explosives',
  '4 tunnelling with explosives', '5 building works', '6 bridges / protection works',
  '7 permanent-way linking', '8 platforms / passenger amenities', '9 other works',
].join('; ');

export function buildSheetClassificationPrompt(o: {
  workDescription: string;
  mainCode: string;
  items: SheetClassificationItem[];
}): string {
  const rows = o.items.map((item, index) => ({
    n: index + 1,
    itemNo: item.itemNo,
    description: String(item.description || '').replace(/\s+/g, ' ').slice(0, 240),
    unit: item.unit || '',
    amount: Number(item.amountSinceLastBill || 0),
    steel: item.isSteelItem ? (item.steelType || 'yes') : 'no',
    cement: item.isCementAffected ? 'yes' : 'no',
  }));
  return `You classify Indian Railways contract bill items for price variation under GCC-2022 Clause 46A.

Name of Work: ${o.workDescription || '(not given)'}
Main classification group already decided from the Name of Work: ${o.mainCode || '(unknown)'}.
Main groups: ${MAIN_GROUPS}.

For EVERY item return the classification code = main group digit + suffix, where the suffix is:
A general work items; B separate supply of steel; C separate supply of cement (or grout); D fabrication/erection INCLUDING the cost of steel; E fabrication/erection EXCLUDING steel (steel supplied separately). Groups 2 and 7 take no suffix.
Rules:
- Keep the main group digit as given unless the item is plainly under a different Name of Work; never change it because of the schedule or chapter.
- A TMT / structural steel SUPPLY item is B. A cement supply item (OPC/PPC/PSC by the tonne) is C.
- Concrete, masonry, earthwork, painting, road work and the like are A.
- Steel fabrication or erection priced with its steel is D; the same work when the steel is paid under a separate item or supplied by the Railway is E.
- The justification is 1-2 sentences quoting the words of the item description that decide the suffix. Do not invent wording the description does not carry.

Items (JSON):
${JSON.stringify(rows)}

Return ONLY a compact JSON object: {"items":[{"n":1,"code":"6A","reason":"..."}, ...]} with one entry for every n.`;
}

/**
 * Apply the model's answer. Only a well-formed code is taken; anything else leaves
 * the item for the deterministic classifier. Returns how many items were classified.
 */
export function applySheetClassification(items: SheetClassificationItem[], reply: unknown): number {
  const list = Array.isArray((reply as any)?.items) ? (reply as any).items : [];
  let applied = 0;
  for (const entry of list) {
    const n = Number(entry?.n);
    const item = Number.isInteger(n) && n >= 1 && n <= items.length ? items[n - 1] : undefined;
    if (!item) continue;
    const code = String(entry?.code || '').trim().toUpperCase();
    if (!CODE_RE.test(code)) continue;
    item.suggestedClassificationCode = code;
    const reason = String(entry?.reason || '').replace(/\s+/g, ' ').trim().slice(0, 600);
    if (reason) item.suggestedClassificationReason = reason;
    applied += 1;
  }
  return applied;
}
