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
import { LabOrderService } from "../services/LabOrderService";
import { OrderStatus1 } from "../utils/interfaces/common";

@Tags("Lab Orders")
@Route("api/lab-orders")
@Security("jwt")
export class LabOrderController extends Controller {
  @Get("/")
  public list(
    @Request() req: ExpressRequest,
    @Query() page?: number,
    @Query() limit?: number
  ) {
    const {
      patientId,
      providerId,
      encounterId,
      status,
      testCategory,
      startDate,
      endDate,
    } = req.query;
    return LabOrderService.list(req, page, limit, {
      patientId: patientId as string,
      providerId: providerId as string,
      encounterId: encounterId as string,
      status: status as OrderStatus1,
      testCategory: testCategory as string,
      startDate: startDate as string,
      endDate: endDate as string,
    });
  }

  @Get("/{id}")
  public get(@Path() id: string, @Request() req: ExpressRequest) {
    return LabOrderService.getById(id, req);
  }

  @Post("/")
  public create(@Request() req: ExpressRequest, @Body() body: any) {
    return LabOrderService.create(req, body);
  }

  @Put("/{id}")
  public update(
    @Path() id: string,
    @Body() body: any,
    @Request() req: ExpressRequest
  ) {
    return LabOrderService.update(id, body, req);
  }

  @Delete("/{id}")
  public remove(@Path() id: string, @Request() req: ExpressRequest) {
    return LabOrderService.remove(id, req);
  }

  @Post("/{id}/collect-sample")
  public collectSample(
    @Path() id: string,
    @Body() body: { sampleType: string },
    @Request() req: ExpressRequest
  ) {
    return LabOrderService.collectSample(id, body.sampleType, req);
  }

  @Put("/{id}/cancel")
  public cancel(@Path() id: string, @Request() req: ExpressRequest) {
    return LabOrderService.cancel(id, req);
  }

  @Get("/pending")
  public pendingRequests(@Request() req: ExpressRequest) {
    return LabOrderService.getPendingRequests(req);
  }

  @Get("/in-progress")
  public inProgressRequests(@Request() req: ExpressRequest) {
    return LabOrderService.getInProgressRequests(req);
  }
}
