-- How many top-ups granted more credit than the customer was promised.
--
-- Between the Razorpay integration going live and commit 9d5c9c9, create-order
-- defaulted gstOption to 'include' and the dialog never sent a value, so the wallet
-- was credited totalAmount (the gross paid, e.g. Rs 1,180) instead of creditAmount
-- (the credits bought, and the figure the dialog promised, e.g. Rs 1,000).
--
-- Run these against production. Query 3 is the one that proves what actually
-- happened, because it reads the credit ledger rather than inferring from the order.

-- ── 0. THE DECISIVE ONE — run this first ───────────────────────────────────────
-- The old code appended ' (includes GST)' to the ledger reason on exactly the same
-- condition that made it grant the gross (gstOption === 'include'). So a ledger row
-- carrying that suffix IS an over-granted top-up, recorded by the code as it happened.
-- No join, no inference from the order record. Each row's `extra` is the 18% tax
-- portion that should not have become credit.
SELECT
  COUNT(*)                                          AS topups_over_granted,
  COUNT(DISTINCT c."userId")                        AS customers_affected,
  ROUND(SUM(c.amount)::numeric, 2)                  AS credit_actually_granted,
  ROUND(SUM(c.amount - (c.amount / 1.18))::numeric, 2) AS extra_credit_granted,
  MIN(c."createdAt")::date                          AS earliest,
  MAX(c."createdAt")::date                          AS latest
FROM railway_pvc.credit_transactions c
WHERE c.type = 'add'
  AND c.reason LIKE '%includes GST%';

-- Note: this catches top-ups credited by the verify call, which is the normal path.
-- The webhook never wrote the suffix, so if it credited any of them they appear only
-- in queries 1-3 below. If query 0 and query 1 disagree, query 3 settles it.


-- ── 1. The headline: how many, and how much extra credit went out ──────────────
SELECT
  COUNT(*)                                        AS topups_affected,
  COUNT(DISTINCT t."userId")                      AS customers_affected,
  ROUND(SUM(t."totalAmount" - t."creditAmount")::numeric, 2) AS extra_credit_granted,
  ROUND(SUM(t."totalAmount")::numeric, 2)         AS total_collected,
  MIN(t."completedAt")::date                      AS earliest,
  MAX(t."completedAt")::date                      AS latest
FROM railway_pvc.razorpay_transactions t
WHERE t.status = 'success'
  AND COALESCE(t.notes->>'gstOption', 'exclude') = 'include'
  AND t."totalAmount" > t."creditAmount";


-- ── 2. Who, and by how much ────────────────────────────────────────────────────
SELECT
  u.email,
  u.name,
  t."completedAt"::date                    AS paid_on,
  t."creditAmount"                         AS promised_credit,
  t."totalAmount"                          AS granted_credit,
  t."totalAmount" - t."creditAmount"       AS extra,
  t."razorpayOrderId"
FROM railway_pvc.razorpay_transactions t
JOIN railway_pvc."User" u ON u.id = t."userId"
WHERE t.status = 'success'
  AND COALESCE(t.notes->>'gstOption', 'exclude') = 'include'
  AND t."totalAmount" > t."creditAmount"
ORDER BY t."completedAt" DESC;


-- ── 3. The proof: what the credit ledger actually recorded ─────────────────────
-- The ledger row is written at the same moment as the credit, so its amount IS what
-- landed in the wallet. If ledger_amount matches granted_credit, the over-grant is
-- real; if it matches promised_credit, it never happened and queries 1-2 overstate it.
SELECT
  u.email,
  t."completedAt"::date              AS paid_on,
  t."creditAmount"                   AS promised_credit,
  t."totalAmount"                    AS gross_paid,
  c.amount                           AS ledger_amount,
  CASE
    WHEN c.amount IS NULL                    THEN 'no ledger row'
    WHEN c.amount = t."creditAmount"         THEN 'correct'
    WHEN c.amount = t."totalAmount"          THEN 'OVER-GRANTED'
    ELSE 'something else'
  END                                AS verdict
FROM railway_pvc.razorpay_transactions t
JOIN railway_pvc."User" u ON u.id = t."userId"
LEFT JOIN railway_pvc.credit_transactions c
       ON c.type = 'add'
      AND c."userId" = t."userId"
      AND c.reason LIKE '%' || t."razorpayOrderId" || '%'
WHERE t.status = 'success'
ORDER BY t."completedAt" DESC;


-- ── 4. Current balances of the affected customers ──────────────────────────────
-- Needed before deciding anything: a wallet already spent down cannot simply be
-- reduced by the over-granted amount.
SELECT
  u.email,
  ca."creditBalance"                                       AS balance_now,
  SUM(t."totalAmount" - t."creditAmount")                  AS extra_received
FROM railway_pvc.razorpay_transactions t
JOIN railway_pvc."User" u             ON u.id = t."userId"
LEFT JOIN railway_pvc.customer_accounts ca ON ca."userId" = t."userId"
WHERE t.status = 'success'
  AND COALESCE(t.notes->>'gstOption', 'exclude') = 'include'
  AND t."totalAmount" > t."creditAmount"
GROUP BY u.email, ca."creditBalance"
ORDER BY extra_received DESC;
