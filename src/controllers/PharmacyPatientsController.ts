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
import { PharmacyPatientsService } from "../services/PharmacyPatientsService";
import { IPaged, IResponse } from "../utils/interfaces/common";
import {
  MedicationHistoryResponse,
  CheckDrugInteractionsRequest,
  DrugInteractionResponse,
  AllergyAlertResponse,
} from "../utils/interfaces/common";
import { checkClinicRole, checkRoleAuto } from "../middlewares";
import { ClinicRole, roles } from "../utils/roles";

@Tags("Pharmacy - Patients")
@Security("jwt")
@Route("/api/pharmacy")
export class PharmacyPatientsController {
  @Get("/patients/{patientId}/medication-history")
  @Middlewares(
    checkRoleAuto(
      roles.COMPANY_ADMIN,
      ClinicRole.PHARMACIST,
      ClinicRole.PROVIDER
    )
  )
  public async getMedicationHistory(
    @Path() patientId: string,
    @Query() page?: number,
    @Query() limit?: number,
    @Request() req?: ExpressRequest
  ): Promise<IPaged<MedicationHistoryResponse>> {
    const companyId = req?.user?.company?.companyId as string;
    return PharmacyPatientsService.getMedicationHistory(
      patientId,
      companyId,
      limit,
      page
    );
  }

  @Post("/drug-interactions/check")
  @Middlewares(
    checkRoleAuto(
      roles.COMPANY_ADMIN,
      ClinicRole.PHARMACIST,
      ClinicRole.PROVIDER
    )
  )
  public async checkDrugInteractions(
    @Body() data: CheckDrugInteractionsRequest,
    @Request() req: ExpressRequest
  ): Promise<IResponse<DrugInteractionResponse>> {
    const companyId = req.user?.company?.companyId as string;
    return PharmacyPatientsService.checkDrugInteractions(data, companyId);
  }

  @Get("/patients/{patientId}/allergy-alerts/{medicationId}")
  @Middlewares(
    checkRoleAuto(
      roles.COMPANY_ADMIN,
      ClinicRole.PHARMACIST,
      ClinicRole.PROVIDER
    )
  )
  public async getAllergyAlerts(
    @Path() patientId: string,
    @Path() medicationId: string,
    @Request() req: ExpressRequest
  ): Promise<IResponse<AllergyAlertResponse>> {
    const companyId = req.user?.company?.companyId as string;
    return PharmacyPatientsService.getAllergyAlerts(
      patientId,
      medicationId,
      companyId
    );
  }
}
