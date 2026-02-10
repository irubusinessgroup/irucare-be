import {
  Body,
  Get,
  Middlewares,
  Post,
  Put,
  Delete,
  Request,
  Route,
  Security,
  Tags,
  Path,
  Query,
} from "tsoa";
import { checkRole } from "../middlewares";
import { BranchInsuranceService } from "../services/BranchInsuranceService";
import type {
  CreateBranchInsuranceDto,
  UpdateBranchInsuranceDto,
} from "../utils/interfaces/common";
import { roles } from "../utils/roles";
import { Request as ExpressRequest } from "express";

@Security("jwt")
@Route("/api/branch-insurances")
@Tags("Branch Insurance")
export class BranchInsuranceController {
  @Get("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN))
  public getAll(
    @Request() req: ExpressRequest,
    @Query() branchId?: string,
  ) {
    return BranchInsuranceService.getAll(req, branchId);
  }

  @Get("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN))
  public getById(@Path() id: string, @Request() req: ExpressRequest) {
    return BranchInsuranceService.getById(id, req);
  }

  @Post("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public create(
    @Body() body: CreateBranchInsuranceDto,
    @Request() req: ExpressRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    return BranchInsuranceService.create(body, companyId!, req);
  }

  @Put("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public update(
    @Path() id: string,
    @Body() body: UpdateBranchInsuranceDto,
    @Request() req: ExpressRequest,
  ) {
    return BranchInsuranceService.update(id, body, req);
  }

  @Delete("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public delete(@Path() id: string, @Request() req: ExpressRequest) {
    return BranchInsuranceService.delete(id, req);
  }
}
