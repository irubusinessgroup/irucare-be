import {
  Body,
  Controller,
  Delete,
  Get,
  Path,
  Post,
  Put,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";
import type { Request as ExpressRequest } from "express";
import { PrescriptionService } from "../services/PrescriptionService";
import type { PrescriptionStatus } from "../services/PrescriptionService";
import {
  PrescriptionFulfillmentService,
  FulfillPrescriptionDto,
  PickupPrescriptionDto,
} from "../services/PrescriptionFulfillmentService";
import type {
  CreatePrescriptionDto,
  UpdatePrescriptionDto,
} from "../utils/interfaces/common";

@Tags("Prescriptions")
@Route("api/prescriptions")
@Security("jwt")
export class PrescriptionController extends Controller {
  @Get("/")
  public list(@Request() req: ExpressRequest) {
    const { page, limit, patientId, providerId, encounterId, status } =
      req.query;
    const statusParam = status as string | undefined as
      | PrescriptionStatus
      | undefined;
    return PrescriptionService.list(
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined,
      {
        patientId: patientId as string | undefined,
        providerId: providerId as string | undefined,
        encounterId: encounterId as string | undefined,
        status: statusParam,
      },
    );
  }

  @Get("/{id}")
  public get(id: string) {
    return PrescriptionService.getById(id);
  }

  @Post("/")
  public create(
    @Request() req: ExpressRequest,
    @Body() body: CreatePrescriptionDto,
  ) {
    return PrescriptionService.create(req, body);
  }

  @Put("/{id}")
  public update(id: string, @Body() body: UpdatePrescriptionDto) {
    return PrescriptionService.update(id, body);
  }

  @Delete("/{id}")
  public remove(id: string) {
    return PrescriptionService.remove(id);
  }

  @Put("/{id}/refill")
  public refill(id: string) {
    return PrescriptionService.refill(id);
  }

  @Put("/{id}/complete")
  public complete(id: string) {
    return PrescriptionService.complete(id);
  }

  @Put("/{id}/cancel")
  public cancel(id: string) {
    return PrescriptionService.cancel(id);
  }

  @Post("/{id}/fulfill")
  public fulfill(
    @Path() id: string,
    @Request() req: ExpressRequest,
    @Body() body: FulfillPrescriptionDto,
  ) {
    return PrescriptionFulfillmentService.fulfill(req, id, body);
  }

  @Get("/{id}/fulfillment")
  public getFulfillment(@Path() id: string) {
    return PrescriptionFulfillmentService.getFulfillment(id);
  }

  @Put("/{id}/pickup")
  public pickup(@Path() id: string, @Body() body: PickupPrescriptionDto) {
    return PrescriptionFulfillmentService.pickup(id, body);
  }
}
