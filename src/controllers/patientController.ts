import {
  Body,
  Get,
  Post,
  Put,
  Delete,
  Route,
  Tags,
  Path,
  Security,
  Request,
  Query,
  Middlewares,
} from "tsoa";
import { PatientService } from "../services/PatientService";
import { CreatePatientDto, UpdatePatientDto } from "../utils/interfaces/common";
import { Request as ExpressRequest } from "express";
import { ClinicRole, roles } from "../utils/roles";
import { checkRoleAuto } from "../middlewares";

@Security("jwt")
@Route("/api/patients")
@Tags("Patients")
export class PatientController {
  @Get("/")
  @Middlewares(
    checkRoleAuto(
      roles.COMPANY_ADMIN,
      ClinicRole.CLINIC_ADMIN,
      ClinicRole.RECEPTIONIST,
      ClinicRole.PROVIDER,
      ClinicRole.NURSE,
    ),
  )
  public getAllPatients(
    @Request() req: ExpressRequest,
    @Query() searchq?: string,
    @Query() limit?: number,
    @Query() page?: number,
  ) {
    return PatientService.getAllPatients(req, searchq, limit, page);
  }

  @Post("/")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.RECEPTIONIST))
  public createPatient(
    @Body() body: CreatePatientDto,
    @Request() req: ExpressRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    return PatientService.createPatient(body, companyId!);
  }

  @Put("/{id}")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.RECEPTIONIST))
  public updatePatient(@Path() id: string, @Body() body: UpdatePatientDto) {
    return PatientService.updatePatient(id, body);
  }

  @Delete("/{id}")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.CLINIC_ADMIN))
  public deletePatient(@Path() id: string) {
    return PatientService.deletePatient(id);
  }
}
