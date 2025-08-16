import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { Request } from "express";
import {
  CreateApprovalDto,
  UpdateApprovalDto,
} from "../utils/interfaces/common";

export class ApprovalService {
  public static async createApproval(data: CreateApprovalDto, req: Request) {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError("User ID is missing", 400);
    }

    const stockReceipt = await prisma.stockReceipts.findUnique({
      where: { id: data.stockReceiptId },
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

    const approval = await prisma.approvals.create({
      data: {
        stockReceiptId: data.stockReceiptId,
        approvedByUserId: userId,
        dateApproved: new Date(),
        approvalStatus: data.approvalStatus,
        comments: data.comments,
      },
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

    return { message: "Approval created successfully", data: approval };
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
    req: Request,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError("User ID is missing", 400);
    }

    console.log("Looking for approval with ID:", userId);

    const approval = await prisma.approvals.findUnique({
      where: { id },
    });

    console.log("Found approval:", approval);

    if (!approval) {
      throw new AppError("Approval not found", 404);
    }

    const updatedApproval = await prisma.approvals.update({
      where: { id },
      data: {
        ...data,
        approvedByUserId: userId,
        dateApproved: new Date(),
      },
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
      message: "Approval updated successfully",
      data: updatedApproval,
    };
  }
}
