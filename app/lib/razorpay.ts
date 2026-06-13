import { logger } from './logger';

import Razorpay from 'razorpay';
import crypto from 'crypto';

// Load Razorpay credentials from environment variables only.
// A hardcoded secrets-file fallback was removed to prevent accidental
// credential exposure if the server home directory is compromised.
const loadRazorpayCredentials = () => {
  try {
    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
      logger.log('[Razorpay] Loading credentials from environment variables');
      return {
        keyId: process.env.RAZORPAY_KEY_ID,
        keySecret: process.env.RAZORPAY_KEY_SECRET,
      };
    }

    logger.warn('[Razorpay] Credentials not found in environment variables');
  } catch (error) {
    console.error('[Razorpay] Error loading credentials:', error);
  }

  return null;
};

// Initialize Razorpay instance
export const getRazorpayInstance = (): Razorpay | null => {
  const credentials = loadRazorpayCredentials();
  
  if (!credentials) {
    console.error('Razorpay credentials not found');
    return null;
  }
  
  try {
    return new Razorpay({
      key_id: credentials.keyId,
      key_secret: credentials.keySecret,
    });
  } catch (error) {
    console.error('Error initializing Razorpay:', error);
    return null;
  }
};

// Get Razorpay Key ID for frontend
export const getRazorpayKeyId = (): string | null => {
  const credentials = loadRazorpayCredentials();
  return credentials?.keyId || null;
};

// Create Razorpay order
export interface CreateOrderParams {
  amount: number; // Amount in rupees
  currency?: string;
  receipt?: string;
  notes?: Record<string, any>;
  payment_capture?: 1 | 0; // Auto-capture or manual capture
}

export interface RazorpayOrder {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: string;
  attempts: number;
  notes: Record<string, any>;
  created_at: number;
}

export interface RazorpayError {
  statusCode: number;
  error: {
    code: string;
    description: string;
    source: string;
    step: string;
    reason: string;
    metadata: Record<string, any>;
  };
}

export const createRazorpayOrder = async (
  params: CreateOrderParams
): Promise<RazorpayOrder> => {
  const razorpay = getRazorpayInstance();
  
  if (!razorpay) {
    const error = new Error('Razorpay is not configured. Please contact support.');
    console.error('[Razorpay] Configuration error: Razorpay credentials missing');
    throw error;
  }

  // Validate required parameters
  if (!params.amount || typeof params.amount !== 'number' || params.amount <= 0) {
    const error = new Error('Invalid amount: Amount must be a positive number');
    console.error('[Razorpay] Validation error:', { amount: params.amount });
    throw error;
  }

  // Validate amount range (min: ₹1, max: ₹50,00,000 for Razorpay)
  if (params.amount < 1) {
    throw new Error('Amount must be at least ₹1');
  }
  if (params.amount > 5000000) {
    throw new Error('Amount cannot exceed ₹50,00,000');
  }

  // Validate currency (if provided)
  const validCurrencies = ['INR', 'USD', 'EUR', 'GBP'];
  const currency = params.currency || 'INR';
  if (!validCurrencies.includes(currency)) {
    throw new Error(`Invalid currency: ${currency}. Supported currencies: ${validCurrencies.join(', ')}`);
  }

  // Build order options with all required fields
  const options = {
    amount: Math.round(params.amount * 100), // Convert to paise
    currency,
    receipt: params.receipt || `receipt_${Date.now()}`,
    payment_capture: params.payment_capture ?? 1, // Auto-capture by default
    notes: params.notes || {},
  };

  // Log order creation attempt
  logger.log('[Razorpay] Creating order:', {
    amount: options.amount,
    currency: options.currency,
    receipt: options.receipt,
    payment_capture: options.payment_capture,
    timestamp: new Date().toISOString(),
  });

  try {
    const order = await razorpay.orders.create(options);
    
    // Log successful order creation
    logger.log('[Razorpay] Order created successfully:', {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      status: order.status,
      timestamp: new Date().toISOString(),
    });
    
    return order as RazorpayOrder;
  } catch (error: any) {
    // Parse and log detailed Razorpay error
    const razorpayError = error as RazorpayError;
    
    console.error('[Razorpay] Order creation failed:', {
      statusCode: razorpayError.statusCode || error.statusCode || 500,
      errorCode: razorpayError.error?.code || 'UNKNOWN_ERROR',
      description: razorpayError.error?.description || error.message,
      source: razorpayError.error?.source,
      step: razorpayError.error?.step,
      reason: razorpayError.error?.reason,
      metadata: razorpayError.error?.metadata,
      requestParams: options,
      timestamp: new Date().toISOString(),
    });

    // Throw error with appropriate message
    if (razorpayError.statusCode) {
      // Known Razorpay error
      const errorMessage = razorpayError.error?.description || error.message || 'Failed to create Razorpay order';
      const enhancedError: any = new Error(errorMessage);
      enhancedError.statusCode = razorpayError.statusCode;
      enhancedError.code = razorpayError.error?.code;
      enhancedError.razorpayError = razorpayError.error;
      throw enhancedError;
    } else {
      // Unknown error
      const enhancedError: any = new Error(`Failed to create Razorpay order: ${error.message}`);
      enhancedError.statusCode = 500;
      enhancedError.code = 'INTERNAL_ERROR';
      throw enhancedError;
    }
  }
};

// Verify Razorpay payment signature
export interface VerifySignatureParams {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export const verifyRazorpaySignature = (
  params: VerifySignatureParams
): boolean => {
  const credentials = loadRazorpayCredentials();
  
  if (!credentials) {
    console.error('Razorpay credentials not found for signature verification');
    return false;
  }

  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = params;
    
    // Create signature
    const text = `${razorpayOrderId}|${razorpayPaymentId}`;
    const generated_signature = crypto
      .createHmac('sha256', credentials.keySecret)
      .update(text)
      .digest('hex');

    return generated_signature === razorpaySignature;
  } catch (error) {
    console.error('Error verifying Razorpay signature:', error);
    return false;
  }
};

// Fetch payment details
export const fetchPaymentDetails = async (paymentId: string) => {
  const razorpay = getRazorpayInstance();
  
  if (!razorpay) {
    throw new Error('Razorpay is not configured');
  }

  try {
    const payment = await razorpay.payments.fetch(paymentId);
    return payment;
  } catch (error: any) {
    console.error('Error fetching payment details:', error);
    throw new Error(`Failed to fetch payment details: ${error.message}`);
  }
};

// Check if Razorpay is enabled
export const isRazorpayEnabled = (): boolean => {
  const credentials = loadRazorpayCredentials();
  return credentials !== null;
};

