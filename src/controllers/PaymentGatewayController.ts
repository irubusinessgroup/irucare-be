import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  Route,
  Security,
  Tags,
  Path,
  Query,
} from "tsoa";
import type { Request as ExpressRequest } from "express";
import {
  PaymentGatewayService,
  ProcessPaymentDto,
} from "../services/PaymentGatewayService";

@Tags("Payment Gateway")
@Route("api/payment-gateways")
@Security("jwt")
export class PaymentGatewayController extends Controller {
  @Post("/process")
  public processPayment(
    @Request() req: ExpressRequest,
    @Body() body: ProcessPaymentDto,
  ) {
    return PaymentGatewayService.processPayment(req, body);
  }

  @Get("/")
  public getPaymentGateways(@Request() req: ExpressRequest) {
    return PaymentGatewayService.getPaymentGateways(req);
  }

  @Get("/billing/{billingId}/payments")
  public getPaymentHistory(
    @Path() billingId: string,
    @Query() page?: number,
    @Query() limit?: number,
  ) {
    if (page || limit) {
      return PaymentGatewayService.getPaymentHistoryPaged(
        billingId,
        page,
        limit,
      );
    }
    return PaymentGatewayService.getPaymentHistory(billingId);
  }
}
