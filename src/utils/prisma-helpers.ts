import type { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";

export function withTx(
  txOrPrisma: PrismaClient | Prisma.TransactionClient,
): PrismaClient | Prisma.TransactionClient {
  return txOrPrisma;
}
