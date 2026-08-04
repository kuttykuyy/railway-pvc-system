-- Fuel basis differs by railway in practice: SWR directs the PPAC four-city average
-- (GCC-2022 Cl.46A.7), while Sr.DFM/MDU (Southern Railway) returned a PVC proposal
-- demanding the Chennai rate. Older agreements may sit under a pre-2022 GCC. So the
-- basis is stored per agreement and never hardcoded; bills default to it.
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "fuelPriceType" TEXT DEFAULT 'four_city_avg';
