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
import { DrugsService } from "../services/DrugsService";
import { CreateDrugDto, UpdateDrugDto } from "../utils/interfaces/common";
import { Request as ExpressRequest } from "express";
import { roles } from "../utils/roles";
import { checkRole } from "../middlewares";

@Security("jwt")
@Route("/api/drugs")
@Tags("Drugs")
export class DrugsController {
  @Get("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getAllDrugs(
    @Request() req: ExpressRequest,
    @Query() searchq?: string,
    @Query() limit?: number,
    @Query() page?: number,
  ) {
    return DrugsService.getAllDrugs(req, searchq, limit, page);
  }

  @Post("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public createDrug(
    @Body() body: CreateDrugDto,
    @Request() req: ExpressRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    return DrugsService.createDrug(body, companyId!);
  }

  @Put("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public updateDrug(@Path() id: string, @Body() body: UpdateDrugDto) {
    return DrugsService.updateDrug(id, body);
  }

  @Delete("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public deleteDrug(@Path() id: string) {
    return DrugsService.deleteDrug(id);
  }
}
