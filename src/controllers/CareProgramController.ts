import {
  Body,
  Controller,
  Get,
  Path,
  Post,
  Put,
  //   Query,
  Request,
  Route,
  Security,
  Tags,
  Delete,
  Query,
  Middlewares,
} from "tsoa";
import type { Request as ExpressRequest } from "express";
import { CareProgramService } from "../services/CareProgramService";
import {
  CareProgramType,
  CreateCareProgramDto,
  EnrollPatientDto,
  RecordVisitDto,
  UpdateCareProgramDto,
  UpdateEnrollmentDto,
} from "../utils/interfaces/common";
import { checkClinicRole } from "../middlewares";
import { ClinicRole } from "../utils/roles";

@Tags("Care Programs")
@Route("api/care-programs")
@Security("jwt")
export class CareProgramController extends Controller {
  @Get("/")
  @Middlewares(
    checkClinicRole(
      ClinicRole.RECEPTIONIST,
      ClinicRole.PROVIDER,
      ClinicRole.CLINIC_ADMIN,
    ),
  )
  public list(
    @Request() req: ExpressRequest,
    @Query() page?: number,
    @Query() limit?: number,
  ): Promise<any> {
    const { programType, isActive } = req.query;
    return CareProgramService.list(req, page, limit, {
      programType: programType as CareProgramType,
      isActive: isActive === "true",
    });
  }

  @Get("/{id}")
  @Middlewares(
    checkClinicRole(
      ClinicRole.RECEPTIONIST,
      ClinicRole.PROVIDER,
      ClinicRole.CLINIC_ADMIN,
    ),
  )
  public get(@Path() id: string, @Request() req: ExpressRequest): Promise<any> {
    return CareProgramService.getById(id, req);
  }

  @Post("/")
  @Middlewares(checkClinicRole(ClinicRole.CLINIC_ADMIN))
  public create(
    @Request() req: ExpressRequest,
    @Body() body: CreateCareProgramDto,
  ): Promise<any> {
    return CareProgramService.create(req, body);
  }

  @Put("/{id}")
  @Middlewares(checkClinicRole(ClinicRole.CLINIC_ADMIN))
  public update(
    @Path() id: string,
    @Body() body: UpdateCareProgramDto,
    @Request() req: ExpressRequest,
  ): Promise<any> {
    return CareProgramService.update(id, body, req);
  }

  @Delete("/{id}")
  @Middlewares(checkClinicRole(ClinicRole.CLINIC_ADMIN))
  public remove(
    @Path() id: string,
    @Request() req: ExpressRequest,
  ): Promise<any> {
    return CareProgramService.remove(id, req);
  }

  @Post("/enroll")
  @Middlewares(checkClinicRole(ClinicRole.NURSE, ClinicRole.PROVIDER))
  public enrollPatient(
    @Request() req: ExpressRequest,
    @Body() body: EnrollPatientDto,
  ): Promise<any> {
    return CareProgramService.enrollPatient(req, body);
  }

  @Get("/patient/{patientId}/enrollments")
  @Middlewares(checkClinicRole(ClinicRole.NURSE, ClinicRole.PROVIDER))
  public patientEnrollments(
    @Path() patientId: string,
    @Request() req: ExpressRequest,
  ): Promise<any> {
    return CareProgramService.getPatientEnrollments(patientId, req);
  }

  @Put("/enrollment/{id}")
  @Middlewares(checkClinicRole(ClinicRole.NURSE, ClinicRole.PROVIDER))
  public updateEnrollment(
    @Path() id: string,
    @Body() body: UpdateEnrollmentDto,
    @Request() req: ExpressRequest,
  ): Promise<any> {
    return CareProgramService.updateEnrollment(id, body, req);
  }

  @Post("/visit")
  @Middlewares(checkClinicRole(ClinicRole.NURSE, ClinicRole.PROVIDER))
  public recordVisit(
    @Request() req: ExpressRequest,
    @Body() body: RecordVisitDto,
  ): Promise<any> {
    return CareProgramService.recordVisit(req, body);
  }

  @Get("/enrollment/{enrollmentId}/visits")
  @Middlewares(checkClinicRole(ClinicRole.NURSE, ClinicRole.PROVIDER))
  public enrollmentVisits(
    @Path() enrollmentId: string,
    @Request() req: ExpressRequest,
  ): Promise<any> {
    return CareProgramService.getEnrollmentVisits(enrollmentId, req);
  }

  @Get("/{programId}/enrollments")
  @Middlewares(checkClinicRole(ClinicRole.CLINIC_ADMIN))
  public programEnrollments(
    @Path() programId: string,
    @Request() req: ExpressRequest,
    @Query() page?: number,
    @Query() limit?: number,
    @Query() status?: string,
  ): Promise<any> {
    return CareProgramService.getProgramEnrollments(
      programId,
      req,
      page,
      limit,
      status,
    );
  }
}
