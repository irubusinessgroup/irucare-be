import {
  Body,
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
import { PharmacyDispensingService } from "../services/PharmacyDispensingService";
import { IPaged, IResponse } from "../utils/interfaces/common";
import {
  CreateDispenseRequest,
  UpdateDispenseRequest,
  DispenseResponse,
} from "../utils/interfaces/common";
import { checkClinicRole } from "../middlewares";
import { ClinicRole } from "../utils/roles";

@Tags("Pharmacy - Dispensing")
@Security("jwt")
@Route("/api/pharmacy/dispensing")
export class PharmacyDispensingController {
  @Get("/queue")
  @Middlewares(checkClinicRole(ClinicRole.PHARMACIST))
  public async getDispensingQueue(
    @Query() status?: string,
    @Query() page?: number,
    @Query() limit?: number,
    @Request() req?: ExpressRequest
  ): Promise<IPaged<DispenseResponse[]>> {
    const companyId = req?.user?.company?.companyId as string;
    return PharmacyDispensingService.getDispensingQueue(
      companyId,
      status,
      limit,
      page
    );
  }

  @Post("/")
  @Middlewares(checkClinicRole(ClinicRole.PHARMACIST))
  public async createDispense(
    @Body() data: CreateDispenseRequest,
    @Request() req: ExpressRequest
  ): Promise<IResponse<DispenseResponse>> {
    const companyId = req.user?.company?.companyId as string;
    const userId = req.user?.id as string;
    return PharmacyDispensingService.createDispense(data, companyId, userId);
  }

  @Get("/{dispenseId}")
  @Middlewares(checkClinicRole(ClinicRole.PHARMACIST))
  public async getDispenseById(
    @Path() dispenseId: string,
    @Request() req: ExpressRequest
  ): Promise<IResponse<DispenseResponse>> {
    const companyId = req.user?.company?.companyId as string;
    return PharmacyDispensingService.getDispenseById(dispenseId, companyId);
  }

  @Put("/{dispenseId}")
  @Middlewares(checkClinicRole(ClinicRole.PHARMACIST))
  public async updateDispense(
    @Path() dispenseId: string,
    @Body() data: UpdateDispenseRequest,
    @Request() req: ExpressRequest
  ): Promise<IResponse<DispenseResponse>> {
    const companyId = req.user?.company?.companyId as string;
    return PharmacyDispensingService.updateDispense(
      dispenseId,
      data,
      companyId
    );
  }
}
