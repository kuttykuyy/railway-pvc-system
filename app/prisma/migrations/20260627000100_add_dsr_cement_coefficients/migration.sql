CREATE TABLE "dsr_cement_coefficients" (
    "id" TEXT NOT NULL,
    "dsrCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "workUnit" TEXT NOT NULL,
    "cementQuantityPerUnit" DOUBLE PRECISION NOT NULL,
    "cementUnit" TEXT NOT NULL DEFAULT 'MT',
    "source" TEXT NOT NULL DEFAULT 'DSR 2021 Analysis of Rates',
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dsr_cement_coefficients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dsr_cement_coefficients_dsrCode_key"
ON "dsr_cement_coefficients"("dsrCode");

CREATE INDEX "dsr_cement_coefficients_dsrCode_idx"
ON "dsr_cement_coefficients"("dsrCode");

CREATE INDEX "dsr_cement_coefficients_isActive_idx"
ON "dsr_cement_coefficients"("isActive");
