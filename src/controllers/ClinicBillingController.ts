import {
  Body,
  Controller,
  Delete,
  Get,
  Middlewares,
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
import { checkRoleAuto } from "../middlewares";
import { ClinicRole, roles } from "../utils/roles";

@Tags("Billing")
@Route("api/billing")
@Security("jwt")
export class ClinicBillingController extends Controller {
  @Get("/")
  @Middlewares(
    checkRoleAuto(
      roles.COMPANY_ADMIN,
      ClinicRole.CLINIC_ADMIN,
      ClinicRole.ACCOUNTANT
    )
  )
  public list(@Request() req: ExpressRequest) {
    const { page, limit, patientId, encounterId } = req.query;
    return ClinicBillingService.list(
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined,
      {
        patientId: patientId as string | undefined,
        encounterId: encounterId as string | undefined,
      }
    );
  }

  @Get("/overdue")
  @Middlewares(
    checkRoleAuto(
      roles.COMPANY_ADMIN,
      ClinicRole.CLINIC_ADMIN,
      ClinicRole.ACCOUNTANT
    )
  )
  public overdue(@Request() req: ExpressRequest) {
    const { page, limit } = req.query;
    return ClinicBillingService.list(
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined,
      { overdue: true }
    );
  }

  @Get("/{id}")
  @Middlewares(
    checkRoleAuto(
      roles.COMPANY_ADMIN,
      ClinicRole.CLINIC_ADMIN,
      ClinicRole.ACCOUNTANT
    )
  )
  public get(id: string) {
    return ClinicBillingService.getById(id);
  }

  @Post("/")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.ACCOUNTANT))
  public create(
    @Request() req: ExpressRequest,
    @Body() body: CreateClinicBillingDto
  ) {
    return ClinicBillingService.create(req, body);
  }

  @Put("/{id}")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.ACCOUNTANT))
  public update(id: string, @Body() body: UpdateClinicBillingDto) {
    return ClinicBillingService.update(id, body);
  }

  @Delete("/{id}")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.ACCOUNTANT))
  public remove(id: string) {
    return ClinicBillingService.remove(id);
  }

  @Put("/{id}/send")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.ACCOUNTANT))
  public send(id: string) {
    return ClinicBillingService.send(id);
  }

  @Put("/{id}/pay")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.ACCOUNTANT))
  public pay(
    id: string,
    @Body()
    body: {
      paymentMethod?: string;
      amount?: number;
      paymentGateway?: string;
      transactionId?: string;
      paymentReceiptUrl?: string;
    }
  ) {
    return ClinicBillingService.pay(
      id,
      body?.paymentMethod,
      body?.amount,
      body?.paymentGateway,
      body?.transactionId,
      body?.paymentReceiptUrl
    );
  }

  @Get("/{id}/payments")
  @Middlewares(
    checkRoleAuto(
      roles.COMPANY_ADMIN,
      ClinicRole.CLINIC_ADMIN,
      ClinicRole.ACCOUNTANT
    )
  )
  public getPaymentHistory(id: string, @Request() req: ExpressRequest) {
    const { page, limit } = req.query;
    if (page || limit) {
      return PaymentGatewayService.getPaymentHistoryPaged(
        id,
        page ? Number(page) : undefined,
        limit ? Number(limit) : undefined
      );
    }
    return PaymentGatewayService.getPaymentHistory(id);
  }

  @Put("/{id}/cancel")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.CLINIC_ADMIN))
  public cancel(id: string) {
    return ClinicBillingService.cancel(id);
  }
}
