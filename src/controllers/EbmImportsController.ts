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
import { EbmImportService } from "../services/EbmImportService";
import { prisma } from "../utils/client";
import { EbmService } from "../services/EbmService";
import { checkRole } from "../middlewares";
import { STAFF_OPS_ROLES } from "../utils/roles";

@Route("api/ebm/imports")
@Tags("EBM Imports")
@Security("jwt")
export class EbmImportsController {
  @Post("drafts/init")
  @Middlewares(checkRole(...STAFF_OPS_ROLES))
  public initDrafts(@Request() req: express.Request) {
    return EbmImportService.initDrafts(req.user!.company!.companyId);
  }

  @Get("drafts/count")
  @Middlewares(checkRole(...STAFF_OPS_ROLES))
  public getPendingCount(@Request() req: express.Request) {
    return EbmImportService.getPendingCount(
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
    return EbmImportService.getDrafts(
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
    return EbmImportService.deleteDrafts(
      req.user!.company!.companyId,
      body.ids || [],
    );
  }

  @Get("sync")
  @Middlewares(checkRole(...STAFF_OPS_ROLES))
  public async syncEbmImports(
    @Request() req: express.Request,
    @Query() lastReqDt: string,
  ) {
    const company = await prisma.company.findUnique({
      where: { id: req.user!.company!.companyId },
      select: { TIN: true },
    });
    if (!company?.TIN) throw new Error("Company TIN is missing");
    const response = await EbmService.fetchImportedItems(
      company.TIN,
      await EbmService.resolveCompanyBhfId(req.user!.company!.companyId),
      lastReqDt,
    );
    if (response.resultCd !== "000") {
      throw new Error(
        `EBM API Error [${response.resultCd}]: ${response.resultMsg}`,
      );
    }
    return {
      message: "EBM imports fetched successfully",
      data: response.data?.itemList || [],
    };
  }

  @Post("status")
  @Middlewares(checkRole(...STAFF_OPS_ROLES))
  public updateImportStatus(
    @Request() req: express.Request,
    @Body() payload: { draftIds: string[]; status: string },
  ) {
    return EbmImportService.updateImportStatus(
      req.user!.company!.companyId,
      req.user!.id,
      payload.draftIds,
      payload.status,
    );
  }

  @Get("report/pdf")
  @Middlewares(checkRole(...STAFF_OPS_ROLES))
  public getImportsDraftsPdf(
    @Request() req: express.Request,
    @Query() dateFrom?: string,
    @Query() dateTo?: string,
  ) {
    return EbmImportService.generateDraftsPdf(req, dateFrom, dateTo);
  }

  @Post("save")
  @Middlewares(checkRole(...STAFF_OPS_ROLES))
  public saveEbmImports(
    @Request() req: express.Request,
    @Body() body: { imports: any[]; draftIds?: string[] },
  ) {
    return EbmImportService.saveImports(
      req.user!.company!.companyId,
      req.user!.id,
      req.user!.branchId || null,
      body.imports || [],
      body.draftIds,
    );
  }
}
