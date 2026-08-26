-- Ensure every company has at least one branch (Main / bhfId 00).
INSERT INTO "Branch" (id, name, location, "bhfId", "companyId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       'Main Branch',
       COALESCE(
         NULLIF(TRIM(CONCAT_WS(', ', c.province, c.district, c.sector)), ''),
         'Main Location'
       ),
       '00',
       c.id,
       NOW(),
       NOW()
FROM "Company" c
WHERE NOT EXISTS (
  SELECT 1 FROM "Branch" b WHERE b."companyId" = c.id
);

-- Assign company admins without a branch to their company's main branch
UPDATE "CompanyUser" cu
SET "branchId" = b.id
FROM "Branch" b
WHERE cu."companyId" = b."companyId"
  AND b."bhfId" = '00'
  AND cu."branchId" IS NULL;

-- Backfill null branchId on core operational tables to company Main branch
UPDATE "Client" t
SET "branchId" = b.id
FROM "Branch" b
WHERE t."companyId" = b."companyId"
  AND b."bhfId" = '00'
  AND t."branchId" IS NULL;

UPDATE "Items" t
SET "branchId" = b.id
FROM "Branch" b
WHERE t."companyId" = b."companyId"
  AND b."bhfId" = '00'
  AND t."branchId" IS NULL;

UPDATE "Suppliers" t
SET "branchId" = b.id
FROM "Branch" b
WHERE t."companyId" = b."companyId"
  AND b."bhfId" = '00'
  AND t."branchId" IS NULL;

UPDATE "Sell" t
SET "branchId" = b.id
FROM "Branch" b
WHERE t."companyId" = b."companyId"
  AND b."bhfId" = '00'
  AND t."branchId" IS NULL;

UPDATE "Transaction" t
SET "branchId" = b.id
FROM "Branch" b
WHERE t."companyId" = b."companyId"
  AND b."bhfId" = '00'
  AND t."branchId" IS NULL;

UPDATE "PurchaseOrder" t
SET "branchId" = b.id
FROM "Branch" b
WHERE t."companyId" = b."companyId"
  AND b."bhfId" = '00'
  AND t."branchId" IS NULL;

UPDATE "StockReceipts" t
SET "branchId" = b.id
FROM "Branch" b
WHERE t."companyId" = b."companyId"
  AND b."bhfId" = '00'
  AND t."branchId" IS NULL;

UPDATE "Stock" t
SET "branchId" = b.id
FROM "StockReceipts" sr
JOIN "Branch" b ON b."companyId" = sr."companyId" AND b."bhfId" = '00'
WHERE t."stockReceiptId" = sr.id
  AND t."branchId" IS NULL;

UPDATE "Warehouse" t
SET "branchId" = b.id
FROM "Branch" b
WHERE t."companyId" = b."companyId"
  AND b."bhfId" = '00'
  AND t."branchId" IS NULL;

UPDATE "Insurance" t
SET "branchId" = b.id
FROM "Branch" b
WHERE t."companyId" = b."companyId"
  AND b."bhfId" = '00'
  AND t."branchId" IS NULL;

UPDATE "InsuranceCard" t
SET "branchId" = b.id
FROM "Branch" b
WHERE t."companyId" = b."companyId"
  AND b."bhfId" = '00'
  AND t."branchId" IS NULL;

UPDATE "ItemCategories" t
SET "branchId" = b.id
FROM "Branch" b
WHERE t."companyId" = b."companyId"
  AND b."bhfId" = '00'
  AND t."branchId" IS NULL;

UPDATE "Delivery" t
SET "branchId" = b.id
FROM "Branch" b
WHERE t."buyerCompanyId" = b."companyId"
  AND b."bhfId" = '00'
  AND t."branchId" IS NULL;
