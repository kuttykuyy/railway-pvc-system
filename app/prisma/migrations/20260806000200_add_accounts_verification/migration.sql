-- What the accounts office ticked when passing a proposal for payment.
--
-- "Passed for payment" on its own records only that someone pressed a button. The
-- checklist records which of the standard checks were actually made — base month,
-- provisional indices, the classification split, eligibility, and the rest — which is
-- what answers an audit query months after the fact.
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "accountsVerification" JSONB;
