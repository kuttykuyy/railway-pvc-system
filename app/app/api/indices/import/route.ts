

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { advancedCache } from '@/lib/advanced-cache';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export const dynamic = "force-dynamic";

interface CsvRow {
  'Index Name': string;
  'Current Value': string;
  'Month (YYYY-MM-DD)': string;
}

interface ExcelRow {
  Month: string;
  Labour?: number;
  'MPNG Fuel'?: number;
  'RBI Cement'?: number;
  'RBI Explosives'?: number;
  'RBI Other Materials'?: number;
  'RBI Plant Machinery'?: number;
  'Steel Angle/Channel'?: number;
  'Steel Other Sections'?: number;
  'Steel Plates'?: number;
  'Steel TMT Bars'?: number;
}

// Helper function to parse month from "Aug-22" format to Date
function parseMonthFromFormat(monthStr: string): Date | null {
  if (!monthStr || typeof monthStr !== 'string') return null;
  
  // Handle "Aug-22" format
  const parts = monthStr.trim().split('-');
  if (parts.length !== 2) return null;
  
  const [monthName, yearStr] = parts;
  const monthMap: Record<string, number> = {
    'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
    'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
  };
  
  const monthIndex = monthMap[monthName];
  if (monthIndex === undefined) return null;
  
  const year = parseInt(yearStr);
  if (isNaN(year)) return null;
  
  // Convert 2-digit year to 4-digit (assuming 21st century)
  const fullYear = year < 50 ? 2000 + year : 1900 + year;
  
  const date = new Date(fullYear, monthIndex, 1);
  date.setHours(0, 0, 0, 0);
  
  return date;
}

// POST /api/indices/import - Import indices from file
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    const isCSV = fileName.endsWith('.csv');
    
    if (!isExcel && !isCSV) {
      return NextResponse.json(
        { error: 'Unsupported file format. Please use .xlsx, .xls, or .csv files.' },
        { status: 400 }
      );
    }

    // Get all price indices to map names to IDs
    const priceIndices = await prisma.priceIndex.findMany();
    const indexMap = new Map();
    
    // Create mapping for both exact names and common variations
    priceIndices.forEach(idx => {
      indexMap.set(idx.name.toLowerCase(), idx.id);
      // Add specific mappings for the Excel format
      if (idx.name.toLowerCase().includes('labour')) {
        indexMap.set('labour', idx.id);
      }
      if (idx.name.toLowerCase().includes('fuel')) {
        indexMap.set('mpng fuel', idx.id);
      }
      if (idx.name.toLowerCase().includes('cement')) {
        indexMap.set('rbi cement', idx.id);
      }
      if (idx.name.toLowerCase().includes('explosives')) {
        indexMap.set('rbi explosives', idx.id);
      }
      if (idx.name.toLowerCase().includes('other materials')) {
        indexMap.set('rbi other materials', idx.id);
      }
      if (idx.name.toLowerCase().includes('plant machinery')) {
        indexMap.set('rbi plant machinery', idx.id);
      }
      if (idx.name.toLowerCase().includes('steel') && idx.name.toLowerCase().includes('angle')) {
        indexMap.set('steel angle/channel', idx.id);
      }
      if (idx.name.toLowerCase().includes('steel') && idx.name.toLowerCase().includes('sections')) {
        indexMap.set('steel other sections', idx.id);
      }
      if (idx.name.toLowerCase().includes('steel') && idx.name.toLowerCase().includes('plates')) {
        indexMap.set('steel plates', idx.id);
      }
      if (idx.name.toLowerCase().includes('steel') && idx.name.toLowerCase().includes('tmt')) {
        indexMap.set('steel tmt bars', idx.id);
      }
    });
    
    const results = [];
    const errors: string[] = [];
    let parsedData: any[] = [];

    if (isExcel) {
      // Parse Excel file
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer);
      
      // Use the first sheet or "Table 2" if it exists
      const sheetName = workbook.SheetNames.includes('Table 2') ? 'Table 2' : workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      if (!worksheet) {
        return NextResponse.json(
          { error: 'No valid worksheet found in Excel file' },
          { status: 400 }
        );
      }
      
      parsedData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: null
      });
      
      if (parsedData.length < 2) {
        return NextResponse.json(
          { error: 'Excel file must have at least 2 rows (header + data)' },
          { status: 400 }
        );
      }
      
      const headers = parsedData[0] as string[];
      const dataRows = parsedData.slice(1);
      
      // Process each data row
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const rowNumber = i + 2; // +2 because we're 0-indexed and skipped header
        
        try {
          if (!row || row.length === 0) continue;
          
          // Get month from first column
          const monthValue = row[0];
          if (!monthValue) {
            errors.push(`Row ${rowNumber}: Missing month value`);
            continue;
          }
          
          const monthDate = parseMonthFromFormat(String(monthValue));
          if (!monthDate) {
            errors.push(`Row ${rowNumber}: Invalid month format "${monthValue}". Expected format: "Aug-22"`);
            continue;
          }
          
          // Process each column after the month column
          for (let j = 1; j < headers.length && j < row.length; j++) {
            const columnName = headers[j];
            const value = row[j];
            
            if (!columnName || value == null || value === '') continue;
            
            const numericValue = parseFloat(String(value));
            if (isNaN(numericValue) || numericValue <= 0) {
              errors.push(`Row ${rowNumber}, Column "${columnName}": Invalid value "${value}"`);
              continue;
            }
            
            // Find matching price index
            const priceIndexId = indexMap.get(columnName.toLowerCase());
            if (!priceIndexId) {
              errors.push(`Row ${rowNumber}: Unknown index name "${columnName}"`);
              continue;
            }
            
            // Create or update monthly index value
            const monthlyValue = await prisma.monthlyIndexValue.upsert({
              where: {
                priceIndexId_month: {
                  priceIndexId,
                  month: monthDate
                }
              },
              update: { value: numericValue },
              create: {
                priceIndexId,
                month: monthDate,
                value: numericValue
              }
            });
            
            results.push(monthlyValue);
          }
        } catch (error: any) {
          errors.push(`Row ${rowNumber}: ${error.message}`);
        }
      }
    } else {
      // Parse CSV file (existing logic)
      const fileContent = await file.text();
      
      const parseResult = Papa.parse<CsvRow>(fileContent, {
        header: true,
        skipEmptyLines: true,
        transform: (value) => value.trim()
      });
      
      if (parseResult.errors.length > 0) {
        return NextResponse.json(
          { error: `CSV parsing error: ${parseResult.errors[0].message}` },
          { status: 400 }
        );
      }
      
      const csvData = parseResult.data;
      
      if (csvData.length === 0) {
        return NextResponse.json(
          { error: 'No data found in CSV file' },
          { status: 400 }
        );
      }

      // Process CSV rows (existing logic)
      for (let i = 0; i < csvData.length; i++) {
        const row = csvData[i];
        
        try {
          const indexName = row['Index Name'];
          const currentValue = row['Current Value'];
          const rowMonth = row['Month (YYYY-MM-DD)'];
          
          if (!indexName || !currentValue || !rowMonth) {
            errors.push(`Row ${i + 2}: Missing required data`);
            continue;
          }
          
          // Find matching price index
          const priceIndexId = indexMap.get(indexName.toLowerCase());
          if (!priceIndexId) {
            errors.push(`Row ${i + 2}: Unknown index name "${indexName}"`);
            continue;
          }
          
          const value = parseFloat(currentValue);
          if (isNaN(value) || value <= 0) {
            errors.push(`Row ${i + 2}: Invalid value "${currentValue}"`);
            continue;
          }
          
          const monthDate = new Date(rowMonth);
          if (isNaN(monthDate.getTime())) {
            errors.push(`Row ${i + 2}: Invalid date format "${rowMonth}"`);
            continue;
          }
          
          monthDate.setDate(1);
          monthDate.setHours(0, 0, 0, 0);
          
          // Create or update monthly index value
          const monthlyValue = await prisma.monthlyIndexValue.upsert({
            where: {
              priceIndexId_month: {
                priceIndexId,
                month: monthDate
              }
            },
            update: { value },
            create: {
              priceIndexId,
              month: monthDate,
              value
            }
          });
          
          results.push(monthlyValue);
        } catch (error: any) {
          errors.push(`Row ${i + 2}: ${error.message}`);
        }
      }
    }
    
    // Invalidate cached indices
    advancedCache.invalidateByTag('indices');

    return NextResponse.json({
      success: true,
      count: results.length,
      data: results,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        totalRows: isExcel ? parsedData.length - 1 : parsedData.length, // -1 for header in Excel
        successfulImports: results.length,
        errors: errors.length
      }
    });
    
  } catch (error: any) {
    console.error('Error importing indices from file:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to import file' },
      { status: 500 }
    );
  }
}
