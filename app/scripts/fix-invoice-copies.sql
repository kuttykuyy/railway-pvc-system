-- Bring the app's stored invoice copies into line with Zoho.
-- Paste the whole thing. It shows you the rows, changes them, shows them again, and
-- stops WITHOUT saving. Nothing is permanent until you run COMMIT; yourself.

BEGIN;

-- BEFORE — every stored copy beside what Zoho recorded.
SELECT
  g."invoiceNumber",
  g."invoiceDate"::date              AS dated,
  g.subtotal                         AS copy_subtotal,
  g."totalGst"                       AS copy_gst,
  g."totalAmount"                    AS copy_total,
  t."creditAmount"                   AS zoho_subtotal,
  t."gstAmount"                      AS zoho_gst,
  t."totalAmount"                    AS zoho_total,
  CASE WHEN ROUND(g.subtotal::numeric, 2) = ROUND(t."creditAmount"::numeric, 2)
       THEN 'matches Zoho' ELSE 'UNDERSTATED' END AS verdict
FROM railway_pvc.gst_invoices g
JOIN railway_pvc.razorpay_transactions t ON t.id = g."razorpayTransactionId"
ORDER BY g."invoiceDate" DESC;

-- THE CORRECTION — only rows that disagree with Zoho are touched.
-- Every one of these is an intra-state supply (the app charged a Tamil Nadu
-- CGST+SGST split throughout), so the tax is halved and the odd paisa goes to SGST.
UPDATE railway_pvc.gst_invoices g
SET subtotal      = t."creditAmount",
    cgst          = ROUND((t."gstAmount" / 2)::numeric, 2),
    sgst          = t."gstAmount" - ROUND((t."gstAmount" / 2)::numeric, 2),
    igst          = 0,
    "totalGst"    = t."gstAmount",
    "totalAmount" = t."totalAmount"
FROM railway_pvc.razorpay_transactions t
WHERE t.id = g."razorpayTransactionId"
  AND ROUND(g.subtotal::numeric, 2) <> ROUND(t."creditAmount"::numeric, 2);

-- AFTER — every row should now read 'matches Zoho'.
SELECT
  g."invoiceNumber",
  g.subtotal, g.cgst, g.sgst, g."totalGst", g."totalAmount",
  CASE WHEN ROUND(g.subtotal::numeric, 2) = ROUND(t."creditAmount"::numeric, 2)
       THEN 'matches Zoho' ELSE 'STILL WRONG' END AS verdict
FROM railway_pvc.gst_invoices g
JOIN railway_pvc.razorpay_transactions t ON t.id = g."razorpayTransactionId"
ORDER BY g."invoiceDate" DESC;

-- Nothing above is saved yet.
--   Every row says 'matches Zoho'  ->  run:  COMMIT;
--   Anything looks wrong           ->  run:  ROLLBACK;
