-- Backfill NULL branchId to each company's EBM-initialized branch.
-- Preference: isEbmInitialized = true → bhfId = '00' → oldest branch.
--
-- Prefer the Node runner (avoids prisma db execute schema quirks):
--   npx ts-node prisma/scripts/runBackfillBranchId.ts
--
-- Or via psql:
--   psql "$DATABASE_URL" -f prisma/scripts/backfill_branch_id.sql
--
-- Safe to re-run: only updates rows where "branchId" IS NULL.
-- Skips tables that do not exist in the database.

BEGIN;

CREATE TEMP TABLE company_target_branch ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    b.id AS "branchId",
    b."companyId",
    ROW_NUMBER() OVER (
      PARTITION BY b."companyId"
      ORDER BY
        CASE WHEN b."isEbmInitialized" THEN 0 ELSE 1 END,
        CASE WHEN b."bhfId" = '00' THEN 0 ELSE 1 END,
        b."createdAt" ASC,
        b.id ASC
    ) AS rn
  FROM "Branch" b
)
SELECT "companyId", "branchId"
FROM ranked
WHERE rn = 1;

-- Skip quietly when table or company column is missing
CREATE OR REPLACE FUNCTION pg_temp.backfill_branch(p_table text, p_company_col text DEFAULT 'companyId')
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  updated_count bigint := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_table
  ) THEN
    RETURN format('SKIP missing table %s', p_table);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table
      AND column_name = p_company_col
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table
      AND column_name = 'branchId'
  ) THEN
    RETURN format('SKIP missing columns on %s', p_table);
  END IF;

  EXECUTE format(
    'UPDATE %I t
     SET "branchId" = ctb."branchId"
     FROM company_target_branch ctb
     WHERE t.%I = ctb."companyId"
       AND t."branchId" IS NULL',
    p_table,
    p_company_col
  );

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN format('OK %s updated=%s', p_table, updated_count);
END;
$$;

-- Shared / stock / pharmacy (Prisma @@map names where different)
SELECT pg_temp.backfill_branch('CompanyUser');
SELECT pg_temp.backfill_branch('ItemCategories');
SELECT pg_temp.backfill_branch('Suppliers');
SELECT pg_temp.backfill_branch('Items');
SELECT pg_temp.backfill_branch('StockReceipts');
SELECT pg_temp.backfill_branch('Stock');

UPDATE "Stock" t
SET "branchId" = COALESCE(sr."branchId", ctb."branchId"),
    "companyId" = COALESCE(t."companyId", sr."companyId")
FROM "StockReceipts" sr
JOIN company_target_branch ctb ON ctb."companyId" = sr."companyId"
WHERE t."stockReceiptId" = sr.id
  AND t."branchId" IS NULL;

SELECT pg_temp.backfill_branch('PurchaseOrder');
SELECT pg_temp.backfill_branch('Client');
SELECT pg_temp.backfill_branch('Sell');
SELECT pg_temp.backfill_branch('Transaction');
SELECT pg_temp.backfill_branch('Warehouse');
SELECT pg_temp.backfill_branch('DirectInvoice');
SELECT pg_temp.backfill_branch('Insurance');
SELECT pg_temp.backfill_branch('InsuranceCard');
SELECT pg_temp.backfill_branch('BranchInsurance');
SELECT pg_temp.backfill_branch('XReportSession');
SELECT pg_temp.backfill_branch('ZReportSession');
SELECT pg_temp.backfill_branch('DailyOpeningDeposit');

SELECT pg_temp.backfill_branch('Delivery', 'buyerCompanyId');
SELECT pg_temp.backfill_branch('PurchaseOrderProcessing', 'companyFromId');

UPDATE "SellItem" si
SET "branchId" = COALESCE(s."branchId", ctb."branchId")
FROM "Sell" s
JOIN company_target_branch ctb ON ctb."companyId" = s."companyId"
WHERE si."sellId" = s.id
  AND si."branchId" IS NULL;

-- Clinic / EMR
SELECT pg_temp.backfill_branch('Patient');
SELECT pg_temp.backfill_branch('Appointment');
SELECT pg_temp.backfill_branch('Encounter');
SELECT pg_temp.backfill_branch('Triage');
SELECT pg_temp.backfill_branch('Consultation');
SELECT pg_temp.backfill_branch('Diagnosis');
SELECT pg_temp.backfill_branch('Prescription');
SELECT pg_temp.backfill_branch('LabOrder');
SELECT pg_temp.backfill_branch('ImagingOrder');
SELECT pg_temp.backfill_branch('ProcedureOrder');
SELECT pg_temp.backfill_branch('ClinicalNote');
SELECT pg_temp.backfill_branch('CareProgram');
SELECT pg_temp.backfill_branch('CareProgramEnrollment');
SELECT pg_temp.backfill_branch('CareProgramVisit');
SELECT pg_temp.backfill_branch('LabTest');
SELECT pg_temp.backfill_branch('LabResult');
SELECT pg_temp.backfill_branch('LabQualityControl');
SELECT pg_temp.backfill_branch('LabTurnaroundStats');
SELECT pg_temp.backfill_branch('InsuranceClaim');
SELECT pg_temp.backfill_branch('ClinicBilling');
SELECT pg_temp.backfill_branch('PharmacyDispenses');
SELECT pg_temp.backfill_branch('OtcSales');
SELECT pg_temp.backfill_branch('PharmacyReturns');
SELECT pg_temp.backfill_branch('PharmacyAdjustments');
-- mapped table name (@@map("patient_allergies"))
SELECT pg_temp.backfill_branch('patient_allergies');
SELECT pg_temp.backfill_branch('StockIssuance');
SELECT pg_temp.backfill_branch('StockTransfer');
SELECT pg_temp.backfill_branch('StockAdjustment');
SELECT pg_temp.backfill_branch('StockMovement');
SELECT pg_temp.backfill_branch('ReorderRule');
SELECT pg_temp.backfill_branch('StockAlert');

COMMIT;
