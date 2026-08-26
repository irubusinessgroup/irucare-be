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
  GrantFreeTierDto,
  IResponse,
  TSubscription,
  TUser,
  UpdateSubscriptionDto,
} from "../utils/interfaces/common";
import { checkRole } from "../middlewares";
import { roles, isPlatformRole } from "../utils/roles";
import { Server as SocketIOServer } from "socket.io";

@Tags("Subscription")
@Route("/api/subscriptions")
export class SubscriptionController {
  @Get("/")
  @Security("jwt")
  @Middlewares(checkRole(roles.ADMIN, roles.DEVELOPER))
  public async getSubscriptions(
    @Query() searchq?: string,
    @Query() page?: number,
    @Query() limit?: number,
  ): Promise<IResponse<{ data: TSubscription[]; totalItems: number }>> {
    return SubscriptionService.getActiveSubscriptions(
      searchq,
      page ?? 1,
      limit ?? 20,
    );
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
  @Get("/access-status")
  public async accessStatus(
    @Request() req: ExpressRequest,
  ): Promise<
    IResponse<{
      allowed: boolean;
      reason?: string;
      subscription: TSubscription | null;
      minUsers: number;
      minLocations: number;
    }>
  > {
    const companyId = req.user!.company!.companyId;
    const status = await SubscriptionService.getCompanyAccessStatus(companyId);
    const baseline = await SubscriptionService.getBaselineQuotas(companyId);
    return {
      statusCode: 200,
      message: "Subscription access status",
      data: {
        ...status,
        minUsers: baseline.users,
        minLocations: baseline.locations,
      },
    };
  }

  @Security("jwt")
  @Get("/admin")
  @Middlewares(checkRole(roles.ADMIN, roles.DEVELOPER))
  public async adminList(
    @Request() req: ExpressRequest,
    @Query() searchQuery?: string,
    @Query() searchq?: string,
    @Query() limit?: number,
    @Query() page?: number,
  ): Promise<IResponse<{ data: TSubscription[]; totalItems: number }>> {
    return SubscriptionService.getActiveSubscriptions(
      searchQuery || searchq,
      page ?? 1,
      limit ?? 20,
    );
  }

  @Post("/subscribe")
  @Security("jwt")
  public async subscribe(
    @Body() data: CreateSubscriptionDto,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<TSubscription>> {
    const companyId = req.user!.company!.companyId;
    const io = req.app.get("io") as SocketIOServer;
    return SubscriptionService.createSubscription(data, companyId, io);
  }

  @Post("/renew")
  @Security("jwt")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public async renew(
    @Body() data: CreateSubscriptionDto,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<TSubscription>> {
    const companyId = req.user!.company!.companyId;
    const io = req.app.get("io") as SocketIOServer;
    return SubscriptionService.renewSubscription(data, companyId, io);
  }

  /** Super admin: grant company free access for 3 / 7 / 14 / 30 / 60 days */
  @Post("/admin/grant-free-tier")
  @Security("jwt")
  @Middlewares(checkRole(roles.ADMIN, roles.DEVELOPER))
  public async grantFreeTier(
    @Body() data: GrantFreeTierDto,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<TSubscription>> {
    const io = req.app.get("io") as SocketIOServer;
    return SubscriptionService.grantFreeTier(data, io);
  }

  /**
   * Sync Paypack MoMo status (FE polls like Oazis callback — no cron / no long BE poll)
   */
  @Get("/{id}/payment-status")
  @Security("jwt")
  public async syncPaymentStatus(
    @Path() id: string,
    @Request() req: ExpressRequest,
  ): Promise<
    IResponse<{
      paymentStatus: string;
      subscriptionActive: boolean;
      subscription: TSubscription | null;
    }>
  > {
    const user = req.user as TUser | undefined;
    const roleNames = (user?.userRoles || []).map((r) => r.name as string);
    const isPlatform = isPlatformRole(roleNames);
    const companyId = isPlatform
      ? undefined
      : user?.company?.companyId;
    if (!isPlatform && !companyId) {
      return {
        statusCode: 400,
        message: "Company context required",
        data: {
          paymentStatus: "NONE",
          subscriptionActive: false,
          subscription: null,
        },
      };
    }
    return SubscriptionService.syncSubscriptionPaymentStatus(id, companyId);
  }

  @Get("/{id}")
  @Security("jwt")
  @Middlewares(checkRole(roles.ADMIN))
  public async getSubscription(
    @Path() id: string,
  ): Promise<IResponse<TSubscription | null>> {
    return SubscriptionService.getSubscription(id);
  }

  @Put("/{id}")
  @Security("jwt")
  @Middlewares(checkRole(roles.ADMIN))
  public async updateSubscription(
    @Path() id: string,
    @Body() data: UpdateSubscriptionDto,
  ): Promise<IResponse<TSubscription>> {
    return SubscriptionService.updateSubscription(id, data);
  }

  @Delete("/{id}")
  @Security("jwt")
  @Middlewares(checkRole(roles.ADMIN))
  public async cancelSubscription(
    @Path() id: string,
  ): Promise<IResponse<null>> {
    return SubscriptionService.cancelSubscription(id);
  }

  @Security("jwt")
  @Put("/{id}/deactivate")
  @Middlewares(checkRole(roles.ADMIN, roles.DEVELOPER))
  public async adminDeactivate(
    @Path() id: string,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<TSubscription | null>> {
    const io = req.app.get("io") as SocketIOServer;
    return SubscriptionService.deactivateSubscriptionByAdmin(id, io);
  }

  @Security("jwt")
  @Put("/{id}/activate")
  @Middlewares(checkRole(roles.ADMIN, roles.DEVELOPER))
  public async adminActivate(
    @Path() id: string,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<TSubscription | null>> {
    const io = req.app.get("io") as SocketIOServer;
    return SubscriptionService.activateSubscriptionByAdmin(id, io);
  }
}
