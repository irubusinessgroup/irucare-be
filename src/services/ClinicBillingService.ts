import type { Request } from "express";
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { IPaged, IResponse } from "../utils/interfaces/common";
import type {
  BillingServiceLineInput,
  CreateClinicBillingDto,
  UpdateClinicBillingDto,
} from "../utils/interfaces/common";
import { PaymentMethod } from "@prisma/client";

export type BillingStatus = "DRAFT" | "SENT" | "PAID" | "CANCELLED";

async function getNextInvoiceNumber(companyId?: string): Promise<string> {
  if (!companyId) {
    // Fallback unique invoice number if no company context
    const ts = new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, "")
      .slice(0, 14);
    return `INV-${ts}`;
  }
  const prefix = "INV";
  const seq = await prisma.invoiceSequence.upsert({
    where: { companyId_prefix: { companyId, prefix } },
    create: { companyId, prefix, currentNumber: 1 },
    update: { currentNumber: { increment: 1 } },
  });
  const number = seq.currentNumber.toString().padStart(3, "0");
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${number}`;
}

function computeTotals(
  services: BillingServiceLineInput[],
  taxAmount?: number,
  discountAmount?: number,
) {
  const subtotal = services.reduce(
    (sum, s) => sum + s.quantity * s.unitPrice,
    0,
  );
  const tax = taxAmount ?? 0;
  const discount = discountAmount ?? 0;
  const total = subtotal + tax - discount;
  return {
    subtotal,
    taxAmount: tax,
    discountAmount: discount,
    totalAmount: total,
  };
}

export class ClinicBillingService {
  public static async list(
    page?: number,
    limit?: number,
    filters?: { patientId?: string; encounterId?: string; overdue?: boolean },
  ): Promise<IPaged<unknown[]>> {
    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 15;
    const skip = (pageNum - 1) * limitNum;
    const where: Record<string, unknown> = {
      patientId: filters?.patientId || undefined,
      encounterId: filters?.encounterId || undefined,
    };
    if (filters?.overdue) {
      where.status = "SENT";
      where.dueDate = { lt: new Date() };
    }
    const [data, totalItems] = await Promise.all([
      prisma.clinicBilling.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
      }),
      prisma.clinicBilling.count({ where }),
    ]);
    return {
      data,
      totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      statusCode: 200,
      message: "Billings fetched successfully",
    };
  }

  public static async getById(id: string): Promise<IResponse<unknown>> {
    const bill = await prisma.clinicBilling.findUnique({ where: { id } });
    if (!bill) throw new AppError("Billing not found", 404);
    return {
      statusCode: 200,
      message: "Billing fetched successfully",
      data: bill,
    };
  }

  public static async create(
    req: Request,
    dto: CreateClinicBillingDto,
  ): Promise<IResponse<unknown>> {
    const userId = req.user?.id;
    // Extract companyId from authenticated request if present
    const companyId =
      (req.user && typeof req.user === "object"
        ? (req.user as unknown as { company?: { companyId?: string } }).company
            ?.companyId
        : undefined) || undefined;
    if (!userId) throw new AppError("Not Authorized", 401);

    // Validate and enrich services with item data if itemId is provided
    const enrichedServices = await Promise.all(
      dto.services.map(async (service) => {
        if (service.itemId && companyId) {
          const item = await prisma.items.findFirst({
            where: {
              id: service.itemId,
              companyId,
            },
            include: {
              category: true,
            },
          });

          if (item) {
            // Auto-populate service details from item
            return {
              ...service,
              code: service.code || item.itemCodeSku || "",
              description:
                service.description ||
                item.itemFullName ||
                item.description ||
                "",
              unitPrice: service.unitPrice || 0, // Could use item pricing if available
            };
          }
        }
        return service;
      }),
    );

    const invoiceNumber = await getNextInvoiceNumber(companyId);
    const totals = computeTotals(
      enrichedServices,
      dto.taxAmount,
      dto.discountAmount,
    );
    const created = await prisma.clinicBilling.create({
      data: {
        patientId: dto.patientId,
        encounterId: dto.encounterId,
        invoiceNumber,
        billingType: dto.billingType,
        services: enrichedServices as unknown as object[],
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        discountAmount: totals.discountAmount,
        totalAmount: totals.totalAmount,
        currency: dto.currency ?? "USD",
        invoiceDate: new Date(),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        status: "DRAFT",
        notes: dto.notes,
        createdBy: userId,
      },
    });
    return { statusCode: 201, message: "Billing created", data: created };
  }

  public static async update(
    id: string,
    dto: UpdateClinicBillingDto,
  ): Promise<IResponse<unknown>> {
    const existing = await prisma.clinicBilling.findUnique({ where: { id } });
    if (!existing) throw new AppError("Billing not found", 404);
    const totals = dto.services
      ? computeTotals(
          dto.services,
          dto.taxAmount ?? existing.taxAmount,
          dto.discountAmount ?? existing.discountAmount,
        )
      : {
          subtotal: existing.subtotal,
          taxAmount: dto.taxAmount ?? existing.taxAmount,
          discountAmount: dto.discountAmount ?? existing.discountAmount,
          totalAmount:
            (dto.taxAmount ?? existing.taxAmount) +
            existing.subtotal -
            (dto.discountAmount ?? existing.discountAmount),
        };
    const updated = await prisma.clinicBilling.update({
      where: { id },
      data: {
        services:
          (dto.services as unknown as object[]) ??
          (existing.services as unknown as object[]),
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        discountAmount: totals.discountAmount,
        totalAmount: totals.totalAmount,
        currency: dto.currency ?? existing.currency,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : existing.dueDate,
        notes: dto.notes ?? existing.notes,
        status: dto.status ?? existing.status,
      },
    });
    return { statusCode: 200, message: "Billing updated", data: updated };
  }

  public static async remove(id: string): Promise<IResponse<null>> {
    const existing = await prisma.clinicBilling.findUnique({ where: { id } });
    if (!existing) throw new AppError("Billing not found", 404);
    await prisma.clinicBilling.delete({ where: { id } });
    return { statusCode: 200, message: "Billing deleted" };
  }

  public static async send(id: string): Promise<IResponse<unknown>> {
    const existing = await prisma.clinicBilling.findUnique({ where: { id } });
    if (!existing) throw new AppError("Billing not found", 404);
    if (existing.status !== "DRAFT") {
      throw new AppError("Only DRAFT invoices can be sent", 409);
    }
    const updated = await prisma.clinicBilling.update({
      where: { id },
      data: { status: "SENT" },
    });
    return { statusCode: 200, message: "Invoice sent", data: updated };
  }

  public static async pay(
    id: string,
    paymentMethod: string | undefined,
    amount?: number,
    paymentGateway?: string,
    transactionId?: string,
    paymentReceiptUrl?: string,
  ): Promise<IResponse<unknown>> {
    const existing = await prisma.clinicBilling.findUnique({
      where: { id },
      include: { payments: true },
    });
    if (!existing) throw new AppError("Billing not found", 404);
    if (existing.status === "PAID" || existing.status === "CANCELLED") {
      throw new AppError(
        `Cannot process payment for ${existing.status} invoice`,
        409,
      );
    }

    // Calculate total paid amount
    const completedPayments = existing.payments.filter(
      (p) => p.status === "COMPLETED",
    );
    const totalPaid = completedPayments.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );
    const remainingAmount = Number(existing.totalAmount) - totalPaid;

    // If amount is provided, it's a partial payment
    const paymentAmount = amount ?? remainingAmount;

    if (paymentAmount > remainingAmount) {
      throw new AppError(
        `Payment amount (${paymentAmount}) exceeds remaining balance (${remainingAmount})`,
        400,
      );
    }

    // Create payment record if gateway info is provided or amount is specified
    if (paymentGateway || transactionId || paymentReceiptUrl || amount) {
      const payment = await prisma.billingPayment.create({
        data: {
          billingId: id,
          amount: paymentAmount,
          paymentMethod: (paymentMethod as PaymentMethod) ?? "MOBILE_MONEY",
          paymentGateway: paymentGateway,
          transactionId: transactionId,
          paymentReceiptUrl: paymentReceiptUrl,
          status: "COMPLETED",
          paidAt: new Date(),
        },
      });

      const newTotalPaid = totalPaid + paymentAmount;
      const isFullyPaid = newTotalPaid >= Number(existing.totalAmount);

      const updated = await prisma.clinicBilling.update({
        where: { id },
        data: {
          status: isFullyPaid ? "PAID" : existing.status,
          paidDate: isFullyPaid ? new Date() : existing.paidDate,
          paymentMethod: paymentMethod ?? existing.paymentMethod,
          paymentGateway: paymentGateway ?? existing.paymentGateway,
          transactionId: transactionId ?? existing.transactionId,
          paymentReceiptUrl: paymentReceiptUrl ?? existing.paymentReceiptUrl,
        },
      });

      return {
        statusCode: 200,
        message: isFullyPaid
          ? "Invoice paid in full"
          : "Partial payment recorded",
        data: { billing: updated, payment },
      };
    }

    // Legacy behavior: mark as fully paid without payment record
    const updated = await prisma.clinicBilling.update({
      where: { id },
      data: {
        status: "PAID",
        paymentMethod: paymentMethod ?? existing.paymentMethod,
        paidDate: new Date(),
      },
    });
    return { statusCode: 200, message: "Invoice paid", data: updated };
  }

  public static async cancel(id: string): Promise<IResponse<unknown>> {
    const existing = await prisma.clinicBilling.findUnique({ where: { id } });
    if (!existing) throw new AppError("Billing not found", 404);
    if (!(existing.status === "DRAFT" || existing.status === "SENT")) {
      throw new AppError("Only DRAFT or SENT invoices can be cancelled", 409);
    }
    const updated = await prisma.clinicBilling.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    return { statusCode: 200, message: "Invoice cancelled", data: updated };
  }
}
