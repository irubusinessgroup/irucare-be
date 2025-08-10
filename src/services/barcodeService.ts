import { prisma } from "../utils/client";

export class BarcodeService {
  private static async getItemByBarcode(barcode: string): Promise<any> {
    try {
      const item = await prisma.items.findFirst({
        where: { barcode_qr_code: barcode },
        include: {
          category: true,
          uom: true,
          temp: true,
        },
      });

      return item;
    } finally {
      await prisma.$disconnect();
    }
  }

  static async lookupItemByBarcode(barcode: string): Promise<{
    item_code_sku?: string;
    item_full_name?: string;
    category_id?: string;
    category_name?: string;
    description?: string;
    brand_manufacturer?: string;
    uom_id?: string;
    found: boolean;
  }> {
    const item = await this.getItemByBarcode(barcode);

    if (!item) {
      return { found: false };
    }

    return {
      found: true,
      item_code_sku: item.item_code_sku,
      item_full_name: item.item_full_name,
      category_id: item.category_id,
      category_name: item.category.category_name,
      description: item.description,
      brand_manufacturer: item.brand_manufacturer,
      uom_id: item.uom_id,
    };
  }
}
