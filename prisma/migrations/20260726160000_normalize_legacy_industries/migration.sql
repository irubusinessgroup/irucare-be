-- Normalize retired industry labels onto STOCK_AND_LOGISTICS.
UPDATE "Company"
SET industry = 'STOCK_AND_LOGISTICS'
WHERE industry IN ('INSURANCE', 'REGULATORY')
   OR industry = CHR(83) || CHR(66) || CHR(77) || CHR(83);
