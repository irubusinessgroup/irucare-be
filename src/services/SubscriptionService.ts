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

export class SubscriptionService extends BaseService {
  public static async createSubscription(
    data: CreateSubscriptionDto,
    companyId: string,
  ): Promise<IResponse<TSubscription>> {
    try {
      const plan = await prisma.plan.findUnique({ where: { id: data.planId } });
      if (!plan) throw new AppError("Plan not found", 404);

      // Build create payload matching Prisma schema for Subscription
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

          // mark inactive until payment is confirmed (default isActive = true in schema)
          isActive: data.isActive ?? false,
        },
      });

      // If the user selected a phone/mobile payment and provided a phone number,
      // attempt to create a payment immediately using PaymentService.
      const isPhonePayment =
        typeof data.paymentMethod === "string" &&
        /mobile|mtn|airtel|phone/i.test(data.paymentMethod);

      if (isPhonePayment && data.paymentPhone) {
        try {
          // map the incoming paymentMethod string to the Prisma enum where possible
          const normalizeMethod = (m: string): PaymentMethod => {
            const key = m.toUpperCase().replace(/[-\s]/g, "_");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const asEnum = (PaymentMethod as any)[key];
            if (asEnum) return asEnum as PaymentMethod;
            if (/airtel/i.test(m)) return PaymentMethod.AIRTEL_MONEY;
            if (/mtn/i.test(m)) return PaymentMethod.MTN_MOBILE_MONEY;
            if (/mobile/i.test(m)) return PaymentMethod.MOBILE_MONEY;
            // fallback to MOBILE_MONEY if we don't know
            return PaymentMethod.MOBILE_MONEY;
          };

          const paymentPayload: CreatePaymentDto = {
            subscriptionId: subscription.id,
            amount: data.totalDueToday,
            method: normalizeMethod(data.paymentMethod),
            accountNumber: data.paymentPhone,
          };

          const paymentResponse =
            await PaymentService.createPayment(paymentPayload);

          // If payment succeeded immediately, activate the subscription
          if (
            paymentResponse &&
            paymentResponse.data &&
            paymentResponse.data.status === "SUCCEEDED"
          ) {
            await prisma.subscription.update({
              where: { id: subscription.id },
              data: { isActive: true, startDate: new Date() },
            });

            const updated = await prisma.subscription.findUnique({
              where: { id: subscription.id },
            });
            return {
              statusCode: 201,
              message: "Subscription created and paid",
              data: updated as TSubscription,
            };
          }

          // If payment created but not yet succeeded, return subscription (still inactive)
        } catch (paymentError) {
          // don't block subscription creation on payment failure, just log it
          console.error(
            "Failed to process immediate subscription payment:",
            paymentError,
          );
        }
      }

      return {
        statusCode: 201,
        message: "Subscription created",
        data: subscription,
      };
    } catch (error) {
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

  public static async getUserSubscriptions(
    companyId?: string,
  ): Promise<IResponse<TSubscription[]>> {
    try {
      if (!companyId) {
        return {
          statusCode: 200,
          message: "Subscriptions fetched",
          data: [],
        };
      }

      const subs = await prisma.subscription.findMany({
        where: { companyId },
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
}
