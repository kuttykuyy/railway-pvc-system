-- The accounts/audit stage of a PVC proposal, which follows the executive approval.
-- The engineering side approves the work and the figures; accounts then vet the
-- proposal and pass it for payment. They are different people answering for different
-- things, so the bill records both rather than one "approved" flag.
--
-- Status flow: draft -> submitted -> approved (executive) -> passed_for_payment (accounts).
-- Accounts can also send it back, which returns the bill to "submitted" with a reason.
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "passedAt" TIMESTAMP(3);
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "passedBy" TEXT;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "passedComments" TEXT;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "accountsReturnReason" TEXT;

-- The accounts inbox lists bills awaiting vetting, newest first.
CREATE INDEX IF NOT EXISTS "bills_status_approvedAt_idx" ON "bills" ("status", "approvedAt");

DO $$
BEGIN
  ALTER TABLE "bills"
    ADD CONSTRAINT "bills_passedBy_fkey"
    FOREIGN KEY ("passedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
