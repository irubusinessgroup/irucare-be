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
    metadata?: any
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
        metadata,
      },
    });
    return notification;
  }

  static async getUserNotifications(
    userId: string,
    limit = 50,
    offset = 0
  ): Promise<TNotification[]> {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    });
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
    userId: string
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
    userId: string
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
    return prisma.notification.findUnique({
      where: { id },
    });
  }

  private static formatNotification(row: any): TNotification {
    return {
      ...row,
      isRead: Boolean(row.is_read),
      userId: row.user_id,
      actionUrl: row.action_url,
      entityType: row.entity_type,
      entityId: row.entity_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    };
  }
}
