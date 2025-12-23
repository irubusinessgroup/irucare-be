import { prisma } from "../utils/client";
import AppError from "../utils/error";
import {
  CreateInsuranceCardDto,
  UpdateInsuranceCardDto,
} from "../utils/interfaces/common";
import type { Request } from "express";

export class InsuranceCardService {
  public static async getAllInsuranceCards(
    req: Request,
    searchq?: string,
    limit?: number,
    page?: number
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const branchId = req.user?.branchId;
    console.log(`[InsuranceCardService DEBUG] companyId: ${companyId}, branchId: ${branchId}`);
    const queryOptions: any = searchq
      ? {
          companyId,
          branchId: branchId || null, // Explicitly filter
          OR: [
            { affiliationNumber: { contains: searchq } },
            { affiliateName: { contains: searchq } },
          ],
        }
      : {
          companyId,
          branchId: branchId || null, // Explicitly filter
        };

    const skip = page && limit ? (page - 1) * limit : undefined;
    const take = limit;

    const insuranceCards = await prisma.insuranceCard.findMany({
      where: queryOptions,
      include: {
        insuranceDetails: true,
        insurance: true,
        client: true,
        patient: true,
      },
      skip,
      take,
      orderBy: { createdAt: "desc" },
    });

    const totalItems = await prisma.insuranceCard.count({
      where: queryOptions,
    });

    return {
      data: insuranceCards,
      totalItems,
      currentPage: page || 1,
      itemsPerPage: limit || insuranceCards.length,
      message: "Insurance cards retrieved successfully",
    };
  }

  public static async createInsuranceCard(
    data: CreateInsuranceCardDto,
    companyId: string,
    branchId?: string | null
  ) {
    return prisma.$transaction(async (tx) => {
      if (!data.patientId && !data.clientId) {
        throw new AppError("Either Patient ID or Client ID is required", 400);
      }

      const insuranceCard = await tx.insuranceCard.create({
        data: {
          companyId,
          branchId: branchId as any,
          patientId: data.patientId,
          clientId: data.clientId,
          insuranceId: data.insuranceId,
          affiliationNumber: data.affiliationNumber,
          policeNumber: data.policeNumber,
          relationship: data.relationship,
          affiliateName: data.affiliateName,
          birthDate: new Date(data.birthDate),
          gender: data.gender,
          phone: data.phone,
          workDepartment: data.workDepartment,
          workplace: data.workplace,
          percentage: data.percentage || 0,
        },
      });

      return insuranceCard;
    });
  }

  public static async updateInsuranceCard(
    id: string,
    data: UpdateInsuranceCardDto,
    companyId: string,
    branchId?: string | null
  ) {
    return prisma.$transaction(async (tx) => {
      const existingCard = await tx.insuranceCard.findFirst({
        where: {
          id,
          companyId,
          branchId: branchId || null,
        },
      });

      if (!existingCard) {
        throw new AppError("Insurance card not found", 404);
      }

      const insuranceCard = await tx.insuranceCard.update({
        where: { id },
        data: {
          patientId: data.patientId,
          clientId: data.clientId,
          insuranceId: data.insuranceId,
          affiliationNumber: data.affiliationNumber,
          policeNumber: data.policeNumber,
          relationship: data.relationship,
          affiliateName: data.affiliateName,
          birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
          gender: data.gender,
          phone: data.phone,
          workDepartment: data.workDepartment,
          workplace: data.workplace,
          percentage: data.percentage,
        },
      });

      return insuranceCard;
    });
  }

  public static async deleteInsuranceCard(
    id: string,
    companyId: string,
    branchId?: string | null
  ) {
    const insuranceCard = await prisma.insuranceCard.findFirst({
      where: {
        id,
        companyId,
        branchId: branchId || null,
      },
    });
    if (!insuranceCard) throw new AppError("Insurance card not found", 404);

    await prisma.$transaction(async (tx) => {
      await tx.insuranceDetail.deleteMany({ where: { insuranceCardId: id } });
      await tx.insuranceCard.delete({ where: { id } });
    });

    return { message: "Insurance card deleted successfully" };
  }
}
