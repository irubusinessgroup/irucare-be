import { prisma } from "../utils/client";
import AppError from "../utils/error";
import {
  CreateDirectInvoiceDto,
  UpdateDirectInvoiceDto,
  DirectInvoiceResponse,
  DirectInvoiceFilters,
  IPaged,
  IResponse,
} from "../utils/interfaces/common";

export class DirectInvoiceService {
  static async getAllDirectInvoices(
    filters: DirectInvoiceFilters,
  ): Promise<IPaged<DirectInvoiceResponse[]>> {
    const {
      page = 1,
      limit = 15,
      searchq,
      status,
      clientId,
      companyId,
    } = filters;

    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = { companyId };

    if (searchq) {
      where.OR = [
        { invoiceNumber: { contains: searchq } },
        { client: { name: { contains: searchq } } },
        { client: { email: { contains: searchq } } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (clientId) {
      where.clientId = clientId;
    }

    const [invoices, totalItems] = await Promise.all([
      prisma.directInvoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          client: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              address: true,
            },
          },
          items: {
            include: {
              item: {
                select: {
                  id: true,
                  itemCodeSku: true,
                  itemFullName: true,
                  description: true,
                },
              },
            },
          },
        },
      }),
      prisma.directInvoice.count({ where }),
    ]);

    return {
      data: invoices.map((invoice) => ({
        ...invoice,
        subtotal: Number(invoice.subtotal),
        vat: Number(invoice.vat),
        vatRate: Number(invoice.vatRate),
        grandTotal: Number(invoice.grandTotal),
        items: invoice.items.map((item) => ({
          ...item,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.totalPrice),
        })),
      })),
      totalItems,
      currentPage: page,
      itemsPerPage: limit,
      statusCode: 200,
      message: "Direct invoices retrieved successfully",
    };
  }

  static async getDirectInvoiceById(
    id: string,
    companyId: string,
  ): Promise<IResponse<DirectInvoiceResponse>> {
    const invoice = await prisma.directInvoice.findFirst({
      where: { id, companyId },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true,
          },
        },
        items: {
          include: {
            item: {
              select: {
                id: true,
                itemCodeSku: true,
                itemFullName: true,
                description: true,
              },
            },
          },
        },
      },
    });

    if (!invoice) {
      throw new AppError("Direct invoice not found", 404);
    }

    return {
      statusCode: 200,
      message: "Direct invoice retrieved successfully",
      data: {
        ...invoice,
        subtotal: Number(invoice.subtotal),
        vat: Number(invoice.vat),
        vatRate: Number(invoice.vatRate),
        grandTotal: Number(invoice.grandTotal),
        items: invoice.items.map((item) => ({
          ...item,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.totalPrice),
        })),
      },
    };
  }

  static async createDirectInvoice(
    data: CreateDirectInvoiceDto,
    companyId: string,
  ): Promise<IResponse<DirectInvoiceResponse>> {
    // Validate client exists and belongs to company
    const client = await prisma.client.findFirst({
      where: { id: data.clientId, companyId },
    });

    if (!client) {
      throw new AppError(
        "Client not found or doesn't belong to your company",
        404,
      );
    }

    // Validate items exist and belong to company
    const itemIds = data.items.map((item) => item.itemId);
    const items = await prisma.items.findMany({
      where: { id: { in: itemIds }, companyId },
    });

    if (items.length !== itemIds.length) {
      throw new AppError(
        "One or more items not found or don't belong to your company",
        404,
      );
    }

    // Generate invoice number
    const invoiceNumber = await this.generateInvoiceNumber(companyId);

    // Calculate totals
    const subtotal = data.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );
    const vatRate = data.vatRate || 0;
    const vat = (subtotal * vatRate) / 100;
    const grandTotal = subtotal + vat;

    const invoice = await prisma.$transaction(async (tx) => {
      // Create invoice
      const newInvoice = await tx.directInvoice.create({
        data: {
          invoiceNumber,
          clientId: data.clientId,
          companyId,
          subtotal,
          vat,
          vatRate,
          grandTotal,
          dueDate: data.dueDate,
          notes: data.notes,
          status: "DRAFT",
        },
      });

      // Create invoice items
      const invoiceItems = await Promise.all(
        data.items.map((item) =>
          tx.directInvoiceItem.create({
            data: {
              invoiceId: newInvoice.id,
              itemId: item.itemId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.quantity * item.unitPrice,
              description: item.description,
            },
          }),
        ),
      );

      return { ...newInvoice, items: invoiceItems };
    });

    // Fetch complete invoice with relations
    const completeInvoice = await this.getDirectInvoiceById(
      invoice.id,
      companyId,
    );

    return {
      statusCode: 201,
      message: "Direct invoice created successfully",
      data: completeInvoice.data!,
    };
  }

  static async updateDirectInvoice(
    id: string,
    data: UpdateDirectInvoiceDto,
    companyId: string,
  ): Promise<IResponse<DirectInvoiceResponse>> {
    const existingInvoice = await prisma.directInvoice.findFirst({
      where: { id, companyId },
    });

    if (!existingInvoice) {
      throw new AppError("Direct invoice not found", 404);
    }

    if (existingInvoice.status !== "DRAFT") {
      throw new AppError("Only draft invoices can be updated", 400);
    }

    let updateData: Record<string, unknown> = {};

    // If items are being updated, recalculate totals
    if (data.items) {
      // Validate items exist and belong to company
      const itemIds = data.items.map((item) => item.itemId);
      const items = await prisma.items.findMany({
        where: { id: { in: itemIds }, companyId },
      });

      if (items.length !== itemIds.length) {
        throw new AppError(
          "One or more items not found or don't belong to your company",
          404,
        );
      }

      const subtotal = data.items.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0,
      );
      const vatRate = data.vatRate ?? Number(existingInvoice.vatRate);
      const vat = (subtotal * vatRate) / 100;
      const grandTotal = subtotal + vat;

      updateData = {
        ...updateData,
        subtotal,
        vat,
        vatRate,
        grandTotal,
      };
    }

    // Update other fields
    if (data.clientId) updateData.clientId = data.clientId;
    if (data.dueDate) updateData.dueDate = data.dueDate;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.status) updateData.status = data.status;

    await prisma.$transaction(async (tx) => {
      // Update invoice
      await tx.directInvoice.update({
        where: { id },
        data: updateData,
      });

      // Update items if provided
      if (data.items) {
        // Delete existing items
        await tx.directInvoiceItem.deleteMany({
          where: { invoiceId: id },
        });

        // Create new items
        await Promise.all(
          data.items.map((item) =>
            tx.directInvoiceItem.create({
              data: {
                invoiceId: id,
                itemId: item.itemId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.quantity * item.unitPrice,
                description: item.description,
              },
            }),
          ),
        );
      }
    });

    // Fetch complete invoice with relations
    const completeInvoice = await this.getDirectInvoiceById(id, companyId);

    return {
      statusCode: 200,
      message: "Direct invoice updated successfully",
      data: completeInvoice.data!,
    };
  }

  static async deleteDirectInvoice(
    id: string,
    companyId: string,
  ): Promise<IResponse<null>> {
    const invoice = await prisma.directInvoice.findFirst({
      where: { id, companyId },
    });

    if (!invoice) {
      throw new AppError("Direct invoice not found", 404);
    }

    if (invoice.status !== "DRAFT") {
      throw new AppError("Only draft invoices can be deleted", 400);
    }

    await prisma.directInvoice.delete({
      where: { id },
    });

    return {
      statusCode: 200,
      message: "Direct invoice deleted successfully",
    };
  }

  static async sendDirectInvoice(
    id: string,
    companyId: string,
  ): Promise<IResponse<null>> {
    const invoice = await prisma.directInvoice.findFirst({
      where: { id, companyId },
    });

    if (!invoice) {
      throw new AppError("Direct invoice not found", 404);
    }

    if (invoice.status !== "DRAFT") {
      throw new AppError("Only draft invoices can be sent", 400);
    }

    await prisma.directInvoice.update({
      where: { id },
      data: { status: "SENT" },
    });

    return {
      statusCode: 200,
      message: "Direct invoice sent successfully",
    };
  }

  static async markDirectInvoiceAsPaid(
    id: string,
    companyId: string,
  ): Promise<IResponse<null>> {
    const invoice = await prisma.directInvoice.findFirst({
      where: { id, companyId },
    });

    if (!invoice) {
      throw new AppError("Direct invoice not found", 404);
    }

    if (invoice.status === "CANCELLED") {
      throw new AppError("Cancelled invoices cannot be marked as paid", 400);
    }

    await prisma.directInvoice.update({
      where: { id },
      data: { status: "PAID" },
    });

    return {
      statusCode: 200,
      message: "Direct invoice marked as paid",
    };
  }

  static async cancelDirectInvoice(
    id: string,
    companyId: string,
  ): Promise<IResponse<null>> {
    const invoice = await prisma.directInvoice.findFirst({
      where: { id, companyId },
    });

    if (!invoice) {
      throw new AppError("Direct invoice not found", 404);
    }

    if (invoice.status === "PAID") {
      throw new AppError("Paid invoices cannot be cancelled", 400);
    }

    await prisma.directInvoice.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    return {
      statusCode: 200,
      message: "Direct invoice cancelled successfully",
    };
  }

  static async generateInvoiceNumber(companyId: string): Promise<string> {
    const sequence = await prisma.invoiceSequence.upsert({
      where: { companyId_prefix: { companyId, prefix: "INV" } },
      update: { currentNumber: { increment: 1 } },
      create: { companyId, prefix: "INV", currentNumber: 1 },
    });

    return `${sequence.prefix}-${String(sequence.currentNumber).padStart(6, "0")}`;
  }
}
