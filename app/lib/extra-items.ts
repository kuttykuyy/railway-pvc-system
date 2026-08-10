/**
 * Finding items on a bill that the LOA never accepted.
 *
 * The LOA fixes the work as at the day it is issued. An item billed later that is not
 * in it was ordered during execution — an extra item under Cl.39(1)(b) — and
 * Cl.46A.1(b) puts those outside price variation unless applicability of PVC and a base
 * month were specially agreed when their rates were fixed.
 *
 * Only the B schedules are checked. The A schedules quote a published book — USSOR or
 * CPWD-DSR — and an LOA does not list their thousands of item numbers one by one; an
 * item absent from such a list says nothing. A B schedule is the tenderer's own quoted
 * list, short and enumerated, so absence from it is meaningful.
 *
 * Nothing here excludes anything. It reports candidates and their value, for a person
 * to confirm: an item wrongly called extra costs the contractor its price variation,
 * and the LOA reading is not certain enough to spend someone's money on unattended.
 */
import { normalizeSchedules, type ContractSchedule } from './contract-schedules';
import { matchExtractedSchedule } from './bill-schedule-matching';

export interface BillItemForExtraCheck {
  itemNo?: string;
  dsrCode?: string;
  description?: string;
  schedule?: string;
  scheduleGroup?: string;
  chapter?: string;
  amountSinceLastBill?: number;
  pageNumber?: number;
}

export interface ExtraItemCandidate {
  itemNo: string;
  description: string;
  schedule: string;
  amount: number;
  pageNumber?: number;
}

export interface ExtraItemsReport {
  /** Items on a B schedule whose number is not in that schedule's LOA list. */
  candidates: ExtraItemCandidate[];
  /** Their total, ready to be offered as the amount outside PVC. */
  total: number;
  /** B schedules on the bill for which the LOA listed no items, so nothing was judged. */
  schedulesWithoutLoaItems: string[];
}

/** A B schedule — the tenderer's own quoted items, which an LOA does enumerate. */
function isBSchedule(name: string): boolean {
  return /\bB\s?\d*\b/.test(String(name || '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' '));
}

/**
 * Item numbers compare loosely on punctuation and case only. "1710 14" and "171014" are
 * the same item written two ways; "1" and "1.1" are not, and are kept apart.
 */
function keyOf(itemNo: string): string {
  return String(itemNo || '').toUpperCase().replace(/[\s()]+/g, '').replace(/[-/]/g, '.');
}

export function findExtraItems(
  items: BillItemForExtraCheck[],
  contractSchedules: unknown,
): ExtraItemsReport {
  const schedules: ContractSchedule[] = normalizeSchedules(contractSchedules);
  const names = schedules.map(schedule => schedule.name).filter(Boolean);
  const byName = new Map(schedules.map(schedule => [schedule.name, schedule]));

  const candidates: ExtraItemCandidate[] = [];
  const unlisted = new Set<string>();

  for (const item of items) {
    const matched = matchExtractedSchedule(names, [item.schedule, item.scheduleGroup, item.chapter]);
    if (!matched || !isBSchedule(matched)) continue;

    const schedule = byName.get(matched);
    const accepted = schedule?.items ?? [];
    if (accepted.length === 0) {
      // The LOA listed nothing for this schedule, so absence proves nothing.
      unlisted.add(matched);
      continue;
    }

    const itemNo = String(item.itemNo || item.dsrCode || '').trim();
    if (!itemNo) continue;
    const acceptedKeys = new Set(accepted.map(keyOf));
    if (acceptedKeys.has(keyOf(itemNo))) continue;

    candidates.push({
      itemNo,
      description: String(item.description || '').trim(),
      schedule: matched,
      amount: Number(item.amountSinceLastBill) || 0,
      pageNumber: item.pageNumber,
    });
  }

  return {
    candidates,
    total: Math.round(candidates.reduce((sum, item) => sum + item.amount, 0) * 100) / 100,
    schedulesWithoutLoaItems: [...unlisted],
  };
}
