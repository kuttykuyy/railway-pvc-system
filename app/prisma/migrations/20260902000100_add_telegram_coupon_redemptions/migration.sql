-- One row per statement handed out free against a Telegram coupon code.
--
-- Coupon codes live in TELEGRAM_REPORT_COUPONS and, until now, a code that was valid
-- could be redeemed by any chat, any number of times, with nothing written down. A code
-- that leaked was unlimited free reports until its expiry date. These rows cap a code
-- across every chat and per chat, and show an admin where each redemption went.
CREATE TABLE IF NOT EXISTS "telegram_coupon_redemptions" (
  "id"         TEXT NOT NULL,
  "code"       TEXT NOT NULL,
  "chatId"     TEXT NOT NULL,
  "linkId"     TEXT,
  "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telegram_coupon_redemptions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "telegram_coupon_redemptions_code_idx" ON "telegram_coupon_redemptions"("code");
CREATE INDEX IF NOT EXISTS "telegram_coupon_redemptions_code_chatId_idx" ON "telegram_coupon_redemptions"("code", "chatId");
