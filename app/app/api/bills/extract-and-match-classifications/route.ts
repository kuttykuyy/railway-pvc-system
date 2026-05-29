import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';
import { authOptions } from '@/lib/auth';

interface LineItem {
  itemNumber?: string;
  description: string;
  quantity?: number;
  rate?: number;
  amount: number;
  schedule?: string;
  category?: string;
  steelType?: string;
}

interface ClassificationMatch {
  itemNumber: string;
  description: string;
  amount: number;
  subClassificationId: string;
  subClassificationCode: string;
  confidence: string;
  reasoning: string;
  steelTypes?: string[];
  quantity?: number;
  rate?: number;
  schedule?: string;
}

function findBestSubClassificationMatch(
  description: string,
  subClassifications: any[],
  category?: string,
  schedule?: string
): any {
  if (!description) return null;

  const descLower = description.toLowerCase();
  const matches: any[] = [];

  for (const subClass of subClassifications) {
    let score = 0;
    const reasons: string[] = [];

    // Schedule-based matching
    if (schedule) {
      const scheduleNum = schedule.match(/\d+/)?.[0];
      const groupCode = subClass.group?.code;
      if (groupCode === scheduleNum) {
        score += 500;
        reasons.push(`Schedule matches group`);
      }
    }

    // Category-based matching
    if (category === 'steel' && subClass.code?.endsWith('B') && subClass.steel > 70) {
      score += 400;
      reasons.push('Steel supply matched');
    }
    if (category === 'cement' && subClass.code?.endsWith('C') && subClass.cement > 70) {
      score += 400;
      reasons.push('Cement supply matched');
    }

    // Earthwork keywords
    if (['excavation', 'cutting', 'embankment', 'formation', 'earth', 'soil'].some(kw => descLower.includes(kw))) {
      if (subClass.group?.code === '1') {
        score += 300;
        reasons.push('Earthwork keywords');
      }
    }

    // Ballast keywords
    if (['ballast', 'screening', 'stone', 'aggregate'].some(kw => descLower.includes(kw))) {
      if (subClass.group?.code === '2') {
        score += 300;
        reasons.push('Ballast keywords');
      }
    }

    // Bridge keywords
    if (['bridge', 'girder', 'crane rail', 'eot crane', 'steel work'].some(kw => descLower.includes(kw))) {
      if (subClass.group?.code === '6') {
        score += 250;
        reasons.push('Bridge keywords');
      }
    }

    // Track keywords
    if (['track', 'rail', 'sleeper', 'fishplate', 'turnout'].some(kw => descLower.includes(kw))) {
      if (subClass.group?.code === '7') {
        score += 300;
        reasons.push('Track keywords');
      }
    }

    // Building keywords
    if (['building', 'plumbing', 'finishing', 'flooring', 'roofing', 'gutter', 'ventilator', 'glazing', 'window', 'epoxy', 'pvc'].some(kw => descLower.includes(kw))) {
      if (subClass.group?.code === '5') {
        score += 200;
        reasons.push('Building keywords');
      }
    }

    // Steel supply pattern
    if (subClass.steel > 70 && (descLower.includes('supply') || descLower.includes('fabrication') || descLower.includes('erection'))) {
      score += 150;
      reasons.push('Steel pattern');
    }

    // Cement supply pattern
    if (subClass.cement > 70 && (descLower.includes('cement') || descLower.includes('rcc') || descLower.includes('concrete'))) {
      score += 150;
      reasons.push('Cement pattern');
    }

    if (score > 0) {
      let confidence = 'LOW';
      if (score >= 400) confidence = 'VERY_HIGH';
      else if (score >= 250) confidence = 'HIGH';
      else if (score >= 100) confidence = 'MEDIUM';

      matches.push({
        score,
        subClass,
        reasoning: reasons.join('; '),
        confidence
      });
    }
  }

  if (matches.length === 0) return null;

  matches.sort((a, b) => b.score - a.score);
  const best = matches[0];

  return {
    subClass: best.subClass,
    confidence: best.confidence,
    reasoning: best.reasoning
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { lineItems } = body;

    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      return NextResponse.json(
        { error: 'lineItems array is required' },
        { status: 400 }
      );
    }

    const subClassifications = await prisma.subClassification.findMany({
      where: { isActive: true },
      include: {
        group: {
          select: {
            id: true,
            code: true,
            name: true
          }
        }
      }
    });

    if (subClassifications.length === 0) {
      return NextResponse.json(
        { error: 'No active SubClassifications found' },
        { status: 400 }
      );
    }

    const matches: ClassificationMatch[] = [];

    for (const item of lineItems) {
      if (!item.description || item.amount <= 0) continue;

      const match = findBestSubClassificationMatch(
        item.description,
        subClassifications,
        item.category,
        item.schedule
      );

      if (match) {
        const steelTypes: string[] = [];
        if (match.subClass.steel > 70 && item.steelType) {
          if (item.steelType.includes('TMT')) steelTypes.push('TMT Bars');
          else if (item.steelType.includes('Angle') || item.steelType.includes('Channel')) 
            steelTypes.push('Structural Steel (Angle/Channel)');
          else if (item.steelType.includes('Plate')) steelTypes.push('Steel Plates');
        }

        matches.push({
          itemNumber: item.itemNumber || `Item ${matches.length + 1}`,
          description: item.description,
          amount: item.amount,
          subClassificationId: match.subClass.id,
          subClassificationCode: match.subClass.code,
          confidence: match.confidence,
          reasoning: match.reasoning,
          steelTypes: steelTypes.length > 0 ? steelTypes : undefined,
          quantity: item.quantity,
          rate: item.rate,
          schedule: item.schedule
        });
      } else {
        const defaultSubClass = subClassifications.find(sc => sc.isDefault);
        if (defaultSubClass) {
          matches.push({
            itemNumber: item.itemNumber || `Item ${matches.length + 1}`,
            description: item.description,
            amount: item.amount,
            subClassificationId: defaultSubClass.id,
            subClassificationCode: defaultSubClass.code,
            confidence: 'LOW',
            reasoning: 'Default classification',
            quantity: item.quantity,
            rate: item.rate,
            schedule: item.schedule
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      matches: matches,
      summary: {
        totalItems: lineItems.length,
        matchedItems: matches.length,
        veryHighConfidence: matches.filter(m => m.confidence === 'VERY_HIGH').length,
        highConfidence: matches.filter(m => m.confidence === 'HIGH').length,
        mediumConfidence: matches.filter(m => m.confidence === 'MEDIUM').length,
        lowConfidence: matches.filter(m => m.confidence === 'LOW').length
      }
    });
  } catch (error: any) {
    console.error('Classification matching error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to match classifications' },
      { status: 500 }
    );
  }
}
