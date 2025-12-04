import {
  Body,
  Controller,
  Delete,
  Get,
  Middlewares,
  Path,
  Post,
  Put,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";
import type { Request as ExpressRequest } from "express";
import {
  InsuranceClaimService,
  CreateInsuranceClaimDto,
  UpdateInsuranceClaimDto,
} from "../services/InsuranceClaimService";
import { checkRoleAuto } from "../middlewares";
import { ClinicRole, roles } from "../utils/roles";

@Tags("Insurance Claims")
@Route("api/insurance-claims")
@Security("jwt")
export class InsuranceClaimController extends Controller {
  @Get("/")
  @Middlewares(
    checkRoleAuto(
      roles.COMPANY_ADMIN,
      ClinicRole.ACCOUNTANT,
      ClinicRole.CLINIC_ADMIN
    )
  )
  public list(@Request() req: ExpressRequest) {
    const {
      page,
      limit,
      patientId,
      insuranceCardId,
      encounterId,
      billingId,
      status,
    } = req.query;
    return InsuranceClaimService.list(
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined,
      {
        patientId: patientId as string | undefined,
        insuranceCardId: insuranceCardId as string | undefined,
        encounterId: encounterId as string | undefined,
        billingId: billingId as string | undefined,
        status: status as string | undefined,
      }
    );
  }

  @Get("/{id}")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.ACCOUNTANT))
  public get(@Path() id: string) {
    return InsuranceClaimService.getById(id);
  }

  @Post("/")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.ACCOUNTANT))
  public create(
    @Request() req: ExpressRequest,
    @Body() body: CreateInsuranceClaimDto
  ) {
    return InsuranceClaimService.create(req, body);
  }

  @Put("/{id}")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.ACCOUNTANT))
  public update(@Path() id: string, @Body() body: UpdateInsuranceClaimDto) {
    return InsuranceClaimService.update(id, body);
  }

  @Delete("/{id}")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.CLINIC_ADMIN))
  public remove(@Path() id: string) {
    return InsuranceClaimService.remove(id);
  }

  @Post("/{id}/submit")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.ACCOUNTANT))
  public submit(@Path() id: string) {
    return InsuranceClaimService.submit(id);
  }

  @Post("/{id}/response")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.ACCOUNTANT))
  public processResponse(
    @Path() id: string,
    @Body()
    body: {
      approvedAmount?: number;
      rejectedAmount?: number;
      responseFileUrl?: string;
      status: "APPROVED" | "REJECTED" | "PARTIAL";
      notes?: string;
    }
  ) {
    return InsuranceClaimService.processResponse(id, body);
  }
}
