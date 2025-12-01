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
import { PharmacyOTCService } from "../services/PharmacyOTCService";
import { IPaged, IResponse } from "../utils/interfaces/common";
import {
  CreateOTCSaleRequest,
  OTCSaleResponse,
} from "../utils/interfaces/common";
import { checkClinicRole } from "../middlewares";
import { ClinicRole } from "../utils/roles";

@Tags("Pharmacy - OTC Sales")
@Security("jwt")
@Route("/api/pharmacy/otc-sales")
export class PharmacyOTCController {
  @Get("/")
  @Middlewares(checkClinicRole(ClinicRole.PHARMACIST))
  public async getOTCSales(
    @Query() page?: number,
    @Query() limit?: number,
    @Request() req?: ExpressRequest
  ): Promise<IPaged<OTCSaleResponse[]>> {
    const companyId = req?.user?.company?.companyId as string;
    return PharmacyOTCService.getOTCSales(companyId, limit, page);
  }

  @Post("/")
  @Middlewares(checkClinicRole(ClinicRole.PHARMACIST))
  public async createOTCSale(
    @Body() data: CreateOTCSaleRequest,
    @Request() req: ExpressRequest
  ): Promise<IResponse<OTCSaleResponse>> {
    const companyId = req.user?.company?.companyId as string;
    const userId = req.user?.id as string;
    return PharmacyOTCService.createOTCSale(data, companyId, userId);
  }

  @Get("/{saleId}")
  @Middlewares(checkClinicRole(ClinicRole.PHARMACIST))
  public async getOTCSaleById(
    @Path() saleId: string,
    @Request() req: ExpressRequest
  ): Promise<IResponse<OTCSaleResponse>> {
    const companyId = req.user?.company?.companyId as string;
    return PharmacyOTCService.getOTCSaleById(saleId, companyId);
  }
}
