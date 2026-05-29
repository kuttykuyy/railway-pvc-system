import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateAdminAccess } from "@/lib/role-auth";

// Direct fetch to Abacus AI API instead of OpenAI SDK to avoid SSL issues
async function callAbacusAI(base64: string, fuelType: string): Promise<string> {
  const apiKey = process.env.ABACUSAI_API_KEY;
  if (!apiKey) {
    throw new Error("ABACUSAI_API_KEY not configured");
  }

  const response = await fetch("https://apps.abacus.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-5.4-mini',
      max_tokens: 16000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "file",
              file: {
                filename: "ppac-fuel-prices.pdf",
                file_data: `data:application/pdf;base64,${base64}`,
              },
            },
            {
              type: "text",
              text: `Extract all ${fuelType.toUpperCase()} prices from this PPAC (Petroleum Planning & Analysis Cell) PDF document.

The PDF contains daily retail selling prices for Delhi, Mumbai, Chennai, and Kolkata.

IMPORTANT: Extract DIESEL/HSD prices (NOT Petrol/MS prices). In PPAC documents, Diesel prices are usually in the right half of the table.

Return the data as a JSON array with this exact format:
[
  {"date": "YYYY-MM-DD", "delhi": 87.67, "mumbai": 90.03, "chennai": 92.39, "kolkata": 92.02},
  ...
]

Rules:
1. Use YYYY-MM-DD date format (e.g., 2025-02-15)
2. All price values should be numbers (not strings)
3. Extract ALL rows from the document
4. Return ONLY the JSON array, no other text
5. For dates like "15-Feb-25", convert to "2025-02-15"
6. Make sure to extract DIESEL prices, not Petrol`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

interface FuelPriceEntry {
  date: string; // YYYY-MM-DD format
  delhi: number;
  mumbai: number;
  chennai: number;
  kolkata: number;
}

export async function POST(request: NextRequest) {
  try {
    const adminCheck = await validateAdminAccess(request);
    if (!adminCheck.authorized) {
      return NextResponse.json(
        { success: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const fuelType = formData.get("fuelType") as string || "diesel";

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    // Convert file to base64
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    // Use LLM to extract fuel prices from PDF with retry logic
    let content = "";
    let lastError;
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[AI Fuel Import] Attempt ${attempt}/3 starting...`);
        content = await callAbacusAI(base64, fuelType);
        console.log(`[AI Fuel Import] Attempt ${attempt}/3 succeeded`);
        break; // Success, exit retry loop
      } catch (apiError: any) {
        lastError = apiError;
        console.error(`[AI Fuel Import] Attempt ${attempt}/3 failed:`, apiError.message || apiError);
        
        // Check if it's a retryable error
        const isRetryable = 
          apiError.message?.includes('SSL') ||
          apiError.message?.includes('fetch failed') ||
          apiError.message?.includes('Connection') ||
          apiError.message?.includes('timeout') ||
          apiError.message?.includes('ECONNRESET') ||
          apiError.message?.includes('network');
        
        if (!isRetryable || attempt === 3) {
          return NextResponse.json(
            { 
              success: false, 
              error: `AI service error: ${apiError.message || 'Connection failed'}. Please try again later or use manual import.`
            },
            { status: 503 }
          );
        }
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
      }
    }

    if (!content) {
      return NextResponse.json(
        { success: false, error: 'Failed to get response from AI service' },
        { status: 503 }
      );
    }
    
    // Parse JSON from response
    let prices: FuelPriceEntry[] = [];
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonMatch) {
        prices = JSON.parse(jsonMatch[0]);
      } else {
        prices = JSON.parse(content);
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      return NextResponse.json(
        { 
          success: false, 
          error: "Failed to parse fuel prices from PDF. Please try manual import.",
          aiResponse: content.substring(0, 500)
        },
        { status: 400 }
      );
    }

    if (!Array.isArray(prices) || prices.length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid fuel prices extracted from PDF" },
        { status: 400 }
      );
    }

    // Validate and import prices
    let created = 0;
    let updated = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    for (const price of prices) {
      try {
        // Validate required fields
        if (!price.date || !price.delhi || !price.mumbai || !price.chennai || !price.kolkata) {
          errors++;
          continue;
        }

        const dateObj = new Date(price.date);
        if (isNaN(dateObj.getTime())) {
          errors++;
          errorDetails.push(`Invalid date: ${price.date}`);
          continue;
        }

        // Upsert
        const existing = await prisma.dailyFuelPrice.findUnique({
          where: { date: dateObj },
        });

        if (existing) {
          await prisma.dailyFuelPrice.update({
            where: { date: dateObj },
            data: {
              delhi: price.delhi,
              mumbai: price.mumbai,
              chennai: price.chennai,
              kolkata: price.kolkata,
              source: "PPAC",
            },
          });
          updated++;
        } else {
          await prisma.dailyFuelPrice.create({
            data: {
              date: dateObj,
              delhi: price.delhi,
              mumbai: price.mumbai,
              chennai: price.chennai,
              kolkata: price.kolkata,
              source: "PPAC",
            },
          });
          created++;
        }
      } catch (e: any) {
        errors++;
        errorDetails.push(e.message);
      }
    }

    // Get sample of imported data for verification
    const sample = prices.slice(0, 3).map(p => ({
      date: p.date,
      delhi: p.delhi,
      mumbai: p.mumbai,
      chennai: p.chennai,
      kolkata: p.kolkata,
    }));

    return NextResponse.json({
      success: true,
      message: `AI imported ${created + updated} diesel prices (${created} new, ${updated} updated)`,
      totalExtracted: prices.length,
      created,
      updated,
      errors,
      errorDetails: errorDetails.slice(0, 5),
      sample,
    });
  } catch (error: any) {
    console.error("Error in AI fuel import:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process PDF with AI" },
      { status: 500 }
    );
  }
}
