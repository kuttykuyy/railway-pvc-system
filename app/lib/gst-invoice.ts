import { logger } from './logger';

import { prisma } from './db';
import { GST_RATE } from './billing';

/**
 * The Indian financial year a date falls in, as "26-27" for April 2026 – March 2027.
 * Invoice numbering restarts each financial year.
 */
export function financialYearOf(date: Date): string {
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? year : year - 1; // April is month 3
  return `${String(startYear % 100).padStart(2, '0')}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/**
 * The next invoice number in a CONSECUTIVE series, restarted each financial year:
 * IRP/26-27/0001. Fourteen characters, and only letters, digits and slashes.
 *
 * Rule 46(b) asks for a consecutive serial number unique within the financial year.
 * The old generator returned `GST-` plus part of a timestamp and four random digits —
 * unique, but in no sequence at all, with no financial-year boundary, and nothing to
 * show a gap if an invoice went missing.
 *
 * The number is taken from the highest one already issued in that year, inside the
 * same transaction that writes the invoice, so two payments landing together cannot
 * take the same number; the unique index on invoiceNumber is the backstop and the
 * caller retries.
 */
export const nextInvoiceNumber = async (tx: any, invoiceDate: Date): Promise<string> => {
  const fy = financialYearOf(invoiceDate);
  const prefix = `IRP/${fy}/`;
  const latest = await tx.gstInvoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });
  const lastSerial = latest ? parseInt(latest.invoiceNumber.slice(prefix.length), 10) : 0;
  const next = (Number.isFinite(lastSerial) ? lastSerial : 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
};

/** Kept for callers that only want to see the shape; real numbers come from the sequence. */
export const generateGstInvoiceNumber = (): string => {
  return `IRP/${financialYearOf(new Date())}/0000`;
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

/**
 * How the money that was collected relates to the tax.
 *
 * 'exclusive' — the customer was charged the amount PLUS GST (pay ₹1,180 for ₹1,000
 *               of credit). The amount is the taxable value.
 * 'inclusive' — the customer was charged the amount and the GST is inside it (pay
 *               ₹1,000, of which ₹152.54 is tax). The taxable value is the amount
 *               divided by 1.18.
 *
 * This existed only as 'exclusive'. Three real invoices were written that way for
 * payments taken inclusive, so each declared ₹180 of tax on a ₹1,000 receipt that
 * only carried ₹152.54 — the invoice claimed more than the customer ever paid.
 */
export type GstBasis = 'exclusive' | 'inclusive';

export const calculateGst = (
  amount: number,
  isInterstate: boolean = false,
  basis: GstBasis = 'exclusive',
): GstCalculation => {
  const gstRate = GST_RATE; // 18%
  const paid = Number(amount);
  // Round to the paisa at the point of splitting, so subtotal + tax equals the total
  // exactly rather than drifting by a hundredth of a rupee.
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const subtotal = basis === 'inclusive' ? round2(paid / (1 + gstRate)) : paid;
  const totalGst = basis === 'inclusive' ? round2(paid - subtotal) : round2(subtotal * gstRate);

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  
  if (isInterstate) {
    // Interstate: IGST
    igst = totalGst;
  } else {
    // Intrastate: CGST + SGST. The second half takes the remainder rather than being
    // rounded again, so the two halves always add back to the tax exactly — halving
    // an odd number of paise and rounding both ways loses or invents one.
    cgst = round2(totalGst / 2);
    sgst = round2(totalGst - cgst);
  }

  const totalAmount = round2(subtotal + totalGst);

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
  /**
   * The number this invoice must carry. Zoho Books is the invoice of record, so its
   * number is passed in and used verbatim — the app row is a mirror of that document,
   * not a second one.
   *
   * The same supply used to be invoiced twice, under two unrelated series: Zoho's at
   * payment, and the app's own when the customer filled the billing dialog. The
   * customer held one number while the return was filed under the other, so their
   * input credit could never reconcile.
   */
  invoiceNumber?: string;
  /**
   * Zoho's own figures. Given these, they are used exactly as they stand instead of
   * being recalculated — the copy must say what the record says, down to the paisa.
   *
   * It matters most for the inter-state split: Zoho decides that from the customer's
   * GSTIN, while this app assumed intra-state for everyone. Recalculating handed an
   * out-of-state customer a page showing CGST + SGST for a supply the books had
   * recorded as IGST.
   */
  figures?: {
    subtotal: number;
    cgst: number;
    sgst: number;
    igst: number;
    totalGst: number;
    totalAmount: number;
    isInterstate: boolean;
  };
  /** How the collected money relates to the tax. Defaults to the old behaviour. */
  basis?: GstBasis;
  /**
   * The date of supply — when the customer actually paid. Defaults to now, which is
   * right for a live payment and wrong for a backfill: seven real invoices carry the
   * date a catch-up script ran rather than the date the money arrived, putting them in
   * the wrong return period.
   */
  invoiceDate?: Date;
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
    basis = 'exclusive',
    invoiceDate: suppliedDate,
    invoiceNumber: ofRecord,
    figures,
  } = params;

  // Zoho's figures when it has them; our own arithmetic only when it does not.
  const gstCalc: GstCalculation = figures
    ? { ...figures }
    : calculateGst(creditAmount, isInterstate, basis);
  const interstate = figures ? figures.isInterstate : isInterstate;
  const invoiceDate = suppliedDate ?? new Date();

  // The number is drawn and the invoice written in ONE transaction, so two payments
  // completing together cannot read the same "latest" and take the same serial. The
  // unique index is the backstop: if a race still collides, take the next one.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const invoice = await prisma.$transaction(async (tx) => {
        // Zoho's number when there is one — this row then mirrors that document
        // rather than starting a rival series. The internal sequence remains only
        // for records that never went to Zoho at all.
        const invoiceNumber = ofRecord ?? await nextInvoiceNumber(tx, invoiceDate);
        return tx.gstInvoice.create({
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
            isInterstate: interstate,
            status: 'generated',
          },
        });
      });
      logger.log(`[GST] Invoice ${invoice.invoiceNumber} for user ${userId}, dated ${invoiceDate.toISOString().slice(0, 10)} (${basis})`);
      return invoice;
    } catch (error: any) {
      const collided = error?.code === 'P2002';
      if (!collided || attempt === 4) throw error;
      logger.log('[GST] Invoice number was taken by a concurrent payment; taking the next one.');
    }
  }
  throw new Error('Could not allocate a GST invoice number.');
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

