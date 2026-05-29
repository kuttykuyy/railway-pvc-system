
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const ABACUS_API_KEY = process.env.ABACUSAI_API_KEY;
const API_ENDPOINT = 'https://apps.abacus.ai/v1/chat/completions';

export async function POST(request: NextRequest) {
  try {
    const { workDescription } = await request.json();

    if (!workDescription || workDescription.trim().length < 10) {
      return NextResponse.json(
        { error: 'Work description must be at least 10 characters long' },
        { status: 400 }
      );
    }

    if (!ABACUS_API_KEY) {
      return NextResponse.json(
        { error: 'AI service not configured' },
        { status: 500 }
      );
    }

    // Fetch actual classification groups and sub-classifications from database
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

    // Create classification options text with sub-classifications
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

Your task is to analyze the work description and suggest the most relevant sub-classifications. Only suggest codes that exist in the list above.

Return your response in this EXACT JSON format:
{
  "suggestions": [
    {
      "code": "1A",
      "name": "Earthwork - All Items",
      "confidence": 95,
      "reason": "Brief explanation of why this classification fits",
      "fullClassification": {
        "mainCode": "1",
        "mainName": "Earthwork in Formation",
        "components": {
          "fixed": 15,
          "labour": 20,
          "cement": 0,
          "steel": 0,
          "plantMachinery": 35,
          "fuel": 25,
          "otherMaterials": 10,
          "explosives": 0
        }
      }
    }
  ]
}

Important:
- Suggest up to 3 most relevant sub-classifications
- Only use codes that exist in the provided list
- Include confidence scores (0-100 scale)
- Provide clear reasoning for each suggestion
- Include the component breakdown from the classification details`;

    const userPrompt = `Analyze this railway construction work and suggest the most appropriate sub-classifications:

Work Description: "${workDescription}"

Provide the most relevant sub-classification codes that apply to this work. Use ONLY codes from the list I provided.`;

    const response = await fetch(API_ENDPOINT, {
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
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('AI API Error:', errorData);
      return NextResponse.json(
        { error: 'Failed to get AI suggestions' },
        { status: response.status }
      );
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content;

    if (!aiResponse) {
      return NextResponse.json(
        { error: 'No suggestions received from AI' },
        { status: 500 }
      );
    }

    // Parse AI response
    let parsedResponse;
    try {
      // Extract JSON from response (in case AI adds extra text)
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        parsedResponse = JSON.parse(aiResponse);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiResponse);
      return NextResponse.json(
        { error: 'Failed to parse AI suggestions', rawResponse: aiResponse },
        { status: 500 }
      );
    }

    // Enrich suggestions with actual database data and format for UI
    const enrichedSuggestions = parsedResponse.suggestions?.map((suggestion: any) => {
      // Find the sub-classification in the database
      for (const group of classificationGroups) {
        const subClass = group.subClassifications.find((s: any) => s.code === suggestion.code);
        if (subClass) {
          return {
            code: subClass.code,
            name: subClass.name,
            mainClassification: group.code,
            mainName: group.name,
            confidence: suggestion.confidence / 100, // Convert to 0-1 scale for UI
            reasoning: suggestion.reason || '',
            subClassifications: [{
              code: subClass.code,
              name: subClass.name
            }],
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
      // Return suggestion even if not found in DB
      return {
        code: suggestion.code,
        name: suggestion.name,
        mainClassification: suggestion.code?.split('-')[0] || '',
        mainName: suggestion.name || '',
        confidence: suggestion.confidence / 100,
        reasoning: suggestion.reason || '',
        subClassifications: [{
          code: suggestion.code,
          name: suggestion.name
        }]
      };
    }) || [];

    return NextResponse.json({
      suggestions: enrichedSuggestions,
      notes: 'AI-powered suggestions based on work description analysis'
    });
  } catch (error) {
    console.error('Error in AI classification suggestion:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
