/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseService } from "./Service";
import { prisma } from "../utils/client";
import {
  CreatePaymentDto,
  IResponse,
  TPayment,
  UpdatePaymentDto,
  withdrawalPaymentDto,
} from "../utils/interfaces/common";
import AppError from "../utils/error";
import { PaymentMethod } from "@prisma/client";
import { appEnv } from "../config/env";
import axios from "axios";
import crypto from "crypto";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PaypackJs = require("paypack-js").default;

const paypack = PaypackJs.config({
  client_id: appEnv.clientId!,
  client_secret: appEnv.clientSecret!,
});

const LOGIN_URL = `${appEnv.PAYPACK_API_BASE_URL}/auth/agents/authorize`;
const CASHIN_URL = `${appEnv.PAYPACK_API_BASE_URL}/transactions/cashin?Idempotency-Key={idempotency_key}`;
const CASHOUT_URL = `${appEnv.PAYPACK_API_BASE_URL}/transactions/cashout?Idempotency-Key={idempotency_key}`;
const TRANSACTION_STATUS_URL = `${appEnv.PAYPACK_API_BASE_URL}/events/transactions?ref={reference_key}&kind={kind}&client={client}`;
const FIND_TRANSACTION_URL = `${appEnv.PAYPACK_API_BASE_URL}/transactions/find/{referenceKey}`;

export class PaymentService extends BaseService {
  private static async authenticate(): Promise<string> {
    const payload = {
      client_id: appEnv.clientId!,
      client_secret: appEnv.clientSecret!,
    };

    const response = await axios.post(LOGIN_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    return response.data.access;
  }

  private static generateIdempotencyKey(): string {
    return crypto.randomBytes(16).toString("hex");
  }

  public static async findTransaction(referenceKey: string): Promise<any> {
    const token = await this.authenticate();
    const url = FIND_TRANSACTION_URL.replace("{referenceKey}", referenceKey);

    const response = await axios.get(url, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    // Map the response to match the expected format
    return {
      amount: response.data.amount,
      client: response.data.client,
      fee: response.data.fee,
      kind: response.data.kind,
      merchant: response.data.merchant,
      ref: response.data.ref,
      status: response.data.status,
      timestamp: response.data.timestamp,
    };
  }

  public static async checkTransactionStatus(
    referenceKey: string,
    kind: string,
    client: string,
  ): Promise<any> {
    const token = await this.authenticate();
    const url = TRANSACTION_STATUS_URL.replace("{reference_key}", referenceKey)
      .replace("{kind}", kind.toUpperCase())
      .replace("{client}", client);

    const response = await axios.get(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    return response.data.transactions[0].data;
  }

  public static async createPayment(
    paymentData: CreatePaymentDto,
  ): Promise<IResponse<TPayment>> {
    const idempotencyKey = this.generateIdempotencyKey();
    const payload = {
      amount: paymentData.amount,
      number: paymentData.accountNumber,
    };

    const token = await this.authenticate();
    const url = CASHIN_URL.replace("{idempotency_key}", idempotencyKey);

    const cashInResponse = await axios.post(url, payload, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (cashInResponse.data.status === "failed") {
      throw new AppError("Payment failed during cash-in process", 400);
    }

    const payment = await prisma.payment.create({
      data: {
        ...paymentData,
        kind: cashInResponse.data.kind,
        status:
          cashInResponse.data.status === "successful" ? "SUCCEEDED" : "PENDING",
        method: paymentData.method as PaymentMethod,
        paidAt: cashInResponse.data.created_at ?? null,
        accountProvider: cashInResponse.data.provider ?? null,
        refId: cashInResponse.data.ref ?? null,
        orderId: paymentData.orderId!,
        ...(paymentData.accountNumber && {
          accountNumber: paymentData.accountNumber,
        }),
      },
    });

    return {
      statusCode: 201,
      message: "Payment created successfully",
      data: payment,
    };
  }

  public static async createWithdrawal(
    withdrawalData: withdrawalPaymentDto,
  ): Promise<IResponse<any>> {
    const idempotencyKey = this.generateIdempotencyKey();
    const payload = {
      amount: withdrawalData.amount,
      number: withdrawalData.accountNumber,
    };

    const token = await this.authenticate();
    const url = CASHOUT_URL.replace("{idempotency_key}", idempotencyKey);

    try {
      const cashOutResponse = await axios.post(url, payload, {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (cashOutResponse.data.status === "failed") {
        throw new AppError(
          cashOutResponse.data.message ||
            "Withdrawal failed during cash-out process",
          400,
        );
      }

      return {
        statusCode: 201,
        message: "Withdrawal created successfully",
        data: cashOutResponse,
      };
    } catch (error: any) {
      if (
        error.response &&
        error.response.data &&
        error.response.data.message
      ) {
        throw new AppError(
          error.response.data.message,
          error.response.status || 400,
        );
      } else {
        console.error("Axios Error:", error.message);
        throw new AppError("Failed to create withdrawal", 400);
      }
    }
  }

  public static async updatePayment(
    id: string,
    paymentData: Partial<UpdatePaymentDto>,
  ): Promise<IResponse<TPayment>> {
    const payment = await prisma.payment.update({
      where: { id },
      data: {
        ...paymentData,
        method: paymentData.method
          ? (paymentData.method as PaymentMethod)
          : undefined,
        paidAt: paymentData.paidAt ?? null,
        accountProvider: paymentData.accountProvider ?? null,
        refId: paymentData.refId ?? null,
        accountNumber: paymentData.accountNumber,
      },
    });
    return {
      statusCode: 200,
      message: "Payment updated successfully",
      data: payment,
    };
  }

  public static async deletePayment(id: string): Promise<IResponse<null>> {
    await prisma.$transaction(async (prisma) => {
      const payment = await prisma.payment.findUnique({ where: { id } });
      if (!payment) throw new AppError("Payment not found", 404);

      // Delete associated deliveries first
      await prisma.delivery.deleteMany({ where: { orderId: payment.orderId } });

      await prisma.payment.delete({ where: { id } }); // Delete payment
      await prisma.order.delete({ where: { id: payment.orderId } }); // Then delete the associated order
    });

    return {
      statusCode: 200,
      message: "Payment, related deliveries, and order deleted successfully",
      data: null,
    };
  }

  public static async getPayment(id: string): Promise<IResponse<TPayment>> {
    const payment = await prisma.payment.findUnique({
      where: { id },
    });
    if (!payment) throw new AppError("Payment not found", 404);
    return {
      statusCode: 200,
      message: "Payment fetched successfully",
      data: payment,
    };
  }

  public static async getAllPayments(): Promise<IResponse<TPayment[]>> {
    const payments = await prisma.payment.findMany();
    const formattedPayments = payments.map((payment) => ({
      ...payment,
      accountProvider: payment.accountProvider ?? null,
      refId: payment.refId ?? null,
      accountNumber: payment.accountNumber,
      paidAt: payment.paidAt ?? null,
    }));
    return {
      statusCode: 200,
      message: "Payments fetched successfully",
      data: formattedPayments as TPayment[],
    };
  }

  public static async Transactions(): Promise<IResponse<any>> {
    const response = await paypack.transactions({ offset: 0, limit: 100 });
    return {
      statusCode: 200,
      message: "Transactions fetched successfully",
      data: response.data,
    };
  }

  public static async syncAllPaymentsWithTransactions(): Promise<
    IResponse<string>
  > {
    const payments = await prisma.payment.findMany({
      where: {
        status: { not: "SUCCEEDED" },
      },
    });

    for (const payment of payments) {
      if (!payment.refId) continue;

      try {
        const transactionStatus = await this.checkTransactionStatus(
          payment.refId,
          payment.kind,
          payment.accountNumber,
        );
        if (transactionStatus && transactionStatus.status) {
          const newStatus =
            transactionStatus.status === "successful"
              ? "SUCCEEDED"
              : transactionStatus.status === "failed"
                ? "FAILED"
                : "PENDING";

          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: newStatus,
              paidAt: transactionStatus.created_at ?? payment.paidAt,
            },
          });

          if (newStatus === "SUCCEEDED") {
            await prisma.order.update({
              where: { id: payment.orderId },
              data: { status: "CONFIRMED" },
            });
          }
        }
      } catch (error) {
        console.error(
          `Failed to sync payment with refId ${payment.refId}:`,
          error,
        );
      }
    }

    return {
      statusCode: 200,
      message: "All payments synchronized with transaction statuses",
      data: "Synchronization complete",
    };
  }
}
