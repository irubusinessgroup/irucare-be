import { roles } from "../utils/roles";
import { prisma } from "../utils/client";

import { CreateCompanyStaffUnionDto, TUser } from "../utils/interfaces/common";

export const companyStaffCreatedHandler = async (
  user: TUser,
  data: CreateCompanyStaffUnionDto,
  companyId: string,
) => {
  try {
    await prisma.$transaction(async (tx) => {
      const assignRole = await tx.userRole.create({
        data: {
          userId: user?.id,
          name: roles.COMPANY_USER,
        },
      });

      if (!assignRole) {
        throw new Error("Failed to assign role to company user");
      }

      await tx.companyUser.create({
        data: {
          companyId: companyId!,
          userId: user?.id,
          title: data.title,
          idNumber: data.idNumber,
          idAttachment: data.idAttachment as string,
        },
      });
    });
  } catch (error) {
    prisma.$disconnect();
  }
};

export const companyStaffUpdateHandler = async (
  user: TUser,
  data: CreateCompanyStaffUnionDto,
  companyId: string,
) => {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.companyUser.update({
        where: { companyId: companyId, userId: user?.id },
        data: {
          companyId: companyId!,
          userId: user?.id,
          title: data.title,
          idNumber: data.idNumber,
          idAttachment: data.idAttachment as string,
        },
      });
    });
  } catch (error) {
    prisma.$disconnect();
  }
};
