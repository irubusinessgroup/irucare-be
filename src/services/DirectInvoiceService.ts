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
import { applyMarkup } from "../utils/pricing";
import { selectAvailableStock, reserveStockUnits } from "../utils/stock-ops";

export class DirectInvoiceService {
  static async getAllDirectInvoices(
    filters: DirectInvoiceFilters
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
          company: {
            select: {
              id: true,
              name: true,
              email: true,
              phoneNumber: true,
              TIN: true,
              province: true,
              district: true,
              sector: true,
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
        grandTotal: Number(invoice.grandTotal),
        items: invoice.items.map((item) => ({
          ...item,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.totalPrice),
          isTaxable: item.isTaxable,
          taxRate: Number(item.taxRate),
          taxAmount: Number(item.taxAmount),
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
    companyId: string
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
        company: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
            TIN: true,
            province: true,
            district: true,
            sector: true,
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
        grandTotal: Number(invoice.grandTotal),
        items: invoice.items.map((item) => ({
          ...item,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.totalPrice),
          isTaxable: item.isTaxable,
          taxRate: Number(item.taxRate),
          taxAmount: Number(item.taxAmount),
        })),
      },
    };
  }

  static async createDirectInvoice(
    data: CreateDirectInvoiceDto,
    companyId: string
  ): Promise<IResponse<DirectInvoiceResponse>> {
    // Validate client exists and belongs to company
    const client = await prisma.client.findFirst({
      where: { id: data.clientId, companyId },
    });

    if (!client) {
      throw new AppError(
        "Client not found or doesn't belong to your company",
        404
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
        404
      );
    }

    // Fetch company tools to apply markup pricing
    const companyTools = await prisma.companyTools.findFirst({
      where: { companyId },
    });
    const markupPrice = Number(companyTools?.markupPrice ?? 0);

    // Generate invoice number
    const invoiceNumber = await this.generateInvoiceNumber(companyId);

    // Check stock availability and reserve stock
    const stockReservations: Array<{
      stockIds: string[];
      itemName: string;
      adjustedPrice: number;
    }> = [];

    let subtotal = 0;
    let totalTax = 0;

    for (const itemData of data.items) {
      const item = items.find((i) => i.id === itemData.itemId);
      if (!item) continue;

      // Apply markup to unit price
      const adjustedPrice = applyMarkup(
        Number(itemData.unitPrice),
        markupPrice
      );
      const itemSubtotal = Number(itemData.quantity) * adjustedPrice;

      let itemTax = 0;
      if (item.isTaxable) {
        itemTax = itemSubtotal * (Number(item.taxRate) / 100);
      }
      subtotal += itemSubtotal;
      totalTax += itemTax;

      // Check stock availability
      const selected = await selectAvailableStock(prisma, {
        itemIds: itemData.itemId,
        companyId,
        take: itemData.quantity,
        strategy: "FIFO",
      });

      if (selected.length < itemData.quantity) {
        throw new AppError(
          `Insufficient stock for item ${item.itemFullName}. Available: ${selected.length}, Requested: ${itemData.quantity}`,
          400
        );
      }

      if (selected.length === 0) {
        throw new AppError(
          `No available stock for item ${item.itemFullName}`,
          400
        );
      }

      const stockIds = selected.map((s) => s.id);

      stockReservations.push({
        stockIds,
        itemName: item.itemFullName,
        adjustedPrice,
      });
    }

    const grandTotal = subtotal + totalTax;

    const invoice = await prisma.$transaction(async (tx) => {
      // Create invoice
      const newInvoice = await tx.directInvoice.create({
        data: {
          invoiceNumber,
          clientId: data.clientId,
          companyId,
          subtotal,
          grandTotal,
          dueDate: data.dueDate,
          notes: data.notes,
          status: "DRAFT",
        },
      });

      // Create invoice items with adjusted prices
      const invoiceItems = await Promise.all(
        data.items.map((item, index) => {
          const reservation = stockReservations[index];
          const itemDetails = items.find((i) => i.id === item.itemId);
          const itemSubtotal = item.quantity * reservation.adjustedPrice;
          let itemTax = 0;
          if (itemDetails?.isTaxable) {
            itemTax = itemSubtotal * (Number(itemDetails.taxRate) / 100);
          }
          return tx.directInvoiceItem.create({
            data: {
              invoiceId: newInvoice.id,
              itemId: item.itemId,
              quantity: item.quantity,
              unitPrice: reservation.adjustedPrice,
              totalPrice: item.quantity * reservation.adjustedPrice,
              isTaxable: itemDetails?.isTaxable || false,
              taxRate: itemDetails ? Number(itemDetails.taxRate) : 0,
              taxAmount: itemTax,
            },
          });
        })
      );

      // Reserve stock
      for (const reservation of stockReservations) {
        await reserveStockUnits(tx, {
          stockIds: reservation.stockIds,
          link: { directInvoiceId: newInvoice.id },
        });
      }

      return { ...newInvoice, items: invoiceItems };
    });

    // Fetch complete invoice with relations
    const completeInvoice = await this.getDirectInvoiceById(
      invoice.id,
      companyId
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
    companyId: string
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
          404
        );
      }

      // Fetch company tools to apply markup pricing
      const companyTools = await prisma.companyTools.findFirst({
        where: { companyId },
      });
      const markupPrice = Number(companyTools?.markupPrice ?? 0);

      // Check stock availability and reserve stock
      const stockReservations: Array<{
        stockIds: string[];
        itemName: string;
        adjustedPrice: number;
      }> = [];

      let subtotal = 0;
      let totalTax = 0;

      for (const itemData of data.items) {
        const item = items.find((i) => i.id === itemData.itemId);
        if (!item) continue;

        // Apply markup to unit price
        const adjustedPrice = applyMarkup(
          Number(itemData.unitPrice),
          markupPrice
        );
        const itemSubtotal = Number(itemData.quantity) * adjustedPrice;

        let itemTax = 0;
        if (item.isTaxable) {
          itemTax = itemSubtotal * (Number(item.taxRate) / 100);
        }

        subtotal += itemSubtotal;
        totalTax += itemTax;

        // Check stock availability
        const selected = await selectAvailableStock(prisma, {
          itemIds: itemData.itemId,
          companyId,
          take: itemData.quantity,
          strategy: "FIFO",
        });

        if (selected.length < itemData.quantity) {
          throw new AppError(
            `Insufficient stock for item ${item.itemFullName}. Available: ${selected.length}, Requested: ${itemData.quantity}`,
            400
          );
        }

        if (selected.length === 0) {
          throw new AppError(
            `No available stock for item ${item.itemFullName}`,
            400
          );
        }

        const stockIds = selected.map((s) => s.id);

        stockReservations.push({
          stockIds,
          itemName: item.itemFullName,
          adjustedPrice,
        });
      }

      const grandTotal = subtotal + totalTax;

      updateData = {
        ...updateData,
        subtotal,
        taxAmount: totalTax,
        grandTotal,
      };

      await prisma.$transaction(async (tx) => {
        // Release previously reserved stock
        await tx.stock.updateMany({
          where: { directInvoiceId: id },
          data: {
            status: "AVAILABLE",
            directInvoiceId: null,
          },
        });

        // Update invoice
        await tx.directInvoice.update({
          where: { id },
          data: updateData,
        });

        // Delete existing items
        await tx.directInvoiceItem.deleteMany({
          where: { invoiceId: id },
        });

        // Create new items with adjusted prices
        await Promise.all(
          data.items!.map((item, index) => {
            const reservation = stockReservations[index];
            return tx.directInvoiceItem.create({
              data: {
                invoiceId: id,
                itemId: item.itemId,
                quantity: item.quantity,
                unitPrice: reservation.adjustedPrice,
                totalPrice: item.quantity * reservation.adjustedPrice,
              },
            });
          })
        );

        // Reserve new stock
        for (const reservation of stockReservations) {
          await reserveStockUnits(tx, {
            stockIds: reservation.stockIds,
            link: { directInvoiceId: id },
          });
        }
      });
    } else {
      // Update other fields only
      if (data.clientId) updateData.clientId = data.clientId;
      if (data.dueDate) updateData.dueDate = data.dueDate;
      if (data.notes !== undefined) updateData.notes = data.notes;
      if (data.status) updateData.status = data.status;

      await prisma.directInvoice.update({
        where: { id },
        data: updateData,
      });
    }

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
    companyId: string
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

    await prisma.$transaction(async (tx) => {
      // Release all reserved stock
      await tx.stock.updateMany({
        where: { directInvoiceId: id },
        data: {
          status: "AVAILABLE",
          directInvoiceId: null,
        },
      });

      // Delete the invoice (cascade will handle items)
      await tx.directInvoice.delete({
        where: { id },
      });
    });

    return {
      statusCode: 200,
      message: "Direct invoice deleted successfully",
    };
  }

  static async sendDirectInvoice(
    id: string,
    companyId: string
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

    // Send email notification
    await this.sendInvoiceEmail(id, companyId);

    return {
      statusCode: 200,
      message: "Direct invoice sent successfully",
    };
  }

  static async markDirectInvoiceAsPaid(
    id: string,
    companyId: string
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

    // Convert invoice to sale and create transaction
    await this.convertInvoiceToSale(id, companyId);

    return {
      statusCode: 200,
      message: "Direct invoice marked as paid",
    };
  }

  static async cancelDirectInvoice(
    id: string,
    companyId: string
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

    await prisma.$transaction(async (tx) => {
      // Release all reserved stock
      await tx.stock.updateMany({
        where: { directInvoiceId: id },
        data: {
          status: "AVAILABLE",
          directInvoiceId: null,
        },
      });

      // Update invoice status
      await tx.directInvoice.update({
        where: { id },
        data: { status: "CANCELLED" },
      });
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

  private static async convertInvoiceToSale(
    invoiceId: string,
    companyId: string
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Get invoice with items
      const invoice = await tx.directInvoice.findFirst({
        where: { id: invoiceId, companyId },
        include: {
          items: {
            include: {
              item: {
                select: {
                  id: true,
                  itemCodeSku: true,
                  itemFullName: true,
                },
              },
            },
          },
        },
      });

      if (!invoice) {
        throw new AppError("Invoice not found", 404);
      }

      // Create Sell record
      const sell = await tx.sell.create({
        data: {
          clientId: invoice.clientId,
          companyId: invoice.companyId,
          totalAmount: invoice.grandTotal,
          notes: invoice.notes,
        },
      });

      // Create SellItem records
      for (const invoiceItem of invoice.items) {
        await tx.sellItem.create({
          data: {
            sellId: sell.id,
            itemId: invoiceItem.itemId,
            quantity: invoiceItem.quantity,
            sellPrice: invoiceItem.unitPrice,
            totalAmount: invoiceItem.totalPrice,
            taxAmount: invoiceItem.taxAmount,
          },
        });
      }

      // Update stock status: RESERVED → SOLD
      await tx.stock.updateMany({
        where: { directInvoiceId: invoiceId },
        data: {
          status: "SOLD",
          sellId: sell.id,
          directInvoiceId: null,
        },
      });

      // Create Transaction record
      await tx.transaction.create({
        data: {
          clientId: invoice.clientId,
          companyId: invoice.companyId,
          amount: invoice.grandTotal,
          date: new Date(),
        },
      });
    });
  }

  private static async sendInvoiceEmail(
    invoiceId: string,
    companyId: string
  ): Promise<void> {
    try {
      // Get complete invoice with client and company details
      const invoice = await prisma.directInvoice.findFirst({
        where: { id: invoiceId, companyId },
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
          company: {
            select: {
              id: true,
              name: true,
              email: true,
              phoneNumber: true,
              logo: true,
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
        throw new AppError("Invoice not found", 404);
      }

      // Import email utilities
      const { sendEmail, renderTemplate } = await import("../utils/email");

      // Render email template
      const itemsHtml = invoice.items
        .map(
          (item) => `
        <tr>
          <td>
            <strong>${item.item.itemFullName}</strong>
            ${item.item.description ? `<br><small>${item.item.description}</small>` : ""}
          </td>
          <td>${item.quantity}</td>
          <td>${invoice.currency} ${item.unitPrice.toFixed(2)}</td>
          <td>${invoice.currency} ${item.totalPrice.toFixed(2)}</td>
        </tr>
      `
        )
        .join("");

      const html = renderTemplate("direct-invoice.html", {
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate.toLocaleDateString(),
        dueDate: invoice.dueDate.toLocaleDateString(),
        clientName: invoice.client.name,
        clientEmail: invoice.client.email,
        clientPhone: invoice.client.phone,
        clientAddress: invoice.client.address,
        companyName: invoice.company.name,
        companyEmail: invoice.company.email,
        companyPhone: invoice.company.phoneNumber,
        companyLogo: invoice.company.logo || "",
        subtotal: invoice.subtotal.toFixed(2),
        grandTotal: invoice.grandTotal.toFixed(2),
        currency: invoice.currency,
        notes: invoice.notes || "",
        items: itemsHtml,
      });

      // Send email
      await sendEmail({
        to: invoice.client.email,
        subject: `Invoice ${invoice.invoiceNumber} from ${invoice.company.name}`,
        html,
      });
    } catch (error) {
      // Log error but don't fail the operation
      console.error("Failed to send invoice email:", error);
    }
  }
}
