-- An extra item ordered after the agreement (Cl.39) is listed and paid but earns no
-- price variation (GCC-2022 Cl.46A.1(b)). Flagged per classification entry.
ALTER TABLE "bill_classification_entries" ADD COLUMN IF NOT EXISTS "outsidePvc" BOOLEAN NOT NULL DEFAULT false;
