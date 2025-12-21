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
import { InsuranceCardService } from "../services/InsuranceCardService";
import {
  CreateInsuranceCardDto,
  UpdateInsuranceCardDto,
} from "../utils/interfaces/common";
import { Request as ExpressRequest } from "express";
import { roles } from "../utils/roles";
import { checkRole } from "../middlewares";

@Security("jwt")
@Route("/api/insurance-cards")
@Tags("Insurance Cards")
export class InsuranceCardController {
  @Get("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN))
  public getAllInsuranceCards(
    @Request() req: ExpressRequest,
    @Query() searchq?: string,
    @Query() limit?: number,
    @Query() page?: number
  ) {
    return InsuranceCardService.getAllInsuranceCards(req, searchq, limit, page);
  }

  @Post("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN))
  public createInsuranceCard(
    @Body() body: CreateInsuranceCardDto,
    @Request() req: ExpressRequest
  ) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    return InsuranceCardService.createInsuranceCard(body, companyId!, branchId);
  }

  @Put("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN))
  public updateInsuranceCard(
    @Path() id: string,
    @Body() body: UpdateInsuranceCardDto,
    @Request() req: ExpressRequest
  ) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    return InsuranceCardService.updateInsuranceCard(
      id,
      body,
      companyId!,
      branchId
    );
  }

  @Delete("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN))
  public deleteInsuranceCard(
    @Path() id: string,
    @Request() req: ExpressRequest
  ) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    return InsuranceCardService.deleteInsuranceCard(id, companyId!, branchId);
  }
}
