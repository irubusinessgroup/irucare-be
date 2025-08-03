import { prisma } from "../utils/client";
import AppError, { IValidationError } from "./../utils/error";
import { CreateCompanyStaffDto } from "./../utils/interfaces/common";

export class companyStaffValidations {
  static async onCreate(
    data: CreateCompanyStaffDto,
  ): Promise<IValidationError[]> {
    const errors: IValidationError[] = [];
    const emailTaken = await prisma.user.findFirst({
      where: { email: data.email },
    });

    const phoneTaken = await prisma.user.findFirst({
      where: { phoneNumber: data?.phoneNumber },
    });

    const idNumberTaken = await prisma.companyUser.findFirst({
      where: { idNumber: data.idNumber },
    });

    if (emailTaken) {
      throw new AppError("Email is already taken", 400);
    }
    if (phoneTaken) {
      throw new AppError("Phone number is already taken", 400);
    }
    if (idNumberTaken) {
      throw new AppError("ID number is already taken", 400);
    }
    return errors;
  }

  static async onUpdate(
    userId: string,
    data: CreateCompanyStaffDto,
  ): Promise<IValidationError[]> {
    const errors: IValidationError[] = [];

    const emailTaken = await prisma.user.findFirst({
      where: { email: data.email, id: { not: userId } },
    });

    const phoneTaken = await prisma.user.findFirst({
      where: { phoneNumber: data.phoneNumber, id: { not: userId } },
    });

    const idNumberTaken = await prisma.companyUser.findFirst({
      where: { idNumber: data.idNumber, userId: { not: userId } },
    });

    if (emailTaken) {
      throw new AppError("Email is already taken", 400);
    }
    if (phoneTaken) {
      throw new AppError("Phone number is already taken", 400);
    }
    if (idNumberTaken) {
      throw new AppError("ID number is already taken", 400);
    }

    return errors;
  }
}
