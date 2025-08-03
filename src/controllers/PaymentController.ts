/* eslint-disable @typescript-eslint/no-explicit-any */
import { Body, Delete, Get, Path, Post, Put, Route, Tags } from "tsoa";
import {
  CreatePaymentDto,
  IResponse,
  TPayment,
  withdrawalPaymentDto,
} from "../utils/interfaces/common";
import { PaymentService } from "../services/PaymentService";

@Tags("Payment")
@Route("/api/payment")
export class PaymentController {
  @Get("/")
  public async getAllPayments(): Promise<IResponse<TPayment[]>> {
    return PaymentService.getAllPayments();
  }

  @Post("/cashout")
  public async cashOut(
    @Body() paymentData: withdrawalPaymentDto,
  ): Promise<any> {
    return PaymentService.createWithdrawal(paymentData);
  }

  @Get("/history")
  public async getTransactionHistory(): Promise<any> {
    return PaymentService.Transactions();
  }

  @Post("/")
  public async createPayment(
    @Body() paymentData: CreatePaymentDto,
  ): Promise<IResponse<TPayment>> {
    return PaymentService.createPayment(paymentData);
  }

  @Put("/{id}")
  public async updatePayment(
    @Path() id: string,
    @Body() paymentData: Partial<CreatePaymentDto>,
  ): Promise<IResponse<TPayment>> {
    return PaymentService.updatePayment(id, paymentData);
  }

  @Delete("/{id}")
  public async deletePayment(@Path() id: string): Promise<IResponse<null>> {
    return PaymentService.deletePayment(id);
  }

  @Get("/{id}")
  public async getPayment(@Path() id: string): Promise<IResponse<TPayment>> {
    return PaymentService.getPayment(id);
  }

  @Get("/transaction/{refId}")
  public async getTransactionByRefId(@Path() refId: string): Promise<any> {
    return PaymentService.findTransaction(refId);
  }
}
