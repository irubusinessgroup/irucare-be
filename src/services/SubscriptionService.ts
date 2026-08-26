import { BaseService } from "./Service";
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import {
  CreateSubscriptionDto,
  GrantFreeTierDto,
  FreeTierDays,
  IResponse,
  TSubscription,
  UpdateSubscriptionDto,
  CreatePaymentDto,
} from "../utils/interfaces/common";
import { Prisma } from "@prisma/client";
import { PaymentService } from "./PaymentService";
import { PaymentMethod } from "@prisma/client";
import { sendEmail, renderTemplate } from "../utils/email";
import { NotificationHelper } from "../utils/notificationHelper";
import { Server as SocketIOServer } from "socket.io";
import { calculatePartnershipPricing } from "../utils/partnershipPricing";

export class SubscriptionService extends BaseService {
  // helper to compute end date from a start date and billing cycle
  private static computeEndDate(startDate: Date, billingCycle?: string) {
    const endDate = new Date(startDate);
    const cycle = (billingCycle || "").toString().toLowerCase();

    const freeMatch = cycle.match(/^free_(\d+)d$/);
    if (freeMatch) {
      endDate.setDate(endDate.getDate() + Number(freeMatch[1]));
      return endDate;
    }

    if (cycle === "welcome_1m") {
      endDate.setMonth(endDate.getMonth() + 1);
      return endDate;
    }

    if (cycle === "month" || cycle === "monthly") {
      endDate.setMonth(endDate.getMonth() + 1);
    } else if (cycle === "year" || cycle === "yearly") {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setDate(endDate.getDate() + 1);
    }

    return endDate;
  }

  /** Latest paid (or active) quotas — renew/upgrade cannot go below these. */
  public static async getBaselineQuotas(companyId: string): Promise<{
    users: number;
    locations: number;
    subscription: TSubscription | null;
  }> {
    const latestPaid = await prisma.subscription.findFirst({
      where: {
        companyId,
        OR: [
          { isActive: true },
          { payment: { status: "SUCCEEDED" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      include: { payment: true },
    });

    return {
      users: latestPaid?.usersCount ?? 1,
      locations: latestPaid?.locationsCount ?? 1,
      subscription: (latestPaid as TSubscription) ?? null,
    };
  }

  public static async getCompanyAccessStatus(companyId: string): Promise<{
    allowed: boolean;
    reason?: string;
    subscription: TSubscription | null;
  }> {
    const now = new Date();
    const active = await prisma.subscription.findFirst({
      where: {
        companyId,
        isActive: true,
        OR: [{ endDate: null }, { endDate: { gt: now } }],
      },
      orderBy: { createdAt: "desc" },
      include: { payment: true },
    });

    if (active) {
      return { allowed: true, subscription: active as TSubscription };
    }

    const latest = await prisma.subscription.findFirst({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });

    if (!latest) {
      return {
        allowed: false,
        reason:
          "No subscription found. Customize and pay for a partnership to continue.",
        subscription: null,
      };
    }

    if (!latest.isActive) {
      return {
        allowed: false,
        reason:
          "Your subscription is inactive. Renew in Settings to continue.",
        subscription: latest as TSubscription,
      };
    }

    return {
      allowed: false,
      reason:
        "Your subscription has expired. Renew in Settings to continue.",
      subscription: latest as TSubscription,
    };
  }

  private static assertUpgradeOnly(
    users: number,
    locations: number,
    minUsers: number,
    minLocations: number,
  ) {
    if (users < minUsers) {
      throw new AppError(
        `Users cannot be decreased. Minimum allowed is ${minUsers}.`,
        400,
      );
    }
    if (locations < minLocations) {
      throw new AppError(
        `Locations cannot be decreased. Minimum allowed is ${minLocations}.`,
        400,
      );
    }
  }

  // helper to activate subscription and return updated record
  private static async activateSubscription(
    subscriptionId: string,
    billingCycle?: string,
    options?: { extendFrom?: Date | null },
  ): Promise<TSubscription | null> {
    const startBase = options?.extendFrom && options.extendFrom > new Date()
      ? options.extendFrom
      : new Date();
    const startDate = new Date();
    const endDate = this.computeEndDate(startBase, billingCycle);

    // Deactivate other active subs for same company
    const sub = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });
    if (sub) {
      await prisma.subscription.updateMany({
        where: {
          companyId: sub.companyId,
          isActive: true,
          id: { not: subscriptionId },
        },
        data: { isActive: false },
      });
    }

    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { isActive: true, startDate, endDate },
    });

    return (await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    })) as TSubscription | null;
  }

  /**
   * Apply Paypack CASHIN result by refId (webhook or status poll).
   * Only updates payments that exist in our DB (IRUCARE-recorded refs).
   */
  public static async applyPaypackCashinByRef(
    ref: string,
    status: string,
    meta?: {
      amount?: number;
      provider?: string;
      client?: string;
      fee?: number;
      source?: string;
    },
  ): Promise<{ handled: boolean; paymentStatus?: string; subscriptionId?: string }> {
    const payment = await prisma.payment.findFirst({
      where: { refId: ref },
      include: {
        subscription: {
          select: {
            id: true,
            companyId: true,
            billingCycle: true,
            isActive: true,
            endDate: true,
          },
        },
      },
    });

    if (!payment) {
      console.warn(`Paypack: no IRUCARE payment for ref=${ref}`);
      return { handled: false };
    }

    if (meta?.amount != null) {
      const local = Math.round(Number(payment.amount));
      const remote = Math.round(Number(meta.amount));
      if (local !== remote) {
        console.warn(
          `Paypack amount mismatch payment=${local} webhook=${remote} ref=${ref}`,
        );
      }
    }

    if (status === "successful") {
      if (payment.status !== "SUCCEEDED") {
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: "SUCCEEDED",
            paidAt: new Date(),
            ...(meta?.provider ? { accountProvider: meta.provider } : {}),
          },
        });
      }

      if (payment.refId) {
        const { PaymentService } = await import("./PaymentService");
        await PaymentService.upsertPaypackTxRegistry({
          source: "IRUCARE",
          refId: payment.refId,
          externalId: payment.id,
          amount: payment.amount,
          phone: payment.accountNumber,
          status: "SUCCEEDED",
          kind: payment.kind,
          metadata: {
            subscriptionId: payment.subscriptionId,
            source: meta?.source ?? "webhook",
          },
        }).catch((err) =>
          console.warn("[PaypackRegistry] IRUCARE success upsert failed:", err),
        );
      }

      if (payment.subscription && !payment.subscription.isActive) {
        const otherActive = await prisma.subscription.findFirst({
          where: {
            companyId: payment.subscription.companyId,
            isActive: true,
            id: { not: payment.subscription.id },
          },
          orderBy: { endDate: "desc" },
        });
        const extendFrom =
          otherActive?.endDate && otherActive.endDate > new Date()
            ? otherActive.endDate
            : null;

        await this.activateSubscription(
          payment.subscription.id,
          payment.subscription.billingCycle || "month",
          { extendFrom },
        );
      }

      return {
        handled: true,
        paymentStatus: "SUCCEEDED",
        subscriptionId: payment.subscriptionId,
      };
    }

    if (status === "failed") {
      if (payment.status !== "FAILED") {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: "FAILED" },
        });
      }
      return {
        handled: true,
        paymentStatus: "FAILED",
        subscriptionId: payment.subscriptionId,
      };
    }

    return {
      handled: true,
      paymentStatus: payment.status,
      subscriptionId: payment.subscriptionId,
    };
  }

  /**
   * Sync Paypack status for a subscription payment (Oazis-style FE poll target).
   * Uses payer phone as Paypack `client` — not app client_id. No cron.
   */
  public static async syncSubscriptionPaymentStatus(
    subscriptionId: string,
    companyId?: string,
  ): Promise<
    IResponse<{
      paymentStatus: string;
      subscriptionActive: boolean;
      subscription: TSubscription | null;
    }>
  > {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: {
          payment: true,
          company: { select: { id: true, name: true } },
        },
      });

      if (!subscription) {
        throw new AppError("Subscription not found", 404);
      }

      if (companyId && subscription.companyId !== companyId) {
        throw new AppError("Subscription not found", 404);
      }

      const payment = subscription.payment;
      if (!payment) {
        return {
          statusCode: 200,
          message: "No payment on this subscription",
          data: {
            paymentStatus: "NONE",
            subscriptionActive: subscription.isActive,
            subscription: subscription as TSubscription,
          },
        };
      }

      if (payment.status === "SUCCEEDED" && subscription.isActive) {
        return {
          statusCode: 200,
          message: "Payment already confirmed",
          data: {
            paymentStatus: "SUCCEEDED",
            subscriptionActive: true,
            subscription: subscription as TSubscription,
          },
        };
      }

      if (payment.status === "FAILED") {
        return {
          statusCode: 200,
          message: "Payment failed",
          data: {
            paymentStatus: "FAILED",
            subscriptionActive: false,
            subscription: subscription as TSubscription,
          },
        };
      }

      const refId = payment.refId;
      const phone = String(payment.accountNumber || "")
        .replace(/\D/g, "")
        .slice(-10);

      if (!refId || phone.length !== 10) {
        return {
          statusCode: 200,
          message: "Payment still pending confirmation",
          data: {
            paymentStatus: payment.status,
            subscriptionActive: subscription.isActive,
            subscription: subscription as TSubscription,
          },
        };
      }

      let tx: { status?: string } | null = null;
      try {
        tx = await PaymentService.checkTransactionStatus(
          String(refId),
          payment.kind || "CASHIN",
          phone,
        );
      } catch (err) {
        console.warn(
          `Paypack status check failed for ref ${refId}:`,
          err instanceof Error ? err.message : err,
        );
      }

      const paypackStatus = tx?.status;

      if (paypackStatus === "successful" || paypackStatus === "failed") {
        const applied = await this.applyPaypackCashinByRef(
          String(refId),
          paypackStatus,
          { source: "status_poll" },
        );
        const refreshed = await prisma.subscription.findUnique({
          where: { id: subscriptionId },
          include: {
            payment: true,
            company: { select: { id: true, name: true } },
          },
        });
        return {
          statusCode: 200,
          message:
            paypackStatus === "successful"
              ? "Payment confirmed"
              : "Payment failed",
          data: {
            paymentStatus: applied.paymentStatus || paypackStatus.toUpperCase(),
            subscriptionActive: !!refreshed?.isActive,
            subscription: refreshed as TSubscription,
          },
        };
      }

      return {
        statusCode: 200,
        message: "Payment still pending — approve the prompt on your phone",
        data: {
          paymentStatus: "PENDING",
          subscriptionActive: subscription.isActive,
          subscription: subscription as TSubscription,
        },
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(error, 500);
    }
  }

  public static async createSubscription(
    data: CreateSubscriptionDto,
    companyId: string,
    io?: SocketIOServer,
    options?: { isRenewal?: boolean },
  ): Promise<IResponse<TSubscription>> {
    try {
      const isRenewal = !!options?.isRenewal;
      const baseline = await this.getBaselineQuotas(companyId);
      const users = Math.max(1, Math.floor(Number(data.users) || 1));
      const locations = Math.max(1, Math.floor(Number(data.locations) || 1));

      this.assertUpgradeOnly(users, locations, baseline.users, baseline.locations);

      const pricing = calculatePartnershipPricing(users, locations, data.billingCycle, {
        includeSetupFee: !isRenewal,
      });

      const subscription = await prisma.subscription.create({
        data: {
          companyId,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
          companyName: data.companyName ?? null,
          address: data.address ?? null,
          city: data.city ?? null,
          country: data.country ?? null,
          paymentMethod: data.paymentMethod,
          paymentPhone: data.paymentPhone ?? null,
          billingAddress: data.billingAddress ?? null,
          cardNumber: data.cardNumber ?? null,
          expiryDate: data.expiryDate ?? null,
          cvv: data.cvv ?? null,
          nameOnCard: data.nameOnCard ?? null,
          selectedPlan: pricing.selectedPlan,
          planId: null,
          planPrice: pricing.subscriptionPrice,
          setupFee: pricing.setupFee || null,
          totalDueToday: pricing.totalDueToday,
          billingCycle: pricing.billingCycle,
          periodLabel: pricing.periodLabel,
          usersCount: pricing.users,
          locationsCount: pricing.locations,
          isActive: false,
        },
      });

      const isPhonePayment =
        typeof data.paymentMethod === "string" &&
        /mobile|mtn|airtel|phone/i.test(data.paymentMethod);

      if (!isPhonePayment || !data.paymentPhone) {
        // Card / other methods are not supported — MoMo only (same as production MoMo flow)
        try {
          await prisma.subscription.delete({ where: { id: subscription.id } });
        } catch (_) {}
        throw new AppError(
          "Only MTN Mobile Money or Airtel Money is accepted. Card payment is not available.",
          400,
        );
      }

      const paymentPhone = String(data.paymentPhone).replace(/\D/g, "").slice(-10);
      if (paymentPhone.length !== 10) {
        try {
          await prisma.subscription.delete({ where: { id: subscription.id } });
        } catch (_) {}
        throw new AppError("Enter a valid 10-digit MoMo phone number", 400);
      }

      const paymentPayload: CreatePaymentDto = {
        subscriptionId: subscription.id,
        amount: pricing.totalDueToday,
        method: data.paymentMethod as PaymentMethod,
        accountNumber: paymentPhone,
      };

      let paymentResponse;
      try {
        paymentResponse = await PaymentService.createPayment(paymentPayload);
      } catch (err) {
        try {
          await prisma.subscription.delete({ where: { id: subscription.id } });
        } catch (_) {}
        throw err instanceof AppError ? err : new AppError("Payment initiation failed", 400);
      }

      const payment = paymentResponse?.data;
      const extendFrom = isRenewal ? baseline.subscription?.endDate : null;

      // Immediate success (rare) — activate now
      if (payment?.status === "SUCCEEDED") {
        const updated = await this.activateSubscription(subscription.id, pricing.billingCycle, {
          extendFrom,
        });
        return {
          statusCode: 201,
          message: "Subscription created and paid",
          data: updated as TSubscription,
        };
      }

      // Oazis-style: return PENDING immediately; FE polls /payment-status (no cron)
      const withPayment = await prisma.subscription.findUnique({
        where: { id: subscription.id },
        include: {
          payment: {
            select: { id: true, status: true, amount: true, method: true, refId: true },
          },
          company: { select: { id: true, name: true } },
        },
      });

      return {
        statusCode: 201,
        message:
          "Payment prompt sent. Approve on your phone; we will confirm shortly.",
        data: withPayment as TSubscription,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(error, 500);
    }
  }

  /** COMPANY_ADMIN renew / upgrade — quotas cannot decrease. */
  public static async renewSubscription(
    data: CreateSubscriptionDto,
    companyId: string,
    io?: SocketIOServer,
  ): Promise<IResponse<TSubscription>> {
    return this.createSubscription(data, companyId, io, { isRenewal: true });
  }

  public static async getSubscription(
    id: string,
  ): Promise<IResponse<TSubscription | null>> {
    try {
      const sub = await prisma.subscription.findUnique({ where: { id } });
      return {
        statusCode: 200,
        message: "Subscription fetched",
        data: sub,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getUserSubscriptions(): Promise<
    IResponse<TSubscription[]>
  > {
    try {
      const subs = await prisma.subscription.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          company: { select: { id: true, name: true } },
          payment: {
            select: { id: true, status: true, amount: true, method: true },
          },
        },
      });
      return {
        statusCode: 200,
        message: "Subscriptions fetched",
        data: subs as TSubscription[],
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getSubscriptionsByCompany(
    companyId: string,
  ): Promise<IResponse<TSubscription[]>> {
    try {
      const subs = await prisma.subscription.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
        include: {
          payment: {
            select: { id: true, status: true, amount: true, method: true },
          },
        },
      });
      return {
        statusCode: 200,
        message: "Subscriptions fetched for company",
        data: subs as TSubscription[],
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getActiveSubscriptions(
    search?: string,
    page = 1,
    limit = 20,
  ): Promise<IResponse<{ data: TSubscription[]; totalItems: number }>> {
    try {
      // Super admin: all company-customized subscriptions (not only active)
      const where: Prisma.SubscriptionWhereInput = {};
      if (search && search.trim()) {
        const q = search.trim();
        where.OR = [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { companyName: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
          { selectedPlan: { contains: q, mode: "insensitive" } },
          { company: { name: { contains: q, mode: "insensitive" } } },
        ];
      }

      const skip = page > 0 ? (page - 1) * limit : 0;

      const [items, total] = await Promise.all([
        prisma.subscription.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            company: { select: { id: true, name: true } },
            payment: {
              select: { id: true, status: true, amount: true, method: true },
            },
          },
        }),
        prisma.subscription.count({ where }),
      ]);

      return {
        statusCode: 200,
        message: "Subscriptions fetched",
        data: { data: items as TSubscription[], totalItems: total },
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async updateSubscription(
    id: string,
    data: UpdateSubscriptionDto,
  ): Promise<IResponse<TSubscription>> {
    try {
      // map status/startedAt changes to schema fields if they were provided
      const updateData = { ...data } as Prisma.SubscriptionUpdateInput;

      const legacy = data as unknown as Record<string, unknown>;

      if (typeof legacy.status === "string") {
        updateData.isActive = legacy.status === "ACTIVE";
      }

      if (legacy.startedAt) {
        // accept string or Date
        const sd = legacy.startedAt as unknown as string | Date;
        updateData.startDate =
          typeof sd === "string" ? new Date(sd) : (sd as Date);
      }

      const updated = await prisma.subscription.update({
        where: { id },
        data: updateData,
      });
      return {
        statusCode: 200,
        message: "Subscription updated",
        data: updated,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async cancelSubscription(id: string): Promise<IResponse<null>> {
    try {
      const sub = await prisma.subscription.findUnique({ where: { id } });
      if (!sub) throw new AppError("Subscription not found", 404);

      // Hard delete — Payment cascades via FK
      await prisma.subscription.delete({ where: { id } });
      return {
        statusCode: 200,
        message: "Subscription deleted",
        data: null,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async deactivateSubscriptionByAdmin(
    id: string,
    io?: SocketIOServer,
  ): Promise<IResponse<TSubscription | null>> {
    try {
      const sub = await prisma.subscription.findUnique({ where: { id } });
      if (!sub) throw new AppError("Subscription not found", 404);

      // Soft deactivate only — keep original endDate so Activate can restore it
      const updated = await prisma.subscription.update({
        where: { id },
        data: { isActive: false },
      });

      // send email to subscriber
      try {
        const html = renderTemplate("subscription-deactivated.html", {
          firstName: updated.firstName,
          companyName: updated.companyName || "",
          plan: updated.selectedPlan || updated.planId || "",
          date: new Date().toLocaleDateString(),
        });
        if (updated.email) {
          await sendEmail({
            to: updated.email,
            subject: "Your subscription has been deactivated",
            html,
          });
        }
      } catch (err) {
        console.error("Failed to send deactivation email:", err);
      }

      // send in-app notification to company members if io provided
      try {
        if (io && updated.companyId) {
          await NotificationHelper.sendToCompany(
            io,
            updated.companyId,
            "Subscription deactivated",
            `Subscription for ${updated.companyName || updated.email} has been deactivated by an admin.`,
            "warning",
            process.env.ADMIN_DASHBOARD_URL
              ? `${process.env.ADMIN_DASHBOARD_URL}/subscriptions/${updated.id}`
              : undefined,
            "subscription",
            updated.id,
          );
        }
      } catch (err) {
        console.error("Failed to send deactivation notification:", err);
      }

      return {
        statusCode: 200,
        message: "Subscription deactivated",
        data: updated as TSubscription,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  /**
   * Super admin re-activates a subscription and restores a valid endDate.
   * Prefer the preserved endDate; if missing/past (legacy deactivate wiped it),
   * recompute from startDate + billingCycle (or from now if that period already ended).
   */
  public static async activateSubscriptionByAdmin(
    id: string,
    io?: SocketIOServer,
  ): Promise<IResponse<TSubscription | null>> {
    try {
      const sub = await prisma.subscription.findUnique({ where: { id } });
      if (!sub) throw new AppError("Subscription not found", 404);

      const now = new Date();
      const fromStart = this.computeEndDate(
        new Date(sub.startDate),
        sub.billingCycle,
      );
      let endDate = sub.endDate ? new Date(sub.endDate) : null;

      if (!endDate || endDate <= now) {
        endDate = fromStart > now ? fromStart : this.computeEndDate(now, sub.billingCycle);
      }

      await prisma.subscription.updateMany({
        where: {
          companyId: sub.companyId,
          isActive: true,
          id: { not: id },
        },
        data: { isActive: false },
      });

      const updated = await prisma.subscription.update({
        where: { id },
        data: { isActive: true, endDate },
        include: {
          company: { select: { id: true, name: true } },
          payment: true,
        },
      });

      try {
        if (io && updated.companyId) {
          await NotificationHelper.sendToCompany(
            io,
            updated.companyId,
            "Subscription activated",
            `Subscription for ${updated.companyName || updated.email} has been re-activated until ${endDate.toLocaleDateString()}.`,
            "success",
            process.env.ADMIN_DASHBOARD_URL
              ? `${process.env.ADMIN_DASHBOARD_URL}/subscriptions/${updated.id}`
              : undefined,
            "subscription",
            updated.id,
          );
        }
      } catch (err) {
        console.error("Failed to send activation notification:", err);
      }

      return {
        statusCode: 200,
        message: "Subscription activated",
        data: updated as TSubscription,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  /**
   * Default trial for every new company: 1 calendar month, 5 users, 1 location.
   * Starts at company creation time.
   */
  public static readonly WELCOME_FREE_TIER = {
    users: 5,
    locations: 1,
    billingCycle: "welcome_1m",
  } as const;

  public static async provisionWelcomeFreeTier(input: {
    companyId: string;
    companyName: string;
    companyEmail?: string | null;
    companyPhone?: string | null;
    contact: {
      firstName: string;
      lastName: string;
      email: string;
      phoneNumber?: string | null;
    };
    startDate: Date;
  }): Promise<TSubscription | null> {
    const { companyId, companyName, contact, startDate } = input;
    const { users, locations, billingCycle } = this.WELCOME_FREE_TIER;

    const existing = await prisma.subscription.findFirst({
      where: { companyId, billingCycle },
    });
    if (existing) return existing as TSubscription;

    const start = new Date(startDate);
    const endDate = this.computeEndDate(start, billingCycle);

    await prisma.subscription.updateMany({
      where: { companyId, isActive: true },
      data: { isActive: false },
    });

    const subscription = await prisma.subscription.create({
      data: {
        companyId,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email || input.companyEmail || `admin@${companyId}.local`,
        phone: contact.phoneNumber || input.companyPhone || "0000000000",
        companyName,
        paymentMethod: "FREE_TIER",
        selectedPlan: `Welcome — 1 month free (${users} users, ${locations} location)`,
        planId: null,
        planPrice: 0,
        setupFee: 0,
        totalDueToday: 0,
        billingCycle,
        periodLabel: "/1 month",
        usersCount: users,
        locationsCount: locations,
        isActive: true,
        startDate: start,
        endDate,
      },
      include: {
        company: { select: { id: true, name: true } },
      },
    });

    return subscription as TSubscription;
  }

  /**
   * Super admin grants a company free access for 3 / 7 / 14 / 30 / 60 days.
   * Creates an active subscription at RWF 0; deactivates other actives for that company.
   */
  public static async grantFreeTier(
    data: GrantFreeTierDto,
    io?: SocketIOServer,
  ): Promise<IResponse<TSubscription>> {
    const allowedDays: FreeTierDays[] = [3, 7, 14, 30, 60];
    const days = Number(data.days) as FreeTierDays;
    if (!allowedDays.includes(days)) {
      throw new AppError(
        "Free tier duration must be 3, 7, 14, 30, or 60 days",
        400,
      );
    }

    const company = await prisma.company.findUnique({
      where: { id: data.companyId },
      include: {
        CompanyUser: {
          where: {
            user: {
              userRoles: {
                some: { name: "COMPANY_ADMIN" },
              },
            },
          },
          take: 1,
          include: { user: true },
        },
      },
    });
    if (!company) throw new AppError("Company not found", 404);

    const [staffCount, branchCount] = await Promise.all([
      prisma.companyUser.count({ where: { companyId: company.id } }),
      prisma.branch.count({ where: { companyId: company.id } }),
    ]);
    const baseline = await this.getBaselineQuotas(company.id);

    const users = Math.max(
      1,
      Math.floor(Number(data.users) || 0) ||
        Math.max(baseline.users, staffCount, 1),
    );
    const locations = Math.max(
      1,
      Math.floor(Number(data.locations) || 0) ||
        Math.max(baseline.locations, branchCount, 1),
    );

    const adminUser = company.CompanyUser[0]?.user;
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + days);

    await prisma.subscription.updateMany({
      where: { companyId: company.id, isActive: true },
      data: { isActive: false },
    });

    const subscription = await prisma.subscription.create({
      data: {
        companyId: company.id,
        firstName: adminUser?.firstName || "Company",
        lastName: adminUser?.lastName || "Admin",
        email: adminUser?.email || company.email || `admin@${company.TIN || company.id}.local`,
        phone: adminUser?.phoneNumber || company.phoneNumber || "0000000000",
        companyName: company.name,
        paymentMethod: "FREE_TIER",
        selectedPlan: `Free tier (${days} days)`,
        planId: null,
        planPrice: 0,
        setupFee: 0,
        totalDueToday: 0,
        billingCycle: `free_${days}d`,
        periodLabel: `/${days} days`,
        usersCount: users,
        locationsCount: locations,
        isActive: true,
        startDate,
        endDate,
      },
      include: {
        company: { select: { id: true, name: true } },
        payment: true,
      },
    });

    try {
      if (io) {
        await NotificationHelper.sendToCompany(
          io,
          company.id,
          "Free tier activated",
          `Your company received a free ${days}-day partnership (${users} users, ${locations} locations) until ${endDate.toLocaleDateString()}.`,
          "success",
          process.env.ADMIN_DASHBOARD_URL
            ? `${process.env.ADMIN_DASHBOARD_URL}/dashboard/profile?tab=subscription`
            : undefined,
          "subscription",
          subscription.id,
        );
      }
    } catch (err) {
      console.error("Failed to send free-tier notification:", err);
    }

    return {
      statusCode: 201,
      message: `Free tier granted for ${days} days`,
      data: subscription as TSubscription,
    };
  }

  public static async runScheduledSubscriptionTasks(io?: SocketIOServer) {
    try {
      const now = new Date();

      // 0. Remove subscriptions without a valid payment (SUCCEEDED or PENDING)
      const subsToRemove = await prisma.subscription.findMany({
        where: {
          OR: [
            { payment: null },
            { payment: { status: { notIn: ["SUCCEEDED", "PENDING"] } } },
          ],
        },
        include: { payment: true },
      });
      for (const sub of subsToRemove) {
        try {
          await prisma.subscription.delete({ where: { id: sub.id } });
          // Optionally, delete related payments if needed
          // await prisma.payment.deleteMany({ where: { subscriptionId: sub.id } });
        } catch (err) {
          console.error(`Failed to delete orphan subscription ${sub.id}:`, err);
        }
      }

      // 1. Deactivate expired subscriptions
      const expired = await prisma.subscription.findMany({
        where: { isActive: true, endDate: { lte: now } },
      });

      for (const sub of expired) {
        try {
          await prisma.subscription.update({
            where: { id: sub.id },
            data: { isActive: false },
          });

          // notify user
          try {
            if (sub.email) {
              const html = renderTemplate("subscription-ended.html", {
                firstName: sub.firstName,
                companyName: sub.companyName || "",
                plan: sub.selectedPlan || sub.planId || "",
                date: now.toLocaleDateString(),
              });
              await sendEmail({
                to: sub.email,
                subject: "Your subscription has ended",
                html,
              });
            }
          } catch (err) {
            console.error("Failed to send subscription ended email:", err);
          }

          // send notification
          try {
            if (io && sub.companyId) {
              await NotificationHelper.sendToCompany(
                io,
                sub.companyId,
                "Subscription ended",
                `Your subscription for ${sub.companyName || sub.email} has ended.`,
                "warning",
                process.env.ADMIN_DASHBOARD_URL
                  ? `${process.env.ADMIN_DASHBOARD_URL}/subscriptions/${sub.id}`
                  : undefined,
                "subscription",
                sub.id,
              );
            }
          } catch (err) {
            console.error(
              "Failed to send subscription ended notification:",
              err,
            );
          }
        } catch (err) {
          console.error(`Failed to deactivate subscription ${sub.id}:`, err);
        }
      }

      // 2. Send reminders for 7, 3, 1 days
      const days = [7, 3, 1];
      for (const d of days) {
        const target = new Date();
        target.setDate(now.getDate() + d);

        const subs = await prisma.subscription.findMany({
          where: {
            isActive: true,
            endDate: {
              gte: new Date(target.setHours(0, 0, 0, 0)),
              lt: new Date(target.setHours(23, 59, 59, 999)),
            },
          },
        });

        for (const sub of subs) {
          try {
            // check flags to avoid duplicate reminders
            let flagField = "reminder1Sent";
            if (d === 7) {
              flagField = "reminder7Sent";
            } else if (d === 3) {
              flagField = "reminder3Sent";
            }

            // avoid using `any` by asserting via unknown then indexing
            const flagVal = (sub as unknown as Record<string, unknown>)[
              flagField
            ];
            if (flagVal === true) {
              continue;
            }

            // send email
            try {
              if (sub.email) {
                const html = renderTemplate("subscription-reminder.html", {
                  firstName: sub.firstName,
                  companyName: sub.companyName || "",
                  days: d,
                  plan: sub.selectedPlan || sub.planId || "",
                });
                await sendEmail({
                  to: sub.email,
                  subject: `Your subscription ends in ${d} day(s)`,
                  html,
                });
              }
            } catch (err) {
              console.error("Failed to send subscription reminder email:", err);
            }

            // send in-app notification
            try {
              if (io && sub.companyId) {
                await NotificationHelper.sendToCompany(
                  io,
                  sub.companyId,
                  "Subscription reminder",
                  `Your subscription for ${sub.companyName || sub.email} ends in ${d} day(s).`,
                  "info",
                  process.env.ADMIN_DASHBOARD_URL
                    ? `${process.env.ADMIN_DASHBOARD_URL}/subscriptions/${sub.id}`
                    : undefined,
                  "subscription",
                  sub.id,
                );
              }
            } catch (err) {
              console.error(
                "Failed to send subscription reminder notification:",
                err,
              );
            }

            // set flag
            const updateData: Record<string, boolean> = {};
            updateData[flagField] = true;
            await prisma.subscription.update({
              where: { id: sub.id },
              data: updateData as Prisma.SubscriptionUpdateInput,
            });
          } catch (err) {
            console.error(`Failed to process reminder for ${sub.id}:`, err);
          }
        }
      }
    } catch (err) {
      console.error("Error running scheduled subscription tasks:", err);
    }
  }
}
