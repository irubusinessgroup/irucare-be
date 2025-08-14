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
import cron from "node-cron";
import { PaymentService } from "./services/PaymentService";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { verifyToken } from "./utils/jwt";

declare module "express" {
  interface Request {
    user?: TUser;
  }
}

const app = express();
const PORT = process.env.PORT || 9000;
app.use(
  urlencoded({
    extended: true,
  }),
);

app.use(json());
app.use(cors());
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

// Schedule the synchronization to run every minute
cron.schedule("* * * * *", async () => {
  console.log("Running payment synchronization...");
  try {
    const result = await PaymentService.syncAllPaymentsWithTransactions();
    console.log(result.message);
  } catch (error) {
    console.error("Error during payment synchronization:", error);
  }
});

app.use(function errorHandler(
  err: unknown,
  req: ExRequest,
  res: ExResponse,
  next: NextFunction,
): ExResponse | void {
  console.log(err);
  if (err instanceof AppError) {
    return res.status(err.status).json({
      status: err.status,
      message: err.message,
    });
  }

  if (err instanceof ValidationError) {
    return res
      .status(400)
      .json({ error: "validate", data: JSON.parse(err.message) });
  }
  if (err instanceof Error) {
    return res.status(500).json({
      message: err.message ?? "Internal server error",
      status: 500,
    });
  }
  next();
});

server.listen(PORT, () =>
  console.log(`API running on PORT http://localhost:${PORT} wow!s`),
);
