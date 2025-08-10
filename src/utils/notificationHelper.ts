import { UserService } from "../services/userService";
import { NotificationService } from "../services/NotificationService";
import { RoleType, TNotification } from "./interfaces/common";
import { Server as SocketIOServer } from "socket.io";

export class NotificationHelper {
  static async sendToUser(
    io: SocketIOServer,
    userId: string,
    title: string,
    message: string,
    type: TNotification["type"] = "info",
    actionUrl?: string,
    entityType?: string,
    entityId?: string,
    metadata?: any,
  ): Promise<TNotification> {
    try {
      const notification = await NotificationService.createNotification(
        userId,
        title,
        message,
        type,
        actionUrl,
        entityType,
        entityId,
        metadata,
      );

      io.to(userId).emit("notification", notification);

      const unreadCount = await NotificationService.getUnreadCount(userId);
      io.to(userId).emit("unread_count_updated", { unreadCount });

      console.log(`📨 Notification sent to user ${userId}: ${title}`);
      return notification;
    } catch (error) {
      console.error("❌ Error sending notification:", error);
      throw error;
    }
  }

  static async sendToUsers(
    io: SocketIOServer,
    userIds: string[],
    title: string,
    message: string,
    type: TNotification["type"] = "info",
    actionUrl?: string,
    entityType?: string,
    entityId?: string,
    metadata?: any,
  ): Promise<TNotification[]> {
    const notifications: TNotification[] = [];

    for (const userId of userIds) {
      const notification = await this.sendToUser(
        io,
        userId,
        title,
        message,
        type,
        actionUrl,
        entityType,
        entityId,
        metadata,
      );
      notifications.push(notification);
    }

    return notifications;
  }

  static async sendToRole(
    io: SocketIOServer,
    roleName: string,
    title: string,
    message: string,
    type: TNotification["type"] = "info",
    actionUrl?: string,
    entityType?: string,
    entityId?: string,
    metadata?: any,
  ): Promise<void> {
    const userIds = await UserService.getUserIdsByRole(roleName as RoleType);
    for (const userId of userIds) {
      const notification = await NotificationService.createNotification(
        userId,
        title,
        message,
        type,
        actionUrl,
        entityType,
        entityId,
        metadata,
      );

      // Emit to specific user
      io.to(userId).emit("notification", notification);

      // Update unread count
      const unreadCount = await NotificationService.getUnreadCount(userId);
      io.to(userId).emit("unread_count_updated", { unreadCount });
    }

    console.log(`📨 Notification broadcast to role ${roleName}: ${title}`);
  }

  static async broadcast(
    io: SocketIOServer,
    title: string,
    message: string,
    type: TNotification["type"] = "info",
    actionUrl?: string,
  ): Promise<void> {
    io.emit("notification", {
      title,
      message,
      type,
      actionUrl,
      createdAt: new Date(),
      isRead: false,
    });

    console.log(`📢 Notification broadcast to all users: ${title}`);
  }
}
