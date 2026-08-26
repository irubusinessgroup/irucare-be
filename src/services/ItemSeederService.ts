import { prisma } from "../utils/client";
import { readItemsFromExcel } from "../utils/excelImport";
import { EbmService } from "./EbmService";
import { roles } from "../utils/roles";

export class ItemSeederService {
  /**
   * Wait briefly for the company admin created by COMPANY_CREATED handler.
   */
  private static async waitForCompanyAdmin(companyId: string, attempts = 10) {
    for (let i = 0; i < attempts; i++) {
      const user = await prisma.user.findFirst({
        where: {
          company: { companyId },
          userRoles: { some: { name: roles.COMPANY_ADMIN } },
        },
      });
      if (user) return user;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return null;
  }

  public static async seedPharmacyItems(companyId: string) {
    try {
      const items = readItemsFromExcel();

      if (items.length === 0) {
        console.warn(
          `[ItemSeeder] No items found in Excel file for company ${companyId}`,
        );
        return;
      }

      const company = await prisma.company.findUnique({
        where: { id: companyId },
      });
      if (!company) {
        console.error(`[ItemSeeder] Company not found: ${companyId}`);
        return;
      }

      if (!company.TIN) {
        console.warn(
          `[ItemSeeder] Company ${companyId} has no TIN — skipping EBM item seed`,
        );
        return;
      }

      const user = await this.waitForCompanyAdmin(companyId);
      if (!user) {
        console.warn(
          `[ItemSeeder] No company admin yet for ${companyId} — skipping EBM item seed`,
        );
        return;
      }

      const ebmBranch =
        (await prisma.branch.findFirst({
          where: { companyId, isEbmInitialized: true },
          select: { id: true },
        })) ||
        (await prisma.branch.findFirst({
          where: { companyId },
          orderBy: { bhfId: "asc" },
          select: { id: true },
        }));
      const branchId = ebmBranch?.id ?? null;

      // Categories for this company
      const categories = [
        ...new Set(items.map((item) => item.Category)),
      ].filter(Boolean);

      const categoryMap = new Map<string, string>();

      for (const categoryName of categories) {
        let category = await prisma.itemCategories.findFirst({
          where: {
            companyId,
            categoryName,
          },
        });

        if (!category) {
          category = await prisma.itemCategories.create({
            data: {
              companyId,
              categoryName,
              description: `Imported category: ${categoryName}`,
            },
          });
        }
        categoryMap.set(categoryName, category.id);
      }

      const companySuffix = companyId.substring(0, 5);
      let seeded = 0;
      let skipped = 0;

      for (const item of items) {
        const categoryId = categoryMap.get(item.Category);
        if (!categoryId || !item.PRODUCT_CODE || !item.Description) {
          skipped++;
          continue;
        }

        const taxValue = item.Tax;
        const isTaxable =
          taxValue === "B" || (typeof taxValue === "number" && taxValue > 0);
        const taxCode =
          typeof taxValue === "string" ? taxValue : isTaxable ? "B" : "A";
        const taxRate =
          typeof taxValue === "number" ? taxValue : isTaxable ? 18 : 0;
        const insurancePrice = Number(item.Price || 0);

        const ebmItemPayload = {
          productCode: String(item.PRODUCT_CODE).trim(),
          itemFullName: String(item.Description).trim(),
          taxCode,
          insurancePrice,
        };

        // EBM registration first — skip local create on failure
        const ebmResponse = await EbmService.saveItemToEBM(
          ebmItemPayload,
          company,
          user,
          branchId,
        );

        if (ebmResponse.resultCd !== "000") {
          skipped++;
          console.warn(
            `[ItemSeeder] EBM rejected "${ebmItemPayload.itemFullName}" (${ebmItemPayload.productCode}): ${ebmResponse.resultMsg}`,
          );
          continue;
        }

        const existing = await prisma.items.findFirst({
          where: {
            companyId,
            productCode: ebmItemPayload.productCode,
          },
        });

        if (existing) {
          await prisma.items.update({
            where: { id: existing.id },
            data: {
              itemFullName: ebmItemPayload.itemFullName,
              categoryId,
              description: ebmItemPayload.itemFullName,
              minLevel: item["Min Level"] || 0,
              maxLevel: item["Max Level"] || 0,
              isTaxable,
              taxCode,
              taxRate,
              insurancePrice,
              ebmSynced: true,
            },
          });
        } else {
          await prisma.items.create({
            data: {
              itemCodeSku: `${ebmItemPayload.productCode}-${companySuffix}`,
              itemFullName: ebmItemPayload.itemFullName,
              categoryId,
              productCode: ebmItemPayload.productCode,
              companyId,
              branchId,
              minLevel: item["Min Level"] || 0,
              maxLevel: item["Max Level"] || 0,
              isTaxable,
              taxCode,
              taxRate,
              insurancePrice,
              description: ebmItemPayload.itemFullName,
              ebmSynced: true,
            },
          });
        }

        seeded++;
      }

      console.log(
        `[ItemSeeder] company=${companyId} seeded=${seeded} skipped=${skipped}`,
      );
    } catch (error) {
      console.error("Error seeding pharmacy items:", error);
    }
  }
}
