import { prisma } from "../utils/client";
import AppError from "../utils/error";
import {
  IPaged,
  IResponse,
  CategoryResponse,
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from "../utils/interfaces/common";
import { Paginations, QueryOptions } from "../utils/DBHelpers";

export class ItemCategoriesService {
  static async createCategory(
    data: CreateCategoryRequest,
    companyId: string,
    branchId?: string | null,
  ): Promise<IResponse<CategoryResponse>> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new AppError("Company not found", 404);
    }

    const existingCategory = await prisma.itemCategories.findFirst({
      where: {
        categoryName: data.categoryName,
        companyId: companyId,
      },
    });

    if (existingCategory) {
      throw new AppError("Category with this name already exists", 400);
    }

    const category = await prisma.itemCategories.create({
      data: {
        categoryName: data.categoryName,
        description: data.description,
        companyId: companyId,
        branchId: branchId,
      },
    });

    return {
      statusCode: 201,
      message: "Category created successfully",
      data: category,
    };
  }

  static async getCategoryById(
    categoryId: string,
    companyId: string,
    branchId?: string | null,
  ): Promise<IResponse<CategoryResponse>> {
    const where: any = {
      id: categoryId,
      companyId: companyId,
    };
    if (branchId) {
      where.branchId = branchId;
    }

    const category = await prisma.itemCategories.findFirst({
      where,
    });

    if (!category) {
      throw new AppError("Category not found", 404);
    }

    return {
      statusCode: 200,
      message: "Category fetched successfully",
      data: category,
    };
  }

  static async updateCategory(
    categoryId: string,
    data: UpdateCategoryRequest,
    companyId: string,
    branchId?: string | null,
  ): Promise<IResponse<CategoryResponse>> {
    const where: any = {
      id: categoryId,
      companyId: companyId,
    };
    if (branchId) {
      where.branchId = branchId;
    }

    const existingCategory = await prisma.itemCategories.findFirst({
      where,
    });

    if (!existingCategory) {
      throw new AppError("Category not found", 404);
    }

    if (
      data.categoryName &&
      data.categoryName !== existingCategory.categoryName
    ) {
      const nameExists = await prisma.itemCategories.findFirst({
        where: {
          categoryName: data.categoryName,
          companyId: companyId,
          NOT: { id: categoryId },
        },
      });

      if (nameExists) {
        throw new AppError("Category with this name already exists", 400);
      }
    }

    const updatedCategory = await prisma.itemCategories.update({
      where: { id: categoryId },
      data: {
        categoryName: data.categoryName,
        description: data.description,
      },
    });

    return {
      statusCode: 200,
      message: "Category updated successfully",
      data: updatedCategory,
    };
  }

  static async deleteCategory(
    categoryId: string,
    companyId: string,
    branchId?: string | null,
  ): Promise<IResponse<null>> {
    const category = await prisma.itemCategories.findFirst({
      where: {
        id: categoryId,
        companyId: companyId,
        ...(branchId ? { branchId } : {}),
      },
      include: { items: true },
    });

    if (!category) {
      throw new AppError("Category not found", 404);
    }

    if (category.items.length > 0) {
      throw new AppError("Cannot delete category with existing items", 400);
    }

    await prisma.itemCategories.delete({
      where: { id: categoryId },
    });

    return {
      statusCode: 200,
      message: "Category deleted successfully",
    };
  }

  static async getCategories(
    companyId: string,
    branchId?: string | null,
    searchq?: string,
    limit?: number,
    currentPage?: number,
  ): Promise<IPaged<CategoryResponse[]>> {
    try {
      const searchOptions = QueryOptions(
        ["category_name", "description"],
        searchq,
      );

      const pagination = Paginations(currentPage, limit);

      const categories = await prisma.itemCategories.findMany({
        where: {
          ...searchOptions,
          companyId: companyId,
          ...(branchId ? { branchId } : {}),
        },
        ...pagination,
        orderBy: { categoryName: "asc" },
      });

      const totalItems = await prisma.itemCategories.count({
        where: {
          ...searchOptions,
          companyId: companyId,
          ...(branchId ? { branchId } : {}),
        },
      });

      // const data = categories.map((category) =>
      //   this.mapToCategoryResponse(category),
      // );

      return {
        statusCode: 200,
        message: "Categories fetched successfully",
        data: categories,
        totalItems,
        currentPage: currentPage || 1,
        itemsPerPage: limit || 10,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }
}
