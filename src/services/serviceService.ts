import { BaseService } from "./Service";
import { prisma } from "../utils/client";
import {
  CreateServiceDto,
  IResponse,
  TService,
} from "../utils/interfaces/common";
import AppError from "../utils/error";

export class ServiceService extends BaseService {
  public async createService(
    serviceData: CreateServiceDto,
  ): Promise<IResponse<TService>> {
    try {
      const newService = await prisma.services.create({
        data: {
          title: serviceData.title,
          description: serviceData.description,
        },
      });
      return {
        statusCode: 201,
        message: "Service created successfully",
        data: newService,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getService(
    serviceId: string,
  ): Promise<IResponse<TService>> {
    try {
      const service = await prisma.services.findUnique({
        where: {
          id: serviceId,
        },
      });

      if (!service) {
        throw new AppError("service post not found", 404);
      }
      return {
        statusCode: 200,
        message: "service post fetched successfully",
        data: service,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getAllService(): Promise<IResponse<TService[]>> {
    try {
      const service = await prisma.services.findMany();

      return {
        statusCode: 200,
        message: "service fetched successfully",
        data: service,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async updateService(
    serviceId: string,
    serviceData: Partial<CreateServiceDto>,
  ): Promise<IResponse<TService>> {
    try {
      const updatedService = await prisma.services.update({
        where: { id: serviceId },
        data: {
          ...serviceData,
        },
      });
      return {
        statusCode: 200,
        message: "Service post updated successfully",
        data: updatedService,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async deleteService(
    serviceId: string,
  ): Promise<IResponse<null>> {
    try {
      await prisma.services.delete({ where: { id: serviceId } });
      return {
        statusCode: 200,
        message: "Service post deleted successfully",
        data: null,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }
}
