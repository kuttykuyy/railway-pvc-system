import { logger } from '@/lib/logger';
/**
 * API endpoint to fetch and import WPI data from eaindustry.nic.in
 * POST /api/indices/wpi-import
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAccess } from '@/lib/role-auth';
import * as XLSX from 'xlsx';
import {
  WPI_MAPPINGS,
  parseWPIExcelData,
  updateIndicesFromWPI,
  getWPIDownloadUrl,
  getLatestWPIUrl
} from '@/lib/wpi-fetcher';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for fetching

// GET - Fetch latest WPI data preview without importing
export async function GET(request: NextRequest) {
  try {
    // Check admin access
    const { authorized, message } = await validateAdminAccess(request);
    if (!authorized) {
      return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });
    }

    const url = request.nextUrl.searchParams.get('url') || getLatestWPIUrl();
    logger.log('[WPI Import] Fetching preview from:', url);

    // Fetch the Excel file
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; IR-PVC/1.0; +https://irpvc.in)'
      }
    });

    if (!response.ok) {
      return NextResponse.json({
        error: `Failed to fetch WPI data: ${response.status} ${response.statusText}`,
        url: url
      }, { status: 400 });
    }

    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

    // Parse and find relevant data
    const wpiData = parseWPIExcelData(data);
    
    // Get preview of our indices
    const preview: any[] = [];
    for (const [indexName, mapping] of Object.entries(WPI_MAPPINGS)) {
      const match = wpiData.find(row => row.commCode === mapping.code);
      if (match) {
        // Get last 12 months of data
        const recentValues = match.monthlyValues
          .sort((a, b) => b.month.getTime() - a.month.getTime())
          .slice(0, 12)
          .map(mv => ({
            month: mv.month.toISOString().slice(0, 7),
            value: mv.value
          }));

        preview.push({
          indexName,
          wpiName: match.commName,
          wpiCode: match.commCode,
          latestValue: recentValues[0]?.value || null,
          latestMonth: recentValues[0]?.month || null,
          recentValues: recentValues.slice(0, 6)
        });
      } else {
        preview.push({
          indexName,
          wpiCode: mapping.code,
          error: 'Not found in WPI data'
        });
      }
    }

    return NextResponse.json({
      success: true,
      url,
      totalCommodities: wpiData.length,
      indices: preview,
      message: 'Preview of WPI data. Use POST to import.'
    });

  } catch (error) {
    console.error('[WPI Import] Preview error:', error);
    return NextResponse.json({
      error: 'Failed to fetch WPI preview',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// POST - Import WPI data into database
export async function POST(request: NextRequest) {
  try {
    // Check admin access
    const { authorized, message } = await validateAdminAccess(request);
    if (!authorized) {
      return NextResponse.json({ error: message || 'Admin access required' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { 
      url, 
      year, 
      month,
      isProvisional = false,
      monthsToUpdate // Optional: specific months to update ["2025-01", "2025-02"]
    } = body;

    // Determine URL
    let fetchUrl: string;
    if (url) {
      fetchUrl = url;
    } else if (year && month) {
      fetchUrl = getWPIDownloadUrl(year, month);
    } else {
      fetchUrl = getLatestWPIUrl();
    }

    logger.log('[WPI Import] Fetching from:', fetchUrl);
    logger.log('[WPI Import] Is Provisional:', isProvisional);

    // Fetch the Excel file
    const response = await fetch(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; IR-PVC/1.0; +https://irpvc.in)'
      }
    });

    if (!response.ok) {
      return NextResponse.json({
        error: `Failed to fetch WPI data: ${response.status} ${response.statusText}`,
        url: fetchUrl
      }, { status: 400 });
    }

    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

    logger.log('[WPI Import] Parsed Excel with', data.length, 'rows');

    // Parse WPI data
    const wpiData = parseWPIExcelData(data);
    logger.log('[WPI Import] Found', wpiData.length, 'commodities');

    // Parse months to update if provided
    let monthDates: Date[] | undefined;
    if (monthsToUpdate && Array.isArray(monthsToUpdate)) {
      monthDates = monthsToUpdate.map(m => {
        const [y, mo] = m.split('-').map(Number);
        return new Date(Date.UTC(y, mo - 1, 1));
      });
    }

    // Update database
    const result = await updateIndicesFromWPI(wpiData, isProvisional, monthDates);

    logger.log('[WPI Import] Update complete:', result.updated, 'values updated');

    return NextResponse.json({
      success: result.success,
      url: fetchUrl,
      isProvisional,
      updated: result.updated,
      errors: result.errors,
      details: result.details.slice(0, 50) // Limit details in response
    });

  } catch (error) {
    console.error('[WPI Import] Error:', error);
    return NextResponse.json({
      error: 'Failed to import WPI data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

