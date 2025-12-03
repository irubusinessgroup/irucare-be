import { prisma } from "../utils/client";
import * as xlsx from "xlsx";
import * as path from "path";
import * as crypto from "crypto";
import * as fs from "fs";

const BATCH_SIZE = 500;
const IS_DRY_RUN = process.argv.includes("--dry-run");
const LOG_FILE = path.join(process.cwd(), "import_errors.log");

// Clear log file on start
if (fs.existsSync(LOG_FILE)) {
  fs.writeFileSync(LOG_FILE, "");
}

function log(message: string, type: "INFO" | "ERROR" | "WARN" = "INFO") {
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] [${type}] ${message}`;

  if (type === "ERROR" || type === "WARN") {
    console.error(logMsg);
    fs.appendFileSync(LOG_FILE, logMsg + "\n");
  } else {
    console.log(logMsg);
  }
}

interface ExcelRow {
  productCode: string;
  itemFullName: string;
  categoryName: string;
  minLevel: number;
  maxLevel: number;
  taxRate: number;
  isTaxable: boolean;
  taxCode: "A" | "B";
  description: string;
}

async function importPharmacyMockData() {
  log(`Starting Pharmacy Item Import Script... (Dry Run: ${IS_DRY_RUN})`);

  try {
    // 1. Read Excel file
    const filePath = path.join(
      process.cwd(),
      "src/resources/initial items.xlsx",
    );
    log(`Reading Excel file from: ${filePath}`);

    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Read as array of arrays to find the header row
    const allRows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1 });

    let headerRowIndex = -1;
    let headers: string[] = [];

    // Look for a row that contains "Product Code" or "Description"
    for (let i = 0; i < Math.min(20, allRows.length); i++) {
      const row = allRows[i];
      if (!Array.isArray(row)) continue;

      const rowStr = row.map((c) => String(c).toLowerCase().trim());
      if (
        rowStr.some(
          (c) =>
            c.includes("product code") ||
            c.includes("product_code") ||
            c.includes("code"),
        )
      ) {
        headerRowIndex = i;
        headers = row.map((c) => String(c).trim());
        log(`Found header row at index ${i}: ${JSON.stringify(headers)}`);
        break;
      }
    }

    if (headerRowIndex === -1) {
      log("Could not find a valid header row. Exiting.", "ERROR");
      return;
    }

    // Helper to get value case-insensitively and from multiple aliases
    const getValue = (row: any, aliases: string[]): any => {
      const rowKeys = Object.keys(row);
      for (const alias of aliases) {
        const exactMatch = row[alias];
        if (exactMatch !== undefined) return exactMatch;

        // Case-insensitive check
        const key = rowKeys.find(
          (k) => k.toLowerCase().trim() === alias.toLowerCase().trim(),
        );
        if (key) return row[key];
      }
      return undefined;
    };

    // Parse and Normalize Data
    const dataRows = allRows.slice(headerRowIndex + 1);
    const parsedRows: ExcelRow[] = [];
    // let invalidRows = 0;

    dataRows.forEach((rowArray, idx) => {
      // Convert array row to object based on headers
      const rowObj: any = {};
      headers.forEach((header, hIdx) => {
        if (rowArray[hIdx] !== undefined) {
          rowObj[header] = rowArray[hIdx];
        }
      });

      // Extract fields
      const productCodeVal = getValue(rowObj, [
        "PRODUCT_CODE",
        "Product Code",
        "product_code",
        "Code",
        "Drug Code",
      ]);
      const productCode = productCodeVal
        ? String(productCodeVal).trim()
        : undefined;

      if (!productCode) {
        // Skip empty rows silently or warn if it looks like data
        return;
      }

      const descriptionVal = getValue(rowObj, [
        "Description",
        "Item Name",
        "Name",
        "Designation",
        "Item Full Name",
      ]);
      const itemFullName = descriptionVal
        ? String(descriptionVal).trim()
        : `Item ${productCode}`;

      const categoryVal = getValue(rowObj, ["Category", "Category Name"]);
      const categoryName = categoryVal ? String(categoryVal).trim() : "General";

      const minLevelVal = getValue(rowObj, [
        "Min Level",
        "Min",
        "Minimum Level",
      ]);
      const minLevel = Number(minLevelVal) || 0;

      const maxLevelVal = getValue(rowObj, [
        "Max Level",
        "Max",
        "Maximum Level",
      ]);
      const maxLevel = Number(maxLevelVal) || 0;

      const taxVal = getValue(rowObj, ["Tax", "Tax Rate", "Tax Code"]);
      const taxValue = Number(taxVal);
      const isTaxable = !isNaN(taxValue) && taxValue > 0;
      const taxRate = isTaxable ? taxValue : 0;
      const taxCode = isTaxable ? "B" : "A";

      parsedRows.push({
        productCode,
        itemFullName,
        categoryName,
        minLevel,
        maxLevel,
        taxRate,
        isTaxable,
        taxCode,
        description: itemFullName,
      });
    });

    log(`Parsed ${parsedRows.length} valid rows from Excel.`);

    // 2. Query all PHARMACY companies
    const pharmacyCompanies = await prisma.company.findMany({
      where: {
        industry: "PHARMACY",
      },
    });

    log(`Found ${pharmacyCompanies.length} PHARMACY companies.`);

    if (pharmacyCompanies.length === 0) {
      log("No pharmacy companies found. Exiting.");
      return;
    }

    // 3. Process each company
    for (const company of pharmacyCompanies) {
      log(`\nProcessing company: ${company.name} (${company.id})`);

      const companyIdHash = crypto
        .createHash("md5")
        .update(company.id)
        .digest("hex")
        .substring(0, 6);

      // --- Category Handling ---
      // 1. Get all unique categories from Excel
      const uniqueCategories = Array.from(
        new Set(parsedRows.map((r) => r.categoryName.toUpperCase())),
      );

      // 2. Get existing categories
      const existingCategories = await prisma.itemCategories.findMany({
        where: { companyId: company.id },
      });
      const existingCategoryNames = new Set(
        existingCategories.map((c) => c.categoryName.toUpperCase().trim()),
      );

      // 3. Find missing
      const missingCategories = uniqueCategories.filter(
        (c) => !existingCategoryNames.has(c),
      );

      if (missingCategories.length > 0) {
        log(`Found ${missingCategories.length} new categories to create.`);
        if (!IS_DRY_RUN) {
          const categoriesToCreate = missingCategories.map((upperName) => {
            // Find original casing
            const originalName =
              parsedRows.find((r) => r.categoryName.toUpperCase() === upperName)
                ?.categoryName || upperName;
            return {
              categoryName: originalName,
              companyId: company.id,
            };
          });

          await prisma.itemCategories.createMany({
            data: categoriesToCreate,
            skipDuplicates: true,
          });
          log(`Created ${missingCategories.length} categories.`);
        } else {
          log(`[DRY RUN] Would create ${missingCategories.length} categories.`);
        }
      }

      // 4. Re-fetch all categories to build map
      const allCategories = await prisma.itemCategories.findMany({
        where: { companyId: company.id },
      });
      const categoryMap = new Map<string, string>();
      allCategories.forEach((c) =>
        categoryMap.set(c.categoryName.toUpperCase().trim(), c.id),
      );

      // --- Item Handling ---
      // 1. Get existing items to skip duplicates
      const existingItems = await prisma.items.findMany({
        where: { companyId: company.id },
        select: { productCode: true },
      });
      const existingProductCodes = new Set(
        existingItems.map((i) => i.productCode),
      );

      // 2. Filter rows
      const newItems: any[] = [];
      let skippedCount = 0;

      for (const row of parsedRows) {
        if (row.productCode && existingProductCodes.has(row.productCode)) {
          skippedCount++;
          continue;
        }

        // Resolve Category ID
        let categoryId = categoryMap.get(row.categoryName.toUpperCase());

        if (!categoryId) {
          if (IS_DRY_RUN) {
            categoryId = "dry-run-category-id";
          } else {
            // Should not happen if logic above is correct, unless race condition or casing weirdness
            log(
              `WARN: Category ID not found for '${row.categoryName}' even after creation step.`,
              "WARN",
            );
            continue;
          }
        }

        const itemCodeSku = `${row.productCode}-${companyIdHash}`;

        newItems.push({
          itemCodeSku,
          itemFullName: row.itemFullName,
          productCode: row.productCode,
          categoryId,
          companyId: company.id,
          minLevel: row.minLevel,
          maxLevel: row.maxLevel,
          taxRate: row.taxRate,
          isTaxable: row.isTaxable,
          taxCode: row.taxCode,
          description: row.description,
        });
      }

      log(
        `Prepared ${newItems.length} items for creation. Skipped ${skippedCount} duplicates.`,
      );

      // 3. Bulk Insert
      if (newItems.length > 0) {
        if (!IS_DRY_RUN) {
          // Process in batches
          let totalCreated = 0;
          for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
            const batch = newItems.slice(i, i + BATCH_SIZE);
            try {
              await prisma.items.createMany({
                data: batch,
                skipDuplicates: true,
              });
              totalCreated += batch.length;
              log(
                `Processed batch ${Math.min(i + BATCH_SIZE, newItems.length)}/${newItems.length}`,
              );
            } catch (err) {
              log(
                `Error inserting batch ${i} to ${i + BATCH_SIZE}: ${err}`,
                "ERROR",
              );
            }
          }
          log(
            `Successfully created ${totalCreated} items for company ${company.name}.`,
          );
        } else {
          log(`[DRY RUN] Would create ${newItems.length} items.`);
        }
      } else {
        log("No new items to create.");
      }
    }
  } catch (error) {
    log(`Fatal error in import script: ${error}`, "ERROR");
  } finally {
    await prisma.$disconnect();
    log("\nPrisma disconnected. Script finished.");
  }
}

importPharmacyMockData();
