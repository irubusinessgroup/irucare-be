import type { Request } from "express";
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { IPaged, IResponse } from "../utils/interfaces/common";
import type { PaymentMethod } from "@prisma/client";

export interface ProcessPaymentDto {
  billingId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentGateway?: string;
  transactionId?: string;
  paymentReceiptUrl?: string;
}

export interface PaymentGatewayConfig {
  id: string;
  name: string;
  type: PaymentMethod;
  isActive: boolean;
  config?: Record<string, unknown>;
}

export class PaymentGatewayService {
  /**
   * Process a payment through a payment gateway
   */
  public static async processPayment(
    req: Request,
    dto: ProcessPaymentDto,
  ): Promise<IResponse<unknown>> {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Not Authorized", 401);

    const billing = await prisma.clinicBilling.findUnique({
      where: { id: dto.billingId },
    });

    if (!billing) {
      throw new AppError("Billing not found", 404);
    }

    if (billing.status === "PAID" || billing.status === "CANCELLED") {
      throw new AppError(
        `Cannot process payment for ${billing.status} invoice`,
        409,
      );
    }

    // Calculate total paid amount
    const existingPayments = await prisma.billingPayment.findMany({
      where: {
        billingId: dto.billingId,
        status: "COMPLETED",
      },
    });

    const totalPaid = existingPayments.reduce(
      (sum: number, p: { amount: unknown }) => sum + Number(p.amount),
      0,
    );
    const remainingAmount = Number(billing.totalAmount) - totalPaid;

    if (dto.amount > remainingAmount) {
      throw new AppError(
        `Payment amount (${dto.amount}) exceeds remaining balance (${remainingAmount})`,
        400,
      );
    }

    // Process payment through gateway (mock implementation)
    // In production, this would call actual payment gateway APIs
    let paymentStatus = "PENDING";
    let transactionId = dto.transactionId;
    const receiptUrl = dto.paymentReceiptUrl;

    if (dto.paymentGateway) {
      // Simulate payment processing
      // In real implementation, call payment gateway API here
      paymentStatus = "COMPLETED";
      if (!transactionId) {
        transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
    }

    // Create payment record
    const payment = await prisma.billingPayment.create({
      data: {
        billingId: dto.billingId,
        amount: dto.amount,
        paymentMethod: dto.paymentMethod,
        paymentGateway: dto.paymentGateway,
        transactionId: transactionId,
        paymentReceiptUrl: receiptUrl,
        status: paymentStatus,
        paidAt: paymentStatus === "COMPLETED" ? new Date() : null,
      },
    });

    // Update billing status if fully paid
    const newTotalPaid = totalPaid + dto.amount;
    const isFullyPaid = newTotalPaid >= Number(billing.totalAmount);

    if (isFullyPaid && paymentStatus === "COMPLETED") {
      await prisma.clinicBilling.update({
        where: { id: dto.billingId },
        data: {
          status: "PAID",
          paidDate: new Date(),
          paymentMethod: dto.paymentMethod,
          paymentGateway: dto.paymentGateway,
          transactionId: transactionId,
          paymentReceiptUrl: receiptUrl,
        },
      });
    } else if (paymentStatus === "COMPLETED") {
      // Partial payment - update billing with payment info but keep status as SENT
      await prisma.clinicBilling.update({
        where: { id: dto.billingId },
        data: {
          paymentMethod: dto.paymentMethod,
          paymentGateway: dto.paymentGateway,
          transactionId: transactionId,
          paymentReceiptUrl: receiptUrl,
        },
      });
    }

    return {
      statusCode: 201,
      message: "Payment processed successfully",
      data: payment,
    };
  }

  /**
   * Get available payment gateways for a company
   */
  public static async getPaymentGateways(
    req: Request,
  ): Promise<IResponse<PaymentGatewayConfig[]>> {
    const companyId =
      (req.user && typeof req.user === "object"
        ? (req.user as unknown as { company?: { companyId?: string } }).company
            ?.companyId
        : undefined) || undefined;

    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    // Get company tools for gateway configuration
    const companyTools = await prisma.companyTools.findFirst({
      where: { companyId },
    });

    // Default available gateways
    const gateways: PaymentGatewayConfig[] = [
      {
        id: "mtn-mobile-money",
        name: "MTN Mobile Money",
        type: "MTN_MOBILE_MONEY",
        isActive: true,
      },
      {
        id: "airtel-money",
        name: "Airtel Money",
        type: "AIRTEL_MONEY",
        isActive: true,
      },
      {
        id: "credit-card",
        name: "Credit Card",
        type: "CARD",
        isActive: true,
      },
      {
        id: "bank-transfer",
        name: "Bank Transfer",
        type: "BANK_TRANSFER",
        isActive: true,
      },
    ];

    // If company has configured gateways in bankAccounts, use those
    if (companyTools?.bankAccounts) {
      const bankAccounts = companyTools.bankAccounts as Array<{
        gatewayId?: string;
        isActive?: boolean;
      }>;
      // Merge with configured gateways
    }

    return {
      statusCode: 200,
      message: "Payment gateways retrieved successfully",
      data: gateways,
    };
  }

  /**
   * Get payment history for a billing
   */
  public static async getPaymentHistory(
    billingId: string,
  ): Promise<IResponse<unknown[]>> {
    const billing = await prisma.clinicBilling.findUnique({
      where: { id: billingId },
    });

    if (!billing) {
      throw new AppError("Billing not found", 404);
    }

    const payments = await prisma.billingPayment.findMany({
      where: { billingId },
      orderBy: { createdAt: "desc" },
    });

    return {
      statusCode: 200,
      message: "Payment history retrieved successfully",
      data: payments,
    };
  }

  /**
   * Get payment history with pagination
   */
  public static async getPaymentHistoryPaged(
    billingId: string,
    page?: number,
    limit?: number,
  ): Promise<IPaged<unknown[]>> {
    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 15;
    const skip = (pageNum - 1) * limitNum;

    const billing = await prisma.clinicBilling.findUnique({
      where: { id: billingId },
    });

    if (!billing) {
      throw new AppError("Billing not found", 404);
    }

    const [data, totalItems] = await Promise.all([
      prisma.billingPayment.findMany({
        where: { billingId },
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
      }),
      prisma.billingPayment.count({ where: { billingId } }),
    ]);

    return {
      data,
      totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      statusCode: 200,
      message: "Payment history retrieved successfully",
    };
  }
}
