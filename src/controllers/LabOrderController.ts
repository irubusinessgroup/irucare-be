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
import { LabOrderService } from "../services/LabOrderService";
import { OrderStatus1 } from "../utils/interfaces/common";
import {  checkRoleAuto } from "../middlewares";
import { ClinicRole, roles } from "../utils/roles";

@Tags("Lab Orders")
@Route("api/lab-orders")
@Security("jwt")
export class LabOrderController extends Controller {
  @Get("/")
  @Middlewares(
    checkRoleAuto(
      roles.COMPANY_ADMIN,
      ClinicRole.PROVIDER,
      ClinicRole.LAB_TECH,
      ClinicRole.CLINIC_ADMIN
    )
  )
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
  @Middlewares(
    checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.PROVIDER, ClinicRole.LAB_TECH)
  )
  public get(@Path() id: string, @Request() req: ExpressRequest) {
    return LabOrderService.getById(id, req);
  }

  @Post("/")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.PROVIDER))
  public create(@Request() req: ExpressRequest, @Body() body: any) {
    return LabOrderService.create(req, body);
  }

  @Put("/{id}")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.LAB_TECH))
  public update(
    @Path() id: string,
    @Body() body: any,
    @Request() req: ExpressRequest
  ) {
    return LabOrderService.update(id, body, req);
  }

  @Delete("/{id}")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.CLINIC_ADMIN))
  public remove(@Path() id: string, @Request() req: ExpressRequest) {
    return LabOrderService.remove(id, req);
  }

  @Post("/{id}/collect-sample")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.LAB_TECH))
  public collectSample(
    @Path() id: string,
    @Body() body: { sampleType: string },
    @Request() req: ExpressRequest
  ) {
    return LabOrderService.collectSample(id, body.sampleType, req);
  }

  @Put("/{id}/cancel")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.PROVIDER))
  public cancel(@Path() id: string, @Request() req: ExpressRequest) {
    return LabOrderService.cancel(id, req);
  }

  @Get("/pending")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.LAB_TECH))
  public pendingRequests(@Request() req: ExpressRequest) {
    return LabOrderService.getPendingRequests(req);
  }

  @Get("/in-progress")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.LAB_TECH))
  public inProgressRequests(@Request() req: ExpressRequest) {
    return LabOrderService.getInProgressRequests(req);
  }
}
