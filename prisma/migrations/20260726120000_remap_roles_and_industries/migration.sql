-- Remap obsolete product roles to STAFF (or drop duplicate role rows).
-- Keeps Prisma RoleType enum values in place for DB compatibility;
-- application code no longer assigns AGENT / COMPANY_USER / MANAGER / ADMINISTRATOR.

UPDATE "UserRole"
SET name = 'STAFF'
WHERE name IN ('AGENT', 'COMPANY_USER', 'MANAGER', 'ADMINISTRATOR');

-- Normalize legacy industries to supported set
UPDATE "Company"
SET industry = 'CLINIC'
WHERE industry IN ('HOSPITAL', 'LABORATORY');

UPDATE "Company"
SET industry = 'SBMS'
WHERE industry IN ('INSURANCE', 'REGULATORY');
