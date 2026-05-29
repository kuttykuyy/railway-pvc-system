import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { JPC_ITEMS } from "@/lib/jpc-items";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No PDF file provided" }, { status: 400 });
    }

    if (!file.type.includes("pdf")) {
      return NextResponse.json({ error: "File must be a PDF" }, { status: 400 });
    }

    // Convert PDF to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64String = Buffer.from(arrayBuffer).toString("base64");

    // Build the list of all 34 items to extract
    const itemsList = JPC_ITEMS.map(item => `  "${item.id}": "${item.name}" (S.No. ${item.sno})`).join('\n');

    // Call LLM API to extract all 34 items
    const extractionPrompt = `You are extracting steel price data from a JPC (Joint Plant Committee) Retail Market Prices bulletin PDF.

I need ONLY the CHENNAI prices. The PDF contains data for multiple cities (Delhi, Mumbai, Chennai, Kolkata) - extract ONLY Chennai.

The JPC bulletin has two fortnights per month:
- F1 (1st fortnight, around 1st of month)
- F2 (2nd fortnight, around 15th of month)

Extract ALL 34 items with Chennai prices in Rs./Tonne. The items are:

${itemsList}

IMPORTANT:
- Extract the month and year from the bulletin header (e.g., "May 2025")
- All prices should be numeric only (no commas, no Rs symbol)
- If a specific item is not found, return null for both f1 and f2
- Match items by size/specification from the table

Respond in this exact JSON format:
{
  "month": "May 2025",
  "city": "Chennai",
  "items": {
    "pig_iron": { "f1": 42500, "f2": 42000 },
    "billets_100mm": { "f1": 45000, "f2": 44500 },
    "blooms_150x150mm": { "f1": 45500, "f2": 45000 },
    "pencil_ingots": { "f1": 44000, "f2": 43500 },
    "wire_rod_6mm": { "f1": 56000, "f2": 55500 },
    "wire_rod_8mm": { "f1": 55500, "f2": 55000 },
    "round_12mm": { "f1": 54000, "f2": 53500 },
    "round_16mm": { "f1": 53800, "f2": 53300 },
    "round_25mm": { "f1": 53600, "f2": 53100 },
    "tmt_10mm": { "f1": 62280, "f2": 60600 },
    "tmt_12mm": { "f1": 62100, "f2": 60400 },
    "tmt_25mm": { "f1": 61670, "f2": 60010 },
    "angle_50x50x6mm": { "f1": 58500, "f2": 57800 },
    "angle_75x75x6mm": { "f1": 59030, "f2": 58170 },
    "joist_125x70mm": { "f1": 60000, "f2": 59200 },
    "joist_200x100mm": { "f1": 60500, "f2": 59700 },
    "channel_75x40mm": { "f1": 60500, "f2": 59700 },
    "channel_150x75mm": { "f1": 61920, "f2": 60350 },
    "plate_6mm": { "f1": 62200, "f2": 62200 },
    "plate_10mm": { "f1": 62560, "f2": 62560 },
    "plate_12mm": { "f1": 62800, "f2": 62800 },
    "plate_25mm": { "f1": 63510, "f2": 63510 },
    "hr_coil_2mm": { "f1": 55000, "f2": 54500 },
    "hr_coil_2_5mm": { "f1": 54900, "f2": 54400 },
    "hr_coil_3_15mm": { "f1": 54800, "f2": 54300 },
    "cr_coil_0_63mm": { "f1": 62000, "f2": 61500 },
    "cr_coil_1mm": { "f1": 61000, "f2": 60500 },
    "gp_sheet_0_4mm": { "f1": 72000, "f2": 71500 },
    "gp_sheet_0_63mm": { "f1": 71000, "f2": 70500 },
    "gc_sheet_0_4mm": { "f1": 75000, "f2": 74500 },
    "gc_sheet_0_63mm": { "f1": 74000, "f2": 73500 },
    "scrap_hms_1": { "f1": 35000, "f2": 34500 },
    "scrap_hms_2": { "f1": 33000, "f2": 32500 },
    "sponge_iron": { "f1": 28000, "f2": 27500 }
  }
}

Respond with raw JSON only. Do not include code blocks, markdown, or any other formatting.`;

    const response = await fetch("https://apps.abacus.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.ABACUSAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        messages: [
          {
            role: "user",
            content: [
              {
                type: "file",
                file: {
                  filename: file.name || "jpc-bulletin.pdf",
                  file_data: `data:application/pdf;base64,${base64String}`
                }
              },
              {
                type: "text",
                text: extractionPrompt
              }
            ]
          }
        ],
        max_tokens: 4000,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("LLM API error:", errorText);
      return NextResponse.json(
        { error: "Failed to process PDF with AI" },
        { status: 500 }
      );
    }

    const llmResult = await response.json();
    const content = llmResult.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 500 }
      );
    }

    // Parse the JSON response
    let extractedData;
    try {
      // Clean the response - remove any markdown code blocks if present
      let cleanContent = content.trim();
      if (cleanContent.startsWith("```")) {
        cleanContent = cleanContent.replace(/```json?\n?/g, "").replace(/```$/g, "").trim();
      }
      extractedData = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error("JSON parse error:", parseError, "Content:", content);
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 }
      );
    }

    // Count how many items were extracted
    const itemCount = extractedData.items 
      ? Object.keys(extractedData.items).filter(k => 
          extractedData.items[k]?.f1 || extractedData.items[k]?.f2
        ).length 
      : 0;

    return NextResponse.json({
      success: true,
      month: extractedData.month,
      city: extractedData.city || "Chennai",
      items: extractedData.items || {},
      itemCount
    });

  } catch (error) {
    console.error("PDF extraction error:", error);
    return NextResponse.json(
      { error: "Failed to extract data from PDF" },
      { status: 500 }
    );
  }
}
