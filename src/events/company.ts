import { prisma } from "../utils/client";

import { CreateCompanyDto, TCompany } from "../utils/interfaces/common";
import { hashSync } from "bcrypt";
import { roles } from "../utils/roles";

export const companyCreatedHandler = async (
  company: TCompany,
  data: CreateCompanyDto,
) => {
  try {
    await prisma.$transaction(async (tx) => {
      const companyAdmin = await tx.user.create({
        data: {
          firstName: data.contactPerson.firstName,
          lastName: data.contactPerson.lastName,
          email: data.contactPerson.email,
          phoneNumber: data.contactPerson.phoneNumber,
          password: hashSync("Password123!", 10),
        },
      });
      if (!companyAdmin) {
        throw new Error("Failed to create company Admin");
      }
      const assignRole = await tx.userRole.create({
        data: {
          userId: companyAdmin.id,
          name: roles.COMPANY_ADMIN,
        },
      });
      if (!assignRole) {
        throw new Error("Failed to assign role to company Admin");
      }
      await tx.companyUser.create({
        data: {
          companyId: company.id!,
          userId: companyAdmin.id,
          title: data.contactPerson.title ?? "N/A",
          idNumber: data.contactPerson.idNumber ?? "N/A",
          idAttachment: (data.contactPerson.idAttachment as string) ?? "N/A",
        },
      });
      //TODO: Send email notification to company admin
    });
  } catch (error) {
    prisma.$disconnect();
  }
};

export const companyUpdateHandler = async (
  company: TCompany,
  data: CreateCompanyDto,
  userId: string,
) => {
  try {
    await prisma.$transaction(async (tx) => {
      const companyAdmin = await tx.user.update({
        where: { id: userId },
        data: {
          firstName: data.contactPerson.firstName,
          lastName: data.contactPerson.lastName,
          email: data.contactPerson.email,
          phoneNumber: data.contactPerson.phoneNumber,
        },
      });

      if (!companyAdmin) {
        throw new Error("Failed to update company Admin");
      }
      await tx.companyUser.update({
        where: { companyId: company.id, userId: companyAdmin.id },
        data: {
          companyId: company.id!,
          userId: companyAdmin.id,
          title: data.contactPerson.title ?? "N/A",
          idNumber: data.contactPerson.idNumber ?? "N/A",
          idAttachment: (data.contactPerson.idAttachment as string) ?? "N/A",
        },
      });
    });
  } catch (error) {
    prisma.$disconnect();
  }
};
