import { prisma } from "../utils/client";
import { readItemsFromExcel } from "../utils/excelImport";

export class ItemSeederService {
  public static async seedPharmacyItems(companyId: string) {
    try {
      // console.log(`Starting item seeding for company: ${companyId}`);
      const items = readItemsFromExcel();

      if (items.length === 0) {
        console.warn("No items found in Excel file to seed.");
        return;
      }

      // 1. Get unique categories from the Excel data
      const categories = [
        ...new Set(items.map((item) => item.Category)),
      ].filter(Boolean);

      // 2. Create categories for the new company
      const categoryMap = new Map<string, string>();

      for (const categoryName of categories) {
        let category = await prisma.itemCategories.findFirst({
          where: {
            companyId: companyId,
            categoryName: categoryName,
          },
        });

        if (!category) {
          category = await prisma.itemCategories.create({
            data: {
              companyId: companyId,
              categoryName: categoryName,
              description: `Imported category: ${categoryName}`,
            },
          });
        }
        categoryMap.set(categoryName, category.id);
      }

      // 3. Prepare items for insertion
      const companySuffix = companyId.substring(0, 5);

      const itemsToCreate = items
        .map((item) => {
          const categoryId = categoryMap.get(item.Category);
          if (!categoryId) {
            console.warn(`Category not found for item: ${item.Description}`);
            return null;
          }

          const taxValue = item.Tax;
          const isTaxable =
            taxValue === "B" || (typeof taxValue === "number" && taxValue > 0);
          const taxCode =
            typeof taxValue === "string" ? taxValue : isTaxable ? "B" : "A";
          const taxRate =
            typeof taxValue === "number" ? taxValue : isTaxable ? 18 : 0;

          return {
            itemCodeSku: `${item.PRODUCT_CODE}-${companySuffix}`,
            itemFullName: item.Description,
            categoryId: categoryId,
            productCode: String(item.PRODUCT_CODE),
            companyId: companyId,
            minLevel: item["Min Level"] || 0,
            maxLevel: item["Max Level"] || 0,
            isTaxable: isTaxable,
            taxCode: taxCode,
            taxRate: taxRate,
            description: item.Description,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      // 4. Insert items
      if (itemsToCreate.length > 0) {
        await prisma.items.createMany({
          data: itemsToCreate,
          skipDuplicates: true,
        });
        // console.log(
        //   `Successfully seeded ${itemsToCreate.length} items for company ${companyId}`
        // );
      }
    } catch (error) {
      console.error("Error seeding pharmacy items:", error);
    }
  }
}
