import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { Request } from "express";
import { renderXReport } from "../templates/pdf/XReportTemplate";

// â”€â”€â”€ Payment method display labels (matches X-Report screenshot) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const PAYMENT_LABELS: Record<string, string> = {
  CASH: "CASH",
  MOBILE_PAYMENT: "MOBILE MONEY",
  CARD: "DEBIT & CREDIT CARD",
  BANK_TRANSFER: "BANK TRANSFER",
  BANK_CHECK: "BANK CHECK",
};

export class TransactionService {
  public static async getAllTransactions(
    req: Request,
    searchq?: string,
    limit?: number,
    page?: number,
    dateFrom?: string,
    dateTo?: string,
    isTrainingMode?: boolean,
  ) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    // Build date range filter on `date` field
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dateFilter: any = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }
    const dateRangeFilter = Object.keys(dateFilter).length
      ? { date: dateFilter }
      : {};

    const trainingFilter =
      isTrainingMode !== undefined ? { sell: { isTrainingMode } } : {};

    const baseWhere = {
      companyId,
      ...(branchId ? { branchId } : {}),
      ...dateRangeFilter,
      ...trainingFilter,
    };

    const whereClause = searchq
      ? {
          ...baseWhere,
          OR: [
            { client: { name: { contains: searchq } } },
            ...(Number(searchq) > 0
              ? [{ invcNo: { equals: Math.floor(Number(searchq)) } }]
              : []),
          ],
        }
      : baseWhere;

    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 15;
    const skip = (pageNum - 1) * limitNum;
    const take = limitNum;

    const transactions = await prisma.transaction.findMany({
      where: whereClause,
      skip,
      take,
      orderBy: { date: "desc" },
      include: {
        client: {
          select: { id: true, name: true, email: true, phone: true },
        },
        company: {
          select: { id: true, name: true },
        },
      },
    });

    const totalItems = await prisma.transaction.count({ where: whereClause });

    return {
      data: transactions,
      totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      message: "Transactions retrieved successfully",
    };
  }

  public static async getTransactionById(id: string, req: Request) {
    // Fallback when stale routes match /:id before /z-report or /x-report
    if (id === "z-report") {
      return TransactionService.getZReport(req);
    }
    if (id === "x-report") {
      return TransactionService.getXReport(req);
    }

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
        company: { select: { id: true, name: true } },
      },
    });

    if (!transaction) {
      throw new AppError("Transaction not found", 404);
    }

    return { data: transaction, message: "Transaction retrieved successfully" };
  }

  public static async getLastZReportDate(req: Request) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId ?? null;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const lastZReport = await prisma.zReportSession.findFirst({
      where: { companyId, branchId },
      orderBy: { endedAt: "desc" },
    });

    const endedAt = lastZReport?.endedAt ?? null;
    const lastZReportDate = endedAt ? endedAt.toISOString() : null;
    return { data: { lastZReportDate } };
  }

  public static async getXReport(
    req: Request,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<void> {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId ?? null;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    let periodStart: Date;
    let periodEnd: Date;

    if (dateFrom && dateTo) {
      periodStart = new Date(dateFrom);
      // Preserve exact time when a full ISO timestamp is supplied (e.g. the
      // Z-Report's endedAt). Only snap to midnight for bare date strings.
      if (!dateFrom.includes("T")) periodStart.setHours(0, 0, 0, 0);
      periodEnd = new Date(dateTo);
      if (!dateTo.includes("T")) periodEnd.setHours(23, 59, 59, 999);
    } else {
      const lastZReport = await prisma.zReportSession.findFirst({
        where: { companyId, branchId },
        orderBy: { endedAt: "desc" },
      });
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      periodStart = lastZReport?.endedAt ?? oneWeekAgo;
      periodEnd = new Date();
    }

    const result = await TransactionService.buildReport(
      req,
      companyId,
      branchId,
      periodStart,
      periodEnd,
      "X-Report generated successfully",
    );

    const { buffer, filename } = await renderXReport(result.data, "X Report");
    req.res!.setHeader("Content-Type", "application/pdf");
    req.res!.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );
    req.res!.send(buffer);
  }

  public static async getZReport(req: Request): Promise<void> {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId ?? null;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const periodEnd: Date = new Date();

    const result = await TransactionService.buildReport(
      req,
      companyId,
      branchId,
      todayStart,
      periodEnd,
      "Z-Report generated successfully",
    );

    await prisma.zReportSession.create({
      data: { companyId, branchId, startedAt: todayStart, endedAt: periodEnd },
    });

    const { buffer, filename } = await renderXReport(
      { ...result.data, singleDate: true },
      "Z Report",
    );
    req.res!.setHeader("Content-Type", "application/pdf");
    req.res!.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );
    req.res!.send(buffer);
  }

  // â”€â”€ Shared aggregation helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private static async buildReport(
    req: Request,
    companyId: string,
    branchId: string | null,
    periodStart: Date,
    periodEnd: Date,
    message: string,
  ) {
    const periodStartDay = new Date(periodStart);
    periodStartDay.setHours(0, 0, 0, 0);

    const [company, user, csSalesCount, crRefundCount, depositRecord] =
      await Promise.all([
        prisma.company.findUnique({
          where: { id: companyId },
          select: { name: true, TIN: true },
        }),
        prisma.user.findUnique({
          where: { id: req.user?.id },
          select: { mrcNo: true },
        }),
        prisma.sell.count({
          where: {
            companyId,
            ...(branchId ? { branchId } : {}),
            type: "SALE",
            isCopy: true,
            createdAt: { gte: periodStart, lte: periodEnd },
          },
        }),
        prisma.sell.count({
          where: {
            companyId,
            ...(branchId ? { branchId } : {}),
            type: "REFUND",
            isCopy: true,
            createdAt: { gte: periodStart, lte: periodEnd },
          },
        }),
        prisma.dailyOpeningDeposit.findFirst({
          where: {
            companyId,
            ...(branchId ? { branchId } : {}),
            date: { gte: periodStartDay },
          },
          orderBy: { createdAt: "desc" },
        }),
      ]);

    const sells = await prisma.sell.findMany({
      where: {
        companyId,
        ...(branchId ? { branchId } : {}),
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      include: {
        sellItems: {
          include: { item: { include: { category: true } } },
        },
      },
    });

    const ns = sells.filter((s) => s.type === "SALE" && !s.isTrainingMode);
    const nr = sells.filter((s) => s.type === "REFUND" && !s.isTrainingMode);
    const ts = sells.filter((s) => s.type === "SALE" && s.isTrainingMode);
    const tr = sells.filter((s) => s.type === "REFUND" && s.isTrainingMode);
    const ps = sells.filter((s) => s.type === "PROFORMA");

    const sumField = (arr: typeof ns, field: "totalAmount" | "taxAmount") =>
      arr.reduce((acc, s) => acc + Math.abs(Number(s[field] ?? 0)), 0);

    const nsSellItems = ns.flatMap((s) => s.sellItems);

    const totalItemsSold = nsSellItems.length;
    const totalDiscounts = nsSellItems.reduce((acc, si) => {
      const d = Number(si.discount ?? 0);
      return acc + (d / 100) * Number(si.sellPrice) * Number(si.quantity);
    }, 0);
    const incompleteCount = ns.filter(
      (s) => s.paymentMode === "CREDIT" || s.paymentMode === "HALF_PAID",
    ).length;

    // Category breakdown
    const categoryMap = new Map<string, number>();
    for (const si of nsSellItems) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cat = (si.item as any)?.category?.categoryName ?? "Uncategorized";
      categoryMap.set(
        cat,
        (categoryMap.get(cat) ?? 0) + Number(si.totalAmount),
      );
    }
    const byCategory = Array.from(categoryMap.entries()).map(
      ([categoryName, amount]) => ({
        categoryName,
        amount: Number(amount.toFixed(2)),
      }),
    );

    // Payment method breakdown
    const methodMap = new Map<
      string,
      {
        salesAmount: number;
        salesTax: number;
        refundAmount: number;
        refundTax: number;
      }
    >();
    const accumulate = (
      arr: typeof ns,
      amtField: "salesAmount" | "refundAmount",
      taxField: "salesTax" | "refundTax",
    ) => {
      for (const s of arr) {
        const method =
          s.paymentMode === "CREDIT"
            ? "CREDIT"
            : (PAYMENT_LABELS[s.paymentMethod ?? ""] ??
              s.paymentMethod ??
              "OTHER");
        const e = methodMap.get(method) ?? {
          salesAmount: 0,
          salesTax: 0,
          refundAmount: 0,
          refundTax: 0,
        };
        e[amtField] += Math.abs(Number(s.totalAmount ?? 0));
        e[taxField] += Math.abs(Number(s.taxAmount ?? 0));
        methodMap.set(method, e);
      }
    };
    accumulate(ns, "salesAmount", "salesTax");
    accumulate(nr, "refundAmount", "refundTax");

    const byPaymentMethod = Array.from(methodMap.entries()).map(
      ([paymentMethod, v]) => ({
        paymentMethod,
        salesAmount: Number(v.salesAmount.toFixed(2)),
        salesTax: Number(v.salesTax.toFixed(2)),
        refundAmount: Number(v.refundAmount.toFixed(2)),
        refundTax: Number(v.refundTax.toFixed(2)),
      }),
    );

    return {
      data: {
        company: {
          name: company?.name ?? "",
          tin: company?.TIN ?? "",
          mrc: user?.mrcNo ?? "",
        },
        period: {
          startedAt: periodStart.toISOString(),
          endedAt: periodEnd.toISOString(),
        },
        generatedAt: periodEnd.toISOString(),
        summary: {
          totalSalesAmount: Number(sumField(ns, "totalAmount").toFixed(2)),
          totalSalesCount: ns.length,
          totalRefundAmount: Number(sumField(nr, "totalAmount").toFixed(2)),
          totalRefundCount: nr.length,
          totalItemsSold,
          totalDiscounts: Number(totalDiscounts.toFixed(2)),
          openingDeposit: Number(depositRecord?.amount ?? 0),
          incompleteCount,
          tsSalesCount: ts.length,
          trRefundCount: tr.length,
          csSalesCount,
          crRefundCount,
          psProformaCount: ps.length,
        },
        byCategory,
        byPaymentMethod,
      },
      message,
    };
  }
}
