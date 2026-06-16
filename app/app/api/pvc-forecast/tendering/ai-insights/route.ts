export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = process.env.ABACUSAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });
    }

    const body = await request.json();
    const { contractDetails, baseIndices, scenarios, biddingIntelligence, monthlyIndexTrends, dataFreshness } = body;

    // Build a concise data summary for the AI
    const lastMonths = (monthlyIndexTrends || []).slice(-6);
    const firstMonths = (monthlyIndexTrends || []).slice(0, 3);

    const componentKeys = ['labor', 'cement', 'steel', 'fuel', 'materials', 'machinery', 'explosives'];
    const activeComponents = componentKeys.filter(k => (contractDetails.coefficients[k] || 0) > 0);

    const trendSummary = activeComponents.map(key => {
      const baseVal = baseIndices[key] || 100;
      const lastVal = lastMonths.length > 0 ? lastMonths[lastMonths.length - 1][`${key}_baseline`] : baseVal;
      const changePercent = baseVal > 0 ? (((lastVal - baseVal) / baseVal) * 100).toFixed(1) : '0.0';
      const coeff = contractDetails.coefficients[key] || 0;
      const freshness = dataFreshness?.[key];
      return `  ${key.toUpperCase()} (coeff ${coeff}%): base=${baseVal.toFixed(1)}, projected end=${lastVal?.toFixed(1) || baseVal.toFixed(1)}, change=${changePercent}%${freshness ? `, last updated: ${freshness}` : ''}`;
    }).join('\n');

    const prompt = `You are a Railway infrastructure contracts pricing expert specializing in Indian Railway GCC (General Conditions of Contract) Price Variation Clauses (PVC).

Analyze the following tender PVC forecast and provide actionable bidding intelligence in JSON format.

CONTRACT DETAILS:
- Zone: ${contractDetails.zone} | Steel City: ${contractDetails.steelCity}
- Contract Value: ₹${(contractDetails.totalValue / 10000000).toFixed(2)} Crores
- Duration: ${contractDetails.duration} months
- Base Month: ${contractDetails.baseMonth}
- Start Month: ${contractDetails.startMonth}
- Steel Types: ${(contractDetails.selectedSteelTypes || []).join(', ')}
- Fixed Component (W): ${contractDetails.coefficients?.fixed || 0}% (not escalated under GCC)

REAL-TIME INDEX TRENDS (Base to Projected End):
${trendSummary}

FORECAST RESULTS:
- Baseline PVC Payout: ₹${(scenarios.baseline.totalPvc || 0).toLocaleString()}
- Aggressive Scenario: ₹${(scenarios.aggressive.totalPvc || 0).toLocaleString()}
- Conservative Scenario: ₹${(scenarios.conservative.totalPvc || 0).toLocaleString()}
- Total Cost Inflation (including uncompensated fixed %): ₹${(biddingIntelligence.totalProjectedCostInflation || 0).toLocaleString()}
- Uncompensated Inflation: ₹${(biddingIntelligence.uncompensatedInflation || 0).toLocaleString()}
- Recommended Bid Loading: +${biddingIntelligence.recommendedLoadingPercent || 0}%
- Overall Risk: ${biddingIntelligence.riskLevel}

COMPONENT RISKS:
${(biddingIntelligence.componentRisks || []).map((c: any) => `  ${c.key}: ${c.risk} risk (stdDev: ${c.stdDev})`).join('\n')}

Provide a comprehensive analysis in the following JSON structure:

{
  "marketOutlook": "2-3 sentence summary of the current Indian Railway materials market conditions based on the index trends shown",
  "keyFindings": [
    "Specific finding 1 about the most important risk or opportunity",
    "Specific finding 2",
    "Specific finding 3"
  ],
  "componentInsights": [
    {
      "component": "COMPONENT_NAME",
      "insight": "Specific insight about this component's trend and impact on this tender",
      "action": "Specific action the bidder should take"
    }
  ],
  "bidStrategy": {
    "headline": "One-line bid strategy recommendation",
    "loading": "Explanation of why the recommended loading % is justified",
    "fixedComponentRisk": "Analysis of the uncompensated fixed component risk",
    "contingency": "Specific contingency advice for this contract"
  },
  "redFlags": [
    "Any red flag that warrants special attention in the bid"
  ],
  "opportunities": [
    "Any favorable conditions the bidder can leverage"
  ],
  "confidenceNote": "Brief note on forecast confidence given data freshness and history depth"
}

Respond with raw JSON only. Be specific, practical, and reference actual numbers from the data.`;

    const response = await fetch('https://routellm.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'route-llm',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 4000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('AI API error:', err);
      return NextResponse.json({ error: 'AI service error' }, { status: 502 });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json({ error: 'Empty AI response' }, { status: 502 });
    }

    let analysis;
    try {
      analysis = JSON.parse(content);
    } catch {
      // Try extracting JSON from the response
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        analysis = JSON.parse(match[0]);
      } else {
        return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 502 });
      }
    }

    return NextResponse.json({ success: true, analysis });
  } catch (error: any) {
    console.error('AI insights error:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate AI insights' }, { status: 500 });
  }
}
