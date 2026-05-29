
/**
 * PDF header component
 */

import { formatDate } from '../utils/formatting';
import { PDF_COLORS, PDF_FONTS, PDF_SPACING } from '../utils/styles';

export interface PDFHeaderOptions {
  title: string;
  subtitle?: string;
  contractNumber?: string;
  billNumber?: string;
  date?: Date;
  logo?: string;
}

/**
 * Generate PDF header HTML
 */
export function generateHeader(options: PDFHeaderOptions): string {
  const { title, subtitle, contractNumber, billNumber, date } = options;
  
  return `
    <div style="
      border-bottom: 3px solid ${PDF_COLORS.blue[600]};
      padding-bottom: ${PDF_SPACING.md}px;
      margin-bottom: ${PDF_SPACING.lg}px;
    ">
      <div style="text-align: center;">
        <h1 style="
          font-size: ${PDF_FONTS.title.size}px;
          font-weight: ${PDF_FONTS.title.weight};
          color: ${PDF_FONTS.title.color};
          margin: 0 0 ${PDF_SPACING.sm}px 0;
        ">${title}</h1>
        ${subtitle ? `
          <p style="
            font-size: ${PDF_FONTS.heading3.size}px;
            color: ${PDF_COLORS.gray[600]};
            margin: 0 0 ${PDF_SPACING.md}px 0;
          ">${subtitle}</p>
        ` : ''}
      </div>
      
      <div style="
        display: flex;
        justify-content: space-between;
        margin-top: ${PDF_SPACING.md}px;
        font-size: ${PDF_FONTS.body.size}px;
      ">
        ${contractNumber ? `
          <div>
            <strong>Contract:</strong> ${contractNumber}
          </div>
        ` : ''}
        ${billNumber ? `
          <div>
            <strong>Bill No:</strong> ${billNumber}
          </div>
        ` : ''}
        ${date ? `
          <div>
            <strong>Date:</strong> ${formatDate(date)}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Generate simple header (for bulk reports)
 */
export function generateSimpleHeader(title: string): string {
  return `
    <div style="
      text-align: center;
      border-bottom: 2px solid ${PDF_COLORS.blue[600]};
      padding-bottom: ${PDF_SPACING.md}px;
      margin-bottom: ${PDF_SPACING.lg}px;
    ">
      <h1 style="
        font-size: ${PDF_FONTS.title.size}px;
        font-weight: ${PDF_FONTS.title.weight};
        color: ${PDF_FONTS.title.color};
        margin: 0;
      ">${title}</h1>
    </div>
  `;
}
