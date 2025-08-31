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
import { checkRole } from "../middlewares";
import { roles } from "../utils/roles";
import {
  CreateCompanyToolsDto,
  UpdateCompanyToolsDto,
} from "../utils/interfaces/common";

@Security("jwt")
@Route("/api/company-tools")
@Tags("CompanyTools")
export class CompanyToolsController {
  @Post("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public async create(
    @Body() data: CreateCompanyToolsDto,
    @Request() req: ExpressRequest,
  ) {
    const companyId = req.user?.company?.companyId as string;
    return CompanyToolsService.createCompanyTools(data, companyId);
  }

  @Get("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public get(@Path() id: string) {
    return CompanyToolsService.getCompanyTools(id);
  }

  @Put("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public update(
    @Path() id: string,
    @Body() body: UpdateCompanyToolsDto,
    @Request() req: ExpressRequest,
  ) {
    const companyId = req.user?.company?.companyId as string;
    return CompanyToolsService.updateCompanyTools(id, body, companyId);
  }

  @Delete("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public delete(@Path() id: string, @Request() req: ExpressRequest) {
    const companyId = req.user?.company?.companyId as string;
    return CompanyToolsService.deleteCompanyTools(id, companyId);
  }

  @Get("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public list(
    @Request() req: ExpressRequest,
    @Query() limit?: number,
    @Query() page?: number,
  ) {
    return CompanyToolsService.getCompanyToolsList(req, limit, page);
  }
}
