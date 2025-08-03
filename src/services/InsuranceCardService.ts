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
            { cardNumber: { contains: searchq } },
            { beneficiary: { contains: searchq } },
          ],
        }
      : { companyId };

    const skip = page && limit ? (page - 1) * limit : undefined;
    const take = limit;

    const insuranceCards = await prisma.insuranceCard.findMany({
      where: queryOptions,
      include: { insuranceDetails: true, insurance: true },
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
  ) {
    return prisma.$transaction(async (tx) => {
      const insuranceCard = await tx.insuranceCard.create({
        data: {
          companyId,
          patientId: data.patientId,
          insuranceId: data.insuranceId,
          cardNumber: data.cardNumber,
          expireDate: data.expireDate,
          beneficiary: data.beneficiary,
          isOwner: data.isOwner,
        },
      });

      if (data.details && data.details.length > 0) {
        await tx.insuranceDetail.createMany({
          data: data.details.map((detail) => ({
            insuranceCardId: insuranceCard.id,
            key: detail.key,
            value: detail.value,
          })),
        });
      }

      return insuranceCard;
    });
  }

  public static async updateInsuranceCard(
    id: string,
    data: UpdateInsuranceCardDto,
  ) {
    return prisma.$transaction(async (tx) => {
      const insuranceCard = await tx.insuranceCard.update({
        where: { id },
        data: {
          patientId: data.patientId,
          insuranceId: data.insuranceId,
          cardNumber: data.cardNumber,
          expireDate: data.expireDate,
          beneficiary: data.beneficiary,
          isOwner: data.isOwner,
        },
      });

      if (data.details) {
        await tx.insuranceDetail.deleteMany({
          where: { insuranceCardId: id },
        });

        await tx.insuranceDetail.createMany({
          data: data.details.map((detail) => ({
            insuranceCardId: id,
            key: detail.key,
            value: detail.value,
          })),
        });
      }

      return insuranceCard;
    });
  }

  public static async deleteInsuranceCard(id: string) {
    const insuranceCard = await prisma.insuranceCard.findUnique({
      where: { id },
    });
    if (!insuranceCard) throw new AppError("Insurance card not found", 404);

    await prisma.$transaction(async (tx) => {
      await tx.insuranceDetail.deleteMany({ where: { insuranceCardId: id } });
      await tx.insuranceCard.delete({ where: { id } });
    });

    return { message: "Insurance card deleted successfully" };
  }
}
