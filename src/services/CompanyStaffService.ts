/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "../utils/client";
import AppError, { ValidationError } from "../utils/error";
import type {
  CreateCompanyStaffUnionDto,
  RoleType,
} from "../utils/interfaces/common";
import { IResponse } from "../utils/interfaces/common";
import {
  ClinicRole,
  roles,
  assertAssignableCompanyRole,
  isPlatformRole,
} from "../utils/roles";
import type { Request } from "express";
import { companyStaffValidations } from "./../varifications/companyStaff";
import { hashSync } from "bcrypt";

import { Emitter } from "../events";
import { EventType } from "../events/types";
import { QueryOptions, Paginations } from "../utils/DBHelpers";
import { EbmService } from "./EbmService";
import { assertCanAddCompanyUser } from "../utils/subscriptionQuotas";

type StaffAccess = {
  companyId: string;
  /** When set, list/mutate only this branch (BRANCH_ADMIN lock or COMPANY_ADMIN filter). */
  branchScope: string | null;
  isBranchAdminOnly: boolean;
};

function resolveStaffAccess(req: Request): StaffAccess {
  const companyId = req.user?.company?.companyId;
  if (!companyId) {
    throw new AppError("Company context is required", 400);
  }

  const roleNames = (req.user?.userRoles || []).map((r) => r.name as string);
  const isCompanyWide =
    roleNames.includes(roles.COMPANY_ADMIN) || isPlatformRole(roleNames);
  const isBranchAdminOnly =
    roleNames.includes(roles.BRANCH_ADMIN) && !isCompanyWide;

  const branchScope = isBranchAdminOnly
    ? req.user?.branchId || req.user?.company?.branchId || null
    : req.user?.branchId || null;

  if (isBranchAdminOnly && !branchScope) {
    throw new AppError("BRANCH_ADMIN must be assigned to a branch", 400);
  }

  return { companyId, branchScope, isBranchAdminOnly };
}

/** BRANCH_ADMIN may only assign branch-level roles (not COMPANY_ADMIN). */
function assertBranchAdminAssignableRole(role: string): void {
  const allowed = [roles.BRANCH_ADMIN, roles.STAFF, ...Object.values(ClinicRole)];
  if (!allowed.includes(role as any)) {
    throw new AppError(
      `BRANCH_ADMIN can only assign: BRANCH_ADMIN, STAFF, or clinic roles`,
      403,
    );
  }
}

export class CompanyStaffService {
  public static async getStaff(
    req: Request,
    searchq?: string,
    limit?: number,
    currentPage?: number,
  ) {
    return this.getAllMyStaff(req, searchq, limit, currentPage);
  }

  public static async getCompanyStaff(id: string) {
    const staffInfo = await prisma.companyUser.findUnique({
      where: { userId: id },
      include: {
        user: true,
      },
    });
    const response = {
      id: staffInfo!.id,
      firstName: staffInfo!.user.firstName,
      lastName: staffInfo!.user.lastName,
      email: staffInfo!.user.email,
      mrcNo: staffInfo!.user.mrcNo,
      title: staffInfo!.title,
      idNumber: staffInfo!.idNumber,
      idAttachment: staffInfo!.idAttachment,
      branchId: staffInfo!.branchId,
    };
    return {
      message: "company fetched successfully",
      statusCode: 200,
      data: response,
    };
  }

  public static async getAllMyStaff(
    req: Request,
    searchq?: string,
    limit?: number,
    currentPage?: number,
  ) {
    const { companyId, branchScope } = resolveStaffAccess(req);

    const queryOptions = QueryOptions(
      ["user.firstName", "user.lastName", "user.email"],
      searchq,
    );
    const pagination = Paginations(currentPage, limit);

    const where = {
      companyId,
      ...(branchScope ? { branchId: branchScope } : {}),
      ...queryOptions,
    };

    const companyUsers = await prisma.companyUser.findMany({
      where,
      include: {
        branch: {
          select: { id: true, name: true, bhfId: true },
        },
        user: {
          select: {
            email: true,
            id: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            photo: true,
            mrcNo: true,
            userRoles: true,
            clinicUserRoles: true,
          },
        },
      },
      ...pagination,
      orderBy: {
        createdAt: "desc",
      },
    });

    const totalItems = await prisma.companyUser.count({ where });

    const staff = companyUsers.map((companyUser) => {
      const systemRoles = companyUser.user.userRoles.map((role) => role.name);
      const clinicRoles = companyUser.user.clinicUserRoles.map(
        (role) => role.role,
      );
      const allRoles = [...systemRoles, ...clinicRoles];

      return {
        id: companyUser.user.id,
        firstName: companyUser.user.firstName,
        lastName: companyUser.user.lastName,
        email: companyUser.user.email,
        phoneNumber: companyUser.user.phoneNumber,
        photo: companyUser.user.photo,
        mrcNo: companyUser.user.mrcNo,
        title: companyUser.title,
        idNumber: companyUser.idNumber,
        idAttachment: companyUser.idAttachment,
        branchId: companyUser.branchId,
        branchName: companyUser.branch?.name ?? null,
        branchBhfId: companyUser.branch?.bhfId ?? null,
        role: allRoles.join(", "),
      };
    });

    return {
      data: staff,
      statusCode: 200,
      message: "Staff members retrieved successfully",
      totalItems,
      currentPage: currentPage || 1,
      itemsPerPage: limit || 15,
    };
  }

  public static async getCompanyStaffCountByMonth(
    companyId: string,
    year: number,
  ): Promise<IResponse<any>> {
    try {
      const companyStaff = await prisma.companyUser.findMany({
        where: {
          companyId: companyId,
          createdAt: {
            gte: new Date(`${year}-01-01`),
            lt: new Date(`${year + 1}-01-01`),
          },
        },
        select: {
          createdAt: true,
        },
      });

      const staffByMonth = Array(12).fill(0);

      companyStaff.forEach((staff) => {
        const month = new Date(staff.createdAt).getMonth();
        staffByMonth[month]++;
      });

      return {
        message: "Company staff count by month fetched successfully",
        statusCode: 200,
        data: staffByMonth,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  static async createCompanyStaff(
    data: CreateCompanyStaffUnionDto,
    companyId: string,
    req?: Request,
  ) {
    const errors = await companyStaffValidations.onCreate(data);
    if (errors[0]) {
      throw new ValidationError(errors);
    }

    await assertCanAddCompanyUser(companyId);

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, industry: true, TIN: true },
    });

    if (!company) {
      throw new AppError("Company not found", 404);
    }

    const isHealthcareCompany = ["clinic"].includes(
      (company.industry || "").toLowerCase(),
    );

    let branchId = data.branchId || null;
    if (req) {
      const access = resolveStaffAccess(req);
      if (access.isBranchAdminOnly) {
        branchId = access.branchScope;
        assertBranchAdminAssignableRole(data.role);
      }
    }

    if (branchId) {
      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
      });
      if (!branch)
        throw new AppError("The specified branch does not exist", 404);
      if (branch.companyId !== companyId) {
        throw new AppError(
          "The specified branch does not belong to your company",
          403,
        );
      }
    } else if (req) {
      const access = resolveStaffAccess(req);
      if (access.isBranchAdminOnly) {
        throw new AppError("Branch is required", 400);
      }
    }

    if (req?.user) {
      const ebmResponse = await EbmService.saveUserToEBM(
        data,
        company,
        req.user,
        branchId,
      );

      if (ebmResponse.resultCd !== "000") {
        throw new AppError(
          `EBM Registration Failed: ${ebmResponse.resultMsg}`,
          400,
        );
      }
    }

    const isClinicRole = Object.values(ClinicRole).includes(data.role as any);
    if (!isClinicRole) {
      assertAssignableCompanyRole(data.role);
    }

    const userInfo = await prisma.user.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phoneNumber: data.phoneNumber,
        password: hashSync("Password123!", 10),

        ...(isHealthcareCompany && isClinicRole
          ? {
              clinicUserRoles: {
                create: {
                  role: data.role as ClinicRole,
                },
              },
            }
          : {
              userRoles: {
                create: {
                  name: data.role as RoleType,
                },
              },
            }),
      },
      include: {
        userRoles: true,
        clinicUserRoles: true,
      },
    });

    await prisma.companyUser.create({
      data: {
        companyId: companyId,
        userId: userInfo.id,
        title: data.title ?? "N/A",
        idNumber: data.idNumber ?? "N/A",
        idAttachment:
          typeof data.idAttachment === "string" ? data.idAttachment : undefined,
        branchId,
      },
    });

    return userInfo;
  }

  public static async updateCompanyStaff(
    id: string,
    data: CreateCompanyStaffUnionDto,
    companyId: string,
    req?: Request,
  ) {
    try {
      const errors = await companyStaffValidations.onUpdate(id, data);
      if (errors[0]) {
        throw new ValidationError(errors);
      }

      await this.assertCanManageStaff(id, companyId, req);

      let branchId = data.branchId || null;
      if (req) {
        const access = resolveStaffAccess(req);
        if (access.isBranchAdminOnly) {
          branchId = access.branchScope;
          if (data.role) assertBranchAdminAssignableRole(data.role);
        }
      }

      if (branchId) {
        const branch = await prisma.branch.findUnique({
          where: { id: branchId },
        });
        if (!branch)
          throw new AppError("The specified branch does not exist", 404);
        if (branch.companyId !== companyId) {
          throw new AppError(
            "The specified branch does not belong to your company",
            403,
          );
        }
      }

      const updatedCompanyStaff = await prisma.user.update({
        where: { id: id },
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phoneNumber: data.phoneNumber,
        },
      });

      await prisma.companyUser.update({
        where: { userId: id },
        data: {
          title: data.title,
          idNumber: data.idNumber,
          idAttachment:
            typeof data.idAttachment === "string"
              ? data.idAttachment
              : undefined,
          branchId,
        },
      });

      Emitter.emit(
        EventType.COMPANY_STAFF_UPDATED,
        updatedCompanyStaff,
        data,
        companyId,
      );

      return {
        message: "Company staff updated successfully",
        statusCode: 200,
        data: updatedCompanyStaff,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async deleteCompanyStaff(id: string, req?: Request) {
    try {
      const companyId = req?.user?.company?.companyId;
      if (companyId) {
        await this.assertCanManageStaff(id, companyId, req);
      }

      await prisma.companyUser.delete({
        where: { userId: id },
      });

      await prisma.userRole.deleteMany({
        where: { userId: id },
      });
      const deletedUser = await prisma.user.delete({
        where: { id },
      });

      Emitter.emit(EventType.COMPANY_STAFF_DELETED, deletedUser);

      return {
        message: "Company staff member deleted successfully",
        statusCode: 200,
        data: deletedUser,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  private static async assertCanManageStaff(
    userId: string,
    companyId: string,
    req?: Request,
  ) {
    const membership = await prisma.companyUser.findUnique({
      where: { userId },
      select: { companyId: true, branchId: true },
    });
    if (!membership || membership.companyId !== companyId) {
      throw new AppError("Staff member not found in your company", 404);
    }
    if (req) {
      const access = resolveStaffAccess(req);
      if (
        access.branchScope &&
        membership.branchId &&
        membership.branchId !== access.branchScope
      ) {
        throw new AppError(
          "You can only manage staff assigned to your branch",
          403,
        );
      }
      if (access.isBranchAdminOnly && membership.branchId !== access.branchScope) {
        throw new AppError(
          "You can only manage staff assigned to your branch",
          403,
        );
      }
    }
  }

  public static async updateStaffMrcNumber(
    userId: string,
    newMrcNo: string,
    companyId: string,
    req?: Request,
  ) {
    try {
      await this.assertCanManageStaff(userId, companyId, req);

      const staffMember = await prisma.companyUser.findUnique({
        where: { userId },
        include: {
          user: true,
          company: true,
        },
      });

      if (!staffMember) {
        throw new AppError("Staff member not found", 404);
      }

      if (!newMrcNo || newMrcNo.trim().length !== 11) {
        throw new AppError(
          "MRC number must be exactly 11 characters long",
          400,
        );
      }

      const existingUser = await prisma.user.findUnique({
        where: { mrcNo: newMrcNo },
      });

      if (existingUser && existingUser.id !== userId) {
        throw new AppError("MRC number is already in use", 400);
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { mrcNo: newMrcNo },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          mrcNo: true,
          phoneNumber: true,
          photo: true,
        },
      });

      return {
        statusCode: 200,
        message: "Staff MRC number updated successfully",
        data: updatedUser,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }
}
