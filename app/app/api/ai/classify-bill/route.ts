
/**
 * API Route: AI Bill Classification
 * Uses enhanced AI prompts to extract and classify bill items with GCC codes
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  generateEnhancedExtractionPrompt,
  validateAndEnhanceClassifications,
  generateClassificationReport,
  type EnhancedBillExtraction
} from '@/lib/enhanced-ai-classification';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

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

    // Generate enhanced extraction prompt
    const extractionPrompt = generateEnhancedExtractionPrompt();

    // Prepare messages for LLM API
    let messages: any[];
    
    if (file.type === 'application/pdf') {
      // For PDF files
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
              text: extractionPrompt
            }
          ]
        }
      ];
    } else {
      // For image files
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
              text: extractionPrompt
            }
          ]
        }
      ];
    }

    console.log('Calling AI API for enhanced bill classification...');

    // Call the LLM API with JSON response format
    const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        messages: messages,
        response_format: { type: 'json_object' },
        max_tokens: 4000,
        temperature: 0.1 // Low temperature for more deterministic extraction
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
    let extractedData: EnhancedBillExtraction;
    try {
      extractedData = JSON.parse(content);
    } catch (error) {
      console.error('Failed to parse LLM response:', content);
      return NextResponse.json(
        { error: 'Failed to parse extracted data. Please try again.' },
        { status: 500 }
      );
    }

    // Validate and enhance classifications with actual GCC data
    const validatedData = validateAndEnhanceClassifications(extractedData);

    // Generate human-readable report
    const report = generateClassificationReport(validatedData);

    // Return the extracted and classified data
    return NextResponse.json({
      success: true,
      data: validatedData,
      report: report,
      message: 'Bill classified successfully with AI'
    });

  } catch (error: any) {
    console.error('Error classifying bill:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to classify bill' },
      { status: 500 }
    );
  }
}
