import { prisma } from "../utils/client";

import { CreateCompanyDto, TCompany } from "../utils/interfaces/common";
import { hashSync } from "bcrypt";
import { roles } from "../utils/roles";
import { ItemSeederService } from "../services/ItemSeederService";
import { TEMPORARY_PASSWORD } from "../utils/generatePassword";
import { renderTemplate, sendEmail } from "../utils/email";
import { SubscriptionService } from "../services/SubscriptionService";

type CreatedCompany = {
  id: string;
  name: string;
  industry?: string | null;
  createdAt?: Date | string;
  email?: string | null;
  phoneNumber?: string | null;
};

export const companyCreatedHandler = async (
  company: CreatedCompany,
  data: CreateCompanyDto,
) => {
  try {
    const plainPassword = TEMPORARY_PASSWORD;

    await prisma.$transaction(async (tx) => {
      const companyAdmin = await tx.user.create({
        data: {
          firstName: data.contactPerson.firstName,
          lastName: data.contactPerson.lastName,
          email: data.contactPerson.email,
          phoneNumber: data.contactPerson.phoneNumber,
          password: hashSync(plainPassword, 10),
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

      // Prefer Main Branch (bhfId 00); fall back to any branch for the company
      const mainBranch =
        (await tx.branch.findFirst({
          where: { companyId: company.id!, bhfId: "00" },
          select: { id: true },
        })) ||
        (await tx.branch.findFirst({
          where: { companyId: company.id! },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        }));

      await tx.companyUser.create({
        data: {
          companyId: company.id!,
          userId: companyAdmin.id,
          branchId: mainBranch?.id ?? null,
          title: data.contactPerson.title ?? "N/A",
          idNumber: data.contactPerson.idNumber ?? "N/A",
          idAttachment: (data.contactPerson.idAttachment as string) ?? "N/A",
        },
      });
    });

    try {
      await SubscriptionService.provisionWelcomeFreeTier({
        companyId: company.id,
        companyName: company.name,
        companyEmail: company.email ?? data.company.email,
        companyPhone: company.phoneNumber ?? data.company.phoneNumber,
        contact: data.contactPerson,
        startDate: company.createdAt ? new Date(company.createdAt) : new Date(),
      });
    } catch (tierError) {
      console.error("Failed to provision welcome free tier:", tierError);
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
