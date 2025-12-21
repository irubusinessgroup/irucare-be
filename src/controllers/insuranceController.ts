import {
  Body,
  Get,
  Post,
  Put,
  Delete,
  Route,
  Tags,
  Path,
  Security,
  Request,
  Query,
  Middlewares,
} from "tsoa";
import { InsuranceService } from "../services/InsuranceService";
import {
  CreateInsuranceDto,
  UpdateInsuranceDto,
} from "../utils/interfaces/common";
import { Request as ExpressRequest } from "express";
import { roles } from "../utils/roles";
import { checkRole } from "../middlewares";

@Security("jwt")
@Route("/api/insurance")
@Tags("Insurance")
export class InsuranceController {
  @Get("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN))
  public getAllInsurance(
    @Request() req: ExpressRequest,
    @Query() searchq?: string,
    @Query() limit?: number,
    @Query() page?: number
  ) {
    return InsuranceService.getAllInsurance(req, searchq, limit, page);
  }

  @Post("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN))
  public createInsurance(
    @Body() body: CreateInsuranceDto,
    @Request() req: ExpressRequest
  ) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    return InsuranceService.createInsurance(body, companyId!, branchId);
  }

  @Put("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN))
  public updateInsurance(
    @Path() id: string,
    @Body() body: UpdateInsuranceDto,
    @Request() req: ExpressRequest
  ) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    return InsuranceService.updateInsurance(id, body, companyId!, branchId);
  }

  @Delete("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN))
  public deleteInsurance(@Path() id: string, @Request() req: ExpressRequest) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    return InsuranceService.deleteInsurance(id, companyId!, branchId);
  }
}
