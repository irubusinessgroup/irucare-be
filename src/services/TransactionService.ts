import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { Request } from "express";

export class TransactionService {
  public static async getAllTransactions(
    req: Request,
    searchq?: string,
    limit?: number,
    page?: number,
  ) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const whereClause = searchq
      ? {
          companyId,
          ...(branchId ? { branchId } : {}),
          OR: [{ client: { name: { contains: searchq } } }],
        }
      : {
          companyId,
          ...(branchId ? { branchId } : {}),
        };

    const skip = page && limit ? (page - 1) * limit : undefined;
    const take = limit;

    const transactions = await prisma.transaction.findMany({
      where: whereClause,
      skip,
      take,
      orderBy: { date: "desc" },
      include: {
        client: {
          select: { id: true, name: true, email: true, phone: true },
        },
      },
    });

    const totalItems = await prisma.transaction.count({ where: whereClause });

    return {
      data: transactions,
      totalItems,
      currentPage: page || 1,
      itemsPerPage: limit || transactions.length,
      message: "Transactions retrieved successfully",
    };
  }

  public static async getTransactionById(id: string, req: Request) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const transaction = await prisma.transaction.findFirst({
      where: {
        id,
        companyId,
        ...(branchId ? { branchId } : {}),
      },
      include: {
        client: true,
      },
    });

    if (!transaction) {
      throw new AppError("Transaction not found", 404);
    }

    return { data: transaction, message: "Transaction retrieved successfully" };
  }
}
