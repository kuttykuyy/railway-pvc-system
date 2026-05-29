/**
 * Bill PDF Report Generator
 * Extracts PDF generation logic from the massive route file
 */

import type { PDFBill, PDFIndices, ComponentPVCBreakdown } from '../types';
import { generateHeader } from '../components/header';
import { generateFooter } from '../components/footer';
import { generateTable, generateSectionHeader, generateSummaryTable, generateInfoBox } from '../components/tables';
import { formatCurrency, formatDate, formatMonthYear, formatNumber, formatPercentage, numberToWords } from '../utils/formatting';
import { calculateComponentBreakdown } from '../utils/calculations';
import { PDF_COLORS } from '../utils/styles';

export interface BillReportData {
  bill: PDFBill;
  indices: PDFIndices;
  calculationDetails: any;
}

/**
 * Generate complete bill PDF report
 */
export async function generateBillPDFReport(data: BillReportData): Promise<string> {
  const { bill, indices } = data;

  const sections: string[] = [];

  // Header
  sections.push(generateHeader({
    title: 'Price Variation Clause (PVC) Analysis Report',
    subtitle: 'Indian Railway Contract',
    contractNumber: bill.contract.contractNumber,
    billNumber: bill.billNumber,
    date: bill.measurementDate,
  }));

  // Contract Details
  sections.push(generateContractSection(bill));

  // Bill Information
  sections.push(generateBillInfoSection(bill));

  // Indices Information
  sections.push(generateIndicesSection(indices, bill));

  // PVC Calculation
  sections.push(generatePVCCalculationSection(bill, indices));

  // Classification Details
  sections.push(generateClassificationsSection(bill, indices));

  // Summary
  sections.push(generateSummarySection(bill));

  // Footer
  sections.push(generateFooter({
    timestamp: new Date(),
  }));

  return wrapInHTML(sections.join('\n'));
}

/**
 * Generate contract details section
 */
function generateContractSection(bill: PDFBill): string {
  const contractData = {
    'Contract Number': bill.contract.contractNumber,
    'Contract Name': bill.contract.contractName,
    'Work Description': bill.contract.workDescription || 'N/A',
    'Work Classification': bill.contract.workClassification || 'N/A',
    'Tender Advertised Value': formatCurrency(bill.contract.tenderAdvertisedValue),
    'Base Date': formatDate(bill.contract.baseDate),
  };

  return `
    ${generateSectionHeader('Contract Details', 2)}
    ${generateSummaryTable(contractData)}
  `;
}

/**
 * Generate bill information section
 */
function generateBillInfoSection(bill: PDFBill): string {
  const billData = {
    'Bill Number': bill.billNumber,
    'Measurement Date': formatDate(bill.measurementDate),
    'Bill Amount': formatCurrency(bill.totalAmount),
    'PVC Amount': formatCurrency(bill.totalPVC),
    'Bill Type': bill.isExtension ? 'Extension/Time Overrun Bill' : 'Regular Bill',
    'GCC Policy': bill.gccPolicyType || 'Standard PVC Policy',
  };

  return `
    ${generateSectionHeader('Bill Information', 2)}
    ${generateSummaryTable(billData)}
    ${bill.isExtension ? generateInfoBox(
      '17B Policy Applied',
      'This is an extension bill. Quarterly average indices are used for PVC calculation.',
      PDF_COLORS.warning
    ) : ''}
  `;
}

/**
 * Generate indices information section
 */
function generateIndicesSection(indices: PDFIndices, bill: PDFBill): string {
  const { baseMonth, measurementMonth } = indices;

  const indexColumns = [
    { header: 'Index', key: 'index', align: 'left' as const },
    { header: 'Base Month', key: 'base', align: 'right' as const, format: formatNumber },
    { header: 'Measurement Month', key: 'measurement', align: 'right' as const, format: formatNumber },
    { header: 'Variation', key: 'variation', align: 'right' as const, format: (v: number) => formatPercentage(v * 100) },
  ];

  const indexData = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'
  ].map(idx => {
    const baseKey = `index${idx}` as keyof typeof baseMonth;
    const baseValue = baseMonth[baseKey] as number;
    const measurementValue = measurementMonth[baseKey] as number;
    const variation = baseValue > 0 ? (measurementValue - baseValue) / baseValue : 0;

    return {
      index: `Index ${idx}`,
      base: baseValue,
      measurement: measurementValue,
      variation,
    };
  });

  return `
    ${generateSectionHeader('Price Indices', 2)}
    <p><strong>Base Month:</strong> ${formatMonthYear(baseMonth.date)}</p>
    <p><strong>Measurement Month:</strong> ${formatMonthYear(measurementMonth.date)}</p>
    ${generateTable({ columns: indexColumns, data: indexData })}
  `;
}

/**
 * Generate PVC calculation section
 */
function generatePVCCalculationSection(bill: PDFBill, indices: PDFIndices): string {
  const totalPVC = bill.totalPVC;
  const totalAmount = bill.totalAmount;
  const pvcPercentage = totalAmount > 0 ? (totalPVC / totalAmount) * 100 : 0;

  return `
    ${generateSectionHeader('PVC Calculation Summary', 2)}
    <div style="background-color: ${PDF_COLORS.blue[50]}; padding: 16px; border-radius: 8px; margin: 16px 0;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
        <div>
          <p style="margin: 0; color: ${PDF_COLORS.gray[600]};">Total Bill Amount</p>
          <h3 style="margin: 4px 0 0 0; font-size: 20px;">${formatCurrency(totalAmount)}</h3>
        </div>
        <div>
          <p style="margin: 0; color: ${PDF_COLORS.gray[600]};">Total PVC Amount</p>
          <h3 style="margin: 4px 0 0 0; font-size: 20px; color: ${totalPVC >= 0 ? PDF_COLORS.success : PDF_COLORS.danger};">
            ${formatCurrency(totalPVC)}
          </h3>
        </div>
        <div>
          <p style="margin: 0; color: ${PDF_COLORS.gray[600]};">PVC Percentage</p>
          <h3 style="margin: 4px 0 0 0; font-size: 20px;">${formatPercentage(pvcPercentage)}</h3>
        </div>
      </div>
      <p style="margin: 8px 0 0 0; font-style: italic;">
        Amount in Words: ${numberToWords(Math.abs(totalPVC))}
      </p>
    </div>
  `;
}

/**
 * Generate classifications section
 */
function generateClassificationsSection(bill: PDFBill, indices: PDFIndices): string {
  const columns = [
    { header: 'S.No', key: 'sno', align: 'center' as const, width: '5%' },
    { header: 'Description', key: 'description', align: 'left' as const, width: '30%' },
    { header: 'Quantity', key: 'quantity', align: 'right' as const, width: '10%', format: formatNumber },
    { header: 'Rate', key: 'rate', align: 'right' as const, width: '12%', format: formatCurrency },
    { header: 'Amount', key: 'amount', align: 'right' as const, width: '15%', format: formatCurrency },
    { header: 'Variation Ratio', key: 'ratio', align: 'right' as const, width: '12%', format: (v: number) => formatNumber(v, 6) },
    { header: 'PVC Amount', key: 'pvc', align: 'right' as const, width: '15%', format: formatCurrency },
  ];

  const data = bill.classifications.map((cls, index) => ({
    sno: index + 1,
    description: cls.itemDescription,
    quantity: cls.quantity,
    rate: cls.rate,
    amount: cls.amount,
    ratio: cls.variationRatio,
    pvc: cls.pvcAmount,
  }));

  return `
    ${generateSectionHeader('Classification-wise PVC Details', 2)}
    ${generateTable({ columns, data })}
  `;
}

/**
 * Generate summary section
 */
function generateSummarySection(bill: PDFBill): string {
  const summaryData = {
    'Total Bill Amount': formatCurrency(bill.totalAmount),
    'Total PVC Amount': formatCurrency(bill.totalPVC),
    'Net Payable Amount': formatCurrency(bill.totalAmount + bill.totalPVC),
  };

  return `
    ${generateSectionHeader('Final Summary', 2)}
    ${generateSummaryTable(summaryData)}
    ${generateInfoBox(
      'Note',
      'This report is generated automatically by the Indian Railway PVC Management System. All calculations are based on the approved price indices and GCC policy guidelines.',
      PDF_COLORS.blue[600]
    )}
  `;
}

/**
 * Wrap content in HTML document
 */
function wrapInHTML(content: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>PVC Analysis Report</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #1f2937;
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }
        table {
          page-break-inside: avoid;
        }
        h1, h2, h3 {
          page-break-after: avoid;
        }
        @media print {
          body {
            padding: 10px;
          }
        }
      </style>
    </head>
    <body>
      ${content}
    </body>
    </html>
  `;
}
