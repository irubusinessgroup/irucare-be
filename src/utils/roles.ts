/**
 * Canonical system roles.
 * Prisma RoleType enum matches these values only.
 */
export enum roles {
  ADMIN = "ADMIN",
  DEVELOPER = "DEVELOPER",
  COMPANY_ADMIN = "COMPANY_ADMIN",
  BRANCH_ADMIN = "BRANCH_ADMIN",
  STAFF = "STAFF",
  CLIENT = "CLIENT",
}

/** Platform operators — same product powers; ADMIN also manages tenants. */
export const PLATFORM_ROLES = [roles.ADMIN, roles.DEVELOPER] as const;

/** Roles that may be assigned on platform user create/update. */
export const ASSIGNABLE_PLATFORM_ROLES = [
  roles.ADMIN,
  roles.DEVELOPER,
  roles.COMPANY_ADMIN,
  roles.BRANCH_ADMIN,
  roles.STAFF,
  roles.CLIENT,
] as const;

/** Roles COMPANY_ADMIN may assign to company staff (system roles). */
export const ASSIGNABLE_COMPANY_ROLES = [
  roles.COMPANY_ADMIN,
  roles.BRANCH_ADMIN,
  roles.STAFF,
] as const;

/** Can operate a full company (or switched-into company). */
export const COMPANY_ADMIN_ROLES = [roles.COMPANY_ADMIN, ...PLATFORM_ROLES] as const;

/** Branch managers — full branch ops, not company-wide settings. */
export const BRANCH_ADMIN_ROLES = [
  roles.BRANCH_ADMIN,
  roles.COMPANY_ADMIN,
  ...PLATFORM_ROLES,
] as const;

/**
 * STAFF — day-to-day branch operator:
 * sales, clients, stock view/receive, items view, transactions view.
 * Not: staff mgmt, branches, VAT/EBM company settings, platform admin.
 */
export const STAFF_OPS_ROLES = [
  roles.STAFF,
  roles.BRANCH_ADMIN,
  roles.COMPANY_ADMIN,
  ...PLATFORM_ROLES,
] as const;

/** Roles that may enter the dashboard at all. CLIENT is record-only. */
export const DASHBOARD_ROLES = [
  roles.ADMIN,
  roles.DEVELOPER,
  roles.COMPANY_ADMIN,
  roles.BRANCH_ADMIN,
  roles.STAFF,
] as const;

export const LEGACY_ROLES_TO_MIGRATE = [] as const; // removed from RoleType enum

export enum ClinicRole {
  CLINIC_ADMIN = "CLINIC_ADMIN",
  RECEPTIONIST = "RECEPTIONIST",
  NURSE = "NURSE",
  PROVIDER = "PROVIDER",
  LAB_TECH = "LAB_TECH",
  PHARMACIST = "PHARMACIST",
  ACCOUNTANT = "ACCOUNTANT",
}

export function isPlatformRole(roleNames: string[]): boolean {
  return roleNames.some((r) =>
    (PLATFORM_ROLES as readonly string[]).includes(r),
  );
}

export function isDashboardAllowed(roleNames: string[]): boolean {
  return roleNames.some((r) =>
    (DASHBOARD_ROLES as readonly string[]).includes(r),
  );
}

export function assertAssignablePlatformRole(role: string): void {
  if (!(ASSIGNABLE_PLATFORM_ROLES as readonly string[]).includes(role)) {
    throw new Error(
      `Invalid role "${role}". Allowed: ${ASSIGNABLE_PLATFORM_ROLES.join(", ")}`,
    );
  }
}

export function assertAssignableCompanyRole(role: string): void {
  if (!(ASSIGNABLE_COMPANY_ROLES as readonly string[]).includes(role)) {
    // Clinic roles are validated separately
    if (Object.values(ClinicRole).includes(role as ClinicRole)) return;
    throw new Error(
      `Invalid staff role "${role}". Allowed: ${ASSIGNABLE_COMPANY_ROLES.join(", ")} or clinic roles`,
    );
  }
}
