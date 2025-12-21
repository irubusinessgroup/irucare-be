/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable linebreak-style */
import { BaseService } from "./Service";
import { prisma } from "../utils/client";
import {
  IPaged,
  ILoginUser,
  ISignUpUser,
  IUserResponse,
  CreateUserDto,
  UpdateProfileDto,
} from "../utils/interfaces/common";
import { compare } from "bcrypt";
import jwt from "jsonwebtoken";
import AppError, { ValidationError } from "../utils/error";
import { randomBytes } from "crypto";
import { sendEmail, renderTemplate } from "../utils/email";
import { hash } from "bcrypt";
import { roles } from "../utils/roles";
import type { Request } from "express";
import { QueryOptions, Paginations } from "../utils/DBHelpers";
import { RoleType } from "@prisma/client";
import { userValidations } from "./../varifications/user";

export class UserService extends BaseService {
  public static async getUsers(
    searchq?: string,
    limit?: number,
    currentPage?: number,
  ): Promise<IPaged<IUserResponse[]>> {
    try {
      const queryOptions = QueryOptions(
        ["firstName", "lastName", "email"],
        searchq,
      );

      const pagination = Paginations(currentPage, limit);

      const users = await prisma.user.findMany({
        where: queryOptions,
        include: {
          userRoles: true,
        },
        ...pagination,
        orderBy: {
          createdAt: "desc",
        },
      });

      const totalItems = await prisma.user.count({
        where: queryOptions,
      });

      return {
        message: "Users fetched successfully",
        statusCode: 200,
        data: users,
        totalItems,
        currentPage: currentPage || 1,
        itemsPerPage: limit || 15,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }
  public static async loginUser(user: ILoginUser) {
    try {
      const userData = await prisma.user.findFirst({
        where: { email: user.email },
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

      if (!userData) {
        throw new AppError("user account not found ", 401);
      }

      const isPasswordSimilar = await compare(user.password, userData.password);
      if (isPasswordSimilar) {
        // Combine both role types
        const systemRoles = userData.userRoles.map((role) => role.name);
        const clinicRoles = userData.clinicUserRoles.map((role) => role.role);
        const allRoles = [...systemRoles, ...clinicRoles].filter((r) => !!r);

        const token = jwt.sign(
          {
            id: userData.id,
            email: userData.email,
            userRoles: allRoles,
            branchId: userData.company?.branchId,
          },
          process.env.JWT_SECRET!,
        );

        // Get industry from company if user has a company association
        const industry = userData.company?.company?.industry || null;

        return {
          message: "login successfull",
          statusCode: 200,
          data: {
            token,
            firstName: userData.firstName,
            lastName: userData.lastName,
            email: userData.email,
            phoneNumber: userData.phoneNumber,
            id: userData.id,
            roles: allRoles,
            photo: userData.photo,
            branchId: userData.company?.branchId,
            industry,
          },
        };
      }
      throw new AppError("user account with email or password not found", 401);
    } catch (error) {
      throw new AppError(error, 500);
    }
  }
  // user signup
  public static async signUpUser(user: ISignUpUser) {
    try {
      // Check if user already exists
      const userExists = await prisma.user.findFirst({
        where: { email: user.email },
      });
      if (userExists) {
        throw new AppError("User already exists", 409);
      }

      // Hash password
      const hashedPassword = await hash(user.password, 10);
      const token = jwt.sign(user.email, process.env.JWT_SECRET!);
      await prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            firstName: user.firstName,
            lastName: user.lastName,
            phoneNumber: user.phoneNumber,
            email: user.email,
            password: hashedPassword,
            photo: typeof user.photo === "string" ? user.photo : undefined,
          },
        });

        if (!createdUser) {
          throw new Error("Failed to create user");
        }

        // Assign the "USER" role
        const assignRole = await tx.userRole.create({
          data: {
            userId: createdUser.id,
            name: roles.CLIENT,
          },
        });

        if (!assignRole) {
          throw new Error("Failed to assign role to user");
        }
      });

      const pt = await prisma.user.findFirst({
        where: { email: user.email },
      });

      return {
        message: "User created successfully",
        data: {
          token,
          photo: pt?.photo,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          roles: [roles.CLIENT],
        },
        statusCode: 201,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async createUser(user: CreateUserDto) {
    try {
      const errors = await userValidations.onCreate(user);
      if (errors[0]) {
        throw new ValidationError(errors);
      }
      const hashedPassword = await hash("Password123!", 10);
      const createdUser = await prisma.user.create({
        data: {
          firstName: user.firstName,
          lastName: user.lastName,
          phoneNumber: user.phoneNumber,
          email: user.email,
          password: hashedPassword,
          photo: typeof user.photo === "string" ? user.photo : undefined,
        },
      });

      await prisma.userRole.create({
        data: {
          userId: createdUser.id,
          name: user.role as RoleType,
        },
      });

      return {
        message: "User created successfully",
        data: createdUser,
        statusCode: 201,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async updateUser(id: string, user: CreateUserDto) {
    try {
      const errors = await userValidations.onUpdate(id, user);
      if (errors[0]) {
        throw new ValidationError(errors);
      }

      const updatedUser = await prisma.user.update({
        where: { id },
        data: {
          firstName: user.firstName,
          lastName: user.lastName,
          phoneNumber: user.phoneNumber,
          email: user.email,
          photo: typeof user.photo === "string" ? user.photo : undefined,
        },
      });

      if (user.role) {
        await prisma.userRole.updateMany({
          where: { userId: id },
          data: { name: user.role as RoleType },
        });
      }

      return {
        message: "User updated successfully",
        data: updatedUser,
        statusCode: 200,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async updatePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new AppError("User not found", 404);

      const isPasswordCorrect = await compare(currentPassword, user.password);
      if (!isPasswordCorrect)
        throw new AppError("Invalid current password", 400);

      const hashedNewPassword = await hash(newPassword, 10);
      await prisma.user.update({
        where: { id: userId },
        data: { password: hashedNewPassword },
      });

      return { message: "Password updated successfully" };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  // Method to request otp
  public static async requestPasswordReset(email: string) {
    const user = await prisma.user.findFirst({ where: { email } });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Generate a 6-digit OTP
    const otp = randomBytes(3).toString("hex").toUpperCase();
    const otpExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

    // Update the user with OTP and expiration time
    await prisma.user.update({
      where: { email },
      data: { otp, otpExpiresAt },
    });

    // Send OTP via HTML email
    const html = renderTemplate("password-reset.html", {
      firstName: user.firstName || "User",
      otp,
      expiresAt: otpExpiresAt.toLocaleString(),
    });
    await sendEmail({
      to: user.email,
      subject: "Password Reset - One-Time Password (OTP)",
      html,
    });

    return { message: "OTP sent to your email " };
  }

  // Method to reset password
  public static async resetPassword(
    email: string,
    otp: string,
    newPassword: string,
  ) {
    const user = await prisma.user.findFirst({ where: { email } });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    if (
      !user.otp ||
      user.otp !== otp ||
      !user.otpExpiresAt ||
      user.otpExpiresAt < new Date()
    ) {
      throw new AppError("Invalid or expired OTP", 400);
    }

    // Hash the new password
    const hashedPassword = await hash(newPassword, 10);

    // Update the user with the new password and clear OTP fields
    await prisma.user.update({
      where: { email },
      data: { password: hashedPassword, otp: null, otpExpiresAt: null },
    });

    return { message: "Password reset successfully" };
  }
  public static async deleteUser(id: string) {
    try {
      // Check if the user exists and include related records
      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          userRoles: true,
          likes: true,
          testimonials: true,
          agents: {
            include: {
              agentReviews: true,
            },
          },
        },
      });

      if (!user) {
        throw new AppError("User not found", 404);
      }

      await prisma.$transaction(async (tx) => {
        // Delete the user's likes
        await tx.likes.deleteMany({
          where: { userId: id },
        });

        // Delete the user's testimonials
        await tx.testimony.deleteMany({
          where: { userId: id },
        });

        // Delete the user's agent reviews if they exist
        for (const agent of user.agents) {
          if (agent.agentReviews) {
            await tx.agentReview.delete({
              where: { id: agent.agentReviews.id },
            });
          }
        }

        // Delete the user's agent records
        if (user.agents.length > 0) {
          await tx.agents.deleteMany({
            where: { userId: id },
          });
        }

        // Delete the user's roles
        await tx.userRole.deleteMany({
          where: { userId: id },
        });

        // Delete the user
        await tx.user.delete({
          where: { id },
        });
      });

      return { message: "User and related activities deleted successfully" };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getMe(req: Request) {
    try {
      const userId = req.user!.id;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: true,
        },
      });

      if (!user) {
        throw new AppError("User not found", 404);
      }

      const userRoles = user.userRoles.map((roleRecord) => roleRecord.name);

      return {
        message: "User fetched successfully",
        statusCode: 200,
        data: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          photo: user.photo,
          roles: userRoles,
        },
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  static async getUserIdsByRole(roleName: RoleType): Promise<string[]> {
    const users = await prisma.user.findMany({
      where: {
        userRoles: {
          some: {
            name: roleName,
          },
        },
      },
      select: {
        id: true,
      },
    });

    return users.map((user) => user.id);
  }

  static async getUserIdsByCompany(companyId: string): Promise<string[]> {
    const companyUsers = await prisma.companyUser.findMany({
      where: {
        companyId,
        isActive: true,
      },
      select: {
        userId: true,
      },
    });

    return companyUsers.map((companyUser) => companyUser.userId);
  }

  public static async getProfile(req: Request) {
    try {
      const userId = req.user!.id;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: true,
        },
      });

      if (!user) {
        throw new AppError("User not found", 404);
      }

      const userRoles = user.userRoles.map((roleRecord) => roleRecord.name);

      return {
        message: "Profile fetched successfully",
        statusCode: 200,
        data: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          photo: user.photo,
          roles: userRoles,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async updateProfile(
    req: Request,
    profileData: UpdateProfileDto,
  ) {
    try {
      const userId = req.user!.id;

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new AppError("User not found", 404);
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          firstName: profileData.firstName,
          lastName: profileData.lastName,
          email: profileData.email,
          phoneNumber: profileData.phoneNumber,
          ...(profileData.photo && {
            photo:
              typeof profileData.photo === "string"
                ? profileData.photo
                : undefined,
          }),
        },
      });

      return {
        message: "Profile updated successfully",
        statusCode: 200,
        data: updatedUser,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async updateAvatar(req: Request, photo: string) {
    try {
      const userId = req.user!.id;

      if (!photo || photo.trim() === "") {
        throw new AppError("Photo is required", 400);
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { photo },
      });

      return {
        message: "Avatar updated successfully",
        statusCode: 200,
        data: { photo: updatedUser.photo },
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async deleteAvatar(req: Request) {
    try {
      const userId = req.user!.id;

      const defaultPhoto =
        "https://img.freepik.com/premium-vector/user-profile-icon-flat-style-member-avatar-vector-illustration-isolated-background-human-permission-sign-business-concept_157943-15752.jpg";

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { photo: defaultPhoto },
      });

      return {
        message: "Avatar deleted successfully",
        statusCode: 200,
        data: { photo: updatedUser.photo },
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }
}
