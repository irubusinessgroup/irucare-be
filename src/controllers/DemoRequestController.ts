import {
  Body,
  Get,
  Middlewares,
  Patch,
  Path,
  Post,
  Put,
  Query,
  Route,
  Security,
  Tags,
} from "tsoa";
import {
  CreateDemoRequestDto,
  ScheduleDemoDto,
} from "../utils/interfaces/common";
import { checkRole } from "../middlewares";
import { roles } from "../utils/roles";
import { DemoRequestService } from "../services/DemoRequestService";
import { Request as ExpressRequest } from "express";
import { Request } from "tsoa";

@Route("/api/demo-requests")
@Tags("Demo Requests")
export class DemoRequestController {
  @Security("jwt")
  @Get("/")
  @Middlewares(checkRole(roles.ADMIN))
  public async getAllDemoRequests(
    @Query() status?: string,
    @Query() limit?: number,
    @Query() page?: number,
  ) {
    return DemoRequestService.getAllDemoRequests(status, limit, page);
  }

  @Security("jwt")
  @Put("/{id}/schedule")
  @Middlewares(checkRole(roles.ADMIN))
  public async scheduleDemo(@Path() id: string, @Body() data: ScheduleDemoDto) {
    return DemoRequestService.scheduleDemo(id, data);
  }

  @Security("jwt")
  @Patch("/{id}/complete")
  @Middlewares(checkRole(roles.ADMIN))
  public async completeDemo(
    @Path() id: string,
    @Body() data: { followUpNotes: string },
  ) {
    return DemoRequestService.completeDemo(id, data);
  }

  @Security("jwt")
  @Patch("/{id}/cancel")
  @Middlewares(checkRole(roles.ADMIN))
  public async cancelDemo(
    @Path() id: string,
    @Body() data: { reason: string },
  ) {
    return DemoRequestService.cancelDemo(id, data);
  }

  @Security("jwt")
  @Patch("/{id}/no-show")
  @Middlewares(checkRole(roles.ADMIN))
  public async markNoShow(@Path() id: string) {
    return DemoRequestService.markNoShow(id);
  }
  @Post("/")
  public async createDemoRequest(
    @Body() data: CreateDemoRequestDto,
    @Request() req: ExpressRequest,
  ) {
    const io = req.app.get("io");
    return DemoRequestService.createDemoRequest(data, io);
  }
}
