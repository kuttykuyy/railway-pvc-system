export interface MainWorkClassification {
  /** Every group the Name of Work names as scope, the winner first. */
  contenders?: { code: string; label: string; score: number }[];
  /** True when the work covers several GCC groups, so no one group fits every item. */
  isMultiScope?: boolean;
  code: string;
  label: string;
  reason: string;
  matchedKeywords: string[];
}

const MAIN_CLASSIFICATION_RULES: Array<{ code: string; label: string; patterns: RegExp[] }> = [
  { 
    code: '1', 
    label: 'Earthwork in Formation', 
    patterns: [
      /\bearth\s*work\b/i, 
      /\bformation\b/i,
      // "embankement" is a persistent misspelling in real Names of Work.
      /\bembanke?ment\b/i,
      // Earthwork cutting, as the phrase is actually used: "in cutting", "cutting and
      // filling", "earthwork in cutting". Bare "cutting" is any cutting at all.
      /\bin\s+cutting\b/i,
      /\bcutting\s*(?:and|&)\s*filling\b/i,
      /\bearth\s*work\s+in\s+cutting\b/i,
      /\bdeep\s+cutting\b/i,
      /\bcompaction\b/i,
      /\bfilling\b/i,
      /\bexcavation\b/i,
      /\bblanket(?:ting)?\b/i
    ] 
  },
  { 
    code: '2', 
    label: 'Ballast Supply Works', 
    patterns: [
      /\bsupply\s*(?:of\s*)?(?:\w+\s+){0,3}ballast\b/i,
      /\bballast\s*supply\b/i,
      /\bcollection\s+of\s+ballast\b/i,
      /\btraining\s+out\s+(?:\w+\s+){0,3}ballast\b/i,
      /\bballast\s+train\b/i,
      /\bstone\s*chips\b/i,
      /\bcrushed\s*stone\b/i
    ] 
  },
  { 
    code: '5', 
    label: 'Building Works', 
    patterns: [
      /\bbuilding/i, 
      /\bquarters?\b/i, 
      /\boffices?\b/i, 
      /\bsub[ -]?stores?\b/i, 
      /\brest\s*rooms?\b/i, 
      /\bstaff\s*rooms?\b/i, 
      /\bmasonry\b/i, 
      /\bplaster(?:ing)?\b/i,
      /\bworkshop\b/i,
      /\bshop\b/i,
      /\bshed\b/i,
      /\bdepot\b/i,
      /\bhostel\b/i,
      /\bbungalow\b/i,
      /\bresidential\b/i,
      /\btoilet\b/i,
      /\broom\b/i,
      /\brenovation\b/i,
      /\bface-lifting\b/i,
      /\bflooring\b/i,
      /\broofing\b/i,
      /\bglazing\b/i,
      /\bpainting\b/i
    ] 
  },
  { 
    code: '6', 
    label: 'Bridges & Protection Work', 
    patterns: [
      /\bbridge\b/i, 
      /\bculvert\b/i, 
      /\bR[OU]B\b/i, 
      /\bprotection(?:\s+work|\s+arrangement)?s?\b/i, 
      /\brock[ -]?fall\b/i, 
      /\bretaining\s*wall\b/i,
      /\bsubstructure\b/i,
      /\bsuperstructure\b/i,
      /\bgirder\b/i,
      /\bviaduct\b/i,
      /\babutment\b/i,
      /\bpier\b/i,
      /\bapron\b/i
    ] 
  },
  { 
    code: '7', 
    label: 'Permanent Way Linking', 
    patterns: [
      /\bpermanent\s*way\b/i, 
      /\btrack\s*(?:laying|linking|renewal|work)\b/i, 
      /\brailway\s*track\b/i, 
      /\bsleepers?\b/i,
      /\bturnout\b/i,
      /\bpoints\s*(?:and|\&)\s*crossing\b/i,
      /\bdeep\s*screening\b/i,
      /\brail\s*welding\b/i,
      /\bwelding\s*of\s*rail\b/i,
      /\bglued\s*joint\b/i,
      /\bp\.?\s*way\b/i,
      /\blinking\b/i,
      /\b(?:LWR|SWR|CWR)\b/,
      /\bfish\s*plates?\b/i,
      /\bslewing\b/i,
      /\bde-?stress(?:ing)?\b/i,
      /\brail\s*(?:cutter|cutting|drilling)\b/i,
      /\b(?:tongue|stock)\s+rail\b/i,
      /\bswitch\s+assembly\b/i,
      /\bcrossings?\b(?!\s*of\s*(?:track|road))/i,
      /\bSEJ\b/,
      /\btrack\b(?:(?!\s*machine).){0,30}\b(?:packing|regrading|lifting|boxing|screening)\b/i,
      /\b(?:packing|regrading|lifting|boxing)\b(?:(?!\s*machine).){0,30}\btrack\b/i,
      /\brails?\s*,?\s*sleepers?\b/i
    ]
  },
  { 
    code: '8', 
    label: 'Platform, Passenger Amenities', 
    patterns: [
      /\bplatforms?\b/i, 
      /\bpassenger\s*amenit/i, 
      /\bwaiting\s*(?:room|hall)s?\b/i, 
      /\bshelters?\b/i, 
      /\bCOPs?\b/i,
      /\bcover\s*over\s*platform\b/i,
      /\bfoot\s*over\s*bridge\b/i,
      /\bFOB\b/i
    ] 
  },
];

export function inferMainClassification(workDescription: string): MainWorkClassification {
  const contractText = String(workDescription || '').trim();
  const tunnelMatch = contractText.match(/\btunnel(?:ling|ing)?\b|\bTBM\b|\bunderground\b/i);
  if (tunnelMatch) {
    const explosiveMatch = contractText.match(/\bexplosive\w*|\bblasting\b|drill and blast/i);
    return {
      code: explosiveMatch ? '4' : '3',
      label: explosiveMatch ? 'Tunnelling Works (With Explosives)' : 'Tunnelling Works (Without Explosives)',
      reason: explosiveMatch ? 'Tunnel scope with blasting/explosives.' : 'Tunnel scope without blasting/explosives evidence.',
      matchedKeywords: explosiveMatch ? [tunnelMatch[0], explosiveMatch[0]] : [tunnelMatch[0]],
      contenders: [{ code: explosiveMatch ? '4' : '3', label: explosiveMatch ? 'Tunnelling Works (With Explosives)' : 'Tunnelling Works (Without Explosives)', score: 1 }],
      isMultiScope: false,
    };
  }

  // Score by how OFTEN each group is referred to, not merely whether it was named
  // once. A Name of Work states its scope repeatedly ("standardization of formation
  // ... strengthening of existing formation"), while an unrelated group often appears
  // a single time in passing ("including retaining wall") or not as scope at all —
  // an addressee's designation, "Senior Section Engineer /Permanent way/BG", used to
  // score Permanent Way Linking exactly as highly as the real subject of the work.
  // Counting distinct patterns left those cases tied, and a tie was settled silently
  // by the order of this array: for group 7, which has no B/C sub-divisions, that
  // would have stripped a TMT item of its steel index.
  const scored = MAIN_CLASSIFICATION_RULES
    .map(rule => {
      const matchedKeywords: string[] = [];
      let score = 0;
      for (const pattern of rule.patterns) {
        const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
        const hits = contractText.match(new RegExp(pattern.source, flags));
        if (!hits?.length) continue;
        score += hits.length;
        matchedKeywords.push(hits[0].trim());
      }
      return { ...rule, matchedKeywords, score };
    })
    .sort((left, right) => right.score - left.score);
  const best = scored[0];
  if (!best || best.score === 0) {
    return { code: '9', label: 'Any Other Works', reason: 'No unique match to GCC main groups 1-8.', matchedKeywords: [], contenders: [], isMultiScope: false };
  }
  // Which OTHER groups the Name of Work also names as scope. A single-scope agreement
  // has one; "Station Building, ROB, RUB/LHS, Major Bridges, Earthwork in Cutting and
  // Filling, Platform, Passenger Amenities" has four, and no single group can be right
  // for every item in it. A contender must be named substantially — twice, and at least
  // half as often as the winner — so an addressee's designation or an incidental
  // "including retaining wall" does not turn a single-scope work into a multi-scope one.
  const contenders = scored.filter(rule =>
    rule.score > 0 && (rule.code === best.code || (rule.score >= 2 && rule.score >= best.score * 0.5)),
  );

  return {
    code: best.code,
    label: best.label,
    reason: `Matched ${best.label} from Name of Work.`,
    matchedKeywords: best.matchedKeywords,
    contenders: contenders.map(rule => ({ code: rule.code, label: rule.label, score: rule.score })),
    isMultiScope: contenders.length > 1,
  };
}

/**
 * Whether the Name of Work is a COMPOSITE work — one agreement enumerating several
 * distinct sub-works, e.g. "(i) Renewal of roof … (ii) Renewal of crane gantry rails …
 * (vi) Conversion of class room". Such an agreement has no single main group: each
 * schedule item rightly takes the class of ITS OWN sub-work (roofing → Buildings,
 * track renewal → its group, steel supply → …B), so items spanning groups is the
 * expected shape, not a red flag. Detected by the enumeration itself — two or more
 * "(i)/(ii)…" or "1)/2)…" markers — which is stronger evidence than keyword scoring.
 */
export function looksCompositeWork(workDescription: string): { isComposite: boolean; subWorkCount: number } {
  const text = String(workDescription || '');
  const roman = text.match(/\((?:i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)\)/gi) || [];
  const numeric = text.match(/(?:^|[\s,])\(?\d{1,2}\)[\s.]/g) || [];
  const count = Math.max(new Set(roman.map(m => m.toLowerCase())).size, new Set(numeric).size);
  return { isComposite: count >= 2, subWorkCount: count };
}

/**
 * DETERMINISTIC steel-nature guard for AI-picked sub-classes: …B ("supply of Steel") is
 * only for TMT / reinforcement supply, while mild/structural steel — bolts, angles,
 * channels, plates, built-up sections, trusses, rails — supplied and fixed belongs to
 * …D ("Fabrication & Erection including Steel Supply"). The AI prompts carry this rule,
 * but a prompt is a request and the model drifts (real bills came back with MS
 * holding-down bolts and structural trusses in 5B); this function is the enforcement.
 * Runs BOTH ways: a reinforcement-supply item is …B, structural steel supplied-and-fixed
 * is …D — and it corrects a code that landed on the wrong one of the two.
 *
 * The decisive rule is REINFORCEMENT WINS. Item descriptions often carry the whole DSR
 * clause dump — e.g. a genuine TMT reinforcement item (5.22.6) whose text also lists
 * "5.22A.1 Mild steel and Medium Tensile steel bars…" — so a plain "mild steel" scan
 * mislabels reinforcement as structural. So: if the item is fundamentally reinforcement
 * (steel reinforcement / rebar / TMT / thermo-mechanically treated) and NOT actually a
 * fabrication/erection of steelwork, it is …B, whatever incidental structural words the
 * dump contains. Only when there is no reinforcement core do the broader structural
 * signals (mild/structural steel, angles, channels, plates, bolts, trusses, fabrication)
 * push a …B to …D.
 */
const REINFORCEMENT = /steel\s+reinforcement|reinforcement\s+(?:for|bars?|steel)|\brebars?\b|thermo-?mechanically\s+treated|\btmt\b|\bhysd\b/i;
const FABRICATION_CORE = /\bfabricat\w*|\berection\b|\berect(?:ing|ed)\b|\btruss(?:es)?\b|\bgirders?\b|built-?up\s+section|\bgantry\b|\bpurlins?\b/i;
const STRUCTURAL_STEEL = /mild\s+steel|\bm\.?s\.?\s+(?:round|flat|angle|channel|plate|section|bolt|rod|bar)|structural\s+steel|built-?up\s+section|truss|girder|\bangles?\b|\bchannels?\b|chequered|\bplates?\b|holding[\s-]?down|anchor\s+bolt|\bbolts?\b|gantry|crane\s+rail|\brails?\b|fabricat|erect/i;
export function enforceSteelSubclassNature(subCode: string | null | undefined, itemDescription: string | null | undefined): string {
  const code = String(subCode || '').trim().toUpperCase();
  const last = code.slice(-1);
  if (last !== 'B' && last !== 'D') return code;
  const text = String(itemDescription || '');
  const digit = code.slice(0, -1);
  // Reinforcement supply is …B and wins over incidental structural words in a DSR dump,
  // unless the item is genuinely fabrication/erection of steelwork.
  if (REINFORCEMENT.test(text) && !FABRICATION_CORE.test(text)) return `${digit}B`;
  // No reinforcement core: a …B carrying structural / other-than-TMT steel is really …D.
  if (last === 'B' && STRUCTURAL_STEEL.test(text)) return `${digit}D`;
  return code;
}

export function classificationCodeMatchesWork(subClassificationCode: string, workDescription: string): boolean {
  return String(subClassificationCode || '').trim().startsWith(inferMainClassification(workDescription).code);
}

export function hasDedicatedClassificationSuffix(codes: string[], suffix: 'B' | 'C'): boolean {
  return codes.some(code => String(code || '').trim().toUpperCase().endsWith(suffix));
}
