import { Get, Middlewares, Path, Request, Route, Security, Tags } from "tsoa";
import { Request as ExpressRequest } from "express";
import { EbmCodesService } from "../services/EbmCodesService";
import { checkRole } from "../middlewares";
import { roles } from "../utils/roles";

@Security("jwt")
@Route("/api/ebm-codes")
@Tags("EBM Codes")
export class EbmCodesController {
  @Get("/:cdCls")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN))
  public async getCodesByClass(
    @Path() cdCls: string,
    @Request() req: ExpressRequest,
  ) {
    const companyId = req.user?.company?.companyId as string;
    return EbmCodesService.getCodesByClass(companyId, cdCls);
  }

  @Get("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN))
  public async getAllRequiredCodes(@Request() req: ExpressRequest) {
    const companyId = req.user?.company?.companyId as string;
    return EbmCodesService.getAllRequiredCodes(companyId);
  }
}
