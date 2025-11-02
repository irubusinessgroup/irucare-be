import {
  Body,
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
import { Request as ExpressRequest } from "express";
import { CompanyToolsService } from "../services/CompanyToolsService";
import { appendCompanyToolsAttachments, checkRole } from "../middlewares";
import { roles } from "../utils/roles";
import {
  CreateCompanyToolsDto,
  UpdateCompanyToolsDto,
  CompanyToolsResponseDto,
} from "../utils/interfaces/common";
import upload from "../utils/cloudinary";

@Security("jwt")
@Route("/api/company-tools")
@Tags("CompanyTools")
export class CompanyToolsController {
  @Post("/")
  @Middlewares(
    checkRole(roles.COMPANY_ADMIN),
    upload.any(),
    appendCompanyToolsAttachments,
  )
  public async create(
    @Body() data: CreateCompanyToolsDto,
    @Request() req: ExpressRequest,
  ): Promise<{ message: string; data: CompanyToolsResponseDto }> {
    const companyId = req.user?.company?.companyId as string;
    return CompanyToolsService.createCompanyTools(data, companyId);
  }

  @Get("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public get(
    @Path() id: string,
  ): Promise<{ message: string; data: CompanyToolsResponseDto }> {
    return CompanyToolsService.getCompanyTools(id);
  }

  @Get("/company/current")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getCurrentCompanyTools(
    @Request() req: ExpressRequest,
  ): Promise<{ message: string; data: CompanyToolsResponseDto | null }> {
    const companyId = req.user?.company?.companyId as string;
    return CompanyToolsService.getCompanyToolsByCompanyId(companyId);
  }

  @Put("/{id}")
  @Middlewares(
    checkRole(roles.COMPANY_ADMIN),
    upload.any(),
    appendCompanyToolsAttachments,
  )
  public update(
    @Path() id: string,
    @Body() body: UpdateCompanyToolsDto,
    @Request() req: ExpressRequest,
  ): Promise<{ message: string; data: CompanyToolsResponseDto }> {
    const companyId = req.user?.company?.companyId as string;
    return CompanyToolsService.updateCompanyTools(id, body, companyId);
  }

  @Delete("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public delete(
    @Path() id: string,
    @Request() req: ExpressRequest,
  ): Promise<{ message: string }> {
    const companyId = req.user?.company?.companyId as string;
    return CompanyToolsService.deleteCompanyTools(id, companyId);
  }

  @Get("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public list(
    @Request() req: ExpressRequest,
    @Query() limit?: number,
    @Query() page?: number,
  ): Promise<{
    data: CompanyToolsResponseDto[];
    totalItems: number;
    currentPage: number;
    itemsPerPage: number;
    message: string;
  }> {
    return CompanyToolsService.getCompanyToolsList(req, limit, page);
  }

  @Get("/dashboard/str")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getSTRDashboard(@Request() req: ExpressRequest) {
    return CompanyToolsService.getSTRDashboard(req);
  }
}
