-- Track whether a saved PVC calculation used provisional/borrowed indices.
-- Sticky flag: stays true after the real index is published, so the bill can still
-- offer a "Regenerate" action until it is recalculated.
ALTER TABLE "pvc_calculations" ADD COLUMN "usedProvisionalIndices" BOOLEAN NOT NULL DEFAULT false;
