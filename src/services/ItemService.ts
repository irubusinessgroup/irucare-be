import { prisma } from "../utils/client";
import AppError from "../utils/error";
import {
  CreateItemDto,
  ImportItemRow,
  UpdateItemDto,
  ValidationError,
} from "../utils/interfaces/common";
import { ItemCodeGenerator } from "../utils/itemCodeGenerator";
import { EbmService } from "./EbmService";
import type { Request } from "express";
import * as XLSX from "xlsx";
import * as path from "path";

export class ItemService {
  // Normalize/coerce tax payload based on README_BACKEND_TAX.md rules
  private static normalizeTaxFields(input: unknown): {
    isTaxable: boolean;
    taxCode: "A" | "B" | "C" | "D";
    taxRate: number;
  } {
    const payload = (input || {}) as {
      isTaxable?: boolean | string;
      taxCode?: "A" | "B" | "C" | "D" | string;
      taxRate?: number | string;
    };

    // Coerce boolean-like strings
    const requestedIsTaxable: boolean | undefined =
      typeof payload.isTaxable === "string"
        ? payload.isTaxable.toLowerCase() === "true"
        : payload.isTaxable;

    if (requestedIsTaxable === true) {
      return { isTaxable: true, taxCode: "B", taxRate: 18.0 };
    }
    if (requestedIsTaxable === false) {
      return { isTaxable: false, taxCode: "A", taxRate: 0.0 };
    }

    // Fallbacks if only taxCode/taxRate provided (ensure consistency)
    const normalizedCode = (payload.taxCode || "").toString().toUpperCase();
    if (normalizedCode === "B") {
      return { isTaxable: true, taxCode: "B", taxRate: 18.0 };
    }
    if (normalizedCode === "C") {
      return { isTaxable: true, taxCode: "C", taxRate: 0.0 };
    }
    if (normalizedCode === "D") {
      return { isTaxable: true, taxCode: "D", taxRate: 0.0 };
    }
    // Default non-taxable
    return { isTaxable: false, taxCode: "A", taxRate: 0.0 };
  }
  private static getRequiredColumnsForIndustry(industry?: string): string[] {
    const normalized = (industry || "").toUpperCase();
    if (normalized === "PHARMACY") {
      // PHARMACY: drug_code (maps to productCode), designation (maps to itemFullName)
      return [
        "itemFullName",
        "productCode",
        "categoryName",
        "minLevel",
        "maxLevel",
      ];
    }
    // STOCK_AND_LOGISTICS or SBMS: productCode, itemFullName
    return [
      "itemFullName",
      "productCode",
      "categoryName",
      "minLevel",
      "maxLevel",
    ];
  }

  private static readonly COLUMN_MAPPINGS: Record<string, string> = {
    "item name": "itemFullName",
    "item full name": "itemFullName",
    name: "itemFullName",
    category: "categoryName",
    "category name": "categoryName",
    "product code": "productCode",
    productcode: "productCode",
    product_code: "productCode",
    description: "itemFullName",
    preparations: "itemFullName",
    "min level": "minLevel",
    "minimum level": "minLevel",
    "max level": "maxLevel",
    "maximum level": "maxLevel",
    designation: "itemFullName",
    drug_code: "productCode",
    // tax related synonym headers (single column preferred: tax → taxCode)
    taxable: "isTaxable",
    istaxable: "isTaxable",
    "is taxable": "isTaxable",
    taxcode: "taxCode",
    "tax code": "taxCode",
    tax: "taxCode",
    rate: "taxRate",
    "tax rate": "taxRate",
    insurance_price: "insurancePrice",
  };

  public static async importItems(
    file: Express.Multer.File,
    companyId: string,
    branchId?: string | null,
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
          } else if (
            headerValue === "tax" ||
            headerValue.includes("tax code")
          ) {
            headerMapping[key] = "taxCode"; // single tax column preferred
          } else if (
            headerValue === "insurance price" ||
            headerValue.includes("insurance_price")
          ) {
            headerMapping[key] = "insurancePrice";
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
      }

      if (dataRows.length === 0) {
        throw new AppError("Excel file has no data rows", 400);
      }

      // Normalize column names and map data
      let normalizedData = this.normalizeData(dataRows);

      // Remove duplicates by productCode
      normalizedData = this.removeDuplicates(normalizedData);

      // Validate data
      const { validItems, errors } = await this.validateItems(
        normalizedData,
        companyId,
        branchId,
      );

      if (errors.length > 0) {
        console.error("Sample errors:", errors.slice(0, 5));
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
        branchId,
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

      return normalizedRow as unknown as ImportItemRow;
    });
  }

  private static async validateItems(
    data: ImportItemRow[],
    companyId: string,
    branchId?: string | null,
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

    const requiredColumns = this.getRequiredColumnsForIndustry(
      company.industry || undefined,
    );

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 2; // +2 because Excel is 1-indexed and has header row
      const rowErrors: ValidationError[] = [];

      // Check required fields depending on industry
      requiredColumns.forEach((field) => {
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

      // Validate insurancePrice
      if (row.insurancePrice !== undefined && row.insurancePrice !== null) {
        const insurancePriceNum = Number(row.insurancePrice);
        if (isNaN(insurancePriceNum) || insurancePriceNum < 0) {
          rowErrors.push({
            row: rowNumber,
            field: "insurancePrice",
            message: "insurancePrice must be a positive number",
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
    branchId?: string | null,
  ) {
    const importedItems = [];
    const importErrors: ValidationError[] = [];

    // Get company and admin user for EBM registration
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    const user = await prisma.user.findFirst({
      where: {
        company: { companyId },
        userRoles: {
          some: { name: "COMPANY_ADMIN" },
        },
      },
    });

    // Get all categories upfront
    const categories = await prisma.itemCategories.findMany({
      where: { companyId, ...(branchId ? { branchId } : {}) },
    });
    const categoryMap = new Map(
      categories.map((c) => [c.categoryName.toLowerCase().trim(), c]),
    );
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const rowNumber = i + 2; // Approximate row number
      try {
        const normalizedCategoryName = item.categoryName.toLowerCase().trim();
        let category = categoryMap.get(normalizedCategoryName);
        // Auto-create category if it does not exist for this company
        if (!category) {
          category = await prisma.itemCategories.create({
            data: {
              categoryName: item.categoryName.trim(),
              companyId,
              branchId,
            },
          });
          categoryMap.set(normalizedCategoryName, category);
        }

        // --- EBM Registration Prerequisite ---
        if (company && user) {
          const ebmResponse = await EbmService.saveItemToEBM(
            item,
            company,
            user,
            branchId,
          );

          if (ebmResponse.resultCd !== "000") {
            importErrors.push({
              row: rowNumber,
              field: "EBM",
              message: `EBM Registration Failed: ${ebmResponse.resultMsg}`,
            });
            continue; // Skip this item locally as per 'Partial with Report' strategy
          }
        }

        // Check for existing item by productCode
        let existingItem = null;
        if (item.productCode) {
          existingItem = await prisma.items.findFirst({
            where: {
              productCode: String(item.productCode).trim(),
              companyId,
              ...(branchId ? { branchId } : {}),
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
              // Normalize and apply tax fields if present
              ...ItemService.normalizeTaxFields(item as unknown),
              insurancePrice: item.insurancePrice,
              companyId,
              ebmSynced: true,
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
              // Normalize and apply tax fields if present
              ...ItemService.normalizeTaxFields(item as unknown),
              insurancePrice: item.insurancePrice,
              companyId,
              branchId,
              ebmSynced: true,
            },
            include: {
              category: true,
              company: true,
            },
          });
          importedItems.push(createdItem);
        }
      } catch (error: any) {
        console.error(
          `Failed to create/update item: ${item.itemFullName}`,
          error,
        );
        importErrors.push({
          row: rowNumber,
          field: "System",
          message: error.message || "Unknown error during creation",
        });
      }
    }
    // Store errors for the caller to handle if needed (could be improved by returning them)
    // For now, we follow the pattern in importItems where importedItems is returned.
    return importedItems;
  }

  public static async downloadTemplate(req?: Request) {
    const companyId = req?.user?.company?.companyId;
    let industry: string | undefined;
    if (companyId) {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
      });
      industry = company?.industry || undefined;
    }
    const normalized = (industry || "").toUpperCase();
    const isPharmacy = normalized === "PHARMACY";

    // Read sample data from src/resources/initial items.xlsx
    let sampleRows: any[] = [];
    try {
      const filePath = path.join(
        process.cwd(),
        "src/resources/initial items.xlsx",
      );
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
      }) as any[][];

      // Find header row
      let headerRowIndex = -1;
      const colMap: Record<string, number> = {};

      for (let i = 0; i < Math.min(20, jsonData.length); i++) {
        const row = jsonData[i];
        if (Array.isArray(row)) {
          const rowStr = row.map((c) => String(c).toLowerCase().trim());
          if (
            rowStr.includes("product_code") ||
            rowStr.includes("product code")
          ) {
            headerRowIndex = i;
            // Build map
            row.forEach((cell, idx) => {
              const val = String(cell).toLowerCase().trim();
              colMap[val] = idx;
            });
            break;
          }
        }
      }

      if (headerRowIndex !== -1) {
        const dataRows = jsonData.slice(headerRowIndex + 1, headerRowIndex + 6); // Take 5 rows

        sampleRows = dataRows.map((row) => {
          const getVal = (keys: string[]) => {
            for (const key of keys) {
              if (colMap[key] !== undefined) {
                return row[colMap[key]];
              }
            }
            return undefined;
          };

          return {
            "Product Code": getVal([
              "product_code",
              "product code",
              "productcode",
            ]),
            Description: getVal([
              "description",
              "preparations",
              "item name",
              "item_name",
              "designation",
            ]),
            Category: getVal(["category", "category name"]),
            "Min Level": Number(
              getVal(["min level", "min_level", "minimum level"]) || 10,
            ),
            "Max Level": Number(
              getVal(["max level", "max_level", "maximum level"]) || 100,
            ),
            Tax: getVal(["tax", "tax code", "taxcode"]) || "A",
            "Insurance Price": Number(
              getVal(["insurance price", "insurance_price"]) || 0,
            ),
          };
        });
      }
    } catch (error) {
      console.error("Error reading initial items.xlsx for template:", error);
      // Fallback if file read fails
    }

    // If we have sample rows, use them, otherwise fallback to hardcoded
    let templateData: any[] = [];

    if (sampleRows.length > 0) {
      templateData = sampleRows;
    } else {
      // Fallback template
      templateData = isPharmacy
        ? [
            {
              "Product Code": "PRC-500",
              Description: "Paracetamol 500mg tablets",
              Category: "Drugs",
              "Min Level": 10,
              "Max Level": 100,
              Tax: "B",
              "Insurance Price": 0,
            },
          ]
        : [
            {
              "Product Code": "PROD-001",
              "Item Name": "Sample Item 1",
              Category: "General",
              "Min Level": 10,
              "Max Level": 100,
              Tax: "A",
            },
          ];
    }

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Items");

    // Auto-width (approximate)
    const colWidths = Object.keys(templateData[0] || {}).map((key) => ({
      wch: Math.max(key.length + 5, 15),
    }));
    worksheet["!cols"] = colWidths;

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    return buffer;
  }

  public static async createItem(
    data: CreateItemDto,
    companyId: string,
    branchId?: string | null,
  ) {
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
    const tax = ItemService.normalizeTaxFields(data as unknown);

    // --- EBM Registration Prerequisite ---
    const user = await prisma.user.findFirst({
      where: {
        company: { companyId },
        userRoles: {
          some: { name: "COMPANY_ADMIN" },
        },
      },
    });

    if (company && user) {
      const ebmResponse = await EbmService.saveItemToEBM(
        data,
        company,
        user,
        branchId,
      );

      if (ebmResponse.resultCd !== "000") {
        throw new AppError(
          `EBM Registration Failed: ${ebmResponse.resultMsg}`,
          400,
        );
      }
    }

    const item = await prisma.items.create({
      data: {
        ...data,
        isTaxable: tax.isTaxable,
        taxCode: tax.taxCode,
        taxRate: tax.taxRate,
        insurancePrice: data.insurancePrice,
        itemCodeSku: itemCode,
        companyId: companyId,
        branchId: branchId,
        ebmSynced: true,
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

  public static async generateProductCode(
    companyId: string,
  ): Promise<{ productCode: string }> {
    let isUnique = false;
    let productCode = "";

    // Retry loop to ensure uniqueness
    while (!isUnique) {
      // Generate random 8-digit number string
      const randomNum = Math.floor(Math.random() * 100000000)
        .toString()
        .padStart(8, "0");
      productCode = `PROD-${randomNum}`;

      // Check against database
      const existing = await prisma.items.findFirst({
        where: {
          companyId,
          productCode: productCode,
        },
      });

      if (!existing) {
        isUnique = true;
      }
    }

    return { productCode };
  }

  public static async generateProductCodeWithClassifications(
    companyId: string,
    countryCd: string,
    itemTypeCd: string,
    packingUnitCd: string,
    quantityUnitCd: string,
  ): Promise<{ productCode: string }> {
    // Ensure EBM codes are synced first (lazy loading)
    const { EbmCodeSyncService } = await import("./EbmCodeSyncService");
    await EbmCodeSyncService.ensureCodesSynced(companyId);

    // Build prefix from classifications (8 chars total max)
    const prefix = `${countryCd}${itemTypeCd}${packingUnitCd}${quantityUnitCd}`;

    // Get or create sequence record
    let sequence = await prisma.productCodeSequence.findUnique({
      where: { prefix },
    });

    if (!sequence) {
      sequence = await prisma.productCodeSequence.create({
        data: { prefix, lastSeq: 0 },
      });
    }

    // Increment sequence
    const nextSeq = sequence.lastSeq + 1;
    const seqStr = nextSeq.toString().padStart(7, "0");
    const productCode = `${prefix}${seqStr}`;

    // Update sequence
    await prisma.productCodeSequence.update({
      where: { prefix },
      data: { lastSeq: nextSeq },
    });

    // Verify uniqueness (should be guaranteed by sequence, but double-check)
    const existing = await prisma.items.findFirst({
      where: { companyId, productCode },
    });

    if (existing) {
      // Recursively retry if collision detected (very unlikely)
      return this.generateProductCodeWithClassifications(
        companyId,
        countryCd,
        itemTypeCd,
        packingUnitCd,
        quantityUnitCd,
      );
    }

    return { productCode };
  }


  public static async getItem(id: string, branchId?: string | null) {
    const where: any = { id };
    if (branchId) {
      where.branchId = branchId;
    }
    const item = await prisma.items.findUnique({
      where,
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
    branchId?: string | null,
  ) {
    const where: any = { id, companyId: companyId };
    if (branchId) {
      where.branchId = branchId;
    }
    const item = await prisma.items.findUnique({
      where,
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

    const tax = ItemService.normalizeTaxFields(data as unknown);
    const updatedItem = await prisma.items.update({
      where: { id },
      data: {
        ...data,
        isTaxable: tax.isTaxable,
        taxCode: tax.taxCode,
        taxRate: tax.taxRate,
        insurancePrice: data.insurancePrice,
      },
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

  public static async deleteItem(
    id: string,
    companyId: string,
    branchId?: string | null,
  ) {
    const where: any = { id, companyId: companyId };
    if (branchId) {
      where.branchId = branchId;
    }
    const item = await prisma.items.findUnique({
      where,
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
    branchId?: string | null,
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
            // { brandManufacturer: { contains: searchq } },
          ],
        }
      : {};

    const where: any = {
      ...queryOptions,
      companyId,
    };

    if (branchId) {
      where.branchId = branchId;
    }

    const skip = (pageNum - 1) * limitNum;
    const take = limitNum;

    const items = await prisma.items.findMany({
      where,
      include: {
        category: true,
        company: true,
        stockReceipts: {
          include: {
            supplier: true,
            stocks: {
              where: {
                status: { in: ["AVAILABLE", "RESERVED", "IN_TRANSIT"] },
              },
              select: { id: true, status: true },
            },
          },
        },
      },
      skip,
      take,
      orderBy: { createdAt: "desc" },
    });

    const totalItems = await prisma.items.count({ where });

    // Update isStockItem based on currentStock
    const itemsWithStock = await Promise.all(
      items.map(async (item) => {
        const currentStock = item.stockReceipts.reduce((sum, receipt) => {
          return sum + receipt.stocks.length;
        }, 0);

        // Update isStockItem based on stock presence
        const shouldBeStockItem = currentStock > 0;
        if (item.isStockItem !== shouldBeStockItem) {
          await prisma.items.update({
            where: { id: item.id },
            data: { isStockItem: shouldBeStockItem },
          });
        }

        return { ...item, currentStock } as unknown as typeof item & {
          currentStock: number;
        };
      })
    );

    return {
      data: itemsWithStock,
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
    // Group by [productCode, branchId]
    const groupMap = new Map<string, Array<(typeof duplicates)[0]>>();
    for (const item of duplicates) {
      const code = String(item.productCode).trim();
      const bid = item.branchId || "COMPANY";
      const key = `${code}|${bid}`;
      if (!code) continue;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(item);
    }
    // For each group, delete all but the first
    for (const items of groupMap.values()) {
      if (items.length > 1) {
        const toDelete = items.slice(1).map((i) => i.id);
        await prisma.items.deleteMany({
          where: { id: { in: toDelete } },
        });
      }
    }
    return { message: "Duplicate items removed" };
  }

  /**
   * Get medications filtered by medication category
   */
  public static async getMedications(
    req: Request,
    companyId: string,
    searchq?: string,
    limit?: number,
    page?: number,
    branchId?: string | null,
  ) {
    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 15;
    const skip = (pageNum - 1) * limitNum;

    // Find medication category (could be named "Medication", "Drug", "Pharmacy", etc.)
    const medicationCategories = await prisma.itemCategories.findMany({
      where: {
        companyId,
        OR: [
          { categoryName: { contains: "Medication", mode: "insensitive" } },
          { categoryName: { contains: "Drug", mode: "insensitive" } },
          { categoryName: { contains: "Pharmacy", mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });

    const categoryIds = medicationCategories.map((c) => c.id);

    const where: Record<string, unknown> = {
      companyId,
      branchId: branchId ?? null,
      deletedAt: null,
    };

    if (categoryIds.length > 0) {
      where.categoryId = { in: categoryIds };
    }

    if (searchq) {
      where.OR = [
        { itemFullName: { contains: searchq, mode: "insensitive" } },
        { description: { contains: searchq, mode: "insensitive" } },
        { productCode: { contains: searchq, mode: "insensitive" } },
        { itemCodeSku: { contains: searchq, mode: "insensitive" } },
      ];
    }

    const [data, totalItems] = await Promise.all([
      prisma.items.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { itemFullName: "asc" },
        include: {
          category: {
            select: {
              id: true,
              categoryName: true,
            },
          },
        },
      }),
      prisma.items.count({ where }),
    ]);

    return {
      data,
      totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      statusCode: 200,
      message: "Medications retrieved successfully",
    };
  }

  public static async searchItems(
    companyId: string,
    branchId?: string | null,
    searchQuery?: string,
    limit?: number,
  ) {
    const limitNum = Number(limit) > 0 ? Number(limit) : 50; 

    const where: any = {
      companyId,
    };

    if (branchId) {
      where.branchId = branchId;
    }

    // If there's a search query, filter by it
    if (searchQuery && searchQuery.trim() !== "") {
      where.OR = [
        { itemCodeSku: { contains: searchQuery, mode: "insensitive" } },
        { itemFullName: { contains: searchQuery, mode: "insensitive" } },
        { description: { contains: searchQuery, mode: "insensitive" } },
      ];
    }

    const items = await prisma.items.findMany({
      where,
      include: {
        category: true,
        company: true,
        stockReceipts: {
          include: {
            supplier: true,
            stocks: {
              where: {
                status: { in: ["AVAILABLE", "RESERVED", "IN_TRANSIT"] },
              },
              select: { id: true, status: true },
            },
          },
        },
      },
      take: limitNum,
      orderBy: { itemFullName: "asc" },
    });

    const data = items.map((item) => {
      const currentStock = item.stockReceipts.reduce((sum, receipt) => {
        return sum + receipt.stocks.length;
      }, 0);
      return {
        id: item.id,
        itemFullName: item.itemFullName,
        itemCodeSku: item.itemCodeSku,
        isTaxable: item.isTaxable,
        taxRate: item.taxRate,
        isStockItem: item.isStockItem,
        currentStock,
      };
    });

    return {
      data,
      message: "Items retrieved successfully",
    };
  }
}
