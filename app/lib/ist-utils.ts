/**
 * IST (Indian Standard Time) Utilities
 * Centralizes all timezone handling for the IR-PVC system.
 * All dates displayed in this app should use IST (UTC+5:30).
 */

const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Get individual date parts (year, month, day, hour, minute, second) in IST.
 */
export function getISTDateParts(date: Date): {
  year: number;
  month: number; // 1-based (1=Jan)
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) => {
    const p = parts.find((p) => p.type === type);
    return p ? parseInt(p.value, 10) : 0;
  };

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') === 24 ? 0 : get('hour'), // handle edge case
    minute: get('minute'),
    second: get('second'),
  };
}

/**
 * Format a date as DD-MM-YYYY in IST.
 * Optionally include time as HH:MM.
 */
export function formatDateIST(
  dateInput: string | Date | null | undefined,
  includeTime: boolean = false
): string {
  if (!dateInput) return '';

  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (!Number.isFinite(date.getTime())) return '';

  const { year, month, day, hour, minute } = getISTDateParts(date);
  const dd = String(day).padStart(2, '0');
  const mm = String(month).padStart(2, '0');

  let formatted = `${dd}-${mm}-${year}`;

  if (includeTime) {
    const hh = String(hour).padStart(2, '0');
    const min = String(minute).padStart(2, '0');
    formatted += ` ${hh}:${min}`;
  }

  return formatted;
}

/**
 * Format time only as HH:MM:SS in IST (12-hour or 24-hour).
 */
export function formatTimeIST(
  dateInput: string | Date | null | undefined,
  hour12: boolean = true
): string {
  if (!dateInput) return '';

  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (!Number.isFinite(date.getTime())) return '';

  return date.toLocaleTimeString('en-IN', {
    timeZone: IST_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12,
  });
}

/**
 * Format a date using toLocaleDateString in IST.
 * Wrapper that always injects Asia/Kolkata timezone.
 */
export function toLocaleDateStringIST(
  dateInput: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!dateInput) return '';

  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (!Number.isFinite(date.getTime())) return '';

  return date.toLocaleDateString('en-IN', {
    ...options,
    timeZone: IST_TIMEZONE,
  });
}

/**
 * Format a date using toLocaleString (date + time) in IST.
 */
export function toLocaleStringIST(
  dateInput: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!dateInput) return '';

  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (!Number.isFinite(date.getTime())) return '';

  return date.toLocaleString('en-IN', {
    ...options,
    timeZone: IST_TIMEZONE,
  });
}

/**
 * Get the current date/time as a Date object offset to IST.
 * Useful for server-side formatting where you need IST "now".
 * NOTE: The returned Date object's internal UTC value is shifted,
 * so only use getUTC* methods or format it directly.
 */
export function nowIST(): Date {
  return new Date(
    new Date().toLocaleString('en-US', { timeZone: IST_TIMEZONE })
  );
}

/**
 * Format month-year in IST (e.g., "January-2024").
 */
export function formatMonthYearIST(dateInput: Date | string): string {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (!Number.isFinite(date.getTime())) return '';

  const { year, month } = getISTDateParts(date);
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${monthNames[month - 1]}-${year}`;
}

/**
 * Get quarter string from date in IST (e.g., "Q1-2024").
 */
export function getQuarterStringIST(date: Date): string {
  const { year, month } = getISTDateParts(date);
  const quarter = Math.ceil(month / 3);
  return `Q${quarter}-${year}`;
}

/**
 * Convert a Date to a new Date object whose local methods
 * return IST values. Useful as input to date-fns format().
 * 
 * Usage: format(toISTDate(someDate), 'dd-MMM-yyyy HH:mm')
 */
export function toISTDate(date: Date | string): Date {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (!Number.isFinite(d.getTime())) return d;
  return new Date(d.toLocaleString('en-US', { timeZone: IST_TIMEZONE }));
}

export { IST_TIMEZONE };
