import { prisma } from "../utils/client";
import AppError from "../utils/error";
import { compare } from "bcrypt";
import { randomBytes } from "crypto";
import { BackupService } from "./BackupService";
import { roles } from "../utils/roles";
import { hashSync } from "bcrypt";

export class ResetService {
  public static async resetCompanyData(companyId: string): Promise<{
    message: string;
    statusCode: number;
  }> {
    try {
      // Verify company exists
      const company = await prisma.company.findUnique({
        where: { id: companyId },
      });

      if (!company) {
        throw new AppError("Company not found", 404);
      }

      await prisma.$transaction(
        async (tx) => {
          // Delete order respecting foreign keys:

          // 1. Appointment notifications and appointments

          await tx.appointment.deleteMany({
            where: { companyId },
          });

          // 2. Delivery tracking and items
          await tx.deliveryTracking.deleteMany({
            where: {
              delivery: {
                OR: [
                  { supplierCompanyId: companyId },
                  { buyerCompanyId: companyId },
                ],
              },
            },
          });
          await tx.deliveryItem.deleteMany({
            where: {
              delivery: {
                OR: [
                  { supplierCompanyId: companyId },
                  { buyerCompanyId: companyId },
                ],
              },
            },
          });
          await tx.delivery.deleteMany({
            where: {
              OR: [
                { supplierCompanyId: companyId },
                { buyerCompanyId: companyId },
              ],
            },
          });

          // 3. Direct invoice items and invoices
          await tx.directInvoiceItem.deleteMany({
            where: {
              invoice: {
                companyId,
              },
            },
          });
          await tx.directInvoice.deleteMany({
            where: { companyId },
          });
          await tx.invoiceSequence.deleteMany({
            where: { companyId },
          });

          // 4. Sell items and sells
          await tx.sellItem.deleteMany({
            where: {
              sell: {
                companyId,
              },
            },
          });
          await tx.sell.deleteMany({
            where: { companyId },
          });

          // 5. Stock, stock receipts, and approvals
          await tx.stock.deleteMany({
            where: {
              stockReceipt: {
                companyId,
              },
            },
          });
          await tx.approvals.deleteMany({
            where: {
              stockReceipts: {
                companyId,
              },
            },
          });
          await tx.stockReceipts.deleteMany({
            where: { companyId },
          });

          // 6. Purchase order items, processing, and orders
          await tx.purchaseOrderItem.deleteMany({
            where: {
              purchaseOrder: {
                companyId,
              },
            },
          });
          await tx.purchaseOrderProcessing.deleteMany({
            where: {
              OR: [{ companyFromId: companyId }, { companyToId: companyId }],
            },
          });
          await tx.purchaseOrder.deleteMany({
            where: { companyId },
          });

          // 7. Insurance details, cards, and insurance
          await tx.insuranceDetail.deleteMany({
            where: {
              insuranceCard: {
                companyId,
              },
            },
          });
          await tx.insuranceCard.deleteMany({
            where: { companyId },
          });
          await tx.insurance.deleteMany({
            where: { companyId },
          });

          // 8. Patient addresses and patients
          await tx.patientAddress.deleteMany({
            where: {
              patient: {
                companyId,
              },
            },
          });
          await tx.patient.deleteMany({
            where: { companyId },
          });

          // 9. Transactions
          await tx.transaction.deleteMany({
            where: { companyId },
          });

          // 10. Clients
          await tx.client.deleteMany({
            where: { companyId },
          });

          // 11. Items and item categories
          await tx.items.deleteMany({
            where: { companyId },
          });
          await tx.itemCategories.deleteMany({
            where: { companyId },
          });

          // 12. Warehouses
          await tx.warehouse.deleteMany({
            where: { companyId },
          });

          // 13. Suppliers
          await tx.suppliers.deleteMany({
            where: { companyId },
          });
        },
        {
          timeout: 60000, // 60 seconds timeout for large deletions
        },
      );

      return {
        message: "Company data reset successfully",
        statusCode: 200,
      };
    } catch (error) {
      throw new AppError(
        error instanceof Error ? error.message : "Failed to reset company data",
        500,
      );
    }
  }

  public static async generateResetToken(userId: string): Promise<{
    token: string;
    expiresAt: Date;
  }> {
    try {
      // Verify user has ADMIN role
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: true,
        },
      });

      if (!user) {
        throw new AppError("User not found", 404);
      }

      const hasAdminRole = user.userRoles.some(
        (role) => role.name === roles.ADMIN,
      );

      if (!hasAdminRole) {
        throw new AppError("Only ADMIN users can generate reset tokens", 403);
      }

      // Generate secure random token
      const token = randomBytes(32).toString("hex");

      // Set expiry to 24 hours from now
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      // Upsert reset token (delete old one if exists)
      await prisma.resetToken.upsert({
        where: { userId },
        update: {
          token,
          expiresAt,
          usedAt: null,
        },
        create: {
          userId,
          token,
          expiresAt,
        },
      });

      return {
        token,
        expiresAt,
      };
    } catch (error) {
      throw new AppError(
        error instanceof Error
          ? error.message
          : "Failed to generate reset token",
        500,
      );
    }
  }

  public static async validateResetToken(
    userId: string,
    token: string,
    password: string,
  ): Promise<boolean> {
    try {
      // Get user with roles
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: true,
          resetToken: true,
        },
      });

      if (!user) {
        throw new AppError("User not found", 404);
      }

      // Verify ADMIN role
      const hasAdminRole = user.userRoles.some(
        (role) => role.name === roles.ADMIN,
      );

      if (!hasAdminRole) {
        throw new AppError("Only ADMIN users can perform factory reset", 403);
      }

      // Verify password
      const isPasswordValid = await compare(password, user.password);
      if (!isPasswordValid) {
        throw new AppError("Invalid password", 401);
      }

      // Verify token exists
      if (!user.resetToken) {
        throw new AppError(
          "Reset token not found. Generate a new token first.",
          404,
        );
      }

      // Check if token was already used
      if (user.resetToken.usedAt) {
        throw new AppError("Reset token has already been used", 400);
      }

      // Check if token is expired
      if (new Date() > user.resetToken.expiresAt) {
        throw new AppError("Reset token has expired", 400);
      }

      // Verify token matches
      if (user.resetToken.token !== token) {
        throw new AppError("Invalid reset token", 401);
      }

      return true;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        error instanceof Error
          ? error.message
          : "Failed to validate reset token",
        500,
      );
    }
  }

  public static async factoryReset(
    userId: string,
    resetType: "COMPLETE" | "PARTIAL",
    backupPath: string,
  ): Promise<{
    message: string;
    requiresSetup: boolean;
    seedComplete: boolean;
  }> {
    try {
      // Validate backup exists
      const backupValid = await BackupService.validateBackup(backupPath);
      if (!backupValid) {
        throw new AppError("Backup file is invalid or does not exist", 400);
      }

      // Mark token as used
      await prisma.resetToken.update({
        where: { userId },
        data: { usedAt: new Date() },
      });

      if (resetType === "COMPLETE") {
        // Delete everything except schema structure
        await prisma.$transaction(
          async (tx) => {
            // Delete all data in reverse dependency order

            // Appointment system
            await tx.appointment.deleteMany({});

            // Delivery system
            await tx.deliveryTracking.deleteMany({});
            await tx.deliveryItem.deleteMany({});
            await tx.delivery.deleteMany({});

            // Direct invoices
            await tx.directInvoiceItem.deleteMany({});
            await tx.directInvoice.deleteMany({});
            await tx.invoiceSequence.deleteMany({});

            // Sales
            await tx.sellItem.deleteMany({});
            await tx.sell.deleteMany({});

            // Stock
            await tx.stock.deleteMany({});
            await tx.approvals.deleteMany({});
            await tx.stockReceipts.deleteMany({});

            // Purchase orders
            await tx.purchaseOrderItem.deleteMany({});
            await tx.purchaseOrderProcessing.deleteMany({});
            await tx.purchaseOrder.deleteMany({});

            // Insurance
            await tx.insuranceDetail.deleteMany({});
            await tx.insuranceCard.deleteMany({});
            await tx.insurance.deleteMany({});

            // Patients
            await tx.patientAddress.deleteMany({});
            await tx.patient.deleteMany({});

            // Transactions
            await tx.transaction.deleteMany({});

            // Clients
            await tx.client.deleteMany({});

            // Items
            await tx.items.deleteMany({});
            await tx.itemCategories.deleteMany({});

            // Warehouses
            await tx.warehouse.deleteMany({});

            // Suppliers
            await tx.suppliers.deleteMany({});

            // Company users and companies
            await tx.companyUser.deleteMany({});
            await tx.companyTools.deleteMany({});
            await tx.company.deleteMany({});

            // Subscriptions and payments
            await tx.payment.deleteMany({});
            await tx.subscription.deleteMany({});

            // Users (except the current admin)
            await tx.userRole.deleteMany({
              where: {
                userId: { not: userId },
              },
            });
            await tx.user.deleteMany({
              where: { id: { not: userId } },
            });

            // Other system data
            await tx.notification.deleteMany({});
            await tx.trialFeedback.deleteMany({});
            await tx.demoRequest.deleteMany({});
            await tx.trialApplication.deleteMany({});
            await tx.contactReply.deleteMany({});
            await tx.contact.deleteMany({});
            await tx.orderItem.deleteMany({});
            await tx.order.deleteMany({});
            await tx.plan.deleteMany({});
          },
          {
            timeout: 120000, // 2 minutes timeout
          },
        );
      } else {
        await prisma.$transaction(
          async (tx) => {
            // Appointment system
            await tx.appointment.deleteMany({});

            // Delivery system
            await tx.deliveryTracking.deleteMany({});
            await tx.deliveryItem.deleteMany({});
            await tx.delivery.deleteMany({});

            // Direct invoices
            await tx.directInvoiceItem.deleteMany({});
            await tx.directInvoice.deleteMany({});
            await tx.invoiceSequence.deleteMany({});

            // Sales
            await tx.sellItem.deleteMany({});
            await tx.sell.deleteMany({});

            // Stock
            await tx.stock.deleteMany({});
            await tx.approvals.deleteMany({});
            await tx.stockReceipts.deleteMany({});

            // Purchase orders
            await tx.purchaseOrderItem.deleteMany({});
            await tx.purchaseOrderProcessing.deleteMany({});
            await tx.purchaseOrder.deleteMany({});

            // Insurance
            await tx.insuranceDetail.deleteMany({});
            await tx.insuranceCard.deleteMany({});
            await tx.insurance.deleteMany({});

            // Patients
            await tx.patientAddress.deleteMany({});
            await tx.patient.deleteMany({});

            // Transactions
            await tx.transaction.deleteMany({});

            // Clients
            await tx.client.deleteMany({});

            // Items
            await tx.items.deleteMany({});
            await tx.itemCategories.deleteMany({});

            // Warehouses
            await tx.warehouse.deleteMany({});

            // Suppliers
            await tx.suppliers.deleteMany({});

            // Company users and companies
            await tx.companyUser.deleteMany({});
            await tx.companyTools.deleteMany({});
            await tx.company.deleteMany({});

            // Subscriptions and payments
            await tx.payment.deleteMany({});
            await tx.subscription.deleteMany({});

            // Users (except the current admin)
            await tx.userRole.deleteMany({
              where: {
                userId: { not: userId },
              },
            });
            await tx.user.deleteMany({
              where: { id: { not: userId } },
            });

            // Other system data
            await tx.notification.deleteMany({});
            await tx.trialFeedback.deleteMany({});
            await tx.demoRequest.deleteMany({});
            await tx.trialApplication.deleteMany({});
            await tx.contactReply.deleteMany({});
            await tx.contact.deleteMany({});
            await tx.orderItem.deleteMany({});
            await tx.order.deleteMany({});
            await tx.plan.deleteMany({});
          },
          {
            timeout: 120000,
          },
        );
      }

      // Reseed database
      const seedComplete = await this.reseedDatabase(userId);

      return {
        message: `Factory reset completed successfully (${resetType} mode)`,
        requiresSetup: true,
        seedComplete,
      };
    } catch (error) {
      throw new AppError(
        error instanceof Error
          ? error.message
          : "Failed to perform factory reset",
        500,
      );
    }
  }

  /**
   * Reseed database with initial data (Plans and default ADMIN user)
   */
  private static async reseedDatabase(userId: string): Promise<boolean> {
    try {
      // Ensure current user has ADMIN role
      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        include: { userRoles: true },
      });

      if (currentUser) {
        const hasAdminRole = currentUser.userRoles.some(
          (role) => role.name === roles.ADMIN,
        );

        if (!hasAdminRole) {
          await prisma.userRole.create({
            data: {
              userId: currentUser.id,
              name: roles.ADMIN,
            },
          });
        }
      } else {
        // Create default admin user if current user doesn't exist
        const adminUser = await prisma.user.create({
          data: {
            email: "admin@gmail.com",
            firstName: "AKILI",
            lastName: "Admin",
            password: hashSync("Password123!", 10),
          },
        });

        await prisma.userRole.create({
          data: {
            userId: adminUser.id,
            name: roles.ADMIN,
          },
        });
      }

      return true;
    } catch (error) {
      console.error("Reseeding failed:", error);
      return false;
    }
  }
}
