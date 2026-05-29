
/**
 * Formatting utilities for PDF generation
 */

/**
 * Format number as Indian currency (₹)
 */
export function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format number with specified decimal places
 */
export function formatNumber(value: number, decimals: number = 2): string {
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format date as DD-MM-YYYY in IST
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const parts = getISTPartsPdf(d);
  return `${String(parts.day).padStart(2, '0')}-${String(parts.month).padStart(2, '0')}-${parts.year}`;
}

/**
 * Format date as Month-Year (e.g., "January-2024") in IST
 */
export function formatMonthYear(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const parts = getISTPartsPdf(d);
  return `${monthNames[parts.month - 1]}-${parts.year}`;
}

/** Extract date parts in IST timezone for PDF formatting */
function getISTPartsPdf(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') === 24 ? 0 : get('hour'), minute: get('minute'), second: get('second') };
}

/**
 * Format percentage with % symbol
 */
export function formatPercentage(value: number, decimals: number = 2): string {
  return `${formatNumber(value, decimals)}%`;
}

/**
 * Convert number to words (Indian system)
 */
export function numberToWords(num: number): string {
  if (num === 0) return 'Zero';
  
  const isNegative = num < 0;
  num = Math.abs(num);
  
  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  function convertHundreds(n: number): string {
    if (n === 0) return '';
    if (n < 10) return units[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) {
      const ten = Math.floor(n / 10);
      const unit = n % 10;
      return tens[ten] + (unit > 0 ? ' ' + units[unit] : '');
    }
    const hundred = Math.floor(n / 100);
    const remainder = n % 100;
    return units[hundred] + ' Hundred' + (remainder > 0 ? ' and ' + convertHundreds(remainder) : '');
  }
  
  // Handle crores, lakhs, thousands
  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const remainder = Math.floor(num % 1000);
  
  let words = '';
  if (crore > 0) words += convertHundreds(crore) + ' Crore ';
  if (lakh > 0) words += convertHundreds(lakh) + ' Lakh ';
  if (thousand > 0) words += convertHundreds(thousand) + ' Thousand ';
  if (remainder > 0) words += convertHundreds(remainder);
  
  // Handle decimal part
  const decimalPart = Math.round((num - Math.floor(num)) * 100);
  if (decimalPart > 0) {
    words += ' Rupees and ' + convertHundreds(decimalPart) + ' Paise';
  } else {
    words += ' Rupees';
  }
  
  return (isNegative ? 'Minus ' : '') + words.trim() + ' Only';
}

/**
 * Truncate text to specified length
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Wrap text to specified width
 */
export function wrapText(text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  
  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * Format index value with proper precision
 */
export function formatIndexValue(value: number): string {
  return formatNumber(value, 2);
}

/**
 * Format variation ratio
 */
export function formatVariationRatio(ratio: number): string {
  return formatNumber(ratio, 6);
}

/**
 * Get quarter string from date (e.g., "Q1-2024")
 */
export function getQuarterString(date: Date): string {
  const parts = getISTPartsPdf(date);
  const quarter = Math.ceil(parts.month / 3);
  return `Q${quarter}-${parts.year}`;
}

/**
 * Get quarter months
 */
export function getQuarterMonths(quarter: string): string[] {
  const match = quarter.match(/Q(\d)-(\d{4})/);
  if (!match) return [];
  
  const quarterNum = parseInt(match[1]);
  const year = parseInt(match[2]);
  const startMonth = (quarterNum - 1) * 3;
  
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  return [
    monthNames[startMonth],
    monthNames[startMonth + 1],
    monthNames[startMonth + 2]
  ];
}
