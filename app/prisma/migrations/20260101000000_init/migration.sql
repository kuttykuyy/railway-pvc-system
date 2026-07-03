-- CreateEnum
CREATE TYPE "ComponentType" AS ENUM ('LABOUR', 'PLANT_MACHINERY_SPARES', 'MPNG_FUEL', 'OTHER_MATERIALS', 'CEMENT', 'TMT_BARS', 'ANGLE_CHANNEL', 'PLATES', 'OTHER_SECTIONS');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "address" TEXT,
    "companyName" TEXT,
    "freeTrialUsed" INTEGER NOT NULL DEFAULT 0,
    "gstin" TEXT,
    "isTrialActive" BOOLEAN NOT NULL DEFAULT false,
    "pvcToolSubscriptionActive" BOOLEAN NOT NULL DEFAULT false,
    "pvcToolSubscriptionExpiry" TIMESTAMP(3),
    "panNumber" TEXT,
    "phone" TEXT,
    "totalBillsProcessed" INTEGER NOT NULL DEFAULT 0,
    "role" TEXT NOT NULL DEFAULT 'contractor',
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "lastPasswordChange" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "passwordExpiresAt" TIMESTAMP(3),
    "logoPath" TEXT,
    "reportFooterText" TEXT,
    "reportHeaderColor" TEXT,
    "reportHeaderText" TEXT,
    "showLogoInReports" BOOLEAN NOT NULL DEFAULT true,
    "customProcessingFee" DOUBLE PRECISION,
    "isFreeAccount" BOOLEAN NOT NULL DEFAULT false,
    "department" TEXT,
    "designation" TEXT,
    "division" TEXT,
    "divisionName" TEXT,
    "headquartersStation" TEXT,
    "isCurrentPosting" BOOLEAN NOT NULL DEFAULT true,
    "officeLocation" TEXT,
    "postingEndDate" TIMESTAMP(3),
    "postingStartDate" TIMESTAMP(3),
    "railwayZone" TEXT,
    "railwayZoneName" TEXT,
    "section" TEXT,
    "contractLimitOverride" INTEGER,
    "resetToken" TEXT,
    "resetTokenExpiry" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "phone_otps" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "otp" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classification_groups" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "classification_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_classifications" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "groupId" TEXT NOT NULL,
    "fixed" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "labour" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "steel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cement" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "plantMachinery" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fuel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherMaterials" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "explosives" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classifications" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "fixed" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "labour" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "steel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cement" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "plantMachinery" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "fuel" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "otherMaterials" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "explosives" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "subClassifications" JSONB DEFAULT '[]',

    CONSTRAINT "classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "agreementNo" TEXT NOT NULL,
    "loaNo" TEXT,
    "loaDate" TIMESTAMP(3),
    "contractorName" TEXT NOT NULL,
    "contractorPhone" TEXT,
    "workDescription" TEXT NOT NULL,
    "workClassification" TEXT,
    "dateOfOpening" TIMESTAMP(3) NOT NULL,
    "baseMonth" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,
    "currentCompletionDate" TIMESTAMP(3),
    "extensionGrantedDate" TIMESTAMP(3),
    "extensionReason" TEXT,
    "extensionType" TEXT,
    "isExtended" BOOLEAN NOT NULL DEFAULT false,
    "originalCompletionDate" TIMESTAMP(3),
    "completionPeriodMonths" INTEGER,
    "contractValue" DOUBLE PRECISION,
    "hasRailwaySuppliedMaterials" BOOLEAN NOT NULL DEFAULT false,
    "pvcApplicable" BOOLEAN NOT NULL DEFAULT true,
    "pvcEligibilityNote" TEXT,
    "railwaySuppliedMaterialsNote" TEXT,
    "tenderAdvertisedValue" DOUBLE PRECISION,
    "coveringLetterDesignation" TEXT,
    "schedules" JSONB DEFAULT '[]',

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trial_claimed_agreements" (
    "id" TEXT NOT NULL,
    "normalizedAgreementNo" TEXT NOT NULL,
    "claimedByUserId" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trial_claimed_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_extensions" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "extensionType" TEXT NOT NULL,
    "extensionReason" TEXT,
    "originalCompletionDate" TIMESTAMP(3) NOT NULL,
    "extendedCompletionDate" TIMESTAMP(3) NOT NULL,
    "extensionDuration" INTEGER NOT NULL,
    "isPvcRestricted" BOOLEAN NOT NULL DEFAULT false,
    "pvcRestrictionDate" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvalDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderNumber" TEXT,
    "liquidatedDamagesRate" DOUBLE PRECISION,
    "isLiquidatedDamages" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "extensionSubcategory" TEXT,

    CONSTRAINT "contract_extensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extension_subcategories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extension_subcategories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_indices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseValue" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_indices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_index_values" (
    "id" TEXT NOT NULL,
    "priceIndexId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "source" TEXT,
    "isProvisional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_index_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jpc_steel_items" (
    "id" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "indexMapping" TEXT,
    "month" TIMESTAMP(3) NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'Chennai',
    "f1" DOUBLE PRECISION,
    "f2" DOUBLE PRECISION,
    "average" DOUBLE PRECISION,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jpc_steel_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_fuel_prices" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "delhi" DOUBLE PRECISION NOT NULL,
    "mumbai" DOUBLE PRECISION NOT NULL,
    "chennai" DOUBLE PRECISION NOT NULL,
    "kolkata" DOUBLE PRECISION NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_fuel_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labour_index_documents" (
    "id" TEXT NOT NULL,
    "componentType" "ComponentType" NOT NULL,
    "year" INTEGER NOT NULL,
    "months" INTEGER[],
    "fileName" TEXT NOT NULL,
    "cloudStoragePath" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "isProvisional" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "labour_index_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bills" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "billNo" TEXT NOT NULL,
    "billAmount" DOUBLE PRECISION NOT NULL,
    "dateOfMeasurement" TIMESTAMP(3) NOT NULL,
    "quarter" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isChargeable" BOOLEAN NOT NULL DEFAULT true,
    "processingFee" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "cementAmount" DOUBLE PRECISION DEFAULT 0,
    "steelAmount" DOUBLE PRECISION DEFAULT 0,
    "selectedSteelComponent" TEXT DEFAULT 'Steel TMT Bars',
    "steelTypes" JSONB DEFAULT '[]',
    "isFinalPvc" BOOLEAN NOT NULL DEFAULT false,
    "editCount" INTEGER NOT NULL DEFAULT 0,
    "pvcNumber" TEXT,
    "zone" TEXT,
    "fuelPriceType" TEXT DEFAULT 'four_city_avg',
    "dateOfCompletion" TIMESTAMP(3),
    "nonScheduleItems" JSONB DEFAULT '[]',
    "steelAngleChannelAmount" DOUBLE PRECISION DEFAULT 0,
    "steelOtherSectionsAmount" DOUBLE PRECISION DEFAULT 0,
    "steelPlatesAmount" DOUBLE PRECISION DEFAULT 0,
    "steelTmtBarsAmount" DOUBLE PRECISION DEFAULT 0,
    "grossBillAmount" DOUBLE PRECISION NOT NULL,
    "subClassifications" JSONB DEFAULT '[]',
    "workClassificationId" TEXT,
    "batchId" TEXT,
    "batchName" TEXT,
    "approvalComments" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectionReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submittedAt" TIMESTAMP(3),
    "hasBeenEditedOnce" BOOLEAN NOT NULL DEFAULT false,
    "lastEditedBy" TEXT,
    "lastEditedAt" TIMESTAMP(3),

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_classification_entries" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "classificationId" TEXT,
    "subClassifications" JSONB NOT NULL DEFAULT '[]',
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "steelTypes" JSONB DEFAULT '[]',
    "scheduleItem" TEXT,
    "itemNumber" TEXT,
    "quantity" DOUBLE PRECISION,
    "agreementRate" DOUBLE PRECISION,
    "itemRows" JSONB,
    "labourPvc" DOUBLE PRECISION DEFAULT 0,
    "plantMachineryPvc" DOUBLE PRECISION DEFAULT 0,
    "fuelPowerPvc" DOUBLE PRECISION DEFAULT 0,
    "otherMaterialsPvc" DOUBLE PRECISION DEFAULT 0,
    "cementPvc" DOUBLE PRECISION DEFAULT 0,
    "steelPvc" DOUBLE PRECISION DEFAULT 0,
    "explosivesPvc" DOUBLE PRECISION DEFAULT 0,
    "totalPvc" DOUBLE PRECISION DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "subClassificationId" TEXT,

    CONSTRAINT "bill_classification_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pvc_calculations" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "labourPvc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "plantMachineryPvc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fuelPowerPvc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherMaterialsPvc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cementPvc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "explosivesPvc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "steelPvc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPvc" DOUBLE PRECISION NOT NULL,
    "previousPvcTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cumulativePvc" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dedicatedCementPvc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dedicatedSteelPvc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cappedCementIndex" DOUBLE PRECISION DEFAULT 0,
    "cappedExplosivesIndex" DOUBLE PRECISION DEFAULT 0,
    "cappedFuelIndex" DOUBLE PRECISION DEFAULT 0,
    "cappedLabourIndex" DOUBLE PRECISION DEFAULT 0,
    "cappedMaterialsIndex" DOUBLE PRECISION DEFAULT 0,
    "cappedPlantIndex" DOUBLE PRECISION DEFAULT 0,
    "cappedSteelIndex" DOUBLE PRECISION DEFAULT 0,
    "extensionType" TEXT,
    "indexCapDate" TIMESTAMP(3),
    "isExtensionPeriod" BOOLEAN NOT NULL DEFAULT false,
    "isIndexCapped" BOOLEAN NOT NULL DEFAULT false,
    "originalPvcAmount" DOUBLE PRECISION DEFAULT 0,
    "pvcRestrictionReason" TEXT,
    "pvcSavingsDueToRestriction" DOUBLE PRECISION DEFAULT 0,
    "restrictedPvcAmount" DOUBLE PRECISION DEFAULT 0,
    "dedicatedSteelAngleChannelPvc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dedicatedSteelOtherSectionsPvc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dedicatedSteelPlatesPvc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dedicatedSteelTmtBarsPvc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "indexL_Cement" DOUBLE PRECISION DEFAULT 0,
    "indexL_Explosives" DOUBLE PRECISION DEFAULT 0,
    "indexL_Fuel" DOUBLE PRECISION DEFAULT 0,
    "indexL_Labour" DOUBLE PRECISION DEFAULT 0,
    "indexL_Materials" DOUBLE PRECISION DEFAULT 0,
    "indexL_Plant" DOUBLE PRECISION DEFAULT 0,
    "indexL_Steel" DOUBLE PRECISION DEFAULT 0,

    CONSTRAINT "pvc_calculations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "billingEmail" TEXT,
    "paymentMethod" TEXT,
    "currentTier" TEXT NOT NULL DEFAULT 'standard',
    "monthlyBillCount" INTEGER NOT NULL DEFAULT 0,
    "creditBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outstandingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastMonthBills" INTEGER NOT NULL DEFAULT 0,
    "currentMonthBills" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "originalAmount" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "paymentMethod" TEXT,
    "transactionRef" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "bill_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pvc_checks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "billNo" TEXT,
    "zone" TEXT,
    "fuelPriceType" TEXT NOT NULL DEFAULT 'four_city_avg',
    "dateOfMeasurement" TIMESTAMP(3) NOT NULL,
    "totalPvc" DOUBLE PRECISION NOT NULL,
    "isPositive" BOOLEAN NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "breakdown" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pvc_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "billingPeriodStart" TIMESTAMP(3) NOT NULL,
    "billingPeriodEnd" TIMESTAMP(3) NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outstandingAmount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "paymentDueDate" TIMESTAMP(3) NOT NULL,
    "paymentMethod" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "billTransactionId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "transactionRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bankName" TEXT,
    "chequeNumber" TEXT,
    "upiTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_tiers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "minBillsPerMonth" INTEGER NOT NULL,
    "maxBillsPerMonth" INTEGER,
    "pricePerBill" DOUBLE PRECISION NOT NULL,
    "discountPercent" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportMonth" TEXT NOT NULL,
    "reportYear" INTEGER NOT NULL,
    "billsProcessed" INTEGER NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "discountAmount" DOUBLE PRECISION NOT NULL,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "standardBills" INTEGER NOT NULL DEFAULT 0,
    "discountedBills" INTEGER NOT NULL DEFAULT 0,
    "freeBills" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "balanceBefore" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "adminUserId" TEXT,
    "adminUserEmail" TEXT,
    "billId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "dataType" TEXT NOT NULL DEFAULT 'string',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,
    "updatedByUserEmail" TEXT,

    CONSTRAINT "admin_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pvc_comparison_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 250,
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "razorpaySignature" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pvc_comparison_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pvc_comparison_daily_usage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pvc_comparison_daily_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "razorpay_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "razorpayOrderId" TEXT NOT NULL,
    "razorpayPaymentId" TEXT,
    "razorpaySignature" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'created',
    "notes" JSONB,
    "receipt" TEXT NOT NULL,
    "creditAmount" DOUBLE PRECISION NOT NULL,
    "gstAmount" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "razorpay_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gst_invoices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "razorpayTransactionId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT,
    "customerGstin" TEXT,
    "customerAddress" TEXT,
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "cgst" DOUBLE PRECISION NOT NULL,
    "sgst" DOUBLE PRECISION NOT NULL,
    "igst" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalGst" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "hsn" TEXT NOT NULL DEFAULT '998314',
    "isInterstate" BOOLEAN NOT NULL DEFAULT false,
    "pdfPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'generated',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gst_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_contract_access" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT true,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "canCreateBills" BOOLEAN NOT NULL DEFAULT true,
    "grantedByUserId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_contract_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_bill_access" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT true,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "canDownloadPdf" BOOLEAN NOT NULL DEFAULT true,
    "grantedByUserId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_bill_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_templates" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "sections" JSONB NOT NULL DEFAULT '{"allBillsTable": true, "monthlyIndices": true, "pvcCalculation": true, "contractDetails": true, "workClassification": true, "componentIndexDocuments": true}',
    "fields" JSONB NOT NULL DEFAULT '{"pvcCalculation": {"summary": true, "componentWise": true, "quarterlyData": true, "dedicatedAmounts": true, "showCalculationSteps": true}, "contractDetails": {"zone": true, "loaNo": true, "baseMonth": true, "pvcNumber": true, "isFinalPvc": true, "agreementNo": true, "dateOfOpening": true, "contractorName": true, "workDescription": true}, "workClassification": {"code": true, "name": true, "description": true, "nonScheduleItems": true, "componentBreakdown": true, "subClassifications": true}}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_page_access" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pagePath" TEXT NOT NULL,
    "pageName" TEXT NOT NULL,
    "pageCategory" TEXT,
    "canAccess" BOOLEAN NOT NULL DEFAULT true,
    "grantedByUserId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_page_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_approval_history" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "comments" TEXT,
    "previousStatus" TEXT NOT NULL,
    "newStatus" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bill_approval_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_conversations" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "userId" TEXT,
    "currentStep" TEXT NOT NULL DEFAULT 'IDLE',
    "conversationData" JSONB NOT NULL DEFAULT '{}',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_conversations" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT,
    "currentStep" TEXT NOT NULL DEFAULT 'IDLE',
    "conversationData" JSONB NOT NULL DEFAULT '{}',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "telegram_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_logs" (
    "id" TEXT NOT NULL,
    "billId" TEXT,
    "userId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "recipientName" TEXT,
    "template" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "messageId" TEXT,
    "errorMessage" TEXT,
    "pdfUrl" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "description" TEXT,
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "rateLimit" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "phone_otps_phone_otp_idx" ON "phone_otps"("phone", "otp");

-- CreateIndex
CREATE INDEX "phone_otps_phone_verified_idx" ON "phone_otps"("phone", "verified");

-- CreateIndex
CREATE UNIQUE INDEX "classification_groups_code_key" ON "classification_groups"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sub_classifications_code_key" ON "sub_classifications"("code");

-- CreateIndex
CREATE INDEX "sub_classifications_groupId_idx" ON "sub_classifications"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "classifications_code_key" ON "classifications"("code");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_agreementNo_key" ON "contracts"("agreementNo");

-- CreateIndex
CREATE INDEX "contracts_userId_idx" ON "contracts"("userId");

-- CreateIndex
CREATE INDEX "contracts_agreementNo_idx" ON "contracts"("agreementNo");

-- CreateIndex
CREATE INDEX "contracts_dateOfOpening_idx" ON "contracts"("dateOfOpening");

-- CreateIndex
CREATE INDEX "contracts_createdAt_idx" ON "contracts"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "trial_claimed_agreements_normalizedAgreementNo_key" ON "trial_claimed_agreements"("normalizedAgreementNo");

-- CreateIndex
CREATE INDEX "trial_claimed_agreements_normalizedAgreementNo_idx" ON "trial_claimed_agreements"("normalizedAgreementNo");

-- CreateIndex
CREATE UNIQUE INDEX "extension_subcategories_code_key" ON "extension_subcategories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "price_indices_name_key" ON "price_indices"("name");

-- CreateIndex
CREATE INDEX "monthly_index_values_month_idx" ON "monthly_index_values"("month");

-- CreateIndex
CREATE INDEX "monthly_index_values_priceIndexId_month_idx" ON "monthly_index_values"("priceIndexId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_index_values_priceIndexId_month_key" ON "monthly_index_values"("priceIndexId", "month");

-- CreateIndex
CREATE INDEX "jpc_steel_items_month_idx" ON "jpc_steel_items"("month");

-- CreateIndex
CREATE INDEX "jpc_steel_items_category_idx" ON "jpc_steel_items"("category");

-- CreateIndex
CREATE INDEX "jpc_steel_items_indexMapping_idx" ON "jpc_steel_items"("indexMapping");

-- CreateIndex
CREATE UNIQUE INDEX "jpc_steel_items_itemCode_month_city_key" ON "jpc_steel_items"("itemCode", "month", "city");

-- CreateIndex
CREATE INDEX "daily_fuel_prices_date_idx" ON "daily_fuel_prices"("date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_fuel_prices_date_key" ON "daily_fuel_prices"("date");

-- CreateIndex
CREATE INDEX "labour_index_documents_componentType_year_idx" ON "labour_index_documents"("componentType", "year");

-- CreateIndex
CREATE INDEX "labour_index_documents_year_idx" ON "labour_index_documents"("year");

-- CreateIndex
CREATE INDEX "labour_index_documents_isProvisional_idx" ON "labour_index_documents"("isProvisional");

-- CreateIndex
CREATE INDEX "bills_contractId_idx" ON "bills"("contractId");

-- CreateIndex
CREATE INDEX "bills_billNo_idx" ON "bills"("billNo");

-- CreateIndex
CREATE INDEX "bills_dateOfMeasurement_idx" ON "bills"("dateOfMeasurement");

-- CreateIndex
CREATE INDEX "bills_quarter_idx" ON "bills"("quarter");

-- CreateIndex
CREATE INDEX "bills_createdAt_idx" ON "bills"("createdAt");

-- CreateIndex
CREATE INDEX "bills_isChargeable_idx" ON "bills"("isChargeable");

-- CreateIndex
CREATE INDEX "bills_batchId_idx" ON "bills"("batchId");

-- CreateIndex
CREATE INDEX "bills_status_idx" ON "bills"("status");

-- CreateIndex
CREATE INDEX "bills_approvedBy_idx" ON "bills"("approvedBy");

-- CreateIndex
CREATE INDEX "bills_contractId_dateOfMeasurement_idx" ON "bills"("contractId", "dateOfMeasurement");

-- CreateIndex
CREATE INDEX "bills_contractId_createdAt_idx" ON "bills"("contractId", "createdAt");

-- CreateIndex
CREATE INDEX "bills_quarter_status_idx" ON "bills"("quarter", "status");

-- CreateIndex
CREATE INDEX "bill_classification_entries_billId_idx" ON "bill_classification_entries"("billId");

-- CreateIndex
CREATE INDEX "bill_classification_entries_classificationId_idx" ON "bill_classification_entries"("classificationId");

-- CreateIndex
CREATE INDEX "bill_classification_entries_subClassificationId_idx" ON "bill_classification_entries"("subClassificationId");

-- CreateIndex
CREATE UNIQUE INDEX "pvc_calculations_billId_key" ON "pvc_calculations"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_accounts_userId_key" ON "customer_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "bill_transactions_billId_key" ON "bill_transactions"("billId");

-- CreateIndex
CREATE INDEX "bill_transactions_userId_idx" ON "bill_transactions"("userId");

-- CreateIndex
CREATE INDEX "bill_transactions_billId_idx" ON "bill_transactions"("billId");

-- CreateIndex
CREATE INDEX "bill_transactions_status_idx" ON "bill_transactions"("status");

-- CreateIndex
CREATE INDEX "bill_transactions_createdAt_idx" ON "bill_transactions"("createdAt");

-- CreateIndex
CREATE INDEX "bill_transactions_userId_createdAt_status_idx" ON "bill_transactions"("userId", "createdAt", "status");

-- CreateIndex
CREATE INDEX "pvc_checks_userId_idx" ON "pvc_checks"("userId");

-- CreateIndex
CREATE INDEX "pvc_checks_contractId_idx" ON "pvc_checks"("contractId");

-- CreateIndex
CREATE INDEX "pvc_checks_createdAt_idx" ON "pvc_checks"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_items_billTransactionId_key" ON "invoice_items"("billTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_tiers_name_key" ON "pricing_tiers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "usage_reports_userId_reportMonth_key" ON "usage_reports"("userId", "reportMonth");

-- CreateIndex
CREATE UNIQUE INDEX "admin_settings_key_key" ON "admin_settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "pvc_comparison_sessions_sessionToken_key" ON "pvc_comparison_sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "pvc_comparison_sessions_userId_idx" ON "pvc_comparison_sessions"("userId");

-- CreateIndex
CREATE INDEX "pvc_comparison_sessions_sessionToken_idx" ON "pvc_comparison_sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "pvc_comparison_daily_usage_userId_idx" ON "pvc_comparison_daily_usage"("userId");

-- CreateIndex
CREATE INDEX "pvc_comparison_daily_usage_date_idx" ON "pvc_comparison_daily_usage"("date");

-- CreateIndex
CREATE UNIQUE INDEX "pvc_comparison_daily_usage_userId_date_key" ON "pvc_comparison_daily_usage"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "razorpay_transactions_orderId_key" ON "razorpay_transactions"("orderId");

-- CreateIndex
CREATE INDEX "razorpay_transactions_userId_idx" ON "razorpay_transactions"("userId");

-- CreateIndex
CREATE INDEX "razorpay_transactions_razorpayOrderId_idx" ON "razorpay_transactions"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "gst_invoices_invoiceNumber_key" ON "gst_invoices"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "gst_invoices_razorpayTransactionId_key" ON "gst_invoices"("razorpayTransactionId");

-- CreateIndex
CREATE INDEX "gst_invoices_userId_idx" ON "gst_invoices"("userId");

-- CreateIndex
CREATE INDEX "gst_invoices_invoiceNumber_idx" ON "gst_invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "user_contract_access_userId_isActive_canView_idx" ON "user_contract_access"("userId", "isActive", "canView");

-- CreateIndex
CREATE UNIQUE INDEX "user_contract_access_userId_contractId_key" ON "user_contract_access"("userId", "contractId");

-- CreateIndex
CREATE INDEX "user_bill_access_userId_isActive_canView_idx" ON "user_bill_access"("userId", "isActive", "canView");

-- CreateIndex
CREATE UNIQUE INDEX "user_bill_access_userId_billId_key" ON "user_bill_access"("userId", "billId");

-- CreateIndex
CREATE INDEX "user_page_access_userId_idx" ON "user_page_access"("userId");

-- CreateIndex
CREATE INDEX "user_page_access_pagePath_idx" ON "user_page_access"("pagePath");

-- CreateIndex
CREATE UNIQUE INDEX "user_page_access_userId_pagePath_key" ON "user_page_access"("userId", "pagePath");

-- CreateIndex
CREATE INDEX "bill_approval_history_billId_idx" ON "bill_approval_history"("billId");

-- CreateIndex
CREATE INDEX "bill_approval_history_userId_idx" ON "bill_approval_history"("userId");

-- CreateIndex
CREATE INDEX "bill_approval_history_action_idx" ON "bill_approval_history"("action");

-- CreateIndex
CREATE INDEX "bill_approval_history_timestamp_idx" ON "bill_approval_history"("timestamp");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_userId_idx" ON "whatsapp_conversations"("userId");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_currentStep_idx" ON "whatsapp_conversations"("currentStep");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_lastMessageAt_idx" ON "whatsapp_conversations"("lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversations_phoneNumber_key" ON "whatsapp_conversations"("phoneNumber");

-- CreateIndex
CREATE INDEX "telegram_conversations_userId_idx" ON "telegram_conversations"("userId");

-- CreateIndex
CREATE INDEX "telegram_conversations_currentStep_idx" ON "telegram_conversations"("currentStep");

-- CreateIndex
CREATE INDEX "telegram_conversations_lastMessageAt_idx" ON "telegram_conversations"("lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_conversations_chatId_key" ON "telegram_conversations"("chatId");

-- CreateIndex
CREATE INDEX "whatsapp_logs_billId_idx" ON "whatsapp_logs"("billId");

-- CreateIndex
CREATE INDEX "whatsapp_logs_userId_idx" ON "whatsapp_logs"("userId");

-- CreateIndex
CREATE INDEX "whatsapp_logs_phoneNumber_idx" ON "whatsapp_logs"("phoneNumber");

-- CreateIndex
CREATE INDEX "whatsapp_logs_status_idx" ON "whatsapp_logs"("status");

-- CreateIndex
CREATE INDEX "whatsapp_logs_sentAt_idx" ON "whatsapp_logs"("sentAt");

-- CreateIndex
CREATE INDEX "whatsapp_logs_template_idx" ON "whatsapp_logs"("template");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_key" ON "api_keys"("key");

-- CreateIndex
CREATE INDEX "api_keys_key_idx" ON "api_keys"("key");

-- CreateIndex
CREATE INDEX "api_keys_userId_idx" ON "api_keys"("userId");

-- CreateIndex
CREATE INDEX "api_keys_isActive_idx" ON "api_keys"("isActive");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_classifications" ADD CONSTRAINT "sub_classifications_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "classification_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_extensions" ADD CONSTRAINT "contract_extensions_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_index_values" ADD CONSTRAINT "monthly_index_values_priceIndexId_fkey" FOREIGN KEY ("priceIndexId") REFERENCES "price_indices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labour_index_documents" ADD CONSTRAINT "labour_index_documents_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_workClassificationId_fkey" FOREIGN KEY ("workClassificationId") REFERENCES "classifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_classification_entries" ADD CONSTRAINT "bill_classification_entries_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_classification_entries" ADD CONSTRAINT "bill_classification_entries_classificationId_fkey" FOREIGN KEY ("classificationId") REFERENCES "classifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_classification_entries" ADD CONSTRAINT "bill_classification_entries_subClassificationId_fkey" FOREIGN KEY ("subClassificationId") REFERENCES "sub_classifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pvc_calculations" ADD CONSTRAINT "pvc_calculations_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pvc_calculations" ADD CONSTRAINT "pvc_calculations_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_accounts" ADD CONSTRAINT "customer_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_transactions" ADD CONSTRAINT "bill_transactions_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_transactions" ADD CONSTRAINT "bill_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pvc_checks" ADD CONSTRAINT "pvc_checks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pvc_checks" ADD CONSTRAINT "pvc_checks_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_billTransactionId_fkey" FOREIGN KEY ("billTransactionId") REFERENCES "bill_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gst_invoices" ADD CONSTRAINT "gst_invoices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_contract_access" ADD CONSTRAINT "user_contract_access_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_contract_access" ADD CONSTRAINT "user_contract_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_bill_access" ADD CONSTRAINT "user_bill_access_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_bill_access" ADD CONSTRAINT "user_bill_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_page_access" ADD CONSTRAINT "user_page_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_approval_history" ADD CONSTRAINT "bill_approval_history_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_approval_history" ADD CONSTRAINT "bill_approval_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_conversations" ADD CONSTRAINT "telegram_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_logs" ADD CONSTRAINT "whatsapp_logs_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_logs" ADD CONSTRAINT "whatsapp_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

