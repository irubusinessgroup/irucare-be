import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
  errorFormat: "minimal",
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: [
    {
      emit: "event",
      level: "error",
    },
    {
      emit: "event",
      level: "warn",
    },
  ],
});

// Log Prisma errors
prisma.$on("error", (event) => {
  console.error("[Prisma Error]", event.message);
});

prisma.$on("warn", (event) => {
  if (event.message.includes("connection")) {
    console.warn("[Prisma Warn - Connection]", event.message);
  }
});
