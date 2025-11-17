import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";
import type { Request as ExpressRequest } from "express";
import { ClinicBillingService } from "../services/ClinicBillingService";
import { PaymentGatewayService } from "../services/PaymentGatewayService";
import type {
  CreateClinicBillingDto,
  UpdateClinicBillingDto,
} from "../utils/interfaces/common";

@Tags("Billing")
@Route("api/billing")
@Security("jwt")
export class ClinicBillingController extends Controller {
  @Get("/")
  public list(@Request() req: ExpressRequest) {
    const { page, limit, patientId, encounterId } = req.query;
    return ClinicBillingService.list(
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined,
      {
        patientId: patientId as string | undefined,
        encounterId: encounterId as string | undefined,
      },
    );
  }

  @Get("/overdue")
  public overdue(@Request() req: ExpressRequest) {
    const { page, limit } = req.query;
    return ClinicBillingService.list(
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined,
      { overdue: true },
    );
  }

  @Get("/{id}")
  public get(id: string) {
    return ClinicBillingService.getById(id);
  }

  @Post("/")
  public create(
    @Request() req: ExpressRequest,
    @Body() body: CreateClinicBillingDto,
  ) {
    return ClinicBillingService.create(req, body);
  }

  @Put("/{id}")
  public update(id: string, @Body() body: UpdateClinicBillingDto) {
    return ClinicBillingService.update(id, body);
  }

  @Delete("/{id}")
  public remove(id: string) {
    return ClinicBillingService.remove(id);
  }

  @Put("/{id}/send")
  public send(id: string) {
    return ClinicBillingService.send(id);
  }

  @Put("/{id}/pay")
  public pay(
    id: string,
    @Body()
    body: {
      paymentMethod?: string;
      amount?: number;
      paymentGateway?: string;
      transactionId?: string;
      paymentReceiptUrl?: string;
    },
  ) {
    return ClinicBillingService.pay(
      id,
      body?.paymentMethod,
      body?.amount,
      body?.paymentGateway,
      body?.transactionId,
      body?.paymentReceiptUrl,
    );
  }

  @Get("/{id}/payments")
  public getPaymentHistory(id: string, @Request() req: ExpressRequest) {
    const { page, limit } = req.query;
    if (page || limit) {
      return PaymentGatewayService.getPaymentHistoryPaged(
        id,
        page ? Number(page) : undefined,
        limit ? Number(limit) : undefined,
      );
    }
    return PaymentGatewayService.getPaymentHistory(id);
  }

  @Put("/{id}/cancel")
  public cancel(id: string) {
    return ClinicBillingService.cancel(id);
  }
}
