CREATE TABLE "review_reward_submissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "reviewText" TEXT NOT NULL,
    "proofUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rewardAmount" DOUBLE PRECISION,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedByEmail" TEXT,
    "rejectionReason" TEXT,

    CONSTRAINT "review_reward_submissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "review_reward_submissions_userId_key"
ON "review_reward_submissions"("userId");

CREATE INDEX "review_reward_submissions_status_idx"
ON "review_reward_submissions"("status");

CREATE INDEX "review_reward_submissions_submittedAt_idx"
ON "review_reward_submissions"("submittedAt");

ALTER TABLE "review_reward_submissions"
ADD CONSTRAINT "review_reward_submissions_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
