import {
  Body,
  Controller,
  Delete,
  Get,
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

@Tags("Prescriptions")
@Route("api/prescriptions")
@Security("jwt")
export class PrescriptionController extends Controller {
  @Get("/")
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
  public get(@Path() id: string, @Request() req: ExpressRequest): Promise<any> {
    return PrescriptionService.getById(id, req);
  }

  @Post("/")
  public create(
    @Request() req: ExpressRequest,
    @Body() body: CreatePrescriptionDto
  ): Promise<any> {
    return PrescriptionService.create(req, body);
  }

  @Put("/{id}")
  public update(
    @Path() id: string,
    @Body() body: UpdatePrescriptionDto,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return PrescriptionService.update(id, body, req);
  }

  @Delete("/{id}")
  public remove(@Path() id: string, @Request() req: ExpressRequest): Promise<any> {
    return PrescriptionService.remove(id, req);
  }

  @Post("/{id}/dispense")
  public dispense(
    @Path() id: string,
    @Body() body: DispensePrescriptionDto,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return PrescriptionService.dispense(id, body, req);
  }

  @Put("/{id}/pickup")
  public pickup(
    @Path() id: string,
    @Body() body: { pickedUpBy: string },
    @Request() req: ExpressRequest
  ): Promise<any> {
    return PrescriptionService.pickup(id, body.pickedUpBy, req);
  }

  @Put("/{id}/refill")
  public refill(@Path() id: string, @Request() req: ExpressRequest): Promise<any> {
    return PrescriptionService.refill(id, req);
  }

  @Put("/{id}/complete")
  public complete(@Path() id: string, @Request() req: ExpressRequest): Promise<any> {
    return PrescriptionService.complete(id, req);
  }

  @Put("/{id}/cancel")
  public cancel(@Path() id: string, @Request() req: ExpressRequest): Promise<any> {
    return PrescriptionService.cancel(id, req);
  }

  @Get("/patient/{patientId}/history")
  public patientHistory(
    @Path() patientId: string,
    @Request() req: ExpressRequest,
    @Query() page?: number,
    @Query() limit?: number
  ): Promise<any> {
    return PrescriptionService.getPatientHistory(patientId, req, page, limit);
  }
}
