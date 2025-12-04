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

import { LabTestService } from "../services/LabTestService";
import {
  CreateLabTestDto,
  LabTestType,
  UpdateLabTestDto,
} from "../utils/interfaces/common";
import { checkRoleAuto } from "../middlewares";
import { ClinicRole, roles } from "../utils/roles";

@Tags("Lab Tests")
@Route("api/lab-tests")
@Security("jwt")
export class LabTestController extends Controller {
  @Get("/")
  @Middlewares(
    checkRoleAuto(
      roles.COMPANY_ADMIN,
      ClinicRole.LAB_TECH,
      ClinicRole.PROVIDER,
      ClinicRole.ACCOUNTANT,
    ),
  )
  public list(
    @Request() req: ExpressRequest,
    @Query() page?: number,
    @Query() limit?: number,
  ): Promise<any> {
    const { category, testType, isActive, search } = req.query;
    return LabTestService.list(req, page, limit, {
      category: category as string,
      testType: testType as LabTestType,
      isActive: isActive === "true",
      search: search as string,
    });
  }

  @Get("/{id}")
  @Middlewares(
    checkRoleAuto(
      roles.COMPANY_ADMIN,
      ClinicRole.LAB_TECH,
      ClinicRole.PROVIDER,
    ),
  )
  public get(@Path() id: string, @Request() req: ExpressRequest): Promise<any> {
    return LabTestService.getById(id, req);
  }

  @Post("/")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.CLINIC_ADMIN))
  public create(
    @Request() req: ExpressRequest,
    @Body() body: CreateLabTestDto,
  ): Promise<any> {
    return LabTestService.create(req, body);
  }

  @Put("/{id}")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.CLINIC_ADMIN))
  public update(
    @Path() id: string,
    @Body() body: UpdateLabTestDto,
    @Request() req: ExpressRequest,
  ): Promise<any> {
    return LabTestService.update(id, body, req);
  }

  @Delete("/{id}")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.CLINIC_ADMIN))
  public remove(
    @Path() id: string,
    @Request() req: ExpressRequest,
  ): Promise<any> {
    return LabTestService.remove(id, req);
  }

  @Get("/categories/list")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.LAB_TECH))
  public categories(@Request() req: ExpressRequest): Promise<any> {
    return LabTestService.getCategories(req);
  }

  @Get("/panels/list")
  @Middlewares(
    checkRoleAuto(
      roles.COMPANY_ADMIN,
      ClinicRole.LAB_TECH,
      ClinicRole.PROVIDER,
    ),
  )
  public panelsAndProfiles(@Request() req: ExpressRequest): Promise<any> {
    return LabTestService.getPanelsAndProfiles(req);
  }

  @Get("/pricing/list")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.ACCOUNTANT))
  public pricingList(@Request() req: ExpressRequest): Promise<any> {
    return LabTestService.getPricingList(req);
  }
}
