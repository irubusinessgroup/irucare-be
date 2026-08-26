-- Drop obsolete RoleType enum values after rows were remapped to STAFF.
-- Postgres requires recreating the enum type.

-- Safety: remap any stragglers first
UPDATE "UserRole"
SET name = 'STAFF'
WHERE name::text IN ('AGENT', 'COMPANY_USER', 'MANAGER', 'ADMINISTRATOR');

ALTER TYPE "RoleType" RENAME TO "RoleType_old";

CREATE TYPE "RoleType" AS ENUM (
  'ADMIN',
  'COMPANY_ADMIN',
  'DEVELOPER',
  'STAFF',
  'CLIENT',
  'BRANCH_ADMIN'
);

ALTER TABLE "UserRole"
  ALTER COLUMN name TYPE "RoleType"
  USING name::text::"RoleType";

DROP TYPE "RoleType_old";
