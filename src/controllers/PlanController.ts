import {
  Body,
  Middlewares,
  Delete,
  Get,
  Path,
  Post,
  Put,
  Route,
  Tags,
  Query,
  Security,
} from "tsoa";
import {
  CreatePlanDto,
  IResponse,
  Paged,
  TPlan,
  UpdatePlanDto,
} from "../utils/interfaces/common";
import { PlanService } from "../services/PlanService";
import { roles } from "../utils/roles";
import { checkRole } from "../middlewares";

@Tags("Plan")
@Route("/api/plans")
export class PlanController {
  @Get("/")
  public async getPlans(
    @Query() page?: number,
    @Query() limit?: number,
    @Query() published?: boolean,
  ): Promise<Paged<TPlan[]>> {
    const p = page || 1;
    const l = limit || 20;
    return PlanService.getAllPlans(p, l, !!published);
  }

  @Get("/{id}")
  public async getPlan(@Path() id: string): Promise<IResponse<TPlan | null>> {
    return PlanService.getPlan(id);
  }

  @Post("/")
  @Security("jwt")
  @Middlewares(checkRole(roles.ADMIN))
  public async createPlan(
    @Body() data: CreatePlanDto,
  ): Promise<IResponse<TPlan>> {
    // Optionally check admin role using req.user
    return PlanService.createPlan(data);
  }

  @Put("/{id}")
  @Security("jwt")
  @Middlewares(checkRole(roles.ADMIN))
  public async updatePlan(
    @Path() id: string,
    @Body() data: UpdatePlanDto,
  ): Promise<IResponse<TPlan>> {
    return PlanService.updatePlan(id, data);
  }

  @Delete("/{id}")
  @Security("jwt")
  @Middlewares(checkRole(roles.ADMIN))
  public async deletePlan(@Path() id: string): Promise<IResponse<null>> {
    return PlanService.deletePlan(id);
  }
}
