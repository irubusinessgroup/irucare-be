import { BaseService } from "./Service";
import { prisma } from "../utils/client";
import {
  CreateProductDto,
  IResponse,
  TProduct,
  ProductCategory,
  IPaged,
} from "../utils/interfaces/common";
import AppError from "../utils/error";
import { QueryOptions, Paginations } from "../utils/DBHelpers";

export class ProductService extends BaseService {
  public static async createProduct(
    productData: CreateProductDto,
  ): Promise<IResponse<TProduct>> {
    const product = await prisma.product.create({
      data: {
        ...productData,
        category: productData.category as ProductCategory,
        galleryImages: productData.galleryImages,
      },
    });
    return {
      statusCode: 201,
      message: "Product created successfully",
      data: product,
    };
  }

  public static async updateProduct(
    id: string,
    productData: Partial<CreateProductDto>,
  ): Promise<IResponse<TProduct>> {
    const product = await prisma.product.update({
      where: { id },
      data: {
        ...productData,
        category: productData.category
          ? (productData.category as ProductCategory)
          : undefined,
      },
    });
    return {
      statusCode: 200,
      message: "Product updated successfully",
      data: product,
    };
  }

  public static async deleteProduct(id: string): Promise<IResponse<null>> {
    await prisma.$transaction(async (prisma) => {
      await prisma.orderItem.deleteMany({ where: { productId: id } });
      await prisma.product.delete({ where: { id } });
    });

    return {
      statusCode: 200,
      message: "Product and related order items deleted successfully",
      data: null,
    };
  }

  public static async getProduct(id: string): Promise<IResponse<TProduct>> {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) throw new AppError("Product not found", 404);
    return {
      statusCode: 200,
      message: "Product fetched successfully",
      data: product,
    };
  }

  public static async getAllProducts(
    searchq?: string,
    limit?: number,
    currentPage?: number,
  ): Promise<IPaged<TProduct[]>> {
    const queryOptions = QueryOptions(
      ["name", "description", "teaser", "brand", "model"],
      searchq,
    );

    const pagination = Paginations(currentPage, limit);
    const products = await prisma.product.findMany({
      where: queryOptions,
      ...pagination,
      orderBy: {
        createdAt: "desc",
      },
    });

    const totalItems = await prisma.product.count({
      where: queryOptions,
    });

    return {
      statusCode: 200,
      message: "Products fetched successfully",
      data: products,
      totalItems,
      currentPage: currentPage || 1,
      itemsPerPage: limit || 15,
    };
  }

  public static async getFeaturedProducts(): Promise<IPaged<TProduct[]>> {
    const products = await prisma.product.findMany({
      where: { isFeatured: true },
      orderBy: {
        createdAt: "desc",
      },
    });

    const totalItems = await prisma.product.count({
      where: { isFeatured: true },
    });

    return {
      statusCode: 200,
      message: "Featured products fetched successfully",
      data: products,
      totalItems,
      currentPage: 1,
      itemsPerPage: totalItems,
    };
  }
}
