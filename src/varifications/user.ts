import { prisma } from "../utils/client";
import AppError, { IValidationError } from "./../utils/error";
import type { CreateUserDto } from "../utils/interfaces/common";

export class userValidations {
  static async onCreate(data: CreateUserDto): Promise<IValidationError[]> {
    const errors: IValidationError[] = [];
    const emailTaken = await prisma.user.findFirst({
      where: { email: data.email },
    });

    const phoneTaken = await prisma.user.findFirst({
      where: { phoneNumber: data?.phoneNumber },
    });

    if (emailTaken) {
      throw new AppError("Email is already taken", 400);
    }
    if (phoneTaken) {
      throw new AppError("Phone number is already taken", 400);
    }

    return errors;
  }

  static async onUpdate(
    userId: string,
    data: CreateUserDto,
  ): Promise<IValidationError[]> {
    const errors: IValidationError[] = [];

    const emailTaken = await prisma.user.findFirst({
      where: { email: data.email, id: { not: userId } },
    });

    const phoneTaken = await prisma.user.findFirst({
      where: { phoneNumber: data.phoneNumber, id: { not: userId } },
    });

    if (emailTaken) {
      throw new AppError("Email is already taken", 400);
    }
    if (phoneTaken) {
      throw new AppError("Phone number is already taken", 400);
    }

    return errors;
  }
}
