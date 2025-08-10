import { prisma } from "../utils/client";
import AppError from "../utils/error";
import {
  CreateStockEntryRequest,
  StockEntryResponse,
  StockEntryFilters,
  InventoryItem,
  ExpiringItem,
  IResponse,
  IPaged,
} from "../utils/interfaces/common";
import { StockCalculations } from "../utils/calculations";

export class StockService {
  static async createStockEntry(
    data: CreateStockEntryRequest,
    registeredByUserId: string,
    receivedByUserId: string
  ): Promise<StockEntryResponse> {
    await this.validateReferences(data);

    const totalCost = StockCalculations.calculateTotalCost(
      data.quantity_received,
      data.unit_cost
    );

    return await prisma.$transaction(async (tx) => {
      const stockReceipt = await tx.stockReceipts.create({
        data: {
          form_code: await this.generateFormCode(),
          item_id: data.item_id,
          po_id: data.po_id,
          invoice_id: data.invoice_id,
          supplier_id: data.supplier_id,
          date_received: new Date(),
          quantity_received: data.quantity_received,
          unit_cost: data.unit_cost,
          total_cost: totalCost,
          currency_id: data.currency_id,
          condition_id: data.condition_id,
          storage_location_id: data.storage_location_id,
          special_handling_notes: data.special_handling_notes,
          remarks_notes: data.remarks_notes,
          registered_by_user_id: registeredByUserId,
          received_by_user_id: receivedByUserId,
        },
        include: {
          item: {
            include: {
              category: true,
              uom: true,
              temp: true,
            },
          },
          supplier: true,
          currency: true,
          condition: true,
          storage_location: true,
          registered_by_user_by_user: true,
          received_by_user: true,
          stockBatches: true,
          stockSerials: true,
        },
      });

      if (data.batch_lot_number) {
        await tx.stockBatches.create({
          data: {
            receipt_id: stockReceipt.id,
            batch_lot_number: data.batch_lot_number,
            expiry_date: data.expiry_date,
            quantity_in_batch: data.quantity_received,
            current_stock_quantity: data.quantity_received,
            updated_by_user_id: registeredByUserId,
          },
        });
      }

      if (data.serial_numbers && data.serial_numbers.length > 0) {
        const serialPromises = data.serial_numbers.map((serial) =>
          tx.stockSerials.create({
            data: {
              receipt_id: stockReceipt.id,
              serial_number: serial,
              current_status: "IN_STOCK",
              updated_by_user_id: registeredByUserId,
            },
          })
        );
        await Promise.all(serialPromises);
      }

      return this.mapToStockEntryResponse(stockReceipt);
    });
  }

  static async updateStockEntry(
    id: string,
    data: Partial<CreateStockEntryRequest>,
    updatedByUserId: string
  ): Promise<IResponse<StockEntryResponse>> {
    const existingEntry = await prisma.stockReceipts.findUnique({
      where: { id },
    });

    if (!existingEntry) {
      throw new AppError("Stock receipt is not found", 404);
    }

    const totalCost =
      data.quantity_received && data.unit_cost
        ? StockCalculations.calculateTotalCost(
            data.quantity_received,
            data.unit_cost
          )
        : data.quantity_received
          ? StockCalculations.calculateTotalCost(
              data.quantity_received,
              parseFloat(existingEntry.unit_cost.toString())
            )
          : data.unit_cost
            ? StockCalculations.calculateTotalCost(
                parseFloat(existingEntry.quantity_received.toString()),
                data.unit_cost
              )
            : parseFloat(existingEntry.total_cost.toString());

    const updatedEntry = await prisma.stockReceipts.update({
      where: { id },
      data: {
        ...data,
        total_cost: totalCost,
        updatedAt: new Date(),
      },
      include: {
        item: {
          include: {
            category: true,
            uom: true,
            temp: true,
          },
        },
        supplier: true,
        currency: true,
        condition: true,
        storage_location: true,
        registered_by_user_by_user: true,
        received_by_user: true,
        stockBatches: true,
        stockSerials: true,
      },
    });

    return {
      statusCode: 200,
      message: "Stock receipt updated successfully",
      data: this.mapToStockEntryResponse(updatedEntry),
    };
  }

  static async deleteStockEntry(id: string): Promise<void> {
    const stockEntry = await prisma.stockReceipts.findUnique({
      where: { id },
      include: {
        stockBatches: true,
        stockSerials: true,
        approvals: true,
      },
    });

    if (!stockEntry) {
      throw new AppError("Stock entry is not found", 404);
    }

    await prisma.$transaction(async (tx) => {
      await tx.approvals.deleteMany({
        where: { receipt_id: id },
      });

      await tx.stockSerials.deleteMany({
        where: { receipt_id: id },
      });

      await tx.stockBatches.deleteMany({
        where: { receipt_id: id },
      });

      await tx.stockReceipts.delete({
        where: { id },
      });
    });
  }

  static async getStockEntry(
    id: string
  ): Promise<IResponse<StockEntryResponse>> {
    const stockEntry = await prisma.stockReceipts.findUnique({
      where: { id },
      include: {
        item: {
          include: {
            category: true,
            uom: true,
            temp: true,
          },
        },
        supplier: true,
        currency: true,
        condition: true,
        storage_location: true,
        registered_by_user_by_user: true,
        received_by_user: true,
        stockBatches: true,
        stockSerials: true,
      },
    });

    if (!stockEntry) {
      throw new AppError("Stock entry not found", 404);
    }

    return {
      statusCode: 200,
      message: "Stock entry fetched successfully",
      data: this.mapToStockEntryResponse(stockEntry),
    };
  }

  static async getStockEntries(
    filters: StockEntryFilters,
    page: number = 1,
    limit: number = 10
  ): Promise<IPaged<StockEntryResponse[]>> {
    try {
      const skip = (page - 1) * limit;

      const whereClause: any = {};

      if (filters.item_id) {
        whereClause.item_id = filters.item_id;
      }

      if (filters.supplier_id) {
        whereClause.supplier_id = filters.supplier_id;
      }

      if (filters.condition_id) {
        whereClause.condition_id = filters.condition_id;
      }

      if (filters.date_from || filters.date_to) {
        whereClause.date_received = {};
        if (filters.date_from) {
          whereClause.date_received.gte = filters.date_from;
        }
        if (filters.date_to) {
          whereClause.date_received.lte = filters.date_to;
        }
      }

      const totalItems = await prisma.stockReceipts.count({
        where: whereClause,
      });

      const stockReceipts = await prisma.stockReceipts.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: {
          created_at: "desc",
        },
        include: {
          item: {
            include: {
              category: true,
              uom: true,
              temp: true,
            },
          },
          supplier: true,
          currency: true,
          condition: true,
          storage_location: true,
          stockBatches: true,
          stockSerials: true,
          registered_by_user_by_user: true,
          received_by_user: true,
        },
      });

      const data = stockReceipts.map((receipt) =>
        this.mapToStockEntryResponse(receipt)
      );

      return {
        data,
        totalItems,
        currentPage: page,
        itemsPerPage: limit,
        statusCode: 200,
        message: "Stock entries retrieved successfully",
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  async getInventory(): Promise<InventoryItem[]> {
    const items = await prisma.items.findMany({
      where: { is_active: true },
      include: {
        category: true,
        uom: true,
        stockReciepts: {
          include: {
            stockBatches: true,
            currency: true,
          },
          orderBy: {
            date_received: "desc",
          },
        },
      },
    });

    return items.map((item) => {
      const batches = item.stockReciepts.flatMap((receipt) =>
        receipt.stockBatches.map((batch) => ({
          id: batch.id,
          batch_lot_number: batch.batch_lot_number,
          expiry_date: batch.expiry_date,
          quantity_in_batch: parseFloat(batch.quantity_in_batch.toString()),
          current_stock_quantity: parseFloat(
            batch.current_stock_quantity.toString()
          ),
        }))
      );

      const currentStock = batches.reduce(
        (total, batch) => total + batch.current_stock_quantity,
        0
      );

      const latestReceipt = item.stockReciepts[0];
      const totalValue = latestReceipt
        ? currentStock * parseFloat(latestReceipt.unit_cost.toString())
        : 0;

      const expiryAlert = batches.some((batch) => {
        if (!batch.expiry_date) return false;
        const daysToExpiry = StockCalculations.calculateDaysToExpiry(
          batch.expiry_date
        );
        return daysToExpiry <= 30;
      });

      return {
        id: item.id,
        item_code_sku: item.item_code_sku,
        item_full_name: item.item_full_name,
        category_name: item.category.category_name,
        current_stock: currentStock,
        uom_abbreviation: item.uom.abbreviation || item.uom.uom_name,
        total_value: totalValue,
        currency_code: latestReceipt?.currency.currency_code || "RWF",
        batches,
        last_received: item.stockReciepts[0]?.date_received || item.created_at,
        expiry_alert: expiryAlert,
      };
    });
  }

  async getExpiringItems(days: number = 30): Promise<ExpiringItem[]> {
    const batches = await prisma.stockBatches.findMany({
      where: {
        expiry_date: {
          not: null,
          lte: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        },
        current_stock_quantity: {
          gt: 0,
        },
      },
      include: {
        stock_receipts: {
          include: {
            item: true,
          },
        },
      },
      orderBy: {
        expiry_date: "asc",
      },
    });

    return batches.map((batch) => {
      const daysToExpiry = StockCalculations.calculateDaysToExpiry(
        batch.expiry_date!
      );

      return {
        id: batch.id,
        item_code_sku: batch.stock_receipts.item.item_code_sku,
        item_full_name: batch.stock_receipts.item.item_full_name,
        batch_lot_number: batch.batch_lot_number,
        expiry_date: batch.expiry_date!,
        current_stock_quantity: parseFloat(
          batch.current_stock_quantity.toString()
        ),
        days_to_expiry: daysToExpiry,
        alert_level: StockCalculations.getExpiryAlertLevel(daysToExpiry),
      };
    });
  }

  private static async validateReferences(
    data: CreateStockEntryRequest
  ): Promise<void> {
    const item = await prisma.items.findUnique({
      where: { id: data.item_id },
    });
    if (!item) {
      throw new AppError("Item not found", 404);
    }

    const supplier = await prisma.suppliers.findUnique({
      where: { id: data.supplier_id },
    });
    if (!supplier) {
      throw new AppError("Supplier not found", 404);
    }

    const currency = await prisma.currencies.findUnique({
      where: { id: data.currency_id },
    });
    if (!currency) {
      throw new AppError("Currency not found", 404);
    }

    const condition = await prisma.conditionTypes.findUnique({
      where: { id: data.condition_id },
    });
    if (!condition) {
      throw new AppError("Condition type not found", 404);
    }

    const location = await prisma.storageLocations.findUnique({
      where: { id: data.storage_location_id },
    });
    if (!location) {
      throw new AppError("Storage location not found", 404);
    }

    if (data.po_id) {
      const po = await prisma.purchaseOrders.findUnique({
        where: { id: data.po_id },
      });
      if (!po) {
        throw new AppError("Purchase order not found", 404);
      }
    }
    if (data.invoice_id) {
      const invoice = await prisma.invoices.findUnique({
        where: { id: data.invoice_id },
      });
      if (!invoice) {
        throw new AppError("Invoice not found", 404);
      }
    }
  }

  private static async generateFormCode(): Promise<string> {
    const year = new Date().getFullYear();
    const month = (new Date().getMonth() + 1).toString().padStart(2, "0");

    const count = await prisma.stockReceipts.count({
      where: {
        created_at: {
          gte: new Date(year, new Date().getMonth(), 1),
          lt: new Date(year, new Date().getMonth() + 1, 1),
        },
      },
    });

    return `SR${year}${month}${(count + 1).toString().padStart(4, "0")}`;
  }

  private static mapToStockEntryResponse(entry: any): StockEntryResponse {
    return {
      id: entry.id,
      form_code: entry.form_code,
      item: {
        id: entry.item.id,
        item_code_sku: entry.item.item_code_sku,
        item_full_name: entry.item.item_full_name,
        category: {
          id: entry.item.category.id,
          category_name: entry.item.category.category_name,
          description: entry.item.category.description,
        },
        description: entry.item.description,
        brand_manufacturer: entry.item.brand_manufacturer,
        barcode_qr_code: entry.item.barcode_qr_code,
        pack_size: entry.item.pack_size
          ? parseFloat(entry.item.pack_size.toString())
          : undefined,
        uom: {
          id: entry.item.uom.id,
          uom_name: entry.item.uom.uom_name,
          abbreviation: entry.item.uom.abbreviation,
        },
        temp: {
          id: entry.item.temp.id,
          temp_req_name: entry.item.temp.temp_req_name,
          min_temp_celsius: entry.item.temp.min_temp_celsius
            ? parseFloat(entry.item.temp.min_temp_celsius.toString())
            : undefined,
          max_temp_celsius: entry.item.temp.max_temp_celsius
            ? parseFloat(entry.item.temp.max_temp_celsius.toString())
            : undefined,
        },
        is_active: entry.item.is_active,
        created_at: entry.item.created_at,
        updated_at: entry.item.updated_at,
      },
      supplier: {
        id: entry.supplier.id,
        supplier_name: entry.supplier.supplier_name,
        contact_person: entry.supplier.contact_person,
        phone_number: entry.supplier.phone_number,
        email: entry.supplier.email,
        address: entry.supplier.address,
        is_active: entry.supplier.is_active,
        created_at: entry.supplier.created_at,
      },
      date_received: entry.date_received,
      quantity_received: parseFloat(entry.quantity_received.toString()),
      unit_cost: parseFloat(entry.unit_cost.toString()),
      total_cost: parseFloat(entry.total_cost.toString()),
      currency: {
        id: entry.currency.id,
        currency_code: entry.currency.currency_code,
      },
      condition: {
        id: entry.condition.id,
        condition_name: entry.condition.condition_name,
        description: entry.condition.description,
      },
      storage_location: {
        id: entry.storage_location.id,
        location_name: entry.storage_location.location_name,
        location_type: entry.storage_location.location_type,
        description: entry.storage_location.description,
      },
      batch_info: entry.stockBatches
        ? entry.stockBatches.map((batch: any) => ({
            id: batch.id,
            batch_lot_number: batch.batch_lot_number,
            expiry_date: batch.expiry_date,
            quantity_in_batch: parseFloat(batch.quantity_in_batch.toString()),
            current_stock_quantity: parseFloat(
              batch.current_stock_quantity.toString()
            ),
          }))
        : [],
      serial_numbers: entry.stockSerials
        ? entry.stockSerials.map((serial: any) => serial.serial_number)
        : [],
      special_handling_notes: entry.special_handling_notes,
      remarks_notes: entry.remarks_notes,
      registered_by_user: {
        id: entry.registered_by_user_by_user.id,
        firstName: entry.registered_by_user_by_user.firstName,
        lastName: entry.registered_by_user_by_user.lastName,
        email: entry.registered_by_user_by_user.email,
      },
      received_by_user: {
        id: entry.received_by_user.id,
        firstName: entry.received_by_user.firstName,
        lastName: entry.received_by_user.lastName,
        email: entry.received_by_user.email,
      },
      created_at: entry.created_at,
      updatedAt: entry.updatedAt,
    };
  }
}
