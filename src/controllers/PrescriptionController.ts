import {
  Body,
  Controller,
  Delete,
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
import type { Request as ExpressRequest } from "express";
import { PrescriptionService } from "../services/PrescriptionService";
import {
  CreatePrescriptionDto,
  DispensePrescriptionDto,
  PrescriptionStatus,
  UpdatePrescriptionDto,
} from "../utils/interfaces/common";
import { checkClinicRole } from "../middlewares";
import { ClinicRole } from "../utils/roles";

@Tags("Prescriptions")
@Route("api/prescriptions")
@Security("jwt")
export class PrescriptionController extends Controller {
  @Get("/")
  @Middlewares(
    checkClinicRole(
      ClinicRole.PHARMACIST,
      ClinicRole.PROVIDER,
      ClinicRole.CLINIC_ADMIN,
    ),
  )
  public list(@Request() req: ExpressRequest): Promise<any> {
    const {
      page,
      limit,
      patientId,
      providerId,
      encounterId,
      status,
      startDate,
      endDate,
    } = req.query;
    return PrescriptionService.list(req, page as any, limit as any, {
      patientId: patientId as string,
      providerId: providerId as string,
      encounterId: encounterId as string,
      status: status as PrescriptionStatus,
      startDate: startDate as string,
      endDate: endDate as string,
    });
  }

  @Get("/{id}")
  @Middlewares(checkClinicRole(ClinicRole.PHARMACIST, ClinicRole.PROVIDER))
  public get(@Path() id: string, @Request() req: ExpressRequest): Promise<any> {
    return PrescriptionService.getById(id, req);
  }

  @Post("/")
  @Middlewares(checkClinicRole(ClinicRole.PROVIDER))
  public create(
    @Request() req: ExpressRequest,
    @Body() body: CreatePrescriptionDto,
  ): Promise<any> {
    return PrescriptionService.create(req, body);
  }

  @Put("/{id}")
  @Middlewares(checkClinicRole(ClinicRole.PROVIDER))
  public update(
    @Path() id: string,
    @Body() body: UpdatePrescriptionDto,
    @Request() req: ExpressRequest,
  ): Promise<any> {
    return PrescriptionService.update(id, body, req);
  }

  @Delete("/{id}")
  @Middlewares(checkClinicRole(ClinicRole.CLINIC_ADMIN, ClinicRole.PROVIDER))
  public remove(
    @Path() id: string,
    @Request() req: ExpressRequest,
  ): Promise<any> {
    return PrescriptionService.remove(id, req);
  }

  @Post("/{id}/dispense")
  @Middlewares(checkClinicRole(ClinicRole.PHARMACIST))
  public dispense(
    @Path() id: string,
    @Body() body: DispensePrescriptionDto,
    @Request() req: ExpressRequest,
  ): Promise<any> {
    return PrescriptionService.dispense(id, body, req);
  }

  @Put("/{id}/pickup")
  @Middlewares(checkClinicRole(ClinicRole.PHARMACIST))
  public pickup(
    @Path() id: string,
    @Body() body: { pickedUpBy: string },
    @Request() req: ExpressRequest,
  ): Promise<any> {
    return PrescriptionService.pickup(id, body.pickedUpBy, req);
  }

  @Put("/{id}/refill")
  @Middlewares(checkClinicRole(ClinicRole.PHARMACIST))
  public refill(
    @Path() id: string,
    @Request() req: ExpressRequest,
  ): Promise<any> {
    return PrescriptionService.refill(id, req);
  }

  @Put("/{id}/complete")
  @Middlewares(checkClinicRole(ClinicRole.PHARMACIST))
  public complete(
    @Path() id: string,
    @Request() req: ExpressRequest,
  ): Promise<any> {
    return PrescriptionService.complete(id, req);
  }

  @Put("/{id}/cancel")
  @Middlewares(checkClinicRole(ClinicRole.PROVIDER))
  public cancel(
    @Path() id: string,
    @Request() req: ExpressRequest,
  ): Promise<any> {
    return PrescriptionService.cancel(id, req);
  }

  @Get("/patient/{patientId}/history")
  @Middlewares(checkClinicRole(ClinicRole.PHARMACIST, ClinicRole.PROVIDER))
  public patientHistory(
    @Path() patientId: string,
    @Request() req: ExpressRequest,
    @Query() page?: number,
    @Query() limit?: number,
  ): Promise<any> {
    return PrescriptionService.getPatientHistory(patientId, req, page, limit);
  }
}
