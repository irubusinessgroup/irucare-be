import { prisma } from "../utils/client";
import AppError, { IValidationError } from "./../utils/error";
import { CreateCompanyStaffUnionDto } from "./../utils/interfaces/common";

export class companyStaffValidations {
  static async onCreate(
    data: CreateCompanyStaffUnionDto,
  ): Promise<IValidationError[]> {
    const errors: IValidationError[] = [];
    if (data.email) {
      const emailTaken = await prisma.user.findFirst({
        where: { email: data.email },
      });
      if (emailTaken) {
        throw new AppError("Email is already taken", 400);
      }
    }

    if (data?.phoneNumber) {
      const phoneTaken = await prisma.user.findFirst({
        where: { phoneNumber: data?.phoneNumber },
      });
      if (phoneTaken) {
        throw new AppError("Phone number is already taken", 400);
      }
    }

    if (data.idNumber) {
      const idNumberTaken = await prisma.companyUser.findFirst({
        where: { idNumber: data.idNumber },
      });
      if (idNumberTaken) {
        throw new AppError("ID number is already taken", 400);
      }
    }
    return errors;
  }

  static async onUpdate(
    userId: string,
    data: CreateCompanyStaffUnionDto,
  ): Promise<IValidationError[]> {
    const errors: IValidationError[] = [];

    if (data.email) {
      const emailTaken = await prisma.user.findFirst({
        where: { email: data.email, id: { not: userId } },
      });
      if (emailTaken) {
        throw new AppError("Email is already taken", 400);
      }
    }

    if (data.phoneNumber) {
      const phoneTaken = await prisma.user.findFirst({
        where: { phoneNumber: data.phoneNumber, id: { not: userId } },
      });
      if (phoneTaken) {
        throw new AppError("Phone number is already taken", 400);
      }
    }

    if (data.idNumber) {
      const idNumberTaken = await prisma.companyUser.findFirst({
        where: { idNumber: data.idNumber, userId: { not: userId } },
      });
      if (idNumberTaken) {
        throw new AppError("ID number is already taken", 400);
      }
    }

    return errors;
  }
}
