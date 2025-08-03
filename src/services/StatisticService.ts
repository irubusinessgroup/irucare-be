/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "../utils/client";
import { IResponse } from "../utils/interfaces/common";
import AppError from "../utils/error";

export class StatisticService {
  public static async getStatisticsByMonth(
    year: number,
  ): Promise<IResponse<any>> {
    try {
      const [clients, agents, product, pendingOrder, completedOrder] =
        await Promise.all([
          prisma.user.findMany({
            where: {
              createdAt: {
                gte: new Date(`${year}-01-01`),
                lt: new Date(`${year + 1}-01-01`),
              },
              userRoles: {
                some: {
                  name: "CLIENT",
                },
              },
            },
            select: {
              createdAt: true,
            },
          }),
          prisma.user.findMany({
            where: {
              createdAt: {
                gte: new Date(`${year}-01-01`),
                lt: new Date(`${year + 1}-01-01`),
              },
              userRoles: {
                some: {
                  name: "AGENT",
                },
              },
            },
            select: {
              createdAt: true,
            },
          }),
          prisma.product.findMany({
            where: {
              createdAt: {
                gte: new Date(`${year}-01-01`),
                lt: new Date(`${year + 1}-01-01`),
              },
            },
            select: {
              createdAt: true,
            },
          }),
          prisma.order.findMany({
            where: {
              createdAt: {
                gte: new Date(`${year}-01-01`),
                lt: new Date(`${year + 1}-01-01`),
              },
              status: "PENDING",
            },
            select: {
              createdAt: true,
            },
          }),
          prisma.order.findMany({
            where: {
              createdAt: {
                gte: new Date(`${year}-01-01`),
                lt: new Date(`${year + 1}-01-01`),
              },
              status: "CONFIRMED",
            },
            select: {
              createdAt: true,
            },
          }),
        ]);

      const clientsCountByMonth = Array(12).fill(0);
      const agentsCountByMonth = Array(12).fill(0);
      const productCountByMonth = Array(12).fill(0);
      const pendingOrderCountByMonth = Array(12).fill(0);
      const completedOrderCountByMonth = Array(12).fill(0);

      clients.forEach((client) => {
        const month = new Date(client.createdAt).getMonth();
        clientsCountByMonth[month]++;
      });

      agents.forEach((agent) => {
        const month = new Date(agent.createdAt).getMonth();
        agentsCountByMonth[month]++;
      });

      product.forEach((product) => {
        const month = new Date(product.createdAt).getMonth();
        productCountByMonth[month]++;
      });

      pendingOrder.forEach((order) => {
        const month = new Date(order.createdAt).getMonth();
        pendingOrderCountByMonth[month]++;
      });

      completedOrder.forEach((order) => {
        const month = new Date(order.createdAt).getMonth();
        completedOrderCountByMonth[month]++;
      });

      return {
        message: "Statistics by month fetched successfully",
        statusCode: 200,
        data: {
          clientsCountByMonth,
          agentsCountByMonth,
          productCountByMonth,
          pendingOrderCountByMonth,
          completedOrderCountByMonth,
        },
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }
}
