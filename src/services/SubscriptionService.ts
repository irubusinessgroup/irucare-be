import { BaseService } from "./Service";
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import {
  CreateSubscriptionDto,
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

export class SubscriptionService extends BaseService {
  // helper to compute end date from a start date and billing cycle
  private static computeEndDate(startDate: Date, billingCycle?: string) {
    const endDate = new Date(startDate);
    const cycle = (billingCycle || "").toString().toLowerCase();

    if (cycle === "month") {
      endDate.setMonth(endDate.getMonth() + 1);
    } else if (cycle === "year") {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      // fallback: add one day
      endDate.setDate(endDate.getDate() + 1);
    }

    return endDate;
  }

  // helper to activate subscription and return updated record
  private static async activateSubscription(
    subscriptionId: string,
    billingCycle?: string,
  ): Promise<TSubscription | null> {
    const startDate = new Date();
    const endDate = this.computeEndDate(startDate, billingCycle);

    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { isActive: true, startDate, endDate },
    });

    return (await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    })) as TSubscription | null;
  }

  // Polling implemented as a Promise that resolves when transaction reaches final state or times out
  private static pollPaymentStatus(
    refId: string,
    kind: string,
    client: string,
    timeoutMs = 10 * 60 * 1000, // 10 minutes
    intervalMs = 10 * 1000, // 10 seconds
  ): Promise<"SUCCEEDED" | "FAILED" | "TIMEOUT"> {
    return new Promise((resolve) => {
      let finished = false;

      const tryCheck = async () => {
        try {
          const tx = await PaymentService.checkTransactionStatus(
            refId,
            kind,
            client,
          );
          if (tx && tx.status) {
            if (tx.status === "successful") {
              finished = true;
              clearInterval(timer);
              clearTimeout(timeout);
              resolve("SUCCEEDED");
            } else if (tx.status === "failed") {
              finished = true;
              clearInterval(timer);
              clearTimeout(timeout);
              resolve("FAILED");
            }
          }
        } catch (err) {
          // ignore transient errors and allow retry until timeout
          console.error(`pollPaymentStatus error for ref ${refId}:`, err);
        }
      };

      const timer = setInterval(tryCheck, intervalMs);
      // run initial check immediately
      void tryCheck();

      const timeout = setTimeout(() => {
        if (!finished) {
          clearInterval(timer);
          resolve("TIMEOUT");
        }
      }, timeoutMs);
    });
  }

  public static async createSubscription(
    data: CreateSubscriptionDto,
    companyId: string,
    io?: SocketIOServer,
  ): Promise<IResponse<TSubscription>> {
    try {
      const plan = await prisma.plan.findUnique({ where: { id: data.planId } });
      if (!plan) throw new AppError("Plan not found", 404);

      // create subscription record immediately
      const subscription = await prisma.subscription.create({
        data: {
          companyId: companyId,
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

          selectedPlan: data.selectedPlan,
          planId: data.planId,
          planPrice: data.planPrice,
          setupFee: data.setupFee ?? null,
          totalDueToday: data.totalDueToday,
          billingCycle: data.billingCycle,
          periodLabel: data.periodLabel,
        },
      });

      // if user selected a phone/mobile payment, try to create payment
      const isPhonePayment =
        typeof data.paymentMethod === "string" &&
        /mobile|mtn|airtel|phone/i.test(data.paymentMethod);

      if (!isPhonePayment || !data.paymentPhone) {
        return {
          statusCode: 201,
          message:
            "Subscription created. No immediate phone payment requested.",
          data: subscription,
        };
      }

      const paymentPayload: CreatePaymentDto = {
        subscriptionId: subscription.id,
        amount: data.totalDueToday,
        method: data.paymentMethod as PaymentMethod,
        accountNumber: data.paymentPhone,
      };

      // create payment (may be SUCCEEDED or PENDING)
      let paymentResponse;
      try {
        paymentResponse = await PaymentService.createPayment(paymentPayload);
      } catch (err) {
        // send failure notification/email then remove subscription
        try {
          if (subscription.email) {
            const html = renderTemplate("subscription-payment-failed.html", {
              firstName: subscription.firstName,
              companyName: subscription.companyName || "",
              plan: subscription.selectedPlan || subscription.planId || "",
            });
            await sendEmail({
              to: subscription.email,
              subject: "Subscription payment failed",
              html,
            });
          }
        } catch (e) {
          console.error("Failed to send payment failure email:", e);
        }

        try {
          if (io && subscription.companyId) {
            await NotificationHelper.sendToCompany(
              io,
              subscription.companyId,
              "Subscription payment failed",
              `Payment for subscription ${subscription.companyName || subscription.email} failed.`,
              "error",
              process.env.ADMIN_DASHBOARD_URL
                ? `${process.env.ADMIN_DASHBOARD_URL}/subscriptions/${subscription.id}`
                : undefined,
              "subscription",
              subscription.id,
            );
          }
        } catch (e) {
          console.error("Failed to send payment failure notification:", e);
        }

        try {
          await prisma.subscription.delete({ where: { id: subscription.id } });
        } catch (delErr) {
          console.error(
            "Failed to delete subscription after payment error:",
            delErr,
          );
        }

        if (err instanceof AppError) throw err;
        throw new AppError(err, 500);
      }

      const payment = paymentResponse?.data;

      if (!payment) {
        return {
          statusCode: 201,
          message: "Subscription created, but no payment was recorded.",
          data: subscription,
        };
      }

      // immediate success -> activate subscription
      if (payment.status === "SUCCEEDED") {
        const updated = await this.activateSubscription(
          subscription.id,
          data.billingCycle,
        );

        // notify user about successful payment
        try {
          if (updated?.email) {
            const html = renderTemplate("subscription-paid.html", {
              firstName: updated.firstName,
              companyName: updated.companyName || "",
              plan: updated.selectedPlan || updated.planId || "",
              startDate: updated.startDate?.toLocaleDateString(),
              endDate: updated.endDate?.toLocaleDateString(),
            });
            await sendEmail({
              to: updated.email,
              subject: "Subscription active — payment received",
              html,
            });
          }
        } catch (e) {
          console.error("Failed to send subscription paid email:", e);
        }

        try {
          if (io && updated?.companyId) {
            await NotificationHelper.sendToCompany(
              io,
              updated.companyId,
              "Subscription active",
              `Subscription for ${updated.companyName || updated.email} is now active.`,
              "success",
              process.env.ADMIN_DASHBOARD_URL
                ? `${process.env.ADMIN_DASHBOARD_URL}/subscriptions/${updated.id}`
                : undefined,
              "subscription",
              updated.id,
            );
          }
        } catch (e) {
          console.error("Failed to send subscription paid notification:", e);
        }

        return {
          statusCode: 201,
          message: "Subscription created and paid",
          data: updated as TSubscription,
        };
      }

      // if pending, poll for up to 10 minutes for final status
      if (payment.status === "PENDING") {
        const result = await this.pollPaymentStatus(
          payment.refId ?? "",
          payment.kind,
          payment.accountNumber,
          10 * 60 * 1000, // timeout 10 minutes
          10 * 1000, // interval 10s
        );

        if (result === "SUCCEEDED") {
          // mark payment and activate
          await prisma.payment.update({
            where: { id: payment.id },
            data: { status: "SUCCEEDED", paidAt: new Date() },
          });

          const updated = await this.activateSubscription(
            subscription.id,
            data.billingCycle,
          );

          // notify user about successful payment
          try {
            if (updated?.email) {
              const html = renderTemplate("subscription-paid.html", {
                firstName: updated.firstName,
                companyName: updated.companyName || "",
                plan: updated.selectedPlan || updated.planId || "",
                startDate: updated.startDate?.toLocaleDateString(),
                endDate: updated.endDate?.toLocaleDateString(),
              });
              await sendEmail({
                to: updated.email,
                subject: "Subscription active — payment received",
                html,
              });
            }
          } catch (e) {
            console.error("Failed to send subscription paid email:", e);
          }

          try {
            if (io && updated?.companyId) {
              await NotificationHelper.sendToCompany(
                io,
                updated.companyId,
                "Subscription active",
                `Subscription for ${updated.companyName || updated.email} is now active.`,
                "success",
                process.env.ADMIN_DASHBOARD_URL
                  ? `${process.env.ADMIN_DASHBOARD_URL}/subscriptions/${updated.id}`
                  : undefined,
                "subscription",
                updated.id,
              );
            }
          } catch (e) {
            console.error("Failed to send subscription paid notification:", e);
          }

          return {
            statusCode: 201,
            message: "Subscription created and paid",
            data: updated as TSubscription,
          };
        }

        if (result === "FAILED") {
          // delete both payment and subscription so user can retry
          try {
            await PaymentService.deletePayment(payment.id);
          } catch (err) {
            console.error(
              `Failed to delete payment after failed tx ${payment.id}:`,
              err,
            );
          }

          try {
            // notify user about failed payment
            if (subscription.email) {
              const html = renderTemplate("subscription-payment-failed.html", {
                firstName: subscription.firstName,
                companyName: subscription.companyName || "",
                plan: subscription.selectedPlan || subscription.planId || "",
              });
              await sendEmail({
                to: subscription.email,
                subject: "Subscription payment failed",
                html,
              });
            }
          } catch (e) {
            console.error("Failed to send payment failure email:", e);
          }

          try {
            if (io && subscription.companyId) {
              await NotificationHelper.sendToCompany(
                io,
                subscription.companyId,
                "Subscription payment failed",
                `Payment for subscription ${subscription.companyName || subscription.email} failed.`,
                "error",
                process.env.ADMIN_DASHBOARD_URL
                  ? `${process.env.ADMIN_DASHBOARD_URL}/subscriptions/${subscription.id}`
                  : undefined,
                "subscription",
                subscription.id,
              );
            }
          } catch (e) {
            console.error("Failed to send payment failure notification:", e);
          }

          try {
            await prisma.subscription.delete({
              where: { id: subscription.id },
            });
          } catch (delErr) {
            console.error(
              "Failed to delete subscription after failed payment:",
              delErr,
            );
          }

          throw new AppError("Payment failed. Subscription removed.", 400);
        }

        // TIMEOUT -> let user know payment is still pending and subscription exists
        return {
          statusCode: 201,
          message:
            "Subscription created (payment pending). Please confirm the payment; it may take a few minutes.",
          data: subscription,
        };
      }

      // fallback: return subscription
      return {
        statusCode: 201,
        message: "Subscription created",
        data: subscription,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(error, 500);
    }
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
      });
      return {
        statusCode: 200,
        message: "Subscriptions fetched",
        data: subs,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getSubscriptionsByCompany(
    companyId: string,
  ): Promise<IResponse<TSubscription[]>> {
    try {
      console.log("companyId:", companyId);
      const subs = await prisma.subscription.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
      });
      return {
        statusCode: 200,
        message: "Subscriptions fetched for company",
        data: subs,
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
      const where: Prisma.SubscriptionWhereInput = { isActive: true };
      if (search && search.trim()) {
        const q = search.trim();
        where.OR = [
          { companyName: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
          { planId: { contains: q, mode: "insensitive" } },
          { selectedPlan: { contains: q, mode: "insensitive" } },
        ];
      }

      const skip = page > 0 ? (page - 1) * limit : 0;

      const [items, total] = await Promise.all([
        prisma.subscription.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
        }),
        prisma.subscription.count({ where }),
      ]);

      return {
        statusCode: 200,
        message: "Active subscriptions fetched",
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
      await prisma.subscription.update({
        where: { id },
        data: { isActive: false, endDate: new Date() },
      });
      return {
        statusCode: 200,
        message: "Subscription cancelled",
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

      const updated = await prisma.subscription.update({
        where: { id },
        data: { isActive: false, endDate: new Date() },
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
