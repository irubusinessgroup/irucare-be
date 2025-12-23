import { prisma } from "../utils/client";
import AppError from "../utils/error";
import { CreateSellDto, UpdateSellDto } from "../utils/interfaces/common";
import type { Request } from "express";
import { selectAvailableStock, markStockSold } from "../utils/stock-ops";

export class SellService {
  public static async getAllSells(
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
        }
      : {
          companyId,
          branchId: branchId || null, // STRICT: If no branchId, show company records (null)
        };

    console.log(`[SellService DEBUG] companyId: ${companyId}, branchId: ${branchId}`);

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

  public static async createSell(
    data: CreateSellDto,
    companyId: string,
    branchId?: string | null,
  ) {
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
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
        (100 - insurancePercentageSnapshot) > 0
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

      console.log("Creating sell with data:", {
        clientId: data.clientId,
        isPharmacy,
        patientId: data.patientId,
      });

      const sell = await tx.sell.create({
        data: {
          clientId: data.clientId,
          companyId,
          branchId,
          totalAmount,
          taxAmount: totalTaxAmount,
          // insurance fields snapshot (only persist for PHARMACY)

          insuranceCardId: isPharmacyIndustry
            ? data.insuranceCardId
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
          paymentMode: data.paymentMode,
          paymentMethod: data.paymentMethod,
          doctorId: data.doctorId,
          hospital: data.hospital,
        },
        include: {
          client: { select: { id: true, name: true, email: true } },
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
