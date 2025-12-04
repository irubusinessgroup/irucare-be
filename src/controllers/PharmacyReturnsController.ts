import {
  Body,
  Get,
  Middlewares,
  Path,
  Post,
  Query,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";
import { Request as ExpressRequest } from "express";
import { PharmacyReturnsService } from "../services/PharmacyReturnsService";
import { IPaged, IResponse } from "../utils/interfaces/common";
import {
  CreateReturnRequest,
  ReturnResponse,
} from "../utils/interfaces/common";
import { checkClinicRole, checkRoleAuto } from "../middlewares";
import { ClinicRole, roles } from "../utils/roles";

@Tags("Pharmacy - Returns")
@Security("jwt")
@Route("/api/pharmacy/returns")
export class PharmacyReturnsController {
  @Get("/")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.PHARMACIST))
  public async getReturns(
    @Query() page?: number,
    @Query() limit?: number,
    @Request() req?: ExpressRequest
  ): Promise<IPaged<ReturnResponse[]>> {
    const companyId = req?.user?.company?.companyId as string;
    return PharmacyReturnsService.getReturns(companyId, limit, page);
  }

  @Post("/")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.PHARMACIST))
  public async createReturn(
    @Body() data: CreateReturnRequest,
    @Request() req: ExpressRequest
  ): Promise<IResponse<ReturnResponse>> {
    const companyId = req.user?.company?.companyId as string;
    const userId = req.user?.id as string;
    return PharmacyReturnsService.createReturn(data, companyId, userId);
  }

  @Get("/{returnId}")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.PHARMACIST))
  public async getReturnById(
    @Path() returnId: string,
    @Request() req: ExpressRequest
  ): Promise<IResponse<ReturnResponse>> {
    const companyId = req.user?.company?.companyId as string;
    return PharmacyReturnsService.getReturnById(returnId, companyId);
  }
}
