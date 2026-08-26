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
import AppError from "../utils/error";

const companyBranchReaders = checkRole(
  roles.COMPANY_ADMIN,
  roles.BRANCH_ADMIN,
  roles.STAFF,
  roles.ADMIN,
  roles.DEVELOPER,
);

const companyBranchManagers = checkRole(
  roles.COMPANY_ADMIN,
  roles.ADMIN,
  roles.DEVELOPER,
);

function requireCompanyId(req: ExpressRequest): string {
  const companyId = req.user?.company?.companyId;
  if (!companyId) {
    throw new AppError(
      "Select a company context first (platform admins must switch into a company).",
      400,
    );
  }
  return companyId;
}

@Security("jwt")
@Route("/api/branches")
@Tags("Branches")
export class BranchController {
  @Post("/")
  @Middlewares(companyBranchManagers)
  public async createBranch(
    @Body() data: CreateBranchDto,
    @Request() req: ExpressRequest,
  ) {
    const companyId = requireCompanyId(req);
    return BranchService.createBranch(data, companyId);
  }

  @Get("/")
  @Middlewares(companyBranchReaders)
  public async getBranches(@Request() req: ExpressRequest) {
    const companyId = req.user?.company?.companyId;
    // Platform admin on home (no company switch): empty list, not 403
    if (!companyId) {
      return { statusCode: 200, message: "No company context", data: [] };
    }
    return BranchService.getBranches(companyId);
  }

  /**
   * Returns the next available bhfId (01, 02...) for the authenticated company.
   * Used by the frontend to display the upcoming branch ID before form submission.
   */
  @Get("/next-bhf-id")
  @Middlewares(companyBranchManagers)
  public async getNextBhfId(@Request() req: ExpressRequest) {
    const companyId = requireCompanyId(req);
    const nextBhfId = await BranchService.getNextBhfId(companyId);
    return { data: nextBhfId };
  }

  @Get("/{id}")
  @Middlewares(companyBranchReaders)
  public async getBranch(@Path() id: string, @Request() req: ExpressRequest) {
    const companyId = requireCompanyId(req);
    return BranchService.getBranch(id, companyId);
  }

  @Put("/{id}")
  @Middlewares(companyBranchManagers)
  public async updateBranch(
    @Path() id: string,
    @Body() data: UpdateBranchDto,
    @Request() req: ExpressRequest,
  ) {
    const companyId = requireCompanyId(req);
    return BranchService.updateBranch(id, data, companyId);
  }

  @Delete("/{id}")
  @Middlewares(companyBranchManagers)
  public async deleteBranch(
    @Path() id: string,
    @Request() req: ExpressRequest,
  ) {
    const companyId = requireCompanyId(req);
    return BranchService.deleteBranch(id, companyId);
  }
}
