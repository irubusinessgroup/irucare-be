/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseService } from "./Service";
import { prisma } from "../utils/client";
import {
  CreatePaymentDto,
  IResponse,
  RegisterPaypackTxDto,
  TPayment,
  UpdatePaymentDto,
  withdrawalPaymentDto,
} from "../utils/interfaces/common";
import AppError from "../utils/error";
import { PaymentMethod, Prisma } from "@prisma/client";
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
    if (!appEnv.PAYPACK_API_BASE_URL) {
      throw new AppError("PAYPACK_API_BASE_URL is not configured", 500);
    }

    const payload = {
      client_id: appEnv.clientId!,
      client_secret: appEnv.clientSecret!,
    };

    try {
      const response = await axios.post(LOGIN_URL, payload, {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });

      return response.data.access;
    } catch (error: any) {
      // Surface axios error details when available
      if (error.response && error.response.data) {
        const message =
          error.response.data.message || JSON.stringify(error.response.data);
        throw new AppError(
          `Failed to authenticate with payment provider: ${message}`,
          error.response.status || 502,
        );
      }

      // Network or other errors
      throw new AppError(
        `Failed to authenticate with payment provider: ${error.message}`,
        502,
      );
    }
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
        "X-Webhook-Mode": appEnv.PAYPACK_WEBHOOK_MODE || "development",
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
        subscriptionId: paymentData.subscriptionId!,
        ...(paymentData.accountNumber && {
          accountNumber: paymentData.accountNumber,
        }),
      },
    });

    if (payment.refId) {
      await this.upsertPaypackTxRegistry({
        source: "IRUCARE",
        refId: payment.refId,
        externalId: payment.id,
        amount: payment.amount,
        phone: payment.accountNumber,
        status: payment.status,
        kind: payment.kind,
        metadata: { subscriptionId: payment.subscriptionId },
      }).catch((err) =>
        console.warn("[PaypackRegistry] IRUCARE upsert failed:", err),
      );
    }

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
          "X-Webhook-Mode": appEnv.PAYPACK_WEBHOOK_MODE || "development",
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
      // await prisma.delivery.deleteMany({ where: { orderId: payment.orderId } });

      await prisma.payment.delete({ where: { id } }); // Delete payment
      await prisma.subscription.delete({
        where: { id: payment.subscriptionId },
      }); // Then delete the associated order
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

  /** HMAC-SHA256 of raw body vs x-paypack-signature (Oazis verifyWebhookSignature) */
  public static verifyWebhookSignature(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): boolean {
    if (!rawBody?.length || !signature?.trim()) {
      console.warn("[WebhookSignature] missing raw body or signature");
      return false;
    }

    const secret = String(appEnv.PAYPACK_WEBHOOK_SIGN_KEY || "")
      .trim()
      .replace(/^"|"$/g, "");
    if (!secret) {
      console.warn("[WebhookSignature] PAYPACK_WEBHOOK_SIGN_KEY not set");
      return false;
    }

    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("base64");
    const received = signature.trim();

    if (expected.length !== received.length) {
      console.warn("[WebhookSignature] length mismatch");
      return false;
    }

    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(received),
      );
    } catch {
      return false;
    }
  }

  public static async processWebhook(payload: {
    kind?: string;
    data?: {
      ref?: string;
      kind?: string;
      status?: string;
      amount?: number;
      client?: string;
      provider?: string;
      fee?: number;
    };
  }): Promise<{ ok: boolean; handled: boolean }> {
    if (payload.kind !== "transaction:processed") {
      return { ok: true, handled: false };
    }
    if (payload.data?.kind !== "CASHIN") {
      // Cashouts are admin-initiated; no subscription activation
      return { ok: true, handled: false };
    }

    const ref = payload.data?.ref;
    const status = payload.data?.status;
    if (!ref || !status) {
      return { ok: true, handled: false };
    }

    // Lazy import avoids circular dependency at module load
    const { SubscriptionService } = await import("./SubscriptionService");
    const result = await SubscriptionService.applyPaypackCashinByRef(ref, status, {
      amount: payload.data?.amount,
      provider: payload.data?.provider,
      client: payload.data?.client,
      fee: payload.data?.fee,
      source: "webhook",
    });

    return { ok: true, handled: result.handled };
  }

  public static async getMerchantBalance(): Promise<
    IResponse<{
      id: string;
      name: string;
      balance: number;
      mtn_balance: number;
      airtel_balance: number;
      in_rate: number;
      out_rate: number;
    }>
  > {
    try {
      const response = await paypack.me();
      return {
        statusCode: 200,
        message: "Paypack merchant balance",
        data: response.data,
      };
    } catch (error: any) {
      throw new AppError(
        error?.message || "Failed to fetch Paypack balance",
        502,
      );
    }
  }

  static readonly ALLOWED_TX_SOURCES = [
    "IRUCARE",
    "IRULOVE",
    "IRUCLAIMS",
  ] as const;

  /** Upsert ownership of a Paypack ref for a known IRU product. */
  public static async upsertPaypackTxRegistry(
    data: RegisterPaypackTxDto,
  ): Promise<{
    id: string;
    refId: string;
    source: string;
    externalId: string | null;
  }> {
    const source = String(data.source || "")
      .trim()
      .toUpperCase();
    const refId = String(data.refId || "").trim();
    if (!refId) {
      throw new AppError("refId is required", 400);
    }
    if (
      !this.ALLOWED_TX_SOURCES.includes(
        source as (typeof this.ALLOWED_TX_SOURCES)[number],
      )
    ) {
      throw new AppError(
        `Invalid source. Allowed: ${this.ALLOWED_TX_SOURCES.join(", ")}`,
        400,
      );
    }

    const phone = data.phone
      ? String(data.phone).replace(/\D/g, "").slice(-10)
      : null;

    const metadataJson =
      data.metadata != null
        ? (data.metadata as Prisma.InputJsonValue)
        : undefined;

    const row = await prisma.paypackTxRegistry.upsert({
      where: { refId },
      create: {
        refId,
        source,
        externalId: data.externalId ?? null,
        amountRwf:
          data.amount != null && Number.isFinite(Number(data.amount))
            ? Number(data.amount)
            : null,
        phone: phone && phone.length === 10 ? phone : null,
        status: data.status ?? null,
        kind: data.kind ?? null,
        metadata: metadataJson,
      },
      update: {
        source,
        ...(data.externalId != null ? { externalId: data.externalId } : {}),
        ...(data.amount != null && Number.isFinite(Number(data.amount))
          ? { amountRwf: Number(data.amount) }
          : {}),
        ...(phone && phone.length === 10 ? { phone } : {}),
        ...(data.status != null ? { status: data.status } : {}),
        ...(data.kind != null ? { kind: data.kind } : {}),
        ...(metadataJson != null ? { metadata: metadataJson } : {}),
      },
    });

    return {
      id: row.id,
      refId: row.refId,
      source: row.source,
      externalId: row.externalId,
    };
  }

  public static async registerExternalPaypackTx(
    data: RegisterPaypackTxDto,
  ): Promise<IResponse<{ id: string; refId: string; source: string }>> {
    const source = String(data.source || "")
      .trim()
      .toUpperCase();
    // IRUCARE registers itself via Payment create; external apps must not claim IRUCARE
    if (source === "IRUCARE") {
      throw new AppError(
        "IRUCARE refs are registered automatically. Use IRULOVE or IRUCLAIMS.",
        400,
      );
    }
    const row = await this.upsertPaypackTxRegistry(data);
    return {
      statusCode: 201,
      message: "Paypack transaction registered",
      data: { id: row.id, refId: row.refId, source: row.source },
    };
  }

  /**
   * Paypack ledger + ownership from PaypackTxRegistry / local Payment.
   * scope=all | irucare | irulove | iruclaims
   */
  public static async getPaypackTransactions(options?: {
    scope?: "all" | "irucare" | "irulove" | "iruclaims";
    offset?: number;
    limit?: number;
    kind?: string;
  }): Promise<
    IResponse<{
      scope: string;
      offset: number;
      limit: number;
      cashin: number;
      cashout: number;
      fee: number;
      total: number;
      transactions: Array<{
        ref: string;
        amount: number;
        fee?: number;
        kind: string;
        status?: string;
        provider?: string;
        client?: string;
        merchant?: string;
        timestamp?: string;
        /** IRUCARE | IRULOVE | IRUCLAIMS | UNKNOWN */
        source: string;
        registry?: {
          source: string;
          externalId: string | null;
          status: string | null;
        } | null;
        irucare?: {
          paymentId: string;
          paymentStatus: string;
          subscriptionId: string;
          companyName?: string | null;
          subscriberEmail?: string | null;
        } | null;
      }>;
    }>
  > {
    const rawScope = String(options?.scope || "all").toLowerCase();
    const scope = (
      ["all", "irucare", "irulove", "iruclaims"].includes(rawScope)
        ? rawScope
        : "all"
    ) as "all" | "irucare" | "irulove" | "iruclaims";
    const offset = options?.offset ?? 0;
    const limit = Math.min(options?.limit ?? 100, 200);

    const response = await paypack.transactions({
      offset,
      limit,
      ...(options?.kind ? { kind: options.kind } : {}),
    });

    const ledger = response.data;
    const txs = ledger.transactions || [];

    const refs = txs.map((t: any) => t.ref).filter(Boolean) as string[];
    const [localPayments, registryRows] = await Promise.all([
      refs.length === 0
        ? Promise.resolve([])
        : prisma.payment.findMany({
            where: { refId: { in: refs } },
            include: {
              subscription: {
                select: {
                  id: true,
                  email: true,
                  company: { select: { name: true } },
                },
              },
            },
          }),
      refs.length === 0
        ? Promise.resolve([])
        : prisma.paypackTxRegistry.findMany({
            where: { refId: { in: refs } },
          }),
    ]);

    const byRef = new Map(
      localPayments.map((p) => [
        p.refId as string,
        {
          paymentId: p.id,
          paymentStatus: p.status,
          subscriptionId: p.subscriptionId,
          companyName: p.subscription?.company?.name ?? null,
          subscriberEmail: p.subscription?.email ?? null,
        },
      ]),
    );

    const registryByRef = new Map(
      registryRows.map((r) => [
        r.refId,
        {
          source: r.source,
          externalId: r.externalId,
          status: r.status,
        },
      ]),
    );

    // Backfill IRUCARE registry for local payments missing a registry row
    for (const p of localPayments) {
      if (!p.refId || registryByRef.has(p.refId)) continue;
      this.upsertPaypackTxRegistry({
        source: "IRUCARE",
        refId: p.refId,
        externalId: p.id,
        amount: p.amount,
        phone: p.accountNumber,
        status: p.status,
        kind: p.kind,
        metadata: { subscriptionId: p.subscriptionId },
      }).catch(() => {});
      registryByRef.set(p.refId, {
        source: "IRUCARE",
        externalId: p.id,
        status: p.status,
      });
    }

    type EnrichedTx = {
      ref: string;
      amount: number;
      fee?: number;
      kind: string;
      status?: string;
      provider?: string;
      client?: string;
      merchant?: string;
      timestamp?: string;
      source: string;
      registry: {
        source: string;
        externalId: string | null;
        status: string | null;
      } | null;
      irucare: {
        paymentId: string;
        paymentStatus: string;
        subscriptionId: string;
        companyName?: string | null;
        subscriberEmail?: string | null;
      } | null;
    };

    let enriched: EnrichedTx[] = txs.map((t: any): EnrichedTx => {
      const irucare = byRef.get(t.ref) ?? null;
      const registry = registryByRef.get(t.ref) ?? null;
      let source = "UNKNOWN";
      if (registry?.source) source = registry.source;
      else if (irucare) source = "IRUCARE";

      return {
        ref: t.ref,
        amount: t.amount,
        fee: t.fee,
        kind: t.kind,
        status: t.status,
        provider: t.provider,
        client: t.client,
        merchant: t.merchant,
        timestamp: t.timestamp,
        source,
        registry,
        irucare,
      };
    });

    if (scope === "irucare") {
      enriched = enriched.filter((t) => t.source === "IRUCARE");
    } else if (scope === "irulove") {
      enriched = enriched.filter((t) => t.source === "IRULOVE");
    } else if (scope === "iruclaims") {
      enriched = enriched.filter((t) => t.source === "IRUCLAIMS");
    }

    const scopeMessages: Record<string, string> = {
      all: "All Paypack merchant transactions (with source labels)",
      irucare: "IRUCARE Paypack transactions",
      irulove: "IRULOVE Paypack transactions",
      iruclaims: "IRUCLAIMS Paypack transactions",
    };

    return {
      statusCode: 200,
      message: scopeMessages[scope] || "Paypack transactions",
      data: {
        scope,
        offset: ledger.offset ?? offset,
        limit: ledger.limit ?? limit,
        cashin: ledger.cashin ?? 0,
        cashout: ledger.cashout ?? 0,
        fee: ledger.fee ?? 0,
        total:
          scope === "all"
            ? (ledger.total ?? enriched.length)
            : enriched.length,
        transactions: enriched,
      },
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
          const { SubscriptionService } = await import("./SubscriptionService");
          await SubscriptionService.applyPaypackCashinByRef(
            payment.refId,
            transactionStatus.status,
            { source: "manual_sync" },
          );
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
