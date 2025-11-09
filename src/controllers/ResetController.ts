import type { Request as ExpressRequest } from "express";
import {
  Body,
  Controller,
  Middlewares,
  Post,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";
import { checkRole } from "../middlewares/checkRole";
import { userBelongsToACompany } from "../middlewares/company.middlewares";
import { validateResetToken } from "../middlewares/validateResetToken";
import validate from "../middlewares/validator";
import { BackupService } from "../services/BackupService";
import { ResetService } from "../services/ResetService";
import { roles } from "../utils/roles";
import { factoryResetRequestSchema } from "../utils/typeSchemas/reset";
import type {
  FactoryResetRequestDto,
  ResetResponseDto,
  ResetTokenResponseDto,
} from "../utils/typeSchemas/reset";

@Tags("Reset")
@Route("/api/reset")
export class ResetController extends Controller {
  @Post("/company-data")
  @Security("jwt")
  @Middlewares(checkRole(roles.COMPANY_ADMIN), userBelongsToACompany)
  public async resetCompanyData(@Request() req: ExpressRequest): Promise<{
    message: string;
    statusCode: number;
  }> {
    const companyId = req.user?.company?.companyId;

    if (!companyId) {
      throw new Error("Company ID is missing");
    }

    return await ResetService.resetCompanyData(companyId);
  }

  @Post("/generate-token")
  @Security("jwt")
  @Middlewares(checkRole(roles.ADMIN))
  public async generateResetToken(
    @Request() req: ExpressRequest,
  ): Promise<ResetTokenResponseDto> {
    const userId = req.user?.id;

    if (!userId) {
      throw new Error("User ID is missing");
    }

    return await ResetService.generateResetToken(userId);
  }

  @Post("/factory")
  @Security("jwt")
  @Middlewares(
    checkRole(roles.ADMIN),
    validateResetToken,
    validate(factoryResetRequestSchema),
  )
  public async factoryReset(
    @Request() req: ExpressRequest,
    @Body() body: FactoryResetRequestDto,
  ): Promise<ResetResponseDto> {
    // @ts-ignore
    const userId = req.user?.id;

    if (!userId) {
      throw new Error("User ID is missing");
    }

    // Step 1: Create backup before proceeding
    const backup = await BackupService.createDatabaseBackup(userId);

    const result = await ResetService.factoryReset(
      userId,
      body.resetType,
      backup.path,
    );

    return {
      message: result.message,
      backupPath: backup.path,
      requiresSetup: result.requiresSetup,
      seedComplete: result.seedComplete,
    };
  }
}
