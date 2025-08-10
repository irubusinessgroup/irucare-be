import { prisma } from "../utils/client";
import AppError from "../utils/error";

export class ItemCodeGenerator {
  private static async generateSequentialNumber(
    categoryPrefix: string
  ): Promise<string> {
    try {
      const lastItem = await prisma.items.findFirst({
        where: { item_code_sku: { startsWith: categoryPrefix } },
        orderBy: { item_code_sku: "desc" },
      });

      let nextNumber = 1;
      if (lastItem) {
        const lastNumber = parseInt(
          lastItem.item_code_sku.substring(categoryPrefix.length)
        );
        if (!isNaN(lastNumber)) {
          nextNumber = lastNumber + 1;
        }
      }

      return nextNumber.toString().padStart(4, "0");
    } finally {
      prisma.$disconnect();
    }
  }

  static async generate(categoryId: string): Promise<string> {
    try {
      const category = await prisma.itemCategories.findUnique({
        where: { id: categoryId },
      });

      if (!category) {
        throw new AppError("Category not found", 404);
      }

      const categoryPrefix = category.category_name
        .substring(0, 3)
        .toUpperCase();
      const year = new Date().getFullYear().toString().substring(2);
      const prefix = `${categoryPrefix}${year}`;

      const sequentialNumber = await this.generateSequentialNumber(prefix);

      return `${prefix}${sequentialNumber}`;
    } finally {
      prisma.$disconnect();
    }
  }

  static generateBarcodeFromItemCode(itemCode: string): string {
    return `SKU${itemCode}`;
  }
}
