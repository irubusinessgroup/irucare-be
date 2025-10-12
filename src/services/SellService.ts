import { prisma } from "../utils/client";
import AppError from "../utils/error";
import { CreateSellDto, UpdateSellDto } from "../utils/interfaces/common";
import type { Request } from "express";

export class SellService {
  public static async getAllSells(
    req: Request,
    searchq?: string,
    limit?: number,
    page?: number,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const queryOptions = searchq
      ? {
          companyId,
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
      : { companyId };

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
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const sell = await prisma.sell.findFirst({
      where: { id, companyId },
      include: {
        client: true,
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

  public static async createSell(data: CreateSellDto, companyId: string) {
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

    return await prisma.$transaction(async (tx) => {
      // Load company to check industry for PHARMACY gating
      const company = await tx.company.findFirst({ where: { id: companyId } });
      const companyIndustry = company?.industry ?? undefined;
      const client = await tx.client.findFirst({
        where: { id: data.clientId, companyId },
      });
      if (!client) {
        throw new AppError(
          "Client not found or doesn't belong to your company",
          404,
        );
      }

      // Fetch company tools to apply selling percentage markup
      const companyTools = await tx.companyTools.findFirst({
        where: { companyId },
      });
      const sellingPercentage = Number(companyTools?.sellingPercentage ?? 0);

      let totalAmount = 0;
      const sellItems: Array<{
        itemId: string;
        quantity: number;
        sellPrice: number;
        totalAmount: number;
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

        const availableStock = await tx.stock.findMany({
          where: {
            stockReceipt: { itemId: itemData.itemId, companyId },
            status: "AVAILABLE",
          },
          include: {
            stockReceipt: {
              select: {
                id: true,
                expiryDate: true,
                dateReceived: true,
              },
            },
          },
          orderBy: [
            { stockReceipt: { expiryDate: "asc" } },
            { stockReceipt: { dateReceived: "asc" } },
          ],
        });

        if (availableStock.length < itemData.quantity) {
          throw new AppError(
            `Insufficient stock for item ${item.itemFullName}. Available: ${availableStock.length}, Requested: ${itemData.quantity}`,
            400,
          );
        }

        if (availableStock.length === 0) {
          throw new AppError(
            `No available stock for item ${item.itemFullName}`,
            400,
          );
        }

        const stockToUpdate = availableStock.slice(0, itemData.quantity);
        const stockIds = stockToUpdate.map((stock) => stock.id);

        const adjustedSellPrice =
          Number(itemData.sellPrice) * (1 + sellingPercentage / 100);
        const itemTotalAmount = Number(itemData.quantity) * adjustedSellPrice;
        totalAmount += itemTotalAmount;

        sellItems.push({
          itemId: itemData.itemId,
          quantity: itemData.quantity,
          sellPrice: adjustedSellPrice,
          totalAmount: itemTotalAmount,
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

      const isPharmacy = (companyIndustry ?? "").toUpperCase() === "PHARMACY";
      let applyInsurance = false;
      if (isPharmacy && data.insuranceCardId && data.patientId) {
        // Validate card ownership and expiry, and same company
        const insuranceCard = await tx.insuranceCard.findFirst({
          where: {
            id: data.insuranceCardId,
            patientId: data.patientId,
            companyId,
          },
          include: { insurance: true },
        });
        if (!insuranceCard) {
          throw new AppError(
            "Insurance card not found or not linked to patient/company",
            400,
          );
        }
        const now = new Date();
        const isExpired =
          Boolean(insuranceCard.expired) ||
          (insuranceCard.expireDate
            ? new Date(insuranceCard.expireDate) < now
            : false);
        if (!isExpired) {
          applyInsurance = true;
          insurancePercentageSnapshot = Number(
            insuranceCard.insurance?.percentage ?? 0,
          );
        }
      }

      if (
        applyInsurance &&
        insurancePercentageSnapshot &&
        insurancePercentageSnapshot > 0
      ) {
        const percentageFactor = insurancePercentageSnapshot / 100;
        // compute per item split
        for (const s of sellItems) {
          const coveredPerUnit = Number(s.sellPrice) * percentageFactor;
          const patientPerUnit = Number(s.sellPrice) - coveredPerUnit;
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

      // Create the sell record
      const sell = await tx.sell.create({
        data: {
          clientId: data.clientId,
          companyId,
          totalAmount,
          // insurance fields snapshot (only persist for PHARMACY)
          patientId: isPharmacy ? data.patientId : undefined,
          insuranceCardId: isPharmacy ? data.insuranceCardId : undefined,
          subtotal: isPharmacy ? subtotal : undefined,
          insuranceCoveredAmount: isPharmacy
            ? insuranceCoveredAmount
            : undefined,
          patientPayableAmount: isPharmacy ? patientPayableAmount : undefined,
          insurancePercentage: isPharmacy
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
        await tx.stock.updateMany({
          where: { id: { in: stockUpdate.stockIds } },
          data: {
            status: "SOLD",
            sellId: sell.id,
          },
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
      const existingSell = await tx.sell.findFirst({
        where: { id, companyId },
        include: {
          stocks: true,
          sellItems: true,
        },
      });

      if (!existingSell) {
        throw new AppError("Sale record not found", 404);
      }

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

        // Fetch company tools to apply selling percentage markup
        const companyTools = await tx.companyTools.findFirst({
          where: { companyId },
        });
        const sellingPercentage = Number(companyTools?.sellingPercentage ?? 0);

        let totalAmount = 0;
        const sellItems: Array<{
          itemId: string;
          quantity: number;
          sellPrice: number;
          totalAmount: number;
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

          const availableStock = await tx.stock.findMany({
            where: {
              stockReceipt: { itemId: itemData.itemId, companyId },
              status: "AVAILABLE",
            },
            include: {
              stockReceipt: {
                select: {
                  id: true,
                  expiryDate: true,
                  dateReceived: true,
                },
              },
            },
            orderBy: [
              { stockReceipt: { expiryDate: "asc" } },
              { stockReceipt: { dateReceived: "asc" } },
            ],
          });

          if (availableStock.length < itemData.quantity) {
            throw new AppError(
              `Insufficient stock for item ${item.itemFullName}. Available: ${availableStock.length}, Requested: ${itemData.quantity}`,
              400,
            );
          }

          if (availableStock.length === 0) {
            throw new AppError(
              `No available stock for item ${item.itemFullName}`,
              400,
            );
          }

          const stockToUpdate = availableStock.slice(0, itemData.quantity);
          const stockIds = stockToUpdate.map((stock) => stock.id);

          const adjustedSellPrice =
            Number(itemData.sellPrice) * (1 + sellingPercentage / 100);
          const itemTotalAmount = Number(itemData.quantity) * adjustedSellPrice;
          totalAmount += itemTotalAmount;

          sellItems.push({
            itemId: itemData.itemId,
            quantity: itemData.quantity,
            sellPrice: adjustedSellPrice,
            totalAmount: itemTotalAmount,
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
          (data.patientId || existingSell.patientId)
        ) {
          const patientIdToUse =
            data.patientId ?? existingSell.patientId ?? undefined;
          if (patientIdToUse) {
            const insuranceCard = await tx.insuranceCard.findFirst({
              where: {
                id: data.insuranceCardId,
                patientId: patientIdToUse,
                companyId,
              },
              include: { insurance: true },
            });
            if (!insuranceCard) {
              throw new AppError(
                "Insurance card not found or not linked to patient/company",
                400,
              );
            }
            const now = new Date();
            const isExpired =
              Boolean(insuranceCard.expired) ||
              (insuranceCard.expireDate
                ? new Date(insuranceCard.expireDate) < now
                : false);
            if (!isExpired) {
              insurancePercentageSnapshot = Number(
                insuranceCard.insurance?.percentage ?? 0,
              );
              const percentageFactor = (insurancePercentageSnapshot ?? 0) / 100;
              for (const s of sellItems) {
                const coveredPerUnit = Number(s.sellPrice) * percentageFactor;
                const patientPerUnit = Number(s.sellPrice) - coveredPerUnit;
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
          await tx.stock.updateMany({
            where: { id: { in: stockUpdate.stockIds } },
            data: {
              status: "SOLD",
              sellId: id,
            },
          });
        }

        // Update the sell record
        const updateData = {
          ...data,
          totalAmount,
          // insurance fields snapshot (only persist for PHARMACY)
          patientId: isPharmacy
            ? (data.patientId ?? existingSell.patientId)
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
        };

        const sell = await tx.sell.update({
          where: { id },
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
            const availableStock = await tx.stock.findMany({
              where: {
                stockReceipt: { itemId: newItemId },
                status: "AVAILABLE",
              },
              orderBy: [
                { stockReceipt: { expiryDate: "asc" } },
                { stockReceipt: { dateReceived: "asc" } },
              ],
            });

            if (availableStock.length < newQuantity) {
              throw new AppError(
                `Insufficient stock. Available: ${availableStock.length}, Requested: ${newQuantity}`,
                400,
              );
            }

            const stockToAllocate = availableStock.slice(0, newQuantity);
            await tx.stock.updateMany({
              where: { id: { in: stockToAllocate.map((s) => s.id) } },
              data: {
                status: "SOLD",
                sellId: id,
              },
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
          where: { id },
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
      const existingSell = await tx.sell.findFirst({
        where: { id, companyId },
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
      await tx.sell.delete({ where: { id } });

      return { message: "Sale deleted successfully" };
    });
  }
}
