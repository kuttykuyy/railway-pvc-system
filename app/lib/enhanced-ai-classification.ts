
/**
 * Enhanced AI Classification System
 * Provides intelligent classification of Railway bill items using AI and GCC classifications
 */

import { GCC_CLASSIFICATIONS, GCCClassification } from './gcc-classifications-data';

export interface BillItemExtraction {
  itemNo: string;
  description: string;
  unit: string;
  baseRate: number;
  agreementRate: number;
  quantity: number;
  amount: number;
  schedule: string;
  chapter?: string;
  groupName?: string;
}

export interface ClassificationSuggestion {
  code: string;
  name: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
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

export interface EnhancedBillExtraction {
  billNo: string;
  billDate: string;
  dateOfMeasurement: string;
  grossBillAmount: number;
  netBillAmount: number | null;
  agreementNo: string;
  agreementDate: string;
  loaNo: string;
  loaDate: string;
  contractorName: string;
  workDescription: string;
  items: BillItemExtraction[];
  suggestedClassifications: ClassificationSuggestion[];
  overallClassification: ClassificationSuggestion | null;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
}

/**
 * Generate comprehensive AI prompt for bill extraction and classification
 */
export function generateEnhancedExtractionPrompt(): string {
  const gccClassificationsSummary = GCC_CLASSIFICATIONS.map(c => 
    `${c.code} - ${c.mainClassification}: ${c.subClassification}\n   Keywords: ${c.keywords.join(', ')}`
  ).join('\n\n');

  return `You are an expert AI assistant specialized in extracting and classifying information from Indian Railway running account bills and PVC documents.

**PRIMARY TASK**: Extract all bill details AND suggest appropriate GCC 46A classification codes for the work.

**STEP 1: Extract Bill Header Information**
1. Bill Number / RA Bill Number
2. Bill Date
3. Date of Measurement / Measurement Date
4. Gross Bill Amount / Total Amount
5. Net Bill Amount (if mentioned)
6. Agreement No
7. Agreement Date
8. LOA No
9. LOA Date
10. Contractor Name
11. Work Description / Name of Work
12. Department (Civil, S&T, Electrical, etc.)

**STEP 2: Extract Item-wise Details**
For each item in the bill, extract:
- Item No
- Description (full work description)
- Unit (Sqm, Metre, MT, Each, etc.)
- Base Rate
- Agreement Rate
- Quantity executed
- Amount
- Schedule name (if mentioned)
- Chapter name (if mentioned)
- Group name (if mentioned)

**STEP 3: Classify Work Items**
Based on the work description and items, suggest appropriate GCC 46A classification codes.

Here are the available GCC classifications:

${gccClassificationsSummary}

**CLASSIFICATION RULES**:
1. Analyze the primary nature of work from the work description and major items
2. Identify key materials involved (steel, cement, bitumen, etc.)
3. Match work type with GCC classification codes
4. Provide confidence level (high/medium/low) based on:
   - High: Clear match with classification keywords
   - Medium: Reasonable match but some uncertainty
   - Low: No clear match, defaulting to general classification

**STEP 4: Calculate Component Breakdown**
Based on the items and amounts, estimate the percentage breakdown of:
- Labour work
- Steel supply
- Cement supply
- Plant & machinery
- Fuel costs
- Other materials

**OUTPUT FORMAT**:
Respond in JSON format with the following structure:

{
  "billNo": "string",
  "billDate": "YYYY-MM-DD",
  "dateOfMeasurement": "YYYY-MM-DD",
  "grossBillAmount": number,
  "netBillAmount": number or null,
  "agreementNo": "string",
  "agreementDate": "YYYY-MM-DD",
  "loaNo": "string",
  "loaDate": "YYYY-MM-DD",
  "contractorName": "string",
  "workDescription": "string",
  "items": [
    {
      "itemNo": "string",
      "description": "string",
      "unit": "string",
      "baseRate": number,
      "agreementRate": number,
      "quantity": number,
      "amount": number,
      "schedule": "string",
      "chapter": "string or null",
      "groupName": "string or null"
    }
  ],
  "suggestedClassifications": [
    {
      "code": "string (e.g., 4A, 5B)",
      "name": "string (classification name)",
      "confidence": "high/medium/low",
      "reason": "string (why this classification was suggested)",
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
  "overallClassification": {
    "code": "string (primary classification)",
    "name": "string",
    "confidence": "high/medium/low",
    "reason": "string (comprehensive explanation)",
    "componentPercentages": { ... }
  },
  "confidence": "high/medium/low",
  "notes": "any important observations, uncertainties, or recommendations"
}

**IMPORTANT INSTRUCTIONS**:
- Extract all dates in YYYY-MM-DD format
- Extract all amounts as numbers without currency symbols or commas
- Include all items found in the bill, even if quantity is 0
- For classifications, provide multiple suggestions if work spans multiple categories
- The overallClassification should be the most representative single classification
- In the notes field, mention any challenges in classification or data extraction
- Be thorough and accurate in item extraction
- If multiple schedules exist, categorize items by schedule

Respond with raw JSON only. Do not include code blocks, markdown, or any other formatting.`;
}

/**
 * Process enhanced extraction result and validate classifications
 */
export function validateAndEnhanceClassifications(
  extraction: EnhancedBillExtraction
): EnhancedBillExtraction {
  // Validate suggested classifications against known GCC codes
  const validatedClassifications = extraction.suggestedClassifications.map(suggestion => {
    const matchingGCC = GCC_CLASSIFICATIONS.find(gcc => gcc.code === suggestion.code);
    
    if (matchingGCC) {
      // Use actual GCC data if code matches
      return {
        ...suggestion,
        name: `${matchingGCC.mainClassification} - ${matchingGCC.subClassification}`,
        componentPercentages: matchingGCC.components
      };
    }
    
    return suggestion;
  });

  // Validate overall classification
  let overallClassification: ClassificationSuggestion | null = extraction.overallClassification;
  if (overallClassification !== null) {
    const matchingGCC = GCC_CLASSIFICATIONS.find(gcc => gcc.code === overallClassification!.code);
    if (matchingGCC) {
      overallClassification = {
        ...overallClassification,
        name: `${matchingGCC.mainClassification} - ${matchingGCC.subClassification}`,
        componentPercentages: matchingGCC.components
      };
    }
  }

  return {
    ...extraction,
    suggestedClassifications: validatedClassifications,
    overallClassification
  };
}

/**
 * Generate user-friendly classification report
 */
export function generateClassificationReport(extraction: EnhancedBillExtraction): string {
  let report = `# Bill Classification Report\n\n`;
  
  report += `## Bill Details\n`;
  report += `- **Bill No**: ${extraction.billNo}\n`;
  report += `- **Work Description**: ${extraction.workDescription}\n`;
  report += `- **Contractor**: ${extraction.contractorName}\n`;
  report += `- **Bill Amount**: ₹${extraction.grossBillAmount.toLocaleString('en-IN')}\n`;
  report += `- **Measurement Date**: ${extraction.dateOfMeasurement}\n\n`;
  
  if (extraction.overallClassification) {
    report += `## Recommended Classification\n`;
    report += `**${extraction.overallClassification.code}** - ${extraction.overallClassification.name}\n`;
    report += `**Confidence**: ${extraction.overallClassification.confidence.toUpperCase()}\n`;
    report += `**Reason**: ${extraction.overallClassification.reason}\n\n`;
    
    report += `### Component Percentages\n`;
    const comp = extraction.overallClassification.componentPercentages;
    report += `- Fixed: ${comp.fixed}%\n`;
    report += `- Labour: ${comp.labour}%\n`;
    report += `- Steel: ${comp.steel}%\n`;
    report += `- Cement: ${comp.cement}%\n`;
    report += `- Plant & Machinery: ${comp.plantMachinery}%\n`;
    report += `- Fuel: ${comp.fuel}%\n`;
    report += `- Other Materials: ${comp.otherMaterials}%\n`;
    report += `- Explosives: ${comp.explosives}%\n\n`;
  }
  
  if (extraction.suggestedClassifications.length > 1) {
    report += `## Alternative Classifications\n`;
    extraction.suggestedClassifications
      .filter(c => c.code !== extraction.overallClassification?.code)
      .forEach(suggestion => {
        report += `\n### ${suggestion.code} - ${suggestion.name}\n`;
        report += `- **Confidence**: ${suggestion.confidence}\n`;
        report += `- **Reason**: ${suggestion.reason}\n`;
      });
    report += `\n`;
  }
  
  report += `## Extracted Items (${extraction.items.length})\n`;
  extraction.items.forEach((item, index) => {
    if (item.amount > 0) {
      report += `\n${index + 1}. **${item.description}**\n`;
      report += `   - Item No: ${item.itemNo}\n`;
      report += `   - Quantity: ${item.quantity} ${item.unit}\n`;
      report += `   - Amount: ₹${item.amount.toLocaleString('en-IN')}\n`;
      if (item.schedule) report += `   - Schedule: ${item.schedule}\n`;
    }
  });
  
  if (extraction.notes) {
    report += `\n## Notes\n${extraction.notes}\n`;
  }
  
  return report;
}
