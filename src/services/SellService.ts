/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import { renderSalesReport } from "../templates/pdf/SalesReportTemplate";
import { CreateSellDto, UpdateSellDto } from "../utils/interfaces/common";
import type { Request } from "express";
import { selectAvailableStock, markStockSold } from "../utils/stock-ops";
import { EbmService } from "./EbmService";
import { StockService } from "./StockService";
import { EbmInvoiceGapResolutionService } from "./EbmInvoiceGapResolutionService";
import { SellType } from "../utils/interfaces/common";
import { PaymentMode } from "@prisma/client";
import {
  getReceiptMessages,
  generateQrCodeData,
} from "../utils/receipt-helpers";
import { randomUUID } from "crypto";
import { requireBranchId, enrichWithBranchLabels } from "../utils/branchScope";

export class SellService {
  private static readonly interactiveTransactionOptions = {
    maxWait: 30000,
    timeout: 120000,
  };

  public static async getAllSells(
    req: Request,
    searchq?: string,
    limit?: number,
    page?: number,
    type?: SellType,
    isTrainingMode?: boolean,
    dateFrom?: string,
    dateTo?: string,
    paymentMode?: string,
  ) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const trainingModeFilter =
      isTrainingMode ?? String(req.query.isTrainingMode) === "true";

    const typeFilter: SellType = (type || "SALE") as SellType;

    // Build date range filter (parsed as local time to avoid UTC midnight off-by-one)
    const dateFilter: any = {};
    if (dateFrom) {
      const [y, m, d] = dateFrom.split("-").map(Number);
      dateFilter.gte = new Date(y, m - 1, d, 0, 0, 0, 0);
    }
    if (dateTo) {
      const [y, m, d] = dateTo.split("-").map(Number);
      dateFilter.lte = new Date(y, m - 1, d, 23, 59, 59, 999);
    }
    const createdAtFilter = Object.keys(dateFilter).length
      ? { createdAt: dateFilter }
      : {};
    const paymentModeFilter = paymentMode
      ? { paymentMode: paymentMode as PaymentMode }
      : {};

    const queryOptions = searchq
      ? {
          companyId,
          ...(branchId ? { branchId } : {}),
          isTrainingMode: trainingModeFilter,
          OR: [
            { client: { name: { contains: searchq } } },
            { item: { itemFullName: { contains: searchq } } },
            { item: { itemCodeSku: { contains: searchq } } },
            ...(Number(searchq) > 0
              ? [{ invcNo: { equals: Math.floor(Number(searchq)) } }]
              : []),
          ],
          type: typeFilter,
          ...createdAtFilter,
          ...paymentModeFilter,
        }
      : {
          companyId,
          ...(branchId ? { branchId } : {}),
          isTrainingMode: trainingModeFilter,
          type: typeFilter,
          ...createdAtFilter,
          ...paymentModeFilter,
        };

    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 15;
    const skip = (pageNum - 1) * limitNum;
    const take = limitNum;

    const sells = await prisma.sell.findMany({
      where: queryOptions,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            tin: true,
          },
        },
        doctor: true,
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

        sellItems: {
          include: {
            item: {
              select: {
                id: true,
                itemCodeSku: true,
                itemFullName: true,
                productCode: true,
                taxCode: true,
                category: {
                  select: {
                    id: true,
                    categoryName: true,
                  },
                },
              },
            },
          },
        },
        // Legacy item for backward compatibility
        item: {
          select: {
            id: true,
            itemCodeSku: true,
            itemFullName: true,
            productCode: true,
            taxCode: true,
            category: {
              select: {
                id: true,
                categoryName: true,
              },
            },
          },
        },
        // Include refunds to calculate net items
        refunds: {
          include: {
            sellItems: {
              select: {
                itemId: true,
                quantity: true,
                totalAmount: true,
                taxAmount: true,
              },
            },
          },
        },
        // Include parentSell for refund records (full details)
        parentSell: {
          include: {
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
            client: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                tin: true,
              },
            },
            sellItems: {
              include: {
                item: {
                  select: {
                    id: true,
                    itemCodeSku: true,
                    itemFullName: true,
                    productCode: true,
                    taxCode: true,
                    category: {
                      select: {
                        id: true,
                        categoryName: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const totalItems = await prisma.sell.count({ where: queryOptions });

    const dataWithReceiptInfo = sells
      .map((sell) => {
        // Fetch company for receipt generation
        const sellCompany = sell.company;

        let processedSell: any = { ...sell };

        // For SALE type, calculate net items after refunds
        if (sell.type === "SALE" && sell.refunds && sell.refunds.length > 0) {
          // Build map of refunded items with quantities
          const refundedItemsMap = new Map<string, number>();

          sell.refunds.forEach((refund) => {
            refund.sellItems.forEach((refundItem) => {
              const currentQty = refundedItemsMap.get(refundItem.itemId) || 0;
              refundedItemsMap.set(
                refundItem.itemId,
                currentQty + Math.abs(Number(refundItem.quantity)),
              );
            });
          });

          // Filter and adjust sellItems
          const netSellItems = sell.sellItems
            .map((sellItem) => {
              const refundedQty = refundedItemsMap.get(sellItem.itemId) || 0;
              const originalQty = Number(sellItem.quantity);
              const remainingQty = originalQty - refundedQty;

              if (remainingQty <= 0) {
                return null; // Fully refunded, exclude
              }

              // Partially refunded, adjust quantities and amounts
              const qtyRatio = remainingQty / originalQty;
              return {
                ...sellItem,
                quantity: remainingQty.toString(),
                totalAmount: (Number(sellItem.totalAmount) * qtyRatio).toFixed(
                  2,
                ),
                taxAmount: (Number(sellItem.taxAmount) * qtyRatio).toFixed(2),
              };
            })
            .filter((item) => item !== null);

          // If all items are fully refunded, exclude this sale
          if (netSellItems.length === 0) {
            return null;
          }

          // Recalculate totals
          const netTotal = netSellItems.reduce(
            (sum, item) => sum + Number(item!.totalAmount),
            0,
          );
          const netTax = netSellItems.reduce(
            (sum, item) => sum + Number(item!.taxAmount),
            0,
          );

          processedSell = {
            ...sell,
            sellItems: netSellItems,
            totalAmount: netTotal.toFixed(2),
            taxAmount: netTax.toFixed(2),
            subtotal: netTotal.toFixed(2),
            patientPayableAmount: netTotal.toFixed(2),
            hasRefunds: true,
            originalTotalAmount: sell.totalAmount,
          };

          // Remove refunds from response to keep it clean
          delete processedSell.refunds;
        }

        return {
          ...processedSell,
          receiptInfo: {
            ...getReceiptMessages(sellCompany),
            qrCodeData: generateQrCodeData(sell),
          },
        };
      })
      .filter((sell) => sell !== null);

    return {
      data: await enrichWithBranchLabels(dataWithReceiptInfo),
      totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      message: "Sales records retrieved successfully",
    };
  }

  /** Export-only: returns ALL sells matching filters with no pagination.
   *  Lean select — only columns needed for Excel/PDF export.
   */
  public static async getAllSellsForExport(
    req: Request,
    type?: SellType,
    isTrainingMode?: boolean,
    dateFrom?: string,
    dateTo?: string,
    paymentMode?: string,
  ) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const trainingModeFilter =
      isTrainingMode ?? String(req.query.isTrainingMode) === "true";
    const typeFilter: SellType = (type || "SALE") as SellType;

    const dateFilter: any = {};
    if (dateFrom) {
      const [y, m, d] = dateFrom.split("-").map(Number);
      dateFilter.gte = new Date(y, m - 1, d, 0, 0, 0, 0);
    }
    if (dateTo) {
      const [y, m, d] = dateTo.split("-").map(Number);
      dateFilter.lte = new Date(y, m - 1, d, 23, 59, 59, 999);
    }
    const createdAtFilter = Object.keys(dateFilter).length
      ? { createdAt: dateFilter }
      : {};
    const paymentModeFilter = paymentMode
      ? { paymentMode: paymentMode as PaymentMode }
      : {};

    const where = {
      companyId,
      ...(branchId ? { branchId } : {}),
      isTrainingMode: trainingModeFilter,
      type: typeFilter,
      ...createdAtFilter,
      ...paymentModeFilter,
    };

    const sells = await prisma.sell.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        paymentMode: true,
        paymentMethod: true,
        totalAmount: true,
        taxAmount: true,
        clientType: true,
        hospital: true,
        insurancePercentage: true,
        insuranceCoveredAmount: true,
        patientPayableAmount: true,
        type: true,
        client: { select: { name: true, phone: true, email: true } },
        doctor: { select: { name: true } },
        sellItems: {
          select: {
            quantity: true,
            sellPrice: true,
            totalAmount: true,
            taxAmount: true,
            item: { select: { itemFullName: true, productCode: true } },
          },
        },
        item: { select: { itemFullName: true, productCode: true } },
      },
    });

    const totalItems = await prisma.sell.count({ where });
    return { data: sells, totalItems, message: "Sells export ready" };
  }

  public static async getSellById(id: string, req: Request) {
    // Fallback when stale routes match /:id before static paths like /sales-report
    if (id === "sales-report") {
      throw new AppError(
        "Use GET /api/sells/sales-report with required startDate and endDate parameters",
        400,
      );
    }
    if (id === "by-invoice" || id.startsWith("by-invoice")) {
      throw new AppError(
        "Use GET /api/sells/by-invoice/{invoiceNumber}",
        400,
      );
    }
    if (id === "export") {
      const { type, isTrainingMode, dateFrom, dateTo, paymentMode } = req.query;
      return SellService.getAllSellsForExport(
        req,
        typeof type === "string" ? (type as any) : undefined,
        isTrainingMode === "true"
          ? true
          : isTrainingMode === "false"
            ? false
            : undefined,
        typeof dateFrom === "string" ? dateFrom : undefined,
        typeof dateTo === "string" ? dateTo : undefined,
        typeof paymentMode === "string" ? paymentMode : undefined,
      );
    }

    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const sell = await prisma.sell.findFirst({
      where: {
        id,
        companyId,
        ...(branchId ? { branchId } : {}),
      },
      include: {
        client: true,
        doctor: true,
        sellItems: {
          include: {
            item: {
              include: {
                category: true,
              },
            },
          },
        },
        // Legacy item for backward compatibility
        item: {
          include: {
            category: true,
          },
        },
        parentSell: {
          include: {
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
            client: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                tin: true,
              },
            },
            sellItems: {
              include: {
                item: {
                  select: {
                    id: true,
                    itemCodeSku: true,
                    itemFullName: true,
                    productCode: true,
                    taxCode: true,
                    category: {
                      select: {
                        id: true,
                        categoryName: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        // Include refunds to calculate net items
        refunds: {
          include: {
            sellItems: {
              select: {
                itemId: true,
                quantity: true,
                totalAmount: true,
                taxAmount: true,
              },
            },
          },
        },
      },
    });

    if (!sell) {
      throw new AppError("Sale record not found", 404);
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    let processedSell: any = { ...sell };

    // For SALE type, calculate net items after refunds
    if (sell.type === "SALE" && sell.refunds && sell.refunds.length > 0) {
      // Build map of refunded items with quantities
      const refundedItemsMap = new Map<string, number>();

      sell.refunds.forEach((refund) => {
        refund.sellItems.forEach((refundItem) => {
          const currentQty = refundedItemsMap.get(refundItem.itemId) || 0;
          refundedItemsMap.set(
            refundItem.itemId,
            currentQty + Math.abs(Number(refundItem.quantity)),
          );
        });
      });

      // Filter and adjust sellItems
      const netSellItems = sell.sellItems
        .map((sellItem) => {
          const refundedQty = refundedItemsMap.get(sellItem.itemId) || 0;
          const originalQty = Number(sellItem.quantity);
          const remainingQty = originalQty - refundedQty;

          if (remainingQty <= 0) {
            return null; // Fully refunded, exclude
          }

          // Partially refunded, adjust quantities and amounts
          const qtyRatio = remainingQty / originalQty;
          return {
            ...sellItem,
            quantity: remainingQty.toString(),
            totalAmount: (Number(sellItem.totalAmount) * qtyRatio).toFixed(2),
            taxAmount: (Number(sellItem.taxAmount) * qtyRatio).toFixed(2),
          };
        })
        .filter((item) => item !== null);

      // If all items are fully refunded, still return the data but mark it
      // The frontend can decide whether to allow further actions
      if (netSellItems.length === 0) {
        processedSell = {
          ...sell,
          sellItems: [],
          totalAmount: "0.00",
          taxAmount: "0.00",
          subtotal: "0.00",
          patientPayableAmount: "0.00",
          hasRefunds: true,
          fullyRefunded: true,
          originalTotalAmount: sell.totalAmount,
        };
      } else {
        // Recalculate totals for partially refunded sales
        const netTotal = netSellItems.reduce(
          (sum, item) => sum + Number(item!.totalAmount),
          0,
        );
        const netTax = netSellItems.reduce(
          (sum, item) => sum + Number(item!.taxAmount),
          0,
        );

        processedSell = {
          ...sell,
          sellItems: netSellItems,
          totalAmount: netTotal.toFixed(2),
          taxAmount: netTax.toFixed(2),
          subtotal: netTotal.toFixed(2),
          patientPayableAmount: netTotal.toFixed(2),
          hasRefunds: true,
          fullyRefunded: false,
          originalTotalAmount: sell.totalAmount,
        };
      }

      // Remove refunds from response to keep it clean
      delete processedSell.refunds;
    }

    // Prepare Receipt Info for Frontend consistency
    const receiptInfo = {
      ...getReceiptMessages(company),
      qrCodeData: generateQrCodeData(sell),
    };

    const deliveryProgress = await SellService.buildSaleDeliveryProgress(
      sell.id,
      processedSell.sellItems || [],
    );

    return {
      data: { ...processedSell, receiptInfo, deliveryProgress },
      message: "Sale record retrieved successfully",
    };
  }

  /** Remaining quantities still available to plan on delivery notes for this sale */
  private static async buildSaleDeliveryProgress(
    sellId: string,
    sellItems: Array<{
      itemId: string;
      quantity: string | number;
      item?: { itemFullName?: string } | null;
    }>,
  ) {
    const deliveries = await prisma.delivery.findMany({
      where: { sellId, status: { not: "CANCELLED" } },
      select: {
        id: true,
        deliveryNumber: true,
        status: true,
        invoiceNumber: true,
        plannedDeliveryDate: true,
        deliveryItems: {
          select: { itemId: true, quantityToDeliver: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const plannedByItem = new Map<string, number>();
    for (const d of deliveries) {
      for (const di of d.deliveryItems) {
        if (!di.itemId) continue;
        plannedByItem.set(
          di.itemId,
          (plannedByItem.get(di.itemId) || 0) + Number(di.quantityToDeliver),
        );
      }
    }

    const items = sellItems.map((si) => {
      const soldQty = Number(si.quantity);
      const plannedQty = plannedByItem.get(si.itemId) || 0;
      const remainingQty = Math.max(0, soldQty - plannedQty);
      return {
        itemId: si.itemId,
        itemName: si.item?.itemFullName || null,
        soldQty,
        plannedQty,
        remainingQty,
      };
    });

    return {
      existingDeliveries: deliveries.map((d) => ({
        id: d.id,
        deliveryNumber: d.deliveryNumber,
        status: d.status,
        invoiceNumber: d.invoiceNumber,
        plannedDeliveryDate: d.plannedDeliveryDate,
      })),
      items,
      fullyPlanned:
        items.length > 0 && items.every((i) => i.remainingQty <= 0),
    };
  }

  /**
   * Lookup a SALE by tax invoice number (invcNo) for delivery planning.
   * Applies the same net-items-after-refunds logic as getSellById.
   */
  public static async getSellByInvoiceNumber(
    invoiceNumber: string,
    req: Request,
  ) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const invcNo = Number(String(invoiceNumber).trim());
    if (!Number.isFinite(invcNo) || invcNo <= 0) {
      throw new AppError("Invalid invoice number", 400);
    }

    const sell = await prisma.sell.findFirst({
      where: {
        invcNo,
        companyId,
        type: "SALE",
        ...(branchId ? { branchId } : {}),
      },
      include: {
        client: true,
        doctor: true,
        sellItems: {
          include: {
            item: {
              include: {
                category: true,
              },
            },
          },
        },
        refunds: {
          include: {
            sellItems: {
              select: {
                itemId: true,
                quantity: true,
                totalAmount: true,
                taxAmount: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!sell) {
      throw new AppError(
        `No sale found for invoice number ${invoiceNumber}`,
        404,
      );
    }

    // Reuse getSellById processing by id (includes receiptInfo + net items)
    return SellService.getSellById(sell.id, req);
  }

  // ========================================
  // HELPER FUNCTIONS FOR TRANSACTION OPTIMIZATION
  // ========================================

  /**
   * Validate all sell data before transaction
   * Returns validated entities to avoid re-querying in transaction
   */
  private static async validateSellData(
    data: CreateSellDto,
    itemsToProcess: Array<{
      itemId: string;
      quantity: number;
      sellPrice: number;
      discount?: number;
    }>,
    companyId: string,
  ) {
    // Validate client
    if (!data.clientId) {
      throw new AppError("Client ID is required", 400);
    }
    const client = await prisma.client.findFirst({
      where: { id: data.clientId, companyId },
    });
    if (!client) {
      throw new AppError(
        "Client not found or doesn't belong to your company",
        404,
      );
    }

    // Validate doctor if provided
    let doctor = null;
    if (data.doctorId) {
      doctor = await prisma.doctor.findFirst({
        where: { id: data.doctorId },
      });
      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }
    }

    // Validate and load items with tax info
    const items = await prisma.items.findMany({
      where: {
        id: { in: itemsToProcess.map((i) => i.itemId) },
        companyId,
      },
      select: {
        id: true,
        itemFullName: true,
        isTaxable: true,
        taxRate: true,
        taxCode: true,
        productCode: true,
        itemCodeSku: true,
        isStockItem: true,
      },
    });

    // Check all items exist
    for (const itemData of itemsToProcess) {
      const item = items.find((i) => i.id === itemData.itemId);
      if (!item) {
        throw new AppError(
          `Item not found or doesn't belong to your company: ${itemData.itemId}`,
          404,
        );
      }
    }

    // Validate insurance card if applicable
    let insuranceCard = null;
    if (data.insuranceCardId && data.clientId) {
      insuranceCard = await prisma.insuranceCard.findFirst({
        where: {
          id: data.insuranceCardId,
          clientId: data.clientId,
          companyId,
        },
        include: { insurance: true },
      });
      if (!insuranceCard) {
        throw new AppError(
          "Insurance card not found or not linked to client/company",
          400,
        );
      }
    }

    // Validate parent sell for refunds
    let parentSell = null;
    if (data.parentSellId) {
      parentSell = await prisma.sell.findUnique({
        where: { id: data.parentSellId },
        include: { sellItems: true },
      });

      if (!parentSell) {
        throw new AppError("Parent sale not found", 404);
      }

      // Verify refund items match parent sale items
      for (const rItem of itemsToProcess) {
        const parentItem = parentSell.sellItems.find(
          (pi) => pi.itemId === rItem.itemId,
        );
        if (!parentItem) {
          throw new AppError(
            `Item ${rItem.itemId} was not part of the original sale`,
            400,
          );
        }
      }
    }

    return {
      client,
      doctor,
      items,
      insuranceCard,
      parentSell,
    };
  }

  /**
   * Calculate all totals and insurance splits before transaction
   */
  private static calculateSellTotals(
    itemsToProcess: Array<{
      itemId: string;
      quantity: number;
      sellPrice: number;
      discount?: number;
    }>,
    items: Array<{
      id: string;
      isTaxable: boolean | null;
      taxRate: any;
    }>,
    insuranceCard: any,
    isPharmacy: boolean,
    clientType?: string,
  ) {
    let totalAmount = 0;
    let totalTaxAmount = 0;
    let subtotal = 0;
    let insuranceCoveredAmount = 0;
    let patientPayableAmount = 0;
    let insurancePercentageSnapshot: number | undefined;

    const sellItems: Array<{
      itemId: string;
      quantity: number;
      sellPrice: number;
      discount?: number;
      totalAmount: number;
      taxAmount: number;
      insuranceCoveredPerUnit?: number;
      patientPricePerUnit?: number;
    }> = [];

    // Calculate base amounts
    for (const itemData of itemsToProcess) {
      const item = items.find((i) => i.id === itemData.itemId);
      if (!item) continue;

      const adjustedSellPrice = Number(itemData.sellPrice);
      const discount = Number(itemData.discount || 0);
      const discountFactor = 1 - discount / 100;

      // Calculate NET amount (Tax Inclusive)
      // Per receipt analysis: Price is Inclusive. Discount applied to Inclusive.
      const itemNetAmount =
        Number(itemData.quantity) * adjustedSellPrice * discountFactor;

      // Extract tax from the inclusive amount
      const taxRate = item.isTaxable ? Number(item.taxRate) : 0;
      const itemTaxAmount = itemNetAmount - itemNetAmount / (1 + taxRate / 100);

      // Total Amount is itemNetAmount (since it's tax inclusive)
      const itemTotalAmount = itemNetAmount;

      totalAmount += itemTotalAmount;
      totalTaxAmount += itemTaxAmount;
      subtotal += itemNetAmount;

      sellItems.push({
        itemId: itemData.itemId,
        quantity: itemData.quantity,
        sellPrice: adjustedSellPrice,
        discount: discount,
        totalAmount: itemTotalAmount,
        taxAmount: itemTaxAmount,
      });
    }

    // Apply insurance if applicable
    const applyInsurance =
      isPharmacy && (clientType === "INSUREE" || !clientType) && insuranceCard;

    if (applyInsurance && insuranceCard) {
      const clientPercentage = Number(insuranceCard.percentage ?? 0);
      insurancePercentageSnapshot = 100 - clientPercentage;
      const percentageFactor = clientPercentage / 100;

      // Calculate per-item split
      for (const s of sellItems) {
        const patientPerUnit = Number(s.sellPrice) * percentageFactor;
        const coveredPerUnit = Number(s.sellPrice) - patientPerUnit;
        s.insuranceCoveredPerUnit = coveredPerUnit;
        s.patientPricePerUnit = patientPerUnit;
        insuranceCoveredAmount += coveredPerUnit * Number(s.quantity);
      }
      patientPayableAmount = subtotal - insuranceCoveredAmount;
    } else {
      insuranceCoveredAmount = 0;
      patientPayableAmount = subtotal;
    }

    return {
      totalAmount: Number(totalAmount.toFixed(2)),
      totalTaxAmount: Number(totalTaxAmount.toFixed(2)),
      subtotal: Number(subtotal.toFixed(2)),
      insuranceCoveredAmount: Number(insuranceCoveredAmount.toFixed(2)),
      patientPayableAmount: Number(patientPayableAmount.toFixed(2)),
      insurancePercentageSnapshot,
      sellItems: sellItems.map((item) => ({
        ...item,
        totalAmount: Number(item.totalAmount.toFixed(2)),
        taxAmount: Number(item.taxAmount.toFixed(2)),
        insuranceCoveredPerUnit: item.insuranceCoveredPerUnit
          ? Number(item.insuranceCoveredPerUnit.toFixed(2))
          : item.insuranceCoveredPerUnit,
        patientPricePerUnit: item.patientPricePerUnit
          ? Number(item.patientPricePerUnit.toFixed(2))
          : item.patientPricePerUnit,
      })),
    };
  }

  /**
   * Calculate refund totals using parent sale's stored values (not recalculating)
   * Pass parentSellItems to use exact stored amounts proportionally
   */
  private static calculateRefundTotals(
    itemsToProcess: Array<{
      itemId: string;
      quantity: number;
      sellPrice: number;
      discount?: number;
    }>,
    items: Array<{
      id: string;
      itemFullName: string;
      isTaxable: boolean | null;
      taxRate: any;
    }>,
    insurancePercentage: number,
    hasInsurance: boolean,
    parentSellItems?: any[],
  ) {
    let refundTotalAmount = 0;
    let refundTotalTaxAmount = 0;
    const refundItemsData: any[] = [];

    for (const itemData of itemsToProcess) {
      const item = items.find((i) => i.id === itemData.itemId);
      if (!item) continue;

      const qty = Number(itemData.quantity);
      const price = Number(itemData.sellPrice);

      let totalAmount: number;
      let taxAmount: number;

      // ✅ If we have parentSellItems, use stored values proportionally
      if (parentSellItems) {
        const parentItem = parentSellItems.find(
          (pi: any) => pi.itemId === itemData.itemId,
        );
        if (parentItem) {
          // Calculate refund ratio based on quantity
          const parentQty = Number(parentItem.quantity);
          const refundRatio = qty / parentQty;

          // Apply ratio to stored amounts (already 2 decimals)
          totalAmount = Number(
            (Number(parentItem.totalAmount) * refundRatio).toFixed(2),
          );
          taxAmount = Number(
            (Number(parentItem.taxAmount) * refundRatio).toFixed(2),
          );
        } else {
          // Fallback to recalculation if parent item not found
          const discount = Number(itemData.discount || 0);
          const discountFactor = 1 - discount / 100;
          const amount = qty * price * discountFactor;
          totalAmount = amount;
          taxAmount = item.isTaxable
            ? amount * (Number(item.taxRate) / (100 + Number(item.taxRate)))
            : 0;
        }
      } else {
        // No parent items, recalculate
        const discount = Number(itemData.discount || 0);
        const discountFactor = 1 - discount / 100;
        const amount = qty * price * discountFactor;
        totalAmount = amount;
        taxAmount = item.isTaxable
          ? amount * (Number(item.taxRate) / (100 + Number(item.taxRate)))
          : 0;
      }

      totalAmount = Number(totalAmount.toFixed(2));
      taxAmount = Number(taxAmount.toFixed(2));

      refundTotalAmount += totalAmount;
      refundTotalTaxAmount += taxAmount;

      // Per-item split
      let insuranceCoveredPerUnit = 0;
      let patientPricePerUnit = price;

      if (hasInsurance) {
        const clientRatio = insurancePercentage / 100;
        patientPricePerUnit = price * clientRatio;
        insuranceCoveredPerUnit = price - patientPricePerUnit;
      }

      refundItemsData.push({
        itemId: itemData.itemId,
        quantity: qty,
        sellPrice: price,
        discount: itemData.discount || 0,
        totalAmount,
        taxAmount,
        insuranceCoveredPerUnit,
        patientPricePerUnit,
      });
    }

    return {
      refundTotalAmount: Number(refundTotalAmount.toFixed(2)),
      refundTotalTaxAmount: Number(refundTotalTaxAmount.toFixed(2)),
      refundItemsData: refundItemsData.map((item) => ({
        ...item,
        totalAmount: Number(item.totalAmount.toFixed(2)),
        taxAmount: Number(item.taxAmount.toFixed(2)),
        insuranceCoveredPerUnit: item.insuranceCoveredPerUnit
          ? Number(item.insuranceCoveredPerUnit.toFixed(2))
          : item.insuranceCoveredPerUnit,
        patientPricePerUnit: item.patientPricePerUnit
          ? Number(item.patientPricePerUnit.toFixed(2))
          : item.patientPricePerUnit,
      })),
    };
  }

  /**
   * Select stock for sale before transaction
   * Note: This function should only be called with physical stock items (isStockItem === true)
   * Service items should be filtered out before calling this function
   */
  private static async selectStockForSale(
    itemsToProcess: Array<{
      itemId: string;
      quantity: number;
      sellPrice: number;
    }>,
    companyId: string,
    shouldCheckStock: boolean,
  ) {
    const stockUpdates: Array<{ stockIds: string[]; itemName: string }> = [];

    if (!shouldCheckStock) {
      return stockUpdates;
    }

    // This function should only receive physical stock items
    // Service items (isStockItem !== true) should be filtered out by the caller
    for (const itemData of itemsToProcess) {
      const selected = await selectAvailableStock(prisma, {
        itemIds: itemData.itemId,
        companyId,
        take: itemData.quantity,
        strategy: "FIFO",
      });

      if (selected.length < itemData.quantity) {
        const item = await prisma.items.findFirst({
          where: { id: itemData.itemId },
          select: { itemFullName: true, isStockItem: true },
        });

        // Double-check: if this is actually a service item, skip stock validation
        if (item?.isStockItem !== true) {
          continue;
        }

        throw new AppError(
          `Insufficient stock for item ${item?.itemFullName || itemData.itemId}. Available: ${selected.length}, Requested: ${itemData.quantity}`,
          400,
        );
      }

      if (selected.length === 0) {
        const item = await prisma.items.findFirst({
          where: { id: itemData.itemId },
          select: { itemFullName: true, isStockItem: true },
        });

        // Double-check: if this is actually a service item, skip stock validation
        if (item?.isStockItem !== true) {
          continue;
        }

        throw new AppError(
          `No available stock for item ${item?.itemFullName || itemData.itemId}`,
          400,
        );
      }

      const item = await prisma.items.findFirst({
        where: { id: itemData.itemId },
        select: { itemFullName: true },
      });

      stockUpdates.push({
        stockIds: selected.map((s) => s.id),
        itemName: item?.itemFullName || "",
      });
    }

    return stockUpdates;
  }

  public static async createSell(data: CreateSellDto, req: Request) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }
    const branchId = await requireBranchId(companyId, req.user?.branchId);

    // Support both new format (items array) and legacy format (single item)
    const rawItemsToProcess =
      data.items && data.items.length > 0
        ? data.items
        : data.itemId && data.quantity && data.sellPrice
          ? [
              {
                itemId: data.itemId,
                quantity: data.quantity,
                sellPrice: data.sellPrice,
              },
            ]
          : [];

    if (rawItemsToProcess.length === 0) {
      throw new AppError("No items provided for sale", 400);
    }

    // Combine duplicate items by summing quantities
    const itemsToProcess = rawItemsToProcess.reduce(
      (acc, item) => {
        const existingItem = acc.find(
          (i) =>
            i.itemId === item.itemId &&
            (i.discount ?? 0) === (item.discount ?? 0),
        );
        if (existingItem) {
          existingItem.quantity += Number(item.quantity);
        } else {
          acc.push({
            ...item,
            quantity: Number(item.quantity),
            discount: Number(item.discount || 0),
          });
        }
        return acc;
      },
      [] as Array<{
        itemId: string;
        quantity: number;
        sellPrice: number;
        discount?: number;
      }>,
    );

    // Validate payment method if payment mode is FULL_PAID or HALF_PAID
    if (
      (data.paymentMode === "FULL_PAID" || data.paymentMode === "HALF_PAID") &&
      !data.paymentMethod
    ) {
      throw new AppError(
        "Payment method is required for FULL_PAID or HALF_PAID modes",
        400,
      );
    }

    // ==============================================
    // PRE-TRANSACTION: Load company for industry check
    // ==============================================
    const company = await prisma.company.findFirst({
      where: { id: companyId },
    });
    const companyIndustry = company?.industry ?? undefined;
    const isPharmacy = (companyIndustry ?? "").toUpperCase() === "PHARMACY";

    // Fetch user for EBM
    const freshUser = await prisma.user.findUnique({
      where: { id: req.user?.id },
    });

    if (!freshUser) {
      throw new AppError("User not found", 404);
    }

    const isRefund = data.type === "REFUND" || !!data.parentSellId;

    // ==============================================
    // REFUND FLOW
    // ==============================================
    if (isRefund) {
      if (!data.parentSellId) {
        throw new AppError("Parent Sell ID is required for refunds", 400);
      }

      const parentSell = await prisma.sell.findUnique({
        where: { id: data.parentSellId },
        include: { sellItems: true },
      });

      if (!parentSell) {
        throw new AppError("Parent sale not found", 404);
      }

      // Verify refund items match parent sale items
      for (const rItem of itemsToProcess) {
        const parentItem = parentSell.sellItems.find(
          (pi) => pi.itemId === rItem.itemId,
        );
        if (!parentItem) {
          throw new AppError(
            `Item ${rItem.itemId} was not part of the original sale`,
            400,
          );
        }
      }

      // Block refund if sale predates the invoice declaration cutoff
      const companyTools = await prisma.companyTools.findFirst({
        where: { companyId },
      });
      if (
        companyTools?.invoiceDeclarationDate &&
        parentSell.createdAt < companyTools.invoiceDeclarationDate
      ) {
        const cutoffKigali = new Date(
          companyTools.invoiceDeclarationDate.getTime() + 2 * 60 * 60 * 1000,
        )
          .toISOString()
          .slice(0, 16)
          .replace("T", " ");
        throw new AppError(
          `Cannot refund this sale: it was created before the invoice declaration date (${cutoffKigali})`,
          400,
        );
      }

      // PRE-TRANSACTION: Calculate insurance info
      const insuranceCardId =
        data.insuranceCardId || parentSell.insuranceCardId;
      const insurancePercentage = Number(
        data.insurancePercentage ?? parentSell.insurancePercentage ?? 0,
      );
      const clientType = data.clientType || parentSell.clientType;

      if (clientType === "INSUREE" && !insuranceCardId) {
        throw new AppError(
          "Insurance Card is mandatory for Insuree Refund (could not inherit from Parent Sale)",
          400,
        );
      }

      const hasInsurance =
        clientType === "INSUREE" &&
        !!insuranceCardId &&
        insurancePercentage >= 0;

      // PRE-TRANSACTION: Get items for calculation
      const items = await prisma.items.findMany({
        where: {
          id: { in: itemsToProcess.map((i) => i.itemId) },
          companyId,
        },
        select: {
          id: true,
          itemFullName: true,
          isTaxable: true,
          taxRate: true,
          taxCode: true,
          productCode: true,
          itemCodeSku: true,
          isStockItem: true,
        },
      });

      // PRE-TRANSACTION: Calculate refund totals
      const { refundTotalAmount, refundTotalTaxAmount, refundItemsData } =
        SellService.calculateRefundTotals(
          itemsToProcess,
          items,
          insurancePercentage,
          hasInsurance,
          parentSell.sellItems,
        );

      // Build snapshot map: itemId → attributes stored at time of original sale.
      // Snapshot wins over live item data so post-sale changes don't break refunds.
      const snapshotMap = new Map<string, Record<string, unknown>>();
      for (const psi of parentSell.sellItems) {
        if (psi.itemSnapshot) {
          try {
            snapshotMap.set(
              psi.itemId,
              JSON.parse(psi.itemSnapshot) as Record<string, unknown>,
            );
          } catch {
            // Malformed snapshot — fall back to live item data for this item
          }
        }
      }

      // PRE-TRANSACTION: Get client for EBM
      const clientId = data.clientId || parentSell.clientId;
      const client = clientId
        ? await prisma.client.findFirst({
            where: { id: clientId },
          })
        : null;

      // PRE-TRANSACTION: Get insurance card if applicable
      const insuranceCard = insuranceCardId
        ? await prisma.insuranceCard.findFirst({
            where: { id: insuranceCardId },
            include: { insurance: true },
          })
        : null;

      // PRE-TRANSACTION: Calculate next sequential invoice number for Refund
      // Filter out legacy large numbers (assuming anything > 100,000,000 is legacy/random)
      const lastSequentialSell = await prisma.sell.findFirst({
        where: {
          companyId,
          invcNo: { lt: 100000000 },
        },
        orderBy: { invcNo: "desc" },
        select: { invcNo: true },
      });

      let nextInvcNo = (lastSequentialSell?.invcNo || 0) + 1;

      // Safety check: ensure strict uniqueness locally
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const existing = await prisma.sell.findFirst({
          where: { companyId, invcNo: nextInvcNo },
          select: { id: true },
        });
        if (!existing) break;
        nextInvcNo++;
      }

      // PRE-TRANSACTION: Build complete refund for EBM
      const refundForEBM = {
        id: randomUUID(), // Generate proper UUID for EBM invcNo generation
        clientId: data.clientId || parentSell.clientId,
        companyId,
        branchId,
        totalAmount: -Math.abs(refundTotalAmount),
        taxAmount: -Math.abs(refundTotalTaxAmount),
        subtotal: -Math.abs(Number(data.subtotal || refundTotalAmount)),
        insuranceCoveredAmount: -Math.abs(
          Number(data.insuranceCoveredAmount || 0),
        ),
        patientPayableAmount: -Math.abs(
          Number(data.patientPayableAmount || refundTotalAmount),
        ),
        insurancePercentage,
        insuranceCardId: insuranceCardId || null,
        type: "REFUND" as const,
        parentSellId: data.parentSellId,
        refundReasonCode: data.refundReasonCode,
        refundReasonNote: data.refundReasonNote,
        notes: data.notes,
        clientType: clientType as any,
        paymentMode: (data.paymentMode || parentSell.paymentMode) as any,
        paymentMethod: data.paymentMethod || parentSell.paymentMethod,
        isTrainingMode: (data.isTrainingMode ??
          parentSell.isTrainingMode ??
          false) as any,
        doctorId: data.doctorId || parentSell.doctorId || null,
        hospital: data.hospital || parentSell.hospital || null,
        itemId:
          itemsToProcess.length === 1 ? itemsToProcess[0].itemId : undefined,
        quantity:
          itemsToProcess.length === 1 ? itemsToProcess[0].quantity : undefined,
        sellPrice:
          itemsToProcess.length === 1 ? itemsToProcess[0].sellPrice : undefined,
        sellItems: refundItemsData.map((ri) => {
          const currentItem = items.find((i) => i.id === ri.itemId);
          const snapshot = snapshotMap.get(ri.itemId);
          return {
            ...ri,
            item: currentItem
              ? { ...currentItem, ...(snapshot ?? {}) }
              : (snapshot ?? undefined),
          };
        }),
        client,
        parentSell,
        insuranceCard,
        company,
        createdAt: new Date(),
        updatedAt: new Date(),
        ebmSynced: false,
        invcNo: nextInvcNo, // Set sequential number
      };

      // PRE-TRANSACTION: Call EBM for refund (with retry for invoice collision)
      // Always increment by +1 (never skip). No max attempts limit.
      // When first 924 error occurs, trigger background gap resolution.
      let ebmResponse;
      let gapResolutionTriggered = false;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        refundForEBM.invcNo = nextInvcNo;

        ebmResponse = await EbmService.saveSaleToEBM(
          refundForEBM as any,
          company!,
          freshUser,
          branchId,
          data.purchaseCode,
        );

        if (ebmResponse.resultCd === "000") {
          break; // Success
        }

        if (ebmResponse.resultMsg === "Mock Success (EBM Offline)") {
          break; // Accept mock
        }

        // 924 means EBM already has this invoice (from a prior timed-out request).
        // The returned receipt data belongs to THAT old sale, not this one.
        // Increment and retry to find the next free slot.
        const isDuplicate =
          ebmResponse.resultCd === "924" ||
          (ebmResponse.resultMsg &&
            (ebmResponse.resultMsg
              .toLowerCase()
              .includes("invoice number already exists") ||
              ebmResponse.resultMsg
                .toLowerCase()
                .includes("duplicate invoice")));

        if (isDuplicate) {
          // Trigger background gap resolution on first duplicate (only once)
          if (!gapResolutionTriggered) {
            gapResolutionTriggered = true;
            console.warn(
              `[Refund] First duplicate invoice detected (#${nextInvcNo}). Starting background gap resolution...`,
            );
            EbmInvoiceGapResolutionService.startBackgroundGapResolution(
              companyId,
              freshUser,
              branchId || undefined,
            ).catch((err) => {
              console.error(`[Refund] Background gap resolution error:`, err);
            });
          }

          // Always increment by +1 (never skip numbers)
          console.warn(
            `Invoice #${nextInvcNo} already in EBM (Refund, code ${ebmResponse.resultCd}). Trying #${nextInvcNo + 1}...`,
          );
          nextInvcNo += 1;
        } else {
          break; // Fatal / unrecognised error — stop retrying
        }
      }

      const refundEbmSuccess =
        ebmResponse?.resultCd === "000" ||
        ebmResponse?.resultMsg === "Mock Success (EBM Offline)";

      if (!ebmResponse || !refundEbmSuccess) {
        throw new AppError(
          `EBM Refund Failed: ${ebmResponse?.resultMsg} (Code: ${ebmResponse?.resultCd})`,
          400,
        );
      }

      const ebmData = ebmResponse.data;

      // TRANSACTION: 2 pure writes — refund sell + sell items. No includes, no reads.
      const refundSellId = await prisma.$transaction(async (tx) => {
        // Create refund record WITH EBM data — no includes (pure write)
        const refundSell = await tx.sell.create({
          data: {
            clientId: data.clientId || parentSell.clientId,
            companyId,
            branchId,
            totalAmount: -Math.abs(refundTotalAmount),
            taxAmount: -Math.abs(refundTotalTaxAmount),
            subtotal: -Math.abs(Number(data.subtotal || refundTotalAmount)),
            insuranceCoveredAmount: -Math.abs(
              Number(data.insuranceCoveredAmount || 0),
            ),
            patientPayableAmount: -Math.abs(
              Number(data.patientPayableAmount || refundTotalAmount),
            ),
            insurancePercentage,
            insuranceCardId: insuranceCardId || null,
            type: "REFUND",
            parentSellId: data.parentSellId,
            refundReasonCode: data.refundReasonCode,
            refundReasonNote: data.refundReasonNote,
            notes: data.notes,
            clientType: clientType as any,
            paymentMode: (data.paymentMode || parentSell.paymentMode) as any,
            paymentMethod: data.paymentMethod || parentSell.paymentMethod,
            isTrainingMode: (data.isTrainingMode ??
              parentSell.isTrainingMode ??
              false) as any,
            doctorId: data.doctorId || parentSell.doctorId || null,
            hospital: data.hospital || parentSell.hospital || null,
            itemId:
              itemsToProcess.length === 1
                ? itemsToProcess[0].itemId
                : undefined,
            quantity:
              itemsToProcess.length === 1
                ? itemsToProcess[0].quantity
                : undefined,
            sellPrice:
              itemsToProcess.length === 1
                ? itemsToProcess[0].sellPrice
                : undefined,
            ebmSynced: true,
            rcptNo: ebmData.rcptNo,
            intrlData: ebmData.intrlData,
            rcptSign: ebmData.rcptSign,
            totRcptNo: ebmData.totRcptNo,
            vsdcRcptPbctDate: ebmData.vsdcRcptPbctDate,
            sdcId: ebmData.sdcId,
            mrcNo: freshUser.mrcNo,
            invcNo: nextInvcNo,
          } as any,
        });

        // Batch-insert refund sell items (one query instead of N round-trips)
        if (refundItemsData.length > 0) {
          await tx.sellItem.createMany({
            data: refundItemsData.map((ri) => {
              const snap = snapshotMap.get(ri.itemId);
              return {
                sellId: refundSell.id,
                itemId: ri.itemId,
                quantity: ri.quantity,
                sellPrice: ri.sellPrice,
                discount: ri.discount ?? 0,
                totalAmount: -Math.abs(ri.totalAmount),
                taxAmount: -Math.abs(ri.taxAmount),
                branchId,
                insuranceCoveredPerUnit: ri.insuranceCoveredPerUnit,
                patientPricePerUnit: ri.patientPricePerUnit,
                // Carry snapshot forward so receipts show original sale item info
                itemSnapshot: snap ? JSON.stringify(snap) : undefined,
              };
            }),
          });
        }

        return refundSell.id;
      }, SellService.interactiveTransactionOptions); // 2 pure writes — allow extra headroom for larger batches

      // POST-TRANSACTION: Restore stock to inventory outside the transaction.
      // addToStock makes multiple queries + an EBM API call and cannot run inside
      // a short-lived DB transaction. The refund record is already committed above.
      // Skip stock restore for training mode or proforma — parent sale never touched stock.
      const isTrainingRefund = !!(
        data.isTrainingMode ??
        parentSell.isTrainingMode ??
        false
      );
      const isProformaRefund = (parentSell as any).type === "PROFORMA";

      for (const itemData of isTrainingRefund || isProformaRefund
        ? []
        : itemsToProcess) {
        const item = items.find((i) => i.id === itemData.itemId);
        if (!item) continue;

        // Skip stock restoration for service items (they never had stock deducted).
        // Use snapshot so a post-sale change to isStockItem doesn't prevent restoration.
        const wasStockItem =
          (snapshotMap.get(itemData.itemId)?.isStockItem as
            | boolean
            | undefined) ?? item.isStockItem;
        if (wasStockItem !== true) {
          continue;
        }

        const refundReceipt = await prisma.stockReceipts.create({
          data: {
            itemId: item.id,
            quantityReceived: Math.abs(itemData.quantity),
            dateReceived: new Date(),
            unitCost: 0,
            totalCost: 0,
            companyId,
            branchId,
            receiptType: "REFUND",
            remarksNotes: `Refund from Sale ${parentSell.rcptNo || parentSell.id}`,
            ebmSynced: true,
          },
        });

        await StockService.addToStock(
          refundReceipt.id,
          undefined,
          req.user?.id,
        );
      }

      // POST-TRANSACTION: fetch full record for response
      const completeRefund = await prisma.sell.findUnique({
        where: { id: refundSellId },
        include: {
          client: {
            select: {
              id: true,
              name: true,
              email: true,
              tin: true,
              phone: true,
            },
          },
          sellItems: {
            include: {
              item: {
                select: {
                  id: true,
                  itemCodeSku: true,
                  itemFullName: true,
                  taxCode: true,
                  taxRate: true,
                  productCode: true,
                  isStockItem: true,
                },
              },
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
          parentSell: {
            include: {
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
              client: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  tin: true,
                },
              },
              sellItems: {
                include: {
                  item: {
                    select: {
                      id: true,
                      itemCodeSku: true,
                      itemFullName: true,
                      productCode: true,
                      taxCode: true,
                      category: {
                        select: {
                          id: true,
                          categoryName: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!completeRefund) {
        throw new AppError("Refund created but could not be fetched", 500);
      }

      // POST-TRANSACTION: decrement soldQty for each returned item
      if (!isTrainingRefund && !isProformaRefund) {
        for (const ri of refundItemsData) {
          await prisma.items.update({
            where: { id: ri.itemId },
            data: { soldQty: { decrement: Math.abs(ri.quantity) } },
          });
        }
      }

      await prisma.transaction.create({
        data: {
          clientId: data.clientId || parentSell.clientId,
          companyId,
          branchId: branchId ?? null,
          // Negative amount — money returned to client
          amount: -Math.abs(
            isPharmacy
              ? Number(completeRefund.patientPayableAmount)
              : Number(completeRefund.totalAmount),
          ),
          date: new Date(),
          sellId: refundSellId,
          type: "REFUND",
          paymentMode:
            ((data.paymentMode || parentSell.paymentMode) as string) ?? null,
          paymentMethod: (data.paymentMethod ||
            parentSell.paymentMethod ||
            null) as string | null,
          invcNo: completeRefund.invcNo ?? null,
          notes: data.notes ?? null,
        } as any,
      });

      // POST-TRANSACTION: EBM Stock Telemetry (03 - Return Incoming)
      if (ebmData?.rcptNo && !isTrainingRefund && !isProformaRefund) {
        try {
          // Only physical stock items participate in EBM IO stock / stock master
          const refundStockItems = completeRefund.sellItems.filter(
            (si: any) => si.item?.isStockItem === true,
          );
          if (refundStockItems.length > 0) {
            // Send stock movement telemetry
            await EbmService.saveStockItems(
              "03", // 03 = Return Incoming
              refundStockItems,
              company!,
              freshUser,
              branchId,
              `Refund Restock (Invc: ${completeRefund.invcNo})`,
            );

            // Update stock master quantities for each item (use EBM-initialized branch)
            const bhfId = await EbmService.resolveCompanyBhfId(companyId);

            for (const sellItem of refundStockItems) {
              try {
                const currentStock = await prisma.stock.count({
                  where: {
                    stockReceipt: {
                      itemId: sellItem.itemId,
                    },
                    companyId,
                    ...(branchId ? { branchId } : {}),
                    status: "AVAILABLE",
                  },
                });

                console.log(
                  `[REFUND] Updating stock master for item ${sellItem.item?.productCode}: ${currentStock} units`,
                );

                const masterResponse = await EbmService.saveStockMasterToEbm(
                  company!.TIN,
                  bhfId,
                  sellItem.item?.productCode || "",
                  currentStock,
                  {
                    firstName: freshUser.firstName,
                    lastName: freshUser.lastName,
                    id: freshUser.id,
                    email: freshUser.email,
                  },
                );

                console.log(
                  `[REFUND] Stock master response for ${sellItem.item?.productCode}:`,
                  masterResponse.resultCd,
                  masterResponse.resultMsg,
                );
              } catch (masterError: any) {
                console.error(
                  `[REFUND] Failed to update stock master for item ${sellItem.itemId}:`,
                  masterError.message || masterError,
                );
              }
            }
          }
        } catch (error) {
          console.error(
            "Non-fatal: Failed to send refund restock telemetry to EBM",
            error,
          );
        }
      }

      const receiptInfo = {
        ...getReceiptMessages(company),
        qrCodeData: generateQrCodeData(completeRefund),
      };

      return {
        message: "Refund processed successfully",
        data: { ...completeRefund, receiptInfo },
      };
    }

    // ==============================================
    // NORMAL SALE / PROFORMA FLOW
    // ==============================================

    // PRE-TRANSACTION: Validate all data
    const validated = await SellService.validateSellData(
      data,
      itemsToProcess,
      companyId,
    );

    // PRE-TRANSACTION: Calculate totals
    const {
      totalAmount,
      totalTaxAmount,
      subtotal,
      insuranceCoveredAmount,
      patientPayableAmount,
      insurancePercentageSnapshot,
      sellItems,
    } = SellService.calculateSellTotals(
      itemsToProcess,
      validated.items,
      validated.insuranceCard,
      isPharmacy,
      data.clientType,
    );

    // PRE-TRANSACTION: Select stock (if needed)
    // Training mode and PROFORMA sales never consume real stock.
    const shouldCheckStock = !data.isTrainingMode && data.type !== "PROFORMA";

    // Service items (isStockItem === false) have no physical inventory —
    // they must be sold freely regardless of stock quantity.
    // Fetch the stock-item flag for all items in this sale so we can split them.
    const itemStockFlags = await prisma.items.findMany({
      where: { id: { in: itemsToProcess.map((i) => i.itemId) }, companyId },
      select: { id: true, isStockItem: true },
    });
    const isServiceItem = (itemId: string): boolean =>
      itemStockFlags.find((f) => f.id === itemId)?.isStockItem === false;

    // Only physical stock items participate in stock selection / marking.
    const physicalStockItems = itemsToProcess.filter(
      (i) => !isServiceItem(i.itemId),
    );

    const stockUpdates = await SellService.selectStockForSale(
      physicalStockItems,
      companyId,
      shouldCheckStock,
    );

    // PRE-TRANSACTION: Calculate next sequential invoice number
    // Filter out legacy large numbers (assuming anything > 100,000,000 is legacy/random)
    const lastSequentialSell = await prisma.sell.findFirst({
      where: {
        companyId,
        invcNo: { lt: 100000000 },
      },
      orderBy: { invcNo: "desc" },
      select: { invcNo: true },
    });

    let nextInvcNo = (lastSequentialSell?.invcNo || 0) + 1;

    // Safety check: ensure strict uniqueness just in case a random small legacy number exists
    // This loop will skip any existing numbers to find the next truly available slot
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await prisma.sell.findFirst({
        where: { companyId, invcNo: nextInvcNo },
        select: { id: true },
      });
      if (!existing) break;
      nextInvcNo++;
    }

    // PRE-TRANSACTION: Build complete sale for EBM
    const saleForEBM = {
      id: randomUUID(), // Generate proper UUID for EBM invcNo generation but won't be used for invcNo
      clientId: data.clientId,
      companyId,
      branchId,
      totalAmount,
      taxAmount: totalTaxAmount,
      insuranceCardId: isPharmacy ? data.insuranceCardId || null : undefined,
      subtotal: isPharmacy ? subtotal : undefined,
      insuranceCoveredAmount: isPharmacy ? insuranceCoveredAmount : undefined,
      patientPayableAmount: isPharmacy ? patientPayableAmount : undefined,
      insurancePercentage: isPharmacy ? insurancePercentageSnapshot : undefined,
      notes: data.notes,
      itemId:
        itemsToProcess.length === 1 ? itemsToProcess[0].itemId : undefined,
      quantity:
        itemsToProcess.length === 1 ? itemsToProcess[0].quantity : undefined,
      sellPrice:
        itemsToProcess.length === 1 ? itemsToProcess[0].sellPrice : undefined,
      clientType: data.clientType,
      paymentMode: data.paymentMode as any,
      paymentMethod: data.paymentMethod,
      doctorId: data.doctorId || null,
      hospital: data.hospital || null,
      isTrainingMode: (data.isTrainingMode || false) as any,
      type: data.type || "SALE",
      client: validated.client,
      sellItems: sellItems.map((si) => ({
        ...si,
        item: validated.items.find((i) => i.id === si.itemId),
      })),
      company,
      createdAt: new Date(),
      updatedAt: new Date(),
      ebmSynced: false,
      invcNo: nextInvcNo, // Explicitly set the sequential invoice number
    };

    // PRE-TRANSACTION: Call EBM for sale (with retry for invoice collision)
    // Always increment by +1 (never skip). No max attempts limit.
    // When first 924 error occurs, trigger background gap resolution.
    let ebmResponse;
    let gapResolutionTriggered = false;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      saleForEBM.invcNo = nextInvcNo;

      ebmResponse = await EbmService.saveSaleToEBM(
        saleForEBM as any,
        company!,
        freshUser,
        branchId,
        data.purchaseCode,
      );

      if (ebmResponse.resultCd === "000") {
        break; // Success
      }

      if (ebmResponse.resultMsg === "Mock Success (EBM Offline)") {
        break; // Accept mock
      }

      // 924 means EBM already has this invoice (from a prior timed-out request).
      // The returned receipt data belongs to THAT old sale, NOT this new one.
      // Increment and retry to find the next free slot in EBM.
      const isDuplicate =
        ebmResponse.resultCd === "924" ||
        (ebmResponse.resultMsg &&
          (ebmResponse.resultMsg
            .toLowerCase()
            .includes("invoice number already exists") ||
            ebmResponse.resultMsg.toLowerCase().includes("duplicate invoice")));

      if (isDuplicate) {
        // Trigger background gap resolution on first duplicate (only once)
        if (!gapResolutionTriggered) {
          gapResolutionTriggered = true;
          console.warn(
            `[Sale] First duplicate invoice detected (#${nextInvcNo}). Starting background gap resolution...`,
          );
          EbmInvoiceGapResolutionService.startBackgroundGapResolution(
            companyId,
            freshUser,
            branchId || undefined,
          ).catch((err) => {
            console.error(`[Sale] Background gap resolution error:`, err);
          });
        }

        // Always increment by +1 (never skip numbers)
        console.warn(
          `Invoice #${nextInvcNo} already in EBM (code ${ebmResponse.resultCd}). Trying #${nextInvcNo + 1}...`,
        );
        nextInvcNo += 1;
      } else {
        break; // Fatal / unrecognised error â€” stop retrying
      }
    }

    const ebmSuccess =
      ebmResponse?.resultCd === "000" ||
      ebmResponse?.resultMsg === "Mock Success (EBM Offline)";

    if (!ebmResponse || !ebmSuccess) {
      throw new AppError(
        `EBM Sales Registration Failed: ${ebmResponse?.resultMsg || "Unknown Error"} (Code: ${ebmResponse?.resultCd})`,
        400,
      );
    }

    const ebmData = ebmResponse.data;

    // TRANSACTION: 3 pure writes only - sell, sell items, stock update.
    // No includes, no reads. Completes in < 300 ms even on remote DB.

    const sellId = await prisma.$transaction(async (tx) => {
      const sell = await tx.sell.create({
        data: {
          clientId: data.clientId,
          companyId,
          branchId,
          totalAmount,
          taxAmount: totalTaxAmount,
          insuranceCardId: isPharmacy
            ? data.insuranceCardId || null
            : undefined,
          subtotal: isPharmacy ? subtotal : undefined,
          insuranceCoveredAmount: isPharmacy
            ? insuranceCoveredAmount
            : undefined,
          patientPayableAmount: isPharmacy ? patientPayableAmount : undefined,
          insurancePercentage: isPharmacy
            ? insurancePercentageSnapshot
            : undefined,
          notes: data.notes,
          itemId:
            itemsToProcess.length === 1 ? itemsToProcess[0].itemId : undefined,
          quantity:
            itemsToProcess.length === 1
              ? itemsToProcess[0].quantity
              : undefined,
          sellPrice:
            itemsToProcess.length === 1
              ? itemsToProcess[0].sellPrice
              : undefined,
          clientType: data.clientType,
          paymentMode: data.paymentMode as any,
          paymentMethod: data.paymentMethod,
          doctorId: data.doctorId || null,
          hospital: data.hospital || null,
          isTrainingMode: (data.isTrainingMode || false) as any,
          type: data.type || "SALE",
          ebmSynced: true,
          rcptNo: ebmData.rcptNo,
          intrlData: ebmData.intrlData,
          rcptSign: ebmData.rcptSign,
          totRcptNo: ebmData.totRcptNo,
          vsdcRcptPbctDate: ebmData.vsdcRcptPbctDate,
          sdcId: ebmData.sdcId,
          mrcNo: freshUser.mrcNo,
          invcNo: nextInvcNo,
        } as any,
      });

      if (sellItems.length > 0) {
        await tx.sellItem.createMany({
          data: sellItems.map((sellItemData) => {
            const itemMeta = validated.items.find(
              (i) => i.id === sellItemData.itemId,
            );
            return {
              sellId: sell.id,
              itemId: sellItemData.itemId,
              quantity: sellItemData.quantity,
              sellPrice: sellItemData.sellPrice,
              totalAmount: sellItemData.totalAmount,
              taxAmount: sellItemData.taxAmount,
              discount: sellItemData.discount,
              branchId,
              itemSnapshot: itemMeta
                ? JSON.stringify({
                    taxCode: itemMeta.taxCode,
                    taxRate: Number(itemMeta.taxRate),
                    productCode: itemMeta.productCode,
                    itemFullName: itemMeta.itemFullName,
                    isStockItem: itemMeta.isStockItem,
                    isTaxable: itemMeta.isTaxable,
                    itemCodeSku: itemMeta.itemCodeSku,
                  })
                : undefined,
              insuranceCoveredPerUnit: isPharmacy
                ? sellItemData.insuranceCoveredPerUnit
                : undefined,
              patientPricePerUnit: isPharmacy
                ? sellItemData.patientPricePerUnit
                : undefined,
            };
          }),
        });
      }

      const allSoldStockIds = stockUpdates.flatMap((u) => u.stockIds);
      if (allSoldStockIds.length > 0) {
        await tx.stock.updateMany({
          where: { id: { in: allSoldStockIds } },
          data: { status: "SOLD", sellId: sell.id },
        });
      }

      return sell.id;
    }, SellService.interactiveTransactionOptions); // 3 writes, no reads — allow extra headroom for larger batches

    // POST-TRANSACTION: fetch full record for response
    const completeSell = await prisma.sell.findUnique({
      where: { id: sellId },
      include: {
        client: {
          select: { id: true, name: true, email: true, tin: true, phone: true },
        },
        sellItems: {
          include: {
            item: {
              select: {
                id: true,
                itemCodeSku: true,
                itemFullName: true,
                taxCode: true,
                taxRate: true,
                productCode: true,
                isStockItem: true,
              },
            },
          },
        },
        item: {
          select: {
            id: true,
            itemCodeSku: true,
            itemFullName: true,
            taxCode: true,
            taxRate: true,
            productCode: true,
            isStockItem: true,
          },
        },
      },
    });

    // Prepare receipt info
    if (!completeSell) {
      throw new AppError("Sale created but could not be fetched", 500);
    }

    // POST-TRANSACTION: financial record — enriched with full context (not atomic-critical)
    // Skip for PROFORMA — no money has moved yet (it's just a quote)
    if ((data.type as string) !== "PROFORMA") {
      await prisma.transaction.create({
        data: {
          clientId: data.clientId,
          companyId,
          branchId: branchId ?? null,
          amount: isPharmacy ? patientPayableAmount : totalAmount,
          date: new Date(),
          sellId,
          type: (data.type as string) || "SALE",
          paymentMode: (data.paymentMode as string) ?? null,
          paymentMethod: (data.paymentMethod as string) ?? null,
          invcNo: completeSell.invcNo ?? null,
          notes: data.notes ?? null,
        } as any,
      });
    }

    // POST-TRANSACTION: increment soldQty for each sold item
    if ((data.type as string) !== "PROFORMA" && !data.isTrainingMode) {
      for (const si of sellItems) {
        await prisma.items.update({
          where: { id: si.itemId },
          data: { soldQty: { increment: si.quantity } },
        });
      }
    }

    // POST-TRANSACTION: EBM Stock Telemetry (11 - Sale Outgoing)
    // Only dispatch an official RRA stock reduction if a true EBM sync succeeded (and is not a Proforma/Training sale)
    if (
      ebmData?.rcptNo &&
      (data.type as string) !== "PROFORMA" &&
      !(data as any).isTrainingMode
    ) {
      try {
        // Only physical stock items participate in EBM IO stock / stock master
        const saleStockItems = completeSell.sellItems.filter(
          (si: any) => si.item?.isStockItem === true,
        );
        if (saleStockItems.length > 0) {
          // Send stock movement telemetry
          await EbmService.saveStockItems(
            "11", // 11 = Sale Outgoing
            saleStockItems,
            company!,
            freshUser,
            branchId,
            `Sale Dispatch (Invc: ${completeSell.invcNo})`,
          );

          // Update stock master quantities for each item (use EBM-initialized branch)
          const bhfId = await EbmService.resolveCompanyBhfId(companyId);

          for (const sellItem of saleStockItems) {
            try {
              const currentStock = await prisma.stock.count({
                where: {
                  stockReceipt: {
                    itemId: sellItem.itemId,
                  },
                  companyId,
                  ...(branchId ? { branchId } : {}),
                  status: "AVAILABLE",
                },
              });

              console.log(
                `[SALE] Updating stock master for item ${sellItem.item?.productCode}: ${currentStock} units`,
              );

              const masterResponse = await EbmService.saveStockMasterToEbm(
                company!.TIN,
                bhfId,
                sellItem.item?.productCode || "",
                currentStock,
                {
                  firstName: freshUser.firstName,
                  lastName: freshUser.lastName,
                  id: freshUser.id,
                  email: freshUser.email,
                },
              );

              console.log(
                `[SALE] Stock master response for ${sellItem.item?.productCode}:`,
                masterResponse.resultCd,
                masterResponse.resultMsg,
              );
            } catch (masterError: any) {
              console.error(
                `[SALE] Failed to update stock master for item ${sellItem.itemId}:`,
                masterError.message || masterError,
              );
            }
          }
        }
      } catch (error) {
        console.error(
          "Non-fatal: Failed to send sale dispatch telemetry to EBM",
          error,
        );
      }
    }

    const receiptInfo = {
      ...getReceiptMessages(company),
      qrCodeData: generateQrCodeData(completeSell),
    };

    return {
      message: "Sale created successfully",
      data: { ...completeSell, receiptInfo },
    };
  }

  public static async updateSell(
    id: string,
    data: UpdateSellDto,
    req: Request,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    return await prisma.$transaction(async (tx) => {
      const branchId = req.user?.branchId;
      const existingSell = await tx.sell.findFirst({
        where: {
          id,
          companyId,
          ...(branchId ? { branchId } : {}),
        },
        include: {
          stocks: true,
          sellItems: true,
        },
      });

      if (!existingSell) {
        throw new AppError("Sale record not found", 404);
      }

      // Validate payment method if payment mode is FULL_PAID or HALF_PAID
      const currentPaymentMode = data.paymentMode ?? existingSell.paymentMode;
      const currentPaymentMethod =
        data.paymentMethod ?? existingSell.paymentMethod;

      if (
        (currentPaymentMode === "FULL_PAID" ||
          currentPaymentMode === "HALF_PAID") &&
        !currentPaymentMethod
      ) {
        throw new AppError(
          "Payment method is required for FULL_PAID or HALF_PAID modes",
          400,
        );
      }

      // Validate Client (Required for ALL industries)
      if (data.clientId) {
        const client = await tx.client.findFirst({
          where: { id: data.clientId, companyId },
        });
        if (!client) {
          throw new AppError(
            "Client not found or doesn't belong to your company",
            404,
          );
        }
      }

      // Support both new format (items array) and legacy format (single item)
      const itemsToProcess =
        data.items && data.items.length > 0
          ? data.items
          : data.itemId && data.quantity && data.sellPrice
            ? [
                {
                  itemId: data.itemId,
                  quantity: data.quantity,
                  sellPrice: data.sellPrice,
                },
              ]
            : null;

      // If items are being updated, handle the update
      if (itemsToProcess) {
        // Release all current stock
        await tx.stock.updateMany({
          where: { sellId: id },
          data: {
            status: "AVAILABLE",
            sellId: null,
          },
        });

        // Delete existing sell items
        await tx.sellItem.deleteMany({
          where: { sellId: id },
        });

        let totalAmount = 0;
        let totalTaxAmount = 0;
        const sellItems: Array<{
          itemId: string;
          quantity: number;
          sellPrice: number;
          totalAmount: number;
          taxAmount: number;
          insuranceCoveredPerUnit?: number;
          patientPricePerUnit?: number;
        }> = [];
        const stockUpdates = [];

        // Process each item
        for (const itemData of itemsToProcess) {
          const item = await tx.items.findFirst({
            where: { id: itemData.itemId, companyId },
          });
          if (!item) {
            throw new AppError(
              `Item not found or doesn't belong to your company: ${itemData.itemId}`,
              404,
            );
          }

          const selected = await selectAvailableStock(tx, {
            itemIds: itemData.itemId,
            companyId,
            branchId: existingSell.branchId,
            take: itemData.quantity,
            strategy: "FIFO",
          });

          if (selected.length < itemData.quantity) {
            throw new AppError(
              `Insufficient stock for item ${item.itemFullName}. Available: ${selected.length}, Requested: ${itemData.quantity}`,
              400,
            );
          }

          if (selected.length === 0) {
            throw new AppError(
              `No available stock for item ${item.itemFullName}`,
              400,
            );
          }

          const stockIds = selected.map((s) => s.id);

          const adjustedSellPrice = Number(itemData.sellPrice);
          const itemNetAmount = Number(itemData.quantity) * adjustedSellPrice;
          const itemTaxAmount = item.isTaxable
            ? itemNetAmount * (Number(item.taxRate) / 100)
            : 0;
          const itemTotalAmount = itemNetAmount + itemTaxAmount;

          totalAmount += itemTotalAmount;
          totalTaxAmount += itemTaxAmount;

          sellItems.push({
            itemId: itemData.itemId,
            quantity: itemData.quantity,
            sellPrice: adjustedSellPrice,
            totalAmount: itemTotalAmount,
            taxAmount: itemTaxAmount,
          });

          stockUpdates.push({
            stockIds,
            itemName: item.itemFullName,
          });
        }

        // Compute insurance if applicable
        const company = await tx.company.findFirst({
          where: { id: companyId },
        });
        const companyIndustry = company?.industry ?? undefined;
        const isPharmacy = (companyIndustry ?? "").toUpperCase() === "PHARMACY";

        const subtotal = sellItems.reduce(
          (acc, s) => acc + Number(s.quantity) * Number(s.sellPrice),
          0,
        );
        let insuranceCoveredAmount = 0;
        let patientPayableAmount = subtotal;
        let insurancePercentageSnapshot: number | undefined;

        if (
          isPharmacy &&
          data.insuranceCardId &&
          (data.clientId || existingSell.clientId)
        ) {
          const clientIdToUse =
            data.clientId ?? existingSell.clientId ?? undefined;
          if (clientIdToUse) {
            const insuranceCard = await tx.insuranceCard.findFirst({
              where: {
                id: data.insuranceCardId,
                clientId: clientIdToUse,
                companyId,
              },
              include: { insurance: true },
            });
            if (!insuranceCard) {
              throw new AppError(
                "Insurance card not found or not linked to client/company",
                400,
              );
            }
            if (insuranceCard) {
              const clientPercentage = Number(insuranceCard.percentage ?? 0);
              insurancePercentageSnapshot = 100 - clientPercentage;
              const percentageFactor = clientPercentage / 100;
              for (const s of sellItems) {
                const patientPerUnit = Number(s.sellPrice) * percentageFactor;
                const coveredPerUnit = Number(s.sellPrice) - patientPerUnit;
                s.insuranceCoveredPerUnit = coveredPerUnit;
                s.patientPricePerUnit = patientPerUnit;
                insuranceCoveredAmount += coveredPerUnit * Number(s.quantity);
              }
              patientPayableAmount = subtotal - insuranceCoveredAmount;
            }
          }
        }

        // Batch-insert new sell items in one query
        if (sellItems.length > 0) {
          await tx.sellItem.createMany({
            data: sellItems.map((sellItemData) => ({
              ...sellItemData,
              sellId: id,
              branchId: existingSell.branchId,
              insuranceCoveredPerUnit: isPharmacy
                ? sellItemData.insuranceCoveredPerUnit
                : undefined,
              patientPricePerUnit: isPharmacy
                ? sellItemData.patientPricePerUnit
                : undefined,
            })),
          });
        }

        // Mark ALL stock sold in one updateMany
        const allSoldStockIds = stockUpdates.flatMap((u) => u.stockIds);
        if (allSoldStockIds.length > 0) {
          await tx.stock.updateMany({
            where: { id: { in: allSoldStockIds } },
            data: { status: "SOLD", sellId: id },
          });
        }

        // Update the sell record
        const updateData = {
          ...data,
          totalAmount,
          taxAmount: totalTaxAmount,
          // insurance fields snapshot (only persist for PHARMACY)

          clientId: isPharmacy
            ? (data.clientId ?? existingSell.clientId)
            : undefined,
          insuranceCardId: isPharmacy
            ? (data.insuranceCardId ?? existingSell.insuranceCardId)
            : undefined,
          subtotal: isPharmacy ? subtotal : undefined,
          insuranceCoveredAmount: isPharmacy
            ? insuranceCoveredAmount
            : undefined,
          patientPayableAmount: isPharmacy ? patientPayableAmount : undefined,
          insurancePercentage: isPharmacy
            ? insurancePercentageSnapshot
            : undefined,
          // Legacy fields for backward compatibility
          itemId:
            itemsToProcess.length === 1 ? itemsToProcess[0].itemId : undefined,
          quantity:
            itemsToProcess.length === 1
              ? itemsToProcess[0].quantity
              : undefined,
          sellPrice:
            itemsToProcess.length === 1
              ? itemsToProcess[0].sellPrice
              : undefined,

          clientType: data.clientType ?? existingSell.clientType,
          paymentMode: data.paymentMode ?? existingSell.paymentMode,
          paymentMethod: data.paymentMethod ?? existingSell.paymentMethod,
          doctorId: data.doctorId ?? existingSell.doctorId,
          hospital: data.hospital ?? existingSell.hospital,
          isTrainingMode: (data.isTrainingMode ??
            (existingSell as any).isTrainingMode) as any,
        };

        const sell = await tx.sell.update({
          where: {
            id,
            companyId,
            ...(branchId ? { branchId } : {}),
          },
          data: updateData,
          include: {
            client: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            sellItems: {
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
            // Legacy item for backward compatibility
            item: {
              select: {
                id: true,
                itemCodeSku: true,
                itemFullName: true,
              },
            },
          },
        });

        return { message: "Sale updated successfully", data: sell };
      } else {
        // Handle legacy single item update
        const oldItemId = existingSell.itemId;
        const oldQuantity = Number(existingSell.quantity);
        const newItemId = data.itemId ?? oldItemId;
        const newQuantity = Number(data.quantity ?? oldQuantity);

        if (newItemId) {
          const itemCheck = await tx.items.findFirst({
            where: { id: newItemId, companyId },
          });
          if (!itemCheck) {
            throw new AppError(
              "Item not found or doesn't belong to your company",
              404,
            );
          }
        }

        if (newItemId !== oldItemId || newQuantity !== oldQuantity) {
          await tx.stock.updateMany({
            where: { sellId: id },
            data: {
              status: "AVAILABLE",
              sellId: null,
            },
          });

          if (newQuantity > 0 && newItemId) {
            const selected = await selectAvailableStock(tx, {
              itemIds: newItemId,
              companyId,
              branchId: existingSell.branchId,
              take: newQuantity,
              strategy: "FIFO",
            });

            if (selected.length < newQuantity) {
              throw new AppError(
                `Insufficient stock. Available: ${selected.length}, Requested: ${newQuantity}`,
                400,
              );
            }

            await markStockSold(tx, {
              stockIds: selected.map((s) => s.id),
              sellId: id,
            });
          }
        }

        const updateData = { ...data };
        if (data.quantity !== undefined || data.sellPrice !== undefined) {
          const quantity = Number(data.quantity ?? oldQuantity);
          const sellPrice = Number(data.sellPrice ?? existingSell.sellPrice);
          updateData.totalAmount = quantity * sellPrice;
        }

        const sell = await tx.sell.update({
          where: {
            id,
            companyId,
            ...(branchId ? { branchId } : {}),
          },
          data: updateData,
          include: {
            client: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            sellItems: {
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
            // Legacy item for backward compatibility
            item: {
              select: {
                id: true,
                itemCodeSku: true,
                itemFullName: true,
              },
            },
          },
        });

        return { message: "Sale updated successfully", data: sell };
      }
    }, SellService.interactiveTransactionOptions);
  }

  public static async getSalesReport(
    req: Request,
    startDate?: string,
    endDate?: string,
    type?: string,
  ): Promise<void> {
    if (!startDate || !endDate)
      throw new AppError("startDate and endDate are required", 400);
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, TIN: true },
    });

    const [sy, sm, sd] = startDate.split("-").map(Number);
    const [ey, em, ed] = endDate.split("-").map(Number);
    const start = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
    const end = new Date(ey, em - 1, ed, 23, 59, 59, 999);

    const sellType = (type || "SALE") as any;

    const sells = await prisma.sell.findMany({
      where: {
        companyId,
        ...(branchId ? { branchId } : {}),
        type: sellType,
        isTrainingMode: false,
        createdAt: { gte: start, lte: end },
      },
      orderBy: { createdAt: "asc" },
      include: {
        client: { select: { name: true, tin: true } },
        sellItems: {
          select: { quantity: true, item: { select: { itemFullName: true } } },
        },
      },
    });

    const EBM_PAYMENT_LABELS: Record<string, string> = {
      CASH: "CASH",
      BANK_CHECK: "BANK CHECK",
      CARD: "DEBIT & CREDIT CARD",
      MOBILE_PAYMENT: "MOBILE MONEY",
      BANK_TRANSFER: "OTHER",
    };

    const receiptTypeLabel =
      sellType === "REFUND"
        ? "Refund"
        : sellType === "PROFORMA"
          ? "Proforma"
          : "Sale";

    const rows = sells.map((sell, index) => {
      const items =
        sell.sellItems.length > 0
          ? sell.sellItems
              .map((si) => `${si.item?.itemFullName ?? "—"} x${si.quantity}`)
              .join("\n")
          : "—";

      let paymentLabel: string;
      if ((sell.paymentMode as string) === "CREDIT") {
        paymentLabel = "CREDIT";
      } else {
        paymentLabel = sell.paymentMethod
          ? (EBM_PAYMENT_LABELS[sell.paymentMethod] ??
            sell.paymentMethod.replace(/_/g, " "))
          : ((sell.paymentMode as string)?.replace(/_/g, " ") ?? "—");
      }

      return {
        no: index + 1,
        buyerTin: sell.client?.tin ?? "—",
        buyerName: sell.client?.name ?? "—",
        receiptNumber:
          sell.rcptNo != null
            ? String(sell.rcptNo)
            : sell.invcNo != null
              ? String(sell.invcNo)
              : "—",
        invoiceDate: new Date(sell.createdAt).toISOString().slice(0, 10),
        totalAmount: Number(sell.totalAmount ?? 0),
        items,
        vat: Number(sell.taxAmount ?? 0),
        receiptType: receiptTypeLabel,
        paymentMethod: paymentLabel,
      };
    });

    const buf = await renderSalesReport({
      rows,
      company: {
        name: company?.name ?? "HealthLinker",
        tin: company?.TIN ?? "",
      },
      startDate,
      endDate,
      generatedAt: new Date().toISOString(),
    });
    const res = (req as any).res;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="sales_report_${startDate}_to_${endDate}.pdf"`,
    );
    res.send(buf);
  }

  public static async deleteSell(id: string, req: Request) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    return await prisma.$transaction(async (tx) => {
      const branchId = req.user?.branchId;
      const existingSell = await tx.sell.findFirst({
        where: {
          id,
          companyId,
          ...(branchId ? { branchId } : {}),
        },
        include: {
          sellItems: true,
        },
      });

      if (!existingSell) {
        throw new AppError("Sale record not found", 404);
      }

      // Release all stock back to available
      await tx.stock.updateMany({
        where: { sellId: id },
        data: {
          status: "AVAILABLE",
          sellId: null,
        },
      });

      // Delete sell items (cascade will handle this, but being explicit)
      await tx.sellItem.deleteMany({
        where: { sellId: id },
      });

      // Delete the sell record
      await tx.sell.delete({
        where: {
          id,
          companyId,
          ...(branchId ? { branchId } : {}),
        },
      });

      return { message: "Sale deleted successfully" };
    }, SellService.interactiveTransactionOptions);
  }

  public static async markAsCopy(id: string, req: Request) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const sell = await prisma.sell.findFirst({
      where: { id, companyId, ...(branchId ? { branchId } : {}) },
    });
    if (!sell) throw new AppError("Sell not found", 404);

    await prisma.sell.update({ where: { id }, data: { isCopy: true } });

    return { message: "Marked as copy" };
  }
}
