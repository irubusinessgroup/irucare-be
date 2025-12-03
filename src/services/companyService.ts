/* eslint-disable @typescript-eslint/no-explicit-any */
import { companyValidations } from "./../varifications/company";
import { Emitter } from "../events";
import { EventType } from "../events/types";
import { QueryOptions, Paginations } from "../utils/DBHelpers";

import { prisma } from "../utils/client";
import AppError, { ValidationError } from "../utils/error";
import { CreateCompanyDto, IResponse } from "../utils/interfaces/common";
import { roles } from "../utils/roles";
import { ItemSeederService } from "./ItemSeederService";

export class companyService {
  public static async getCompanies(
    searchq?: string,
    limit?: number,
    currentPage?: number,
  ) {
    try {
      const queryOptions = QueryOptions(
        ["name", "email", "phoneNumber"],
        searchq,
      );
      const pagination = Paginations(currentPage, limit);

      const companies = await prisma.company.findMany({
        where: queryOptions,
        include: {
          CompanyUser: {
            where: {
              user: {
                userRoles: {
                  some: {
                    name: roles.COMPANY_ADMIN,
                  },
                },
              },
            },
            take: 1,
            include: {
              user: true,
            },
          },
        },
        ...pagination,
        orderBy: {
          createdAt: "desc",
        },
      });

      const totalItems = await prisma.company.count({
        where: queryOptions,
      });

      const response = companies.map((company) => ({
        company: {
          id: company!.id,
          name: company!.name,
          country: company!.country,
          province: company!.province,
          district: company!.district,
          sector: company!.sector,
          phoneNumber: company!.phoneNumber,
          email: company!.email,
          industry: company!.industry,
          website: company!.website,
          TIN: company!.TIN,
          type: company!.type,
          certificate: company!.certificate,
          logo: company!.logo,
          isActive: company!.isActive,
        },
        contactPerson:
          company.CompanyUser.length > 0
            ? {
                id: company.CompanyUser[0].user.id,
                firstName: company.CompanyUser[0].user.firstName,
                lastName: company.CompanyUser[0].user.lastName,
                email: company.CompanyUser[0].user.email,
                title: company.CompanyUser[0].title,
                phoneNumber: company!.CompanyUser[0].user.phoneNumber,
                idNumber: company.CompanyUser[0].idNumber,
                idAttachment: company.CompanyUser[0].idAttachment,
                isActive: company.CompanyUser[0].isActive,
              }
            : null,
      }));

      return {
        message: "Companies fetched successfully",
        statusCode: 200,
        data: response,
        totalItems,
        currentPage: currentPage || 1,
        itemsPerPage: limit || 15,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getCompany(id: string) {
    const company = await prisma.company.findUnique({
      where: { id: id },
      include: {
        CompanyUser: {
          where: {
            user: {
              userRoles: {
                some: {
                  name: roles.COMPANY_ADMIN,
                },
              },
            },
          },
          take: 1,
          include: {
            user: true,
          },
        },
      },
    });
    const response = {
      company: {
        id: company!.id,
        name: company!.name,
        country: company!.country,
        province: company!.province,
        district: company!.district,
        sector: company!.sector,
        phoneNumber: company!.phoneNumber,
        email: company!.email,
        industry: company!.industry,
        website: company!.website,
        TIN: company!.TIN,
        type: company!.type,
        certificate: company!.certificate,
        logo: company!.logo,
        isActive: company!.isActive,
      },
      contactPerson: {
        id: company!.CompanyUser[0].user.id,
        firstName: company!.CompanyUser[0].user.firstName,
        lastName: company!.CompanyUser[0].user.lastName,
        email: company!.CompanyUser[0].user.email,
        phoneNumber: company!.CompanyUser[0].user.phoneNumber,
        title: company!.CompanyUser[0].title,
        idNumber: company!.CompanyUser[0].idNumber,
        idAttachment: company!.CompanyUser[0].idAttachment,
        isActive: company!.CompanyUser[0].isActive,
      },
    };
    return {
      message: "company fetched successfully",
      statusCode: 200,
      data: response,
    };
  }
  // Get companies count by month, filtered by year
  public static async getCompaniesCountByMonth(
    year: number,
  ): Promise<IResponse<any>> {
    try {
      const companies = await prisma.company.findMany({
        where: {
          createdAt: {
            gte: new Date(`${year}-01-01`),
            lt: new Date(`${year + 1}-01-01`),
          },
        },
        select: {
          createdAt: true,
        },
      });

      // Initialize an array with 12 months (0 for each month)
      const companiesByMonth = Array(12).fill(0);

      // Group by month using JavaScript
      companies.forEach((company) => {
        const month = new Date(company.createdAt).getMonth(); // getMonth returns 0-based month
        companiesByMonth[month]++;
      });

      return {
        message: "Companies count by month fetched successfully",
        statusCode: 200,
        data: companiesByMonth,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  static async createCompany(data: CreateCompanyDto) {
    // console.log("data:--:", data);
    const errors = await companyValidations.onCreate(data);
    if (errors[0]) {
      throw new ValidationError(errors);
    }
    const newCompany = await prisma.company.create({
      data: {
        ...data.company,
        country: data.company.country ?? "",
        province: data.company.province ?? "",
        district: data.company.district ?? "",
        sector: data.company.sector ?? "",
        phoneNumber: data.company.phoneNumber ?? "",
        email: data.company.email ?? "",
        industry: data.company.industry ?? "",
        website: data.company.website ?? "",
        TIN: data.company.TIN ?? "",
        type: data.company.type ?? "",
        certificate: (data.company.certificate as string) ?? "",
        logo: (data.company.logo as string) ?? "",
      },
    });

    // Seed items if industry is PHARMACY
    if (newCompany.industry === "PHARMACY") {
      // Run in background to not block response
      ItemSeederService.seedPharmacyItems(newCompany.id).catch((err) => {
        console.error("Failed to seed pharmacy items:", err);
      });
    }

    Emitter.emit(EventType.COMPANY_CREATED, newCompany, data);
    return {
      message: "Company Created Successfully!!",
      statusCode: 201,
      data: newCompany,
    };
  }

  public static async updateCompany(id: string, data: CreateCompanyDto) {
    try {
      const findUser = await prisma.company.findUnique({
        where: { id: id },
        include: {
          CompanyUser: {
            where: {
              user: {
                userRoles: {
                  some: {
                    name: roles.COMPANY_ADMIN,
                  },
                },
              },
            },
            take: 1,
            include: {
              user: true,
            },
          },
        },
      });

      const updatedCompany = await prisma.company.update({
        where: { id },
        data: {
          ...data.company,
          certificate:
            typeof data.company.certificate === "object"
              ? data.company.certificate.filename
              : data.company.certificate,
          logo:
            typeof data.company.logo === "object"
              ? data.company.logo.filename
              : data.company.logo,
        },
      });

      Emitter.emit(
        EventType.COMPANY_UPDATED,
        updatedCompany,
        data,
        findUser?.CompanyUser[0].userId,
      );

      return {
        message: "Company updated successfully",
        statusCode: 200,
        data: updatedCompany,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async deleteCompanyWithRelations(id: string) {
    try {
      // Delete related data first (e.g., CompanyUser, etc.)
      await prisma.companyUser.deleteMany({
        where: { companyId: id },
      });

      // Delete the company itself
      const deletedCompany = await prisma.company.delete({
        where: { id },
      });

      Emitter.emit(EventType.COMPANY_DELETED, deletedCompany);

      return {
        message: "Company and related data deleted successfully",
        statusCode: 200,
        data: deletedCompany,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }
}
