/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Body,
  Delete,
  Get,
  Middlewares,
  Path,
  Post,
  Put,
  Route,
  Security,
  Tags,
} from "tsoa";
import {
  CreatePaymentDto,
  IResponse,
  TPayment,
  withdrawalPaymentDto,
} from "../utils/interfaces/common";
import { PaymentService } from "../services/PaymentService";
import { checkRole } from "../middlewares";
import { roles } from "../utils/roles";

@Tags("Payment")
@Route("/api/payment")
export class PaymentController {
  @Get("/")
  @Security("jwt")
  @Middlewares(checkRole(roles.ADMIN, roles.DEVELOPER))
  public async getAllPayments(): Promise<IResponse<TPayment[]>> {
    return PaymentService.getAllPayments();
  }

  /** @deprecated Prefer POST /api/payments/paypack/cashout */
  @Post("/cashout")
  @Security("jwt")
  @Middlewares(checkRole(roles.ADMIN, roles.DEVELOPER))
  public async cashOut(
    @Body() paymentData: withdrawalPaymentDto,
  ): Promise<any> {
    return PaymentService.createWithdrawal(paymentData);
  }

  /** @deprecated Prefer GET /api/payments/paypack/transactions */
  @Get("/history")
  @Security("jwt")
  @Middlewares(checkRole(roles.ADMIN, roles.DEVELOPER))
  public async getTransactionHistory(): Promise<any> {
    return PaymentService.Transactions();
  }

  @Post("/")
  @Security("jwt")
  @Middlewares(checkRole(roles.ADMIN, roles.DEVELOPER))
  public async createPayment(
    @Body() paymentData: CreatePaymentDto,
  ): Promise<IResponse<TPayment>> {
    return PaymentService.createPayment(paymentData);
  }

  @Put("/{id}")
  @Security("jwt")
  @Middlewares(checkRole(roles.ADMIN, roles.DEVELOPER))
  public async updatePayment(
    @Path() id: string,
    @Body() paymentData: Partial<CreatePaymentDto>,
  ): Promise<IResponse<TPayment>> {
    return PaymentService.updatePayment(id, paymentData);
  }

  @Delete("/{id}")
  @Security("jwt")
  @Middlewares(checkRole(roles.ADMIN, roles.DEVELOPER))
  public async deletePayment(@Path() id: string): Promise<IResponse<null>> {
    return PaymentService.deletePayment(id);
  }

  @Get("/{id}")
  @Security("jwt")
  @Middlewares(checkRole(roles.ADMIN, roles.DEVELOPER))
  public async getPayment(@Path() id: string): Promise<IResponse<TPayment>> {
    return PaymentService.getPayment(id);
  }

  @Get("/transaction/{refId}")
  @Security("jwt")
  @Middlewares(checkRole(roles.ADMIN, roles.DEVELOPER))
  public async getTransactionByRefId(@Path() refId: string): Promise<any> {
    return PaymentService.findTransaction(refId);
  }
}
