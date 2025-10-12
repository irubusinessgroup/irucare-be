import {
  Body,
  Delete,
  Get,
  Middlewares,
  Path,
  Post,
  Put,
  Query,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";
import { Request as ExpressRequest } from "express";
import { ItemService } from "../services/ItemService";
import { CreateItemDto, UpdateItemDto } from "../utils/interfaces/common";
import { checkRole } from "../middlewares";
import { roles } from "../utils/roles";
import upload, { uploadToMemory } from "../utils/cloudinary";
import { appendBarcodeQrCode } from "../middlewares/appendBarcodeQrCode";

@Security("jwt")
@Route("/api/items")
@Tags("Items")
export class ItemController {
  @Post("/")
  @Middlewares(
    checkRole(roles.COMPANY_ADMIN),
    upload.any(),
    appendBarcodeQrCode,
  )
  public async createItem(
    @Body() data: CreateItemDto,
    @Request() req: ExpressRequest,
  ) {
    const companyId = req.user?.company?.companyId as string;
    return ItemService.createItem(data, companyId);
  }

  @Get("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getItem(@Path() id: string) {
    return ItemService.getItem(id);
  }

  @Put("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN), upload.any())
  public updateItem(
    @Path() id: string,
    @Body() body: UpdateItemDto,
    @Request() req: ExpressRequest,
  ) {
    const companyId = req.user?.company?.companyId as string;
    return ItemService.updateItem(id, body, companyId);
  }

  @Delete("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public deleteItem(@Path() id: string, @Request() req: ExpressRequest) {
    const companyId = req.user?.company?.companyId as string;
    return ItemService.deleteItem(id, companyId);
  }

  @Get("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getAllItems(
    @Request() req: ExpressRequest,
    @Query() searchq?: string,
    @Query() limit?: number,
    @Query() page?: number,
  ) {
    return ItemService.getItems(req, searchq, limit, page);
  }

  @Post("/import")
  @Middlewares(checkRole(roles.COMPANY_ADMIN), uploadToMemory.single("file"))
  public async importItems(@Request() req: ExpressRequest) {
    const companyId = req.user?.company?.companyId as string;
    const file = req.file;

    if (!file) {
      throw new Error("No file uploaded");
    }

    return ItemService.importItems(file, companyId);
  }
}
