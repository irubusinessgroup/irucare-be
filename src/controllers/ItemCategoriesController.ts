import {
  Body,
  Delete,
  Get,
  Path,
  Post,
  Put,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";
import { Request as ExpressRequest } from "express";
import { ItemCategoriesService } from "../services/ItemCategoriesService";
import {
  IPaged,
  IResponse,
  CategoryResponse,
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from "../utils/interfaces/common";

@Tags("Item Categories")
@Route("/api/item-categories")
export class ItemCategoriesController {
  @Post("/")
  @Security("jwt")
  public async createCategory(
    @Body() data: CreateCategoryRequest,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<CategoryResponse>> {
    const companyId = req.user?.company?.companyId as string;
    return ItemCategoriesService.createCategory(data, companyId);
  }

  @Get("/{categoryId}")
  @Security("jwt")
  public async getCategoryById(
    @Path() categoryId: string,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<CategoryResponse>> {
    const companyId = req.user?.company?.companyId as string;
    return ItemCategoriesService.getCategoryById(categoryId, companyId);
  }

  @Put("/{categoryId}")
  @Security("jwt")
  public async updateCategory(
    @Path() categoryId: string,
    @Body() data: UpdateCategoryRequest,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<CategoryResponse>> {
    const companyId = req.user?.company?.companyId as string;
    return ItemCategoriesService.updateCategory(categoryId, data, companyId);
  }

  @Delete("/{categoryId}")
  @Security("jwt")
  public async deleteCategory(
    @Path() categoryId: string,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<null>> {
    const companyId = req.user?.company?.companyId as string;
    return ItemCategoriesService.deleteCategory(categoryId, companyId);
  }

  @Get("/")
  @Security("jwt")
  public async getCategories(
    @Request() req: ExpressRequest,
  ): Promise<IPaged<CategoryResponse[]>> {
    const { searchq, limit, page } = req.query as Record<string, string>;
    const currentPage = page ? parseInt(page as string, 10) : undefined;
    const parsedLimit = limit ? parseInt(limit as string, 10) : undefined;
    const companyId = req.user?.company?.companyId as string;

    return ItemCategoriesService.getCategories(
      companyId,
      (searchq as string) || undefined,
      parsedLimit,
      currentPage,
    );
  }
}
