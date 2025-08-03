import { BaseService } from "./Service";
import { prisma } from "../utils/client";
import {
  CreateOrderDto,
  IPaged,
  IResponse,
  TOrder,
} from "../utils/interfaces/common";
import AppError from "../utils/error";
import { QueryOptions, Paginations } from "../utils/DBHelpers";

function generateTicket(): string {
  const ticket = Array.from({ length: 12 }, (_, i) =>
    i % 2 === 0
      ? String.fromCharCode(65 + Math.floor(Math.random() * 26)) // Letter
      : Math.floor(Math.random() * 10),
  ).join("");
  return ticket;
}
export class OrderService extends BaseService {
  private static calculateSubTotal(
    orderItems: { quantity: number; unitPrice: number }[],
  ): number {
    return orderItems.reduce(
      (total, item) => total + item.unitPrice * item.quantity,
      0,
    );
  }

  private static calculateTotal(
    subTotal: number,
    discount: number,
    deliveryFee: number,
  ): number {
    const discounted = subTotal * (1 - discount / 100);
    return discounted + deliveryFee;
  }

  private static calculateTotalForItems(
    orderItems: { quantity: number; unitPrice: number; discount: number }[],
  ): number {
    return orderItems.reduce((total, item) => {
      const discountedPrice = item.unitPrice * (1 - item.discount / 100);
      return total + discountedPrice * item.quantity;
    }, 0);
  }

  public static async createOrder(
    orderData: CreateOrderDto,
  ): Promise<IResponse<TOrder>> {
    const { orderItems, deliveryFee, ...orderPayload } = orderData;
    const orderNumber = generateTicket();
    const orderItemsWithPrice = await Promise.all(
      orderItems.map(async (item) => {
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
        });
        if (!product) {
          throw new AppError(
            `Product with ID ${item.productId} not found`,
            404,
          );
        }
        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: product.price,
          discount: product.discountPercentage ?? 0,
        };
      }),
    );

    const subTotal = this.calculateSubTotal(orderItemsWithPrice);
    const totalAmount =
      this.calculateTotalForItems(orderItemsWithPrice) + (deliveryFee ?? 0);

    const order = await prisma.$transaction(async (prisma) => {
      const createdOrder = await prisma.order.create({
        data: {
          ...orderPayload,
          subTotal,
          totalAmount,
          deliveryFee,
          orderNumber,
        },
      });

      await prisma.orderItem.createMany({
        data: orderItemsWithPrice.map((item) => ({
          ...item,
          orderId: createdOrder.id,
        })),
      });

      return prisma.order.findUnique({
        where: { id: createdOrder.id },
        include: { orderItems: true },
      });
    });

    return {
      statusCode: 201,
      message: "Order created successfully",
      data: order as TOrder,
    };
  }

  public static async updateOrder(
    id: string,
    orderData: Partial<CreateOrderDto>,
  ): Promise<IResponse<TOrder>> {
    const { orderItems, deliveryFee, ...orderPayload } = orderData;

    const updatedOrder = await prisma.$transaction(async (prisma) => {
      let subTotal = 0;
      let total = 0;

      if (orderItems) {
        await prisma.orderItem.deleteMany({ where: { orderId: id } });

        const newItems = await Promise.all(
          orderItems.map(async (item) => {
            const product = await prisma.product.findUnique({
              where: { id: item.productId },
            });
            if (!product) {
              throw new AppError(
                `Product with ID ${item.productId} not found`,
                404,
              );
            }
            return {
              orderId: id,
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: product.price,
              discount: product.discountPercentage ?? 0,
            };
          }),
        );

        subTotal = this.calculateSubTotal(newItems);
        total = this.calculateTotalForItems(newItems) + (deliveryFee ?? 0);

        await prisma.orderItem.createMany({ data: newItems });
      } else {
        // Fetch existing order items to recalculate subTotal and total
        const existingItems = await prisma.orderItem.findMany({
          where: { orderId: id },
          select: {
            quantity: true,
            unitPrice: true,
            discount: true,
          },
        });

        // Ensure discount is always a number
        const normalizedItems = existingItems.map((item) => ({
          ...item,
          discount: item.discount ?? 0,
        }));

        subTotal = this.calculateSubTotal(normalizedItems);
        total =
          this.calculateTotalForItems(normalizedItems) + (deliveryFee ?? 0);
      }

      await prisma.order.update({
        where: { id },
        data: {
          ...orderPayload,
          subTotal,
          totalAmount: total,
          deliveryFee,
        },
      });

      return prisma.order.findUnique({
        where: { id },
        include: { orderItems: true },
      });
    });

    return {
      statusCode: 200,
      message: "Order updated successfully",
      data: updatedOrder as TOrder,
    };
  }

  public static async deleteOrder(id: string): Promise<IResponse<null>> {
    await prisma.$transaction(async (prisma) => {
      // Delete related order items
      await prisma.orderItem.deleteMany({ where: { orderId: id } });

      // Delete related payment
      await prisma.payment.deleteMany({ where: { orderId: id } });

      // Delete related delivery
      await prisma.delivery.deleteMany({ where: { orderId: id } });

      // Finally, delete the order
      await prisma.order.delete({ where: { id } });
    });

    return {
      statusCode: 200,
      message: "Order and all related entities deleted successfully",
      data: null,
    };
  }

  public static async getOrder(id: string): Promise<IResponse<TOrder>> {
    const order = await prisma.order.findUnique({
      where: { id },
      include: { orderItems: true, payment: true, delivery: true },
    });
    if (!order) throw new AppError("Order not found", 404);
    return {
      statusCode: 200,
      message: "Order fetched successfully",
      data: order,
    };
  }

  public static async getAllOrders(
    searchq?: string,
    limit?: number,
    currentPage?: number,
  ): Promise<IPaged<TOrder[]>> {
    const queryOptions = QueryOptions(["orderNumber"], searchq);
    const pagination = Paginations(currentPage, limit);

    const orders = await prisma.order.findMany({
      where: queryOptions,
      ...pagination,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        orderItems: {
          include: {
            product: true,
          },
        },
        payment: true,
        delivery: true,
      },
    });

    for (const order of orders) {
      if (
        order.status === "PENDING" &&
        order.delivery &&
        order.delivery.estimatedDate &&
        order.delivery.estimatedDate < new Date()
      ) {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: "CANCELLED" },
        });
      }
    }

    const totalItems = await prisma.order.count({
      where: queryOptions,
    });

    return {
      statusCode: 200,
      message: "Orders fetched successfully",
      data: orders,
      totalItems,
      currentPage: currentPage || 1,
      itemsPerPage: limit || 15,
    };
  }
}
