import express from "express";
import {
  Get,
  Post,
  Delete,
  Body,
  Route,
  Tags,
  Security,
  Request,
  Query,
  Middlewares,
} from "tsoa";
import { EbmPurchaseService } from "../services/EbmPurchaseService";
import { checkRole } from "../middlewares";
import { STAFF_OPS_ROLES } from "../utils/roles";

@Route("api/ebm/purchases")
@Tags("EBM Purchases")
@Security("jwt")
export class EbmPurchasesController {
  @Get("sync")
  @Middlewares(checkRole(...STAFF_OPS_ROLES))
  public getPurchases(
    @Request() req: express.Request,
    @Query() lastReqDt: string,
  ) {
    return EbmPurchaseService.getPurchases(
      req.user!.company!.companyId,
      lastReqDt,
    );
  }

  @Post("drafts/init")
  @Middlewares(checkRole(...STAFF_OPS_ROLES))
  public initDrafts(@Request() req: express.Request) {
    return EbmPurchaseService.initDrafts(req.user!.company!.companyId);
  }

  @Get("drafts/count")
  @Middlewares(checkRole(...STAFF_OPS_ROLES))
  public getPendingCount(@Request() req: express.Request) {
    return EbmPurchaseService.getPendingCount(
      req.user!.company!.companyId,
      req.user!.branchId || null,
    );
  }

  @Get("drafts")
  @Middlewares(checkRole(...STAFF_OPS_ROLES))
  public getDrafts(
    @Request() req: express.Request,
    @Query() lastReqDt?: string,
    @Query() search?: string,
    @Query() dateFrom?: string,
    @Query() dateTo?: string,
    @Query() page?: number,
    @Query() limit?: number,
    @Query() status?: string,
  ) {
    return EbmPurchaseService.getDrafts(
      req.user!.company!.companyId,
      lastReqDt,
      search,
      dateFrom,
      dateTo,
      page,
      limit,
      status,
      req.user!.branchId || null,
    );
  }

  @Delete("drafts")
  @Middlewares(checkRole(...STAFF_OPS_ROLES))
  public deleteDrafts(
    @Request() req: express.Request,
    @Body() body: { ids: string[] },
  ) {
    return EbmPurchaseService.deleteDrafts(
      req.user!.company!.companyId,
      body.ids || [],
    );
  }

  @Post("save")
  @Middlewares(checkRole(...STAFF_OPS_ROLES))
  public savePurchases(
    @Request() req: express.Request,
    @Body() payload: { purchases: any[]; draftIds?: string[] },
  ) {
    return EbmPurchaseService.savePurchases(
      req.user!.company!.companyId,
      req.user!.id,
      req.user!.branchId || null,
      payload.purchases || [],
      payload.draftIds,
    );
  }

  @Post("status")
  @Middlewares(checkRole(...STAFF_OPS_ROLES))
  public updatePurchaseStatus(
    @Request() req: express.Request,
    @Body()
    payload: {
      draftItems: Array<{ draftId: string; itemSeq: number }>;
      status: string;
    },
  ) {
    return EbmPurchaseService.updatePurchaseStatus(
      req.user!.company!.companyId,
      payload.draftItems,
      payload.status,
    );
  }

  @Get("report/pdf")
  @Middlewares(checkRole(...STAFF_OPS_ROLES))
  public getPurchasesDraftsPdf(
    @Request() req: express.Request,
    @Query() dateFrom?: string,
    @Query() dateTo?: string,
  ) {
    return EbmPurchaseService.generateDraftsPdf(req, dateFrom, dateTo);
  }
}
