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
import { ProviderService } from "../services/ProviderService";
import {
  ProviderScheduleService,
  CreateScheduleDto,
  CreateScheduleBlockDto,
} from "../services/ProviderScheduleService";
import {
  CreateProviderDto,
  UpdateProviderDto,
} from "../utils/interfaces/common";
import { Request as ExpressRequest } from "express";
import { roles } from "../utils/roles";
import { checkRole } from "../middlewares";

@Security("jwt")
@Route("/api/providers")
@Tags("Providers")
export class ProviderController {
  @Get("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getAllProviders(
    @Request() req: ExpressRequest,
    @Query() searchq?: string,
    @Query() limit?: number,
    @Query() page?: number,
  ) {
    return ProviderService.getAllProviders(req, searchq, limit, page);
  }

  @Get("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getProviderById(@Path() id: string, @Request() req: ExpressRequest) {
    return ProviderService.getProviderById(id, req);
  }

  @Post("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public createProvider(
    @Body() body: CreateProviderDto,
    @Request() req: ExpressRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    return ProviderService.createProvider(body, companyId!);
  }

  @Put("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public updateProvider(@Path() id: string, @Body() body: UpdateProviderDto) {
    return ProviderService.updateProvider(id, body);
  }

  @Delete("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public deleteProvider(@Path() id: string) {
    return ProviderService.deleteProvider(id);
  }

  @Post("/{id}/schedule")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public createSchedule(
    @Path() id: string,
    @Request() req: ExpressRequest,
    @Body() body: { schedules: CreateScheduleDto[] },
  ) {
    return ProviderScheduleService.createOrUpdateSchedule(
      req,
      id,
      body.schedules,
    );
  }

  @Get("/{id}/schedule")
  public getSchedule(@Path() id: string) {
    return ProviderScheduleService.getSchedule(id);
  }

  @Post("/{id}/schedule/block")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public blockTime(
    @Path() id: string,
    @Request() req: ExpressRequest,
    @Body() body: CreateScheduleBlockDto,
  ) {
    return ProviderScheduleService.blockTime(req, id, body);
  }

  @Delete("/{id}/schedule/block/{blockId}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public removeBlock(@Path() blockId: string) {
    return ProviderScheduleService.removeBlock(blockId);
  }

  @Get("/{id}/schedule/blocks")
  public getBlocks(@Path() id: string) {
    return ProviderScheduleService.getBlocks(id);
  }
}
