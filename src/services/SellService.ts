import { prisma } from "../utils/client";
import AppError from "../utils/error";
import { CreateSellDto, UpdateSellDto } from "../utils/interfaces/common";
import type { Request } from "express";
import { selectAvailableStock, markStockSold } from "../utils/stock-ops";
import { EbmService } from "./EbmService";
import { StockService } from "./StockService";

import { SellType } from "../utils/interfaces/common";

export class SellService {
  public static async getAllSells(
    req: Request,
    searchq?: string,
    limit?: number,
    page?: number,
    type?: SellType,
  ) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const queryOptions = searchq
      ? {
          companyId,
          branchId: branchId || null, // STRICT: If no branchId, show company records (null)
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
          ...(type
            ? {
                type,
                ...(type === "SALE" ? { refunds: { none: {} } } : {}),
              }
            : {}), // Add type filter if set
        }
      : {
          companyId,
          branchId: branchId || null,
          ...(type
            ? {
                type,
                ...(type === "SALE" ? { refunds: { none: {} } } : {}),
              }
            : {}), // Add type filter if set
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
      },
    });

    const totalItems = await prisma.sell.count({ where: queryOptions });

    return {
      data: sells,
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
      },
    });

    if (!sell) {
      throw new AppError("Sale record not found", 404);
    }

    return {
      data: sell,
      message: "Sale record retrieved successfully",
    };
  }

  public static async createSell(data: CreateSellDto, req: Request) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    console.log("CreateSell Payload:", JSON.stringify(data, null, 2)); // DEBUG LOG

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
          : [];

    if (itemsToProcess.length === 0) {
      throw new AppError("No items provided for sale", 400);
    }

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

    return await prisma.$transaction(async (tx) => {
      // Load company to check industry for PHARMACY gating
      const company = await tx.company.findFirst({ where: { id: companyId } });
      const companyIndustry = company?.industry ?? undefined;
      const isPharmacy = (companyIndustry ?? "").toUpperCase() === "PHARMACY";

      // ---------------------------------------------------------
      // REFUND LOGIC START
      // ---------------------------------------------------------
      // Treat as refund if explicitly typed OR if parentSellId is provided
      const isRefund = data.type === "REFUND" || !!data.parentSellId;
      if (isRefund) {
        if (!data.parentSellId) {
          throw new AppError("Parent Sell ID is required for refunds", 400);
        }

        const parentSell = await tx.sell.findUnique({
          where: { id: data.parentSellId },
          include: { sellItems: true },
        });

        if (!parentSell) {
          throw new AppError("Parent sale not found", 404);
        }

        // Verify refund items match parent sale items content
        // This is a simplified validation; rigorous validation would check remaining refundable qty per item.
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
          // Optional: Check if refund quantity > original quantity (simple check)
          // Ideally we check against ALREADY REFUNDED quantities too.
        }

        // Calculate Totals for Refund
        let refundTotalAmount = 0;
        let refundTotalTaxAmount = 0;
        // Calculate Insurance Split per item if applicable
        // Fallback to parentSell insurance info if not provided in payload
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

        const refundItemsData: any[] = [];

        for (const itemData of itemsToProcess) {
          const item = await tx.items.findFirst({
            where: { id: itemData.itemId, companyId },
          });
          if (!item) continue;

          const qty = Number(itemData.quantity);
          const price = Number(itemData.sellPrice);
          const amount = qty * price;
          const taxAmt = item.isTaxable
            ? amount * (Number(item.taxRate) / 100)
            : 0;
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

          // STOCK RETURN LOGIC:
          // ... existing stock logic
          const refundReceipt = await tx.stockReceipts.create({
            data: {
              itemId: item.id,
              quantityReceived: Math.abs(qty),
              dateReceived: new Date(),
              unitCost: 0,
              totalCost: 0,
              companyId,
              branchId,
              receiptType: "REFUND", // Custom type for tracking
              remarksNotes: `Refund from Sale ${parentSell.rcptNo || parentSell.id}`,
              ebmSynced: true, // Mark as synced to skip EBM registration in addToStock (Refunds shouldn't register as Stock Imports)
            },
          });

          // Use StockService to add stock (handles creating multiple rows for quantity > 1)
          await StockService.addToStock(refundReceipt.id, tx, req.user?.id);
        }

        // Create Refund Record
        const refundSell = await tx.sell.create({
          data: {
            clientId: data.clientId || parentSell.clientId, // Fallback for client too? Usually payload has it.
            companyId,
            branchId,
            totalAmount: -Math.abs(refundTotalAmount),
            taxAmount: -Math.abs(refundTotalTaxAmount),

            // Use absolute values for DB, or negative?
            subtotal: -Math.abs(Number(data.subtotal || refundTotalAmount)), // If subtotal missing, use total
            insuranceCoveredAmount: -Math.abs(
              Number(data.insuranceCoveredAmount || 0),
            ), // Re-calc might be better but trusting payload/0
            patientPayableAmount: -Math.abs(
              Number(data.patientPayableAmount || refundTotalAmount),
            ),
            insurancePercentage: insurancePercentage,
            insuranceCardId: insuranceCardId || null,

            type: "REFUND",
            parentSellId: data.parentSellId,
            refundReasonCode: data.refundReasonCode,
            refundReasonNote: data.refundReasonNote,

            notes: data.notes,
            clientType: clientType,
            paymentMode: (data.paymentMode || parentSell.paymentMode) as any,
            paymentMethod: data.paymentMethod || parentSell.paymentMethod,
            doctorId: data.doctorId || parentSell.doctorId || null,
            hospital: data.hospital || parentSell.hospital || null,

            // Legacy fields
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
          },
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

        // Create Sell Items for Refund
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

        // EBM Registration for Refund
        // Refetch to be sure of structure
        const completeRefund = await tx.sell.findUnique({
          where: { id: refundSell.id },
          include: {
            client: true,
            sellItems: { include: { item: true } },
            parentSell: true,
            insuranceCard: { include: { insurance: true } },
          },
        });

        if (completeRefund && company) {
          const ebmResponse = await EbmService.saveSaleToEBM(
            completeRefund,
            company,
            req.user,
            branchId,
          );

          if (ebmResponse.resultCd === "000") {
            await tx.sell.update({
              where: { id: completeRefund.id },
              data: {
                ebmSynced: true,
                rcptNo: ebmResponse.data.rcptNo,
                intrlData: ebmResponse.data.intrlData,
                rcptSign: ebmResponse.data.rcptSign,
                totRcptNo: ebmResponse.data.totRcptNo,
                vsdcRcptPbctDate: ebmResponse.data.vsdcRcptPbctDate,
                sdcId: ebmResponse.data.sdcId,
                mrcNo: ebmResponse.data.mrcNo,
              } as any,
            });
            // Update object for return
            const cr = completeRefund as any;
            cr.ebmSynced = true;
            cr.rcptNo = ebmResponse.data.rcptNo;
            cr.intrlData = ebmResponse.data.intrlData;
            cr.rcptSign = ebmResponse.data.rcptSign;
            cr.totRcptNo = ebmResponse.data.totRcptNo;
            cr.vsdcRcptPbctDate = ebmResponse.data.vsdcRcptPbctDate;
            cr.sdcId = ebmResponse.data.sdcId;
            cr.mrcNo = ebmResponse.data.mrcNo;
          } else {
            console.error(
              "Refund EBM Sync Failed:",
              JSON.stringify(ebmResponse, null, 2),
            );

            throw new AppError(
              `EBM Refund Failed: ${ebmResponse.resultMsg} (Code: ${ebmResponse.resultCd})`,
              400,
            );
          }
        }

        return {
          message: "Refund processed successfully",
          data: completeRefund,
        };
      }
      // ---------------------------------------------------------
      // REFUND LOGIC END
      // ---------------------------------------------------------

      // Validate Doctor if provided
      if (data.doctorId) {
        const doctor = await tx.doctor.findFirst({
          where: { id: data.doctorId },
        });
        if (!doctor) {
          throw new AppError("Doctor not found", 404);
        }
      }

      // Validate Client (Required for ALL industries)
      if (!data.clientId) {
        throw new AppError("Client ID is required", 400);
      }
      const client = await tx.client.findFirst({
        where: { id: data.clientId, companyId },
      });
      if (!client) {
        throw new AppError(
          "Client not found or doesn't belong to your company",
          404,
        );
      }

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
      let subtotal = 0;
      let insuranceCoveredAmount = 0;
      let patientPayableAmount = 0;
      let insurancePercentageSnapshot: number | undefined;

      // authoritative subtotal is the sum of item price * quantity (already adjusted)
      subtotal = sellItems.reduce(
        (acc, s) => acc + Number(s.quantity) * Number(s.sellPrice),
        0,
      );

      const isPharmacyIndustry =
        (companyIndustry ?? "").toUpperCase() === "PHARMACY";
      let applyInsurance = false;
      // Only apply insurance if industry is PHARMACY AND clientType is INSUREE (or undefined/default)
      // If clientType is explicitly PRIVATE, skip insurance
      const shouldCheckInsurance =
        isPharmacyIndustry &&
        (data.clientType === "INSUREE" || !data.clientType); // Default behavior if not set? Or strict? Protocol implies PRIVATE skips it.

      if (shouldCheckInsurance && data.insuranceCardId && data.clientId) {
        // Validate card ownership and expiry, and same company
        const insuranceCard = await tx.insuranceCard.findFirst({
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
        if (insuranceCard) {
          applyInsurance = true;
          const clientPercentage = Number(insuranceCard.percentage ?? 0);
          insurancePercentageSnapshot = 100 - clientPercentage;
        }
      }

      if (
        applyInsurance &&
        insurancePercentageSnapshot !== undefined &&
        100 - insurancePercentageSnapshot > 0
      ) {
        const clientPercentage = 100 - insurancePercentageSnapshot;
        const percentageFactor = clientPercentage / 100;
        // compute per item split
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
        insurancePercentageSnapshot = applyInsurance
          ? (insurancePercentageSnapshot ?? 0)
          : undefined;
      }

      const sell = await tx.sell.create({
        data: {
          clientId: data.clientId,
          companyId,
          branchId,
          totalAmount,
          taxAmount: totalTaxAmount,
          // insurance fields snapshot (only persist for PHARMACY)

          insuranceCardId: isPharmacyIndustry
            ? data.insuranceCardId || null
            : undefined,
          subtotal: isPharmacyIndustry ? subtotal : undefined,
          insuranceCoveredAmount: isPharmacyIndustry
            ? insuranceCoveredAmount
            : undefined,
          patientPayableAmount: isPharmacyIndustry
            ? patientPayableAmount
            : undefined,
          insurancePercentage: isPharmacyIndustry
            ? insurancePercentageSnapshot
            : undefined,
          notes: data.notes,
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

          // New fields
          clientType: data.clientType,
          paymentMode: data.paymentMode as any,
          paymentMethod: data.paymentMethod,
          doctorId: data.doctorId || null,
          hospital: data.hospital || null,
        },
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
            // only persist per-item insurance split for PHARMACY
            insuranceCoveredPerUnit: isPharmacyIndustry
              ? sellItemData.insuranceCoveredPerUnit
              : undefined,
            patientPricePerUnit: isPharmacyIndustry
              ? sellItemData.patientPricePerUnit
              : undefined,
          },
        });
      }

      // Update stock status for all items
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
          amount: isPharmacyIndustry ? patientPayableAmount : totalAmount,
          date: new Date(),
        },
      });

      // Fetch the complete sell data with items
      const completeSell = await tx.sell.findUnique({
        where: { id: sell.id },
        include: {
          client: { select: { id: true, name: true, email: true } },

          sellItems: {
            include: {
              item: {
                select: { id: true, itemCodeSku: true, itemFullName: true },
              },
            },
          },
          // Legacy item for backward compatibility
          item: { select: { id: true, itemCodeSku: true, itemFullName: true } },
        },
      });

      // EBM Sales Registration
      if (completeSell && !(completeSell as any).ebmSynced && company) {
        const ebmResponse = await EbmService.saveSaleToEBM(
          completeSell,
          company,
          req.user,
          branchId,
        );

        if (ebmResponse.resultCd !== "000") {
          throw new AppError(
            `EBM Sales Registration Failed: ${ebmResponse.resultMsg}`,
            400,
          );
        }

        const ebmData = ebmResponse.data;
        await tx.sell.update({
          where: { id: completeSell.id },
          data: {
            ebmSynced: true,
            rcptNo: ebmData.rcptNo,
            intrlData: ebmData.intrlData,
            rcptSign: ebmData.rcptSign,
            totRcptNo: ebmData.totRcptNo,
            vsdcRcptPbctDate: ebmData.vsdcRcptPbctDate,
            sdcId: ebmData.sdcId,
            mrcNo: ebmData.mrcNo,
          } as any,
        });

        // Update the return object with new EBM fields
        const cs = completeSell as any;
        cs.ebmSynced = true;
        cs.rcptNo = ebmData.rcptNo;
        cs.intrlData = ebmData.intrlData;
        cs.rcptSign = ebmData.rcptSign;
        cs.totRcptNo = ebmData.totRcptNo;
        cs.vsdcRcptPbctDate = ebmData.vsdcRcptPbctDate;
        cs.sdcId = ebmData.sdcId;
        cs.mrcNo = ebmData.mrcNo;
      }

      return { message: "Sale created successfully", data: completeSell };
    });
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
