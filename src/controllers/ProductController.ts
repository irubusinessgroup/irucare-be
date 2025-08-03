import {
  Body,
  Delete,
  Get,
  Path,
  Post,
  Put,
  Route,
  Tags,
  Middlewares,
  Request,
} from "tsoa";
import {
  CreateProductDto,
  IResponse,
  TProduct,
  IPaged,
} from "../utils/interfaces/common";
import upload from "../utils/cloudinary";
import { appendPhotoAttachments } from "../middlewares/company.middlewares";
import { ProductService } from "../services/ProductService";
import { Request as ExpressRequest } from "express";

@Tags("Product")
@Route("/api/product")
export class productController {
  @Get("/")
  public async getAllProducts(
    @Request() req: ExpressRequest,
  ): Promise<IPaged<TProduct[]>> {
    const { searchq, limit, page } = req.query;
    const currentPage = page ? parseInt(page as string) : undefined;
    return ProductService.getAllProducts(
      searchq as string | undefined,
      limit ? parseInt(limit as string) : undefined,
      currentPage,
    );
  }

  @Get("/featured")
  public async getFeaturedProducts(): Promise<IPaged<TProduct[]>> {
    return ProductService.getFeaturedProducts();
  }

  @Post("/")
  @Middlewares(upload.any(), appendPhotoAttachments)
  public async createProduct(
    @Body() productData: CreateProductDto,
  ): Promise<IResponse<TProduct>> {
    return ProductService.createProduct(productData);
  }

  @Put("/{id}")
  @Middlewares(upload.any(), appendPhotoAttachments)
  public async updateProduct(
    @Path() id: string,
    @Body() productData: Partial<CreateProductDto>,
  ): Promise<IResponse<TProduct>> {
    return ProductService.updateProduct(id, productData);
  }

  @Delete("/{id}")
  public async deleteProduct(@Path() id: string): Promise<IResponse<null>> {
    return ProductService.deleteProduct(id);
  }

  @Get("/{id}")
  public async getProduct(@Path() id: string): Promise<IResponse<TProduct>> {
    return ProductService.getProduct(id);
  }
}
