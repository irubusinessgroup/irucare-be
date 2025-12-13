import { prisma } from "../utils/client";
import AppError from "../utils/error";
import { CreateClientDto, UpdateClientDto } from "../utils/interfaces/common";
import type { Request } from "express";

export class ClientService {
  public static async getAllClients(
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
            { phone: { contains: searchq } },
          ],
        }
      : { companyId };

    const skip = page && limit ? (page - 1) * limit : undefined;
    const take = limit;

    const clients = await prisma.client.findMany({
      where: queryOptions,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        sells: {
          select: {
            id: true,
            totalAmount: true,
            createdAt: true,
          },
        },
      },
    });

    const totalItems = await prisma.client.count({ where: queryOptions });

    return {
      data: clients,
      totalItems,
      currentPage: page || 1,
      itemsPerPage: limit || clients.length,
      message: "Clients retrieved successfully",
    };
  }

  public static async getClientById(id: string, req: Request) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const client = await prisma.client.findFirst({
      where: { id, companyId },
      include: {
        sells: {
          include: {
            item: {
              select: {
                id: true,
                itemFullName: true,
                itemCodeSku: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!client) {
      throw new AppError("Client not found", 404);
    }

    return {
      data: client,
      message: "Client retrieved successfully",
    };
  }

  public static async createClient(data: CreateClientDto, companyId: string) {
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const existingClient = await prisma.client.findFirst({
      where: {
        phone: data.phone,
        companyId,
      },
    });

    if (existingClient) {
      throw new AppError("Client with this phone number already exists", 409);
    }

    const client = await prisma.client.create({
      data: {
        ...data,
        companyId,
      },
    });

    return { message: "Client created successfully", data: client };
  }

  public static async updateClient(
    id: string,
    data: UpdateClientDto,
    req: Request,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const existingClient = await prisma.client.findFirst({
      where: { id, companyId },
    });

    if (!existingClient) {
      throw new AppError("Client not found", 404);
    }

    if (data.phone && data.phone !== existingClient.phone) {
      const phoneExists = await prisma.client.findFirst({
        where: {
          phone: data.phone,
          companyId,
          id: { not: id },
        },
      });

      if (phoneExists) {
        throw new AppError("Client with this phone number already exists", 409);
      }
    }

    const client = await prisma.client.update({
      where: { id },
      data,
    });

    return { message: "Client updated successfully", data: client };
  }

  public static async deleteClient(id: string, req: Request) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const existingClient = await prisma.client.findFirst({
      where: { id, companyId },
    });

    if (!existingClient) {
      throw new AppError("Client not found", 404);
    }

    const sellsCount = await prisma.sell.count({
      where: { clientId: id },
    });

    if (sellsCount > 0) {
      throw new AppError(
        "Cannot delete client with existing sales records",
        400,
      );
    }

    await prisma.client.delete({ where: { id } });
    return { message: "Client deleted successfully" };
  }
}
