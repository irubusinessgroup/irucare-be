/* eslint-disable no-async-promise-executor */

import type * as express from "express";
import { prisma } from "./client";
import AppError from "./error";
import type { TUser } from "./interfaces/common";
import { verifyToken } from "./jwt";

export const expressAuthentication = (
  request: express.Request,
  securityName: string
) => {
  if (securityName === "jwt") {
    const token = request.headers["authorization"] as string;
    return new Promise(async (resolve, reject) => {
      try {
        if (!token) {
          reject(new AppError("No token provided", 401));
          return;
        }

        const decoded = (await verifyToken(token)) as any;

        // Check if token contains user data (new format) or just email (old format)
        if (decoded.email && decoded.id) {
          // New format - token contains user data
          const user = await prisma.user.findFirst({
            where: { id: decoded.id },
            include: {
              userRoles: true,
              company: true,
            },
          });

          if (!user) {
            reject(new AppError("User not found", 404));
            return;
          }

          request.user = user as unknown as TUser;
          resolve(user);
        } else {
          // Old format - token contains just email
          const email = decoded as string;
          const user = await prisma.user.findFirst({
            where: { email },
            include: {
              userRoles: true,
              company: true,
            },
          });

          if (!user) {
            reject(new AppError("User not found", 404));
            return;
          }

          request.user = user as unknown as TUser;
          resolve(user);
        }
      } catch (error) {
        reject(new AppError("Not Authorized", 403));
      }
    });
  }
};
