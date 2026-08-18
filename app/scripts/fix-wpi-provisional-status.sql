-- Repairs today's stale provisional flags on the four WPI-mapped indices (Cement,
-- Explosives, Plant Machinery, Other Materials).
--
-- The bug: only the WPI cron ever re-applied "the two most recent months with data
-- are provisional, every earlier one is final." Every other write path (the manual
-- monthly-entry screen, its bulk paste, the spreadsheet import) wrote isProvisional
-- however it was given -- usually the column default, false -- without ever
-- reclassifying the months around it. When one of those added May and June as final,
-- March and April were left exactly as cron had marked them the last time IT ran,
-- which was when March and April genuinely were the latest two. The result reads
-- backwards: the newest data looks settled, older data still carries the "P" badge.
--
-- The code fix (reapplyWpiProvisionalRule in lib/wpi-fetcher.ts) stops this from
-- happening again on every future write. This script repairs the rows that are
-- ALREADY wrong right now -- the code fix has no retroactive effect on data already
-- in the table.
--
-- Paste the whole thing. It shows you the current state, corrects it, shows you the
-- result, and stops WITHOUT saving. Nothing is permanent until you run COMMIT;.

BEGIN;

-- BEFORE — every WPI-mapped index/month, oldest to newest.
SELECT
  pi.name,
  to_char(miv.month, 'YYYY-Mon') AS month,
  miv.value,
  miv."isProvisional"
FROM railway_pvc.monthly_index_values miv
JOIN railway_pvc.price_indices pi ON pi.id = miv."priceIndexId"
WHERE pi.name IN ('RBI Cement', 'RBI Explosives', 'RBI Plant Machinery', 'RBI Other Materials')
ORDER BY pi.name, miv.month;

-- THE CORRECTION.
WITH wpi_ids AS (
  SELECT id FROM railway_pvc.price_indices
  WHERE name IN ('RBI Cement', 'RBI Explosives', 'RBI Plant Machinery', 'RBI Other Materials')
),
latest_two AS (
  SELECT DISTINCT month
  FROM railway_pvc.monthly_index_values
  WHERE "priceIndexId" IN (SELECT id FROM wpi_ids)
  ORDER BY month DESC
  LIMIT 2
)
UPDATE railway_pvc.monthly_index_values miv
SET "isProvisional" = (miv.month IN (SELECT month FROM latest_two)),
    "updatedAt" = now()
WHERE miv."priceIndexId" IN (SELECT id FROM wpi_ids)
  AND miv."isProvisional" <> (miv.month IN (SELECT month FROM latest_two));

-- AFTER — should now show the two most recent months as 't' and everything else 'f'.
SELECT
  pi.name,
  to_char(miv.month, 'YYYY-Mon') AS month,
  miv.value,
  miv."isProvisional"
FROM railway_pvc.monthly_index_values miv
JOIN railway_pvc.price_indices pi ON pi.id = miv."priceIndexId"
WHERE pi.name IN ('RBI Cement', 'RBI Explosives', 'RBI Plant Machinery', 'RBI Other Materials')
ORDER BY pi.name, miv.month;

-- Nothing above is saved yet.
--   The AFTER table looks right  ->  run:  COMMIT;
--   Anything looks wrong         ->  run:  ROLLBACK;
--
-- After COMMIT: /api/indices/route.ts caches its result in memory for an hour
-- (advancedCache, tag 'indices'), independent of this database change. To see the
-- correction on the indices page immediately rather than waiting up to an hour, sign
-- in as admin and POST to /api/indices/clear-cache once.
