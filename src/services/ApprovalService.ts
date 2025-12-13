import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { Request } from "express";
import {
  CreateApprovalDto,
  UpdateApprovalDto,
} from "../utils/interfaces/common";
import { StockService } from "./StockService";
import { applyMarkup } from "../utils/pricing";

export class ApprovalService {
  public static async createApproval(data: CreateApprovalDto, req: Request) {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError("User ID is missing", 400);
    }

    const stockReceipt = await prisma.stockReceipts.findUnique({
      where: { id: data.stockReceiptId },
      include: { item: true, supplier: true },
    });
    if (!stockReceipt) {
      throw new AppError("Stock receipt not found", 404);
    }

    const existingApproval = await prisma.approvals.findFirst({
      where: { stockReceiptId: data.stockReceiptId },
    });
    if (existingApproval) {
      throw new AppError("Approval already exists for this stock receipt", 400);
    }

    return await prisma.$transaction(async (tx) => {
      // Fetch company tools for markup
      const companyTools = await tx.companyTools.findFirst({
        where: { companyId: stockReceipt.companyId },
      });
      const markupPercentage = Number(companyTools?.markupPrice || 0);
      const calculatedSellPrice = applyMarkup(
        Number(stockReceipt.unitCost),
        markupPercentage
      );

      const approval = await tx.approvals.create({
        data: {
          stockReceiptId: data.stockReceiptId,
          approvedByUserId: userId,
          dateApproved: new Date(),
          approvalStatus: data.approvalStatus,
          ExpectedSellPrice: calculatedSellPrice,
          comments: data.comments,
        },
        include: {
          stockReceipts: { include: { item: true, supplier: true } },
          approvedByUser: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });

      if (data.approvalStatus === "APPROVED") {
        await StockService.addToStock(approval.stockReceiptId);
      }

      return {
        message:
          data.approvalStatus === "APPROVED"
            ? "Approval created successfully and stock units added to inventory"
            : "Approval created successfully",
        data: approval,
      };
    });
  }

  public static async getApprovalByStockReceiptId(stockReceiptId: string) {
    const approval = await prisma.approvals.findFirst({
      where: { stockReceiptId },
      include: {
        stockReceipts: {
          include: {
            item: true,
            supplier: true,
          },
        },
        approvedByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    return {
      message: approval ? "Approval fetched successfully" : "No approval found",
      data: approval,
    };
  }

  public static async updateApproval(
    id: string,
    data: UpdateApprovalDto,
    req: Request
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError("User ID is missing", 400);
    }

    const approval = await prisma.approvals.findUnique({
      where: { id },
      include: { stockReceipts: true },
    });

    if (!approval) {
      throw new AppError("Approval not found", 404);
    }

    return await prisma.$transaction(async (tx) => {
      const { ...rest } = data;

      const stockReceipt = await tx.stockReceipts.findUnique({
        where: { id: approval.stockReceiptId },
      });

      const companyTools = await tx.companyTools.findFirst({
        where: { companyId: stockReceipt?.companyId },
      });

      const markupPercentage = Number(companyTools?.markupPrice || 0);
      const unitCost = Number(stockReceipt?.unitCost || 0);

      const calculatedSellPrice = applyMarkup(unitCost, markupPercentage);

      const updatedApproval = await tx.approvals.update({
        where: { id },
        data: {
          ...rest,
          ExpectedSellPrice: calculatedSellPrice,
          approvedByUserId: userId,
          dateApproved: new Date(),
        },
        include: {
          stockReceipts: { include: { item: true, supplier: true } },
          approvedByUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      if (
        data.approvalStatus === "APPROVED" &&
        approval.approvalStatus !== "APPROVED"
      ) {
        const existingStock = await tx.stock.findFirst({
          where: { stockReceiptId: approval.stockReceiptId },
        });
        if (!existingStock) {
          await StockService.addToStock(approval.stockReceiptId);
        }
      }

      return {
        message: "Approval updated successfully",
        data: updatedApproval,
      };
    });
  }
}
