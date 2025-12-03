import {
  Body,
  Get,
  Middlewares,
  Post,
  Put,
  Request,
  Route,
  Security,
  Tags,
  Path,
  Delete,
} from "tsoa";
import { appendNIDAttachment, checkRole } from "../middlewares";
import { CompanyStaffService } from "../services/CompanyStaffService";

import type { CreateCompanyStaffUnionDto } from "../utils/interfaces/common";
import { roles } from "../utils/roles";
import { Request as ExpressRequest } from "express";
import upload from "../utils/cloudinary";
import validate from "../middlewares/validator";
import { createCompanyStaffSchema } from "../utils/typeSchemas/companyStaff";
import { checkCompanyStaff } from "../middlewares/checkCompanyStaff";
import AppError from "../utils/error";

@Security("jwt")
@Route("/api/staff")
@Tags("Company Staff")
export class CompanyStaffController {
  @Get("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getCompanyStaff(@Request() req: ExpressRequest) {
    const { searchq, limit, page } = req.query;
    const currentPage = page ? parseInt(page as string) : undefined;
    return CompanyStaffService.getStaff(
      req,
      searchq as string | undefined,
      limit ? parseInt(limit as string) : undefined,
      currentPage,
    );
  }
  @Get("/my-staff")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getAllMyStaff(@Request() req: ExpressRequest) {
    const { searchq, limit, page } = req.query;
    const currentPage = page ? parseInt(page as string) : undefined;
    return CompanyStaffService.getAllMyStaff(
      req,
      searchq as string | undefined,
      limit ? parseInt(limit as string) : undefined,
      currentPage,
    );
  }
  @Get("/analysis/company/{year}")
  @Security("jwt")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public async getCompanyStaffCountByMonth(
    @Request() request: ExpressRequest,
    @Path() year: number,
  ) {
    const companyId = request.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }
    return CompanyStaffService.getCompanyStaffCountByMonth(companyId, year);
  }

  @Post("/")
  @Middlewares(
    checkRole(roles.COMPANY_ADMIN),
    upload.any(),
    appendNIDAttachment,
    validate(createCompanyStaffSchema),
  )
  public async addCompanyStaffMember(
    @Body() companyStaff: CreateCompanyStaffUnionDto,
    @Request() request: ExpressRequest,
  ) {
    const companyId = request.user?.company?.companyId;
    return CompanyStaffService.createCompanyStaff(companyStaff, companyId!);
  }

  @Get("/{id}")
  @Middlewares(checkCompanyStaff)
  public getSchool(id: string) {
    return CompanyStaffService.getCompanyStaff(id);
  }

  @Put("/{id}")
  @Middlewares(
    checkRole(roles.COMPANY_ADMIN),
    upload.any(),
    appendNIDAttachment,
  )
  public updateCompany(
    id: string,
    @Body() companyStaff: CreateCompanyStaffUnionDto,
    @Request() request: ExpressRequest,
  ) {
    const companyId = request.user?.company?.companyId;
    return CompanyStaffService.updateCompanyStaff(id, companyStaff, companyId!);
  }

  @Delete("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN), checkCompanyStaff)
  public deleteCompanyStaff(id: string) {
    return CompanyStaffService.deleteCompanyStaff(id);
  }
}
