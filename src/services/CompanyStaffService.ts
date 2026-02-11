/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "../utils/client";
import AppError, { ValidationError } from "../utils/error";
import type {
  CreateCompanyStaffUnionDto,
  RoleType,
} from "../utils/interfaces/common";
import { IResponse } from "../utils/interfaces/common";
import { ClinicRole, roles } from "../utils/roles";
import type { Request } from "express";
import { companyStaffValidations } from "./../varifications/companyStaff";
import { hashSync } from "bcrypt";

import { Emitter } from "../events";
import { EventType } from "../events/types";
import { QueryOptions, Paginations } from "../utils/DBHelpers";
import { EbmService } from "./EbmService";

export class CompanyStaffService {
  public static async getStaff(
    req: Request,
    searchq?: string,
    limit?: number,
    currentPage?: number,
  ) {
    const requestingUser = await prisma.companyUser.findFirst({
      where: {
        userId: req.user?.company?.companyId,
      },
    });

    const queryOptions = QueryOptions(
      ["user.firstName", "user.lastName", "user.email"],
      searchq,
    );
    const pagination = Paginations(currentPage, limit);

    const selection = {
      user: {
        select: { email: true, id: true, lastName: true, firstName: true },
      },
    };

    const companyUser = req.user?.userRoles?.some(
      (role) => role.name === roles.ADMIN,
    )
      ? await prisma.companyUser.findMany({
          where: queryOptions,
          include: selection,
          ...pagination,
          orderBy: {
            createdAt: "desc",
          },
        })
      : await prisma.companyUser.findMany({
          where: {
            companyId: requestingUser?.companyId,
            ...queryOptions,
          },
          include: selection,
          ...pagination,
          orderBy: {
            createdAt: "desc",
          },
        });

    if (!companyUser) {
      throw new AppError("Company does not exist or has no staff members", 400);
    }

    const totalItems = await prisma.companyUser.count({
      where: {
        companyId: requestingUser?.companyId,
        ...queryOptions,
      },
    });

    const staff = companyUser.map((staff) => staff.user);
    return {
      data: staff,
      statusCode: 200,
      message: "Staff members retrieved successfully",
      totalItems,
      currentPage: currentPage || 1,
      itemsPerPage: limit || 15,
    };
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
      title: staffInfo!.title,
      idNumber: staffInfo!.idNumber,
      idAttachment: staffInfo!.idAttachment,
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
    const requestingUser = await prisma.companyUser.findFirst({
      where: {
        userId: req.user?.id,
      },
      include: {
        company: true,
        user: true,
      },
    });

    if (!requestingUser || !requestingUser.company) {
      throw new AppError(
        "Company does not exist or you do not have access",
        400,
      );
    }

    const companyId = requestingUser.company.id;

    const queryOptions = QueryOptions(
      ["user.firstName", "user.lastName", "user.email"],
      searchq,
    );
    const pagination = Paginations(currentPage, limit);

    const companyUsers = await prisma.companyUser.findMany({
      where: {
        companyId: companyId,
        ...queryOptions,
      },
      include: {
        user: {
          select: {
            email: true,
            id: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            photo: true,
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

    if (companyUsers.length === 0) {
      throw new AppError("No staff members found for your company", 404);
    }

    const totalItems = await prisma.companyUser.count({
      where: {
        companyId: companyId,
        ...queryOptions,
      },
    });

    const staff = companyUsers.map((companyUser) => {
      // Combine both role types
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
        title: companyUser.title,
        idNumber: companyUser.idNumber,
        idAttachment: companyUser.idAttachment,
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

    // Fetch the company to check its industry
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { industry: true, TIN: true }, // Include TIN for EBM
    });

    if (!company) {
      throw new AppError("Company not found", 404);
    }

    // Determine if this is a healthcare company
    const isHealthcareCompany = ["clinic", "hospital"].includes(
      (company.industry || "").toLowerCase(),
    );

    // Validate Branch Assignment
    if (data.branchId) {
      const branch = await prisma.branch.findUnique({
        where: { id: data.branchId },
      });
      if (!branch) throw new AppError("The specified branch does not exist", 404);
      if (branch.companyId !== companyId) {
        throw new AppError(
          "The specified branch does not belong to your company",
          403,
        );
      }
    }

    // Save user to EBM before creating in database
    if (req?.user) {
      // BYPASSED FOR NOW - Allow user to pass without waiting for EBM response
      // const ebmResponse = await EbmService.saveUserToEBM(
      //   data,
      //   company,
      //   req.user,
      //   data.branchId,
      // );
      //
      // if (ebmResponse.resultCd !== "000") {
      //   throw new AppError(
      //     `EBM Registration Failed: ${ebmResponse.resultMsg}`,
      //     400,
      //   );
      // }
      // Mock success - user will be created without EBM sync
    }

    // Check if the role is a ClinicRole
    const isClinicRole = Object.values(ClinicRole).includes(data.role as any);

    const userInfo = await prisma.user.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phoneNumber: data.phoneNumber,
        password: hashSync("Password123!", 10),

        // Conditionally create the appropriate role
        ...(isHealthcareCompany && isClinicRole
          ? {
              clinicUserRoles: {
                create: {
                  role: data.role as ClinicRole, // Use ClinicRole
                },
              },
            }
          : {
              userRoles: {
                create: {
                  name: data.role as RoleType, // Use RoleType
                },
              },
            }),
      },
      include: {
        userRoles: true,
        clinicUserRoles: true,
      },
    });

    // Create the company user entry
    await prisma.companyUser.create({
      data: {
        companyId: companyId,
        userId: userInfo.id,
        title: data.title ?? "N/A",
        idNumber: data.idNumber ?? "N/A",
        idAttachment:
          typeof data.idAttachment === "string" ? data.idAttachment : undefined,
        branchId: data.branchId,
      },
    });

    return userInfo;
  }

  public static async updateCompanyStaff(
    id: string,
    data: CreateCompanyStaffUnionDto,
    companyId: string,
  ) {
    try {
      // Check if email, phoneNumber, or idNumber is already taken by another user
      const errors = await companyStaffValidations.onUpdate(id, data);
      if (errors[0]) {
        throw new ValidationError(errors);
      }

      // Validate Branch Assignment if provided
      if (data.branchId) {
        const branch = await prisma.branch.findUnique({
          where: { id: data.branchId },
        });
        if (!branch) throw new AppError("The specified branch does not exist", 404);
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
          branchId: data.branchId,
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

  public static async deleteCompanyStaff(id: string) {
    try {
      // Delete the company user entry
      await prisma.companyUser.delete({
        where: { userId: id },
      });

      await prisma.userRole.deleteMany({
        where: { userId: id },
      });
      // Delete the user entry
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
}
