
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { checkUserBillAccess } from '@/lib/permissions';
import { advancedCache } from '@/lib/advanced-cache';
import { getQuarterMonths, getQuarterFromDate, calculateDedicatedCementPvcWithSteps, calculateDedicatedSteelPvcWithSteps, calculateWeightedComponents, calculatePvcComponentWithSteps } from '@/lib/pvc-calculations';
import { format } from 'date-fns';
import { toISTDate } from '@/lib/ist-utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getQuarterlyAverages } from '@/lib/db-utils';
import { getFileUrl } from '@/lib/s3';
import { getBillIndicesStatus, relevantIndexNamesForBill } from '@/lib/index-status';
import { withTimeout, TIMEOUT_DEFAULTS } from '@/lib/api-timeout';
import { getSteelIndexNamesForZone, getFuelIndexNameForBill, getSteelCityForZone } from '@/lib/zone-steel-city-mapping';
import rateLimiter, { RATE_LIMITS, getIdentifier } from '@/lib/rate-limiter';
import { embedLabourIndex, embedComponentIndicesRange } from '@/lib/pdf/utils/labour-index-embedder';
import { PDFDocument } from 'pdf-lib';
import { ComponentType } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { getNextAuthSecret } from '@/lib/auth';
import { buildCumulativePvcSummaries } from '@/lib/pdf/cumulative-pvc';

const STEEL_COMPONENT_TYPES = [ComponentType.TMT_BARS, ComponentType.ANGLE_CHANNEL, ComponentType.PLATES, ComponentType.OTHER_SECTIONS];
const NON_STEEL_COMPONENT_TYPES = Object.values(ComponentType).filter(t => !STEEL_COMPONENT_TYPES.includes(t as any)) as ComponentType[];

function billHasSteel(bill: any): boolean {
  if (!bill) return false;
  const pvc = bill.pvcCalculation;
  if (pvc && (
    (pvc.steelPvc ?? 0) !== 0
    || (pvc.dedicatedSteelPvc ?? 0) !== 0
    || (pvc.dedicatedSteelTmtBarsPvc ?? 0) !== 0
    || (pvc.dedicatedSteelAngleChannelPvc ?? 0) !== 0
    || (pvc.dedicatedSteelPlatesPvc ?? 0) !== 0
    || (pvc.dedicatedSteelOtherSectionsPvc ?? 0) !== 0
  )) {
    return true;
  }

  const entries = bill.classificationEntries || [];
  return entries.some((entry: any) => {
    const steelTypes = entry.steelTypes || [];
    if (steelTypes.length > 0) return true;
    const code = String(entry.subClassification?.code || '').trim().toUpperCase();
    return code.endsWith('B') || code === 'STEEL';
  });
}

export const dynamic = "force-dynamic";

// Extend jsPDF type to include autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

// Helper function to convert number to words (Indian numbering system)
function numberToWordsIndian(num: number): string {
  if (num === 0) return 'Zero Only';
  
  // Handle negative numbers
  const isNegative = num < 0;
  const absNum = Math.abs(num);
  
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  
  function convertLessThanThousand(n: number): string {
    if (n === 0) return '';
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) {
      const ten = Math.floor(n / 10);
      const one = n % 10;
      return tens[ten] + (one > 0 ? ' ' + ones[one] : '');
    }
    const hundred = Math.floor(n / 100);
    const remainder = n % 100;
    return ones[hundred] + ' Hundred' + (remainder > 0 ? ' ' + convertLessThanThousand(remainder) : '');
  }
  
  // Split into main amount and decimal (using absolute value)
  const mainAmount = Math.floor(absNum);
  const decimal = Math.round((absNum - mainAmount) * 100);
  
  let result = '';
  
  if (mainAmount > 0) {
    // Indian numbering system: crore, lakh, thousand, hundred
    const crore = Math.floor(mainAmount / 10000000);
    const lakh = Math.floor((mainAmount % 10000000) / 100000);
    const thousand = Math.floor((mainAmount % 100000) / 1000);
    const remainder = mainAmount % 1000;
    
    if (crore > 0) {
      result += convertLessThanThousand(crore) + ' Crore ';
    }
    if (lakh > 0) {
      result += convertLessThanThousand(lakh) + ' Lakh ';
    }
    if (thousand > 0) {
      result += convertLessThanThousand(thousand) + ' Thousand ';
    }
    if (remainder > 0) {
      result += convertLessThanThousand(remainder);
    }
    
    result = result.trim();
  }
  
  if (decimal > 0) {
    result += ' and ' + convertLessThanThousand(decimal);
  }
  
  result = result.trim();
  
  // Prefix "Minus" for negative amounts
  if (isNegative) {
    result = 'Minus ' + result;
  }
  
  return result + ' Only';
}

// GET /api/bills/[id]/pdf-report - Generate comprehensive PVC report
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    // Rate limiting for expensive PDF generation.
    //
    // A share-token request is keyed by BILL, not by caller. These arrive from
    // /api/public/bill-pdf, which invokes this handler in-process for a WhatsApp
    // attachment — so every one of them looks like the same anonymous caller, and a
    // batch of ten bills would have had the last five refused at five a minute. One
    // bill fetched five times a minute is still abuse; ten different bills is a
    // Tuesday. The token itself is checked further down; this only picks the bucket.
    const isShareTokenRequest = request.nextUrl.searchParams.get('public_access') === 'true';
    const identifier = isShareTokenRequest
      ? getIdentifier(request, `share-bill:${id}`)
      : getIdentifier(request);
    const rateLimit = rateLimiter.check(identifier, RATE_LIMITS.EXPENSIVE.limit, RATE_LIMITS.EXPENSIVE.windowMs);
    
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded',
          message: `Too many PDF generation requests. Please try again in ${Math.ceil(rateLimit.resetIn / 1000)} seconds.`
        },
        { 
          status: 429,
          headers: {
            'Retry-After': Math.ceil(rateLimit.resetIn / 1000).toString(),
          }
        }
      );
    }

    // Execute with timeout protection (60 seconds for PDF generation)
    return await withTimeout(
      (async () => {
        if (!jsPDF) {
          throw new Error('jsPDF is not available');
        }
        
        const billId = id;
        const { searchParams } = new URL(request.url);
        const templateId = searchParams.get('templateId');
        const pdfFormat = searchParams.get('format') || 'detailed';
        // The abstract goes in unless the caller explicitly says no (?abstract=0). One
        // bill's statement shows that bill; the accounts office also wants the contract's
        // running position, and sending the two as one file saves them being paired up
        // by hand. Reported back in a header so one that could not be built says why,
        // instead of arriving as a file quietly missing it.
        const includeAbstract = searchParams.get('abstract') !== '0';
        let abstractStatus = includeAbstract ? 'pending' : 'not-requested';
        // includeDocs=0 skips appending the supporting index documents to the IR PDF.
        const includeIndexDocs = searchParams.get('includeDocs') !== '0';
        const session = await getServerSession(authOptions);
        const requesterRole = String((session?.user as any)?.role || '').toLowerCase();
        const isAdminRequester = requesterRole === 'admin' || requesterRole === 'superadmin';

        /**
         * The person asking for this report, read at most once.
         *
         * Three places wanted them — the access check, the JPC charging gate, and the
         * report branding — and each ran its own findUnique on the same email, so one
         * download read the same User row three times. The fields are the union of what
         * those three asked for, which is six columns of one row.
         *
         * A function rather than a value because the request may be an unauthenticated
         * public-link download, where the row must never be fetched at all.
         */
        let requesterPromise: Promise<{
          id: string;
          logoPath: string | null;
          reportHeaderText: string | null;
          reportHeaderColor: string | null;
          reportFooterText: string | null;
          showLogoInReports: boolean;
        } | null> | null = null;
        const getRequester = () => {
          const email = session?.user?.email;
          if (!email) return Promise.resolve(null);
          if (!requesterPromise) {
            requesterPromise = prisma.user.findUnique({
              where: { email },
              select: {
                id: true,
                logoPath: true,
                reportHeaderText: true,
                reportHeaderColor: true,
                reportFooterText: true,
                showLogoInReports: true,
              },
            });
          }
          return requesterPromise;
        };

        // A trial bill is watermarked "NOT FOR OFFICIAL USE" until the bill owner
        // tops up their account. Once they have made at least one credit top-up
        // (a CreditTransaction of type 'add'), the watermark is waived on all of
        // their trial bills so they can download clean, official copies.
        let trialWatermarkWaived = false;
        if (!isAdminRequester) {
          const trialTopupCount = await prisma.creditTransaction.count({
            where: {
              type: 'add',
              user: { contracts: { some: { bills: { some: { id: billId } } } } },
            },
          });
          trialWatermarkWaived = trialTopupCount > 0;
        }

        // ===== ACCESS CONTROL (must run BEFORE the cache return) =====
        // The bill PDF contains private contract/contractor data, so a caller must
        // either present a valid public share token for THIS bill, or be a logged-in
        // user who owns / may access it. Without this gate any id could be enumerated.
        const publicAccess = searchParams.get('public_access');
        const publicToken = searchParams.get('token');
        let isPublicAccessValid = false;
        if (publicAccess === 'true' && publicToken) {
          try {
            const decoded = jwt.verify(publicToken, getNextAuthSecret()) as { billId: string };
            if (decoded.billId === billId) isPublicAccessValid = true;
          } catch (error) {
            console.warn('Invalid public access token:', error);
          }
        }
        if (!isPublicAccessValid) {
          if (!session?.user?.email) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
          }
          const requester = await getRequester();
          const access = requester ? await checkUserBillAccess(requester.id, billId) : null;
          if (!access?.canDownloadPdf) {
            return NextResponse.json({ error: 'You do not have access to this bill.' }, { status: 403 });
          }
        }

        // Everything the checks below need, read once.
        //
        // The same bill row used to be fetched three times before the report itself was
        // even loaded: once to decide which clause governs, once for the trial
        // watermark, and once to decide whether JPC documents are chargeable. Three
        // round-trips for one row, in sequence, on the single connection a serverless
        // instance holds. The selects are unioned here; each check below reads the part
        // it always read.
        const preflightBill = await prisma.bill.findUnique({
          where: { id: billId },
          select: {
            billNo: true,
            dateOfMeasurement: true,
            pvcCalculation: true,
            billTransaction: { select: { discountType: true } },
            classificationEntries: {
              select: { steelTypes: true, subClassification: { select: { code: true } } },
            },
            contract: {
              select: {
                agreementNo: true, contractorName: true, workDescription: true,
                dateOfOpening: true, userId: true,
                pvcClauseVersion: true, pre2022WorkType: true,
                user: { select: { role: true, isFreeAccount: true, customProcessingFee: true } },
              },
            },
          },
        });

        // ===== WHICH CLAUSE GOVERNS =====
        // A pre-2022 contract is priced by a different clause, and this route used to
        // serve its GCC-2022 report anyway — right layout, wrong money, with only a red
        // note to say so. The download button now hands over the statement for the
        // clause that actually governs, so the wrong-rules figure can no longer leave
        // the app through the main door.
        {
          const clauseCheck = preflightBill;
          if (clauseCheck?.contract) {
            const { resolvePre2022Setup } = await import('@/lib/pre2022-contract');
            const setup = resolvePre2022Setup(clauseCheck.contract as any);
            if (setup.isPre2022) {
              const { pricePre2022BillById } = await import('@/lib/pre2022-bill-pvc');
              const { generatePre2022Report } = await import('@/lib/pdf/generators/pre2022-report');
              const pricing = await pricePre2022BillById(billId);
              let pre2022Bytes: Uint8Array = new Uint8Array(generatePre2022Report({
                pricing,
                billNo: clauseCheck.billNo,
                agreementNo: clauseCheck.contract.agreementNo,
                contractorName: clauseCheck.contract.contractorName,
                workDescription: clauseCheck.contract.workDescription,
                dateOfOpening: clauseCheck.contract.dateOfOpening,
                dateOfMeasurement: clauseCheck.dateOfMeasurement,
              }));
              // Same trial watermark rule as every other report.
              if (!isAdminRequester && !trialWatermarkWaived) {
                if (preflightBill?.billTransaction?.discountType === 'trial') {
                  const { applyTrialWatermark } = await import('@/lib/pdf/utils/watermark');
                  pre2022Bytes = await applyTrialWatermark(pre2022Bytes);
                }
              }
              const safeBillNo = clauseCheck.billNo.replace(/[^A-Za-z0-9-]+/g, '_');
              return new NextResponse(new Uint8Array(pre2022Bytes), {
                headers: {
                  'Content-Type': 'application/pdf',
                  'Content-Disposition': `attachment; filename="PVC_pre2022_${safeBillNo}.pdf"`,
                },
              });
            }
          }
        }

        // ===== JPC SHEETS: paid annex =====
        // The JPC steel sheets attached to a steel bill's report come from a paid
        // subscription, so attaching them costs Rs 500 from credits — ONCE per bill,
        // recorded on the bill; every later download is free. The report itself is
        // never blocked: when the charge cannot be made (not the owner, or balance too
        // low), the report goes out with every annex EXCEPT the JPC pages.
        let jpcDocsAllowed = true;
        // Set when THIS request actually spent the Rs 500, so that a failure to attach
        // the sheets afterwards can hand the money back rather than leave a paid report
        // without the pages it was paid for.
        let jpcChargedNow: { userId: string; cost: number } | null = null;
        // Set when a report goes out WITHOUT pages it was supposed to carry. Such a
        // PDF must never be cached: the charge for it was refunded and the stamp
        // cleared, so the next download charges again — and would be handed this same
        // incomplete file from the cache.
        let deliveryIncomplete = false;
        {
          // The same row read above — its select already carries these fields.
          const jpcBill = preflightBill;
          // Exactly the test the embedding below uses. The old gate read the legacy
          // steelAmount column — which no current create path writes — and the
          // bill-level steelTypes, so a bill carrying dedicated steel amounts with no
          // steelTypes was charged nothing and still received the whole JPC annex.
          const hasSteel = billHasSteel(jpcBill);

          // Only the owner's own download may spend the owner's credits; needed here
          // (before charging) to read that owner's report template.
          const requesterEmail = session?.user?.email || null;
          const requesterUser = requesterEmail
            ? await getRequester()
            : null;

          // The template decides whether the report carries index documents at all, and
          // it is only loaded further down this route — so it is asked here, before any
          // money moves. Charging Rs 500 for an annex the template then hides is
          // charging for nothing, and the once-per-bill stamp made it permanent.
          let templateShowsDocs = true;
          if (requesterUser) {
            // A chosen template may be the person's own OR a global one — the list
            // offers both, and this lookup used to accept only their own, so picking a
            // global template silently fell through to the default.
            const tpl = templateId
              ? await prisma.reportTemplate.findFirst({
                  where: { id: templateId, OR: [{ userId: requesterUser.id }, { isGlobal: true }] }, select: { sections: true },
                })
              : await prisma.reportTemplate.findFirst({
                  where: { userId: requesterUser.id, isDefault: true }, select: { sections: true },
                });
            if (tpl && (tpl.sections as any)?.componentIndexDocuments === false) templateShowsDocs = false;
          }

          if (jpcBill && hasSteel && includeIndexDocs && templateShowsDocs && !isAdminRequester) {
            const { getBillingSettings } = await import('@/lib/admin-settings');
            const billing = await getBillingSettings();
            const owner = jpcBill.contract?.user;
            const ownerIsFree = !billing.paymentEnabled || !owner
              || owner.isFreeAccount || owner.customProcessingFee === 0
              || ['admin', 'superadmin', 'railway_official', 'accounts_official'].includes(owner.role || '');
            // Raw, tolerant read: the column ships through Pending DB Changes, and a
            // schema field for an unapplied column takes every bill read down with it.
            let jpcPaidAt: Date | null = null;
            let jpcColumnReady = true;
            try {
              const billsTable = await (await import('@/lib/db-schema')).schemaQualified('bills');
              const rows = await prisma.$queryRawUnsafe<Array<{ jpcDocsPurchasedAt: Date | null }>>(
                `SELECT "jpcDocsPurchasedAt" FROM ${billsTable} WHERE id = $1`, billId,
              );
              jpcPaidAt = rows[0]?.jpcDocsPurchasedAt ?? null;
            } catch { jpcColumnReady = false; }
            if (!jpcColumnReady) {
              // Cannot record a purchase yet, so nothing is charged and the sheets ride
              // free until the admin applies the column — free beats charging blind.
            } else if (!ownerIsFree && !jpcPaidAt && billing.jpcDocumentCost > 0) {
              const isOwnerDownloading = !!requesterUser && requesterUser.id === jpcBill.contract?.userId;
              if (!isOwnerDownloading) {
                jpcDocsAllowed = false;
              } else {
                const cost = billing.jpcDocumentCost;
                try {
                  await prisma.$transaction(async (tx) => {
                    const account = await tx.customerAccount.findUnique({
                      where: { userId: requesterUser.id },
                      select: { creditBalance: true },
                    });
                    const balanceBefore = account?.creditBalance ?? 0;
                    if (balanceBefore < cost) throw new Error('INSUFFICIENT_BALANCE');
                    await tx.customerAccount.update({
                      where: { userId: requesterUser.id },
                      data: { creditBalance: { decrement: cost } },
                    });
                    await tx.creditTransaction.create({
                      data: {
                        userId: requesterUser.id,
                        amount: -cost,
                        type: 'bill_usage',
                        reason: `JPC index documents: ${jpcBill.billNo}`,
                        balanceBefore,
                        balanceAfter: balanceBefore - cost,
                      },
                    });
                    // The claim doubles as the race guard: a second concurrent download
                    // finds the stamp set and does not charge again.
                    const billsTableTx = await (await import('@/lib/db-schema')).schemaQualified('bills');
                    const stamped = await tx.$executeRawUnsafe(
                      `UPDATE ${billsTableTx} SET "jpcDocsPurchasedAt" = $1 WHERE id = $2 AND "jpcDocsPurchasedAt" IS NULL`, new Date(), billId,
                    );
                    if (Number(stamped) === 0) throw new Error('ALREADY_PURCHASED');
                  });
                  jpcChargedNow = { userId: requesterUser!.id, cost };
                } catch (err: any) {
                  if (String(err?.message).includes('ALREADY_PURCHASED')) {
                    // The other download paid; this one rides along.
                  } else {
                    jpcDocsAllowed = false;
                  }
                }
              }
            }
          }
        }

        // Hands back a charge made by THIS request when the sheets could not be
        // attached after all, and clears the stamp so a later download tries again.
        // Without it, an embedding failure left the user Rs 500 poorer with a report
        // missing the very pages that money bought — permanently, since the stamp
        // reads as "already purchased".
        const refundJpcChargeIfMade = async (why: string) => {
          deliveryIncomplete = true;
          if (!jpcChargedNow) return;
          const { userId, cost } = jpcChargedNow;
          jpcChargedNow = null;
          try {
            await prisma.$transaction(async (tx) => {
              const account = await tx.customerAccount.findUnique({
                where: { userId }, select: { creditBalance: true },
              });
              const balanceBefore = account?.creditBalance ?? 0;
              await tx.customerAccount.update({
                where: { userId }, data: { creditBalance: { increment: cost } },
              });
              await tx.creditTransaction.create({
                data: {
                  userId,
                  amount: cost,
                  type: 'refund',
                  reason: `JPC index documents refunded — ${why}`,
                  balanceBefore,
                  balanceAfter: balanceBefore + cost,
                  billId,
                },
              });
              const billsTableTx = await (await import('@/lib/db-schema')).schemaQualified('bills');
              await tx.$executeRawUnsafe(
                `UPDATE ${billsTableTx} SET "jpcDocsPurchasedAt" = NULL WHERE id = $1`, billId,
              );
            });
            console.warn(`[jpc] refunded Rs ${cost} for bill ${billId}: ${why}`);
          } catch (e) {
            console.error('Could not refund JPC charge:', e);
          }
        };

        // Check cache before running heavy PDF compiling.
        // The watermark-waiver state is part of the key so a post-top-up download
        // regenerates a clean PDF instead of serving a stale watermarked one.
        // The build is part of the key so a change to how the report is drawn can never
        // be masked by a PDF cached from the previous build. There is no "regenerate"
        // button — downloading again is the regenerate — so a stale hit reads as the
        // fix not having worked.
        const build = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || 'dev';
        const cacheKey = `pdf-report:${build}:${billId}:${templateId || 'default'}:${pdfFormat}:${includeIndexDocs ? 'docs' : 'nodocs'}:${isAdminRequester ? 'admin' : 'standard'}:${trialWatermarkWaived ? 'wmoff' : 'wmon'}:${searchParams.get('abstract') === '1' ? 'abs' : 'noabs'}:${jpcDocsAllowed ? 'jpc' : 'nojpc'}`;
        const cachedPdf = advancedCache.get<any>(cacheKey);
        if (cachedPdf) {
          console.log(`[PDF Cache] Hit for: ${cacheKey}`);
          // Entries keep the finished bytes together with the filename the fresh
          // response would have used. A hit used to rename the download to
          // PVC_Report_<internal id>.pdf — not the name the user asked for, and with
          // IR statements now cached too, not even the right report's name. (A plain
          // Buffer is a pre-envelope entry; the build id is in the key, so this only
          // ever matters within one deployment.)
          const envelope = !Buffer.isBuffer(cachedPdf) && cachedPdf?.body ? cachedPdf : null;
          const body = envelope ? envelope.body : cachedPdf;
          const headers: Record<string, string> = {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${envelope?.filename || `PVC_Report_${billId}.pdf`}"`,
            'X-RateLimit-Remaining': rateLimit.remaining.toString(),
          };
          if (envelope?.abstractStatus) headers['X-Abstract-Status'] = envelope.abstractStatus;
          return new Response(Buffer.from(body), { headers });
        }
        
    // Get session to fetch user branding settings and template (optional for public access)
    let brandingSettings = {
      logoPath: null as string | null,
      logoUrl: null as string | null,
      reportHeaderText: 'INDIAN RAILWAY',
      reportHeaderColor: '#000000',
      reportFooterText: '',
      showLogoInReports: true,
    };
    
    // Default template settings (show everything)
    let templateSettings = {
      sections: {
        contractDetails: true,
        workClassification: true,
        allBillsTable: true,
        monthlyIndices: true,
        pvcCalculation: true,
        mpngFuelAverage: true,
        componentIndexDocuments: true
      },
      fields: {
        contractDetails: {
          agreementNo: true,
          loaNo: true,
          contractorName: true,
          workDescription: true,
          dateOfOpening: true,
          baseMonth: true,
          pvcNumber: true,
          isFinalPvc: true,
          zone: true
        },
        workClassification: {
          code: true,
          name: true,
          description: true,
          componentBreakdown: true,
          subClassifications: true,
          nonScheduleItems: true
        },
        pvcCalculation: {
          componentWise: true,
          dedicatedAmounts: true,
          summary: true,
          quarterlyData: true,
          showCalculationSteps: true
        }
      }
    };

    if (session?.user?.email) {
      const user = await getRequester();

      if (user) {
        brandingSettings = {
          logoPath: user.logoPath,
          logoUrl: null,
          reportHeaderText: user.reportHeaderText || 'INDIAN RAILWAY',
          reportHeaderColor: user.reportHeaderColor || '#000000',
          reportFooterText: user.reportFooterText || '',
          showLogoInReports: user.showLogoInReports,
        };

        // Generate signed URL for logo if it exists
        if (user.logoPath && user.showLogoInReports) {
          try {
            brandingSettings.logoUrl = await getFileUrl(user.logoPath, 3600);
          } catch (error) {
            console.error('Error generating logo URL:', error);
          }
        }
        
        // Fetch template settings
        let template = null;
        if (templateId) {
          // The specified template: the person's own, or a global one. The list offers
          // both; accepting only their own here meant a global template was shown,
          // pickable, and then quietly ignored at the moment of generating the PDF.
          template = await prisma.reportTemplate.findFirst({
            where: {
              id: templateId,
              OR: [{ userId: user.id }, { isGlobal: true }],
            }
          });
        } else {
          // Use default template if exists
          template = await prisma.reportTemplate.findFirst({
            where: {
              userId: user.id,
              isDefault: true
            }
          });
        }
        
        if (template) {
          templateSettings = {
            sections: template.sections as any,
            fields: template.fields as any
          };
        }
      }
    }
    
    // Get the main bill with contract, classification, and PVC calculation
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      include: {
        contract: {
          include: {
            user: {
              select: {
                logoPath: true,
                reportHeaderText: true,
                reportHeaderColor: true,
                reportFooterText: true,
                showLogoInReports: true,
              }
            },
            extensions: {
              orderBy: { approvalDate: 'asc' }
            }
          }
        },
        workClassification: true, // Include the detailed classification (legacy)
        pvcCalculation: true,
        billTransaction: { select: { discountType: true } },
        classificationEntries: {
          include: {
            subClassification: true,
            classification: true
          }
        }
      }
    });

    if (!bill) {
      return NextResponse.json(
        { error: 'Bill not found' },
        { status: 404 }
      );
    }

    // Override with contract owner's branding if different from session user
    if (bill.contract.user) {
      brandingSettings = {
        logoPath: bill.contract.user.logoPath,
        logoUrl: null,
        reportHeaderText: bill.contract.user.reportHeaderText || 'INDIAN RAILWAY',
        reportHeaderColor: bill.contract.user.reportHeaderColor || '#000000',
        reportFooterText: bill.contract.user.reportFooterText || '',
        showLogoInReports: bill.contract.user.showLogoInReports,
      };

      // Generate signed URL for logo if it exists
      if (bill.contract.user.logoPath && bill.contract.user.showLogoInReports) {
        try {
          brandingSettings.logoUrl = await getFileUrl(bill.contract.user.logoPath, 3600);
        } catch (error) {
          console.error('Error generating logo URL:', error);
        }
      }
    }

    // Get the provisional/final indices status for this bill
    const indicesStatus = await getBillIndicesStatus(
      bill.quarter,
      new Date(bill.contract.baseMonth)
    );

    // Get ALL bills for this contract (not just those with PVC calculations)
    const allContractBills = await prisma.bill.findMany({
      where: { 
        contractId: bill.contractId
      },
      include: {
        pvcCalculation: true
      },
      orderBy: { createdAt: 'asc' }
    });

    // Get all price indices
    const allIndices = await prisma.priceIndex.findMany({
      orderBy: { name: 'asc' }
    });

    // Calculate all monthly index values for the contract period
    const baseMonth = new Date(bill.contract.baseMonth);
    const startMonth = new Date(baseMonth);
    startMonth.setMonth(startMonth.getMonth() + 1);
    const measurementDate = new Date(bill.dateOfMeasurement);

    // Get all monthly values from base month to measurement date (inclusive)
    const allMonthlyValues: { [key: string]: { [monthKey: string]: number } } = {};
    
    // Calculate the end date properly - measurement date's month should be the final month included
    // Set to the LAST day of the measurement month to ensure it's included in the <= comparison
    const measurementEndDate = new Date(measurementDate.getFullYear(), measurementDate.getMonth() + 1, 0);
    
    // Performance Optimization: Fetch all monthly index values in bulk to prevent N+1 query loops (360+ queries)
    const bulkQueryStartMonth = new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1);
    const maxFutureDate = new Date(measurementEndDate);
    maxFutureDate.setMonth(maxFutureDate.getMonth() + 6); // Add 6 months padding to cover future quarter fallback months
    
    const dbMonthlyValues = await prisma.monthlyIndexValue.findMany({
      where: {
        priceIndexId: { in: allIndices.map(index => index.id) },
        month: {
          gte: bulkQueryStartMonth,
          lte: maxFutureDate
        }
      },
      orderBy: {
        month: 'desc'
      }
    });

    // Create a fast O(1) in-memory lookup map keyed by `${priceIndexId}_${yyyy-MM}`.
    // Values are WPI-BRIDGED as they enter the map: every table and average this
    // section builds reads from here, so bridging once at the choke point puts the
    // whole display on the same series the stored engine prices on. Without it, an
    // old-base contract's steps showed raw new-series numbers from June 2026 on — a
    // phantom ~30% crash the stored figure does not contain.
    const { bridgeWpiValue: bridgePdfValue, getWpiLinkingFactors: getPdfWpiFactors } = await import('@/lib/wpi-series');
    const pdfWpiFactors = await getPdfWpiFactors();
    const indexNameById = new Map(allIndices.map(index => [index.id, index.name]));
    const dbValuesMap = new Map<string, number>();
    for (const mv of dbMonthlyValues) {
      const yyyyMM = format(mv.month, 'yyyy-MM');
      const mapKey = `${mv.priceIndexId}_${yyyyMM}`;
      if (!dbValuesMap.has(mapKey)) {
        const idxName = indexNameById.get(mv.priceIndexId) || '';
        dbValuesMap.set(mapKey, bridgePdfValue(idxName, baseMonth, new Date(mv.month), mv.value, pdfWpiFactors));
      }
    }

    for (const index of allIndices) {
      allMonthlyValues[index.name] = {};

      const currentMonth = new Date(baseMonth);
      // A missing month borrows the latest earlier value — the same rule the stored
      // engine uses. Falling back to the static SEED dragged the printed average
      // toward a number from 2011-12, which the stored figure never saw.
      let lastKnownValue: number | undefined;
      // Only include months up to and including the measurement month
      while (currentMonth <= measurementEndDate) {
        const monthKey = format(currentMonth, 'yyyy-MM');
        const mapKey = `${index.id}_${monthKey}`;
        const dbValue = dbValuesMap.get(mapKey);
        const indexValue = dbValue !== undefined
          ? dbValue
          : (lastKnownValue !== undefined ? lastKnownValue : index.baseValue);
        lastKnownValue = indexValue;
        allMonthlyValues[index.name][monthKey] = indexValue;
        currentMonth.setMonth(currentMonth.getMonth() + 1);
      }
    }

    // Get quarterly data
    const quarterlyData: any[] = [];
    const currentMonth = new Date(startMonth);
    const quarterCache = new Map();
    
    // Only process quarters up to and including the measurement month
    while (currentMonth <= measurementEndDate) {
      const quarter = getQuarterFromDate(new Date(currentMonth), baseMonth);
      if (!quarterCache.has(quarter)) {
        const allQuarterMonths = getQuarterMonths(quarter, baseMonth);
        // Filter months to only include those up to and including the measurement month
        // Use a more lenient comparison to ensure the measurement month is included
        const measurementMonthEnd = new Date(measurementDate.getFullYear(), measurementDate.getMonth() + 1, 0);
        let quarterMonths = allQuarterMonths.filter(qMonth => qMonth <= measurementMonthEnd);
        
        // IMPORTANT: For quarterly calculations, we ALWAYS need exactly 3 months for a proper average
        // If we have fewer than 3 months, we need to include additional future months to complete the 3-month period
        if (quarterMonths.length > 0 && quarterMonths.length < 3) {
          
          // Get the last available month in the quarter
          const lastAvailableMonth = quarterMonths[quarterMonths.length - 1];
          
          // Calculate how many additional months we need
          const monthsNeeded = 3 - quarterMonths.length;
          
          // Add future months to complete the 3-month period
          for (let i = 1; i <= monthsNeeded; i++) {
            const futureMonth = new Date(lastAvailableMonth);
            futureMonth.setMonth(futureMonth.getMonth() + i);
            const normalizedFutureMonth = new Date(futureMonth.getFullYear(), futureMonth.getMonth(), 1);
            quarterMonths.push(normalizedFutureMonth);
          }
          
        }
        
        const quarterData = {
          quarter,
          quarterMonths,
          averages: {} as { [key: string]: number },
          monthlyData: {} as { [key: string]: { [monthKey: string]: number } },
          includesFutureMonths: quarterMonths.length === 3 && quarterMonths.some(qMonth => qMonth > measurementMonthEnd)
        };
        
        // Calculate averages and collect monthly data for each index
        for (const index of allIndices) {
          quarterData.monthlyData[index.name] = {};
          const monthlyValues = [];
          
          for (const qMonth of quarterMonths) {
            const monthKey = format(qMonth, 'yyyy-MM');
            // For future months beyond measurement date, fetch from database if available
            let value = allMonthlyValues[index.name][monthKey];
            
            if (!value) {
              const mapKey = `${index.id}_${monthKey}`;
              const dbValue = dbValuesMap.get(mapKey);
              if (dbValue !== undefined) {
                value = dbValue;
              } else {
                // Borrow the latest earlier month, exactly as the stored engine does
                // for an unpublished month — never the 2011-12 seed value.
                let borrowed: number | undefined;
                const probe = new Date(qMonth);
                for (let back = 0; back < 24 && borrowed === undefined; back++) {
                  probe.setMonth(probe.getMonth() - 1);
                  borrowed = allMonthlyValues[index.name][format(probe, 'yyyy-MM')]
                    ?? dbValuesMap.get(`${index.id}_${format(probe, 'yyyy-MM')}`);
                }
                value = borrowed !== undefined ? borrowed : index.baseValue;
              }
              allMonthlyValues[index.name][monthKey] = value; // Cache it
            }
            
            quarterData.monthlyData[index.name][monthKey] = value;
            monthlyValues.push(value);
          }
          
          quarterData.averages[index.name] = monthlyValues.length > 0 
            ? monthlyValues.reduce((sum, val) => sum + val, 0) / monthlyValues.length
            : index.baseValue;
        }
        
        quarterlyData.push(quarterData);
        quarterCache.set(quarter, quarterData);
      }
      currentMonth.setMonth(currentMonth.getMonth() + 3);
    }

    // Alias city-specific fuel in monthly values and quarterly data (for zone_city pricing)
    const earlyBillFuelName = getFuelIndexNameForBill(bill.zone, bill.fuelPriceType);
    if (earlyBillFuelName !== 'MPNG Fuel') {
      if (allMonthlyValues[earlyBillFuelName]) {
        allMonthlyValues['MPNG Fuel'] = allMonthlyValues[earlyBillFuelName];
      }
      for (const qData of quarterlyData) {
        if (qData.averages[earlyBillFuelName] !== undefined) {
          qData.averages['MPNG Fuel'] = qData.averages[earlyBillFuelName];
        }
        if (qData.monthlyData[earlyBillFuelName]) {
          qData.monthlyData['MPNG Fuel'] = qData.monthlyData[earlyBillFuelName];
        }
      }
    }

    // Alias city-specific steel monthly values and quarterly averages under base names
    // This ensures the monthly index table and PVC formulas show the correct zone-specific steel values
    const billSteelCityForQuarterly = getSteelCityForZone(bill.zone);
    if (billSteelCityForQuarterly && billSteelCityForQuarterly !== 'Chennai') {
      const steelBaseNames = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
      for (const baseName of steelBaseNames) {
        const citySpecificName = `${baseName} - ${billSteelCityForQuarterly}`;
        // Alias allMonthlyValues
        if (allMonthlyValues[citySpecificName]) {
          allMonthlyValues[baseName] = allMonthlyValues[citySpecificName];
        }
        // Alias quarterlyData averages and monthlyData
        for (const qData of quarterlyData) {
          if (qData.averages[citySpecificName] !== undefined) {
            qData.averages[baseName] = qData.averages[citySpecificName];
          }
          if (qData.monthlyData[citySpecificName]) {
            qData.monthlyData[baseName] = qData.monthlyData[citySpecificName];
          }
        }
      }
    }

    // Create PDF in A3 Landscape format with narrow margins (12mm)
    const pdf = new jsPDF('l', 'mm', 'a3'); // 'l' for landscape, 'a3' for A3 size
    
    // Apply autoTable to the PDF instance
    pdf.autoTable = (options: any) => {
      autoTable(pdf, options);
      pdf.lastAutoTable = { finalY: (pdf as any).lastAutoTable?.finalY || 0 };
      return pdf;
    };

    const pageWidth = pdf.internal.pageSize.getWidth(); // 420mm for A3 landscape
    const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm for A3 landscape
    const marginTop = 20; // Increased top margin for better spacing
    const marginBottom = 18; // Space for page number
    const marginLeft = 12;
    const marginRight = 12;
    const contentWidth = pageWidth - marginLeft - marginRight; // 396mm content width
    let yPosition = marginTop;
    
    // Declare variables that may be used across multiple sections
    const workClassification = bill.workClassification;
    const baseIndexData: { [key: string]: number } = {};
    
    // Populate baseIndexData for use across sections (needed for PVC calculation)
    const baseMonthKey = format(baseMonth, 'yyyy-MM');
    for (const index of allIndices) {
      const mapKey = `${index.id}_${baseMonthKey}`;
      const dbValue = dbValuesMap.get(mapKey);
      // Use actual base month value if available, fallback to static base value
      baseIndexData[index.name] = dbValue !== undefined ? dbValue : index.baseValue;
    }

    // Alias city-specific fuel index under 'MPNG Fuel' only when bill uses zone_city pricing
    const billFuelName = getFuelIndexNameForBill(bill.zone, bill.fuelPriceType);
    if (billFuelName !== 'MPNG Fuel' && baseIndexData[billFuelName] !== undefined) {
      baseIndexData['MPNG Fuel'] = baseIndexData[billFuelName];
    }

    // Alias city-specific steel indices under base names for zone-aware bills
    // E.g., for zone WR (Mumbai): baseIndexData['Steel Angle/Channel'] = baseIndexData['Steel Angle/Channel - Mumbai']
    const billSteelCity = getSteelCityForZone(bill.zone);
    if (billSteelCity && billSteelCity !== 'Chennai') {
      const steelBaseNames = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
      for (const baseName of steelBaseNames) {
        const citySpecificName = `${baseName} - ${billSteelCity}`;
        if (baseIndexData[citySpecificName] !== undefined) {
          baseIndexData[baseName] = baseIndexData[citySpecificName];
        }
      }
    }

    // Helper function to check if we need a new page
    const checkNewPage = (requiredHeight: number) => {
      if (yPosition + requiredHeight > pageHeight - marginBottom) {
        pdf.addPage();
        yPosition = marginTop;
        return true;
      }
      return false;
    };

    // ── IR STANDARD FORMAT BRANCH ─────────────────────────────────────────────
    if (pdfFormat === 'ir_standard') {
      const { generateIRStandardReport } = await import('@/lib/pdf/generators/ir-standard-report');
      const indicesStatusForIR = await getBillIndicesStatus(
        bill.quarter, baseMonth, relevantIndexNamesForBill(bill.zone, bill.fuelPriceType));

      // Build quarterlyAverages in the format expected by ir-standard-report
      const fuelIdxName = getFuelIndexNameForBill(bill.zone, bill.fuelPriceType);
      const steelIdxNames = getSteelIndexNamesForZone(bill.zone);
      const allIdxNames = ['Labour', 'RBI Plant Machinery', fuelIdxName, 'RBI Other Materials', 'RBI Cement', 'RBI Explosives', ...steelIdxNames];
      const irQuarterlyAverages = await getQuarterlyAverages(bill.quarter, allIdxNames, baseMonth, 'auto');
      const cumulativeSummary = buildCumulativePvcSummaries(allContractBills).get(bill.id);

      // Fetch all monthly values from base month to end of current quarter for the monthly indices table
      const currentQtrMonths = getQuarterMonths(bill.quarter, baseMonth);
      const qtrEndMonth = currentQtrMonths[currentQtrMonths.length - 1];
      const qtrEndDate = new Date(qtrEndMonth.getFullYear(), qtrEndMonth.getMonth() + 1, 1);
      const irPriceIndexes = await prisma.priceIndex.findMany({ where: { name: { in: allIdxNames } } });
      const irHistoricalRaw = await prisma.monthlyIndexValue.findMany({
        where: {
          priceIndexId: { in: irPriceIndexes.map((p: any) => p.id) },
          month: { gte: new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1), lt: qtrEndDate }
        },
        include: { priceIndex: true }
      });
      const allHistoricalMonthlyData: { indexName: string; month: string; value: number; isProvisional?: boolean; isBorrowed?: boolean }[] =
        irHistoricalRaw.map((mv: any) => ({
          indexName: mv.priceIndex.name,
          month: new Date(mv.month).toISOString().slice(0, 7),
          value: mv.value,
          isProvisional: !!mv.isProvisional,
        }));

      // For months missing an index, the PVC calc borrows the last available value
      // (provisional-fallback) and averages it in. Surface those borrowed numbers so the
      // table shows the real figure behind the average instead of a blank, and so the
      // displayed quarter average matches the value actually used.
      const realKeys = new Set(allHistoricalMonthlyData.map(d => `${d.indexName}|${d.month}`));
      for (const qa of (irQuarterlyAverages as any[])) {
        for (const mv of (qa.monthlyValues || [])) {
          const key = `${qa.indexName}|${mv.month}`;
          if (!realKeys.has(key)) {
            allHistoricalMonthlyData.push({ indexName: qa.indexName, month: mv.month, value: mv.value, isProvisional: true, isBorrowed: true });
            realKeys.add(key);
          }
        }
      }

      // Per-item JPC steel readings (fortnightly F1/F2 per size) for the bill's
      // steel city, so the AVERAGE JPC STEEL INDICES page can show how each
      // section's monthly index is derived (e.g. TMT = (10mm F1 + 10mm F2 + 25mm
      // F1 + 25mm F2) / 4).
      let steelBreakdown: any[] | undefined;
      try {
        const { buildSteelBreakdown } = await import('@/lib/jpc-items');
        const jpcRows = await prisma.jpcSteelItem.findMany({
          where: {
            city: billSteelCity,
            month: { gte: new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1), lt: qtrEndDate },
          },
          select: { month: true, itemCode: true, f1: true, f2: true, average: true },
        });
        if (jpcRows.length > 0) {
          const itemsByMonth = new Map<string, Map<string, { f1: number | null; f2: number | null; average: number | null }>>();
          for (const r of jpcRows) {
            const mk = new Date(r.month).toISOString().slice(0, 7);
            if (!itemsByMonth.has(mk)) itemsByMonth.set(mk, new Map());
            itemsByMonth.get(mk)!.set(r.itemCode, { f1: r.f1, f2: r.f2, average: r.average });
          }
          steelBreakdown = buildSteelBreakdown(steelIdxNames, itemsByMonth);
        }
      } catch (err) {
        console.error('IR PDF: error building steel breakdown:', err);
      }

      // Lets the report reconstruct the cement working for bills saved before the
      // derivation was kept on the item row, instead of printing "-" for ever.
      const cementCoefficients = await prisma.dsrCementCoefficient.findMany({
        select: { dsrCode: true, workUnit: true, cementQuantityPerUnit: true },
      }).catch(() => []);

      let irPdfBytes = await generateIRStandardReport({
        steelBreakdown,
        cementCoefficients,
        bill: bill as any,
        quarterlyAverages: irQuarterlyAverages,
        baseMonth,
        organizationName: brandingSettings.reportHeaderText || 'INDIAN RAILWAYS',
        fuelIndexName: fuelIdxName,
        steelIndexNames: steelIdxNames,
        isProvisional: indicesStatusForIR.isProvisional,
        provisionalIndices: indicesStatusForIR.provisionalIndices,
        allHistoricalMonthlyData,
        previousCumulativePvc: cumulativeSummary?.previousPvcTotal ?? 0,
        // Let the chosen report template hide sections of the IR-standard report.
        sections: {
          contractDetails: templateSettings.sections?.contractDetails,
          workClassification: templateSettings.sections?.workClassification,
          monthlyIndices: templateSettings.sections?.monthlyIndices,
          showCalculationSteps: templateSettings.fields?.pvcCalculation?.showCalculationSteps,
        },
      });

      // Append index documents (same as detailed format) unless the caller opted out
      // or the chosen template hides the component index documents section.
      let irFinalBytes: Uint8Array = irPdfBytes;
      if (includeIndexDocs && templateSettings.sections?.componentIndexDocuments !== false) {
        try {
          const irComponentTypes = billHasSteel(bill) && jpcDocsAllowed ? undefined : NON_STEEL_COMPONENT_TYPES;
          irFinalBytes = await embedComponentIndicesRange(new Uint8Array(irPdfBytes), {
            startDate: new Date(bill.contract.baseMonth),
            endDate: new Date(bill.dateOfMeasurement),
            componentTypes: irComponentTypes,
            // Switches on marking for every attached sheet — steel rows and city on JPC
            // sheets, used months on the rest. Passed for every bill: one without steel
            // attaches no JPC sheet, so the city is unused there, but its labour,
            // cement and fuel sheets still get their months marked.
            jpcCity: getSteelCityForZone(bill.zone),
            jpcCaption: `${bill.contract.agreementNo} — ${bill.billNo}`,
          });
        } catch (err) {
          console.error('IR PDF: error embedding index documents:', err);
          await refundJpcChargeIfMade('the sheets could not be attached to the report');
        }
      }

      if (includeAbstract) {
        try {
          const { generateAbstractPdf } = await import('@/lib/pdf/generators/abstract-report');
          const { pdfBuffer: abstractBytes } = await generateAbstractPdf(bill.contractId);
          const merged = await PDFDocument.create();
          for (const source of [irFinalBytes, new Uint8Array(abstractBytes)]) {
            const doc = await PDFDocument.load(source);
            const pages = await merged.copyPages(doc, doc.getPageIndices());
            for (const page of pages) merged.addPage(page);
          }
          irFinalBytes = await merged.save();
          abstractStatus = 'attached';
        } catch (err: any) {
          // The statement is the deliverable; a missing abstract must not lose it.
          console.error('IR PDF: could not append the abstract:', err);
          abstractStatus = `unavailable: ${String(err?.message || 'error').slice(0, 120)}`;
        }
      }

      // Apply trial watermark for free-trial bills only (waived once the owner has topped up)
      if (!isAdminRequester && !trialWatermarkWaived && bill.billTransaction?.discountType === 'trial') {
        const { applyTrialWatermark } = await import('@/lib/pdf/utils/watermark');
        irFinalBytes = await applyTrialWatermark(irFinalBytes);
      }

      // Cache the finished statement, as the detailed format already did — this branch
      // never cached, so the IR report (the one the free and instant downloads use)
      // was rebuilt from scratch on every single download. Every input that changes
      // the bytes is already part of the key: format, template, docs, admin, watermark,
      // abstract and JPC state. Skipped when the report is knowingly incomplete, so a
      // missing annex can never be served to a later download that pays for it.
      const irFilename = `IR_PVC_Statement_${bill.billNo.replace(/[^a-zA-Z0-9]/g, '_')}_${format(toISTDate(new Date()), 'yyyy-MM-dd')}.pdf`;
      if (!deliveryIncomplete && !abstractStatus.startsWith('unavailable')) {
        advancedCache.set(
          cacheKey,
          { body: Buffer.from(irFinalBytes), filename: irFilename, abstractStatus },
          600000,
          ['bills', `bill:${billId}`],
        );
      }

      return new Response(Buffer.from(irFinalBytes), {
        headers: {
          'Content-Type': 'application/pdf',
          'X-Abstract-Status': abstractStatus,
          'Content-Disposition': `attachment; filename="${irFilename}"`,
        },
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Header with Logo and Branding - Add extra space above
    let headerYStart = 20;
    
    // Add logo if enabled and available
    if (brandingSettings.showLogoInReports && brandingSettings.logoUrl) {
      try {
        // Fetch logo image (5s timeout so a slow storage URL can't stall report generation)
        const logoResponse = await fetch(brandingSettings.logoUrl, { signal: AbortSignal.timeout(5000) });
        const logoBlob = await logoResponse.arrayBuffer();
        const logoBase64 = Buffer.from(logoBlob).toString('base64');
        const logoDataUrl = `data:image/png;base64,${logoBase64}`;
        
        // Add logo centered at top
        const logoWidth = 60;
        const logoHeight = 24;
        const logoX = marginLeft + (contentWidth / 2) - (logoWidth / 2);
        pdf.addImage(logoDataUrl, 'PNG', logoX, headerYStart, logoWidth, logoHeight);
        headerYStart += logoHeight + 4;
      } catch (error) {
        console.error('Error adding logo to PDF:', error);
      }
    }
    
    // Title and Header with custom branding
    // Convert hex color to RGB for jsPDF
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 0, g: 0, b: 0 };
    };
    
    pdf.setTextColor(0, 0, 0); // Black text for all content
    pdf.setFontSize(22);
    pdf.setFont("helvetica", "bold");
    pdf.text(brandingSettings.reportHeaderText, marginLeft + (contentWidth / 2), headerYStart, { align: 'center' });
    
    headerYStart += 7;
    pdf.setFontSize(19);
    pdf.text("PRICE VARIATION CALCULATION (PVC) REPORT", marginLeft + (contentWidth / 2), headerYStart, { align: 'center' });

    // Add simple separator line
    headerYStart += 4;
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.5);
    pdf.line(marginLeft, headerYStart, pageWidth - marginRight, headerYStart);

    // Set yPosition after header with proper spacing
    yPosition = headerYStart + 10;

    // CONTRACT DETAILS SECTION - Controlled by template
    if (templateSettings.sections.contractDetails) {
      // Contract Information Section - No background styling
      pdf.setTextColor(0, 0, 0); // Black text
      pdf.setFontSize(19);
      pdf.setFont("helvetica", "bold");
      pdf.text("CONTRACT DETAILS", marginLeft, yPosition + 4);
      
      // Add simple underline for the header
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(1);
      pdf.line(marginLeft, yPosition + 8, marginLeft + 120, yPosition + 8);
      
      pdf.setFontSize(13);
      pdf.setFont("helvetica", "normal");
      yPosition += 18;
    
    // Name of Work
    pdf.setFont("helvetica", "bold");
    pdf.text("Name of Work:", marginLeft, yPosition);
    yPosition += 7;
    pdf.setFont("helvetica", "normal");
    const workLines = pdf.splitTextToSize(bill.contract.workDescription, contentWidth - 20);
    pdf.text(workLines, marginLeft + 10, yPosition);
    yPosition += workLines.length * 6 + 12;
    
    // Contract details in two-column format with proper spacing to prevent overlap
    // CALCULATION STEPS FOR TWO-COLUMN LAYOUT:
    // 1. Total available width = contentWidth = 369.2mm
    // 2. Gap between columns = 20mm
    // 3. Each column width = (contentWidth - gap) / 2 = (369.2 - 20) / 2 = 174.6mm
    // 4. Label takes 40% of column, Value takes 60% of column
    
    const columnGap = 20; // Gap between two columns
    const singleColumnWidth = (contentWidth - columnGap) / 2; // 174.6mm per column
    
    // Column 1 measurements
    const col1LabelWidth = singleColumnWidth * 0.40; // 40% for label = 69.84mm
    const col1ValueWidth = singleColumnWidth * 0.60; // 60% for value = 104.76mm
    const col1LabelX = marginLeft; // Start of column 1
    const col1ValueX = col1LabelX + col1LabelWidth; // Start of column 1 values
    
    // Column 2 measurements
    const col2LabelX = marginLeft + singleColumnWidth + columnGap; // Start of column 2
    const col2LabelWidth = singleColumnWidth * 0.40; // 40% for label = 69.84mm
    const col2ValueWidth = singleColumnWidth * 0.60; // 60% for value = 104.76mm
    const col2ValueX = col2LabelX + col2LabelWidth; // Start of column 2 values
    
    // For backward compatibility (some code may still reference these)
    const labelWidth = col1LabelWidth;
    const valueWidth = col1ValueWidth;
    const valueStartX = col1ValueX;
    const col2StartX = col2LabelX;
    
    // First row: Agreement No & Date of Opening
    pdf.setFont("helvetica", "bold");
    pdf.text("Agreement No:", col1LabelX, yPosition);
    pdf.setFont("helvetica", "normal");
    const agreementText = pdf.splitTextToSize(bill.contract.agreementNo, col1ValueWidth);
    pdf.text(agreementText, col1ValueX, yPosition);
    
    pdf.setFont("helvetica", "bold");
    pdf.text("Date of Opening:", col2LabelX, yPosition);
    pdf.setFont("helvetica", "normal");
    const dateOfOpeningText = pdf.splitTextToSize(format(new Date(bill.contract.dateOfOpening), 'dd MMM yyyy'), col2ValueWidth);
    pdf.text(dateOfOpeningText, col2ValueX, yPosition);
    
    yPosition += Math.max(8, agreementText.length * 6, dateOfOpeningText.length * 6);
    
    // Second row: Contractor & Base Month
    pdf.setFont("helvetica", "bold");
    pdf.text("Contractor:", col1LabelX, yPosition);
    pdf.setFont("helvetica", "normal");
    const contractorText = pdf.splitTextToSize(bill.contract.contractorName, col1ValueWidth);
    pdf.text(contractorText, col1ValueX, yPosition);
    
    pdf.setFont("helvetica", "bold");
    pdf.text("Base Month:", col2LabelX, yPosition);
    pdf.setFont("helvetica", "normal");
    const baseMonthText = pdf.splitTextToSize(format(baseMonth, 'MMM yyyy'), col2ValueWidth);
    pdf.text(baseMonthText, col2ValueX, yPosition);
    
    yPosition += Math.max(8, contractorText.length * 6, baseMonthText.length * 6);
    
    // Third row: PVC Number & Indices Status
    pdf.setFont("helvetica", "bold");
    pdf.text("PVC Number:", col1LabelX, yPosition);
    pdf.setFont("helvetica", "bold");
    const pvcNumberText = bill.pvcNumber || 'Not Generated';
    pdf.text(pvcNumberText, col1ValueX, yPosition);
    // Underline the PVC number
    const pvcNumberWidth = pdf.getTextWidth(pvcNumberText);
    pdf.setLineWidth(0.3);
    pdf.line(col1ValueX, yPosition + 0.5, col1ValueX + pvcNumberWidth, yPosition + 0.5);
    pdf.setFont("helvetica", "normal");
    
    pdf.setFont("helvetica", "bold");
    pdf.text("Indices Status:", col2LabelX, yPosition);
    pdf.setFont("helvetica", "bold");
    const indicesStatusText = indicesStatus.isProvisional ? "PROVISIONAL INDICES" : "FINAL INDICES";
    const indicesStatusWrapped = pdf.splitTextToSize(indicesStatusText, col2ValueWidth);
    pdf.text(indicesStatusWrapped, col2ValueX, yPosition);
    pdf.setFont("helvetica", "normal"); // Reset font
    
    yPosition += Math.max(8, indicesStatusWrapped.length * 6);
    
    // Fourth row: Measurement Date & Railway Zone
    pdf.setFont("helvetica", "bold");
    pdf.text("Measurement Date:", col1LabelX, yPosition);
    pdf.setFont("helvetica", "normal");
    pdf.text(format(new Date(bill.dateOfMeasurement), 'dd MMM yyyy'), col1ValueX, yPosition);

    pdf.setFont("helvetica", "bold");
    pdf.text("Railway Zone:", col2LabelX, yPosition);
    pdf.setFont("helvetica", "bold");
    const zoneTextVal = `${bill.zone || 'N/A'}${bill.isFinalPvc ? ' (FINAL PVC)' : ''}`;
    pdf.text(zoneTextVal, col2ValueX, yPosition);
    pdf.setFont("helvetica", "normal");
    
    yPosition += 8;

    // Fifth row: Contract Value & Completion Period
    pdf.setFont("helvetica", "bold");
    pdf.text("Contract Value:", col1LabelX, yPosition);
    pdf.setFont("helvetica", "normal");
    const contractValueText = bill.contract.contractValue 
      ? `${bill.contract.contractValue.toLocaleString('en-IN')}` 
      : 'N/A';
    pdf.text(contractValueText, col1ValueX, yPosition);

    pdf.setFont("helvetica", "bold");
    pdf.text("Completion Period:", col2LabelX, yPosition);
    pdf.setFont("helvetica", "normal");
    const periodText = bill.contract.completionPeriodMonths 
      ? `${bill.contract.completionPeriodMonths} Months` 
      : 'N/A';
    pdf.text(periodText, col2ValueX, yPosition);

    yPosition += 8;

    // Sixth row: Gross Bill Amount & Net Bill Amount
    pdf.setFont("helvetica", "bold");
    pdf.text("Gross Bill Amount:", col1LabelX, yPosition);
    pdf.setFont("helvetica", "normal");
    const grossAmountVal = bill.grossBillAmount !== null && bill.grossBillAmount !== undefined
      ? `${bill.grossBillAmount.toLocaleString('en-IN')}`
      : `${bill.billAmount.toLocaleString('en-IN')}`;
    pdf.text(grossAmountVal, col1ValueX, yPosition);

    pdf.setFont("helvetica", "bold");
    pdf.text("Net Bill Amount:", col2LabelX, yPosition);
    pdf.setFont("helvetica", "normal");
    pdf.text(`${bill.billAmount.toLocaleString('en-IN')}`, col2ValueX, yPosition);

    yPosition += 8;

    // Seventh row: Fuel Pricing Type & Railway Materials
    pdf.setFont("helvetica", "bold");
    pdf.text("Fuel Pricing Type:", col1LabelX, yPosition);
    pdf.setFont("helvetica", "normal");
    const fuelPricingText = bill.fuelPriceType === 'zone_city'
      ? 'Zone-Specific City Price'
      : 'Four-City Average';
    pdf.text(fuelPricingText, col1ValueX, yPosition);

    pdf.setFont("helvetica", "bold");
    pdf.text("Railway Materials:", col2LabelX, yPosition);
    pdf.setFont("helvetica", "normal");
    const materialsText = bill.contract.hasRailwaySuppliedMaterials ? 'Yes (Excluded from PVC)' : 'No (Supplied by Contractor)';
    pdf.text(materialsText, col2ValueX, yPosition);

    yPosition += 8;
    
    // LOA details (if LOA exists)
    if (bill.contract.loaNo) {
      pdf.setFont("helvetica", "bold");
      pdf.text("LOA Details:", marginLeft, yPosition);
      pdf.setFont("helvetica", "normal");
      
      const loaDateFormatted = bill.contract.loaDate 
        ? ` dated ${format(new Date(bill.contract.loaDate), 'dd MMM yyyy')}` 
        : '';
      const loaFullText = `${bill.contract.loaNo}${loaDateFormatted}`;
      const loaText = pdf.splitTextToSize(loaFullText, contentWidth - col1LabelWidth - 5);
      pdf.text(loaText, col1ValueX, yPosition);
      yPosition += Math.max(8, loaText.length * 6);
    }
    
    // Extension Details (if contract is extended)
    if (bill.contract.isExtended) {
      // Original Completion Date and Extended Completion Date on same row
      if (bill.contract.originalCompletionDate) {
        pdf.setFont("helvetica", "bold");
        pdf.text("Original Completion:", col1LabelX, yPosition);
        pdf.setFont("helvetica", "normal");
        pdf.text(format(new Date(bill.contract.originalCompletionDate), 'dd MMM yyyy'), col1ValueX, yPosition);
      }
      
      if (bill.contract.currentCompletionDate) {
        pdf.setFont("helvetica", "bold");
        pdf.text("Extended Completion:", col2LabelX, yPosition);
        pdf.setFont("helvetica", "normal");
        pdf.text(format(new Date(bill.contract.currentCompletionDate), 'dd MMM yyyy'), col2ValueX, yPosition);
      }
      
      yPosition += 8;
      
      // Extension Type
      if (bill.contract.extensionType) {
        pdf.setFont("helvetica", "bold");
        pdf.text("Extension Type:", col1LabelX, yPosition);
        pdf.setFont("helvetica", "normal");
        const extensionTypeText = bill.contract.extensionType === '17A' 
          ? 'GCC 17A (Without LD)' 
          : bill.contract.extensionType === '17B'
          ? 'GCC 17B (With LD)'
          : bill.contract.extensionType;
        pdf.text(extensionTypeText, col1ValueX, yPosition);
        yPosition += 8;
      }
      
      // Extension Reason
      if (bill.contract.extensionReason) {
        pdf.setFont("helvetica", "bold");
        pdf.text("Extension Reason:", marginLeft, yPosition);
        pdf.setFont("helvetica", "normal");
        const reasonLines = pdf.splitTextToSize(bill.contract.extensionReason, contentWidth - labelWidth - 10);
        pdf.text(reasonLines, valueStartX, yPosition);
        yPosition += reasonLines.length * 6 + 3;
      }

      // Individual Extension Entries Table (if multiple extensions exist)
      const extensions = (bill.contract as any).extensions || [];
      if (extensions.length > 0) {
        yPosition += 4;
        pdf.setFontSize(12);
        pdf.setFont("helvetica", "bold");
        pdf.text("Extension History:", marginLeft, yPosition);
        yPosition += 6;

        const extHeaders = ['S.No.', 'Type', 'Duration (Days)', 'Extended To', 'Order No.', 'PVC Restricted'];
        const extData: any[] = extensions.map((ext: any, idx: number) => {
          const typeLabel = ext.extensionType === '17A' ? '17A' : ext.extensionType === '17B' ? '17B' : ext.extensionType;
          return [
            idx + 1,
            typeLabel,
            ext.extensionDuration,
            format(new Date(ext.extendedCompletionDate), 'dd MMM yyyy'),
            ext.orderNumber || '-',
            ext.isPvcRestricted ? 'Yes' : 'No'
          ];
        });

        pdf.autoTable({
          startY: yPosition,
          head: [extHeaders],
          body: extData,
          theme: 'grid',
          headStyles: { fontStyle: 'bold', fontSize: 10, halign: 'center' },
          styles: { fontSize: 9, cellPadding: 2.5, lineColor: [0, 0, 0], lineWidth: 0.5 },
          margin: { left: marginLeft, right: marginRight },
          tableWidth: contentWidth,
          columnStyles: {
            0: { cellWidth: contentWidth * 0.07, halign: 'center' },
            1: { cellWidth: contentWidth * 0.10, halign: 'center' },
            2: { cellWidth: contentWidth * 0.15, halign: 'center' },
            3: { cellWidth: contentWidth * 0.22, halign: 'center' },
            4: { cellWidth: contentWidth * 0.28, halign: 'left' },
            5: { cellWidth: contentWidth * 0.18, halign: 'center' }
          }
        });
        yPosition = pdf.lastAutoTable.finalY + 6;
        pdf.setFontSize(13);
      }
    }
    
    // Add detailed indices information if provisional
    if (indicesStatus.isProvisional && indicesStatus.provisionalIndices.length > 0) {
      pdf.setFontSize(13);
      pdf.setFont("helvetica", "italic");
      const provisionalText = `Note: The following indices are provisional: ${indicesStatus.provisionalIndices.join(', ')}`;
      const provisionalLines = pdf.splitTextToSize(provisionalText, contentWidth - 20);
      pdf.text(provisionalLines, marginLeft + 10, yPosition);
      pdf.setFontSize(13); // Reset font size
      yPosition += provisionalLines.length * 4 + 8;
    }
    
    yPosition += 12;
    
    // Add thin separator line after CONTRACT DETAILS section
    pdf.setDrawColor(200, 200, 200); // Light gray
    pdf.setLineWidth(0.3);
    pdf.line(marginLeft, yPosition, pageWidth - marginRight, yPosition);
    yPosition += 10;
    } // End of CONTRACT DETAILS section template check

    // WORK CLASSIFICATION SECTION - Controlled by template
    if (templateSettings.sections.workClassification) {
    checkNewPage(120);
    
    pdf.setFontSize(19);
    pdf.setFont("helvetica", "bold");
    pdf.text("WORK CLASSIFICATION (GCC-2022-ACS2)", marginLeft, yPosition);
    
    // Underline the title
    const titleWidth = pdf.getTextWidth("WORK CLASSIFICATION (GCC-2022-ACS2)");
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.5);
    pdf.line(marginLeft, yPosition + 2, marginLeft + titleWidth, yPosition + 2);
    
    yPosition += 12;
    
    // Calculate weighted components from classification entries
    let displayComponents: any = null;
    let displayClassificationText = '';
    
    if (bill.classificationEntries && bill.classificationEntries.length > 0) {
      const hasDedicatedCement = bill.cementAmount && Number(bill.cementAmount) > 0;
      const hasDedicatedSteel = 
        (bill.steelTmtBarsAmount && Number(bill.steelTmtBarsAmount) > 0) ||
        (bill.steelAngleChannelAmount && Number(bill.steelAngleChannelAmount) > 0) ||
        (bill.steelPlatesAmount && Number(bill.steelPlatesAmount) > 0) ||
        (bill.steelOtherSectionsAmount && Number(bill.steelOtherSectionsAmount) > 0);

      // New approach: use classification entries
      const weightedComponents = await calculateWeightedComponents(
        bill.classificationEntries.map((entry: any) => ({
          subClassificationId: entry.subClassificationId,
          classificationId: entry.classificationId,
          amount: entry.amount
        })),
        {
          hasDedicatedSteel,
          hasDedicatedCement
        }
      );
      
      displayComponents = weightedComponents;
      
      // Display all classification entries
      const classificationCodes = bill.classificationEntries.map((entry: any) => {
        if (entry.subClassification) {
          return entry.subClassification.code;
        } else if (entry.classification) {
          return entry.classification.code;
        }
        return 'Unknown';
      });
      
      displayClassificationText = classificationCodes.join(', ');
      
      // Show classification entries table first
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.text("WORK CLASSIFICATIONS & AMOUNTS:", marginLeft, yPosition);
      yPosition += 10;
      
      const entryData: any[] = [];
      let totalAmount = 0;
      
      // Check if any entry has a description or schedule
      const hasDescriptions = bill.classificationEntries.some((entry: any) => entry.description);
      const hasSchedules = bill.classificationEntries.some((entry: any) => entry.scheduleItem);
      
      bill.classificationEntries.forEach((entry: any, index: number) => {
        const code = entry.subClassification?.code || entry.classification?.code || '';
        const name = entry.subClassification?.name || entry.classification?.name || '';
        const description = entry.description || '';
        const schedule = entry.scheduleItem || '';
        const amount = parseFloat(entry.amount) || 0;
        totalAmount += amount;
        
        const row: any[] = [index + 1, code, name];
        if (hasSchedules) row.push(schedule);
        if (hasDescriptions) row.push(description);
        row.push(amount.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 }));
        entryData.push(row);
      });
      
      // Calculate total colSpan: S.No + Code + Name + (Schedule?) + (Description?) = base 3 + extras
      const totalColSpan = 3 + (hasSchedules ? 1 : 0) + (hasDescriptions ? 1 : 0);
      entryData.push([
        { content: 'TOTAL', colSpan: totalColSpan, styles: { fontStyle: 'bold', halign: 'right' } },
        { content: totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 }), styles: { fontStyle: 'bold' } }
      ]);
      
      // Build header columns
      const headerRow: string[] = ['S.No.', 'Code', 'Classification Name'];
      if (hasSchedules) headerRow.push('Schedule');
      if (hasDescriptions) headerRow.push('Description');
      headerRow.push('Amount');
      
      pdf.autoTable({
        startY: yPosition,
        head: [headerRow],
        body: entryData,
        theme: 'grid',
        headStyles: { 
          fontStyle: 'bold',
          fontSize: 13,
          halign: 'center'
        },
        styles: { 
          fontSize: 12, 
          cellPadding: 4,
          lineColor: [0, 0, 0],
          lineWidth: 0.5
        },
        margin: { left: marginLeft, right: marginRight },
        tableWidth: contentWidth,
        columnStyles: (() => {
          const colCount = headerRow.length;
          if (colCount === 6) {
            // S.No, Code, Name, Schedule, Description, Amount
            return {
              0: { cellWidth: contentWidth * 0.06, halign: 'center' },
              1: { cellWidth: contentWidth * 0.09, halign: 'center', fontStyle: 'bold' },
              2: { cellWidth: contentWidth * 0.25, halign: 'left' },
              3: { cellWidth: contentWidth * 0.22, halign: 'left' },
              4: { cellWidth: contentWidth * 0.20, halign: 'left' },
              5: { cellWidth: contentWidth * 0.18, halign: 'right', fontStyle: 'bold' }
            };
          } else if (colCount === 5) {
            // S.No, Code, Name, (Schedule OR Description), Amount
            return {
              0: { cellWidth: contentWidth * 0.07, halign: 'center' },
              1: { cellWidth: contentWidth * 0.10, halign: 'center', fontStyle: 'bold' },
              2: { cellWidth: contentWidth * 0.33, halign: 'left' },
              3: { cellWidth: contentWidth * 0.28, halign: 'left' },
              4: { cellWidth: contentWidth * 0.22, halign: 'right', fontStyle: 'bold' }
            };
          } else {
            // S.No, Code, Name, Amount (4 columns)
            return {
              0: { cellWidth: contentWidth * 0.08, halign: 'center' },
              1: { cellWidth: contentWidth * 0.12, halign: 'center', fontStyle: 'bold' },
              2: { cellWidth: contentWidth * 0.55, halign: 'left' },
              3: { cellWidth: contentWidth * 0.25, halign: 'right', fontStyle: 'bold' }
            };
          }
        })()
      });
      
      yPosition = pdf.lastAutoTable.finalY + 10;

      // ---- Item Rows Detail Table ----
      const hasAnyItemRows = bill.classificationEntries.some((entry: any) => {
        const rows = entry.itemRows ? (typeof entry.itemRows === 'string' ? JSON.parse(entry.itemRows) : entry.itemRows) : null;
        return Array.isArray(rows) && rows.length > 0;
      });

      if (hasAnyItemRows) {
        pdf.setFontSize(13);
        pdf.setFont("helvetica", "bold");
        pdf.text("ITEM DETAILS:", marginLeft, yPosition);
        yPosition += 8;

        const itemHeaders = ['S.No.', 'Classification', 'Item No.', 'Qty', 'Agmt. Rate', 'Amount'];
        const itemData: any[] = [];
        let serialNo = 0;

        bill.classificationEntries.forEach((entry: any) => {
          const code = entry.subClassification?.code || entry.classification?.code || '';
          const rows = entry.itemRows ? (typeof entry.itemRows === 'string' ? JSON.parse(entry.itemRows) : entry.itemRows) : null;

          if (Array.isArray(rows) && rows.length > 0) {
            rows.forEach((row: any) => {
              serialNo++;
              const qty = parseFloat(row.quantity) || 0;
              const rate = parseFloat(row.agreementRate) || 0;
              const rowAmt = qty * rate;
              itemData.push([
                serialNo,
                code,
                row.itemNumber || '',
                qty.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
                rate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                rowAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              ]);
            });
          } else if (entry.itemNumber || entry.quantity || entry.agreementRate) {
            // Legacy single-item fallback
            serialNo++;
            const qty = parseFloat(entry.quantity) || 0;
            const rate = parseFloat(entry.agreementRate) || 0;
            const rowAmt = qty * rate;
            itemData.push([
              serialNo,
              code,
              entry.itemNumber || '',
              qty.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
              rate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
              rowAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            ]);
          }
        });

        if (itemData.length > 0) {
          pdf.autoTable({
            startY: yPosition,
            head: [itemHeaders],
            body: itemData,
            theme: 'grid',
            headStyles: { fontStyle: 'bold', fontSize: 11, halign: 'center' },
            styles: { fontSize: 10, cellPadding: 3, lineColor: [0, 0, 0], lineWidth: 0.5 },
            margin: { left: marginLeft, right: marginRight },
            tableWidth: contentWidth,
            columnStyles: {
              0: { cellWidth: contentWidth * 0.06, halign: 'center' },
              1: { cellWidth: contentWidth * 0.12, halign: 'center', fontStyle: 'bold' },
              2: { cellWidth: contentWidth * 0.22, halign: 'left' },
              3: { cellWidth: contentWidth * 0.15, halign: 'right' },
              4: { cellWidth: contentWidth * 0.20, halign: 'right' },
              5: { cellWidth: contentWidth * 0.25, halign: 'right', fontStyle: 'bold' }
            }
          });
          yPosition = pdf.lastAutoTable.finalY + 12;
        }
      }

    } else if (workClassification) {
      // Legacy approach: use single work classification
      displayComponents = workClassification;
      displayClassificationText = `${workClassification.code} - ${workClassification.name}`;
      
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.text(`Classification Code: ${workClassification.code}`, marginLeft, yPosition);
      
      yPosition += 7;
      pdf.setFontSize(13);
      pdf.setFont("helvetica", "normal");
      pdf.text(`Classification Name: ${workClassification.name}`, marginLeft, yPosition);
      
      if (workClassification.description) {
        yPosition += 7;
        const descriptionLines = pdf.splitTextToSize(workClassification.description, contentWidth - 20);
        pdf.text(descriptionLines, marginLeft, yPosition);
        yPosition += descriptionLines.length * 4 + 8;
      } else {
        yPosition += 10;
      }
    }
    
    // Component breakdown table removed as per user request
    if (displayComponents) {
      // Skip rendering the component breakdown
      if (false) {
        pdf.setFontSize(12);
        pdf.setFont("helvetica", "normal");
        pdf.text("No component breakdown available for this classification.", marginLeft + 10, yPosition);
        yPosition += 18;
      }
      
      // Sub-Classifications Section - Display selected sub-classifications with amounts
      const subClassifications = Array.isArray(bill.subClassifications) ? bill.subClassifications : 
                                 (bill.subClassifications && typeof bill.subClassifications === 'object' && 
                                  Array.isArray((bill.subClassifications as any))) ? (bill.subClassifications as any) : [];
      
      if (subClassifications.length > 0) {
        // Add page break if needed for sub-classifications section
        if (yPosition > pageHeight - marginBottom - 100) {
          pdf.addPage();
          yPosition = marginTop;
        }
        
        pdf.setFontSize(17);
        pdf.setFont("helvetica", "bold");
        pdf.text("SUB-CLASSIFICATIONS & AMOUNTS", marginLeft, yPosition);
        
        // Underline the subtitle
        const subClassTitle = "SUB-CLASSIFICATIONS & AMOUNTS";
        const subClassTitleWidth = pdf.getTextWidth(subClassTitle);
        pdf.setLineWidth(0.5);
        pdf.line(marginLeft, yPosition + 2, marginLeft + subClassTitleWidth, yPosition + 2);
        yPosition += 12;
        
        const subClassData: any[] = [];
        let totalSubClassAmount = 0;
        
        subClassifications.forEach((subClass: any, index: number) => {
          const code = subClass.code || '';
          const name = subClass.name || '';
          const amount = parseFloat(subClass.amount) || 0;
          totalSubClassAmount += amount;
          
          subClassData.push([
            index + 1,
            code,
            name,
            amount.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
          ]);
        });
        
        // Add total row
        subClassData.push([
          { content: 'TOTAL', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right' } },
          { content: totalSubClassAmount.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 }), styles: { fontStyle: 'bold' } }
        ]);
        
        pdf.autoTable({
          startY: yPosition,
          head: [['S.No.', 'Code', 'Sub-Classification Name', 'Amount']],
          body: subClassData,
          theme: 'grid',
          headStyles: { 
            
            
            fontStyle: 'bold',
            fontSize: 13,
            halign: 'center'
          },
          styles: { 
            fontSize: 12, 
            cellPadding: 4,
            lineColor: [0, 0, 0],
            lineWidth: 0.5
          },
          margin: { left: marginLeft, right: marginRight },
          tableWidth: contentWidth,
          columnStyles: {
            0: { cellWidth: contentWidth * 0.08, halign: 'center' },
            1: { cellWidth: contentWidth * 0.12, halign: 'center', fontStyle: 'bold' },
            2: { cellWidth: contentWidth * 0.55, halign: 'left' },
            3: { cellWidth: contentWidth * 0.25, halign: 'right', fontStyle: 'bold' }
          }
        });
        
        yPosition = pdf.lastAutoTable.finalY + 12;
      }
      
      // Non-Schedule Items Section - Display non-schedule items with amounts (deducted from bill)
      const nonScheduleItems = Array.isArray(bill.nonScheduleItems) ? bill.nonScheduleItems : 
                               (bill.nonScheduleItems && typeof bill.nonScheduleItems === 'object' && 
                                Array.isArray((bill.nonScheduleItems as any))) ? (bill.nonScheduleItems as any) : [];
      
      if (nonScheduleItems.length > 0) {
        // Add page break if needed for non-schedule items section
        if (yPosition > pageHeight - marginBottom - 100) {
          pdf.addPage();
          yPosition = marginTop;
        }
        
        pdf.setFontSize(17);
        pdf.setFont("helvetica", "bold");
        pdf.text("NON-SCHEDULE ITEMS (DEDUCTIONS)", marginLeft, yPosition);
        
        // Underline the subtitle
        const nonScheduleTitle = "NON-SCHEDULE ITEMS (DEDUCTIONS)";
        const nonScheduleTitleWidth = pdf.getTextWidth(nonScheduleTitle);
        pdf.setLineWidth(0.5);
        pdf.line(marginLeft, yPosition + 2, marginLeft + nonScheduleTitleWidth, yPosition + 2);
        yPosition += 12;
        
        const nonScheduleData: any[] = [];
        let totalNonScheduleAmount = 0;
        
        nonScheduleItems.forEach((item: any, index: number) => {
          const description = item.description || '';
          const amount = parseFloat(item.amount) || 0;
          totalNonScheduleAmount += amount;
          
          nonScheduleData.push([
            index + 1,
            description,
            amount.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
          ]);
        });
        
        // Add total row
        nonScheduleData.push([
          { content: 'TOTAL DEDUCTION', colSpan: 2, styles: { fontStyle: 'bold', halign: 'right' } },
          { content: `-${totalNonScheduleAmount.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`, styles: { fontStyle: 'bold' } }
        ]);
        
        pdf.autoTable({
          startY: yPosition,
          head: [['S.No.', 'Description', 'Amount']],
          body: nonScheduleData,
          theme: 'grid',
          headStyles: { 
            
            
            fontStyle: 'bold',
            fontSize: 13,
            halign: 'center'
          },
          styles: { 
            fontSize: 12, 
            cellPadding: 4,
            lineColor: [0, 0, 0],
            lineWidth: 0.5
          },
          margin: { left: marginLeft, right: marginRight },
          tableWidth: contentWidth,
          columnStyles: {
            0: { cellWidth: contentWidth * 0.10, halign: 'center' },
            1: { cellWidth: contentWidth * 0.65, halign: 'left' },
            2: { cellWidth: contentWidth * 0.25, halign: 'right', fontStyle: 'bold' }
          }
        });
        
        yPosition = pdf.lastAutoTable.finalY + 12;
        
        // Add note about effective bill amount
        pdf.setFontSize(12);
        pdf.setFont("helvetica", "italic");
        pdf.text(
          `Note: These amounts are deducted from the bill amount for PVC calculation. Effective Bill Amount: ${(bill.billAmount - totalNonScheduleAmount).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`,
          marginLeft,
          yPosition
        );
        yPosition += 12;
      }
    } else {
      pdf.setFontSize(13);
      pdf.setFont("helvetica", "normal");
      pdf.text("No work classification assigned to this bill.", marginLeft + 10, yPosition);
      pdf.text("Standard component percentages may have been used for PVC calculation.", marginLeft + 10, yPosition + 6);
      
      // Show fallback from contract classification if available
      if (bill.contract.workClassification) {
        yPosition += 12;
        pdf.setFontSize(12);
        pdf.setFont("helvetica", "italic");
        pdf.text(`Contract Classification: ${bill.contract.workClassification}`, marginLeft + 10, yPosition);
        pdf.text("(Legacy classification - detailed breakdown not available)", marginLeft + 10, yPosition + 6);
        yPosition += 12;
      } else {
        yPosition += 18;
      }
    }
    
    // Add thin separator line after WORK CLASSIFICATION section
    pdf.setDrawColor(200, 200, 200); // Light gray
    pdf.setLineWidth(0.3);
    pdf.line(marginLeft, yPosition, pageWidth - marginRight, yPosition);
    yPosition += 10;
    } // End of WORK CLASSIFICATION section template check

    // ALL BILLS TABLE is rendered AFTER PVC calculation to use recalculated values

    // MONTHLY PRICE INDICES SECTION - Controlled by template
    if (templateSettings.sections.monthlyIndices) {

    // ---- Determine which indices are actually affected by the bill's classifications ----
    const steelTypeEnumToIndexName: { [key: string]: string } = {
      'TMT': 'Steel TMT Bars',
      'ANGLE_CHANNEL': 'Steel Angle/Channel',
      'PLATES': 'Steel Plates',
      'OTHER_SECTIONS': 'Steel Other Sections'
    };
    const componentToIndexName: { [key: string]: string } = {
      'labour': 'Labour',
      'plantMachinery': 'RBI Plant Machinery',
      'fuel': 'MPNG Fuel',
      'otherMaterials': 'RBI Other Materials',
      'cement': 'RBI Cement',
      'explosives': 'RBI Explosives'
    };
    const allSteelIndexNamesList = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
    const affectedIndexNamesSet = new Set<string>();

    if (bill.classificationEntries && bill.classificationEntries.length > 0) {
      for (const entry of bill.classificationEntries) {
        const classComp = (entry as any).subClassification || (entry as any).classification;
        if (!classComp) continue;

        for (const [compKey, idxName] of Object.entries(componentToIndexName)) {
          if ((classComp as any)[compKey] > 0) affectedIndexNamesSet.add(idxName);
        }

        if ((classComp as any).steel > 0) {
          const entrySteel = (entry as any).steelTypes;
          const billSteel = (bill as any).steelTypes;
          const steelArr = (entrySteel && Array.isArray(entrySteel) && entrySteel.length > 0) ? entrySteel
            : (billSteel && Array.isArray(billSteel) && billSteel.length > 0) ? billSteel
            : null;
          if (steelArr) {
            for (const st of steelArr) {
              if (steelTypeEnumToIndexName[st]) affectedIndexNamesSet.add(steelTypeEnumToIndexName[st]);
            }
          } else {
            allSteelIndexNamesList.forEach(n => affectedIndexNamesSet.add(n));
          }
        }
      }
    }

    // Dedicated cement/steel amounts
    if ((bill as any).cementAmount > 0) affectedIndexNamesSet.add('RBI Cement');
    if ((bill as any).steelAmount > 0) {
      const billSteel = (bill as any).steelTypes;
      if (billSteel && Array.isArray(billSteel) && billSteel.length > 0) {
        for (const st of billSteel) {
          if (steelTypeEnumToIndexName[st]) affectedIndexNamesSet.add(steelTypeEnumToIndexName[st]);
        }
      } else {
        allSteelIndexNamesList.forEach(n => affectedIndexNamesSet.add(n));
      }
    }

    // Dedicated PVC values
    if (bill.pvcCalculation) {
      if (bill.pvcCalculation.dedicatedCementPvc && bill.pvcCalculation.dedicatedCementPvc !== 0) affectedIndexNamesSet.add('RBI Cement');
      if ((bill.pvcCalculation as any).dedicatedSteelTmtBarsPvc && (bill.pvcCalculation as any).dedicatedSteelTmtBarsPvc !== 0) affectedIndexNamesSet.add('Steel TMT Bars');
      if ((bill.pvcCalculation as any).dedicatedSteelAngleChannelPvc && (bill.pvcCalculation as any).dedicatedSteelAngleChannelPvc !== 0) affectedIndexNamesSet.add('Steel Angle/Channel');
      if ((bill.pvcCalculation as any).dedicatedSteelPlatesPvc && (bill.pvcCalculation as any).dedicatedSteelPlatesPvc !== 0) affectedIndexNamesSet.add('Steel Plates');
      if ((bill.pvcCalculation as any).dedicatedSteelOtherSectionsPvc && (bill.pvcCalculation as any).dedicatedSteelOtherSectionsPvc !== 0) affectedIndexNamesSet.add('Steel Other Sections');
    }

    // Column definitions in canonical order
    const allColDefs = [
      { indexName: 'Labour', headerLabel: 'Labour', isSteelSub: false },
      { indexName: 'RBI Plant Machinery', headerLabel: 'Plant Machinery & Spares', isSteelSub: false },
      { indexName: 'MPNG Fuel', headerLabel: 'MPNG Fuel', isSteelSub: false },
      { indexName: 'RBI Other Materials', headerLabel: 'Other Materials', isSteelSub: false },
      { indexName: 'RBI Cement', headerLabel: 'Cement', isSteelSub: false },
      { indexName: 'RBI Explosives', headerLabel: 'Explosives', isSteelSub: false },
      { indexName: 'Steel TMT Bars', headerLabel: 'TMT Bars', isSteelSub: true },
      { indexName: 'Steel Angle/Channel', headerLabel: 'Angle/Channel', isSteelSub: true },
      { indexName: 'Steel Plates', headerLabel: 'Plates', isSteelSub: true },
      { indexName: 'Steel Other Sections', headerLabel: 'Other Sections', isSteelSub: true },
    ];
    // If no affected indices detected (e.g. no classification entries), fall back to showing all
    const activeCols = affectedIndexNamesSet.size > 0 
      ? allColDefs.filter(c => affectedIndexNamesSet.has(c.indexName))
      : allColDefs;
    const activeSteelCols = activeCols.filter(c => c.isSteelSub);
    const activeNonSteelCols = activeCols.filter(c => !c.isSteelSub);
    const totalDataCols = activeCols.length;

    checkNewPage(120);
    pdf.setFontSize(19);
    pdf.setFont("helvetica", "bold");
    pdf.text("DETAILED MONTHLY PRICE INDICES", marginLeft, yPosition);
    
    // Underline the title
    const indicesTitle = "DETAILED MONTHLY PRICE INDICES";
    const indicesTitleWidth = pdf.getTextWidth(indicesTitle);
    pdf.line(marginLeft, yPosition + 2, marginLeft + indicesTitleWidth, yPosition + 2);
    yPosition += 12;

    // ---- Provisional / borrowed markers (parity with the IR-standard report) ----
    // For the bill's quarter, surface the real value the calc borrows for a not-yet-published
    // month, mark provisional values "P" and borrowed values "(b)", and make the shown quarter
    // average match the value actually used in the PVC calculation.
    const provBorrow = new Map<string, { prov: boolean; borrowed: boolean; value: number }>();
    const affectedAvg = new Map<string, number>();
    let hasProvMarks = false, hasBorrowMarks = false;
    try {
      const fuelNameD = getFuelIndexNameForBill(bill.zone, bill.fuelPriceType);
      const steelNamesD = getSteelIndexNamesForZone(bill.zone);
      const idxNamesD = ['Labour', 'RBI Plant Machinery', fuelNameD, 'RBI Other Materials', 'RBI Cement', 'RBI Explosives', ...steelNamesD];
      const canon = (n: string) => {
        if (n === fuelNameD) return 'MPNG Fuel';
        const m = n.match(/^(Steel TMT Bars|Steel Angle\/Channel|Steel Plates|Steel Other Sections)( - .+)?$/);
        return m ? m[1] : n;
      };
      const qAvgD = await getQuarterlyAverages(bill.quarter, idxNamesD, baseMonth, 'auto');
      const qMonthsD = getQuarterMonths(bill.quarter, baseMonth);
      const qStartD = new Date(qMonthsD[0].getFullYear(), qMonthsD[0].getMonth(), 1);
      const qEndD = new Date(qMonthsD[qMonthsD.length - 1].getFullYear(), qMonthsD[qMonthsD.length - 1].getMonth() + 1, 1);
      const pIdxD = await prisma.priceIndex.findMany({ where: { name: { in: idxNamesD } }, select: { id: true, name: true } });
      const rawD = await prisma.monthlyIndexValue.findMany({
        where: { priceIndexId: { in: pIdxD.map((p: any) => p.id) }, month: { gte: qStartD, lt: qEndD } },
        include: { priceIndex: true },
      });
      const realKeysD = new Set<string>();
      for (const mv of rawD) {
        const key = `${canon(mv.priceIndex.name)}|${new Date(mv.month).toISOString().slice(0, 7)}`;
        realKeysD.add(key);
        if (mv.isProvisional) { provBorrow.set(key, { prov: true, borrowed: false, value: mv.value }); hasProvMarks = true; }
      }
      for (const qa of (qAvgD as any[])) {
        const cn = canon(qa.indexName);
        affectedAvg.set(cn, qa.average);
        for (const mv of (qa.monthlyValues || [])) {
          const key = `${cn}|${mv.month}`;
          if (!realKeysD.has(key)) { provBorrow.set(key, { prov: true, borrowed: true, value: mv.value }); hasBorrowMarks = true; }
        }
      }
    } catch (e) {
      console.error('detailed report provisional/borrowed lookup failed:', e);
    }

    // Create comprehensive monthly indices table
    const monthlyTableData = [];

    // Base month row with actual contract-specific values
    // Helper function to format steel indices - show decimals if available
    const formatSteelIndex = (value: number | undefined) => {
      if (value === undefined || value === null) return '';
      if (value % 1 !== 0) {
        return value.toString();
      }
      return value.toString();
    };

    const fmtIdx = (col: typeof activeCols[0], value: number | undefined) => {
      if (value === undefined || value === null) return '';
      return col.isSteelSub ? formatSteelIndex(value) : value.toFixed(2);
    };

    const baseRow = [
      `BASE (${format(baseMonth, 'MMM yyyy')})  [Base Month]`,
      ...activeCols.map(col => fmtIdx(col, baseIndexData[col.indexName]))
    ];
    monthlyTableData.push(baseRow);

    // Add all monthly data for each quarter
    // Track row indices for the affected quarter to apply highlighting
    const affectedQuarterRowIndices: number[] = [];
    let currentRowIndex = 1; // Start from 1 (0 is base row)
    
    // Check if 17B restrictions are applied
    const has17BRestriction = bill.pvcCalculation?.isIndexCapped && bill.pvcCalculation?.isExtensionPeriod;
    
    // Calculate the measurement quarter for unrestricted scenario
    const measurementQuarter = getQuarterFromDate(measurementDate, baseMonth);
    
    for (const qData of quarterlyData) {
      // For 17B restricted bills, we need to track BOTH quarters:
      // 1. Measurement quarter (for unrestricted calculation)
      // 2. Bill quarter (for restricted/capped calculation)
      const isMeasurementQuarter = qData.quarter === measurementQuarter;
      const isBillQuarter = qData.quarter === bill.quarter;
      const isAffectedQuarter = has17BRestriction ? (isMeasurementQuarter || isBillQuarter) : isMeasurementQuarter;
      
      // Quarter header
      if (isAffectedQuarter) {
        affectedQuarterRowIndices.push(currentRowIndex);
      }
      monthlyTableData.push([
        `QUARTER ${qData.quarter}`,
        ...activeCols.map(() => '')
      ]);
      currentRowIndex++;

      // Monthly data for this quarter
      for (const qMonth of qData.quarterMonths) {
        const monthKey = format(qMonth, 'yyyy-MM');
        const monthLabel = format(qMonth, 'MMM yyyy');
        
        if (isAffectedQuarter) {
          affectedQuarterRowIndices.push(currentRowIndex);
        }
        
        // Determine remarks for this row
        let remarks = '';
        if (isMeasurementQuarter && isBillQuarter) {
          // Same quarter for both scenarios (happens when measurement date quarter = bill quarter)
          remarks = has17BRestriction ? 'Measurement Quarter / 17B Capped' : 'Measurement Quarter';
        } else if (isMeasurementQuarter) {
          remarks = 'Measurement Quarter';
        } else if (isBillQuarter) {
          remarks = '17B Capped';
        }
        
        // Append remarks to month label if present
        const periodText = remarks ? `${monthLabel}  [${remarks}]` : monthLabel;
        
        const monthRow = [
          periodText,
          ...activeCols.map(col => {
            const pb = qData.quarter === bill.quarter ? provBorrow.get(`${col.indexName}|${monthKey}`) : undefined;
            // A borrowed month has no published value — show the real borrowed figure, not the base value.
            if (pb?.borrowed) return `${fmtIdx(col, pb.value)} (b)`;
            const base = fmtIdx(col, qData.monthlyData[col.indexName]?.[monthKey]);
            if (pb?.prov && base) return `${base} P`;
            return base;
          })
        ];
        monthlyTableData.push(monthRow);
        currentRowIndex++;
      }

      // Quarter average row
      if (isAffectedQuarter) {
        affectedQuarterRowIndices.push(currentRowIndex);
      }
      
      // Format quarter date range
      const firstMonth = qData.quarterMonths[0];
      const lastMonth = qData.quarterMonths[qData.quarterMonths.length - 1];
      const quarterLabel = qData.quarterMonths.length === 1 
        ? format(firstMonth, 'MMM yyyy')
        : format(firstMonth, 'MMM') + '-' + format(lastMonth, 'MMM yyyy');
      
      // Determine remarks for average row
      let avgRemarks = '';
      if (isMeasurementQuarter && isBillQuarter) {
        // Same quarter for both scenarios
        avgRemarks = has17BRestriction ? 'Measurement Quarter Avg / 17B Capped' : 'Measurement Quarter Avg';
      } else if (isMeasurementQuarter) {
        avgRemarks = 'Measurement Quarter Avg';
      } else if (isBillQuarter) {
        avgRemarks = '17B Capped Avg';
      }
      
      // Append remarks to average label if present
      const avgPeriodText = avgRemarks ? `${quarterLabel} AVERAGE  [${avgRemarks}]` : `${quarterLabel} AVERAGE`;
      
      const avgRow = [
        avgPeriodText,
        ...activeCols.map(col => {
          // For the bill's quarter, use the borrowed-inclusive average so the printed figure
          // matches the value actually used in the PVC calculation.
          const v = (qData.quarter === bill.quarter && affectedAvg.has(col.indexName))
            ? affectedAvg.get(col.indexName)
            : qData.averages[col.indexName];
          return (v !== undefined && v !== null) ? v.toFixed(2) : '';
        })
      ];
      monthlyTableData.push(avgRow);
      currentRowIndex++;
    }

    // Add zone information to table header if available
    const zoneText = bill.zone ? `Zone: ${bill.zone}` : '';
    
    // Calculate optimized column widths dynamically based on active columns
    const periodColWidth = contentWidth * 0.15;
    const indexColWidth = totalDataCols > 0 ? (contentWidth - periodColWidth) / totalDataCols : 0;
    
    // Build dynamic header rows
    const hasSteelCols = activeSteelCols.length > 0;
    const headerRow1: any[] = [
      { content: 'Period', rowSpan: hasSteelCols ? 2 : 1, styles: { valign: 'middle', halign: 'center' } }
    ];
    const headerRow2: string[] = [];

    for (const col of activeNonSteelCols) {
      headerRow1.push({ content: col.headerLabel, rowSpan: hasSteelCols ? 2 : 1, styles: { valign: 'middle', halign: 'center' } });
    }
    if (hasSteelCols) {
      headerRow1.push({ content: zoneText || 'Steel', colSpan: activeSteelCols.length, styles: { halign: 'center', fontStyle: 'bold' } });
      for (const col of activeSteelCols) {
        headerRow2.push(col.headerLabel);
      }
    }

    const headRows: any[] = [headerRow1];
    if (hasSteelCols) headRows.push(headerRow2);

    // Build columnStyles dynamically
    const colStyles: any = {
      0: { cellWidth: periodColWidth, fontStyle: 'bold', halign: 'left' }
    };
    for (let i = 0; i < totalDataCols; i++) {
      colStyles[i + 1] = { cellWidth: indexColWidth, halign: 'center' };
    }
    
    pdf.autoTable({
      startY: yPosition,
      head: headRows,
      body: monthlyTableData,
      theme: 'grid',
      headStyles: { 
        fontStyle: 'bold',
        fontSize: 13,
        halign: 'center'
      },
      styles: { 
        fontSize: 12, 
        cellPadding: 2.5,
        lineColor: [0, 0, 0],
        lineWidth: 0.5
      },
      margin: { left: marginLeft, right: marginRight },
      tableWidth: 'auto',
      columnStyles: colStyles,
      didParseCell: function (data: any) {
        // Make the affected quarter (bill's quarter) rows bold (no color highlighting)
        if (data.section === 'body' && affectedQuarterRowIndices.includes(data.row.index)) {
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });

    yPosition = pdf.lastAutoTable.finalY + 8;

    // Legend for provisional / borrowed markers, when any appear in the affected quarter.
    if (hasProvMarks || hasBorrowMarks) {
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'italic');
      if (hasProvMarks) {
        pdf.text('P = provisional index (temporary — will be revised when the final index is published).', marginLeft, yPosition);
        yPosition += 5;
      }
      if (hasBorrowMarks) {
        pdf.text("(b) = borrowed from the previous available month because this month's index is not yet published; used in the quarter average.", marginLeft, yPosition);
        yPosition += 5;
      }
      pdf.setFont('helvetica', 'normal');
    }
    yPosition += 7;

    // Add thin separator line after MONTHLY INDICES section
    pdf.setDrawColor(200, 200, 200); // Light gray
    pdf.setLineWidth(0.3);
    pdf.line(marginLeft, yPosition, pageWidth - marginRight, yPosition);
    yPosition += 10;
    } // End of MONTHLY INDICES section template check

    // Outer-scope variable to capture recalculated PVC for use in All Bills table
    let recalculatedPvcForCurrentBill = 0;

    // CURRENT BILL PVC CALCULATION - Controlled by template
    if (templateSettings.sections.pvcCalculation) {
    checkNewPage(120);
    
    pdf.setFontSize(19);
    pdf.setFont("helvetica", "bold");
    pdf.text(`PVC CALCULATION FOR BILL: ${bill.billNo}`, marginLeft, yPosition);
    
    // Underline the title
    const pvcCalcTitle = `PVC CALCULATION FOR BILL: ${bill.billNo}`;
    const pvcCalcTitleWidth = pdf.getTextWidth(pvcCalcTitle);
    pdf.line(marginLeft, yPosition + 2, marginLeft + pvcCalcTitleWidth, yPosition + 2);
    
    yPosition += 12;

    pdf.setFontSize(13);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Quarter: ${bill.quarter} | Measurement Date: ${format(new Date(bill.dateOfMeasurement), 'dd MMM yyyy')} | Bill Amount: ${bill.billAmount.toLocaleString('en-IN')}`, marginLeft, yPosition);
    
    yPosition += 10;

    if (bill.pvcCalculation) {
      // Get the quarterly averages for this bill's quarter (same as used in actual calculation)
      const billQuarterData = quarterlyData.find(qd => qd.quarter === bill.quarter);
      const quarterlyAverageIndices: { [key: string]: number } = {};
      const unrestrictedIndices: { [key: string]: number } = {}; // For unrestricted scenario
      
      // Store the calculated totals for financial impact comparison
      let calculatedUnrestrictedTotal = 0;
      let calculatedRestrictedTotal = 0;
      
      // Track component-wise breakdown for detailed financial impact
      const componentBreakdown: {
        [component: string]: { unrestricted: number; restricted: number }
      } = {};
      
      // For unrestricted scenario, use the measurement date's quarter, not the stored bill quarter
      const measurementQuarter = getQuarterFromDate(measurementDate, baseMonth);
      const measurementQuarterData = quarterlyData.find(qd => qd.quarter === measurementQuarter);
      
      if (billQuarterData) {
        for (const index of allIndices) {
          quarterlyAverageIndices[index.name] = billQuarterData.averages[index.name] || index.baseValue;
        }
      } else {
        for (const index of allIndices) {
          quarterlyAverageIndices[index.name] = index.baseValue;
        }
      }

      // Alias city-specific fuel under 'MPNG Fuel' only for zone_city pricing
      if (billFuelName !== 'MPNG Fuel' && quarterlyAverageIndices[billFuelName] !== undefined) {
        quarterlyAverageIndices['MPNG Fuel'] = quarterlyAverageIndices[billFuelName];
      }

      // Alias city-specific steel indices under base names for quarterly averages
      if (billSteelCity && billSteelCity !== 'Chennai') {
        const steelBaseNames = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
        for (const baseName of steelBaseNames) {
          const cityName = `${baseName} - ${billSteelCity}`;
          if (quarterlyAverageIndices[cityName] !== undefined) {
            quarterlyAverageIndices[baseName] = quarterlyAverageIndices[cityName];
          }
        }
      }
      
      // Populate unrestricted indices from measurement date's quarter
      if (measurementQuarterData) {
        for (const index of allIndices) {
          unrestrictedIndices[index.name] = measurementQuarterData.averages[index.name] || index.baseValue;
        }
      } else {
        for (const index of allIndices) {
          unrestrictedIndices[index.name] = index.baseValue;
        }
      }

      // Alias city-specific fuel for unrestricted indices too
      if (billFuelName !== 'MPNG Fuel' && unrestrictedIndices[billFuelName] !== undefined) {
        unrestrictedIndices['MPNG Fuel'] = unrestrictedIndices[billFuelName];
      }

      // Alias city-specific steel indices for unrestricted indices too
      if (billSteelCity && billSteelCity !== 'Chennai') {
        const steelBaseNames = ['Steel TMT Bars', 'Steel Angle/Channel', 'Steel Plates', 'Steel Other Sections'];
        for (const baseName of steelBaseNames) {
          const cityName = `${baseName} - ${billSteelCity}`;
          if (unrestrictedIndices[cityName] !== undefined) {
            unrestrictedIndices[baseName] = unrestrictedIndices[cityName];
          }
        }
      }
      
      // Apply 17B index caps if applicable
      // The capped values in the database are ALREADY the result of min(CurrentQuarterAvg, Index_L)
      // So we use them directly without applying Math.min again
      const is17BRestricted = bill.pvcCalculation.isIndexCapped && bill.pvcCalculation.isExtensionPeriod;
      if (is17BRestricted) {
        // Use the pre-calculated capped values directly
        // These are already the result of: UsedIndex = min(CurrentQuarterAvg, Index_L)
        if (bill.pvcCalculation.cappedLabourIndex !== undefined && bill.pvcCalculation.cappedLabourIndex !== null) {
          quarterlyAverageIndices['Labour'] = bill.pvcCalculation.cappedLabourIndex;
        }
        if (bill.pvcCalculation.cappedPlantIndex !== undefined && bill.pvcCalculation.cappedPlantIndex !== null) {
          quarterlyAverageIndices['RBI Plant Machinery'] = bill.pvcCalculation.cappedPlantIndex;
        }
        if (bill.pvcCalculation.cappedFuelIndex !== undefined && bill.pvcCalculation.cappedFuelIndex !== null) {
          // Set capped fuel index under both default and city-specific keys
          quarterlyAverageIndices['MPNG Fuel'] = bill.pvcCalculation.cappedFuelIndex;
          const billFuelKey = getFuelIndexNameForBill(bill.zone, bill.fuelPriceType);
          if (billFuelKey !== 'MPNG Fuel') {
            quarterlyAverageIndices[billFuelKey] = bill.pvcCalculation.cappedFuelIndex;
          }
        }
        if (bill.pvcCalculation.cappedMaterialsIndex !== undefined && bill.pvcCalculation.cappedMaterialsIndex !== null) {
          quarterlyAverageIndices['RBI Other Materials'] = bill.pvcCalculation.cappedMaterialsIndex;
        }
        if (bill.pvcCalculation.cappedCementIndex !== undefined && bill.pvcCalculation.cappedCementIndex !== null) {
          quarterlyAverageIndices['RBI Cement'] = bill.pvcCalculation.cappedCementIndex;
        }
        if (bill.pvcCalculation.cappedSteelIndex !== undefined && bill.pvcCalculation.cappedSteelIndex !== null) {
          quarterlyAverageIndices['Steel TMT Bars'] = bill.pvcCalculation.cappedSteelIndex;
          quarterlyAverageIndices['Steel Angle/Channel'] = bill.pvcCalculation.cappedSteelIndex;
          quarterlyAverageIndices['Steel Plates'] = bill.pvcCalculation.cappedSteelIndex;
          quarterlyAverageIndices['Steel Other Sections'] = bill.pvcCalculation.cappedSteelIndex;
        }
        if (bill.pvcCalculation.cappedExplosivesIndex !== undefined && bill.pvcCalculation.cappedExplosivesIndex !== null) {
          quarterlyAverageIndices['RBI Explosives'] = bill.pvcCalculation.cappedExplosivesIndex;
        }
      }
      
      // Check if we have multiple classification entries - if so, show PVC for each separately
      if (bill.classificationEntries && bill.classificationEntries.length > 0) {
        // SEPARATE PVC CALCULATION FOR EACH CLASSIFICATION
        
        // Calculate quarters for 17B restrictions
        let cappedQuarter = '';
        let cappedQuarterDate = '';
        if (is17BRestricted && bill.contract.originalCompletionDate) {
          cappedQuarter = getQuarterFromDate(new Date(bill.contract.originalCompletionDate), new Date(bill.contract.baseMonth));
          cappedQuarterDate = format(new Date(bill.contract.originalCompletionDate), 'dd MMM yyyy');
        }
        
        // For 17B restricted bills, show BOTH unrestricted and restricted calculations
        const calculationScenarios = is17BRestricted ? [
          { 
            title: "PVC CALCULATION BY CLASSIFICATION (WITHOUT 17B RESTRICTION)", 
            indices: unrestrictedIndices, 
            isRestricted: false,
            quarterInfo: `Using Measurement Quarter: ${measurementQuarter} (Measurement Date: ${format(new Date(bill.dateOfMeasurement), 'dd MMM yyyy')})`
          },
          { 
            title: "PVC CALCULATION BY CLASSIFICATION (WITH 17B RESTRICTION)", 
            indices: quarterlyAverageIndices, 
            isRestricted: true,
            quarterInfo: `Using Capped Quarter: ${cappedQuarter} (Original Completion: ${cappedQuarterDate})`
          }
        ] : [
          { 
            title: "PVC CALCULATION BY CLASSIFICATION", 
            indices: quarterlyAverageIndices, 
            isRestricted: false,
            quarterInfo: ''
          }
        ];
        
        // GCC-2022 Cl.46A: W excludes railway-supplied material. The stored engine
        // prices every entry on this reduced base; the PDF's own step-by-step used the
        // raw amounts, so its printed workings disagreed with the stored figure on any
        // bill that had railway-supplied materials. Display-only since the write-back
        // was removed, but a statement must show the W it was actually priced on.
        const pdfOutsidePvc = Math.max(0, Number(bill.railwaySuppliedMaterialValue || 0));
        const pdfEntriesTotal = bill.classificationEntries.reduce(
          (s: number, e: any) => s + (parseFloat(String(e.amount)) || 0), 0);
        const pdfPvcBaseFactor = pdfOutsidePvc > 0 && pdfEntriesTotal > pdfOutsidePvc
          ? (pdfEntriesTotal - pdfOutsidePvc) / pdfEntriesTotal
          : 1;

        // When a dedicated cement/steel amount exists, the pure-supply B/C-coded
        // entries carry that component through the dedicated calculation instead. The
        // stored engine zeroes them here; the PDF's own loop did not, so its printout
        // counted the same cement or steel twice.
        const hasDedicatedCementForPdf = (bill.cementAmount || 0) > 0;
        const hasDedicatedSteelForPdf =
          (bill.steelTmtBarsAmount || 0) > 0 ||
          (bill.steelAngleChannelAmount || 0) > 0 ||
          (bill.steelPlatesAmount || 0) > 0 ||
          (bill.steelOtherSectionsAmount || 0) > 0;

        for (const scenario of calculationScenarios) {
        pdf.setFontSize(17);
        pdf.setFont("helvetica", "bold");
        pdf.text(scenario.title, marginLeft, yPosition);
        yPosition += 10;
        
        // Add quarter information for 17B scenarios
        if (scenario.quarterInfo) {
          pdf.setFontSize(12);
          pdf.setFont("helvetica", "italic");
          pdf.setTextColor(100, 100, 100);
          pdf.text(scenario.quarterInfo, marginLeft, yPosition);
          pdf.setTextColor(0, 0, 0);
          pdf.setFont("helvetica", "normal");
          yPosition += 10;
        } else {
          yPosition += 2;
        }
        
        let grandTotalPvc = 0;
        
        // Track classification-based cement and steel PVC that are added to grandTotalPvc
        // This is needed to correctly replace them with dedicated amounts later
        let accumulatedClassificationCementPvc = 0;
        let accumulatedClassificationSteelPvc = 0;
        
        // Loop through each classification entry and calculate PVC separately
        for (let i = 0; i < bill.classificationEntries.length; i++) {
          const entry = bill.classificationEntries[i];
          const entryBilledAmount = parseFloat(String(entry.amount)) || 0;

          if (entryBilledAmount <= 0) continue;

          // W net of railway-supplied material — the base the stored engine prices on.
          const entryAmount = entryBilledAmount * pdfPvcBaseFactor;
          
          // Get the classification components
          const classificationComponents = entry.subClassification || entry.classification;
          
          if (!classificationComponents) continue;
          
          const classCode = classificationComponents.code;
          const className = classificationComponents.name;
          
          // Add section header for this classification
          checkNewPage(60);
          
          pdf.setFontSize(13);
          pdf.setFont("helvetica", "bold");
          pdf.text(`Classification ${i + 1}: ${classCode} - ${className}`, marginLeft, yPosition);
          yPosition += 7;
          
          pdf.setFontSize(12);
          pdf.setFont("helvetica", "normal");
          pdf.text(`Amount: ${entryBilledAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}${pdfPvcBaseFactor < 1 ? ` (PVC base: ${entryAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} — net of railway-supplied material)` : ''}`, marginLeft, yPosition);
          yPosition += 10;
          
          // Build PVC calculation table with detailed steps for this classification
          const pvcCalcData = [];
          let classificationTotalPvc = 0;
          
          // Helper function to map index name to capped field name
          const getCappedFieldName = (indexName: string): string => {
            const mapping: {[key: string]: string} = {
              'Labour': 'Labour',
              'RBI Plant Machinery': 'Plant',
              'MPNG Fuel': 'Fuel',
              'RBI Other Materials': 'Materials',
              'RBI Cement': 'Cement',
              'Steel TMT Bars': 'Steel',
              'Steel Angle/Channel': 'Steel',
              'Steel Plates': 'Steel',
              'Steel Other Sections': 'Steel',
              'RBI Explosives': 'Explosives'
            };
            return mapping[indexName] || '';
          };
          
          // Helper function to add component calculation to PDF (with detailed index info for 17B)
          const addComponentCalculation = (
            componentName: string, 
            componentPercent: number, 
            indexName: string,
            displayIndexName?: string
          ) => {
            if (componentPercent <= 0) return;
            
            // CRITICAL FIX: Round indices to 2 decimal places BEFORE calculation
            // This ensures the calculation matches the displayed formula exactly
            const avgIndexRaw = scenario.indices[indexName] || 0;
            const baseIndexRaw = baseIndexData[indexName] || 1;
            
            // Round to 2 decimal places for consistency
            const avgIndex = Math.round(avgIndexRaw * 100) / 100;
            const baseIndex = Math.round(baseIndexRaw * 100) / 100;
            
            // For 17B restricted scenario, we need to use the capped index (UsedIndex) for calculation
            let actualIndexToUse = avgIndex;
            let actualPvcAmount = 0;
            
            // For 17B restricted scenario, calculate using capped index
            if (is17BRestricted && scenario.isRestricted) {
              const currentQuarterAvgRaw = unrestrictedIndices[indexName] || 0;
              const currentQuarterAvg = Math.round(currentQuarterAvgRaw * 100) / 100;
              
              // Get the actual Index_L value from the database
              const indexLFieldName = 'indexL_' + getCappedFieldName(indexName);
              const indexL_ActualValueRaw = (bill.pvcCalculation as any)[indexLFieldName] || 0;
              const indexL_ActualValue = Math.round(indexL_ActualValueRaw * 100) / 100;
              
              // UsedIndex = min(CurrentQuarterAvg, Index_L) - this is what we use for calculation
              const usedIndexRaw = Math.min(currentQuarterAvg, indexL_ActualValue);
              const usedIndex = Math.round(usedIndexRaw * 100) / 100;
              actualIndexToUse = usedIndex;
              
              // Calculate PVC using the capped index (with rounded values)
              const calcWithCappedIndex = calculatePvcComponentWithSteps(
                entryAmount,
                usedIndex,
                baseIndex,
                componentPercent,
                componentName
              );
              actualPvcAmount = calcWithCappedIndex.finalPvc;
              
              pvcCalcData.push([
                `${componentName} (${componentPercent.toFixed(1)}%)`,
                baseIndex.toFixed(2),
                currentQuarterAvg.toFixed(2),
                indexL_ActualValue.toFixed(2),
                usedIndex.toFixed(2),
                actualPvcAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })
              ]);
            } else {
              // Standard calculation for non-17B bills or unrestricted scenario
              // Use rounded indices for calculation to match displayed formula
              const calcWithSteps = calculatePvcComponentWithSteps(
                entryAmount,
                avgIndex,
                baseIndex,
                componentPercent,
                componentName
              );
              actualPvcAmount = calcWithSteps.finalPvc;
              
              // Standard format for non-17B bills
              const formula = `${entryAmount.toLocaleString('en-IN')} × [(${avgIndex.toFixed(2)} - ${baseIndex.toFixed(2)}) ÷ ${baseIndex.toFixed(2)}] × ${componentPercent.toFixed(1)}%`;
              
              pvcCalcData.push([
                `${componentName} (${componentPercent.toFixed(1)}%)`,
                formula,
                actualPvcAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })
              ]);
            }
            
            classificationTotalPvc += actualPvcAmount;
            
            // Track classification-based cement and steel PVC separately
            if (componentName === 'Cement Component') {
              accumulatedClassificationCementPvc += actualPvcAmount;
            } else if (componentName === 'Steel Component' || componentName.includes('Steel')) {
              accumulatedClassificationSteelPvc += actualPvcAmount;
            }
            
            // Track component-wise PVC for financial impact comparison
            if (!componentBreakdown[componentName]) {
              componentBreakdown[componentName] = { unrestricted: 0, restricted: 0 };
            }
            if (scenario.isRestricted) {
              componentBreakdown[componentName].restricted += actualPvcAmount;
            } else {
              componentBreakdown[componentName].unrestricted += actualPvcAmount;
            }
          };
          
          if (classificationComponents.fixed > 0) {
            pvcCalcData.push([
              `Fixed Component (${classificationComponents.fixed.toFixed(1)}%)`,
              'Not subject to price variation',
              '0.00'
            ]);
          }
          
          if (classificationComponents.labour > 0) {
            addComponentCalculation('Labour', classificationComponents.labour, 'Labour');
          }
          
          if (classificationComponents.plantMachinery > 0) {
            addComponentCalculation('Plant Machinery & Spares', classificationComponents.plantMachinery, 'RBI Plant Machinery');
          }
          
          if (classificationComponents.fuel > 0) {
            addComponentCalculation('Fuel & Lubricants', classificationComponents.fuel, 'MPNG Fuel');
          }
          
          if (classificationComponents.otherMaterials > 0) {
            addComponentCalculation('Other Materials', classificationComponents.otherMaterials, 'RBI Other Materials');
          }
          
          if (classificationComponents.steel > 0
              && !(hasDedicatedSteelForPdf && String(classCode || '').toUpperCase().endsWith('B'))) {
            // Get steel types from the classification entry
            const steelTypesRaw = (Array.isArray(entry.steelTypes) ? entry.steelTypes : []) as string[];
            // No selected types means the GCC default: the average of all four JPC
            // types — which is what the stored engine prices. Defaulting to TMT alone
            // could flip the sign of the printed steel PVC.
            const steelTypes = steelTypesRaw.length > 0 ? steelTypesRaw : ['TMT', 'ANGLE_CHANNEL', 'PLATES', 'OTHER_SECTIONS'];
            
            // Map steel type enum to index names
            const steelTypeMap: { [key: string]: string } = {
              'TMT': 'Steel TMT Bars',
              'ANGLE_CHANNEL': 'Steel Angle/Channel',
              'PLATES': 'Steel Plates',
              'OTHER_SECTIONS': 'Steel Other Sections'
            };
            
            if (steelTypes.length === 0) {
              // Default to TMT Bars if no types selected
              addComponentCalculation('Steel Component', classificationComponents.steel, 'Steel TMT Bars');
            } else if (steelTypes.length === 1) {
              // Single steel type - use it directly
              const indexName = steelTypeMap[steelTypes[0]] || 'Steel TMT Bars';
              addComponentCalculation('Steel Component', classificationComponents.steel, indexName, indexName);
            } else {
              // Multiple steel types - calculate average
              const steelIndices: { baseValues: number[], currentValues: number[], names: string[] } = {
                baseValues: [],
                currentValues: [],
                names: []
              };
              
              steelTypes.forEach((type: string) => {
                const indexName = steelTypeMap[type];
                if (indexName) {
                  const baseVal = baseIndexData[indexName];
                  const currentVal = scenario.indices[indexName];
                  if (baseVal !== undefined && currentVal !== undefined) {
                    steelIndices.baseValues.push(baseVal);
                    steelIndices.currentValues.push(currentVal);
                    steelIndices.names.push(indexName);
                  }
                }
              });
              
              if (steelIndices.baseValues.length > 0) {
                // Calculate averages
                const avgBase = steelIndices.baseValues.reduce((sum, val) => sum + val, 0) / steelIndices.baseValues.length;
                const avgCurrent = steelIndices.currentValues.reduce((sum, val) => sum + val, 0) / steelIndices.currentValues.length;
                
                // Round to 2 decimal places
                const avgBaseRounded = Math.round(avgBase * 100) / 100;
                const avgCurrentRounded = Math.round(avgCurrent * 100) / 100;
                
                // Build the formula with steel type names
                const steelTypeNames = steelIndices.names.join(', ');
                
                // For non-17B or unrestricted scenario
                if (!is17BRestricted || !scenario.isRestricted) {
                  const variationRatio = avgBaseRounded !== 0 ? (avgCurrentRounded - avgBaseRounded) / avgBaseRounded : 0;
                  const pvcAmount = entryAmount * variationRatio * (classificationComponents.steel / 100);
                  
                  const formula = `${entryAmount.toLocaleString('en-IN')} × [(${avgCurrentRounded.toFixed(2)} - ${avgBaseRounded.toFixed(2)}) ÷ ${avgBaseRounded.toFixed(2)}] × ${classificationComponents.steel.toFixed(1)}% (Avg of: ${steelTypeNames})`;
                  
                  pvcCalcData.push([
                    `Steel Component (${classificationComponents.steel.toFixed(1)}%)`,
                    formula,
                    pvcAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })
                  ]);
                  
                  classificationTotalPvc += pvcAmount;
                  
                  // Track classification-based steel PVC
                  accumulatedClassificationSteelPvc += pvcAmount;
                  
                  if (!componentBreakdown['Steel Component']) {
                    componentBreakdown['Steel Component'] = { unrestricted: 0, restricted: 0 };
                  }
                  if (scenario.isRestricted) {
                    componentBreakdown['Steel Component'].restricted += pvcAmount;
                  } else {
                    componentBreakdown['Steel Component'].unrestricted += pvcAmount;
                  }
                } else {
                  // For 17B restricted scenario - calculate with capping
                  const currentQuarterAvgValues = steelIndices.names.map(name => unrestrictedIndices[name] || 0);
                  const currentQuarterAvg = Math.round((currentQuarterAvgValues.reduce((sum, val) => sum + val, 0) / currentQuarterAvgValues.length) * 100) / 100;
                  
                  // Get Index_L for steel (use first steel type's Index_L or generic)
                  const indexLFieldName = 'indexL_Steel';
                  const indexL_ActualValue = Math.round(((bill.pvcCalculation as any)[indexLFieldName] || 0) * 100) / 100;
                  
                  // UsedIndex = min(CurrentQuarterAvg, Index_L)
                  const usedIndex = Math.round(Math.min(currentQuarterAvg, indexL_ActualValue) * 100) / 100;
                  
                  // Calculate PVC using the capped index
                  const calcWithCappedIndex = calculatePvcComponentWithSteps(
                    entryAmount,
                    usedIndex,
                    avgBaseRounded,
                    classificationComponents.steel,
                    'Steel Component'
                  );
                  const pvcAmount = calcWithCappedIndex.finalPvc;
                  
                  pvcCalcData.push([
                    `Steel Component (${classificationComponents.steel.toFixed(1)}%) (Avg of: ${steelTypeNames})`,
                    avgBaseRounded.toFixed(2),
                    currentQuarterAvg.toFixed(2),
                    indexL_ActualValue.toFixed(2),
                    usedIndex.toFixed(2),
                    pvcAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })
                  ]);
                  
                  classificationTotalPvc += pvcAmount;
                  
                  // Track classification-based steel PVC
                  accumulatedClassificationSteelPvc += pvcAmount;
                  
                  if (!componentBreakdown['Steel Component']) {
                    componentBreakdown['Steel Component'] = { unrestricted: 0, restricted: 0 };
                  }
                  if (scenario.isRestricted) {
                    componentBreakdown['Steel Component'].restricted += pvcAmount;
                  } else {
                    componentBreakdown['Steel Component'].unrestricted += pvcAmount;
                  }
                }
              } else {
                // Fallback to TMT Bars if no valid indices found
                addComponentCalculation('Steel Component', classificationComponents.steel, 'Steel TMT Bars');
              }
            }
          }
          
          if (classificationComponents.cement > 0
              && !(hasDedicatedCementForPdf && String(classCode || '').toUpperCase().endsWith('C'))) {
            addComponentCalculation('Cement Component', classificationComponents.cement, 'RBI Cement');
          }
          
          if (classificationComponents.explosives > 0) {
            addComponentCalculation('Explosives Component', classificationComponents.explosives, 'RBI Explosives');
          }
          
          // Add subtotal row for this classification
          pvcCalcData.push([
            { content: `SUBTOTAL PVC FOR ${classCode}`, colSpan: 2, styles: { fontStyle: 'bold', halign: 'right' } },
            { content: classificationTotalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 }), styles: { fontStyle: 'bold' } }
          ]);
          
          grandTotalPvc += classificationTotalPvc;
          
          // Display the table with appropriate headers based on 17B restriction status
          const tableHeaders = (is17BRestricted && scenario.isRestricted) 
            ? [['Component', 'Base Index', 'Curr_Qtr_Avg', 'Index_L', 'Used Index', 'PVC Amount']]
            : [['Component', 'Formula', 'PVC Amount']];
            
          const tableColumnStyles = (is17BRestricted && scenario.isRestricted)
            ? {
                0: { cellWidth: contentWidth * 0.20, halign: 'left', fontStyle: 'bold' },
                1: { cellWidth: contentWidth * 0.12, halign: 'center', fontSize: 10 },
                2: { cellWidth: contentWidth * 0.14, halign: 'center', fontSize: 10 },
                3: { cellWidth: contentWidth * 0.12, halign: 'center', fontSize: 10 },
                4: { cellWidth: contentWidth * 0.14, halign: 'center', fontSize: 12, fontStyle: 'bold' },
                5: { cellWidth: contentWidth * 0.28, halign: 'right', fontStyle: 'bold' }
              }
            : {
                0: { cellWidth: contentWidth * 0.22, halign: 'left', fontStyle: 'bold' },
                1: { cellWidth: contentWidth * 0.58, halign: 'left', fontSize: 11 },
                2: { cellWidth: contentWidth * 0.20, halign: 'right', fontStyle: 'bold' }
              };
          
          pdf.autoTable({
            startY: yPosition,
            head: tableHeaders,
            body: pvcCalcData,
            theme: 'grid',
            headStyles: { 
              fontStyle: 'bold',
              fontSize: 13,
              halign: 'center'
            },
            styles: { 
              fontSize: 12, 
              cellPadding: 2.5,
              lineColor: [0, 0, 0],
              lineWidth: 0.3
            },
            margin: { left: marginLeft, right: marginRight },
            tableWidth: contentWidth,
            columnStyles: tableColumnStyles
          });
          
          yPosition = pdf.lastAutoTable.finalY + 8;
          
          // Add GCC compliance note for 17B restricted scenario
          if (is17BRestricted && scenario.isRestricted) {
            checkNewPage(30);
            pdf.setFontSize(13);
            pdf.setFont("helvetica", "italic");
            pdf.setTextColor(80, 80, 80);
            
            // Get the Index_L month for display
            const originalCompletionDate = new Date(bill.contract.originalCompletionDate!);
            const indexLMonth = format(originalCompletionDate, 'MMM yyyy');
            
            const noteText = `Index_L Calculation Mode: Strict Single-Month (${indexLMonth}). Used Index is calculated as minimum of Current Quarter Average and Index_L as per GCC 2022 ACS-2 Clause 46A.10(b). This ensures indices beyond the last month of original completion are not considered for upward variation.`;
            const noteLines = pdf.splitTextToSize(noteText, contentWidth - 10);
            pdf.text(noteLines, marginLeft + 5, yPosition);
            yPosition += (noteLines.length * 6) + 10;
            
            // Check for provisional data (Index_L values that equal base values or are zero)
            const indexLFields = ['indexL_Labour', 'indexL_Plant', 'indexL_Fuel', 'indexL_Materials', 'indexL_Cement', 'indexL_Steel', 'indexL_Explosives'];
            const missingIndexLData = indexLFields.filter(field => {
              const value = (bill.pvcCalculation as any)[field];
              return value === 0 || value === null || value === undefined;
            });
            
            if (missingIndexLData.length > 0) {
              checkNewPage(40);
              pdf.setFillColor(255, 250, 205); // Light yellow background
              pdf.rect(marginLeft, yPosition, contentWidth, 25, 'F');
              pdf.setDrawColor(255, 193, 7); // Amber border
              pdf.setLineWidth(1);
              pdf.rect(marginLeft, yPosition, contentWidth, 25);
              
              yPosition += 7;
              pdf.setFontSize(12);
              pdf.setFont("helvetica", "bold");
              pdf.setTextColor(184, 134, 11); // Dark goldenrod
              pdf.text("⚠ PROVISIONAL DATA NOTICE", marginLeft + 5, yPosition);
              
              yPosition += 7;
              pdf.setFontSize(10);
              pdf.setFont("helvetica", "italic");
              const provisionalText = `Some Index_L values are missing or zero. This report uses base values as fallback and should be revised once actual ${indexLMonth} index data becomes available.`;
              const provisionalLines = pdf.splitTextToSize(provisionalText, contentWidth - 10);
              pdf.text(provisionalLines, marginLeft + 5, yPosition);
              yPosition += (provisionalLines.length * 4) + 12;
            }
            
            pdf.setTextColor(0, 0, 0);
            pdf.setFont("helvetica", "normal");
          } else {
            yPosition += 7;
          }
        }
        
        // Add detailed calculation steps section (if enabled in template)
        if (templateSettings.fields.pvcCalculation.showCalculationSteps !== false) {
        checkNewPage(100);
        pdf.setFontSize(17);
        pdf.setFont("helvetica", "bold");
        const detailedStepsTitle = scenario.isRestricted 
          ? "DETAILED CALCULATION STEPS (WITH 17B RESTRICTION)"
          : "DETAILED CALCULATION STEPS (WITHOUT 17B RESTRICTION)";
        pdf.text(detailedStepsTitle, marginLeft, yPosition);
        yPosition += 7;
        
        // Add purpose description
        pdf.setFontSize(13);
        pdf.setFont("helvetica", "italic");
        pdf.setTextColor(80, 80, 80);
        const purposeText = scenario.isRestricted
          ? "This section provides step-by-step calculations using capped indices as per GCC 17B restrictions for audit and verification purposes."
          : "This section provides step-by-step calculations using unrestricted measurement quarter indices for audit and verification purposes.";
        const purposeLines = pdf.splitTextToSize(purposeText, contentWidth - 20);
        pdf.text(purposeLines, marginLeft, yPosition);
        pdf.setTextColor(0, 0, 0);
        pdf.setFont("helvetica", "normal");
        yPosition += purposeLines.length * 4 + 6;
        
        // Show step-by-step calculations for each classification
        for (let i = 0; i < bill.classificationEntries.length; i++) {
          const entry = bill.classificationEntries[i];
          const entryBilledAmount = parseFloat(String(entry.amount)) || 0;

          if (entryBilledAmount <= 0) continue;

          // W net of railway-supplied material — the base the stored engine prices on.
          const entryAmount = entryBilledAmount * pdfPvcBaseFactor;
          
          const classificationComponents = entry.subClassification || entry.classification;
          if (!classificationComponents) continue;
          
          const classCode = classificationComponents.code;
          const className = classificationComponents.name;
          
          checkNewPage(80);
          
          pdf.setFontSize(14);
          pdf.setFont("helvetica", "bold");
          pdf.text(`Calculation Steps for ${classCode} - ${className}`, marginLeft, yPosition);
          yPosition += 10;
          
          pdf.setFontSize(13);
          pdf.setFont("helvetica", "normal");
          
          // Helper function to get capped index field name
          const getCappedFieldName = (indexName: string): string => {
            const mapping: {[key: string]: string} = {
              'Labour': 'Labour',
              'RBI Plant Machinery': 'Plant',
              'MPNG Fuel': 'Fuel',
              'RBI Other Materials': 'Materials',
              'RBI Cement': 'Cement',
              'Steel TMT Bars': 'Steel',
              'Steel Angle/Channel': 'Steel',
              'Steel Plates': 'Steel',
              'Steel Other Sections': 'Steel',
              'RBI Explosives': 'Explosives'
            };
            return mapping[indexName] || '';
          };
          
          // Helper to get the UsedIndex value (capped value for 17B or quarterly avg for non-17B)
          const getUsedIndex = (indexName: string): number => {
            // For 17B restricted scenarios, use the capped value from database
            if (is17BRestricted && scenario.isRestricted) {
              const cappedFieldName = 'capped' + getCappedFieldName(indexName) + 'Index';
              const cappedValue = (bill.pvcCalculation as any)[cappedFieldName];
              if (cappedValue !== undefined && cappedValue !== null) {
                return cappedValue;
              }
            }
            // For non-restricted scenarios, use the quarterly average
            return scenario.indices[indexName] || 0;
          };
          
          // Helper to add detailed step breakdown in compact table format
          // Helper to calculate component details (returns data without rendering)
          const getComponentCalculation = (
            componentName: string,
            componentPercent: number,
            indexName: string
          ): { name: string; percent: number; pvc: number; data: any[] } | null => {
            if (componentPercent <= 0) return null;
            
            // CRITICAL FIX: Round indices to 2 decimal places to match display and ensure consistency
            // Indices are published with 2 decimal precision, so we must use exactly 2 decimals in calculations
            const usedIndexRaw = getUsedIndex(indexName);
            const baseIndexRaw = baseIndexData[indexName] || 1;
            const usedIndex = Math.round(usedIndexRaw * 100) / 100;
            const baseIndex = Math.round(baseIndexRaw * 100) / 100;
            
            const indexDiff = usedIndex - baseIndex;
            const variationRatio = indexDiff / baseIndex;
            const componentAmount = entryAmount * variationRatio;
            const finalPVC = componentAmount * (componentPercent / 100);
            
            const indexLabel = scenario.isRestricted ? 'UsedIdx (17B)' : 'Curr Qtr Idx';
            
            return {
              name: componentName,
              percent: componentPercent,
              pvc: finalPVC,
              data: [
                ['Bill Amt', entryAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })],
                [indexLabel, usedIndex],
                ['Base Idx', baseIndex],
                ['Idx Diff', `${usedIndex} - ${baseIndex} = ${indexDiff}`],
                ['Var Ratio', `${indexDiff} ÷ ${baseIndex} = ${variationRatio}`],
                ['Comp Amt', `${entryAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} × ${variationRatio}`],
                ['', `= ${componentAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`],
                ['Apply %', `${componentAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} × ${componentPercent}%`],
                [{ content: 'Final PVC', styles: { fontStyle: 'bold', fillColor: [240, 248, 255] } }, 
                 { content: finalPVC.toLocaleString('en-IN', { maximumFractionDigits: 2 }), styles: { fontStyle: 'bold', fillColor: [240, 248, 255] } }]
              ]
            };
          };
          
          // Collect all component calculations
          const components: Array<{ name: string; percent: number; pvc: number; data: any[] }> = [];
          
          if (classificationComponents.labour > 0) {
            const calc = getComponentCalculation('Labour', classificationComponents.labour, 'Labour');
            if (calc) components.push(calc);
          }
          if (classificationComponents.plantMachinery > 0) {
            const calc = getComponentCalculation('Plant & Machinery', classificationComponents.plantMachinery, 'RBI Plant Machinery');
            if (calc) components.push(calc);
          }
          if (classificationComponents.fuel > 0) {
            const calc = getComponentCalculation('Fuel & Lubricants', classificationComponents.fuel, 'MPNG Fuel');
            if (calc) components.push(calc);
          }
          if (classificationComponents.otherMaterials > 0) {
            const calc = getComponentCalculation('Other Materials', classificationComponents.otherMaterials, 'RBI Other Materials');
            if (calc) components.push(calc);
          }
          if (classificationComponents.steel > 0
              && !(hasDedicatedSteelForPdf && String(classCode || '').toUpperCase().endsWith('B'))) {
            // Get steel types from the classification entry
            const steelTypesRaw = (Array.isArray(entry.steelTypes) ? entry.steelTypes : []) as string[];
            // No selected types means the GCC default: the average of all four JPC
            // types — which is what the stored engine prices. Defaulting to TMT alone
            // could flip the sign of the printed steel PVC.
            const steelTypes = steelTypesRaw.length > 0 ? steelTypesRaw : ['TMT', 'ANGLE_CHANNEL', 'PLATES', 'OTHER_SECTIONS'];
            
            // Map steel type enum to index names
            const steelTypeMap: { [key: string]: string } = {
              'TMT': 'Steel TMT Bars',
              'ANGLE_CHANNEL': 'Steel Angle/Channel',
              'PLATES': 'Steel Plates',
              'OTHER_SECTIONS': 'Steel Other Sections'
            };
            
            if (steelTypes.length === 0) {
              // Default to TMT Bars if no types selected
              const calc = getComponentCalculation('Steel', classificationComponents.steel, 'Steel TMT Bars');
              if (calc) components.push(calc);
            } else if (steelTypes.length === 1) {
              // Single steel type - use it directly
              const indexName = steelTypeMap[steelTypes[0]] || 'Steel TMT Bars';
              const calc = getComponentCalculation(`Steel (${indexName})`, classificationComponents.steel, indexName);
              if (calc) components.push(calc);
            } else {
              // Multiple steel types - calculate average
              const steelIndices: { baseValues: number[], currentValues: number[], names: string[] } = {
                baseValues: [],
                currentValues: [],
                names: []
              };
              
              steelTypes.forEach((type: string) => {
                const indexName = steelTypeMap[type];
                if (indexName) {
                  const baseVal = baseIndexData[indexName];
                  const currentVal = getUsedIndex(indexName);
                  if (baseVal !== undefined && currentVal !== undefined) {
                    steelIndices.baseValues.push(baseVal);
                    steelIndices.currentValues.push(currentVal);
                    steelIndices.names.push(indexName);
                  }
                }
              });
              
              if (steelIndices.baseValues.length > 0) {
                // Calculate averages
                const avgBase = steelIndices.baseValues.reduce((sum, val) => sum + val, 0) / steelIndices.baseValues.length;
                const avgCurrent = steelIndices.currentValues.reduce((sum, val) => sum + val, 0) / steelIndices.currentValues.length;
                
                // Round to 2 decimal places
                const avgBaseRounded = Math.round(avgBase * 100) / 100;
                const avgCurrentRounded = Math.round(avgCurrent * 100) / 100;
                
                // Calculate PVC
                const indexDiff = avgCurrentRounded - avgBaseRounded;
                const variationRatio = indexDiff / avgBaseRounded;
                const componentAmount = entryAmount * variationRatio;
                const finalPVC = componentAmount * (classificationComponents.steel / 100);
                
                const indexLabel = scenario.isRestricted ? 'UsedIdx (17B)' : 'Curr Qtr Idx';
                const steelTypeNames = steelIndices.names.join(', ');
                
                components.push({
                  name: `Steel (Avg of: ${steelTypeNames})`,
                  percent: classificationComponents.steel,
                  pvc: finalPVC,
                  data: [
                    ['Bill Amt', entryAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })],
                    [indexLabel, avgCurrentRounded],
                    ['Base Idx', avgBaseRounded],
                    ['Idx Diff', `${avgCurrentRounded} - ${avgBaseRounded} = ${indexDiff}`],
                    ['Var Ratio', `${indexDiff} ÷ ${avgBaseRounded} = ${variationRatio}`],
                    ['Comp Amt', `${entryAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} × ${variationRatio}`],
                    ['', `= ${componentAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`],
                    ['Apply %', `${componentAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} × ${classificationComponents.steel}%`],
                    [{ content: 'Final PVC', styles: { fontStyle: 'bold', fillColor: [240, 248, 255] } }, 
                     { content: finalPVC.toLocaleString('en-IN', { maximumFractionDigits: 2 }), styles: { fontStyle: 'bold', fillColor: [240, 248, 255] } }]
                  ]
                });
              } else {
                // Fallback to TMT Bars if no valid indices found
                const calc = getComponentCalculation('Steel', classificationComponents.steel, 'Steel TMT Bars');
                if (calc) components.push(calc);
              }
            }
          }
          if (classificationComponents.cement > 0
              && !(hasDedicatedCementForPdf && String(classCode || '').toUpperCase().endsWith('C'))) {
            const calc = getComponentCalculation('Cement', classificationComponents.cement, 'RBI Cement');
            if (calc) components.push(calc);
          }
          if (classificationComponents.explosives > 0) {
            const calc = getComponentCalculation('Explosives', classificationComponents.explosives, 'RBI Explosives');
            if (calc) components.push(calc);
          }
          
          // Render components in side-by-side layout (2 columns)
          for (let i = 0; i < components.length; i += 2) {
            checkNewPage(50);
            
            const comp1 = components[i];
            const comp2 = components[i + 1];
            
            // Calculate column widths for side-by-side layout
            const gap = 6;
            const tableWidth = comp2 ? (contentWidth - gap) / 2 : contentWidth;
            
            // Render first component
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(13);
            pdf.text(`${comp1.name} (${comp1.percent}%):`, marginLeft, yPosition);
            
            // Render second component header if exists
            if (comp2) {
              const comp2X = marginLeft + tableWidth + gap;
              pdf.text(`${comp2.name} (${comp2.percent}%):`, comp2X, yPosition);
            }
            yPosition += 6;
            
            // Render first component table
            pdf.autoTable({
              startY: yPosition,
              body: comp1.data,
              theme: 'grid',
              styles: { 
                fontSize: 12, 
                cellPadding: 2.5,
                lineColor: [0, 0, 0],
                lineWidth: 0.25
              },
              margin: { left: marginLeft, right: comp2 ? pageWidth - marginLeft - tableWidth : marginRight },
              tableWidth: tableWidth,
              columnStyles: {
                0: { cellWidth: tableWidth * 0.35, halign: 'left', fontStyle: 'bold' },
                1: { cellWidth: tableWidth * 0.65, halign: 'right', fontSize: 12 }
              }
            });
            
            const table1FinalY = pdf.lastAutoTable.finalY;
            
            // Render second component table if exists
            if (comp2) {
              const comp2X = marginLeft + tableWidth + gap;
              pdf.autoTable({
                startY: yPosition,
                body: comp2.data,
                theme: 'grid',
                styles: { 
                  fontSize: 12, 
                  cellPadding: 2.5,
                  lineColor: [0, 0, 0],
                  lineWidth: 0.25
                },
                margin: { left: comp2X, right: marginRight },
                tableWidth: tableWidth,
                columnStyles: {
                  0: { cellWidth: tableWidth * 0.35, halign: 'left', fontStyle: 'bold' },
                  1: { cellWidth: tableWidth * 0.65, halign: 'right', fontSize: 12 }
                }
              });
              
              const table2FinalY = pdf.lastAutoTable.finalY;
              yPosition = Math.max(table1FinalY, table2FinalY) + 8;
            } else {
              yPosition = table1FinalY + 8;
            }
          }
          
          yPosition += 10;
        }
        
        // Grand total will be shown at the end of the report
        yPosition += 10;
        } // End of showCalculationSteps check
        
        // ================================================================================
        // CRITICAL: TOTAL PVC CALCULATION - CORRECTED LOGIC
        // ================================================================================
        // Classification-based and dedicated components should be SUMMED, not replaced.
        // Formula: TotalPVC = classification (all components) + dedicated cement + dedicated steel
        //
        // The grandTotalPvc currently includes ALL classification components (Labour, Plant, Fuel, Materials, Cement, Steel, Explosives)
        // Dedicated cement/steel are ADDITIONAL amounts that should be ADDED to the total
        // ================================================================================
        const dedicatedCementPvc = bill.pvcCalculation.dedicatedCementPvc || 0;
        const dedicatedSteelPvc = bill.pvcCalculation.dedicatedSteelPvc || 0;
        
        // ADD dedicated components to the total (they are already separate from classification-based)
        // Classification cement/steel remains in grandTotalPvc
        // Dedicated cement/steel is ADDED on top
        grandTotalPvc = grandTotalPvc + dedicatedCementPvc + dedicatedSteelPvc;
        
        // Capture the calculated total for this scenario
        if (scenario.isRestricted) {
          calculatedRestrictedTotal = grandTotalPvc;
        } else {
          calculatedUnrestrictedTotal = grandTotalPvc;
        }
        
        // Add spacing between scenarios
        if (scenario.isRestricted === false && is17BRestricted) {
          yPosition += 18;
          checkNewPage(100);
        }
        
        } // End of scenario loop
        
      } else if (workClassification) {
        // LEGACY: Single classification (old approach)
        const classificationInfo = ` (As per Classification ${workClassification.code})`;
        const pvcCalcData = [];
        
        if (workClassification.fixed > 0) {
          pvcCalcData.push([
            `Fixed Component (${workClassification.fixed}%)${classificationInfo}`,
            'Not subject to price variation',
            '0.00'
          ]);
        }
        if (workClassification.labour > 0) {
          pvcCalcData.push([
            `Labour (${workClassification.labour}%)${classificationInfo}`,
            `${bill.billAmount.toLocaleString('en-IN')} × [(${quarterlyAverageIndices['Labour']?.toFixed(2) || '0.00'} - ${baseIndexData['Labour']?.toFixed(2) || '0.00'}) ÷ ${baseIndexData['Labour']?.toFixed(2) || '0.00'}] × ${workClassification.labour}%`,
            (bill.pvcCalculation.labourPvc || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
          ]);
        }
        if (workClassification.plantMachinery > 0) {
          pvcCalcData.push([
            `Plant Machinery & Spares (${workClassification.plantMachinery}%)${classificationInfo}`,
            `${bill.billAmount.toLocaleString('en-IN')} × [(${quarterlyAverageIndices['RBI Plant Machinery']?.toFixed(2) || '0.00'} - ${baseIndexData['RBI Plant Machinery']?.toFixed(2) || '0.00'}) ÷ ${baseIndexData['RBI Plant Machinery']?.toFixed(2) || '0.00'}] × ${workClassification.plantMachinery}%`,
            (bill.pvcCalculation.plantMachineryPvc || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
          ]);
        }
        if (workClassification.fuel > 0) {
          pvcCalcData.push([
            `Fuel & Lubricants (${workClassification.fuel}%)${classificationInfo}`,
            `${bill.billAmount.toLocaleString('en-IN')} × [(${quarterlyAverageIndices['MPNG Fuel']?.toFixed(2) || '0.00'} - ${baseIndexData['MPNG Fuel']?.toFixed(2) || '0.00'}) ÷ ${baseIndexData['MPNG Fuel']?.toFixed(2) || '0.00'}] × ${workClassification.fuel}%`,
            (bill.pvcCalculation.fuelPowerPvc || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
          ]);
        }
        if (workClassification.otherMaterials > 0) {
          pvcCalcData.push([
            `Other Materials (${workClassification.otherMaterials}%)${classificationInfo}`,
            `${bill.billAmount.toLocaleString('en-IN')} × [(${quarterlyAverageIndices['RBI Other Materials']?.toFixed(2) || '0.00'} - ${baseIndexData['RBI Other Materials']?.toFixed(2) || '0.00'}) ÷ ${baseIndexData['RBI Other Materials']?.toFixed(2) || '0.00'}] × ${workClassification.otherMaterials}%`,
            (bill.pvcCalculation.otherMaterialsPvc || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
          ]);
        }
        if (workClassification.steel > 0) {
          pvcCalcData.push([
            `Steel Component (${workClassification.steel}%)${classificationInfo}`,
            `${bill.billAmount.toLocaleString('en-IN')} × [(${quarterlyAverageIndices['Steel TMT Bars']?.toFixed(0) || '0'} - ${baseIndexData['Steel TMT Bars']?.toFixed(0) || '0'}) ÷ ${baseIndexData['Steel TMT Bars']?.toFixed(0) || '0'}] × ${workClassification.steel}%`,
            (bill.pvcCalculation.steelPvc || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
          ]);
        }
        if (workClassification.cement > 0) {
          pvcCalcData.push([
            `Cement Component (${workClassification.cement}%)${classificationInfo}`,
            `${bill.billAmount.toLocaleString('en-IN')} × [(${quarterlyAverageIndices['RBI Cement']?.toFixed(2) || '0.00'} - ${baseIndexData['RBI Cement']?.toFixed(2) || '0.00'}) ÷ ${baseIndexData['RBI Cement']?.toFixed(2) || '0.00'}] × ${workClassification.cement}%`,
            (bill.pvcCalculation.cementPvc || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
          ]);
        }
        if (workClassification.explosives > 0) {
          pvcCalcData.push([
            `Explosives Component (${workClassification.explosives}%)${classificationInfo}`,
            `${bill.billAmount.toLocaleString('en-IN')} × [(${quarterlyAverageIndices['RBI Explosives']?.toFixed(2) || '0.00'} - ${baseIndexData['RBI Explosives']?.toFixed(2) || '0.00'}) ÷ ${baseIndexData['RBI Explosives']?.toFixed(2) || '0.00'}] × ${workClassification.explosives}%`,
            (bill.pvcCalculation.explosivesPvc || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
          ]);
        }

        pdf.autoTable({
          startY: yPosition,
          head: [['Component', 'Calculation Formula', 'PVC Amount']],
          body: pvcCalcData,
          theme: 'grid',
          headStyles: { 
            
            
            fontStyle: 'bold',
            fontSize: 13,
            halign: 'center'
          },
          styles: { 
            fontSize: 12, 
            cellPadding: 4,
            lineColor: [0, 0, 0],
            lineWidth: 0.5
          },
          margin: { left: marginLeft, right: marginRight },
          tableWidth: contentWidth,
          columnStyles: {
            0: { cellWidth: contentWidth * 0.22, fontStyle: 'bold', halign: 'left' },
            1: { cellWidth: contentWidth * 0.58, halign: 'left' },
            2: { cellWidth: contentWidth * 0.20, halign: 'right', fontStyle: 'bold' }
          }
        });

        yPosition = pdf.lastAutoTable.finalY + 12;
        
        // Add detailed calculation steps for single classification (if enabled in template)
        if (templateSettings.fields.pvcCalculation.showCalculationSteps !== false) {
        checkNewPage(100);
        pdf.setFontSize(17);
        pdf.setFont("helvetica", "bold");
        const detailedStepsTitle = is17BRestricted 
          ? "DETAILED CALCULATION STEPS (WITH 17B RESTRICTION)"
          : "DETAILED CALCULATION STEPS";
        pdf.text(detailedStepsTitle, marginLeft, yPosition);
        yPosition += 7;
        
        // Add purpose description
        pdf.setFontSize(13);
        pdf.setFont("helvetica", "italic");
        pdf.setTextColor(80, 80, 80);
        const purposeText = is17BRestricted
          ? "This section provides step-by-step calculations using capped indices as per GCC 17B restrictions for audit and verification purposes."
          : "This section provides step-by-step calculations using measurement quarter indices for audit and verification purposes.";
        const purposeLines = pdf.splitTextToSize(purposeText, contentWidth - 20);
        pdf.text(purposeLines, marginLeft, yPosition);
        pdf.setTextColor(0, 0, 0);
        pdf.setFont("helvetica", "normal");
        yPosition += purposeLines.length * 4 + 6;
        
        pdf.setFontSize(14);
        pdf.setFont("helvetica", "bold");
        pdf.text(`Calculation Steps for ${workClassification.code} - ${workClassification.name}`, marginLeft, yPosition);
        yPosition += 10;
        
        pdf.setFontSize(13);
        pdf.setFont("helvetica", "normal");
        
        // Helper to calculate component details (returns data without rendering)
        const getComponentCalculation = (
          componentName: string,
          componentPercent: number,
          indexName: string
        ): { name: string; percent: number; pvc: number; data: any[] } | null => {
          if (componentPercent <= 0) return null;
          
          // CRITICAL FIX: Round indices to 2 decimal places to match display and ensure consistency
          // Indices are published with 2 decimal precision, so we must use exactly 2 decimals in calculations
          const usedIndexRaw = quarterlyAverageIndices[indexName] || 0;
          const baseIndexRaw = baseIndexData[indexName] || 1;
          const usedIndex = Math.round(usedIndexRaw * 100) / 100;
          const baseIndex = Math.round(baseIndexRaw * 100) / 100;
          
          // Determine if this is using 17B capped index
          const is17BCappedForComponent = is17BRestricted && bill.contract.originalCompletionDate && bill.contract.extensions && bill.contract.extensions.length > 0;
          const indexLabel = is17BCappedForComponent 
            ? 'UsedIdx (17B)'
            : 'UsedIdx (Curr Qtr)';
          
          const indexDiff = usedIndex - baseIndex;
          const variationRatio = indexDiff / baseIndex;
          const componentAmount = bill.billAmount * variationRatio;
          const finalPVC = componentAmount * (componentPercent / 100);
          
          return {
            name: componentName,
            percent: componentPercent,
            pvc: finalPVC,
            data: [
              ['Bill Amt (A)', bill.billAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })],
              ['Base Idx (B)', baseIndex],
              [{ content: indexLabel + ' (C)', styles: { fontStyle: 'bold', fillColor: [240, 248, 255] } }, 
               { content: usedIndex, styles: { fontStyle: 'bold', fillColor: [240, 248, 255] } }],
              ['Idx Diff (C-B)', `${usedIndex} - ${baseIndex} = ${indexDiff}`],
              ['Var Ratio', `${indexDiff} ÷ ${baseIndex} = ${variationRatio}`],
              ['Comp Amt', `${bill.billAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} × ${variationRatio}`],
              ['', `= ${componentAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`],
              ['Apply %', `${componentAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} × ${componentPercent}%`],
              [{ content: 'Final PVC', styles: { fontStyle: 'bold', fillColor: [255, 255, 224] } }, 
               { content: finalPVC.toLocaleString('en-IN', { maximumFractionDigits: 2 }), styles: { fontStyle: 'bold', fillColor: [255, 255, 224] } }]
            ]
          };
        };
        
        // Collect all component calculations
        const components: Array<{ name: string; percent: number; pvc: number; data: any[] }> = [];
        
        if (workClassification.labour > 0) {
          const calc = getComponentCalculation('Labour', workClassification.labour, 'Labour');
          if (calc) components.push(calc);
        }
        if (workClassification.plantMachinery > 0) {
          const calc = getComponentCalculation('Plant & Machinery', workClassification.plantMachinery, 'RBI Plant Machinery');
          if (calc) components.push(calc);
        }
        if (workClassification.fuel > 0) {
          const calc = getComponentCalculation('Fuel & Lubricants', workClassification.fuel, 'MPNG Fuel');
          if (calc) components.push(calc);
        }
        if (workClassification.otherMaterials > 0) {
          const calc = getComponentCalculation('Other Materials', workClassification.otherMaterials, 'RBI Other Materials');
          if (calc) components.push(calc);
        }
        if (workClassification.steel > 0) {
          const calc = getComponentCalculation('Steel', workClassification.steel, 'Steel TMT Bars');
          if (calc) components.push(calc);
        }
        if (workClassification.cement > 0) {
          const calc = getComponentCalculation('Cement', workClassification.cement, 'RBI Cement');
          if (calc) components.push(calc);
        }
        if (workClassification.explosives > 0) {
          const calc = getComponentCalculation('Explosives', workClassification.explosives, 'RBI Explosives');
          if (calc) components.push(calc);
        }
        
        // Render components in side-by-side layout (2 columns)
        for (let i = 0; i < components.length; i += 2) {
          checkNewPage(50);
          
          const comp1 = components[i];
          const comp2 = components[i + 1];
          
          // Calculate column widths for side-by-side layout
          const gap = 6;
          const tableWidth = comp2 ? (contentWidth - gap) / 2 : contentWidth;
          
          // Render first component
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(13);
          pdf.text(`${comp1.name} (${comp1.percent}%):`, marginLeft, yPosition);
          
          // Render second component header if exists
          if (comp2) {
            const comp2X = marginLeft + tableWidth + gap;
            pdf.text(`${comp2.name} (${comp2.percent}%):`, comp2X, yPosition);
          }
          yPosition += 6;
          
          // Render first component table
          pdf.autoTable({
            startY: yPosition,
            body: comp1.data,
            theme: 'grid',
            styles: { 
              fontSize: 12, 
              cellPadding: 2.5,
              lineColor: [0, 0, 0],
              lineWidth: 0.25
            },
            margin: { left: marginLeft, right: comp2 ? pageWidth - marginLeft - tableWidth : marginRight },
            tableWidth: tableWidth,
            columnStyles: {
              0: { cellWidth: tableWidth * 0.35, halign: 'left', fontStyle: 'bold' },
              1: { cellWidth: tableWidth * 0.65, halign: 'right', fontSize: 12 }
            }
          });
          
          const table1FinalY = pdf.lastAutoTable.finalY;
          
          // Render second component table if exists
          if (comp2) {
            const comp2X = marginLeft + tableWidth + gap;
            pdf.autoTable({
              startY: yPosition,
              body: comp2.data,
              theme: 'grid',
              styles: { 
                fontSize: 12, 
                cellPadding: 2.5,
                lineColor: [0, 0, 0],
                lineWidth: 0.25
              },
              margin: { left: comp2X, right: marginRight },
              tableWidth: tableWidth,
              columnStyles: {
                0: { cellWidth: tableWidth * 0.35, halign: 'left', fontStyle: 'bold' },
                1: { cellWidth: tableWidth * 0.65, halign: 'right', fontSize: 12 }
              }
            });
            
            const table2FinalY = pdf.lastAutoTable.finalY;
            yPosition = Math.max(table1FinalY, table2FinalY) + 8;
          } else {
            yPosition = table1FinalY + 8;
          }
        }
        
        yPosition += 10;
        } // End of showCalculationSteps check for single classification
        
      } else {
        // Default/legacy calculation display (no classification)
        const pvcCalcData = [];
        pvcCalcData.push([
          'Labour (50%)',
          `${bill.billAmount.toLocaleString('en-IN')} × [(${quarterlyAverageIndices['Labour']?.toFixed(2) || '0.00'} - ${baseIndexData['Labour']?.toFixed(2) || '0.00'}) ÷ ${baseIndexData['Labour']?.toFixed(2) || '0.00'}] × 50%`,
          (bill.pvcCalculation.labourPvc || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
        ]);
        pvcCalcData.push([
          'Plant Machinery & Spares (15%)',
          `${bill.billAmount.toLocaleString('en-IN')} × [(${quarterlyAverageIndices['RBI Plant Machinery']?.toFixed(2) || '0.00'} - ${baseIndexData['RBI Plant Machinery']?.toFixed(2) || '0.00'}) ÷ ${baseIndexData['RBI Plant Machinery']?.toFixed(2) || '0.00'}] × 15%`,
          (bill.pvcCalculation.plantMachineryPvc || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
        ]);
        pvcCalcData.push([
          'Fuel & Lubricants (15%)',
          `${bill.billAmount.toLocaleString('en-IN')} × [(${quarterlyAverageIndices['MPNG Fuel']?.toFixed(2) || '0.00'} - ${baseIndexData['MPNG Fuel']?.toFixed(2) || '0.00'}) ÷ ${baseIndexData['MPNG Fuel']?.toFixed(2) || '0.00'}] × 15%`,
          (bill.pvcCalculation.fuelPowerPvc || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
        ]);
        pvcCalcData.push([
          'Other Materials (5%)',
          `${bill.billAmount.toLocaleString('en-IN')} × [(${quarterlyAverageIndices['RBI Other Materials']?.toFixed(2) || '0.00'} - ${baseIndexData['RBI Other Materials']?.toFixed(2) || '0.00'}) ÷ ${baseIndexData['RBI Other Materials']?.toFixed(2) || '0.00'}] × 5%`,
          (bill.pvcCalculation.otherMaterialsPvc || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
        ]);

        pdf.autoTable({
          startY: yPosition,
          head: [['Component', 'Calculation Formula', 'PVC Amount']],
          body: pvcCalcData,
          theme: 'grid',
          headStyles: { 
            
            
            fontStyle: 'bold',
            fontSize: 13,
            halign: 'center'
          },
          styles: { 
            fontSize: 12, 
            cellPadding: 4,
            lineColor: [0, 0, 0],
            lineWidth: 0.5
          },
          margin: { left: marginLeft, right: marginRight },
          tableWidth: contentWidth,
          columnStyles: {
            0: { cellWidth: contentWidth * 0.22, fontStyle: 'bold', halign: 'left' },
            1: { cellWidth: contentWidth * 0.58, halign: 'left' },
            2: { cellWidth: contentWidth * 0.20, halign: 'right', fontStyle: 'bold' }
          }
        });

        yPosition = pdf.lastAutoTable.finalY + 12;
      }

      // Add separate detailed sections for cement and steel calculations
      // Get quarterly averages for detailed calculations - use zone-based steel city prices
      const pdfSteelIndexNames = getSteelIndexNamesForZone(bill.zone);
      const pdfFuelIndexName = getFuelIndexNameForBill(bill.zone, bill.fuelPriceType);
      const allIndicesNames = [
        'Labour', 'RBI Plant Machinery', pdfFuelIndexName, 'RBI Other Materials',
        'RBI Cement', 'RBI Explosives',
        ...pdfSteelIndexNames
      ];
      
      let detailedQuarterlyAverages: any[] = [];
      try {
        detailedQuarterlyAverages = await getQuarterlyAverages(bill.quarter, allIndicesNames, bill.contract.baseMonth, 'auto');
      } catch (error) {
        console.error('Error getting quarterly averages for detailed calculations:', error);
        detailedQuarterlyAverages = [];
      }

      // CEMENT WORK SECTION - Separate Table Format
      if (bill.cementAmount && bill.cementAmount > 0) {
        // Calculate quarters for 17B restrictions
        let cappedQuarterForCement = '';
        let cappedQuarterDateForCement = '';
        if (is17BRestricted && bill.contract.originalCompletionDate) {
          cappedQuarterForCement = getQuarterFromDate(new Date(bill.contract.originalCompletionDate), new Date(bill.contract.baseMonth));
          cappedQuarterDateForCement = format(new Date(bill.contract.originalCompletionDate), 'dd MMM yyyy');
        }
        
        // For 17B restricted bills, show BOTH unrestricted and restricted calculations
        const cementScenarios = is17BRestricted ? [
          { 
            title: "CEMENT CALCULATION (WITHOUT 17B RESTRICTION)", 
            quarter: measurementQuarter,
            quarterInfo: `Using Measurement Quarter: ${measurementQuarter} (Measurement Date: ${format(new Date(bill.dateOfMeasurement), 'dd MMM yyyy')})`
          },
          { 
            title: "CEMENT CALCULATION (WITH 17B RESTRICTION)", 
            quarter: cappedQuarterForCement,
            quarterInfo: `Using Capped Quarter: ${cappedQuarterForCement} (Original Completion: ${cappedQuarterDateForCement})`,
            isRestricted: true
          }
        ] : [
          { 
            title: "CEMENT CALCULATION", 
            quarter: measurementQuarter,
            quarterInfo: ''
          }
        ];
        
        for (const cementScenario of cementScenarios) {
        checkNewPage(80);
        
        // Section header
        pdf.setFontSize(17);
        pdf.setFont("helvetica", "bold");
        pdf.text(cementScenario.title, marginLeft, yPosition);
        yPosition += 10;
        
        // Add quarter information for 17B scenarios
        if (cementScenario.quarterInfo) {
          pdf.setFontSize(12);
          pdf.setFont("helvetica", "italic");
          pdf.setTextColor(100, 100, 100);
          pdf.text(cementScenario.quarterInfo, marginLeft, yPosition);
          pdf.setTextColor(0, 0, 0);
          pdf.setFont("helvetica", "normal");
          yPosition += 10;
        } else {
          yPosition += 2;
        }
        
        // Get quarterly averages for the appropriate quarter
        let cementQuarterlyAverages: any[] = [];
        try {
          cementQuarterlyAverages = await getQuarterlyAverages(cementScenario.quarter, allIndicesNames, bill.contract.baseMonth, 'auto');
        } catch (error) {
          console.error('Error getting quarterly averages for cement calculation:', error);
          cementQuarterlyAverages = [];
        }
        
        // Get detailed cement calculation
        const cementDetails = calculateDedicatedCementPvcWithSteps(bill.cementAmount, cementQuarterlyAverages);
        
        if (cementDetails) {
          // Calculate the PVC for this scenario
          let cementPvc = cementDetails.finalPvc;
          let cementFormula = '';
          
          // For 17B restricted scenario, use capped index
          if (is17BRestricted && cementScenario.isRestricted) {
            // Get capped cement index from database
            const cappedCementIndex = (bill.pvcCalculation as any).cappedCementIndex || cementDetails.averageIndex;
            const indexL_Cement = (bill.pvcCalculation as any).indexL_Cement || 0;
            
            // Calculate with capped index
            const indexDiff = cappedCementIndex - cementDetails.baseIndex;
            const variationRatio = indexDiff / cementDetails.baseIndex;
            const variationAmount = bill.cementAmount * variationRatio;
            cementPvc = variationAmount * 0.85;
            
            // Show formula with capped index
            cementFormula = `${bill.cementAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} × [(${cappedCementIndex.toFixed(2)} - ${cementDetails.baseIndex.toFixed(2)}) ÷ ${cementDetails.baseIndex.toFixed(2)}] × 85%`;
          } else {
            // Unrestricted formula
            cementFormula = `${bill.cementAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} × [(${cementDetails.averageIndex.toFixed(2)} - ${cementDetails.baseIndex.toFixed(2)}) ÷ ${cementDetails.baseIndex.toFixed(2)}] × 85%`;
          }
          
          // Cement calculation table - matching user's format
          const cementTableData = [
            [
              'Cement (85%)',
              cementFormula,
              cementPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })
            ]
          ];

          pdf.autoTable({
            startY: yPosition,
            head: [['Component', 'Calculation', 'PVC Amount']],
            body: cementTableData,
            theme: 'grid',
            headStyles: { 
              
              
              fontStyle: 'bold',
              fontSize: 13,
              halign: 'center'
            },
            styles: { 
              fontSize: 13, 
              cellPadding: 6,
              lineColor: [0, 0, 0],
              lineWidth: 0.8
            },
            margin: { left: marginLeft, right: marginRight },
            tableWidth: contentWidth,
            columnStyles: {
              0: { cellWidth: contentWidth * 0.25, fontStyle: 'bold', halign: 'left' },
              1: { cellWidth: contentWidth * 0.50, halign: 'center' },
              2: { cellWidth: contentWidth * 0.25, halign: 'right', fontStyle: 'bold' }
            }
          });
          
          yPosition = pdf.lastAutoTable.finalY + 10;
          
          // Add detailed calculation steps for cement in compact table format (if enabled in template)
          if (templateSettings.fields.pvcCalculation.showCalculationSteps !== false) {
          checkNewPage(60);
          
          pdf.setFontSize(13);
          pdf.setFont("helvetica", "bold");
          pdf.text("Detailed Calculation Steps for Cement:", marginLeft, yPosition);
          yPosition += 7;
          
          // Use appropriate index for calculation steps
          const cementIndexForCalc = (is17BRestricted && cementScenario.isRestricted) 
            ? ((bill.pvcCalculation as any).cappedCementIndex || cementDetails.averageIndex)
            : cementDetails.averageIndex;
          
          // Determine index label based on scenario
          const cementIndexLabel = (is17BRestricted && cementScenario.isRestricted) 
            ? 'Used Index (17B Capped)'
            : 'Used Index (Current Quarter Avg)';
          
          // CRITICAL FIX: Use exact precision for calculations but show consistent display values
          // The full precision values ensure accuracy, but we show rounded values for clarity
          const indexDiff = cementIndexForCalc - cementDetails.baseIndex;
          const variationRatio = indexDiff / cementDetails.baseIndex;
          const variationAmount = bill.cementAmount * variationRatio;
          const finalCementPVC = variationAmount * 0.85;
          
          // For display: Show ONLY 2 DECIMAL PLACES to maintain consistency
          // This ensures readable and consistent display while maintaining calculation accuracy
          const displayIndexDiff = Math.round(indexDiff * 100) / 100;  // 2 decimal places
          const displayBaseIndex = Math.round(cementDetails.baseIndex * 100) / 100;  // 2 decimal places
          const displayCementIndex = Math.round(cementIndexForCalc * 100) / 100;  // 2 decimal places
          
          const cementCalculationData = [
            ['Cement Work Amount (A)', bill.cementAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })],
            ['Base Month Cement Index (B)', displayBaseIndex],
            [{ content: cementIndexLabel + ' (C)', styles: { fontStyle: 'bold', fillColor: [240, 248, 255] } }, { content: displayCementIndex, styles: { fontStyle: 'bold', fillColor: [240, 248, 255] } }],
            ['Step 1: Index Difference (C - B)', `${displayCementIndex} - ${displayBaseIndex} = ${displayIndexDiff}`],
            ['Step 2: Variation Ratio (C - B) ÷ B', `${displayIndexDiff} ÷ ${displayBaseIndex} = ${variationRatio}`],
            ['Step 3: Variation Amount A × Ratio', `${bill.cementAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} × ${variationRatio} = ${variationAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`],
            ['Step 4: Apply 85% Component', `${variationAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} × 85% = ${finalCementPVC.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`],
            [{ content: 'Final Dedicated Cement PVC', styles: { fontStyle: 'bold', fillColor: [255, 255, 224] } }, { content: finalCementPVC.toLocaleString('en-IN', { maximumFractionDigits: 2 }), styles: { fontStyle: 'bold', fillColor: [255, 255, 224] } }]
          ];
          
          pdf.autoTable({
            startY: yPosition,
            body: cementCalculationData,
            theme: 'grid',
            styles: { 
              fontSize: 12, 
              cellPadding: 2.5,
              lineColor: [0, 0, 0],
              lineWidth: 0.3
            },
            margin: { left: marginLeft + 5, right: marginRight },
            tableWidth: contentWidth - 10,
            columnStyles: {
              0: { cellWidth: (contentWidth - 10) * 0.40, halign: 'left', fontStyle: 'bold' },
              1: { cellWidth: (contentWidth - 10) * 0.60, halign: 'right' }
            }
          });
          
          yPosition = pdf.lastAutoTable.finalY + 8;
          } // End of showCalculationSteps check for cement
        } else {
          // Show cement section even if calculation details are missing
          const cementTableData = [
            [
              'Cement (85%)',
              'Unable to calculate - cement indices may be missing',
              (bill.pvcCalculation.dedicatedCementPvc || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
            ]
          ];

          pdf.autoTable({
            startY: yPosition,
            head: [['Component', 'Calculation', 'PVC Amount']],
            body: cementTableData,
            theme: 'grid',
            headStyles: { 
              
              
              fontStyle: 'bold',
              fontSize: 13,
              halign: 'center'
            },
            styles: { 
              fontSize: 13, 
              cellPadding: 6,
              lineColor: [0, 0, 0],
              lineWidth: 0.8
            },
            margin: { left: marginLeft, right: marginRight },
            tableWidth: contentWidth,
            columnStyles: {
              0: { cellWidth: contentWidth * 0.25, fontStyle: 'bold', halign: 'left' },
              1: { cellWidth: contentWidth * 0.50, halign: 'center' },
              2: { cellWidth: contentWidth * 0.25, halign: 'right', fontStyle: 'bold' }
            }
          });
          
          yPosition = pdf.lastAutoTable.finalY + 10;
        }
        } // End of cementScenario loop
      }

      // STEEL WORK SECTION - Separate Tables by Component Type
      // Check if using individual steel components or legacy single steel amount
      const hasIndividualSteelComponents = 
        (bill.steelTmtBarsAmount && bill.steelTmtBarsAmount > 0) ||
        (bill.steelAngleChannelAmount && bill.steelAngleChannelAmount > 0) ||
        (bill.steelPlatesAmount && bill.steelPlatesAmount > 0) ||
        (bill.steelOtherSectionsAmount && bill.steelOtherSectionsAmount > 0);
      
      if (hasIndividualSteelComponents) {
        // NEW: Show individual steel component calculations in SEPARATE TABLES
        
        // Steel Component mapping
        const steelComponents = [
          { 
            name: 'TMT Bars', 
            displayName: 'TMT Steel',
            amount: bill.steelTmtBarsAmount || 0, 
            pvc: bill.pvcCalculation.dedicatedSteelTmtBarsPvc || 0,
            indexName: 'Steel TMT Bars'
          },
          { 
            name: 'Angle/Channel', 
            displayName: 'Structural Steel',
            amount: bill.steelAngleChannelAmount || 0, 
            pvc: bill.pvcCalculation.dedicatedSteelAngleChannelPvc || 0,
            indexName: 'Steel Angle/Channel'
          },
          { 
            name: 'Plates', 
            displayName: 'MS Steel',
            amount: bill.steelPlatesAmount || 0, 
            pvc: bill.pvcCalculation.dedicatedSteelPlatesPvc || 0,
            indexName: 'Steel Plates'
          },
          { 
            name: 'Other Sections', 
            displayName: 'Other Section',
            amount: bill.steelOtherSectionsAmount || 0, 
            pvc: bill.pvcCalculation.dedicatedSteelOtherSectionsPvc || 0,
            indexName: 'Steel Other Sections'
          }
        ];
        
        // Calculate quarters for 17B restrictions
        let cappedQuarterForSteel = '';
        let cappedQuarterDateForSteel = '';
        if (is17BRestricted && bill.contract.originalCompletionDate) {
          cappedQuarterForSteel = getQuarterFromDate(new Date(bill.contract.originalCompletionDate), new Date(bill.contract.baseMonth));
          cappedQuarterDateForSteel = format(new Date(bill.contract.originalCompletionDate), 'dd MMM yyyy');
        }
        
        // For 17B restricted bills, show BOTH unrestricted and restricted calculations
        const steelScenarios = is17BRestricted ? [
          { 
            title: "STEEL CALCULATION (WITHOUT 17B RESTRICTION)", 
            quarter: measurementQuarter,
            quarterInfo: `Using Measurement Quarter: ${measurementQuarter} (Measurement Date: ${format(new Date(bill.dateOfMeasurement), 'dd MMM yyyy')})`
          },
          { 
            title: "STEEL CALCULATION (WITH 17B RESTRICTION)", 
            quarter: cappedQuarterForSteel,
            quarterInfo: `Using Capped Quarter: ${cappedQuarterForSteel} (Original Completion: ${cappedQuarterDateForSteel})`,
            isRestricted: true
          }
        ] : [
          { 
            title: "STEEL CALCULATION", 
            quarter: measurementQuarter,
            quarterInfo: ''
          }
        ];
        
        for (const steelScenario of steelScenarios) {
          // Get quarterly averages for the appropriate quarter
          let steelQuarterlyAverages: any[] = [];
          try {
            steelQuarterlyAverages = await getQuarterlyAverages(steelScenario.quarter, allIndicesNames, bill.contract.baseMonth, 'auto');
          } catch (error) {
            console.error('Error getting quarterly averages for steel calculation:', error);
            steelQuarterlyAverages = [];
          }
          
          // Create a separate table for each steel component type
          for (const component of steelComponents) {
            if (component.amount > 0) {
              checkNewPage(80);
              
              // Section header
              pdf.setFontSize(17);
              pdf.setFont("helvetica", "bold");
              const scenarioSuffix = is17BRestricted ? (steelScenario.isRestricted ? ' (WITH 17B RESTRICTION)' : ' (WITHOUT 17B RESTRICTION)') : '';
              pdf.text(`${component.displayName.toUpperCase()} CALCULATION${scenarioSuffix}`, marginLeft, yPosition);
              yPosition += 10;
              
              // Add quarter information for 17B scenarios
              if (steelScenario.quarterInfo) {
                pdf.setFontSize(12);
                pdf.setFont("helvetica", "italic");
                pdf.setTextColor(100, 100, 100);
                pdf.text(steelScenario.quarterInfo, marginLeft, yPosition);
                pdf.setTextColor(0, 0, 0);
                pdf.setFont("helvetica", "normal");
                yPosition += 10;
              } else {
                yPosition += 2;
              }
              
              // Get steel calculation details
              const steelDetails = calculateDedicatedSteelPvcWithSteps(
                component.amount, 
                steelQuarterlyAverages, 
                component.indexName
              );
              
              const steelTableData: any[] = [];
              
              if (steelDetails) {
                // Calculate the PVC for this scenario
                let steelPvc = steelDetails.finalPvc;
                let steelFormula = '';
                
                // For 17B restricted scenario, use capped index
                if (is17BRestricted && steelScenario.isRestricted) {
                  // Get capped steel index from database
                  const cappedSteelIndex = (bill.pvcCalculation as any).cappedSteelIndex || steelDetails.averageIndex;
                  
                  // Calculate with capped index
                  const indexDiff = cappedSteelIndex - steelDetails.baseIndex;
                  const variationRatio = indexDiff / steelDetails.baseIndex;
                  const variationAmount = component.amount * variationRatio;
                  steelPvc = variationAmount * 0.85;
                  
                  // Show formula with capped index
                  steelFormula = `${component.amount.toLocaleString('en-IN', { maximumFractionDigits: 1 })} × [(${cappedSteelIndex.toFixed(2)} - ${steelDetails.baseIndex.toFixed(2)}) ÷ ${steelDetails.baseIndex.toFixed(2)}] × 85%`;
                } else {
                  // Unrestricted formula
                  steelFormula = `${component.amount.toLocaleString('en-IN', { maximumFractionDigits: 1 })} × [(${steelDetails.averageIndex.toFixed(2)} - ${steelDetails.baseIndex.toFixed(2)}) ÷ ${steelDetails.baseIndex.toFixed(2)}] × 85%`;
                }
                
                steelTableData.push([
                  `${component.displayName} (85%)`,
                  steelFormula,
                  steelPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })
                ]);
              } else {
                steelTableData.push([
                  `${component.displayName} (85%)`,
                  'Unable to calculate - steel indices may be missing',
                  component.pvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })
                ]);
              }
              
              pdf.autoTable({
                startY: yPosition,
                head: [['Component', 'Calculation', 'PVC Amount']],
                body: steelTableData,
                theme: 'grid',
                headStyles: { 
                  fontStyle: 'bold',
                  fontSize: 13,
                  halign: 'center'
                },
                styles: { 
                  fontSize: 13, 
                  cellPadding: 6,
                  lineColor: [0, 0, 0],
                  lineWidth: 0.8
                },
                margin: { left: marginLeft, right: marginRight },
                tableWidth: contentWidth,
                columnStyles: {
                  0: { cellWidth: contentWidth * 0.25, fontStyle: 'bold', halign: 'left' },
                  1: { cellWidth: contentWidth * 0.50, halign: 'center' },
                  2: { cellWidth: contentWidth * 0.25, halign: 'right', fontStyle: 'bold' }
                }
              });
              
              yPosition = pdf.lastAutoTable.finalY + 10;
            
            // Add detailed calculation steps for this steel component in compact table format (if enabled in template)
            if (templateSettings.fields.pvcCalculation.showCalculationSteps !== false && steelDetails) {
              checkNewPage(60);
              
              pdf.setFontSize(13);
              pdf.setFont("helvetica", "bold");
              pdf.text(`Detailed Calculation Steps for ${component.displayName}:`, marginLeft, yPosition);
              yPosition += 7;
              
              // Use appropriate index for calculation steps
              const steelIndexForCalc = (is17BRestricted && steelScenario.isRestricted) 
                ? ((bill.pvcCalculation as any).cappedSteelIndex || steelDetails.averageIndex)
                : steelDetails.averageIndex;
              
              // Determine index label based on scenario
              const steelIndexLabel = (is17BRestricted && steelScenario.isRestricted) 
                ? 'Used Index (17B Capped)'
                : 'Used Index (Current Quarter Avg)';
              
              const steelIndexDiff = steelIndexForCalc - steelDetails.baseIndex;
              const steelVariationRatio = steelIndexDiff / steelDetails.baseIndex;
              const steelVariationAmount = component.amount * steelVariationRatio;
              const finalSteelPVC = steelVariationAmount * 0.85;
              
              // For display: Show ONLY 2 DECIMAL PLACES to maintain consistency
              // This ensures readable and consistent display while maintaining calculation accuracy
              const displaySteelIndexDiff = Math.round(steelIndexDiff * 100) / 100;  // 2 decimal places
              const displaySteelBaseIndex = Math.round(steelDetails.baseIndex * 100) / 100;  // 2 decimal places
              const displaySteelIndex = Math.round(steelIndexForCalc * 100) / 100;  // 2 decimal places
              
              const steelCalculationData = [
                [`${component.displayName} Amount (A)`, component.amount.toLocaleString('en-IN', { maximumFractionDigits: 1 })],
                [`Base Month ${component.name} Index (B)`, displaySteelBaseIndex],
                [{ content: steelIndexLabel + ' (C)', styles: { fontStyle: 'bold', fillColor: [240, 248, 255] } }, { content: displaySteelIndex, styles: { fontStyle: 'bold', fillColor: [240, 248, 255] } }],
                ['Step 1: Index Difference (C - B)', `${displaySteelIndex} - ${displaySteelBaseIndex} = ${displaySteelIndexDiff}`],
                ['Step 2: Variation Ratio (C - B) ÷ B', `${displaySteelIndexDiff} ÷ ${displaySteelBaseIndex} = ${steelVariationRatio}`],
                ['Step 3: Variation Amount A × Ratio', `${component.amount.toLocaleString('en-IN', { maximumFractionDigits: 1 })} × ${steelVariationRatio} = ${steelVariationAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`],
                ['Step 4: Apply 85% Component', `${steelVariationAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} × 85% = ${finalSteelPVC.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`],
                [{ content: `Final ${component.displayName} PVC`, styles: { fontStyle: 'bold', fillColor: [255, 255, 224] } }, { content: finalSteelPVC.toLocaleString('en-IN', { maximumFractionDigits: 2 }), styles: { fontStyle: 'bold', fillColor: [255, 255, 224] } }]
              ];
              
              pdf.autoTable({
                startY: yPosition,
                body: steelCalculationData,
                theme: 'grid',
                styles: { 
                  fontSize: 12, 
                  cellPadding: 2.5,
                  lineColor: [0, 0, 0],
                  lineWidth: 0.3
                },
                margin: { left: marginLeft + 5, right: marginRight },
                tableWidth: contentWidth - 10,
                columnStyles: {
                  0: { cellWidth: (contentWidth - 10) * 0.40, halign: 'left', fontStyle: 'bold' },
                  1: { cellWidth: (contentWidth - 10) * 0.60, halign: 'right' }
                }
              });
              
              yPosition = pdf.lastAutoTable.finalY + 8;
            }
          }
        }
        } // End of steelScenario loop
        
      } else if (bill.steelAmount && bill.steelAmount > 0) {
        // LEGACY: Single steel amount calculation
        
        // Calculate quarters for 17B restrictions
        let cappedQuarterForLegacySteel = '';
        let cappedQuarterDateForLegacySteel = '';
        if (is17BRestricted && bill.contract.originalCompletionDate) {
          cappedQuarterForLegacySteel = getQuarterFromDate(new Date(bill.contract.originalCompletionDate), new Date(bill.contract.baseMonth));
          cappedQuarterDateForLegacySteel = format(new Date(bill.contract.originalCompletionDate), 'dd MMM yyyy');
        }
        
        // For 17B restricted bills, show BOTH unrestricted and restricted calculations
        const legacySteelScenarios = is17BRestricted ? [
          { 
            title: "STEEL CALCULATION (WITHOUT 17B RESTRICTION)", 
            quarter: measurementQuarter,
            quarterInfo: `Using Measurement Quarter: ${measurementQuarter} (Measurement Date: ${format(new Date(bill.dateOfMeasurement), 'dd MMM yyyy')})`
          },
          { 
            title: "STEEL CALCULATION (WITH 17B RESTRICTION)", 
            quarter: cappedQuarterForLegacySteel,
            quarterInfo: `Using Capped Quarter: ${cappedQuarterForLegacySteel} (Original Completion: ${cappedQuarterDateForLegacySteel})`,
            isRestricted: true
          }
        ] : [
          { 
            title: "STEEL CALCULATION", 
            quarter: measurementQuarter,
            quarterInfo: ''
          }
        ];
        
        for (const legacySteelScenario of legacySteelScenarios) {
        checkNewPage(80);
        
        // Section header
        pdf.setFontSize(17);
        pdf.setFont("helvetica", "bold");
        pdf.text(legacySteelScenario.title, marginLeft, yPosition);
        yPosition += 10;
        
        // Add quarter information for 17B scenarios
        if (legacySteelScenario.quarterInfo) {
          pdf.setFontSize(12);
          pdf.setFont("helvetica", "italic");
          pdf.setTextColor(100, 100, 100);
          pdf.text(legacySteelScenario.quarterInfo, marginLeft, yPosition);
          pdf.setTextColor(0, 0, 0);
          pdf.setFont("helvetica", "normal");
          yPosition += 10;
        } else {
          yPosition += 2;
        }
        
        // Get quarterly averages for the appropriate quarter
        let legacySteelQuarterlyAverages: any[] = [];
        try {
          legacySteelQuarterlyAverages = await getQuarterlyAverages(legacySteelScenario.quarter, allIndicesNames, bill.contract.baseMonth, 'auto');
        } catch (error) {
          console.error('Error getting quarterly averages for legacy steel calculation:', error);
          legacySteelQuarterlyAverages = [];
        }
        
        // Get detailed steel calculation
        const steelDetails = calculateDedicatedSteelPvcWithSteps(bill.steelAmount, legacySteelQuarterlyAverages, bill.selectedSteelComponent || undefined);
        
        if (steelDetails) {
          // Calculate the PVC for this scenario
          let steelPvc = steelDetails.finalPvc;
          let legacySteelFormula = '';
          
          // For 17B restricted scenario, use capped index
          if (is17BRestricted && legacySteelScenario.isRestricted) {
            // Get capped steel index from database
            const cappedSteelIndex = (bill.pvcCalculation as any).cappedSteelIndex || steelDetails.averageIndex;
            
            // Calculate with capped index
            const indexDiff = cappedSteelIndex - steelDetails.baseIndex;
            const variationRatio = indexDiff / steelDetails.baseIndex;
            const variationAmount = bill.steelAmount * variationRatio;
            steelPvc = variationAmount * 0.85;
            
            // Show formula with capped index
            legacySteelFormula = `${bill.steelAmount.toLocaleString('en-IN', { maximumFractionDigits: 1 })} × [(${cappedSteelIndex.toFixed(2)} - ${steelDetails.baseIndex.toFixed(2)}) ÷ ${steelDetails.baseIndex.toFixed(2)}] × 85%`;
          } else {
            // Unrestricted formula
            legacySteelFormula = `${bill.steelAmount.toLocaleString('en-IN', { maximumFractionDigits: 1 })} × [(${steelDetails.averageIndex.toFixed(2)} - ${steelDetails.baseIndex.toFixed(2)}) ÷ ${steelDetails.baseIndex.toFixed(2)}] × 85%`;
          }
          
          // Steel calculation table - matching user's format
          const steelTableData = [
            [
              'Steel (85%)',
              legacySteelFormula,
              steelPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 })
            ]
          ];

          pdf.autoTable({
            startY: yPosition,
            head: [['Component', 'Calculation', 'PVC Amount']],
            body: steelTableData,
            theme: 'grid',
            headStyles: { 
              
              
              fontStyle: 'bold',
              fontSize: 13,
              halign: 'center'
            },
            styles: { 
              fontSize: 13, 
              cellPadding: 6,
              lineColor: [0, 0, 0],
              lineWidth: 0.8
            },
            margin: { left: marginLeft, right: marginRight },
            tableWidth: contentWidth,
            columnStyles: {
              0: { cellWidth: contentWidth * 0.25, fontStyle: 'bold', halign: 'left' },
              1: { cellWidth: contentWidth * 0.50, halign: 'center' },
              2: { cellWidth: contentWidth * 0.25, halign: 'right', fontStyle: 'bold' }
            }
          });
          
          yPosition = pdf.lastAutoTable.finalY + 10;
          
          // Add detailed calculation steps for legacy steel in compact table format (if enabled in template)
          if (templateSettings.fields.pvcCalculation.showCalculationSteps !== false) {
          checkNewPage(60);
          
          pdf.setFontSize(13);
          pdf.setFont("helvetica", "bold");
          pdf.text("Detailed Calculation Steps for Steel:", marginLeft, yPosition);
          yPosition += 7;
          
          // Use appropriate index for calculation steps
          const legacySteelIndexForCalc = (is17BRestricted && legacySteelScenario.isRestricted) 
            ? ((bill.pvcCalculation as any).cappedSteelIndex || steelDetails.averageIndex)
            : steelDetails.averageIndex;
          
          // Determine index label
          const legacySteelIndexLabel = (is17BRestricted && legacySteelScenario.isRestricted) 
            ? 'Used Index (17B Capped)'
            : 'Used Index (Current Quarter Avg)';
          
          const legacySteelIndexDiff = legacySteelIndexForCalc - steelDetails.baseIndex;
          const legacySteelVariationRatio = legacySteelIndexDiff / steelDetails.baseIndex;
          const legacySteelVariationAmount = bill.steelAmount * legacySteelVariationRatio;
          const legacyFinalSteelPVC = legacySteelVariationAmount * 0.85;
          
          // Show more precision for legacy steel indices to match cement/steel display
          const displayLegacySteelIndexDiff = legacySteelIndexDiff;  // Full precision
          const displayLegacySteelBaseIndex = steelDetails.baseIndex;  // Full precision
          const displayLegacySteelIndex = legacySteelIndexForCalc;  // Full precision
          
          const legacySteelCalculationData = [
            ['Steel Work Amount (A)', bill.steelAmount.toLocaleString('en-IN', { maximumFractionDigits: 1 })],
            ['Base Month Steel Index (B)', displayLegacySteelBaseIndex],
            [{ content: legacySteelIndexLabel + ' (C)', styles: { fontStyle: 'bold', fillColor: [240, 248, 255] } }, { content: displayLegacySteelIndex, styles: { fontStyle: 'bold', fillColor: [240, 248, 255] } }],
            ['Step 1: Index Difference (C - B)', `${displayLegacySteelIndex} - ${displayLegacySteelBaseIndex} = ${displayLegacySteelIndexDiff}`],
            ['Step 2: Variation Ratio (C - B) ÷ B', `${displayLegacySteelIndexDiff} ÷ ${displayLegacySteelBaseIndex} = ${legacySteelVariationRatio}`],
            ['Step 3: Variation Amount A × Ratio', `${bill.steelAmount.toLocaleString('en-IN', { maximumFractionDigits: 1 })} × ${legacySteelVariationRatio} = ${legacySteelVariationAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`],
            ['Step 4: Apply 85% Component', `${legacySteelVariationAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} × 85% = ${legacyFinalSteelPVC.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`],
            [{ content: 'Final Dedicated Steel PVC', styles: { fontStyle: 'bold', fillColor: [255, 255, 224] } }, { content: legacyFinalSteelPVC.toLocaleString('en-IN', { maximumFractionDigits: 2 }), styles: { fontStyle: 'bold', fillColor: [255, 255, 224] } }]
          ];
          
          pdf.autoTable({
            startY: yPosition,
            body: legacySteelCalculationData,
            theme: 'grid',
            styles: { 
              fontSize: 12, 
              cellPadding: 2.5,
              lineColor: [0, 0, 0],
              lineWidth: 0.3
            },
            margin: { left: marginLeft + 5, right: marginRight },
            tableWidth: contentWidth - 10,
            columnStyles: {
              0: { cellWidth: (contentWidth - 10) * 0.40, halign: 'left', fontStyle: 'bold' },
              1: { cellWidth: (contentWidth - 10) * 0.60, halign: 'right' }
            }
          });
          
          yPosition = pdf.lastAutoTable.finalY + 8;
          } // End of showCalculationSteps check for legacy steel
        } else {
          // Show steel section even if calculation details are missing
          const steelTableData = [
            [
              'Steel (85%)',
              'Unable to calculate - steel indices may be missing',
              (bill.pvcCalculation.dedicatedSteelPvc || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
            ]
          ];

          pdf.autoTable({
            startY: yPosition,
            head: [['Component', 'Calculation', 'PVC Amount']],
            body: steelTableData,
            theme: 'grid',
            headStyles: { 
              
              
              fontStyle: 'bold',
              fontSize: 13,
              halign: 'center'
            },
            styles: { 
              fontSize: 13, 
              cellPadding: 6,
              lineColor: [0, 0, 0],
              lineWidth: 0.8
            },
            margin: { left: marginLeft, right: marginRight },
            tableWidth: contentWidth,
            columnStyles: {
              0: { cellWidth: contentWidth * 0.25, fontStyle: 'bold', halign: 'left' },
              1: { cellWidth: contentWidth * 0.50, halign: 'center' },
              2: { cellWidth: contentWidth * 0.25, halign: 'right', fontStyle: 'bold' }
            }
          });
          
          yPosition = pdf.lastAutoTable.finalY + 10;
        }
        } // End of legacySteelScenario loop
      }

      // Add space before total section
      yPosition += 12;

      // Total section
      checkNewPage(50);
      
      // Create a compact box for the total PVC amount
      const boxHeight = 32;
      
      // Draw top border line
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(2);
      pdf.line(marginLeft, yPosition, marginLeft + contentWidth, yPosition);
      
      yPosition += 4;
      
      // Draw border around the box
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(1.5);
      pdf.rect(marginLeft, yPosition, contentWidth, boxHeight, 'S');
      
      // Calculate total PVC amount based on whether 17B restriction applies
      // If 17B restriction applies, use the restricted (capped) total
      // Otherwise, use the unrestricted total
      // Use the calculated total from the PDF generation (more accurate than database value)
      const totalPvcAmount = is17BRestricted 
        ? (calculatedRestrictedTotal || bill.pvcCalculation.totalPvc || 0)
        : (calculatedUnrestrictedTotal || bill.pvcCalculation.totalPvc || 0);
      // Capture recalculated PVC in outer-scope variable for All Bills table
      recalculatedPvcForCurrentBill = totalPvcAmount;
      const amountInWords = numberToWordsIndian(totalPvcAmount);
      
      // Add the total PVC amount (numeric)
      const amountTextY = yPosition + 12;
      pdf.setFontSize(19);
      pdf.setFont("helvetica", "bold");
      pdf.text(`TOTAL PVC AMOUNT: ${totalPvcAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, marginLeft + (contentWidth / 2), amountTextY, { align: 'center' });
      
      // Add the amount in words
      const wordsTextY = yPosition + 24;
      pdf.setFontSize(13);
      pdf.setFont("helvetica", "italic");
      
      // Split text if too long
      const maxWidth = contentWidth - 10;
      const splitWords = pdf.splitTextToSize(`(${amountInWords})`, maxWidth);
      pdf.text(splitWords, marginLeft + (contentWidth / 2), wordsTextY, { align: 'center' });
      
      yPosition += boxHeight + 3;
      
      // Draw bottom border
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(2);
      pdf.line(marginLeft, yPosition, marginLeft + contentWidth, yPosition);
      
      yPosition += 16; // Advance yPosition to prevent overlapping with subsequent sections
      
      // Add 17B Restriction Comparison if applicable
      // Use the authoritative values from the database instead of recalculating
      if (bill.pvcCalculation.isIndexCapped && bill.pvcCalculation.originalPvcAmount && bill.pvcCalculation.restrictedPvcAmount) {
        const dbUnrestrictedTotal = bill.pvcCalculation.originalPvcAmount;
        const dbRestrictedTotal = bill.pvcCalculation.restrictedPvcAmount;
        const calculatedSavings = Math.max(0, dbUnrestrictedTotal - dbRestrictedTotal);
        
        // VALIDATION: Check if restricted PVC is less than or equal to unrestricted PVC
        const isValidRestriction = dbRestrictedTotal <= dbUnrestrictedTotal;
        
        // Show warning if validation fails
        if (!isValidRestriction) {
          checkNewPage(60);
          
          pdf.setFillColor(255, 240, 240); // Light red background
          pdf.rect(marginLeft, yPosition, contentWidth, 30, 'F');
          pdf.setDrawColor(220, 53, 69); // Red border
          pdf.setLineWidth(1.5);
          pdf.rect(marginLeft, yPosition, contentWidth, 30);
          
          yPosition += 10;
          pdf.setFontSize(13);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(220, 53, 69); // Red text
          pdf.text("⚠ VALIDATION ALERT", marginLeft + 5, yPosition);
          
          yPosition += 7;
          pdf.setFontSize(13);
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(139, 0, 0); // Dark red
          const warningText = `Restricted PVC (${dbRestrictedTotal.toLocaleString('en-IN', {maximumFractionDigits: 2})}) is higher than Unrestricted PVC (${dbUnrestrictedTotal.toLocaleString('en-IN', {maximumFractionDigits: 2})}). This requires verification of Index_L values and capping logic.`;
          const warningLines = pdf.splitTextToSize(warningText, contentWidth - 10);
          pdf.text(warningLines, marginLeft + 5, yPosition);
          yPosition += 25;
          pdf.setTextColor(0, 0, 0); // Reset to black
          pdf.setFont("helvetica", "normal");
        }
        
        // Only show if there are actual savings OR if validation failed (to show the discrepancy)
        if (calculatedSavings > 0 || !isValidRestriction) {
          checkNewPage(120);
          
          pdf.setFontSize(14);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(0, 0, 0); // Black text
          pdf.text("17B PVC RESTRICTION - FINANCIAL IMPACT", marginLeft, yPosition);
          
          yPosition += 10;
          
          const comparisonData = [
            [
              'PVC Without Restriction (If indices not capped)',
              dbUnrestrictedTotal.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
            ],
            [
              'PVC With 17B Restriction (Indices capped)',
              dbRestrictedTotal.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
            ],
            [
              { content: 'Railways Savings Due to Index Cap', styles: { fontStyle: 'bold' } },
              { content: calculatedSavings.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 }), styles: { fontStyle: 'bold' } }
            ]
          ];
        
          pdf.autoTable({
            startY: yPosition,
            head: [['Description', 'Amount']],
            body: comparisonData,
            theme: 'grid',
            headStyles: { 
              fillColor: [255, 255, 255], // White background
              textColor: [0, 0, 0], // Black text
              fontStyle: 'bold',
              fontSize: 12,
              halign: 'center',
              lineColor: [0, 0, 0],
              lineWidth: 0.5
            },
            styles: { 
              fontSize: 12,
              cellPadding: 4,
              lineColor: [0, 0, 0],
              lineWidth: 0.5,
              textColor: [0, 0, 0]
            },
            margin: { left: marginLeft, right: marginRight },
            tableWidth: contentWidth,
            columnStyles: {
              0: { cellWidth: contentWidth * 0.65, halign: 'left' },
              1: { cellWidth: contentWidth * 0.35, halign: 'right', fontStyle: 'bold' }
            }
          });
          
          yPosition = pdf.lastAutoTable.finalY + 12;
          
          // Add detailed component-wise breakdown if we have data
          if (Object.keys(componentBreakdown).length > 0) {
            checkNewPage(150);
            
            pdf.setFontSize(13);
            pdf.setFont("helvetica", "bold");
            pdf.text("COMPONENT-WISE IMPACT BREAKDOWN", marginLeft, yPosition);
            yPosition += 10;
            
            // Build detailed breakdown table
            const detailedBreakdownData: any[] = [];
            let totalUnrestrictedSum = 0;
            let totalRestrictedSum = 0;
            
            // Sort components by impact (highest savings first)
            const sortedComponents = Object.entries(componentBreakdown).sort(
              ([, a], [, b]) => (b.unrestricted - b.restricted) - (a.unrestricted - a.restricted)
            );
          
          sortedComponents.forEach(([componentName, amounts]) => {
            const difference = amounts.unrestricted - amounts.restricted;
            const percentImpact = amounts.unrestricted > 0 
              ? ((difference / amounts.unrestricted) * 100).toFixed(2)
              : '0.00';
            
            totalUnrestrictedSum += amounts.unrestricted;
            totalRestrictedSum += amounts.restricted;
            
            detailedBreakdownData.push([
              componentName,
              amounts.unrestricted.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 }),
              amounts.restricted.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 }),
              difference.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 }),
              `${percentImpact}%`
            ]);
          });
          
          // Add total row
          const totalDifference = totalUnrestrictedSum - totalRestrictedSum;
          const totalPercentImpact = totalUnrestrictedSum > 0 
            ? ((totalDifference / totalUnrestrictedSum) * 100).toFixed(2)
            : '0.00';
            
          detailedBreakdownData.push([
            { content: 'TOTAL', styles: { fontStyle: 'bold' } },
            { content: totalUnrestrictedSum.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 }), styles: { fontStyle: 'bold' } },
            { content: totalRestrictedSum.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 }), styles: { fontStyle: 'bold' } },
            { content: totalDifference.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 }), styles: { fontStyle: 'bold' } },
            { content: `${totalPercentImpact}%`, styles: { fontStyle: 'bold' } }
          ]);
          
          pdf.autoTable({
            startY: yPosition,
            head: [['Component', 'Without 17B', 'With 17B', 'Savings', '% Impact']],
            body: detailedBreakdownData,
            theme: 'grid',
            headStyles: { 
              fillColor: [255, 255, 255],
              textColor: [0, 0, 0],
              fontStyle: 'bold',
              fontSize: 13,
              halign: 'center',
              lineColor: [0, 0, 0],
              lineWidth: 0.5
            },
            styles: { 
              fontSize: 13,
              cellPadding: 4,
              lineColor: [0, 0, 0],
              lineWidth: 0.5,
              textColor: [0, 0, 0]
            },
            margin: { left: marginLeft, right: marginRight },
            tableWidth: contentWidth,
            columnStyles: {
              0: { cellWidth: contentWidth * 0.32, halign: 'left' },
              1: { cellWidth: contentWidth * 0.19, halign: 'right' },
              2: { cellWidth: contentWidth * 0.19, halign: 'right' },
              3: { cellWidth: contentWidth * 0.19, halign: 'right' },
              4: { cellWidth: contentWidth * 0.11, halign: 'center' }
            }
          });
          
          yPosition = pdf.lastAutoTable.finalY + 5;
          pdf.setTextColor(0, 0, 0); // Reset color
          } // End of componentBreakdown check
        } // End of calculatedSavings > 0 check
      } // End of 17B restriction comparison
    } else {
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "normal");
      pdf.text("PVC calculation not available for this bill.", marginLeft + 10, yPosition);
    }
    } // End of PVC CALCULATION section template check

    // ALL BILLS FOR THIS CONTRACT SECTION - Rendered AFTER PVC calculation so we can use recalculated values
    if (templateSettings.sections.allBillsTable) {

    // A report must never write money. This block used to push the PDF's own
    // recomputed total INTO pvcCalculation.totalPvc whenever it differed by more
    // than a paisa, then rewrite the whole contract's cumulative chain — and the
    // PDF's engine diverges from the stored one (no WPI series bridge, seed-value
    // fill-ins for missing months, TMT-only steel default, no B/C-code exclusion,
    // no railway-supplied-material factor), so "differed" was the normal case, and
    // every download silently replaced correct stored figures with the PDF's. Worse:
    // the recomputation only runs when the template's pvcCalculation section is on,
    // so a template with allBillsTable on and pvcCalculation off wrote totalPvc = 0
    // for the bill and cascaded that zero through the contract's cumulatives. If the
    // stored figure needs recomputing, that is what Regenerate is for — a print-out
    // is not an edit.
    if (bill.pvcCalculation && recalculatedPvcForCurrentBill !== 0
        && Math.abs(recalculatedPvcForCurrentBill - bill.pvcCalculation.totalPvc) > 0.01) {
      console.warn(`[pdf-report] PDF recomputation for bill ${bill.billNo} differs from stored totalPvc `
        + `(${recalculatedPvcForCurrentBill} vs ${bill.pvcCalculation.totalPvc}); stored figure kept.`);
    }

    checkNewPage(80);
    pdf.setFontSize(19);
    pdf.setFont("helvetica", "bold");
    pdf.text("ALL BILLS FOR THIS CONTRACT", marginLeft, yPosition);
    
    const billsTitle = "ALL BILLS FOR THIS CONTRACT";
    const billsTitleWidth = pdf.getTextWidth(billsTitle);
    pdf.line(marginLeft, yPosition + 2, marginLeft + billsTitleWidth, yPosition + 2);
    yPosition += 12;

    // Whether each bill's quarter is priced on provisional or final indices. The
    // accounts office treats the two differently — a provisional figure will move when
    // the final index publishes — so the summary table says which each bill is.
    // Answered once per distinct quarter/zone/fuel combination, not once per bill.
    const { isBillUsingProvisionalIndices, relevantIndexNamesForBill } = await import('@/lib/index-status');
    const statusByKey = new Map<string, string>();
    const billIndexStatus = async (b: any): Promise<string> => {
      const key = `${b.quarter}|${b.zone || ''}|${b.fuelPriceType || ''}`;
      const known = statusByKey.get(key);
      if (known) return known;
      let label = '-';
      try {
        const status = await isBillUsingProvisionalIndices(
          b.quarter,
          new Date(bill.contract.baseMonth),
          relevantIndexNamesForBill(b.zone, b.fuelPriceType),
        );
        label = status.isProvisional ? 'Provisional' : 'Final';
      } catch (statusError) {
        console.warn(`[pdf-report] Could not determine index status for bill ${b.billNo}:`, statusError);
      }
      statusByKey.set(key, label);
      return label;
    };

    const billsTableData: any[][] = [];
    for (const b of allContractBills) {
      billsTableData.push([
        b.billNo,
        format(new Date(b.dateOfMeasurement), 'dd MMM yyyy'),
        b.quarter,
        b.billAmount.toLocaleString('en-IN'),
        b.pvcCalculation ? b.pvcCalculation.totalPvc.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : 'Not Calculated',
        b.pvcCalculation ? b.pvcCalculation.cumulativePvc.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '-',
        await billIndexStatus(b),
      ]);
    }

    pdf.autoTable({
      startY: yPosition,
      head: [['Bill No.', 'Measurement Date', 'Quarter', 'Bill Amount', 'PVC Amount', 'Cumulative PVC', 'Status']],
      body: billsTableData,
      theme: 'grid',
      headStyles: { 
        fontStyle: 'bold',
        fontSize: 13,
        halign: 'center'
      },
      styles: { 
        fontSize: 12, 
        cellPadding: 4,
        lineColor: [0, 0, 0],
        lineWidth: 0.5
      },
      margin: { left: marginLeft, right: marginRight },
      tableWidth: contentWidth,
      columnStyles: {
        0: { cellWidth: contentWidth * 0.13, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: contentWidth * 0.15, halign: 'center' },
        2: { cellWidth: contentWidth * 0.10, halign: 'center' },
        3: { cellWidth: contentWidth * 0.17, halign: 'right' },
        4: { cellWidth: contentWidth * 0.17, halign: 'right' },
        5: { cellWidth: contentWidth * 0.16, halign: 'right' },
        6: { cellWidth: contentWidth * 0.12, halign: 'center' }
      },
      didParseCell: function (data: any) {
        if (data.section === 'body' && data.column.index === 2) {
          if (data.cell.text[0] === bill.quarter) {
            const rowCells = data.table.body[data.row.index].cells;
            Object.values(rowCells).forEach((cell: any) => {
              cell.styles.fontStyle = 'bold';
            });
          }
        }
      }
    });

    yPosition = pdf.lastAutoTable.finalY + 15;
    
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.3);
    pdf.line(marginLeft, yPosition, pageWidth - marginRight, yPosition);
    yPosition += 10;
    } // End of ALL BILLS section template check


    // Generate PDF buffer
    // Add footer and page numbers to all pages
    const pageCount = pdf.internal.pages.length - 1; // -1 because index 0 is metadata
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);
      
      // Add footer text if provided
      if (brandingSettings.reportFooterText) {
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "normal");
        
        // Footer text centered at bottom
        const footerY = pageHeight - 12; // 12mm from bottom
        const footerLines = pdf.splitTextToSize(brandingSettings.reportFooterText, contentWidth - 60);
        pdf.text(footerLines, marginLeft + (contentWidth / 2), footerY, { align: 'center' });
      }
      
      // Generated timestamp at bottom center
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      const istNowSingle = toISTDate(new Date());
      const genDateTextSingle = `Generated: ${format(istNowSingle, 'dd MMM yyyy, HH:mm')} IST`;
      pdf.text(genDateTextSingle, marginLeft + (contentWidth / 2) - (pdf.getTextWidth(genDateTextSingle) / 2), pageHeight - 6);

      // Page number at bottom right (always show)
      pdf.setFontSize(13);
      pdf.setFont("helvetica", "normal");
      pdf.text(`Page ${i} of ${pageCount}`, pageWidth - marginRight - 2, pageHeight - 8, { align: 'right' });
    }

    // Generate initial PDF buffer
    const initialPdfBytes = new Uint8Array(pdf.output('arraybuffer'));

    // Add MPNG Fuel Average Page (if enabled in template)
    let pdfWithFuelAverage = initialPdfBytes;
    if (templateSettings.sections.mpngFuelAverage !== false) {
      try {
        console.log('=== MPNG Fuel Average Page Generation ===');
        const { getMPNGFuelMonthlyAverage } = await import('@/lib/pdf/utils/labour-index-embedder');
        const { generateMPNGFuelAveragePage } = await import('@/lib/pdf/utils/mpng-fuel-page-generator');
        
        const fuelStartDate = new Date(bill.contract.baseMonth);
        const fuelEndDate = new Date(bill.dateOfMeasurement);
        
        console.log(`Fetching MPNG Fuel data from ${format(fuelStartDate, 'MMM yyyy')} to ${format(fuelEndDate, 'MMM yyyy')} (type: ${bill.fuelPriceType || 'four_city_avg'}, zone: ${bill.zone || 'N/A'})`);
        
        const fuelData = await getMPNGFuelMonthlyAverage(fuelStartDate, fuelEndDate, {
          fuelPriceType: bill.fuelPriceType,
          zone: bill.zone,
        });
        
        if (fuelData) {
          console.log(`✓ Found MPNG Fuel data: ${fuelData.totalMonths} months, average: ${fuelData.average}, source: ${fuelData.dataSource}, basis: ${fuelData.fuelBasis}${fuelData.cityName ? ` (${fuelData.cityName})` : ''}`);

          pdfWithFuelAverage = await generateMPNGFuelAveragePage(initialPdfBytes, {
            ...fuelData,
            startDate: fuelStartDate,
            endDate: fuelEndDate,
            billNo: bill.billNo || 'N/A',
            contractNo: bill.contract.agreementNo || 'N/A',
            dataSource: fuelData.dataSource,
          });
          
          console.log('✓ Successfully added MPNG Fuel average page');
        } else {
          console.log('⚠ No MPNG Fuel data found for the specified date range');
        }
      } catch (error) {
        console.error('✗ Error generating MPNG Fuel average page:', error);
        // Continue with original PDF if generation fails
      }
    } else {
      console.log('MPNG Fuel average page disabled in template settings');
    }

    // Embed component indices from base month to measurement month (if enabled in template)
    let finalPdfBytes = pdfWithFuelAverage;
    let componentIndexDocsAttached = 0;
    
    if (templateSettings.sections.componentIndexDocuments !== false) {
      const componentIndexStartDate = new Date(bill.contract.baseMonth);
      const componentIndexEndDate = new Date(bill.dateOfMeasurement);
      
      console.log('=== Component Index Document Embedding ===');
      console.log(`Base Month: ${format(componentIndexStartDate, 'MMM yyyy')}`);
      console.log(`Measurement Date: ${format(componentIndexEndDate, 'MMM yyyy')}`);
      console.log(`Date Range: ${componentIndexStartDate.toISOString()} to ${componentIndexEndDate.toISOString()}`);
      
      try {
        // Count documents before embedding
        const initialPageCount = PDFDocument.load(pdfWithFuelAverage).then(doc => doc.getPageCount());
        
        const detailedComponentTypes = billHasSteel(bill) && jpcDocsAllowed ? undefined : NON_STEEL_COMPONENT_TYPES;
        finalPdfBytes = await embedComponentIndicesRange(pdfWithFuelAverage, {
          startDate: componentIndexStartDate,
          endDate: componentIndexEndDate,
          componentTypes: detailedComponentTypes,
          // Switches on marking for every attached sheet — steel rows and city on JPC
          // sheets, used months on the rest. Passed for every bill: one without steel
          // attaches no JPC sheet, so the city is unused there, but its labour,
          // cement and fuel sheets still get their months marked.
          jpcCity: getSteelCityForZone(bill.zone),
          jpcCaption: `${bill.contract.agreementNo} — ${bill.billNo}`,
        });
        
        // Count documents after embedding
        const finalDoc = await PDFDocument.load(finalPdfBytes);
        const finalPageCount = finalDoc.getPageCount();
        const initialCount = await initialPageCount;
        
        componentIndexDocsAttached = finalPageCount - initialCount;
        
        if (componentIndexDocsAttached > 0) {
          console.log(`✓ Successfully attached ${componentIndexDocsAttached} component index document pages`);
        } else {
          console.log('⚠ No component index documents found for the specified date range');
        }
      } catch (error) {
        console.error('✗ Error embedding component index documents:', error);
        // Continue with PDF that has fuel average (if added) if embedding fails
        finalPdfBytes = pdfWithFuelAverage;
        await refundJpcChargeIfMade('the sheets could not be attached to the report');
      }
    } else {
      console.log('Component index documents disabled in template settings');
    }

    // Apply trial watermark for free-trial bills (waived once the owner has topped up)
    if (!isAdminRequester && !trialWatermarkWaived && bill.billTransaction?.discountType === 'trial') {
      const { applyTrialWatermark } = await import('@/lib/pdf/utils/watermark');
      finalPdfBytes = await applyTrialWatermark(finalPdfBytes);
    }

    const pdfBuffer = Buffer.from(finalPdfBytes);
    const detailedFilename = `PVC_Report_${bill.billNo.replace(/[^a-zA-Z0-9]/g, '_')}_${format(toISTDate(new Date()), 'yyyy-MM-dd')}.pdf`;

    // Save to advanced cache for 10 minutes, tagged with 'bills' and specific bill ID.
    // The filename travels with the bytes so a cache hit downloads under the same name
    // a fresh build would have given it. Never cached when the report went out missing
    // pages it was meant to carry: that charge was refunded and the stamp cleared, so
    // the next download pays again — and must not be handed this incomplete file.
    if (!deliveryIncomplete) {
      advancedCache.set(
        cacheKey,
        { body: pdfBuffer, filename: detailedFilename },
        600000,
        ['bills', `bill:${billId}`],
      );
    }

    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${detailedFilename}"`,
        'X-RateLimit-Remaining': rateLimit.remaining.toString(),
      }
    });
      })(),
      TIMEOUT_DEFAULTS.VERY_LONG,
      'pdf-generation'
    );

  } catch (error) {
    console.error('Error generating PDF report:', error);
    if (error instanceof Error) {
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
    return NextResponse.json(
      { error: 'Failed to generate PDF report', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
