-- What the app proposed for an entry, kept alongside what the user accepted.
-- The accepted classification used to overwrite the suggested one, so a correction left
-- no trace and the same item had to be fixed again on every bill.
ALTER TABLE "bill_classification_entries"
  ADD COLUMN IF NOT EXISTS "suggestedSubClassificationId" TEXT;
ALTER TABLE "bill_classification_entries"
  ADD COLUMN IF NOT EXISTS "manualClassification" BOOLEAN NOT NULL DEFAULT false;

-- The corrections report reads the entries a person changed, newest first.
CREATE INDEX IF NOT EXISTS "bill_classification_entries_manual_idx"
  ON "bill_classification_entries" ("manualClassification", "createdAt" DESC);
