
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const ABACUS_API_KEY = process.env.ABACUSAI_API_KEY;
const API_ENDPOINT = 'https://apps.abacus.ai/v1/chat/completions';

// POST - Upload and extract text from document
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Convert file to base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64File = buffer.toString('base64');
    const mimeType = file.type;

    // Use AI to extract text from the document
    const extractionPrompt = `You are a document text extraction expert. Extract ALL text from this document, preserving the structure and formatting as much as possible. 

Important:
- Extract ALL visible text from every page
- Maintain document structure (headings, sections, tables)
- Preserve numerical data accurately
- Include all contract details, work descriptions, and classifications
- Do not summarize or interpret - just extract the raw text
- For multi-page documents, extract text from all pages

Return only the extracted text, no additional commentary.`;

    let extractedText = '';

    if (mimeType === 'application/pdf') {
      // Use PDF-capable model for PDF extraction with file content type
      const pdfResponse = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ABACUS_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-5.4',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  file: {
                    filename: file.name,
                    file_data: `data:${mimeType};base64,${base64File}`
                  }
                },
                { type: 'text', text: extractionPrompt }
              ]
            }
          ],
          max_tokens: 8000,
        }),
      });

      if (!pdfResponse.ok) {
        const errorData = await pdfResponse.json();
        console.error('PDF Extraction API Error:', errorData);
        return NextResponse.json(
          { error: `Failed to extract text from PDF: ${errorData.error?.message || 'Unknown error'}` },
          { status: pdfResponse.status }
        );
      }

      const pdfData = await pdfResponse.json();
      extractedText = pdfData.choices?.[0]?.message?.content || '';
    } else if (mimeType.startsWith('image/')) {
      // Use vision API for image-based extraction
      const visionResponse = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ABACUS_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-5.4',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: extractionPrompt },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${base64File}`
                  }
                }
              ]
            }
          ],
          max_tokens: 4000,
        }),
      });

      if (!visionResponse.ok) {
        const errorData = await visionResponse.json();
        console.error('Vision API Error:', errorData);
        return NextResponse.json(
          { error: `Failed to extract text from image: ${errorData.error?.message || 'Unknown error'}` },
          { status: visionResponse.status }
        );
      }

      const visionData = await visionResponse.json();
      extractedText = visionData.choices?.[0]?.message?.content || '';
    } else {
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload PDF or image files (JPG, PNG).' },
        { status: 400 }
      );
    }

    if (!extractedText || extractedText.trim().length < 50) {
      return NextResponse.json(
        { error: 'Could not extract sufficient text from document. Please ensure the document is clear and readable, and contains contract information.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      extractedText,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    });

  } catch (error: any) {
    console.error('Error in LOA analysis:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process document' },
      { status: 500 }
    );
  }
}

// PUT - Analyze extracted text and suggest classifications
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { extractedText, documentName } = await request.json();

    if (!extractedText || extractedText.trim().length < 50) {
      return NextResponse.json(
        { error: 'Insufficient text provided for analysis' },
        { status: 400 }
      );
    }

    const startTime = Date.now();

    // Fetch classification groups from database
    const { prisma } = await import('@/lib/db');
    const classificationGroups = await prisma.classificationGroup.findMany({
      where: { isActive: true },
      include: {
        subClassifications: {
          where: { isActive: true },
          orderBy: { code: 'asc' }
        }
      },
      orderBy: { code: 'asc' }
    });

    if (classificationGroups.length === 0) {
      return NextResponse.json(
        { error: 'No classifications found in the database' },
        { status: 404 }
      );
    }

    // Create classification options text
    const classificationsText = classificationGroups
      .map((g: any) => {
        const subs = g.subClassifications
          .map((s: any) => `  - ${s.code}: ${s.name}${s.description ? ` (${s.description})` : ''}`)
          .join('\n');
        return `${g.code}. ${g.name}\n   Description: ${g.description || 'N/A'}\n   Sub-classifications:\n${subs}`;
      })
      .join('\n\n');

    const systemPrompt = `You are an expert in Indian Railway construction work classifications according to GCC (General Conditions of Contract) norms.

Available Work Classifications:
${classificationsText}

Your task is to analyze the LOA/Agreement document text and:
1. Identify the work description and scope
2. Suggest the most relevant sub-classifications for the work
3. Extract comprehensive contract details if available

Return your response in this EXACT JSON format:
{
  "contractDetails": {
    "agreementNo": "extracted contract/agreement number (e.g., SR/TPJ/Civil/2024/0120) or null",
    "loaNo": "extracted LOA number or null",
    "contractorName": "extracted contractor/firm name or null",
    "contractorAddress": "extracted contractor address or null",
    "workDescription": "detailed description of work scope with all work items",
    "dateOfOpening": "extracted contract opening/agreement date in YYYY-MM-DD format or null",
    "completionDate": "extracted completion/target date in YYYY-MM-DD format or null",
    "maintenancePeriod": "extracted maintenance/defect liability period (e.g., '3 months', '6 months') or null",
    "railwayZone": "extracted railway zone/division (e.g., Southern Railway, Central Railway) or null",
    "location": "extracted work location/site or null",
    "contractValue": "extracted contract value/amount if mentioned or null"
  },
  "suggestions": [
    {
      "code": "1A",
      "name": "Earthwork - All Items",
      "confidence": 95,
      "reason": "Brief explanation of why this classification fits the work described in the document",
      "fullClassification": {
        "mainCode": "1",
        "mainName": "Earthwork in Formation"
      }
    }
  ]
}

Important:
- Analyze the ENTIRE document text to understand the work scope
- Extract ALL work items mentioned in the agreement (e.g., "Construction of sub-store", "Provision of fencing", etc.)
- Suggest up to 8 most relevant sub-classifications (one for each distinct work type)
- Only use codes that exist in the provided list
- Include confidence scores (0-100 scale) based on how well the work matches the classification
- Provide clear reasoning based on specific details from the document
- Extract all contract identifiers, dates, party names, and financial details if present
- For completion dates, look for phrases like "on or before", "completion period", "target date"
- For maintenance period, look for "maintenance period", "defect liability period"
- Be thorough in extracting contractor details including full name and address`;

    const userPrompt = `Analyze this LOA/Agreement document and suggest appropriate work classifications:

Document: ${documentName}

Extracted Text:
${extractedText}

Provide the most relevant sub-classification codes and extract any contract details you can find.`;

    const analysisResponse = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ABACUS_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!analysisResponse.ok) {
      const errorData = await analysisResponse.json();
      console.error('AI Analysis Error:', errorData);
      return NextResponse.json(
        { error: 'Failed to analyze document with AI' },
        { status: analysisResponse.status }
      );
    }

    const analysisData = await analysisResponse.json();
    const aiResponse = analysisData.choices?.[0]?.message?.content;

    if (!aiResponse) {
      return NextResponse.json(
        { error: 'No analysis received from AI' },
        { status: 500 }
      );
    }

    // Parse AI response
    let parsedResponse;
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        parsedResponse = JSON.parse(aiResponse);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiResponse);
      return NextResponse.json(
        { error: 'Failed to parse AI analysis', rawResponse: aiResponse },
        { status: 500 }
      );
    }

    // Enrich suggestions with database data
    const enrichedSuggestions = parsedResponse.suggestions?.map((suggestion: any) => {
      for (const group of classificationGroups) {
        const subClass = group.subClassifications.find(s => s.code === suggestion.code);
        if (subClass) {
          return {
            code: subClass.code,
            name: subClass.name,
            mainClassification: group.code,
            mainName: group.name,
            confidence: suggestion.confidence / 100,
            reasoning: suggestion.reason || '',
            components: {
              fixed: subClass.fixed,
              labour: subClass.labour,
              cement: subClass.cement,
              steel: subClass.steel,
              plantMachinery: subClass.plantMachinery,
              fuel: subClass.fuel,
              otherMaterials: subClass.otherMaterials,
              explosives: subClass.explosives
            }
          };
        }
      }
      return null;
    }).filter(Boolean) || [];

    const processingTime = (Date.now() - startTime) / 1000;

    return NextResponse.json({
      extractedText,
      documentName,
      suggestions: enrichedSuggestions,
      contractDetails: parsedResponse.contractDetails || {},
      processingTime,
      notes: 'AI-powered analysis of LOA/Agreement document'
    });

  } catch (error: any) {
    console.error('Error in LOA analysis:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to analyze document' },
      { status: 500 }
    );
  }
}
