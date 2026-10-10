import { prisma } from "../utils/client";
import { IValidationError } from "./../utils/error";
import { CreateCompanyDto } from "./../utils/interfaces/common";

export class companyValidations {
  static async onCreate(data: CreateCompanyDto): Promise<IValidationError[]> {
    const errors: IValidationError[] = [];
    const emailTaken = await prisma.company.findFirst({
      where: { email: data.company.email },
    });

    const phoneTaken = await prisma.company.findFirst({
      where: { phoneNumber: data.company.phoneNumber },
    });

    const TINTaken = await prisma.company.findFirst({
      where: { TIN: data.company.TIN },
    });

    if (emailTaken) {
      errors.push({
        field: "company.email",
        error: "Email used by other company",
      });
    }
    if (phoneTaken) {
      errors.push({
        field: "company.phoneNumber",
        error: "Phone number used by other company",
      });
    }

    if (TINTaken) {
      errors.push({
        field: "company.TIN",
        error: "Onother company registered with  this TIN number",
      });
    }

    const contactEmail = data.contactPerson?.email;
    if (contactEmail) {
      const userTaken = await prisma.user.findFirst({
        where: { email: { equals: contactEmail, mode: "insensitive" } },
        select: { id: true },
      });
      if (userTaken) {
        errors.push({
          field: "contactPerson.email",
          error: "Contact person email is already used by another account",
        });
      }
    }
    return errors;
  }
}
