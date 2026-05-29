
import { prisma } from './db';
import { GST_RATE } from './billing';

// Generate GST invoice number - Simple sequential format
export const generateGstInvoiceNumber = (): string => {
  // Use timestamp + random for uniqueness
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  
  // Create a shorter unique number from timestamp (last 6 digits) + random
  const uniqueId = `${timestamp.toString().slice(-6)}${random}`;
  
  const invoiceNumber = `GST-${uniqueId}`;
  console.log(`[GST] Generated invoice number: ${invoiceNumber}`);
  
  return invoiceNumber;
};

// Calculate GST components
export interface GstCalculation {
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalGst: number;
  totalAmount: number;
  isInterstate: boolean;
}

export const calculateGst = (
  amount: number,
  isInterstate: boolean = false
): GstCalculation => {
  const subtotal = Number(amount);
  const gstRate = GST_RATE; // 18%
  const totalGst = subtotal * gstRate;
  
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  
  if (isInterstate) {
    // Interstate: IGST
    igst = totalGst;
  } else {
    // Intrastate: CGST + SGST (equal split)
    cgst = totalGst / 2;
    sgst = totalGst / 2;
  }
  
  const totalAmount = subtotal + totalGst;
  
  return {
    subtotal: Number(subtotal.toFixed(2)),
    cgst: Number(cgst.toFixed(2)),
    sgst: Number(sgst.toFixed(2)),
    igst: Number(igst.toFixed(2)),
    totalGst: Number(totalGst.toFixed(2)),
    totalAmount: Number(totalAmount.toFixed(2)),
    isInterstate,
  };
};

// Create GST invoice
export interface CreateGstInvoiceParams {
  userId: string;
  razorpayTransactionId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerGstin?: string;
  customerAddress?: string;
  creditAmount: number;
  isInterstate?: boolean;
}

export const createGstInvoice = async (
  params: CreateGstInvoiceParams
): Promise<any> => {
  const {
    userId,
    razorpayTransactionId,
    customerName,
    customerEmail,
    customerPhone,
    customerGstin,
    customerAddress,
    creditAmount,
    isInterstate = false,
  } = params;
  
  // Calculate GST
  const gstCalc = calculateGst(creditAmount, isInterstate);
  
  // Generate invoice number
  const invoiceNumber = generateGstInvoiceNumber();
  
  // Use current timestamp for invoice date
  const invoiceDate = new Date(Date.now());
  
  console.log(`[GST] Creating invoice: ${invoiceNumber} for user ${userId} at ${invoiceDate.toISOString()}`);
  
  // Create invoice
  const invoice = await prisma.gstInvoice.create({
    data: {
      userId,
      invoiceNumber,
      invoiceDate,
      razorpayTransactionId,
      customerName,
      customerEmail,
      customerPhone: customerPhone || null,
      customerGstin: customerGstin || null,
      customerAddress: customerAddress || null,
      subtotal: gstCalc.subtotal,
      cgst: gstCalc.cgst,
      sgst: gstCalc.sgst,
      igst: gstCalc.igst,
      totalGst: gstCalc.totalGst,
      totalAmount: gstCalc.totalAmount,
      description: `Credit Top-up - ₹${creditAmount.toFixed(2)}`,
      isInterstate,
      status: 'generated',
    },
  });
  
  return invoice;
};

// Get GST invoice
export const getGstInvoice = async (invoiceId: string) => {
  return await prisma.gstInvoice.findUnique({
    where: { id: invoiceId },
  });
};

// Get user's GST invoices
export const getUserGstInvoices = async (userId: string) => {
  return await prisma.gstInvoice.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
};

// Get invoice by number
export const getGstInvoiceByNumber = async (invoiceNumber: string) => {
  return await prisma.gstInvoice.findUnique({
    where: { invoiceNumber },
  });
};

// Get invoice by Razorpay transaction
export const getGstInvoiceByTransaction = async (
  razorpayTransactionId: string
) => {
  return await prisma.gstInvoice.findUnique({
    where: { razorpayTransactionId },
  });
};
