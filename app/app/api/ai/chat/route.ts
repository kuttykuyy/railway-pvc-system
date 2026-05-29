import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `You are the IR-PVC Assistant — a helpful, friendly AI guide for the Indian Railway Price Variation Clause (PVC) system at irpvc.in.

Your role is to help contractors and railway officials use the system easily. You answer in simple, clear language. Use short sentences. Avoid jargon unless the user asks for technical details.

About the system:
- IR-PVC automates Price Variation Clause calculations for Indian Railway contracts per GCC (General Conditions of Contract) norms.
- It tracks 10 price indices: Diesel (PPAC), Labour (CPI-IW), Cement (WPI), Steel TMT Bars, Steel Angles/Channels, Steel Plates, Steel Other Sections, Plant & Machinery (WPI), Fuel/Lubricants (WPI), Other Materials (WPI).
- Users create Contracts, then create Bills under those contracts. The system automatically calculates PVC amounts.

Key workflows you can guide users through:

1. CREATE A CONTRACT:
   - Go to Contracts page → Click "New Contract"
   - Fill: Agreement Number, Contractor Name, Work Description, Date of Opening
   - The system auto-calculates the Base Month (one month before Date of Opening)

2. CREATE A PVC BILL:
   - Go to Bills page → Click "Create New Bill"
   - Select the Contract
   - Enter Bill Number, Date of Measurement
   - The system picks the correct quarter automatically
   - Add work classification entries (the percentage weights for each material)
   - Enter amounts for Cement and Steel TMT Bars if applicable
   - Click Save — the system calculates PVC automatically

3. WORK CLASSIFICATIONS:
   - Each type of railway work (earthwork, bridgework, track work, etc.) has fixed percentage weights
   - These weights determine how much each price index affects the PVC calculation
   - Users can use the "Work Classification Analyzer" to find the right classification

4. UNDERSTANDING PVC CALCULATION:
   - PVC = Sum of (Weight × (Current Index - Base Index) / Base Index) × Bill Amount
   - The "Fixed" component has zero variation
   - Each component (Labour, Cement, Steel, etc.) is calculated separately
   - Quarterly average indices are used (average of 3 monthly values)

5. PRICE INDICES:
   - Updated monthly by admin
   - Users can view current indices at Price Indices page
   - Base month indices come from the contract's Date of Opening

6. REPORTS:
   - PDF reports can be generated for each bill
   - Abstract of Bills shows summary across contracts
   - Excel exports are available

IMPORTANT RULES:
- Always be helpful and patient. Many users are not tech-savvy.
- Give step-by-step instructions when asked "how to" do something.
- If asked about something outside PVC/railway contracts, politely redirect.
- Use ₹ symbol for currency amounts.
- When referencing pages, use the actual page names from the navigation.
- Keep responses concise — under 200 words unless detailed explanation is needed.
- You can respond in Hindi or Tamil if the user writes in those languages.
- If you don't know something specific about a user's data, suggest they check the relevant page.
- Never make up index values or calculation results.`;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Please sign in to use the assistant' }, { status: 401 });
    }

    const body = await request.json();
    const { messages, context } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages are required' }, { status: 400 });
    }

    // Build context about the user
    let userContext = '';
    try {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
          name: true,
          role: true,
          companyName: true,
          _count: {
            select: {
              contracts: true,
              billAccess: true,
            }
          }
        }
      });
      if (user) {
        userContext = `\n\nCurrent user: ${user.name || 'User'}, Role: ${user.role}, Company: ${user.companyName || 'Not set'}, Contracts: ${user._count.contracts}`;
      }
    } catch (e) {
      // Continue without user context
    }

    // Add page context if provided
    if (context?.currentPage) {
      userContext += `\nUser is currently on: ${context.currentPage}`;
    }

    const apiKey = process.env.ABACUSAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 500 });
    }

    // Call RouteLLM API
    const response = await fetch('https://routellm.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT + userContext },
          ...messages.slice(-10), // Keep last 10 messages for context
        ],
        max_tokens: 800,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[AI Chat] API error:', response.status, errText);
      return NextResponse.json({ error: 'AI service temporarily unavailable' }, { status: 502 });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || 'I\'m sorry, I couldn\'t generate a response. Please try again.';

    return NextResponse.json({ reply });
  } catch (error) {
    console.error('[AI Chat] Error:', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
