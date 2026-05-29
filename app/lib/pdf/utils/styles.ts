
/**
 * PDF styling constants and utilities
 */

export const PDF_COLORS = {
  primary: '#1e40af',
  secondary: '#64748b',
  success: '#16a34a',
  warning: '#f59e0b',
  danger: '#dc2626',
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  },
  blue: {
    50: '#eff6ff',
    100: '#dbeafe',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
  },
};

export const PDF_FONTS = {
  title: {
    size: 24,
    weight: 'bold',
    color: PDF_COLORS.primary,
  },
  heading1: {
    size: 18,
    weight: 'bold',
    color: PDF_COLORS.gray[800],
  },
  heading2: {
    size: 16,
    weight: 'bold',
    color: PDF_COLORS.gray[700],
  },
  heading3: {
    size: 14,
    weight: 'bold',
    color: PDF_COLORS.gray[700],
  },
  body: {
    size: 11,
    weight: 'normal',
    color: PDF_COLORS.gray[800],
  },
  small: {
    size: 9,
    weight: 'normal',
    color: PDF_COLORS.gray[600],
  },
  tableHeader: {
    size: 10,
    weight: 'bold',
    color: '#ffffff',
  },
  tableBody: {
    size: 10,
    weight: 'normal',
    color: PDF_COLORS.gray[800],
  },
};

export const PDF_SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const PDF_TABLE_STYLES = {
  headerBackground: PDF_COLORS.blue[600],
  headerText: '#ffffff',
  evenRowBackground: PDF_COLORS.gray[50],
  oddRowBackground: '#ffffff',
  borderColor: PDF_COLORS.gray[300],
  borderWidth: 1,
  cellPadding: PDF_SPACING.sm,
};

export const PDF_PAGE_CONFIG = {
  A4: {
    width: 595.28,
    height: 841.89,
  },
  margins: {
    top: 50,
    right: 40,
    bottom: 50,
    left: 40,
  },
};

/**
 * Get text color based on value (for PVC display)
 */
export function getPVCColor(pvcAmount: number): string {
  if (pvcAmount > 0) return PDF_COLORS.success;
  if (pvcAmount < 0) return PDF_COLORS.danger;
  return PDF_COLORS.gray[700];
}

/**
 * Get background color for table rows
 */
export function getRowBackground(index: number, alternateRows: boolean = true): string {
  if (!alternateRows) return '#ffffff';
  return index % 2 === 0 ? PDF_TABLE_STYLES.evenRowBackground : PDF_TABLE_STYLES.oddRowBackground;
}
