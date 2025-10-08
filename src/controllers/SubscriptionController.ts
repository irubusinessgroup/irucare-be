import {
  Body,
  Delete,
  Get,
  Path,
  Post,
  Put,
  Route,
  Tags,
  Request,
  Security,
  Middlewares,
  Query,
} from "tsoa";
import { Request as ExpressRequest } from "express";
import { SubscriptionService } from "../services/SubscriptionService";
import {
  CreateSubscriptionDto,
  IResponse,
  TSubscription,
  UpdateSubscriptionDto,
} from "../utils/interfaces/common";
import { checkRole } from "../middlewares";
import { roles } from "../utils/roles";
import { Server as SocketIOServer } from "socket.io";

@Tags("Subscription")
@Route("/api/subscriptions")
export class SubscriptionController {
  @Get("/")
  public async getSubscriptions(): Promise<IResponse<TSubscription[]>> {
    return SubscriptionService.getUserSubscriptions();
  }

  @Get("/{id}")
  public async getSubscription(
    @Path() id: string,
  ): Promise<IResponse<TSubscription | null>> {
    return SubscriptionService.getSubscription(id);
  }

  @Post("/subscribe")
  @Security("jwt")
  public async subscribe(
    @Body() data: CreateSubscriptionDto,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<TSubscription>> {
    // Get company from user's session if available
    const companyId = req.user!.company!.companyId;
    return SubscriptionService.createSubscription(data, companyId);
  }

  @Put("/{id}")
  public async updateSubscription(
    @Path() id: string,
    @Body() data: UpdateSubscriptionDto,
  ): Promise<IResponse<TSubscription>> {
    return SubscriptionService.updateSubscription(id, data);
  }

  @Delete("/{id}")
  public async cancelSubscription(
    @Path() id: string,
  ): Promise<IResponse<null>> {
    return SubscriptionService.cancelSubscription(id);
  }

  @Security("jwt")
  @Get("/me")
  public async mySubscriptions(
    @Request() req: ExpressRequest,
  ): Promise<IResponse<TSubscription[]>> {
    const companyId = req.user!.company!.companyId;
    return SubscriptionService.getSubscriptionsByCompany(companyId);
  }

  @Security("jwt")
  @Get("/admin")
  @Middlewares(checkRole(roles.ADMIN))
  public async adminList(
    @Request() req: ExpressRequest,
    @Query() searchQuery?: string,
    @Query() limit?: number,
    @Query() page?: number,
  ): Promise<IResponse<{ data: TSubscription[]; totalItems: number }>> {
    return SubscriptionService.getActiveSubscriptions(searchQuery, limit, page);
  }

  @Security("jwt")
  @Put("/{id}/deactivate")
  @Middlewares(checkRole(roles.ADMIN))
  public async adminDeactivate(
    @Path() id: string,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<TSubscription | null>> {
    const io = req.app.get("io") as SocketIOServer;
    return SubscriptionService.deactivateSubscriptionByAdmin(id, io);
  }
}
