-- What the app proposed for an entry, kept alongside what the user accepted.
-- The accepted classification used to overwrite the suggested one, so a correction left
-- no trace and the same item had to be fixed again on every bill.
ALTER TABLE "bill_classification_entries"
  ADD COLUMN IF NOT EXISTS "suggestedSubClassificationId" TEXT;
ALTER TABLE "bill_classification_entries"
  ADD COLUMN IF NOT EXISTS "manualClassification" BOOLEAN NOT NULL DEFAULT false;

-- The corrections report reads every entry the app proposed a classification for.
-- Partial, because the column is null on every entry saved before it existed and on
-- every one a person added by hand.
CREATE INDEX IF NOT EXISTS "bill_classification_entries_suggested_idx"
  ON "bill_classification_entries" ("suggestedSubClassificationId")
  WHERE "suggestedSubClassificationId" IS NOT NULL;
