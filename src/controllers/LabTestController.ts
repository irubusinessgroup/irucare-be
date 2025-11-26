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

import { LabTestService } from "../services/LabTestService";
import {
  CreateLabTestDto,
  LabTestType,
  UpdateLabTestDto,
} from "../utils/interfaces/common";

@Tags("Lab Tests")
@Route("api/lab-tests")
@Security("jwt")
export class LabTestController extends Controller {
  @Get("/")
  public list(
    @Request() req: ExpressRequest,
    @Query() page?: number,
    @Query() limit?: number
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
  public get(@Path() id: string, @Request() req: ExpressRequest): Promise<any> {
    return LabTestService.getById(id, req);
  }

  @Post("/")
  public create(
    @Request() req: ExpressRequest,
    @Body() body: CreateLabTestDto
  ): Promise<any> {
    return LabTestService.create(req, body);
  }

  @Put("/{id}")
  public update(
    @Path() id: string,
    @Body() body: UpdateLabTestDto,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return LabTestService.update(id, body, req);
  }

  @Delete("/{id}")
  public remove(
    @Path() id: string,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return LabTestService.remove(id, req);
  }

  @Get("/categories/list")
  public categories(@Request() req: ExpressRequest): Promise<any> {
    return LabTestService.getCategories(req);
  }

  @Get("/panels/list")
  public panelsAndProfiles(@Request() req: ExpressRequest): Promise<any> {
    return LabTestService.getPanelsAndProfiles(req);
  }

  @Get("/pricing/list")
  public pricingList(@Request() req: ExpressRequest): Promise<any> {
    return LabTestService.getPricingList(req);
  }
}
