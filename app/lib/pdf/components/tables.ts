
/**
 * PDF table generation utilities
 */

import type { PDFTableColumn, PDFTableOptions } from '../types';
import { PDF_TABLE_STYLES, PDF_FONTS, PDF_SPACING, getRowBackground } from '../utils/styles';

/**
 * Generate HTML table from data
 */
export function generateTable(options: PDFTableOptions): string {
  const {
    columns,
    data,
    headerColor = PDF_TABLE_STYLES.headerBackground,
    alternateRows = true,
    fontSize = PDF_FONTS.tableBody.size,
    padding = PDF_SPACING.sm,
  } = options;

  if (data.length === 0) {
    return `<p style="text-align: center; color: #6b7280;">No data available</p>`;
  }

  const tableHTML = `
    <table style="
      width: 100%;
      border-collapse: collapse;
      margin: ${PDF_SPACING.md}px 0;
      font-size: ${fontSize}px;
    ">
      <thead>
        <tr style="background-color: ${headerColor};">
          ${columns.map(col => `
            <th style="
              padding: ${padding}px;
              text-align: ${col.align || 'left'};
              color: ${PDF_TABLE_STYLES.headerText};
              font-weight: ${PDF_FONTS.tableHeader.weight};
              border: ${PDF_TABLE_STYLES.borderWidth}px solid ${PDF_TABLE_STYLES.borderColor};
              ${col.width ? `width: ${col.width};` : ''}
            ">
              ${col.header}
            </th>
          `).join('')}
        </tr>
      </thead>
      <tbody>
        ${data.map((row, rowIndex) => `
          <tr style="background-color: ${getRowBackground(rowIndex, alternateRows)};">
            ${columns.map(col => {
              const value = row[col.key];
              const formattedValue = col.format ? col.format(value) : value;
              return `
                <td style="
                  padding: ${padding}px;
                  text-align: ${col.align || 'left'};
                  border: ${PDF_TABLE_STYLES.borderWidth}px solid ${PDF_TABLE_STYLES.borderColor};
                  color: ${PDF_FONTS.tableBody.color};
                ">
                  ${formattedValue ?? '-'}
                </td>
              `;
            }).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  return tableHTML;
}

/**
 * Generate summary table (2-column key-value pairs)
 */
export function generateSummaryTable(data: Record<string, string | number>): string {
  const rows = Object.entries(data).map(([key, value]) => ({ key, value }));
  
  return generateTable({
    columns: [
      { header: 'Description', key: 'key', align: 'left', width: '60%' },
      { header: 'Value', key: 'value', align: 'right', width: '40%' },
    ],
    data: rows,
    alternateRows: false,
  });
}

/**
 * Generate section header
 */
export function generateSectionHeader(title: string, level: number = 2): string {
  const fontSize = level === 1 ? PDF_FONTS.heading1.size :
                   level === 2 ? PDF_FONTS.heading2.size :
                   PDF_FONTS.heading3.size;
  
  return `
    <h${level} style="
      font-size: ${fontSize}px;
      font-weight: bold;
      color: ${PDF_FONTS.heading1.color};
      margin: ${PDF_SPACING.lg}px 0 ${PDF_SPACING.md}px 0;
      padding-bottom: ${PDF_SPACING.xs}px;
      border-bottom: 2px solid ${PDF_TABLE_STYLES.borderColor};
    ">
      ${title}
    </h${level}>
  `;
}

/**
 * Generate info box
 */
export function generateInfoBox(title: string, content: string, color: string = '#3b82f6'): string {
  return `
    <div style="
      background-color: ${color}15;
      border-left: 4px solid ${color};
      padding: ${PDF_SPACING.md}px;
      margin: ${PDF_SPACING.md}px 0;
      border-radius: 4px;
    ">
      <strong style="color: ${color};">${title}</strong>
      <p style="margin: ${PDF_SPACING.xs}px 0 0 0;">${content}</p>
    </div>
  `;
}

/**
 * Generate two-column layout
 */
export function generateTwoColumns(leftContent: string, rightContent: string): string {
  return `
    <div style="
      display: flex;
      gap: ${PDF_SPACING.md}px;
      margin: ${PDF_SPACING.md}px 0;
    ">
      <div style="flex: 1;">
        ${leftContent}
      </div>
      <div style="flex: 1;">
        ${rightContent}
      </div>
    </div>
  `;
}
