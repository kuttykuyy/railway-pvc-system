-- How a record came into being: typed in, read from a PDF, or sent through Telegram.
--
-- The app already knew this at the moment of creation — it charges a different rate for
-- a bill read from a PDF than for one entered by hand — but it used the fact to price
-- the work and then discarded it. So nothing on screen could answer "was this typed or
-- extracted?", which is the first question anyone asks of a figure they doubt.
--
-- Null means created before this column existed; the cards say nothing rather than
-- guessing "manual" for records whose origin was never recorded.
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "createdVia" TEXT;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "createdVia" TEXT;
