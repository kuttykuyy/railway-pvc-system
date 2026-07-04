-- CreateTable
CREATE TABLE "shortfall_audits" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "railwayTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "railwayLabour" DOUBLE PRECISION,
    "railwayPlantMachinery" DOUBLE PRECISION,
    "railwayFuelPower" DOUBLE PRECISION,
    "railwayCement" DOUBLE PRECISION,
    "railwaySteel" DOUBLE PRECISION,
    "railwayOtherMaterials" DOUBLE PRECISION,
    "railwayExplosives" DOUBLE PRECISION,
    "railwayReference" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shortfall_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shortfall_audits_billId_key" ON "shortfall_audits"("billId");

-- AddForeignKey
ALTER TABLE "shortfall_audits" ADD CONSTRAINT "shortfall_audits_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
