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
import {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
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
    checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN),
    upload.any(),
    appendBarcodeQrCode
  )
  public async createItem(
    @Body() data: CreateItemDto,
    @Request() req: ExpressRequest
  ) {
    const companyId = req.user?.company?.companyId as string;
    const branchId = req.user?.branchId;
    return ItemService.createItem(data, companyId, branchId);
  }

  @Get("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN))
  public getItem(@Path() id: string, @Request() req: ExpressRequest) {
    const branchId = req.user?.branchId;
    return ItemService.getItem(id, branchId);
  }

  @Put("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN), upload.any())
  public updateItem(
    @Path() id: string,
    @Body() body: UpdateItemDto,
    @Request() req: ExpressRequest
  ) {
    const companyId = req.user?.company?.companyId as string;
    const branchId = req.user?.branchId;
    return ItemService.updateItem(id, body, companyId, branchId);
  }

  @Delete("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN))
  public deleteItem(@Path() id: string, @Request() req: ExpressRequest) {
    const companyId = req.user?.company?.companyId as string;
    const branchId = req.user?.branchId;
    return ItemService.deleteItem(id, companyId, branchId);
  }

  @Get("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN))
  public getAllItems(
    @Request() req: ExpressRequest,
    @Query() searchq?: string,
    @Query() limit?: number,
    @Query() page?: number
  ) {
    const branchId = req.user?.branchId;
    return ItemService.getItems(req, searchq, limit, page, branchId);
  }

  @Post("/import")
  @Middlewares(
    checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN),
    uploadToMemory.single("file")
  )
  public async importItems(@Request() req: ExpressRequest) {
    const companyId = req.user?.company?.companyId as string;
    const file = req.file;

    if (!file) {
      throw new Error("No file uploaded");
    }

    const branchId = req.user?.branchId;
    return ItemService.importItems(file, companyId, branchId);
  }

  @Get("/template/download")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN))
  public async downloadTemplate(@Request() req: ExpressRequest): Promise<void> {
    const buffer = await ItemService.downloadTemplate(req);

    const res = req.res as ExpressResponse;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=items-import-template.xlsx"
    );

    res.send(buffer);
    return;
  }

  @Get("/medications")
  public getMedications(
    @Request() req: ExpressRequest,
    @Query() searchq?: string,
    @Query() limit?: number,
    @Query() page?: number
  ) {
    const companyId = req.user?.company?.companyId as string;
    const branchId = req.user?.branchId;
    return ItemService.getMedications(
      req,
      companyId,
      searchq,
      limit,
      page,
      branchId
    );
  }
}
