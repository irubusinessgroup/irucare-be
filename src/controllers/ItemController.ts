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
    checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF),
    upload.any(),
    appendBarcodeQrCode,
  )
  public async createItem(
    @Body() data: CreateItemDto,
    @Request() req: ExpressRequest,
  ) {
    const companyId = req.user?.company?.companyId as string;
    const branchId = req.user?.branchId;
    const userId = req.user?.id;
    return ItemService.createItem(data, companyId, branchId, userId);
  }

  @Get("/generate-product-code")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public async generateProductCode(@Request() req: ExpressRequest) {
    const companyId = req.user?.company?.companyId as string;
    return ItemService.generateProductCode(companyId);
  }

  @Get("/next-sequence")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public async getNextProductCodeSequence(@Request() req: ExpressRequest) {
    const companyId = req.user?.company?.companyId as string;
    return ItemService.getNextProductCodeSequence(companyId);
  }

  @Post("/generate-code-with-classifications")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public async generateCodeWithClassifications(
    @Body()
    body: {
      countryCd: string;
      itemTypeCd: string;
      packingUnitCd: string;
      quantityUnitCd: string;
    },
    @Request() req: ExpressRequest,
  ) {
    const companyId = req.user?.company?.companyId as string;
    return ItemService.generateProductCodeWithClassifications(
      companyId,
      body.countryCd,
      body.itemTypeCd,
      body.packingUnitCd,
      body.quantityUnitCd,
    );
  }

  @Get("/search")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public searchItems(
    @Request() req: ExpressRequest,
    @Query() q?: string,
    @Query() limit?: number,
  ) {
    const branchId = req.user?.branchId;
    const companyId = req.user?.company?.companyId as string;
    return ItemService.searchItems(companyId, branchId, q, limit);
  }

  @Put("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF), upload.any())
  public updateItem(
    @Path() id: string,
    @Body() body: UpdateItemDto,
    @Request() req: ExpressRequest,
  ) {
    const companyId = req.user?.company?.companyId as string;
    const branchId = req.user?.branchId;
    return ItemService.updateItem(id, body, companyId, branchId);
  }

  @Delete("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public deleteItem(@Path() id: string, @Request() req: ExpressRequest) {
    const companyId = req.user?.company?.companyId as string;
    const branchId = req.user?.branchId;
    return ItemService.deleteItem(id, companyId, branchId);
  }

  @Get("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public getAllItems(
    @Request() req: ExpressRequest,
    @Query() searchq?: string,
    @Query() limit?: number,
    @Query() page?: number,
  ) {
    const branchId = req.user?.branchId;
    return ItemService.getItems(req, searchq, limit, page, branchId);
  }

  /** Export-only endpoint — no pagination, returns all items for company/branch. */
  @Get("/export")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public exportAllItems(@Request() req: ExpressRequest) {
    return ItemService.getAllForExport(req);
  }

  @Post("/import")
  @Middlewares(
    checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF),
    uploadToMemory.single("file"),
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
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public async downloadTemplate(@Request() req: ExpressRequest): Promise<void> {
    const buffer = await ItemService.downloadTemplate(req);

    const res = req.res as ExpressResponse;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=items-import-template.xlsx",
    );

    res.send(buffer);
    return;
  }

  @Get("/medications")
  public getMedications(
    @Request() req: ExpressRequest,
    @Query() searchq?: string,
    @Query() limit?: number,
    @Query() page?: number,
  ) {
    const companyId = req.user?.company?.companyId as string;
    const branchId = req.user?.branchId;
    return ItemService.getMedications(
      req,
      companyId,
      searchq,
      limit,
      page,
      branchId,
    );
  }

  @Get("/plu-report")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public getPluReport(
    @Request() req: ExpressRequest,
    @Query() startDate?: string,
    @Query() endDate?: string,
  ) {
    return ItemService.getPluReport(req, startDate, endDate);
  }

  @Get("/vat-mode")
  public async getVatMode(@Request() req: ExpressRequest) {
    const companyId = req.user?.company?.companyId as string;
    if (!companyId) {
      return {
        message: "No company context",
        data: {
          isVatRegistered: false,
          allowVatModeSwitch: false,
          canSwitchToVat: false,
          canSwitchToNonVat: false,
        },
      };
    }
    const userRoles = (req.user?.userRoles || []).map((r) => r.name);
    return ItemService.getVatModeStatus(companyId, userRoles);
  }

  @Put("/vat-mode/toggle")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF, roles.ADMIN))
  public async toggleVatMode(
    @Body() body: { isVatMode: boolean },
    @Request() req: ExpressRequest,
  ) {
    const companyId = req.user?.company?.companyId as string;
    const userRoles = (req.user?.userRoles || []).map((r) => r.name);
    return ItemService.toggleVatMode(companyId, body.isVatMode, userRoles);
  }

  @Get("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public getItem(@Path() id: string, @Request() req: ExpressRequest) {
    return ItemService.getItem(id, req);
  }
}
