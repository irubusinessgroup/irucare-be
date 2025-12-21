import {
  Body,
  Delete,
  Get,
  Middlewares,
  Path,
  Post,
  Put,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";
import { Request as ExpressRequest } from "express";
import { BranchService } from "../services/BranchService";
import { CreateBranchDto, UpdateBranchDto } from "../utils/interfaces/common";
import { checkRole } from "../middlewares";
import { roles } from "../utils/roles";

@Security("jwt")
@Route("/api/branches")
@Tags("Branches")
export class BranchController {
  @Post("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public async createBranch(
    @Body() data: CreateBranchDto,
    @Request() req: ExpressRequest
  ) {
    const companyId = req.user?.company?.companyId as string;
    return BranchService.createBranch(data, companyId);
  }

  @Get("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public async getBranches(@Request() req: ExpressRequest) {
    const companyId = req.user?.company?.companyId as string;
    return BranchService.getBranches(companyId);
  }

  @Get("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public async getBranch(@Path() id: string, @Request() req: ExpressRequest) {
    const companyId = req.user?.company?.companyId as string;
    return BranchService.getBranch(id, companyId);
  }

  @Put("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public async updateBranch(
    @Path() id: string,
    @Body() data: UpdateBranchDto,
    @Request() req: ExpressRequest
  ) {
    const companyId = req.user?.company?.companyId as string;
    return BranchService.updateBranch(id, data, companyId);
  }

  @Delete("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public async deleteBranch(
    @Path() id: string,
    @Request() req: ExpressRequest
  ) {
    const companyId = req.user?.company?.companyId as string;
    return BranchService.deleteBranch(id, companyId);
  }
}
