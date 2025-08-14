import { prisma } from "../utils/client";
import { TNotification } from "../utils/interfaces/common";

export class NotificationService {
  static async createNotification(
    userId: string,
    title: string,
    message: string,
    type: TNotification["type"] = "info",
    actionUrl?: string,
    entityType?: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<TNotification> {
    const notification = await prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type,
        actionUrl,
        entityType,
        entityId,
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
      },
    });
    // Ensure metadata is undefined if null, and cast if necessary
    return {
      ...notification,
      metadata:
        notification.metadata === null
          ? undefined
          : (notification.metadata as Record<string, unknown>),
    };
  }

  static async getUserNotifications(
    userId: string,
    limit = 50,
    offset = 0,
  ): Promise<TNotification[]> {
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    });
    return notifications.map((notification) => ({
      ...notification,
      metadata:
        notification.metadata === null
          ? undefined
          : (notification.metadata as Record<string, unknown>),
    }));
  }

  static async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });
  }

  static async markAsRead(
    notificationId: string,
    userId: string,
  ): Promise<boolean> {
    const result = await prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId,
      },
      data: {
        isRead: true,
      },
    });
    return result.count > 0;
  }

  static async markAllAsRead(userId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });
    return result.count;
  }

  static async deleteNotification(
    notificationId: string,
    userId: string,
  ): Promise<boolean> {
    const result = await prisma.notification.deleteMany({
      where: {
        id: notificationId,
        userId,
      },
    });
    return result.count > 0;
  }

  static async clearAllNotifications(userId: string): Promise<number> {
    const result = await prisma.notification.deleteMany({
      where: { userId },
    });
    return result.count;
  }

  static async getNotificationById(id: string): Promise<TNotification | null> {
    const notification = await prisma.notification.findUnique({
      where: { id },
    });
    if (!notification) return null;
    return {
      ...notification,
      metadata:
        notification.metadata === null
          ? undefined
          : (notification.metadata as Record<string, unknown>),
    };
  }
}
