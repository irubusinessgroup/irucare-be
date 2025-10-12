import { prisma } from "../utils/client";
import AppError from "../utils/error";
import {
  CreateItemDto,
  ImportItemRow,
  UpdateItemDto,
  ValidationError,
} from "../utils/interfaces/common";
import { ItemCodeGenerator } from "../utils/itemCodeGenerator";
import type { Request } from "express";
import * as XLSX from "xlsx";

export class ItemService {
  private static readonly REQUIRED_COLUMNS = [
    "itemFullName",
    "productCode",
    "categoryName",
    "minLevel",
    "maxLevel",
  ];

  private static readonly COLUMN_MAPPINGS: Record<string, string> = {
    "item name": "itemFullName",
    "item full name": "itemFullName",
    name: "itemFullName",
    category: "categoryName",
    "category name": "categoryName",
    "product code": "productCode",
    description: "description",
    "min level": "minLevel",
    "minimum level": "minLevel",
    "max level": "maxLevel",
    "maximum level": "maxLevel",
    designation: "itemFullName",
    drug_code: "productCode",
  };

  public static async importItems(
    file: Express.Multer.File,
    companyId: string,
  ) {
    try {
      // Ensure file buffer is available (requires memory storage)
      if (!file || !file.buffer) {
        throw new AppError(
          "File buffer is missing. Ensure this route uses multer.memoryStorage().",
          400,
        );
      }

      // Parse Excel file
      const workbook = XLSX.read(file.buffer, { type: "buffer" });
      if (
        !workbook ||
        !Array.isArray(workbook.SheetNames) ||
        workbook.SheetNames.length === 0
      ) {
        throw new AppError("Uploaded Excel file has no sheets", 400);
      }

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) {
        throw new AppError(
          "Unable to read the first worksheet from Excel file",
          400,
        );
      }
      const rawData: Array<Record<string, unknown>> =
        XLSX.utils.sheet_to_json(worksheet);

      // Check if first row contains headers (not actual data)
      const firstRow = rawData[0];
      const firstRowValues = Object.values(firstRow);
      const hasProperHeaders = Object.keys(firstRow).some(
        (key) =>
          key === "itemFullName" ||
          key === "categoryName" ||
          key === "productCode" ||
          key === "minLevel" ||
          key === "maxLevel",
      );

      // If headers are in the first data row (__EMPTY pattern), use them as headers
      let dataRows = rawData;
      if (
        !hasProperHeaders &&
        firstRowValues.some(
          (val) =>
            typeof val === "string" &&
            (val.toLowerCase().includes("item") ||
              val.toLowerCase().includes("category") ||
              val.toLowerCase().includes("product") ||
              val.toLowerCase().includes("level")),
        )
      ) {
        console.log(
          "Headers detected in first data row, rebuilding data structure...",
        );

        // Build proper column mapping from first row
        const headerRow = firstRow;
        const headerMapping: Record<string, string> = {};

        Object.entries(headerRow).forEach(([key, value]) => {
          const headerValue = String(value).toLowerCase().trim();
          if (headerValue.includes("product") && headerValue.includes("code")) {
            headerMapping[key] = "productCode";
          } else if (
            headerValue.includes("drug") &&
            headerValue.includes("code")
          ) {
            headerMapping[key] = "productCode";
          } else if (
            headerValue.includes("item") &&
            headerValue.includes("name")
          ) {
            headerMapping[key] = "itemFullName";
          } else if (headerValue.includes("designation")) {
            headerMapping[key] = "itemFullName";
          } else if (headerValue.includes("category")) {
            headerMapping[key] = "categoryName";
          } else if (
            headerValue.includes("min") &&
            headerValue.includes("level")
          ) {
            headerMapping[key] = "minLevel";
          } else if (
            headerValue.includes("max") &&
            headerValue.includes("level")
          ) {
            headerMapping[key] = "maxLevel";
          } else if (headerValue.includes("description")) {
            headerMapping[key] = "description";
          }
        });

        // Remap the data using the detected headers
        dataRows = rawData.slice(1).map((row) => {
          const newRow: Record<string, unknown> = {};
          Object.entries(row).forEach(([key, value]) => {
            const mappedKey = headerMapping[key];
            if (mappedKey) {
              newRow[mappedKey] = value;
            }
          });
          return newRow;
        });

        console.log("Rebuilt data structure, sample row:", dataRows[0]);
      }

      if (dataRows.length === 0) {
        throw new AppError("Excel file has no data rows", 400);
      }

      // Normalize column names and map data
      let normalizedData = this.normalizeData(dataRows);

      // Remove duplicates by productCode
      normalizedData = this.removeDuplicates(normalizedData);

      console.log("Total rows after normalization:", normalizedData.length);
      console.log("First row sample:", normalizedData[0]);

      // Validate data
      const { validItems, errors } = await this.validateItems(
        normalizedData,
        companyId,
      );

      console.log("Valid items:", validItems.length);
      console.log("Errors:", errors.length);
      if (errors.length > 0) {
        console.log("Sample errors:", errors.slice(0, 5));
      }

      if (validItems.length === 0) {
        // Return the errors so user knows what went wrong
        return {
          message: "No valid items to import",
          data: {
            total: rawData.length,
            successful: 0,
            failed: errors.length,
            importedItems: [],
            errors,
          },
        };
      }

      // Import valid items
      const importedItems = await this.bulkCreateOrUpdateItems(
        validItems,
        companyId,
      );
      // Remove DB duplicates after import
      await ItemService.removeDbDuplicates(companyId);
      return {
        message: "Items import completed",
        data: {
          total: rawData.length,
          successful: importedItems.length,
          failed: errors.length,
          importedItems,
          errors,
        },
      };
    } catch (error: unknown) {
      if (error instanceof AppError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new AppError(`Failed to import items: ${message}`, 500);
    }
  }

  // Remove duplicates by productCode, keep first occurrence
  private static removeDuplicates(items: ImportItemRow[]): ImportItemRow[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      const code = item.productCode ? String(item.productCode).trim() : "";
      if (!code) return true; // keep items without productCode
      if (seen.has(code)) return false;
      seen.add(code);
      return true;
    });
  }

  private static normalizeData(
    rawData: Array<Record<string, unknown>>,
  ): ImportItemRow[] {
    return rawData.map((row) => {
      const normalizedRow: Record<string, unknown> = {};

      Object.keys(row).forEach((key) => {
        const lowerKey = key.toLowerCase().trim();
        // First check if there's a mapping, otherwise use the original key
        const normalizedKey = this.COLUMN_MAPPINGS[lowerKey] || key;
        normalizedRow[normalizedKey] = row[key as keyof typeof row];
      });

      // Set default minLevel and maxLevel if missing or empty
      if (
        normalizedRow["minLevel"] === undefined ||
        normalizedRow["minLevel"] === null ||
        String(normalizedRow["minLevel"]).trim() === ""
      ) {
        normalizedRow["minLevel"] = 10;
      }
      if (
        normalizedRow["maxLevel"] === undefined ||
        normalizedRow["maxLevel"] === null ||
        String(normalizedRow["maxLevel"]).trim() === ""
      ) {
        normalizedRow["maxLevel"] = 500;
      }

      // Debug log to see what we're getting
      console.log("Normalized row:", normalizedRow);

      return normalizedRow as unknown as ImportItemRow;
    });
  }

  private static async validateItems(
    data: ImportItemRow[],
    companyId: string,
  ): Promise<{ validItems: ImportItemRow[]; errors: ValidationError[] }> {
    const validItems: ImportItemRow[] = [];
    const errors: ValidationError[] = [];

    // Verify company exists
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new AppError("Company not found", 404);
    }

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 2; // +2 because Excel is 1-indexed and has header row
      const rowErrors: ValidationError[] = [];

      // Check required fields
      this.REQUIRED_COLUMNS.forEach((field) => {
        const value = row[field as keyof ImportItemRow];
        if (
          value === undefined ||
          value === null ||
          String(value).trim() === ""
        ) {
          rowErrors.push({
            row: rowNumber,
            field,
            message: `${field} is required`,
          });
        }
      });

      // Validate numeric fields
      if (row.minLevel !== undefined && row.minLevel !== null) {
        const minLevelNum = Number(row.minLevel);
        if (isNaN(minLevelNum) || minLevelNum < 0) {
          rowErrors.push({
            row: rowNumber,
            field: "minLevel",
            message: "minLevel must be a positive number",
          });
        }
      }

      if (row.maxLevel !== undefined && row.maxLevel !== null) {
        const maxLevelNum = Number(row.maxLevel);
        if (isNaN(maxLevelNum) || maxLevelNum < 0) {
          rowErrors.push({
            row: rowNumber,
            field: "maxLevel",
            message: "maxLevel must be a positive number",
          });
        }
      }

      // Validate min < max
      if (
        row.minLevel !== undefined &&
        row.maxLevel !== undefined &&
        row.minLevel !== null &&
        row.maxLevel !== null
      ) {
        const minLevelNum = Number(row.minLevel);
        const maxLevelNum = Number(row.maxLevel);

        if (
          !isNaN(minLevelNum) &&
          !isNaN(maxLevelNum) &&
          minLevelNum > maxLevelNum
        ) {
          rowErrors.push({
            row: rowNumber,
            field: "minLevel",
            message: "minLevel cannot be greater than maxLevel",
          });
        }
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
      } else {
        validItems.push(row);
      }
    }

    return { validItems, errors };
  }

  // Bulk create or update items by productCode
  private static async bulkCreateOrUpdateItems(
    items: ImportItemRow[],
    companyId: string,
  ) {
    const importedItems = [];
    // Get all categories upfront
    const categories = await prisma.itemCategories.findMany({
      where: { companyId },
    });
    const categoryMap = new Map(
      categories.map((c) => [c.categoryName.toLowerCase().trim(), c]),
    );
    for (const item of items) {
      try {
        const normalizedCategoryName = item.categoryName.toLowerCase().trim();
        let category = categoryMap.get(normalizedCategoryName);
        // Auto-create category if it does not exist for this company
        if (!category) {
          const createdCategory = await prisma.itemCategories.create({
            data: {
              categoryName: item.categoryName.trim(),
              companyId,
            },
          });
          categoryMap.set(normalizedCategoryName, createdCategory);
          category = createdCategory;
        }
        // Check for existing item by productCode
        let existingItem = null;
        if (item.productCode) {
          existingItem = await prisma.items.findFirst({
            where: {
              productCode: String(item.productCode).trim(),
              companyId,
            },
          });
        }
        if (existingItem) {
          // Update existing item
          const updatedItem = await prisma.items.update({
            where: { id: existingItem.id },
            data: {
              itemFullName: item.itemFullName,
              categoryId: category.id,
              description: item.description || null,
              minLevel: item.minLevel,
              maxLevel: item.maxLevel,
              // Do not update productCode
              companyId,
            },
            include: {
              category: true,
              company: true,
            },
          });
          importedItems.push(updatedItem);
        } else {
          // Create new item
          const itemCode = await ItemCodeGenerator.generate(category.id);
          const createdItem = await prisma.items.create({
            data: {
              itemFullName: item.itemFullName,
              categoryId: category.id,
              productCode: item.productCode || null,
              description: item.description || null,
              minLevel: item.minLevel,
              maxLevel: item.maxLevel,
              itemCodeSku: itemCode,
              companyId,
            },
            include: {
              category: true,
              company: true,
            },
          });
          importedItems.push(createdItem);
        }
      } catch (error: unknown) {
        console.error(
          `Failed to create/update item: ${item.itemFullName}`,
          error,
        );
      }
    }
    return importedItems;
  }

  public static async createItem(data: CreateItemDto, companyId: string) {
    const category = await prisma.itemCategories.findUnique({
      where: { id: data.categoryId },
    });
    if (!category) {
      throw new AppError("Category not found", 404);
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new AppError("Company not found", 404);
    }
    const itemCode = await ItemCodeGenerator.generate(data.categoryId);
    const item = await prisma.items.create({
      data: {
        ...data,
        itemCodeSku: itemCode,
        companyId: companyId,
      },
      include: {
        category: true,
        company: true,
      },
    });
    // Remove DB duplicates after create
    await ItemService.removeDbDuplicates(companyId);
    return { message: "Item created successfully", data: item };
  }

  public static async getItem(id: string) {
    const item = await prisma.items.findUnique({
      where: { id },
      include: {
        category: true,
        company: true,
        stockReceipts: { include: { supplier: true } },
      },
    });
    if (!item) {
      throw new AppError("Item not found", 404);
    }

    const totalStockQuantity = item.stockReceipts.reduce(
      (sum, s) => sum + parseFloat(s.quantityReceived.toString()),
      0,
    );

    return {
      message: "Item fetched successfully",
      data: {
        ...item,
        totalStockQuantity,
      },
    };
  }

  public static async updateItem(
    id: string,
    data: UpdateItemDto,
    companyId: string,
  ) {
    const item = await prisma.items.findUnique({
      where: { id, companyId: companyId },
      include: {
        category: true,
        company: true,
        stockReceipts: { include: { supplier: true } },
      },
    });

    if (!item) {
      throw new AppError("Item not found", 404);
    }

    if (data.categoryId) {
      const category = await prisma.itemCategories.findUnique({
        where: { id: data.categoryId },
      });
      if (!category) {
        throw new AppError("Category not found", 404);
      }
    }

    const updatedItem = await prisma.items.update({
      where: { id, companyId: companyId },
      data,
      include: {
        category: true,
        company: true,
        stockReceipts: { include: { supplier: true } },
      },
    });
    // Remove DB duplicates after update
    await ItemService.removeDbDuplicates(companyId);
    return {
      message: "Item updated successfully",
      data: updatedItem,
    };
  }

  public static async deleteItem(id: string, companyId: string) {
    const item = await prisma.items.findUnique({
      where: { id, companyId: companyId },
      include: { stockReceipts: true },
    });

    if (!item) {
      throw new AppError("Item not found", 404);
    }

    if (item.stockReceipts.length > 0) {
      throw new AppError("Item has stock entries and cannot be deleted", 400);
    }

    await prisma.items.delete({
      where: { id },
    });

    return {
      message: "Item deleted successfully",
    };
  }

  public static async getItems(
    req: Request,
    searchq?: string,
    limit?: number,
    page?: number,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    // Normalize pagination params and set defaults
    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 15;

    const queryOptions = searchq
      ? {
          companyId,
          OR: [
            { itemCodeSku: { contains: searchq } },
            { itemFullName: { contains: searchq } },
            { description: { contains: searchq } },
            { brandManufacturer: { contains: searchq } },
          ],
        }
      : { companyId };

    const skip = (pageNum - 1) * limitNum;
    const take = limitNum;

    const items = await prisma.items.findMany({
      where: queryOptions,
      include: {
        category: true,
        company: true,
        stockReceipts: { include: { supplier: true } },
      },
      skip,
      take,
      orderBy: { createdAt: "desc" },
    });

    const totalItems = await prisma.items.count({ where: queryOptions });

    return {
      data: items,
      totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      message: "Items retrieved successfully",
    };
  }

  // Remove duplicate items in DB by productCode, keep earliest created
  public static async removeDbDuplicates(companyId: string) {
    // Remove all items with productCode: null
    await prisma.items.deleteMany({
      where: {
        companyId,
        productCode: null,
      },
    });

    // Find all items with non-null productCode
    const duplicates = await prisma.items.findMany({
      where: {
        companyId,
        NOT: { productCode: null },
      },
      orderBy: { createdAt: "asc" },
    });
    // Group by productCode
    const codeMap = new Map<string, Array<(typeof duplicates)[0]>>();
    for (const item of duplicates) {
      const code = String(item.productCode).trim();
      if (!code) continue;
      if (!codeMap.has(code)) codeMap.set(code, []);
      codeMap.get(code)!.push(item);
    }
    // For each group, delete all but the first
    for (const items of codeMap.values()) {
      if (items.length > 1) {
        const toDelete = items.slice(1).map((i) => i.id);
        await prisma.items.deleteMany({
          where: { id: { in: toDelete } },
        });
      }
    }
    return { message: "Duplicate items removed" };
  }
}
