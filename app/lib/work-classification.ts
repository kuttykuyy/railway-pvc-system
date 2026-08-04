export interface MainWorkClassification {
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
      /\bcutting\b/i, 
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
      /\bballast\b/i, 
      /\bstone\s*chips\b/i, 
      /\bcrushed\s*stone\b/i,
      /\bsupply\s*of\s*ballast\b/i
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
      /\bglued\s*joint\b/i
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
    return { code: '9', label: 'Any Other Works', reason: 'No unique match to GCC main groups 1-8.', matchedKeywords: [] };
  }
  return {
    code: best.code,
    label: best.label,
    reason: `Matched ${best.label} from Name of Work.`,
    matchedKeywords: best.matchedKeywords,
  };
}

export function classificationCodeMatchesWork(subClassificationCode: string, workDescription: string): boolean {
  return String(subClassificationCode || '').trim().startsWith(inferMainClassification(workDescription).code);
}

export function hasDedicatedClassificationSuffix(codes: string[], suffix: 'B' | 'C'): boolean {
  return codes.some(code => String(code || '').trim().toUpperCase().endsWith(suffix));
}
