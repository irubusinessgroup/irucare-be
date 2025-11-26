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

@Tags("Care Programs")
@Route("api/care-programs")
@Security("jwt")
export class CareProgramController extends Controller {
  @Get("/")
  public list(
    @Request() req: ExpressRequest,
    @Query() page?: number,
    @Query() limit?: number
  ): Promise<any> {
    const { programType, isActive } = req.query;
    return CareProgramService.list(req, page, limit, {
      programType: programType as CareProgramType,
      isActive: isActive === "true",
    });
  }

  @Get("/{id}")
  public get(@Path() id: string, @Request() req: ExpressRequest): Promise<any> {
    return CareProgramService.getById(id, req);
  }

  @Post("/")
  public create(
    @Request() req: ExpressRequest,
    @Body() body: CreateCareProgramDto
  ): Promise<any> {
    return CareProgramService.create(req, body);
  }

  @Put("/{id}")
  public update(
    @Path() id: string,
    @Body() body: UpdateCareProgramDto,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return CareProgramService.update(id, body, req);
  }

  @Delete("/{id}")
  public remove(
    @Path() id: string,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return CareProgramService.remove(id, req);
  }

  @Post("/enroll")
  public enrollPatient(
    @Request() req: ExpressRequest,
    @Body() body: EnrollPatientDto
  ): Promise<any> {
    return CareProgramService.enrollPatient(req, body);
  }

  @Get("/patient/{patientId}/enrollments")
  public patientEnrollments(
    @Path() patientId: string,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return CareProgramService.getPatientEnrollments(patientId, req);
  }

  @Put("/enrollment/{id}")
  public updateEnrollment(
    @Path() id: string,
    @Body() body: UpdateEnrollmentDto,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return CareProgramService.updateEnrollment(id, body, req);
  }

  @Post("/visit")
  public recordVisit(
    @Request() req: ExpressRequest,
    @Body() body: RecordVisitDto
  ): Promise<any> {
    return CareProgramService.recordVisit(req, body);
  }

  @Get("/enrollment/{enrollmentId}/visits")
  public enrollmentVisits(
    @Path() enrollmentId: string,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return CareProgramService.getEnrollmentVisits(enrollmentId, req);
  }

  @Get("/{programId}/enrollments")
  public programEnrollments(
    @Path() programId: string,
    @Request() req: ExpressRequest,
    @Query() page?: number,
    @Query() limit?: number,
    @Query() status?: string
  ): Promise<any> {
    return CareProgramService.getProgramEnrollments(
      programId,
      req,
      page,
      limit,
      status
    );
  }
}
