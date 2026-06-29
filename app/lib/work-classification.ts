export interface MainWorkClassification {
  code: string;
  label: string;
  reason: string;
}

const MAIN_CLASSIFICATION_RULES: Array<{ code: string; label: string; patterns: RegExp[] }> = [
  { code: '1', label: 'Earthwork in Formation', patterns: [/\bearth\s*work\b/i, /\bformation\b/i, /\bembankment\b/i, /\bcutting\b/i, /\bcompaction\b/i] },
  { code: '2', label: 'Ballast Supply Works', patterns: [/\bballast\b/i, /\bstone chips\b/i, /\bcrushed stone\b/i] },
  { code: '5', label: 'Building Works', patterns: [/\bbuilding/i, /\bquarters?\b/i, /\boffices?\b/i, /\bsub[ -]?stores?\b/i, /\brest rooms?\b/i, /\bstaff rooms?\b/i, /\bmasonry\b/i, /\bplaster(?:ing)?\b/i] },
  { code: '6', label: 'Bridges & Protection Work', patterns: [/\bbridge\b/i, /\bculvert\b/i, /\bR[OU]B\b/i, /\bprotection(?:\s+work|\s+arrangement)?s?\b/i, /\brock[ -]?fall\b/i, /\bretaining wall\b/i] },
  { code: '7', label: 'Permanent Way Linking', patterns: [/\bpermanent way\b/i, /\btrack (?:laying|linking)\b/i, /\brailway track\b/i, /\bsleepers?\b/i] },
  { code: '8', label: 'Platform, Passenger Amenities', patterns: [/\bplatforms?\b/i, /\bpassenger amenit/i, /\bwaiting rooms?\b/i, /\bshelters?\b/i, /\bCOPs?\b/i] },
];

export function inferMainClassification(workDescription: string): MainWorkClassification {
  const contractText = String(workDescription || '').trim();
  if (/\btunnel(?:ling|ing)?\b|\bTBM\b|\bunderground\b/i.test(contractText)) {
    const usesExplosives = /\bexplosive|\bblasting\b|drill and blast/i.test(contractText);
    return {
      code: usesExplosives ? '4' : '3',
      label: usesExplosives ? 'Tunnelling Works (With Explosives)' : 'Tunnelling Works (Without Explosives)',
      reason: usesExplosives ? 'Tunnel scope with blasting/explosives.' : 'Tunnel scope without blasting/explosives evidence.',
    };
  }

  const scored = MAIN_CLASSIFICATION_RULES
    .map(rule => ({ ...rule, score: rule.patterns.filter(pattern => pattern.test(contractText)).length }))
    .sort((left, right) => right.score - left.score);
  const best = scored[0];
  if (!best || best.score === 0 || best.score === (scored[1]?.score || 0)) {
    return { code: '9', label: 'Any Other Works', reason: 'No unique match to GCC main groups 1-8.' };
  }
  return { code: best.code, label: best.label, reason: `Matched ${best.label} from Name of Work.` };
}

export function classificationCodeMatchesWork(subClassificationCode: string, workDescription: string): boolean {
  return String(subClassificationCode || '').trim().startsWith(inferMainClassification(workDescription).code);
}

export function hasDedicatedClassificationSuffix(codes: string[], suffix: 'B' | 'C'): boolean {
  return codes.some(code => String(code || '').trim().toUpperCase().endsWith(suffix));
}
