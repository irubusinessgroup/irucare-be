/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import { CreateSellDto, UpdateSellDto } from "../utils/interfaces/common";
import type { Request } from "express";
import { selectAvailableStock, markStockSold } from "../utils/stock-ops";
import { EbmService } from "./EbmService";
import { StockService } from "./StockService";
import { SellType } from "../utils/interfaces/common";
import {
  getReceiptMessages,
  generateQrCodeData,
} from "../utils/receipt-helpers";
import { randomUUID } from "crypto";

export class SellService {
  public static async getAllSells(
    req: Request,
    searchq?: string,
    limit?: number,
    page?: number,
    type?: SellType,
    isTrainingMode?: boolean,
  ) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const trainingModeFilter =
      isTrainingMode ?? String(req.query.isTrainingMode) === "true";

    // Default to showing only non-refunded sales if no type specified
    const typeFilter: SellType = (type || "SALE") as SellType;

    const queryOptions = searchq
      ? {
          companyId,
          branchId: branchId || null, // STRICT: If no branchId, show company records (null)
          isTrainingMode: trainingModeFilter, // Filter by mode (true/false)
          OR: [
            {
              client: {
                name: { contains: searchq },
              },
            },
            {
              item: {
                itemFullName: { contains: searchq },
              },
            },
            {
              item: {
                itemCodeSku: { contains: searchq },
              },
            },
          ],
          type: typeFilter,
          // Removed refunds filter to support partial refunds
        }
      : {
          companyId,
          branchId: branchId || null,
          isTrainingMode: trainingModeFilter, // Filter by mode (true/false)
          type: typeFilter,
          // Removed refunds filter to support partial refunds
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
      .filter((sell) => sell.sellItems && sell.sellItems.length > 0); // Filter out sales with empty sellItems

    return {
      data: dataWithReceiptInfo,
      totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      message: "Sales records retrieved successfully",
    };
  }

  public static async getSellById(id: string, req: Request) {
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
            company: true,
            client: true,
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

    // Prepare Receipt Info for Frontend consistency
    const receiptInfo = {
      ...getReceiptMessages(company),
      qrCodeData: generateQrCodeData(sell),
    };

    return {
      data: { ...processedSell, receiptInfo },
      message: "Sale record retrieved successfully",
    };
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
    }>,
    companyId: string,
    branchId?: string | null,
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
      const itemNetAmount = Number(itemData.quantity) * adjustedSellPrice;
      const itemTaxAmount = item.isTaxable
        ? itemNetAmount * (Number(item.taxRate) / (100 + Number(item.taxRate)))
        : 0;
      const itemTotalAmount = itemNetAmount + itemTaxAmount;

      totalAmount += itemTotalAmount;
      totalTaxAmount += itemTaxAmount;
      subtotal += itemNetAmount;

      sellItems.push({
        itemId: itemData.itemId,
        quantity: itemData.quantity,
        sellPrice: adjustedSellPrice,
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
      totalAmount,
      totalTaxAmount,
      subtotal,
      insuranceCoveredAmount,
      patientPayableAmount,
      insurancePercentageSnapshot,
      sellItems,
    };
  }

  /**
   * Calculate refund totals
   */
  private static calculateRefundTotals(
    itemsToProcess: Array<{
      itemId: string;
      quantity: number;
      sellPrice: number;
    }>,
    items: Array<{
      id: string;
      itemFullName: string;
      isTaxable: boolean | null;
      taxRate: any;
    }>,
    insurancePercentage: number,
    hasInsurance: boolean,
  ) {
    let refundTotalAmount = 0;
    let refundTotalTaxAmount = 0;
    const refundItemsData: any[] = [];

    for (const itemData of itemsToProcess) {
      const item = items.find((i) => i.id === itemData.itemId);
      if (!item) continue;

      const qty = Number(itemData.quantity);
      const price = Number(itemData.sellPrice);
      const amount = qty * price;
      const taxAmt = item.isTaxable ? amount * (Number(item.taxRate) / (100 + Number(item.taxRate))) : 0;
      const total = amount + taxAmt;

      refundTotalAmount += total;
      refundTotalTaxAmount += taxAmt;

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
        totalAmount: total,
        taxAmount: taxAmt,
        insuranceCoveredPerUnit,
        patientPricePerUnit,
      });
    }

    return {
      refundTotalAmount,
      refundTotalTaxAmount,
      refundItemsData,
    };
  }

  /**
   * Select stock for sale before transaction
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
          select: { itemFullName: true },
        });
        throw new AppError(
          `Insufficient stock for item ${item?.itemFullName || itemData.itemId}. Available: ${selected.length}, Requested: ${itemData.quantity}`,
          400,
        );
      }

      if (selected.length === 0) {
        const item = await prisma.items.findFirst({
          where: { id: itemData.itemId },
          select: { itemFullName: true },
        });
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
    const branchId = req.user?.branchId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

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
        const existingItem = acc.find((i) => i.itemId === item.itemId);
        if (existingItem) {
          existingItem.quantity += item.quantity;
        } else {
          acc.push({ ...item });
        }
        return acc;
      },
      [] as Array<{ itemId: string; quantity: number; sellPrice: number }>,
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
        },
      });

      // PRE-TRANSACTION: Calculate refund totals
      const { refundTotalAmount, refundTotalTaxAmount, refundItemsData } =
        SellService.calculateRefundTotals(
          itemsToProcess,
          items,
          insurancePercentage,
          hasInsurance,
        );

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
        sellItems: refundItemsData.map((ri) => ({
          ...ri,
          item: items.find((i) => i.id === ri.itemId),
        })),
        client,
        parentSell,
        insuranceCard,
        company,
        createdAt: new Date(),
        updatedAt: new Date(),
        ebmSynced: false,
      };

      // PRE-TRANSACTION: Call EBM for refund
      const ebmResponse = await EbmService.saveSaleToEBM(
        refundForEBM as any,
        company!,
        freshUser,
        branchId,
      );

      if (ebmResponse.resultCd !== "000") {
        throw new AppError(
          `EBM Refund Failed: ${ebmResponse.resultMsg} (Code: ${ebmResponse.resultCd})`,
          400,
        );
      }

      const ebmData = ebmResponse.data;

      // TRANSACTION: Create refund with EBM data (FAST!)
      const completeRefund = await prisma.$transaction(async (tx) => {
        // Create refund record WITH EBM data
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
            // EBM data
            ebmSynced: true,
            rcptNo: ebmData.rcptNo,
            intrlData: ebmData.intrlData,
            rcptSign: ebmData.rcptSign,
            totRcptNo: ebmData.totRcptNo,
            vsdcRcptPbctDate: ebmData.vsdcRcptPbctDate,
            sdcId: ebmData.sdcId,
            mrcNo: freshUser.mrcNo,
            invcNo: EbmService.generateSarNo(refundForEBM.id),
          } as any,
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
            sellItems: { include: { item: true } },
            parentSell: true,
          },
        });

        // Create sell items for refund
        for (const ri of refundItemsData) {
          await tx.sellItem.create({
            data: {
              sellId: refundSell.id,
              itemId: ri.itemId,
              quantity: ri.quantity,
              sellPrice: ri.sellPrice,
              totalAmount: -Math.abs(ri.totalAmount),
              taxAmount: -Math.abs(ri.taxAmount),
              branchId,
              insuranceCoveredPerUnit: ri.insuranceCoveredPerUnit,
              patientPricePerUnit: ri.patientPricePerUnit,
            },
          });
        }

        // Return stock to inventory
        for (const itemData of itemsToProcess) {
          const item = items.find((i) => i.id === itemData.itemId);
          if (!item) continue;

          const refundReceipt = await tx.stockReceipts.create({
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

          await StockService.addToStock(refundReceipt.id, tx, req.user?.id);
        }

        // Refetch the refund with all sellItems included
        const completeRefundWithItems = await tx.sell.findUnique({
          where: { id: refundSell.id },
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
                  },
                },
              },
            },
            parentSell: true,
          },
        });

        return completeRefundWithItems!;
      });

      return {
        message: "Refund processed successfully",
        data: completeRefund,
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
      branchId,
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
    const shouldCheckStock = !data.isTrainingMode && data.type !== "PROFORMA";
    const stockUpdates = await SellService.selectStockForSale(
      itemsToProcess,
      companyId,
      shouldCheckStock,
    );

    // PRE-TRANSACTION: Build complete sale for EBM
    const saleForEBM = {
      id: randomUUID(), // Generate proper UUID for EBM invcNo generation
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
    };

    // PRE-TRANSACTION: Call EBM for sale
    const ebmResponse = await EbmService.saveSaleToEBM(
      saleForEBM as any,
      company!,
      freshUser,
      branchId,
      data.purchaseCode
    );

    if (ebmResponse.resultCd !== "000") {
      throw new AppError(
        `EBM Sales Registration Failed: ${ebmResponse.resultMsg}`,
        400,
      );
    }

    const ebmData = ebmResponse.data;

    // TRANSACTION: Create sale with EBM data (FAST!)
    const completeSell = await prisma.$transaction(async (tx) => {
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
          // EBM data
          ebmSynced: true,
          rcptNo: ebmData.rcptNo,
          intrlData: ebmData.intrlData,
          rcptSign: ebmData.rcptSign,
          totRcptNo: ebmData.totRcptNo,
          vsdcRcptPbctDate: ebmData.vsdcRcptPbctDate,
          sdcId: ebmData.sdcId,
          mrcNo: freshUser.mrcNo,
          invcNo: EbmService.generateSarNo(saleForEBM.id),
        } as any,
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
        },
      });

      // Create sell items
      for (const sellItemData of sellItems) {
        await tx.sellItem.create({
          data: {
            sellId: sell.id,
            ...sellItemData,
            branchId,
            insuranceCoveredPerUnit: isPharmacy
              ? sellItemData.insuranceCoveredPerUnit
              : undefined,
            patientPricePerUnit: isPharmacy
              ? sellItemData.patientPricePerUnit
              : undefined,
          },
        });
      }

      // Mark stock sold
      for (const stockUpdate of stockUpdates) {
        await markStockSold(tx, {
          stockIds: stockUpdate.stockIds,
          sellId: sell.id,
        });
      }

      // Auto-create transaction for this sale
      await tx.transaction.create({
        data: {
          clientId: data.clientId,
          companyId,
          amount: isPharmacy ? patientPayableAmount : totalAmount,
          date: new Date(),
        },
      });

      // Fetch complete sell with items for return
      const fetchedSell = await tx.sell.findUnique({
        where: { id: sell.id },
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
            },
          },
        },
      });

      return fetchedSell!;
    });

    // Prepare receipt info
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

        // Create new sell items
        for (const sellItemData of sellItems) {
          await tx.sellItem.create({
            data: {
              sellId: id,
              ...sellItemData,
              branchId: existingSell.branchId,
              // only persist per-item insurance split for PHARMACY
              insuranceCoveredPerUnit: isPharmacy
                ? sellItemData.insuranceCoveredPerUnit
                : undefined,
              patientPricePerUnit: isPharmacy
                ? sellItemData.patientPricePerUnit
                : undefined,
            },
          });
        }

        // Update stock status for all items
        for (const stockUpdate of stockUpdates) {
          await markStockSold(tx, {
            stockIds: stockUpdate.stockIds,
            sellId: id,
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
    });
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
    });
  }
}
