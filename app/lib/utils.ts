/**
 * Utility functions for the Railway PVC System
 * Provides common formatting, validation, and helper functions
 */

import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Merge Tailwind CSS classes with clsx
 * Handles conditional classes and removes duplicates
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format duration in seconds to HH:MM:SS format
 * @param seconds - Duration in seconds
 * @returns Formatted duration string
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '00:00:00';
  }

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = Math.floor(seconds % 60)

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
}

/**
 * Format a number as Indian currency (₹)
 * Handles null/undefined values gracefully
 * @param amount - The amount to format
 * @param decimals - Number of decimal places (default: 0)
 * @param compact - Use compact notation (Cr/L/K) for large amounts (default: true)
 * @returns Formatted currency string
 */
export function formatCurrency(
  amount: number | null | undefined, 
  decimals: number = 0, 
  compact: boolean = true
): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return '₹0';
  }
  
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  
  if (!compact) {
    return `${sign}₹${absAmount.toLocaleString('en-IN', { 
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals 
    })}`;
  }
  
  // For large amounts, format with lakhs/crores
  if (absAmount >= 10000000) {
    // Crores
    return `${sign}₹${(absAmount / 10000000).toFixed(decimals)}Cr`;
  } else if (absAmount >= 100000) {
    // Lakhs
    return `${sign}₹${(absAmount / 100000).toFixed(decimals)}L`;
  } else if (absAmount >= 1000) {
    // Thousands
    return `${sign}₹${(absAmount / 1000).toFixed(decimals)}K`;
  }
  
  return `${sign}₹${absAmount.toFixed(decimals)}`;
}

/**
 * Format a date string to DD-MM-YYYY format in IST (Asia/Kolkata)
 * Handles invalid dates gracefully
 * @param dateString - The date string or Date object to format (YYYY-MM-DD or Date object)
 * @param includeTime - Whether to include time (default: false)
 * @returns Formatted date string (DD-MM-YYYY) or empty string if invalid
 */
export function formatDate(
  dateString: string | Date | null | undefined, 
  includeTime: boolean = false
): string {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  
  if (!Number.isFinite(date.getTime())) {
    return '';
  }
  
  const { year, month, day, hour, minute } = getISTPartsLocal(date);
  
  let formatted = `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
  
  if (includeTime) {
    formatted += ` ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  
  return formatted;
}

/** Extract date parts in IST timezone */
function getISTPartsLocal(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
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
    hour: get('hour') === 24 ? 0 : get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/**
 * Convert DD-MM-YYYY format to YYYY-MM-DD format (for input fields)
 * @param ddmmyyyy - Date string in DD-MM-YYYY format
 * @returns Date string in YYYY-MM-DD format or empty string if invalid
 */
export function convertToInputFormat(ddmmyyyy: string | null | undefined): string {
  if (!ddmmyyyy) return '';
  
  const parts = ddmmyyyy.split('-');
  if (parts.length !== 3) return '';
  
  const [day, month, year] = parts;
  return `${year}-${month}-${day}`;
}

/**
 * Convert YYYY-MM-DD format to DD-MM-YYYY format (for display)
 * @param yyyymmdd - Date string in YYYY-MM-DD format
 * @returns Date string in DD-MM-YYYY format or empty string if invalid
 */
export function convertToDisplayFormat(yyyymmdd: string | null | undefined): string {
  if (!yyyymmdd) return '';
  
  const parts = yyyymmdd.split('-');
  if (parts.length !== 3) return '';
  
  const [year, month, day] = parts;
  return `${day}-${month}-${year}`;
}

/**
 * Safely parse a number from string or number input
 * @param value - Value to parse
 * @param defaultValue - Default value if parsing fails
 * @returns Parsed number or default value
 */
export function safeParseFloat(value: string | number | null | undefined, defaultValue: number = 0): number {
  if (value === null || value === undefined) return defaultValue;
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

/**
 * Safely parse an integer from string or number input
 * @param value - Value to parse
 * @param defaultValue - Default value if parsing fails
 * @returns Parsed integer or default value
 */
export function safeParseInt(value: string | number | null | undefined, defaultValue: number = 0): number {
  if (value === null || value === undefined) return defaultValue;
  const parsed = typeof value === 'number' ? Math.floor(value) : parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

/**
 * Truncate text to a maximum length with ellipsis
 * @param text - Text to truncate
 * @param maxLength - Maximum length before truncation
 * @param suffix - Suffix to add when truncated (default: '...')
 * @returns Truncated text
 */
export function truncateText(text: string | null | undefined, maxLength: number, suffix: string = '...'): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Debounce function execution
 * @param func - Function to debounce
 * @param wait - Wait time in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Check if a value is a valid date
 * @param date - Value to check
 * @returns True if valid date
 */
export function isValidDate(date: unknown): date is Date {
  return date instanceof Date && Number.isFinite(date.getTime());
}

/**
 * Get initials from a name
 * @param name - Full name
 * @param maxLength - Maximum number of initials (default: 2)
 * @returns Initials string
 */
export function getInitials(name: string | null | undefined, maxLength: number = 2): string {
  if (!name) return '';
  
  const parts = name.trim().split(/\s+/);
  const initials = parts
    .map(part => part[0])
    .filter(Boolean)
    .slice(0, maxLength)
    .join('')
    .toUpperCase();
    
  return initials;
}

/**
 * Sleep for a specified duration
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after the duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a random string of specified length
 * @param length - Length of the string
 * @returns Random string
 */
export function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Check if a string is a valid email
 * @param email - Email string to validate
 * @returns True if valid email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Format percentage with specified decimals
 * @param value - Decimal value (e.g., 0.1 for 10%)
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted percentage string
 */
export function formatPercentage(value: number, decimals: number = 2): string {
  if (!Number.isFinite(value)) return '0%';
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Clamp a number between min and max values
 * @param value - Value to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}