import { prisma } from "../utils/client";
import AppError from "../utils/error";
import {
  CreateProviderDto,
  UpdateProviderDto,
} from "../utils/interfaces/common";
import type { Request } from "express";
import { hash } from "bcrypt";

export class ProviderService {
  public static async getAllProviders(
    req: Request,
    searchq?: string,
    limit?: number,
    page?: number,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const queryOptions = searchq
      ? {
          companyId,
          OR: [
            { name: { contains: searchq } },
            { email: { contains: searchq } },
            { specialty: { contains: searchq } },
            { licenseNumber: { contains: searchq } },
          ],
        }
      : { companyId };

    const skip = page && limit ? (page - 1) * limit : undefined;
    const take = limit;

    const providers = await prisma.provider.findMany({
      where: queryOptions,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            photo: true,
          },
        },
      },
    });

    const totalItems = await prisma.provider.count({ where: queryOptions });

    return {
      data: providers,
      totalItems,
      currentPage: page || 1,
      itemsPerPage: limit || providers.length,
      message: "Providers retrieved successfully",
    };
  }

  public static async getProviderById(id: string, req: Request) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const provider = await prisma.provider.findFirst({
      where: { id, companyId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            photo: true,
          },
        },
      },
    });

    if (!provider) {
      throw new AppError("Provider not found", 404);
    }

    return {
      data: provider,
      message: "Provider retrieved successfully",
    };
  }

  public static async createProvider(
    data: CreateProviderDto,
    companyId: string,
  ) {
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    // Check if email already exists for this company
    const existingProvider = await prisma.provider.findFirst({
      where: { email: data.email, companyId },
    });

    if (existingProvider) {
      throw new AppError("Provider with this email already exists", 409);
    }

    // Check if user with this email already exists
    const existingUser = await prisma.user.findFirst({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new AppError("User with this email already exists", 409);
    }

    // Create provider with user account in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Split the provider name into first and last name
      const nameParts = data.name.trim().split(/\s+/);
      const firstName = nameParts[0] || data.name;
      const lastName = nameParts.slice(1).join(" ") || data.name;

      // Create user account with default password
      const defaultPassword = await hash("Password123!", 10);

      const user = await tx.user.create({
        data: {
          firstName,
          lastName,
          email: data.email,
          password: defaultPassword,
          phoneNumber: "0781234568", // Default phone number
        },
      });

      // Assign PROVIDER clinic role to the user
      await tx.clinicUserRole.create({
        data: {
          userId: user.id,
          role: "PROVIDER",
        },
      });

      // Create company user entry to link provider to company as staff
      await tx.companyUser.create({
        data: {
          companyId,
          userId: user.id,
          title: "Provider",
          idNumber: "N/A",
        },
      });

      // Create provider linked to the user
      const provider = await tx.provider.create({
        data: {
          name: data.name,
          email: data.email,
          specialty: data.specialty,
          licenseNumber: data.licenseNumber,
          companyId,
          userId: user.id,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              photo: true,
            },
          },
        },
      });

      return provider;
    });

    return {
      data: result,
      message:
        "Provider created successfully. Default password is 'Provider123!'",
    };
  }

  public static async updateProvider(id: string, data: UpdateProviderDto) {
    const existingProvider = await prisma.provider.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!existingProvider) {
      throw new AppError("Provider not found", 404);
    }

    // If email is being updated, check for duplicates
    if (data.email && data.email !== existingProvider.email) {
      const duplicateEmail = await prisma.provider.findFirst({
        where: {
          email: data.email,
          companyId: existingProvider.companyId,
          id: { not: id },
        },
      });

      if (duplicateEmail) {
        throw new AppError("Provider with this email already exists", 409);
      }

      // Check if another user has this email
      const duplicateUser = await prisma.user.findFirst({
        where: {
          email: data.email,
          id: { not: existingProvider.userId || undefined },
        },
      });

      if (duplicateUser) {
        throw new AppError("User with this email already exists", 409);
      }
    }

    // Update provider and associated user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const provider = await tx.provider.update({
        where: { id },
        data: {
          name: data.name,
          email: data.email,
          specialty: data.specialty,
          licenseNumber: data.licenseNumber,
        },
      });

      // Update associated user if exists
      if (existingProvider.userId && existingProvider.user) {
        const nameParts = data.name?.trim().split(/\s+/) || [];
        const firstName = nameParts[0] || existingProvider.user.firstName;
        const lastName =
          nameParts.slice(1).join(" ") || existingProvider.user.lastName;

        await tx.user.update({
          where: { id: existingProvider.userId },
          data: {
            ...(data.name && { firstName, lastName }),
            ...(data.email && { email: data.email }),
          },
        });
      }

      return provider;
    });

    return {
      data: result,
      message: "Provider updated successfully",
    };
  }

  public static async deleteProvider(id: string) {
    const provider = await prisma.provider.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!provider) {
      throw new AppError("Provider not found", 404);
    }

    // Delete provider and associated user in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete provider
      await tx.provider.delete({ where: { id } });

      // Delete associated user if exists
      if (provider.userId) {
        // First delete user roles
        await tx.userRole.deleteMany({
          where: { userId: provider.userId },
        });

        await tx.clinicUserRole.deleteMany({
          where: { userId: provider.userId },
        });

        // Delete company user entry
        await tx.companyUser.deleteMany({
          where: { userId: provider.userId },
        });

        // Then delete user
        await tx.user.delete({
          where: { id: provider.userId },
        });
      }
    });

    return {
      message: "Provider and associated user account deleted successfully",
    };
  }
}
