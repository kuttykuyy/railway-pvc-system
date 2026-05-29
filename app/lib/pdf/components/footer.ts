
/**
 * PDF footer component
 */

import { formatDate } from '../utils/formatting';
import { PDF_COLORS, PDF_FONTS, PDF_SPACING } from '../utils/styles';

export interface PDFFooterOptions {
  generatedBy?: string;
  timestamp?: Date;
  pageNumber?: boolean;
  customText?: string;
}

/**
 * Generate PDF footer HTML
 */
export function generateFooter(options: PDFFooterOptions = {}): string {
  const { generatedBy, timestamp, customText } = options;
  const now = timestamp || new Date();
  
  return `
    <div style="
      border-top: 1px solid ${PDF_COLORS.gray[300]};
      padding-top: ${PDF_SPACING.sm}px;
      margin-top: ${PDF_SPACING.xl}px;
      font-size: ${PDF_FONTS.small.size}px;
      color: ${PDF_COLORS.gray[600]};
      text-align: center;
    ">
      ${customText || `
        <p style="margin: 0;">
          Generated on ${formatDate(now)} at ${now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
          ${generatedBy ? ` by ${generatedBy}` : ''}
        </p>
        <p style="margin: ${PDF_SPACING.xs}px 0 0 0;">
          Indian Railway PVC Management System
        </p>
      `}
    </div>
  `;
}

/**
 * Generate simple footer
 */
export function generateSimpleFooter(): string {
  return generateFooter({
    customText: `
      <p style="margin: 0;">
        This is a system-generated document. No signature is required.
      </p>
    `,
  });
}
