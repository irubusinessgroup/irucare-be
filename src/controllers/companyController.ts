import {
  Body,
  Post,
  Route,
  Controller,
  Tags,
  Middlewares,
  Get,
  Put,
  Delete,
  Request,
  Security,
} from "tsoa";
import { companyService } from "../services/companyService";
import { Request as ExpressRequest } from "express";

import { CreateCompanyDto } from "../utils/interfaces/common";
import validate from "../middlewares/validator";
import { createCompanySchema } from "../utils/typeSchemas/company";
import {
  checkCompany,
  appendAttachments,
} from "../middlewares/company.middlewares";
import upload from "../utils/cloudinary";
import { checkRole } from "../middlewares";
import { roles } from "../utils/roles";

@Tags("Company")
@Route("/api/company")
export class CompanyController extends Controller {
  @Get("/")
  public getCompanies(@Request() req: ExpressRequest) {
    const { searchq, limit, page } = req.query;
    const currentPage = page ? parseInt(page as string) : undefined;
    return companyService.getCompanies(
      searchq as string | undefined,
      limit ? parseInt(limit as string) : undefined,
      currentPage,
    );
  }

  @Get("/analysis/count-by-month/{year}")
  public getSchoolsCountByMonth(year: number) {
    return companyService.getCompaniesCountByMonth(year);
  }

  @Put("/{id}/vat-access")
  @Security("jwt")
  @Middlewares(checkRole(roles.ADMIN))
  public setVatAccess(
    id: string,
    @Body() body: { allowVatModeSwitch: boolean },
  ) {
    return companyService.setAllowVatModeSwitch(id, !!body.allowVatModeSwitch);
  }

  @Put("/{id}/vat-mode")
  @Security("jwt")
  @Middlewares(checkRole(roles.ADMIN))
  public adminSetVatMode(id: string, @Body() body: { isVatMode: boolean }) {
    return companyService.adminSetVatMode(id, !!body.isVatMode);
  }

  @Get("/{id}")
  @Middlewares(checkCompany)
  public getSchool(id: string) {
    return companyService.getCompany(id);
  }

  @Post("/")
  @Middlewares(upload.any(), appendAttachments, validate(createCompanySchema))
  public async addCompany(@Body() company: CreateCompanyDto) {
    return await companyService.createCompany(company);
  }

  @Put("/{id}")
  @Middlewares(upload.any(), appendAttachments)
  public updateCompany(id: string, @Body() company: CreateCompanyDto) {
    return companyService.updateCompany(id, company);
  }

  @Delete("/{id}")
  @Middlewares(checkCompany)
  public deleteCompany(id: string) {
    return companyService.deleteCompanyWithRelations(id);
  }
}
