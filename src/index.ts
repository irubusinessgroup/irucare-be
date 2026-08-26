import express, {
  json,
  urlencoded,
  Response as ExResponse,
  Request as ExRequest,
  NextFunction,
} from "express";
// Explanation: This line intentionally causes an error because...
// @ts-ignore
import { RegisterRoutes } from "../build/routes";
import swaggerUi from "swagger-ui-express";
import cors from "cors";
import { TUser } from "./utils/interfaces/common";
import AppError, { ValidationError } from "./utils/error";
import { NotificationService } from "./services/NotificationService";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { verifyToken } from "./utils/jwt";
import { errorHandler } from "./middlewares/errorHandler";
import { startEbmNoticesCron } from "./jobs/ebmNoticesJob";
import {
  isPaypackWebhookPath,
  paypackWebhookRawBody,
} from "./middlewares/paypackWebhookRawBody";

declare module "express" {
  interface Request {
    user?: TUser;
    rawBody?: Buffer;
  }
}

const app = express();
const PORT = process.env.PORT || 9000;

// Oazis pattern: skip JSON parser for Paypack webhook so HMAC uses exact raw bytes
const jsonParser = json();
const urlencodedParser = urlencoded({ extended: true });

app.use((req, res, next) => {
  if (isPaypackWebhookPath(req)) return next();
  return urlencodedParser(req, res, next);
});

app.use((req, res, next) => {
  if (isPaypackWebhookPath(req)) return next();
  return jsonParser(req, res, next);
});

app.use("/api/payments/paypack/webhook", paypackWebhookRawBody);

app.use(cors({ exposedHeaders: ["Content-Disposition"] }));
app.use("/docs", swaggerUi.serve, async (_req: ExRequest, res: ExResponse) => {
  return res.send(
    //@ts-ignore
    swaggerUi.generateHTML(await import("../build/swagger.json")),
  );
});

const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: ["http://localhost:4173", "https://irucare.com"],
    methods: ["GET", "POST"],
    credentials: true,
  },
});
app.set("io", io);

io.on("connection", async (socket) => {
  try {
    const token = socket.handshake.query.token as string;
    if (!token) {
      socket.disconnect();
      return;
    }

    const decoded = (await verifyToken(token)) as TUser;

    const roles = Array.isArray(decoded.userRoles) ? decoded.userRoles : [];

    if (!decoded || roles.length === 0) {
      socket.disconnect();
      return;
    }

    socket.join(decoded.id);

    roles.forEach((role) => {
      const roomName = typeof role === "string" ? role : role.name;
      if (roomName) {
        socket.join(roomName);
      }
    });

    socket.data.user = decoded;

    socket.emit("connected", {
      message: "Socket connected!",
      userId: decoded.id,
      rooms: [
        decoded.id,
        ...roles.map((r) => (typeof r === "string" ? r : r.name)),
      ],
    });

    try {
      const notifications = await NotificationService.getUserNotifications(
        decoded.id,
      );
      socket.emit("notifications", notifications);
    } catch (error) {
      console.error("Error loading initial notifications:", error);
    }

    // Mark notification as read
    socket.on("mark_as_read", async (data) => {
      try {
        const { notificationId } = data;

        await NotificationService.markAsRead(notificationId, decoded.id);
        socket.emit("notification_marked_read", { notificationId });

        const unreadCount = await NotificationService.getUnreadCount(
          decoded.id,
        );
        socket.emit("unread_count_updated", { unreadCount });
      } catch (error) {
        console.error("Error marking notification as read:", error);
        socket.emit("error", {
          message: "Failed to mark notification as read",
        });
      }
    });

    // Mark all notifications as read
    socket.on("mark_all_as_read", async () => {
      try {
        await NotificationService.markAllAsRead(decoded.id);
        socket.emit("all_notifications_marked_read");
        socket.emit("unread_count_updated", { unreadCount: 0 });
      } catch (error) {
        console.error("Error marking all notifications as read:", error);
        socket.emit("error", {
          message: "Failed to mark all notifications as read",
        });
      }
    });

    // Delete notification
    socket.on("delete_notification", async (data) => {
      try {
        const { notificationId } = data;

        const deleted = await NotificationService.deleteNotification(
          notificationId,
          decoded.id,
        );
        if (deleted) {
          socket.emit("notification_deleted", { notificationId });
          const unreadCount = await NotificationService.getUnreadCount(
            decoded.id,
          );
          socket.emit("unread_count_updated", { unreadCount });
        }
      } catch (error) {
        socket.emit("error", { message: "Failed to delete notification" });
      }
    });

    // Clear all notifications
    socket.on("clear_all_notifications", async () => {
      try {
        await NotificationService.clearAllNotifications(decoded.id);
        socket.emit("all_notifications_cleared");
        socket.emit("unread_count_updated", { unreadCount: 0 });
      } catch (error) {
        console.error("Error clearing all notifications:", error);
        socket.emit("error", {
          message: "Failed to clear all notifications",
        });
      }
    });
  } catch (error) {
    console.error("Socket connection error:", error);
    socket.disconnect();
  }

  socket.on("disconnect", (reason) => {
    const userId = socket.data.user?.id;
    console.log(`📱 User ${userId} disconnected: ${reason}`);
  });
});

RegisterRoutes(app);

app.use(errorHandler);

startEbmNoticesCron(io);

server.listen(PORT, () =>
  console.log(`API running on PORT http://localhost:${PORT} wow!s`),
);
