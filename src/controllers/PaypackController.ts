import {
  Body,
  Get,
  Head,
  Middlewares,
  Path,
  Post,
  Query,
  Request,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "tsoa";
import { Request as ExpressRequest } from "express";
import { PaymentService } from "../services/PaymentService";
import {
  IResponse,
  RegisterPaypackTxDto,
  withdrawalPaymentDto,
} from "../utils/interfaces/common";
import { checkRole } from "../middlewares";
import { roles } from "../utils/roles";
import AppError from "../utils/error";
import { appEnv } from "../config/env";
import crypto from "crypto";

@Tags("Paypack")
@Route("/api/payments/paypack")
export class PaypackController {
  /**
   * Paypack dashboard ping (HEAD) — no body / no signature
   */
  @Head("webhook")
  @SuccessResponse(200, "OK")
  public async webhookHead(): Promise<void> {
    return;
  }

  /**
   * Paypack webhook (public). Verifies x-paypack-signature over raw body (Oazis pattern).
   * Activates IRUCARE subscriptions only when Payment.refId matches.
   */
  @Post("webhook")
  @SuccessResponse(200, "OK")
  public async webhook(
    @Request() req: ExpressRequest,
  ): Promise<{ ok: true }> {
    const rawBody = req.rawBody;
    if (!rawBody?.length) {
      throw new AppError(
        "Empty webhook body. Paypack sends application/json with x-paypack-signature.",
        400,
      );
    }

    let body: {
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
    };
    try {
      body = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new AppError("Invalid Paypack webhook payload", 401);
    }

    const signature =
      (req.headers["x-paypack-signature"] as string | undefined) ??
      (req.headers["X-Paypack-Signature"] as string | undefined);

    console.log(
      `Paypack webhook — ref=${body.data?.ref ?? "unknown"}, status=${body.data?.status ?? "unknown"}, bytes=${rawBody.length}`,
    );

    if (!PaymentService.verifyWebhookSignature(rawBody, signature)) {
      throw new AppError("Invalid Paypack webhook signature", 401);
    }

    await PaymentService.processWebhook(body);
    return { ok: true };
  }

  /** Merchant wallet balances (MTN / Airtel / total) */
  @Get("balance")
  @Security("jwt")
  @Middlewares(checkRole(roles.ADMIN, roles.DEVELOPER))
  public async balance(): Promise<
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
    return PaymentService.getMerchantBalance();
  }

  /**
   * Register a Paypack ref from an external IRU product (IRULOVE, IRUCLAIMS, …).
   * Auth: header `x-paypack-registry-key` = PAYPACK_REGISTRY_API_KEY
   * Public (no JWT) — used by sibling backends after MoMo cash-in.
   */
  @Post("register")
  @SuccessResponse(201, "Created")
  public async register(
    @Request() req: ExpressRequest,
    @Body() body: RegisterPaypackTxDto,
  ): Promise<IResponse<{ id: string; refId: string; source: string }>> {
    const expected = String(appEnv.PAYPACK_REGISTRY_API_KEY || "").trim();
    if (!expected) {
      throw new AppError(
        "Paypack registry API key is not configured on this server",
        503,
      );
    }
    const provided = String(
      req.headers["x-paypack-registry-key"] ||
        req.headers["X-Paypack-Registry-Key"] ||
        "",
    ).trim();
    if (!provided) {
      throw new AppError("Missing x-paypack-registry-key header", 401);
    }
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new AppError("Invalid registry API key", 401);
    }
    return PaymentService.registerExternalPaypackTx(body);
  }

  /**
   * Paypack transaction history.
   * scope=all | irucare | irulove | iruclaims
   */
  @Get("transactions")
  @Security("jwt")
  @Middlewares(checkRole(roles.ADMIN, roles.DEVELOPER))
  public async transactions(
    @Query() scope?: "all" | "irucare" | "irulove" | "iruclaims",
    @Query() offset?: number,
    @Query() limit?: number,
    @Query() kind?: string,
  ): Promise<IResponse<any>> {
    const s = String(scope || "all").toLowerCase();
    const normalized = (
      ["all", "irucare", "irulove", "iruclaims"].includes(s) ? s : "all"
    ) as "all" | "irucare" | "irulove" | "iruclaims";
    return PaymentService.getPaypackTransactions({
      scope: normalized,
      offset: offset ?? 0,
      limit: limit ?? 100,
      kind,
    });
  }

  /** Cashout / withdraw to MoMo */
  @Post("cashout")
  @Security("jwt")
  @Middlewares(checkRole(roles.ADMIN, roles.DEVELOPER))
  public async cashout(
    @Body() body: withdrawalPaymentDto,
    @Request() _req: ExpressRequest,
  ): Promise<IResponse<any>> {
    if (!body?.amount || !body?.accountNumber) {
      throw new AppError("amount and accountNumber are required", 400);
    }
    const amount = Number(body.amount);
    // Paypack: cashout below 10,000 RWF fails with rate-fee error
    if (!Number.isFinite(amount) || amount < 10000) {
      throw new AppError(
        "Unable to cashout below 10,000 RWF (Paypack rate fee minimum)",
        400,
      );
    }
    const phone = String(body.accountNumber).replace(/\D/g, "").slice(-10);
    if (phone.length !== 10) {
      throw new AppError("Enter a valid 10-digit MoMo phone number", 400);
    }
    return PaymentService.createWithdrawal({
      amount,
      accountNumber: phone,
    });
  }

  /** Lookup a single Paypack transaction by ref */
  @Get("transaction/{refId}")
  @Security("jwt")
  @Middlewares(checkRole(roles.ADMIN, roles.DEVELOPER))
  public async findByRef(@Path() refId: string): Promise<any> {
    return PaymentService.findTransaction(refId);
  }
}
