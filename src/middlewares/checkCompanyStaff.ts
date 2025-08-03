import type { NextFunction } from "express";
import type { Request, Response } from "express";
import { prisma } from "../utils/client";

export const checkCompanyStaff = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const companyUser = await prisma.user.findUnique({
      where: { id: req.params.id },
    });

    if (!companyUser) {
      return res.status(404).json({
        message: "No user found ",
      });
    }
    next();
  } catch (error) {
    return res.status(500).json({
      message: "An error occurred while checking the company user",
    });
  }
};
