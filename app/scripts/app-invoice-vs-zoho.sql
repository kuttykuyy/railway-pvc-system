-- The app's own invoice copies vs what Zoho recorded, for the eight affected payments.
--
-- Zoho is the invoice of record and it is correct: createZohoInvoice is given
-- rate = creditAmount with tax_percentage 18, so it billed Rs 1,000 + Rs 180 = Rs 1,180
-- and never consulted gstOption. Nothing is owed and no return needs correcting.
--
-- The app's stored copy is the only thing that is wrong: it was written on an
-- inclusive basis, so it shows a Rs 847.46 supply carrying Rs 152.54 of tax on the
-- same payment. A customer downloading that PDF holds a document that disagrees with
-- the one their input credit is claimed from.

-- ── 1. See the mismatch ────────────────────────────────────────────────────────
SELECT
  g."invoiceNumber",
  u.email,
  g."invoiceDate"::date,
  -- what the app's copy says
  g.subtotal          AS copy_subtotal,
  g."totalGst"        AS copy_gst,
  g."totalAmount"     AS copy_total,
  -- what Zoho recorded, and what was actually charged
  t."creditAmount"    AS zoho_subtotal,
  t."gstAmount"       AS zoho_gst,
  t."totalAmount"     AS zoho_total,
  CASE
    WHEN ROUND(g.subtotal::numeric, 2) = ROUND(t."creditAmount"::numeric, 2)
      THEN 'matches Zoho'
    ELSE 'UNDERSTATED'
  END                 AS verdict
FROM railway_pvc.gst_invoices g
JOIN railway_pvc.razorpay_transactions t ON t.id = g."razorpayTransactionId"
JOIN railway_pvc."User" u                ON u.id = g."userId"
ORDER BY g."invoiceDate" DESC;


-- ── 2. Correct the copies to match Zoho ────────────────────────────────────────
-- Only run this once query 1 has shown you which rows say UNDERSTATED, and only for
-- an intra-state (CGST + SGST) supply, which every one of these is -- the app charged
-- a Tamil Nadu split throughout. Rows already matching Zoho are left alone by the
-- WHERE clause. Wrap it in a transaction so you can look before committing.
--
-- BEGIN;
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
-- Re-run query 1 here: every row should now say 'matches Zoho'.
-- COMMIT;   -- or ROLLBACK; if anything looks wrong
