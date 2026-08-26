/* eslint-disable no-async-promise-executor */
import type * as express from "express";
import { prisma } from "./client";
import AppError from "./error";
import type { TUser } from "./interfaces/common";
import { verifyToken } from "./jwt";
import { isPlatformRole } from "./roles";

async function attachActiveCompanyContext(
  request: express.Request,
  user: any,
): Promise<TUser> {
  const roleNames = (user.userRoles || []).map((r: { name: string }) => r.name);
  const headerCompanyId = String(
    request.headers["x-active-company-id"] || "",
  ).trim();
  const headerBranchId = String(
    request.headers["x-active-branch-id"] || "",
  ).trim();

  // Platform ADMIN/DEVELOPER can switch into any company via header
  if (isPlatformRole(roleNames) && headerCompanyId) {
    const company = await prisma.company.findUnique({
      where: { id: headerCompanyId },
      select: {
        id: true,
        name: true,
        industry: true,
        TIN: true,
      },
    });

    if (!company) {
      throw new AppError("Active company not found", 404);
    }

    let branchId: string | null = null;
    if (headerBranchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: headerBranchId, companyId: company.id },
        select: { id: true },
      });
      if (!branch) {
        throw new AppError("Active branch not found for company", 404);
      }
      branchId = branch.id;
    }

    return {
      ...user,
      branchId,
      companyName: company.name,
      company: {
        id: `platform-switch:${user.id}:${company.id}`,
        userId: user.id,
        companyId: company.id,
        branchId,
        company: {
          industry: company.industry,
          name: company.name,
          TIN: company.TIN,
        },
      },
      activeCompanyId: company.id,
      isCompanySwitch: true,
    } as unknown as TUser;
  }

  // COMPANY_ADMIN / platform: optional branch filter via header.
  // Without header → company-wide (null), even if membership has a branchId.
  const isCompanyWide =
    roleNames.includes("COMPANY_ADMIN") || isPlatformRole(roleNames);

  let branchId = isCompanyWide ? null : (user.company?.branchId ?? null);
  if (isCompanyWide && headerBranchId && user.company?.companyId) {
    const branch = await prisma.branch.findFirst({
      where: { id: headerBranchId, companyId: user.company.companyId },
      select: { id: true },
    });
    if (!branch) {
      throw new AppError("Active branch not found for company", 404);
    }
    branchId = branch.id;
  }

  return {
    ...user,
    branchId,
    companyName: user.company?.company?.name ?? null,
  } as unknown as TUser;
}

export const expressAuthentication = (
  request: express.Request,
  securityName: string,
) => {
  if (securityName === "jwt") {
    const token = request.headers["authorization"] as string;

    return new Promise(async (resolve, reject) => {
      try {
        if (!token) {
          reject(new AppError("No token provided", 401));
          return;
        }

        const decoded = (await verifyToken(token)) as
          | string
          | { email: string; id?: string };

        let user = null as any;

        if (typeof decoded === "string") {
          user = await prisma.user.findFirst({
            where: { email: decoded },
            include: {
              userRoles: true,
              clinicUserRoles: true,
              company: {
                include: {
                  company: true,
                },
              },
            },
          });
        } else if (decoded.email && decoded.id) {
          user = await prisma.user.findFirst({
            where: { id: decoded.id },
            include: {
              userRoles: true,
              clinicUserRoles: true,
              company: {
                include: {
                  company: true,
                },
              },
            },
          });
        } else {
          user = await prisma.user.findFirst({
            where: { email: decoded.email },
            include: {
              userRoles: true,
              clinicUserRoles: true,
              company: {
                include: {
                  company: true,
                },
              },
            },
          });
        }

        if (!user) {
          reject(new AppError("User not found", 404));
          return;
        }

        request.user = await attachActiveCompanyContext(request, user);
        resolve(request.user);
      } catch (error) {
        if (error instanceof AppError) {
          reject(error);
          return;
        }
        reject(new AppError("Not Authorized", 403));
      }
    });
  }
};
