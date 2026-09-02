-- Mobile OTP verification has been removed from the product (signup, profile and
-- Telegram account linking). Nothing reads or writes phone_otps any more.
DROP TABLE IF EXISTS "phone_otps";
