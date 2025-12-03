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
import { PharmacyAdjustmentsService } from "../services/PharmacyAdjustmentsService";
import { IPaged, IResponse } from "../utils/interfaces/common";
import {
  CreateAdjustmentRequest,
  AdjustmentResponse,
} from "../utils/interfaces/common";
import { checkClinicRole } from "../middlewares";
import { ClinicRole } from "../utils/roles";

@Tags("Pharmacy - Adjustments")
@Security("jwt")
@Route("/api/pharmacy/adjustments")
export class PharmacyAdjustmentsController {
  @Get("/")
  @Middlewares(checkClinicRole(ClinicRole.PHARMACIST))
  public async getAdjustments(
    @Query() page?: number,
    @Query() limit?: number,
    @Request() req?: ExpressRequest,
  ): Promise<IPaged<AdjustmentResponse[]>> {
    const companyId = req?.user?.company?.companyId as string;
    return PharmacyAdjustmentsService.getAdjustments(companyId, limit, page);
  }

  @Post("/")
  @Middlewares(checkClinicRole(ClinicRole.PHARMACIST))
  public async createAdjustment(
    @Body() data: CreateAdjustmentRequest,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<AdjustmentResponse>> {
    const companyId = req.user?.company?.companyId as string;
    const userId = req.user?.id as string;
    return PharmacyAdjustmentsService.createAdjustment(data, companyId, userId);
  }

  @Get("/{adjustmentId}")
  @Middlewares(checkClinicRole(ClinicRole.PHARMACIST))
  public async getAdjustmentById(
    @Path() adjustmentId: string,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<AdjustmentResponse>> {
    const companyId = req.user?.company?.companyId as string;
    return PharmacyAdjustmentsService.getAdjustmentById(
      adjustmentId,
      companyId,
    );
  }
}
