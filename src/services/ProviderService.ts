import { prisma } from "../utils/client";
import AppError from "../utils/error";
import {
  CreateProviderDto,
  UpdateProviderDto,
} from "../utils/interfaces/common";
import type { Request } from "express";

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

    const provider = await prisma.provider.create({
      data: {
        name: data.name,
        email: data.email,
        specialty: data.specialty,
        licenseNumber: data.licenseNumber,
        companyId,
      },
    });

    return {
      data: provider,
      message: "Provider created successfully",
    };
  }

  public static async updateProvider(id: string, data: UpdateProviderDto) {
    const existingProvider = await prisma.provider.findUnique({
      where: { id },
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
    }

    const provider = await prisma.provider.update({
      where: { id },
      data: {
        name: data.name,
        email: data.email,
        specialty: data.specialty,
        licenseNumber: data.licenseNumber,
      },
    });

    return {
      data: provider,
      message: "Provider updated successfully",
    };
  }

  public static async deleteProvider(id: string) {
    const provider = await prisma.provider.findUnique({ where: { id } });

    if (!provider) {
      throw new AppError("Provider not found", 404);
    }

    await prisma.provider.delete({ where: { id } });

    return { message: "Provider deleted successfully" };
  }
}
