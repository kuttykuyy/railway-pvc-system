

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateApiAccess } from '@/lib/payment-validation';

export const dynamic = "force-dynamic";

// POST /api/contracts/backfill-base-months - Backfill missing base month values for existing contracts
export async function POST(request: NextRequest) {
  try {
    // Validate API access - admin only
    const { authorized, user, message } = await validateApiAccess(request);
    
    if (!authorized) {
      return NextResponse.json(
        { error: message },
        { status: 401 }
      );
    }

    // Get all contracts
    const contracts = await prisma.contract.findMany({
      select: {
        id: true,
        agreementNo: true,
        baseMonth: true
      }
    });

    // Get all price indices
    const allIndices = await prisma.priceIndex.findMany();

    let processedContracts = 0;
    let createdValues = 0;

    for (const contract of contracts) {
      const baseMonth = new Date(contract.baseMonth);
      const normalizedBaseMonth = new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1);
      
      let contractHadMissingValues = false;

      for (const index of allIndices) {
        // Check if base month value already exists
        const existingValue = await prisma.monthlyIndexValue.findFirst({
          where: {
            priceIndexId: index.id,
            month: {
              gte: normalizedBaseMonth,
              lt: new Date(normalizedBaseMonth.getFullYear(), normalizedBaseMonth.getMonth() + 1, 1)
            }
          }
        });

        // If no value exists, create one using the static base value
        if (!existingValue) {
          await prisma.monthlyIndexValue.create({
            data: {
              priceIndexId: index.id,
              month: normalizedBaseMonth,
              value: index.baseValue,
              source: `Backfilled base month value for contract ${contract.agreementNo}`
            }
          });
          
          createdValues++;
          contractHadMissingValues = true;
          
        }
      }
      
      if (contractHadMissingValues) {
        processedContracts++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Backfilled base month values for ${processedContracts} contracts`,
      details: {
        totalContracts: contracts.length,
        contractsProcessed: processedContracts,
        valuesCreated: createdValues
      }
    });

  } catch (error: any) {
    console.error('Error backfilling base month values:', error);
    return NextResponse.json(
      { error: 'Failed to backfill base month values', details: error.message },
      { status: 500 }
    );
  }
}

