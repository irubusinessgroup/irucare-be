import { Prisma } from "@prisma/client";
import { prisma } from "../utils/client";

import { CreateCompanyDto, TCompany } from "../utils/interfaces/common";
import { hashSync } from "bcrypt";
import { roles } from "../utils/roles";
import { ItemSeederService } from "../services/ItemSeederService";
import { TEMPORARY_PASSWORD } from "../utils/generatePassword";
import { renderTemplate, sendEmail } from "../utils/email";
import { ActivationService } from "../services/ActivationService";

type CreatedCompany = {
  id: string;
  name: string;
  industry?: string | null;
  createdAt?: Date | string;
  email?: string | null;
  phoneNumber?: string | null;
};

type Tx = Prisma.TransactionClient;

export const createCompanyAdmin = async (
  tx: Tx,
  company: CreatedCompany,
  data: CreateCompanyDto,
) => {
  const companyAdmin = await tx.user.create({
    data: {
      firstName: data.contactPerson.firstName,
      lastName: data.contactPerson.lastName,
      email: data.contactPerson.email,
      phoneNumber: data.contactPerson.phoneNumber,
      password: hashSync(TEMPORARY_PASSWORD, 10),
    },
  });
  await tx.userRole.create({
    data: {
      userId: companyAdmin.id,
      name: roles.COMPANY_ADMIN,
    },
  });

  // Prefer Main Branch (bhfId 00); fall back to any branch for the company
  const mainBranch =
    (await tx.branch.findFirst({
      where: { companyId: company.id, bhfId: "00" },
      select: { id: true },
    })) ||
    (await tx.branch.findFirst({
      where: { companyId: company.id },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }));

  await tx.companyUser.create({
    data: {
      companyId: company.id,
      userId: companyAdmin.id,
      branchId: mainBranch?.id ?? null,
      title: data.contactPerson.title ?? "N/A",
      idNumber: data.contactPerson.idNumber ?? "N/A",
      idAttachment: (data.contactPerson.idAttachment as string) ?? "N/A",
    },
  });
  return companyAdmin;
};

export const companyCreatedHandler = async (
  company: CreatedCompany,
  data: CreateCompanyDto,
  options: { adminCreated?: boolean } = {},
) => {
  try {
    const plainPassword = TEMPORARY_PASSWORD;

    if (!options.adminCreated) {
      await prisma.$transaction((tx) => createCompanyAdmin(tx, company, data));
    }

    try {
      await ActivationService.createForCompany(company.id, {
        certificate: data.company.certificate as string | undefined,
        idAttachment: data.contactPerson.idAttachment as string | undefined,
        activation: data.activation,
      });
    } catch (activationError) {
      console.error("Failed to create EBM activation record:", activationError);
    }

    try {
      const html = renderTemplate("company-welcome.html", {
        firstName: data.contactPerson.firstName || "User",
        companyName: company.name || "your company",
        email: data.contactPerson.email,
        password: plainPassword,
        frontendUrl: process.env.FRONTEND_URL || "",
      });
      await sendEmail({
        to: data.contactPerson.email,
        subject: "Welcome to IRUCARE - Your Login Credentials",
        html,
      });
    } catch (emailError) {
      console.error("Failed to send company welcome email:", emailError);
    }

    // Seed pharmacy catalog after admin exists (EBM registration requires a user)
    if (company.industry === "PHARMACY" && company.id) {
      ItemSeederService.seedPharmacyItems(company.id).catch((err) => {
        console.error("Failed to seed pharmacy items:", err);
      });
    }
  } catch (error) {
    console.error("companyCreatedHandler failed:", error);
    throw error;
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
