import { findScheduleRates } from './contract-schedules';

/** DSR 2021 item 5.35, the published cement rate the derivation starts from. */
export const DEFAULT_DSR_BASE_RATE = 688.45;

export interface CementRateSettings {
  escalation: string;
  bidRate: string;
  rebate: string;
}

export const EMPTY_CEMENT_RATE_SETTINGS: CementRateSettings = { escalation: '', bidRate: '', rebate: '' };

/**
 * Base rate -> escalation -> bid rate -> rebate, in that order. Written once because two
 * calculators derive this figure — the manual bill form's and the PDF analyzer's — and a
 * bill must not get a different cement rate depending on which one the user came through.
 */
export function deriveCementRate(baseRate: number, settings?: CementRateSettings | null) {
  const s = settings || EMPTY_CEMENT_RATE_SETTINGS;
  const escalation = parseFloat(s.escalation) || 0;
  const bidRate = parseFloat(s.bidRate) || 0;
  const rebate = parseFloat(s.rebate) || 0;

  const perQuintal = (Number(baseRate) || 0)
    * (1 + escalation / 100)
    * (1 + bidRate / 100)
    * (1 - rebate / 100);

  return { perQuintal, perMt: perQuintal * 10 };
}

/**
 * What a schedule's rate settings are before anyone overrides them: escalation and bid
 * rate are agreed per schedule on the contract, the rebate once for the whole agreement.
 * A contract that records none of them means none were agreed — the rate is then the base
 * rate, which is the figure the manual button has always produced too.
 */
export function contractCementRateSettings(
  contractSchedules: unknown,
  scheduleName: string,
  contractRebate?: number | null,
): CementRateSettings {
  const agreed = findScheduleRates(contractSchedules, scheduleName);
  return {
    escalation: agreed?.escalation ?? '',
    bidRate: agreed?.bidRate ?? '',
    rebate: contractRebate != null ? String(contractRebate) : '',
  };
}

/** True when the user has put nothing of their own into a schedule's settings. */
export function isBlankCementRateSettings(settings?: CementRateSettings | null) {
  return !settings || (!settings.escalation && !settings.bidRate && !settings.rebate);
}
