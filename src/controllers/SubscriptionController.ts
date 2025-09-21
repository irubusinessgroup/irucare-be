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
} from "tsoa";
import { Request as ExpressRequest } from "express";
import { SubscriptionService } from "../services/SubscriptionService";
import {
  CreateSubscriptionDto,
  IResponse,
  TSubscription,
  UpdateSubscriptionDto,
} from "../utils/interfaces/common";

@Tags("Subscription")
@Route("/api/subscriptions")
export class SubscriptionController {
  @Get("/")
  public async getMySubscriptions(
    @Request() req: ExpressRequest,
  ): Promise<IResponse<TSubscription[]>> {
    const userId = req.user?.id;
    return SubscriptionService.getUserSubscriptions(userId);
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
}
