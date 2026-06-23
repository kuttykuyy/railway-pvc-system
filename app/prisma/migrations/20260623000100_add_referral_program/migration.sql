ALTER TABLE "User" ADD COLUMN "referralCode" TEXT;

CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
CREATE INDEX "User_referralCode_idx" ON "User"("referralCode");

CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'signed_up',
    "qualifyingTransactionId" TEXT,
    "referrerReward" DOUBLE PRECISION NOT NULL DEFAULT 199,
    "referredReward" DOUBLE PRECISION NOT NULL DEFAULT 199,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qualifiedAt" TIMESTAMP(3),
    "rewardedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "referrals_referredUserId_key" ON "referrals"("referredUserId");
CREATE UNIQUE INDEX "referrals_qualifyingTransactionId_key" ON "referrals"("qualifyingTransactionId");
CREATE INDEX "referrals_referrerUserId_idx" ON "referrals"("referrerUserId");
CREATE INDEX "referrals_status_idx" ON "referrals"("status");
CREATE INDEX "referrals_createdAt_idx" ON "referrals"("createdAt");

ALTER TABLE "referrals"
ADD CONSTRAINT "referrals_referrerUserId_fkey"
FOREIGN KEY ("referrerUserId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "referrals"
ADD CONSTRAINT "referrals_referredUserId_fkey"
FOREIGN KEY ("referredUserId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
