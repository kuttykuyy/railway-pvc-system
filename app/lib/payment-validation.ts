
import { prisma } from './db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth';
import { normalizeAgreementNo } from './railway-division-helper';
import { verifyRazorpaySignature, fetchPaymentDetails } from './razorpay';

export interface PaymentValidationResult {
  canProcess: boolean;
  reason?: string;
  transaction?: any;
  requiredPayment?: number;
  isFree?: boolean;
  isFirstBill?: boolean;
}

/**
 * Validates if a user can process a bill (payment confirmation required)
 */
export async function validateBillProcessing(
  request: Request,
  isAiUploaded?: boolean
): Promise<PaymentValidationResult> {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return {
        canProcess: false,
        reason: 'Authentication required'
      };
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        customerAccount: true
      }
    });

    if (!user) {
      return {
        canProcess: false,
        reason: 'User not found'
      };
    }

    // Admins and railway staff (executive and accounts/audit) are never charged.
    if (user.role === 'admin' || user.role === 'superadmin' || user.role === 'railway_official' || user.role === 'accounts_official') {
      const roleLabel = user.role === 'superadmin' ? 'Superadmin'
        : user.role === 'admin' ? 'Admin'
        : user.role === 'accounts_official' ? 'Accounts / Audit'
        : 'Railway Official';
      return {
        canProcess: true,
        isFree: true,
        reason: `${roleLabel} - no processing fee`
      };
    }

    // Check if user has a free account (no processing fees)
    if (user.isFreeAccount) {
      return {
        canProcess: true,
        isFree: true,
        reason: 'Free account - no processing fee'
      };
    }

    // Check if user has custom processing fee (could be 0)
    if (user.customProcessingFee !== null) {
      const customFee = user.customProcessingFee;
      if (customFee === 0) {
        return {
          canProcess: true,
          isFree: true,
          reason: 'Custom processing fee set to ₹0'
        };
      }
    }

    // Check if user has free trial remaining
    const { getBillingSettings: getSettings } = await import('./admin-settings');
    const trialSettings = await getSettings();
    const freeTrialLimit = trialSettings.freeTrialBills || 1;
    if (user.freeTrialUsed < freeTrialLimit) {
      return {
        canProcess: true,
        isFree: true,
        reason: `Free trial bill (${user.freeTrialUsed + 1}/${freeTrialLimit} used)`,
      };
    }

    // For paid contractor bills, use a fixed per-bill charge with no discounts —
    // unless the admin set this user a custom fee, which only the ₹0 case ever
    // honoured before: a ₹50 custom fee still charged the standard rate.
    const { getBillingSettings } = await import('./admin-settings');
    const billingSettings = await getBillingSettings();
    const fullCost = isAiUploaded
      ? (billingSettings.aiBillCost || 499)
      : (billingSettings.billCost || 199);
    const billCost = user.customProcessingFee !== null && user.customProcessingFee > 0
      ? user.customProcessingFee
      : fullCost;

    // Check if user has sufficient balance in their customer account
    const currentBalance = user.customerAccount?.creditBalance || 0;

    if (currentBalance >= billCost) {
      return {
        canProcess: true,
        requiredPayment: billCost,
        reason: `Payment of ₹${billCost} will be deducted from account balance (₹${currentBalance} available)`,
        isFirstBill: false,
      };
    }

    // Insufficient balance - payment/credit top-up required
    return {
      canProcess: false,
      requiredPayment: billCost,
      reason: `Insufficient balance. Required: ₹${billCost}, Available: ₹${currentBalance}. Please add credits to continue.`,
      isFirstBill: false,
    };

  } catch (error) {
    console.error('Payment validation error:', error);
    return {
      canProcess: false,
      reason: 'Payment validation failed'
    };
  }
}

/**
 * Every name an agreement answers to, normalized and de-duplicated.
 *
 * A contract created from an LOA stands on its LOA number until its first bill hands
 * it the real agreement number, so one physical agreement can present two identifiers
 * over its life. The one-free-bill-per-agreement rule keys on the identifier, so
 * claiming only the current one left the other free to claim a second trial from
 * another account. Both are claimed, and both are checked.
 *
 * The bill's contract is the source; the caller's agreementNo is kept as a fallback
 * for callers that pass one before the bill can be read back.
 */
export async function trialIdentifiersForBill(
  billId: string,
  agreementNo?: string,
): Promise<string[]> {
  const names = new Set<string>();
  const add = (value?: string | null) => {
    const normalized = normalizeAgreementNo(String(value || ''));
    if (normalized) names.add(normalized);
  };

  add(agreementNo);
  try {
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      select: { contract: { select: { agreementNo: true, loaNo: true } } },
    });
    add(bill?.contract?.agreementNo);
    add(bill?.contract?.loaNo);
  } catch {
    // The caller's agreementNo still stands on its own.
  }
  return [...names];
}

/**
 * Process payment and create bill transaction
 */
export async function processPaymentForBill(
  userId: string,
  billId: string,
  paymentMethod: string,
  paymentReference?: string,
  razorpayData?: {
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    razorpaySignature?: string;
  },
  paidAmount?: number,
  totalPvc?: number,
  agreementNo?: string,
  isAiUploaded?: boolean,
  /**
   * The caller already decided this bill is PAID — do not re-derive a free trial.
   * Without this, the "agreement already claimed a trial → charge instead" downgrade
   * could never succeed: this function saw trial remaining, tried the claim, hit the
   * existing trialClaimedAgreement row, and failed the whole payment — so a user with
   * plenty of credits was refused forever on any already-claimed agreement.
   */
  forceCharge?: boolean
): Promise<{ success: boolean; message: string; transaction?: any }> {
  try {

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { customerAccount: true }
    });

    if (!user) {
      console.error('❌ User not found:', userId);
      return { success: false, message: 'User not found' };
    }

    // Calculate pricing — fetch settings ONCE up front
    const { getBillingSettings } = await import('./admin-settings');
    const billingSettings = await getBillingSettings();
    const standardAmount = isAiUploaded
      ? (billingSettings.aiBillCost || 499)
      : (billingSettings.billCost || 199);
    // A positive custom fee is the user's real rate (₹0 is handled as free below).
    const baseAmount = user.customProcessingFee !== null && user.customProcessingFee > 0
      ? user.customProcessingFee
      : standardAmount;
    const freeTrialLimit = billingSettings.freeTrialBills || 1;

    const finalAmount = baseAmount;
    let discount = 0;
    let discountType: string | null = null;

    discount = baseAmount - finalAmount;

    // Check for free account first (highest priority) — reuses freeTrialLimit from above
    let isFree = false;
    let freeReason = '';

    if (user.role === 'admin' || user.role === 'superadmin') {
      isFree = true;
      freeReason = user.role === 'superadmin' ? 'superadmin' : 'admin';
    } else if (user.role === 'railway_official' || user.role === 'accounts_official') {
      isFree = true;
      freeReason = user.role;
    } else if (user.isFreeAccount) {
      isFree = true;
      freeReason = 'free_account';
    } else if (user.customProcessingFee === 0) {
      isFree = true;
      freeReason = 'custom_zero_fee';
    } else if (!forceCharge) {
      // Free trial: 1 free bill per new user (freeTrialLimit from admin settings).
      // Skipped entirely when the caller downgraded this bill to paid — the trial
      // claim would only re-fail on the agreement that caused the downgrade.
      if (user.freeTrialUsed < freeTrialLimit) {
        isFree = true;
        freeReason = 'trial';
      }
    }


    if (isFree) {
      // ----- Trial bills: claim the slot atomically BEFORE granting anything -----
      if (freeReason === 'trial') {
        // A conditional updateMany guarantees at most `freeTrialLimit` free bills even
        // under concurrent requests (fixes the read-then-write double-spend race), and a
        // hard create on the agreement number blocks the same agreement from claiming a
        // trial across multiple accounts. If either fails, the trial is not available.
        let claimed = false;
        let transaction: any = null;
        const identifiers = await trialIdentifiersForBill(billId, agreementNo);
        try {
          transaction = await prisma.$transaction(async (tx) => {
            const res = await tx.user.updateMany({
              where: { id: userId, freeTrialUsed: { lt: freeTrialLimit } },
              data: { freeTrialUsed: { increment: 1 }, totalBillsProcessed: { increment: 1 } },
            });
            if (res.count === 0) throw new Error('TRIAL_EXHAUSTED');

            // EVERY name this agreement answers to, not just the one the contract
            // happens to carry today. A contract set up from an LOA stands on its LOA
            // number until its first bill supplies the real agreement number, so the
            // same physical agreement can present two identifiers — and claiming only
            // one let it collect a second free bill under the other, from another
            // account. Claiming all of them closes that: whichever name is presented,
            // the row is already there.
            for (const normalized of identifiers) {
              // Hard create (not upsert): a second account reusing any of this
              // agreement's names hits the unique constraint (P2002), the whole
              // transaction rolls back, and the free trial is denied.
              await tx.trialClaimedAgreement.create({
                data: { normalizedAgreementNo: normalized, claimedByUserId: userId },
              });
            }

            const u = await tx.user.findUnique({ where: { id: userId }, select: { freeTrialUsed: true } });
            await tx.user.update({
              where: { id: userId },
              data: { isTrialActive: (u?.freeTrialUsed ?? freeTrialLimit) < freeTrialLimit },
            });
            claimed = true;

            // Created INSIDE the claim transaction: this used to run after it, so a
            // failure here left the trial consumed and the agreement pinned with no
            // bill delivered — the customer's one free bill, spent on an error. Now
            // either everything commits or nothing does.
            return tx.billTransaction.create({
              data: {
                userId,
                billId,
                amount: 0,
                originalAmount: baseAmount,
                discount: baseAmount,
                discountType: freeReason,
                status: 'paid',
                isFree: true,
                paymentMethod: 'free_trial',
                paidAt: new Date(),
              },
            });
          });
        } catch {
          claimed = false; // TRIAL_EXHAUSTED or agreement already claimed (P2002)
        }

        if (!claimed || !transaction) {
          return {
            success: false,
            message: 'This free trial is no longer available — it has already been used, or this agreement number already claimed a trial. Please add credits to continue.',
          };
        }

        const after = await prisma.user.findUnique({ where: { id: userId }, select: { freeTrialUsed: true } });
        const remaining = Math.max(0, freeTrialLimit - (after?.freeTrialUsed ?? freeTrialLimit));
        return {
          success: true,
          message: `Free trial bill processed (${remaining} remaining)`,
          transaction,
        };
      }

      // ----- Non-trial free bills (admin / superadmin / railway official / free account / ₹0 fee) -----
      const transaction = await prisma.billTransaction.create({
        data: {
          userId,
          billId,
          amount: 0,
          originalAmount: baseAmount,
          discount: baseAmount,
          discountType: freeReason,
          status: 'paid',
          isFree: true,
          paymentMethod: 'free_account',
          paidAt: new Date(),
        },
      });

      await prisma.user.update({
        where: { id: userId },
        data: { totalBillsProcessed: { increment: 1 } },
      });

      let freeMessage = 'Free account - no processing fee charged';
      if (freeReason === 'superadmin') {
        freeMessage = 'Superadmin - no processing fee charged';
      } else if (freeReason === 'admin') {
        freeMessage = 'Admin - no processing fee charged';
      } else if (freeReason === 'railway_official') {
        freeMessage = 'Railway Official - no processing fee charged';
      } else if (freeReason === 'accounts_official') {
        freeMessage = 'Accounts / Audit - no processing fee charged';
      } else if (freeReason === 'custom_zero_fee') {
        freeMessage = 'Custom zero fee - no processing fee charged';
      }

      return {
        success: true,
        message: freeMessage,
        transaction,
      };
    }

    // Verify Razorpay payment if provided
    if (razorpayData?.razorpayPaymentId && razorpayData?.razorpayOrderId && razorpayData?.razorpaySignature) {
      
      // verifyRazorpaySignature and fetchPaymentDetails imported at top of file

      // Verify signature
      const isSignatureValid = verifyRazorpaySignature({
        razorpayOrderId: razorpayData.razorpayOrderId,
        razorpayPaymentId: razorpayData.razorpayPaymentId,
        razorpaySignature: razorpayData.razorpaySignature,
      });

      if (!isSignatureValid) {
        console.error('❌ Invalid Razorpay signature');
        return { success: false, message: 'Invalid payment signature' };
      }

      // Fetch payment details
      try {
        const paymentDetails = await fetchPaymentDetails(razorpayData.razorpayPaymentId);
        if (paymentDetails.status !== 'captured') {
          console.error('❌ Payment not captured:', paymentDetails.status);
          return { success: false, message: 'Payment not successful' };
        }
      } catch (error) {
        console.error('❌ Error fetching payment details:', error);
        return { success: false, message: 'Payment verification failed' };
      }
    }

    // One transaction: check the balance, take the money, and only then write the
    // "paid" record. The record used to be created FIRST, so a failed deduction left a
    // bill whose transaction read fully paid with no money taken — recovered only by a
    // best-effort delete in the caller, which itself can fail.
    const chargedAmount = paidAmount ?? finalAmount;
    const transaction = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { totalBillsProcessed: { increment: 1 } }
      });
      if (user.customerAccount) {
        // Read the balance inside the transaction so the recorded balanceAfter
        // matches the actual post-deduction value even under concurrent charges.
        const account = await tx.customerAccount.findUnique({
          where: { userId },
          select: { creditBalance: true }
        });
        const balanceBefore = account?.creditBalance ?? 0;
        // The only balance check used to be the non-transactional read in
        // validateBillProcessing, so N concurrent creations against a one-bill balance
        // produced N bills and a negative wallet. Re-checked here, inside the
        // transaction, where it actually holds. (try-bill/claim already did this.)
        if (chargedAmount > 0 && balanceBefore < chargedAmount) {
          throw new Error(`INSUFFICIENT_BALANCE: needs ${chargedAmount}, has ${balanceBefore}`);
        }
        const balanceAfter = balanceBefore - chargedAmount;
        await tx.customerAccount.update({
          where: { userId },
          data: {
            currentMonthBills: { increment: 1 },
            creditBalance: { decrement: chargedAmount }
          }
        });
        // Record the deduction so it appears in the user's Credit Transactions list.
        // Amount is stored negative so the list renders it as a "-" deduction,
        // matching the bulk-bill charge convention.
        if (chargedAmount > 0) {
          await tx.creditTransaction.create({
            data: {
              userId,
              amount: -chargedAmount,
              type: 'deduct',
              reason: isAiUploaded ? 'AI PDF bill processing fee' : 'Bill processing fee',
              balanceBefore,
              balanceAfter,
              billId,
            }
          });
        }
      }

      // The money is taken; now the record that says so.
      return tx.billTransaction.create({
        data: {
          userId,
          billId,
          amount: chargedAmount,
          originalAmount: baseAmount,
          discount,
          discountType,
          status: 'paid',
          isFree: false,
          paymentMethod,
          transactionRef: paymentReference,
          paidAt: new Date(),
          // Store Razorpay specific data in metadata
          ...(razorpayData ? {
            metadata: {
              razorpayOrderId: razorpayData.razorpayOrderId,
              razorpayPaymentId: razorpayData.razorpayPaymentId,
              razorpaySignature: razorpayData.razorpaySignature,
              paymentMethod: 'razorpay'
            }
          } : {})
        }
      });
    });

    // (kept for logging below)
    if (user.customerAccount) {
      // ₹${chargedAmount} from credit balance (base: ₹${baseAmount}, discount: ₹${discount}, type: ${discountType || 'none'})`);
    }

    return {
      success: true,
      message: `Payment processed successfully - ₹${transaction.amount}`,
      transaction
    };

  } catch (error) {
    console.error('❌ Payment processing error:', error);
    return { 
      success: false, 
      message: `Payment processing failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
}

/**
 * Validate and authorize API access
 */
export async function validateApiAccess(request: Request): Promise<{
  authorized: boolean;
  user?: any;
  message?: string;
}> {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return {
        authorized: false,
        message: 'Authentication required'
      };
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        customerAccount: true
      }
    });

    if (!user) {
      return {
        authorized: false,
        message: 'User not found'
      };
    }

    return {
      authorized: true,
      user
    };

  } catch (error) {
    console.error('API access validation error:', error);
    return {
      authorized: false,
      message: 'Authorization failed'
    };
  }
}

/**
 * Check if user has pending payments
 */
export async function checkPendingPayments(userId: string): Promise<{
  hasPending: boolean;
  pendingAmount: number;
  pendingTransactions: any[];
}> {
  try {
    const pendingTransactions = await prisma.billTransaction.findMany({
      where: {
        userId,
        status: 'pending'
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

    const pendingAmount = pendingTransactions.reduce((sum, t) => sum + t.amount, 0);

    return {
      hasPending: pendingTransactions.length > 0,
      pendingAmount,
      pendingTransactions
    };

  } catch (error) {
    console.error('Error checking pending payments:', error);
    return {
      hasPending: false,
      pendingAmount: 0,
      pendingTransactions: []
    };
  }
}
