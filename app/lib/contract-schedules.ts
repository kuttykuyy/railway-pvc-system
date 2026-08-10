/**
 * Contract schedules and their rate settings.
 *
 * Escalation % and bid rate % are agreed PER SCHEDULE, so they live here on each
 * schedule. The rebate % is agreed ONCE for the whole agreement and lives on
 * Contract.rebatePercentage — not here. None of them belong on an individual bill:
 * they are captured on the contract and reused by every bill.
 *
 * Storage note: Contract.schedules is a Json column that historically held a
 * plain string[] of schedule names. It now holds ContractSchedule objects. These
 * helpers read BOTH shapes so existing contracts keep working with no migration.
 *
 * Pure module — no prisma import, so it is safe to use in client components.
 */

/**
 * Declared as a `type` (not an `interface`) on purpose: interfaces have no implicit
 * index signature, so ContractSchedule[] would not satisfy Prisma's InputJsonValue
 * when written to the Json column. A type alias does.
 */
export type ContractSchedule = {
  /** Free-text label, e.g. "A1" or "Schedule A1 - Road work". */
  name: string;
  /** Percentages kept as strings so an empty box stays empty (not 0). */
  escalation: string;
  bidRate: string;
  /**
   * The item numbers the LOA accepted under this schedule.
   *
   * The LOA fixes the work at the time it is issued. An item appearing on a bill under
   * a B schedule that is not in this list was ordered afterwards — an extra item under
   * Cl.39(1)(b), which Cl.46A.1(b) puts outside price variation unless PVC and a base
   * month were specially agreed when its rate was fixed.
   *
   * Empty means unknown, not "no items": a contract entered before this was captured,
   * or an LOA the reader could not list. Nothing is treated as extra on an empty list.
   */
  items?: string[];
};

export const emptySchedule = (name = ''): ContractSchedule => ({
  name,
  escalation: '',
  bidRate: '',
  items: [],
});

const asPercentString = (v: unknown): string =>
  v === null || v === undefined || v === '' ? '' : String(v);

/** Reads Contract.schedules in either the legacy string[] or the object form. */
export function normalizeSchedules(raw: unknown): ContractSchedule[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s): ContractSchedule => {
      if (typeof s === 'string') return emptySchedule(s);
      if (s && typeof s === 'object') {
        const o = s as Record<string, unknown>;
        return {
          name: String(o.name ?? ''),
          escalation: asPercentString(o.escalation),
          bidRate: asPercentString(o.bidRate),
          items: Array.isArray(o.items)
            ? o.items.map(value => String(value).trim()).filter(Boolean)
            : [],
        };
      }
      return emptySchedule();
    })
    .filter((s) => s.name.trim() !== '');
}

/** Just the schedule labels — for dropdowns that only need names. */
export function scheduleNames(raw: unknown): string[] {
  return normalizeSchedules(raw).map((s) => s.name);
}

/**
 * Finds the rates for a schedule label. Bills often carry a short code ("A1")
 * while the contract may store a fuller label ("Schedule A1 - Road work"), so
 * match exactly first, then fall back to a loose contains/leading-code match.
 */
export function findScheduleRates(raw: unknown, label: string): ContractSchedule | undefined {
  const schedules = normalizeSchedules(raw);
  const needle = String(label || '').trim().toLowerCase();
  if (!needle) return undefined;

  const exact = schedules.find((s) => s.name.trim().toLowerCase() === needle);
  if (exact) return exact;

  const code = (v: string) => (v.match(/[A-Za-z]\d+/)?.[0] || '').toLowerCase();
  const needleCode = code(needle);
  return schedules.find((s) => {
    const n = s.name.trim().toLowerCase();
    if (n.includes(needle) || needle.includes(n)) return true;
    return !!needleCode && code(n) === needleCode;
  });
}

/** True when any schedule carries a rate setting worth reusing on a bill. */
export function hasScheduleRates(raw: unknown): boolean {
  return normalizeSchedules(raw).some((s) => s.escalation || s.bidRate);
}
