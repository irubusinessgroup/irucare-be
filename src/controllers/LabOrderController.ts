import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";
import type { Request as ExpressRequest } from "express";
import { LabOrderService } from "../services/LabOrderService";
import type { LabOrderStatus } from "../services/LabOrderService";
import type {
  CreateLabOrderDto,
  UpdateLabOrderDto,
  LabResultItem,
} from "../utils/interfaces/common";

@Tags("Lab Orders")
@Route("api/lab-orders")
@Security("jwt")
export class LabOrderController extends Controller {
  @Get("/")
  public list(@Request() req: ExpressRequest) {
    const { page, limit, patientId, providerId, encounterId, status } =
      req.query;
    const statusParam = status as string | undefined as
      | LabOrderStatus
      | undefined;
    return LabOrderService.list(
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
    return LabOrderService.getById(id);
  }

  @Post("/")
  public create(
    @Request() req: ExpressRequest,
    @Body() body: CreateLabOrderDto,
  ) {
    return LabOrderService.create(req, body);
  }

  @Put("/{id}")
  public update(id: string, @Body() body: UpdateLabOrderDto) {
    return LabOrderService.update(id, body);
  }

  @Delete("/{id}")
  public remove(id: string) {
    return LabOrderService.remove(id);
  }

  @Put("/{id}/schedule")
  public schedule(id: string, @Body() body: { scheduledDate: string }) {
    return LabOrderService.schedule(id, body.scheduledDate);
  }

  @Put("/{id}/collect")
  public collect(id: string) {
    return LabOrderService.collect(id);
  }

  @Put("/{id}/complete")
  public complete(id: string, @Body() body: { results?: LabResultItem[] }) {
    return LabOrderService.complete(id, body.results);
  }

  @Put("/{id}/cancel")
  public cancel(id: string) {
    return LabOrderService.cancel(id);
  }
}
