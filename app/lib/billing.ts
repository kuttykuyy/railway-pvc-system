
import { prisma } from './db';

export interface PricingTier {
  name: string;
  displayName: string;
  minBills: number;
  maxBills: number | null;
  pricePerBill: number;
  discountPercent: number;
}

// Standard pricing tiers
export const PRICING_TIERS: PricingTier[] = [
  {
    name: 'standard',
    displayName: 'Standard',
    minBills: 0,
    maxBills: 99,
    pricePerBill: 1,
    discountPercent: 0
  },
  {
    name: 'volume1',
    displayName: 'Volume Tier 1',
    minBills: 100,
    maxBills: 249,
    pricePerBill: 900,
    discountPercent: 10
  },
  {
    name: 'volume2',
    displayName: 'Volume Tier 2',
    minBills: 250,
    maxBills: 499,
    pricePerBill: 800,
    discountPercent: 20
  },
  {
    name: 'enterprise',
    displayName: 'Enterprise',
    minBills: 500,
    maxBills: null,
    pricePerBill: 700,
    discountPercent: 30
  }
];

export const BASE_PRICE_PER_BILL = 1;
export const FREE_TRIAL_BILLS = 0;
export const GST_RATE = 0.18; // 18% GST

/**
 * Calculate pricing for a bill based on user's current usage
 */
export async function calculateBillPricing(userId: string): Promise<{
  originalPrice: number;
  finalPrice: number;
  discount: number;
  discountType: string | null;
  isFree: boolean;
  tier: PricingTier;
}> {
  // Get user account and usage stats
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      customerAccount: true
    }
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Check for free trial (completely disabled)
  if (false) {
    return {
      originalPrice: BASE_PRICE_PER_BILL,
      finalPrice: 0,
      discount: BASE_PRICE_PER_BILL,
      discountType: 'trial',
      isFree: true,
      tier: PRICING_TIERS[0] // Standard tier
    };
  }

  // Get current month's bill count for volume pricing
  const currentDate = new Date();
  const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

  const monthlyBillCount = await prisma.billTransaction.count({
    where: {
      userId,
      createdAt: {
        gte: startOfMonth,
        lte: endOfMonth
      },
      status: { in: ['pending', 'paid'] } // Don't count failed transactions
    }
  });

  // Determine pricing tier
  const tier = getPricingTier(monthlyBillCount);

  return {
    originalPrice: BASE_PRICE_PER_BILL,
    finalPrice: tier.pricePerBill,
    discount: BASE_PRICE_PER_BILL - tier.pricePerBill,
    discountType: tier.name === 'standard' ? null : 'volume',
    isFree: false,
    tier
  };
}

/**
 * Get pricing tier based on monthly bill count
 */
export function getPricingTier(monthlyBillCount: number): PricingTier {
  for (const tier of PRICING_TIERS.reverse()) {
    if (monthlyBillCount >= tier.minBills) {
      if (tier.maxBills === null || monthlyBillCount <= tier.maxBills) {
        return tier;
      }
    }
  }
  return PRICING_TIERS[0]; // Default to standard
}

/**
 * Create a bill transaction
 */
export async function createBillTransaction(
  userId: string,
  billId: string,
  sessionEmail?: string
): Promise<any> {
  const pricing = await calculateBillPricing(userId);

  // Create the transaction
  const transaction = await prisma.billTransaction.create({
    data: {
      userId,
      billId,
      amount: pricing.finalPrice,
      originalAmount: pricing.originalPrice,
      discount: pricing.discount,
      discountType: pricing.discountType,
      status: pricing.isFree ? 'paid' : 'pending',
      isFree: pricing.isFree,
      paidAt: pricing.isFree ? new Date() : null
    }
  });

  // Update user's free trial usage
  if (pricing.isFree) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        freeTrialUsed: { increment: 1 },
        totalBillsProcessed: { increment: 1 },
        isTrialActive: pricing.tier.name === 'standard' && 
                      (await prisma.user.findUnique({ where: { id: userId } }))!.freeTrialUsed + 1 < FREE_TRIAL_BILLS
      }
    });
  } else {
    // Update total bills processed
    await prisma.user.update({
      where: { id: userId },
      data: {
        totalBillsProcessed: { increment: 1 }
      }
    });
  }

  // Update customer account bill count
  const account = await prisma.customerAccount.findUnique({
    where: { userId }
  });

  if (account) {
    await prisma.customerAccount.update({
      where: { userId },
      data: {
        currentMonthBills: { increment: 1 },
        outstandingAmount: pricing.isFree ? account.outstandingAmount : { increment: pricing.finalPrice }
      }
    });
  } else {
    // Create customer account
    await prisma.customerAccount.create({
      data: {
        userId,
        currentMonthBills: 1,
        outstandingAmount: pricing.isFree ? 0 : pricing.finalPrice
      }
    });
  }

  // Get updated user data for message
  const updatedUser = await prisma.user.findUnique({ where: { id: userId } });
  const remainingFreeTrials = updatedUser ? Math.max(0, FREE_TRIAL_BILLS - updatedUser.freeTrialUsed) : 0;

  return {
    transaction,
    pricing,
    message: pricing.isFree ? 
      `Free trial bill processed (${remainingFreeTrials} remaining)` :
      `Bill processed - ₹${pricing.finalPrice} ${pricing.discountType ? `(${pricing.tier.discountPercent}% volume discount applied)` : ''}`
  };
}

/**
 * Get user's billing summary
 */
export async function getUserBillingSummary(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      customerAccount: true
    }
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Get current month transactions
  const currentDate = new Date();
  const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

  const monthlyTransactions = await prisma.billTransaction.findMany({
    where: {
      userId,
      createdAt: {
        gte: startOfMonth,
        lte: endOfMonth
      }
    },
    include: {
      bill: {
        include: {
          contract: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  const monthlyStats = {
    totalBills: monthlyTransactions.length,
    paidBills: monthlyTransactions.filter(t => t.status === 'paid').length,
    pendingBills: monthlyTransactions.filter(t => t.status === 'pending').length,
    freeBills: monthlyTransactions.filter(t => t.isFree).length,
    totalAmount: monthlyTransactions.reduce((sum, t) => sum + t.amount, 0),
    totalSavings: monthlyTransactions.reduce((sum, t) => sum + t.discount, 0)
  };

  // Calculate next bill pricing
  const nextBillPricing = await calculateBillPricing(userId);

  return {
    user: {
      totalBillsProcessed: user.totalBillsProcessed,
      freeTrialUsed: user.freeTrialUsed,
      freeTrialRemaining: Math.max(0, FREE_TRIAL_BILLS - user.freeTrialUsed),
      isTrialActive: user.isTrialActive
    },
    account: user.customerAccount,
    monthly: monthlyStats,
    nextBillPricing,
    currentTier: getPricingTier(monthlyStats.totalBills),
    transactions: monthlyTransactions
  };
}

/**
 * Generate monthly invoice
 */
export async function generateMonthlyInvoice(userId: string, month: Date): Promise<any> {
  const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const endOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0);

  // Get all paid transactions for the month
  const transactions = await prisma.billTransaction.findMany({
    where: {
      userId,
      createdAt: {
        gte: startOfMonth,
        lte: endOfMonth
      },
      status: 'paid',
      isFree: false // Don't include free bills in invoice
    },
    include: {
      bill: {
        include: {
          contract: true
        }
      }
    }
  });

  if (transactions.length === 0) {
    return null; // No billable transactions
  }

  const subtotal = transactions.reduce((sum: number, t: any) => sum + t.amount, 0);
  const taxAmount = subtotal * GST_RATE;
  const totalAmount = subtotal + taxAmount;

  const invoiceNumber = generateInvoiceNumber(month);

  // Create invoice
  const invoice = await prisma.invoice.create({
    data: {
      userId,
      invoiceNumber,
      billingPeriodStart: startOfMonth,
      billingPeriodEnd: endOfMonth,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      subtotal,
      taxAmount,
      totalAmount,
      outstandingAmount: totalAmount,
      paymentDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  });

  // Create invoice items
  for (const transaction of transactions) {
    await prisma.invoiceItem.create({
      data: {
        invoiceId: invoice.id,
        billTransactionId: transaction.id,
        description: `PVC Bill Processing - ${transaction.bill.billNo} (${transaction.bill.contract.agreementNo})`,
        unitPrice: transaction.amount,
        totalPrice: transaction.amount
      }
    });
  }

  return invoice;
}

/**
 * Generate invoice number
 */
function generateInvoiceNumber(month: Date): string {
  const year = month.getFullYear();
  const monthNum = String(month.getMonth() + 1).padStart(2, '0');
  const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `PVC-${year}${monthNum}-${randomNum}`;
}

/**
 * Process payment for invoice
 */
export async function processPayment(
  invoiceId: string,
  amount: number,
  paymentMethod: string,
  transactionRef?: string
): Promise<any> {
  const payment = await prisma.payment.create({
    data: {
      invoiceId,
      amount,
      paymentMethod,
      transactionRef
    }
  });

  // Update invoice paid amount
  const invoice = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      paidAmount: { increment: amount },
      outstandingAmount: { decrement: amount },
      status: 'paid', // Assuming full payment
      paidAt: new Date()
    }
  });

  // Update customer account
  await prisma.customerAccount.update({
    where: { userId: invoice.userId },
    data: {
      outstandingAmount: { decrement: amount }
    }
  });

  return { payment, invoice };
}
