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
import { DrugsCategoriesService } from "../services/DrugsCategoriesService";
import {
  CreateDrugsCategoryDto,
  UpdateDrugsCategoryDto,
} from "../utils/interfaces/common";
import { Request as ExpressRequest } from "express";
import { roles } from "../utils/roles";
import { checkRole } from "../middlewares";

@Security("jwt")
@Route("/api/drugs-categories")
@Tags("Drugs Categories")
export class DrugsCategoriesController {
  @Get("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getAllDrugsCategories(
    @Request() req: ExpressRequest,
    @Query() searchq?: string,
    @Query() limit?: number,
    @Query() page?: number,
  ) {
    return DrugsCategoriesService.getAllDrugsCategories(
      req,
      searchq,
      limit,
      page,
    );
  }

  @Post("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public createDrugsCategory(
    @Body() body: CreateDrugsCategoryDto,
    @Request() req: ExpressRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    return DrugsCategoriesService.createDrugsCategory(body, companyId!);
  }

  @Put("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public updateDrugsCategory(
    @Path() id: string,
    @Body() body: UpdateDrugsCategoryDto,
  ) {
    return DrugsCategoriesService.updateDrugsCategory(id, body);
  }

  @Delete("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public deleteDrugsCategory(@Path() id: string) {
    return DrugsCategoriesService.deleteDrugsCategory(id);
  }
}
