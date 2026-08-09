import { logger } from '@/lib/logger';

/**
 * API Route: Find Classifications from Bill PDF
 * Uses AI to analyze bill and match with existing classifications
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

interface ClassificationMatch {
  classificationId: string;
  code: string;
  name: string;
  subclassificationId?: string;
  subCode?: string;
  subName?: string;
  confidence: 'high' | 'medium' | 'low';
  matchScore: number;
  reason: string;
  matchedKeywords: string[];
  componentPercentages: {
    fixed: number;
    labour: number;
    steel: number;
    cement: number;
    plantMachinery: number;
    fuel: number;
    otherMaterials: number;
    explosives: number;
  };
}

interface SpecialConditionItem {
  description: string;
  amount?: string;
  suggestedClassification?: ClassificationMatch;
}

interface FinderResult {
  workDescription: string;
  billItems: string[];
  specialConditionItems: SpecialConditionItem[];
  matches: ClassificationMatch[];
  suggestedMatch: ClassificationMatch;
  analysisNotes: string;
}

export async function POST(request: NextRequest) {
  try {
    // Auth + rate limit: this endpoint spends the company's AI credit on the
    // server key, so it must never be callable anonymously or unboundedly.
    const { getServerSession } = await import('next-auth/next');
    const { authOptions } = await import('@/lib/auth');
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const { default: rateLimiter, RATE_LIMITS, getIdentifier } = await import('@/lib/rate-limiter');
    const rl = rateLimiter.check(getIdentifier(request, session.user.email), RATE_LIMITS.EXPENSIVE.limit, RATE_LIMITS.EXPENSIVE.windowMs);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many requests. Please wait ${Math.ceil(rl.resetIn / 1000)}s and try again.` },
        { status: 429, headers: { 'Retry-After': Math.ceil(rl.resetIn / 1000).toString() } },
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const mode = formData.get('mode') as string || 'extract'; // 'extract' or 'classify'
    const selectedItem = formData.get('selectedItem') as string | null;
    // The scope the item belongs to. A GCC group is a kind of WORK, not a kind of item:
    // the same cement concrete is Building Works inside a station building and Bridges &
    // Protection inside an ROB, and those allocate cement 15% and 0%. Classifying the
    // item alone cannot tell them apart, so the name of work and the schedule heading
    // the item sits under are given to the classifier as well.
    const nameOfWork = formData.get('nameOfWork') as string | null;
    const scheduleName = formData.get('scheduleName') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload PDF or image files.' },
        { status: 400 }
      );
    }

    // Validate file size (max 100MB)
    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size too large. Maximum size is 100MB.' },
        { status: 400 }
      );
    }

    // If mode is 'classify', we need a selected item
    if (mode === 'classify' && !selectedItem) {
      return NextResponse.json(
        { error: 'No item selected for classification' },
        { status: 400 }
      );
    }

    // Convert file to base64
    const buffer = await file.arrayBuffer();
    const base64String = Buffer.from(buffer).toString('base64');
    
    // Determine file data URI format
    let dataUri: string;
    if (file.type === 'application/pdf') {
      dataUri = `data:application/pdf;base64,${base64String}`;
    } else {
      dataUri = `data:${file.type};base64,${base64String}`;
    }

    // Fetch all classifications from database
    const classifications = await prisma.classification.findMany({
      where: {
        isActive: true
      }
    });

    if (classifications.length === 0) {
      return NextResponse.json(
        { error: 'No classifications found in database. Please set up classifications first.' },
        { status: 404 }
      );
    }

    // Build classification reference for AI (only for classify mode)
    let classificationReference: any[] = [];
    if (mode === 'classify') {
      classificationReference = classifications.map((c: any) => {
        const subClassifications = Array.isArray(c.subClassifications) 
          ? c.subClassifications 
          : typeof c.subClassifications === 'string' 
          ? JSON.parse(c.subClassifications) 
          : [];

        return {
          id: c.id,
          code: c.code,
          name: c.name,
          keywords: [c.code.toLowerCase(), c.name.toLowerCase()],
          subclassifications: subClassifications.map((s: any) => ({
            id: s.id || s.code,
            code: s.code,
            name: s.name,
            keywords: [s.code.toLowerCase(), s.name.toLowerCase()]
          })),
          componentPercentages: {
            fixed: c.fixed || 0,
            labour: c.labour || 0,
            steel: c.steel || 0,
            cement: c.cement || 0,
            plantMachinery: c.plantMachinery || 0,
            fuel: c.fuel || 0,
            otherMaterials: c.otherMaterials || 0,
            explosives: c.explosives || 0
          }
        };
      });
    }

    // Generate AI prompt based on mode
    let prompt: string;
    
    if (mode === 'extract') {
      // EXTRACT MODE: Just extract items from the bill
      prompt = `You are an expert AI assistant specialized in analyzing Railway bills and extracting work items.

**YOUR TASK**: Extract ALL work items from the uploaded bill document.

**WHAT TO EXTRACT**:
1. Main work description/name of work
2. Regular bill items (items with amounts in the regular columns)
3. **IMPORTANT**: Items from "Special Condition (Rs.)" column - extract these separately

**OUTPUT FORMAT**:
Respond in JSON format with the following structure:

{
  "workDescription": "string (main work description from bill)",
  "regularItems": [
    {
      "itemNo": "string (item number like 10450, 0110, etc.)",
      "description": "string (full description of the work item)",
      "unit": "string (unit like Kg, cum, Sqm, etc.)",
      "quantity": "string (quantity if visible)",
      "amount": "string (amount if visible)"
    }
  ],
  "specialConditionItems": [
    {
      "itemNo": "string (item number if available)",
      "description": "string (description of the special condition item)",
      "amount": "string (amount from Special Condition column)"
    }
  ]
}

**IMPORTANT INSTRUCTIONS**:
- Extract ALL items, don't skip any
- For special condition items, look for "Special Condition (Rs.)" column
- Include item numbers, descriptions, and amounts
- If an item has no item number, use "N/A"
- Keep descriptions complete and clear
- Separate regular items and special condition items

Respond with raw JSON only. Do not include code blocks, markdown, or any other formatting.`;
    } else {
      // CLASSIFY MODE: Match a specific item to classifications
      prompt = `You are an expert AI assistant specialized in analyzing Railway bills and matching work items to appropriate classifications.

**YOUR TASK**: Analyze the following work item and match it to the most appropriate classifications and subclassifications using a TWO-STAGE approach.

**WORK ITEM TO CLASSIFY**:
${selectedItem}
${nameOfWork ? `
**NAME OF WORK (the whole agreement's scope)**:
${nameOfWork}` : ''}${scheduleName ? `

**THIS ITEM'S SCHEDULE / SUB-WORK HEADING**: ${scheduleName}` : ''}

**WHICH SCOPE THE ITEM BELONGS TO**:
A GCC 46A classification is a kind of WORK, not a kind of item. The same cement
concrete belongs to Building Works inside a station building, and to Bridges &
Protection inside an ROB or major bridge — different classifications with different
component percentages. So:
- If a schedule/sub-work heading is given, it decides the scope. Use it.
- If not, and the name of work names several scopes, choose the scope this item's own
  wording points to (a foundation for a bridge pier is bridge work; plastering in a
  station building is building work).
- If the item's wording does not point to any one scope, say so in the justification
  rather than picking the scope with the largest percentages. State which scopes it
  could belong to and that the schedule heading is needed to decide.
NEVER choose a classification because its percentages are higher. The nature of the
work decides; the percentages follow.

**AVAILABLE CLASSIFICATIONS**:
${JSON.stringify(classificationReference, null, 2)}

**TWO-STAGE CLASSIFICATION APPROACH**:

**NAMING RULE FOR THE JUSTIFICATION**:
Refer to a classification by the exact "code" and "name" given in AVAILABLE
CLASSIFICATIONS above. Do not invent a title for it. (A justification once read
"Group 1 - Concrete" when Group 1 is Earthwork in Formation — the reason printed on
the statement was false, and the item's cement allocation was 0% as a result.)

**STAGE 1: Dedicated Component Detection**
First, check if this item is a DEDICATED COMPONENT:

1. **Dedicated Steel (TMT Bars)**:
   - Keywords: "reinforcement", "R.C.C.", "RCC", "steel bars", "TMT bars", "HYSD bars", "high yield strength", "deformed bars", "straightening", "cutting", "bending", "placing in position", "binding"
   - Work type: Supplying reinforcement for concrete work
   - If detected → Classify as "Dedicated Steel TMT" (use dedicated steel classification)
   - Skip subclassification for dedicated components

2. **Dedicated Cement**:
   - Keywords: "cement", "supplying cement", "using cement", "cement at worksite", "cement supply"
   - Work type: Supply and use of cement
   - If detected → Classify as "Dedicated Cement" (use dedicated cement classification)
   - Skip subclassification for dedicated components

**STAGE 2: Regular Classification (if NOT dedicated component)**
If the item is NOT a dedicated component, follow this two-stage process:

**Step 1: Determine Classification**
- Analyze the overall work description
- Identify the primary work type (earthwork, concrete work, masonry, finishing, etc.)
- Match to the appropriate MAIN classification based on work description
- Do NOT consider subclassification yet

**Step 2: Identify Subclassification**
- Once classification is determined, look at the item number
- Match the item number to the appropriate subclassification under the identified classification
- The subclassification should match the schedule/item number pattern

**MATCHING CRITERIA**:
For each relevant classification:
1. Calculate a match score (0-100) based on:
   - Keyword matches in description
   - Material alignment
   - Work type alignment
   - Overall context fit
   - For dedicated components: 95-100% if keywords match exactly
2. Determine confidence level:
   - high: 80-100% match, strong keyword and context alignment
   - medium: 50-79% match, partial alignment
   - low: 20-49% match, weak alignment
3. Provide clear reasoning for the match
4. List matched keywords

**OUTPUT FORMAT**:
Respond in JSON format with the following structure:

{
  "isDedicatedComponent": boolean (true if steel/cement dedicated component detected),
  "dedicatedComponentType": "steel" or "cement" or null,
  "matches": [
    {
      "classificationId": "string (UUID from database)",
      "code": "string (classification code)",
      "name": "string (classification name)",
      "subclassificationId": "string or null (null for dedicated components)",
      "subCode": "string or null",
      "subName": "string or null",
      "confidence": "high/medium/low",
      "matchScore": number (0-100),
      "reason": "string (clear explanation: mention if dedicated component, or explain classification → subclassification logic)",
      "matchedKeywords": ["array of keywords that matched"],
      "componentPercentages": {
        "fixed": number,
        "labour": number,
        "steel": number,
        "cement": number,
        "plantMachinery": number,
        "fuel": number,
        "otherMaterials": number,
        "explosives": number
      }
    }
  ],
  "suggestedMatch": {
    (same structure as matches, the best single match)
  },
  "classificationStage": {
    "description": "string (explain: is it dedicated component? Or which main classification was selected and why?)",
    "subclassificationStage": "string or null (if not dedicated, explain which subclassification was selected based on item number)"
  }
}

**IMPORTANT INSTRUCTIONS**:
- ALWAYS check for dedicated components FIRST (steel reinforcement or cement supply)
- For dedicated components: use 95-100% match score, mark as dedicated, no subclassification needed
- For regular items: explain the two-stage logic (classification choice → subclassification choice)
- Include ALL relevant classifications, even with low confidence
- Sort matches by matchScore (highest first)
- The suggestedMatch should be the highest scoring match
- Be specific in reasoning - mention the two-stage approach
- Return at least 3-5 matches if possible

Respond with raw JSON only. Do not include code blocks, markdown, or any other formatting.`;
    }

    // Prepare messages for LLM API
    let messages: any[];
    
    if (file.type === 'application/pdf') {
      messages = [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file: {
                filename: file.name,
                file_data: dataUri
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }
      ];
    } else {
      messages = [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: dataUri
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }
      ];
    }

    logger.log('Calling AI API for classification matching...');

    // Call the LLM API with JSON response format
    const response = await fetch('https://routellm.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'route-llm',
        messages: messages,
        response_format: { type: 'json_object' },
        max_tokens: 4000,
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('LLM API error:', errorData);
      return NextResponse.json(
        { error: 'Failed to process document. Please try again.' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: 'No response from AI service.' },
        { status: 500 }
      );
    }

    // Parse the JSON response
    let result: any;
    try {
      result = JSON.parse(content);
    } catch (error) {
      console.error('Failed to parse LLM response:', content);
      return NextResponse.json(
        { error: 'Failed to parse analysis results. Please try again.' },
        { status: 500 }
      );
    }

    // Handle extract mode - return extracted items
    if (mode === 'extract') {
      return NextResponse.json({
        success: true,
        data: {
          workDescription: result.workDescription,
          regularItems: result.regularItems || [],
          specialConditionItems: result.specialConditionItems || []
        },
        message: 'Items extracted successfully'
      });
    }

    // Handle classify mode - return classification matches
    // Validate and enrich matches with database data
    const enrichedMatches = await Promise.all(
      result.matches.map(async (match: ClassificationMatch) => {
        const classification = classifications.find((c: any) => c.id === match.classificationId);
        if (!classification) {
          logger.warn(`Classification not found: ${match.classificationId}`);
          return match;
        }

        // Parse subclassifications
        const subClassifications = Array.isArray((classification as any).subClassifications) 
          ? (classification as any).subClassifications 
          : typeof (classification as any).subClassifications === 'string' 
          ? JSON.parse((classification as any).subClassifications) 
          : [];

        // Enrich with accurate database data
        const enriched: ClassificationMatch = {
          ...match,
          code: (classification as any).code,
          name: (classification as any).name,
          componentPercentages: {
            fixed: (classification as any).fixed || 0,
            labour: (classification as any).labour || 0,
            steel: (classification as any).steel || 0,
            cement: (classification as any).cement || 0,
            plantMachinery: (classification as any).plantMachinery || 0,
            fuel: (classification as any).fuel || 0,
            otherMaterials: (classification as any).otherMaterials || 0,
            explosives: (classification as any).explosives || 0
          }
        };

        // Enrich subclassification if present
        if (match.subclassificationId) {
          const subclass = subClassifications.find(
            (s: any) => (s.id || s.code) === match.subclassificationId
          );
          if (subclass) {
            enriched.subCode = subclass.code;
            enriched.subName = subclass.name;
          }
        }

        return enriched;
      })
    );

    // Enrich suggested match
    const suggestedClassification = classifications.find(
      (c: any) => c.id === result.suggestedMatch.classificationId
    );
    
    let enrichedSuggestedMatch = { ...result.suggestedMatch };
    if (suggestedClassification) {
      // Parse subclassifications
      const subClassifications = Array.isArray((suggestedClassification as any).subClassifications) 
        ? (suggestedClassification as any).subClassifications 
        : typeof (suggestedClassification as any).subClassifications === 'string' 
        ? JSON.parse((suggestedClassification as any).subClassifications) 
        : [];

      enrichedSuggestedMatch.code = (suggestedClassification as any).code;
      enrichedSuggestedMatch.name = (suggestedClassification as any).name;
      enrichedSuggestedMatch.componentPercentages = {
        fixed: (suggestedClassification as any).fixed || 0,
        labour: (suggestedClassification as any).labour || 0,
        steel: (suggestedClassification as any).steel || 0,
        cement: (suggestedClassification as any).cement || 0,
        plantMachinery: (suggestedClassification as any).plantMachinery || 0,
        fuel: (suggestedClassification as any).fuel || 0,
        otherMaterials: (suggestedClassification as any).otherMaterials || 0,
        explosives: (suggestedClassification as any).explosives || 0
      };

      if (result.suggestedMatch.subclassificationId) {
        const subclass = subClassifications.find(
          (s: any) => (s.id || s.code) === result.suggestedMatch.subclassificationId
        );
        if (subclass) {
          enrichedSuggestedMatch.subCode = subclass.code;
          enrichedSuggestedMatch.subName = subclass.name;
        }
      }
    }

    // Return the enriched result for classify mode
    return NextResponse.json({
      success: true,
      data: {
        matches: enrichedMatches,
        suggestedMatch: enrichedSuggestedMatch,
        isDedicatedComponent: result.isDedicatedComponent || false,
        dedicatedComponentType: result.dedicatedComponentType || null,
        classificationStage: result.classificationStage || null
      },
      message: 'Classification found successfully'
    });

  } catch (error: any) {
    console.error('Error finding classifications:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to find classifications' },
      { status: 500 }
    );
  }
}

