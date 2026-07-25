-- GCC-2022 Clause 46A defines W (the PVC base) as the gross value of work done
-- EXCLUDING "cost of materials supplied by Railway either free or at fixed rate".
-- Contracts already carry a hasRailwaySuppliedMaterials flag, but no value, so the
-- deduction could not be applied. This stores the per-bill value to deduct.
ALTER TABLE "bills" ADD COLUMN "railwaySuppliedMaterialValue" DOUBLE PRECISION DEFAULT 0;
