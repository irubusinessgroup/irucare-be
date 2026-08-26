import { prisma } from "../utils/client";
import AppError from "../utils/error";
import { CreateBranchDto, UpdateBranchDto } from "../utils/interfaces/common";
import { assertCanAddBranch } from "../utils/subscriptionQuotas";

export class BranchService {
  /**
   * Returns the next available bhfId (01, 02, 03...) for the company.
   * "00" is reserved for the auto-generated Main Branch.
   */
  public static async getNextBhfId(companyId: string): Promise<string> {
    const branches = await prisma.branch.findMany({
      where: { companyId },
      select: { bhfId: true },
    });
    const used = new Set(branches.map((b) => b.bhfId));
    for (let i = 1; i <= 99; i++) {
      const code = i.toString().padStart(2, "0");
      if (!used.has(code)) return code;
    }
    throw new AppError("Maximum number of branches (99) reached", 400);
  }

  public static async createBranch(data: CreateBranchDto, companyId: string) {
    await assertCanAddBranch(companyId);

    // Auto-assign next sequential bhfId if not provided (01, 02, …)
    const bhfId = data.bhfId ?? (await BranchService.getNextBhfId(companyId));

    const branch = await prisma.branch.create({
      data: {
        ...data,
        bhfId,
        companyId,
      },
    });

    return {
      message: "Branch created successfully",
      data: branch,
    };
  }

  public static async getBranches(companyId: string) {
    const branches = await prisma.branch.findMany({
      where: { companyId },
      include: {
        _count: {
          select: { users: true },
        },
      },
      orderBy: { bhfId: "asc" },
    });

    return {
      message: "Branches fetched successfully",
      data: branches,
    };
  }

  public static async getBranch(id: string, companyId: string) {
    const branch = await prisma.branch.findFirst({
      where: { id, companyId },
      include: {
        users: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!branch) {
      throw new AppError("Branch not found", 404);
    }

    return {
      message: "Branch fetched successfully",
      data: branch,
    };
  }

  public static async updateBranch(
    id: string,
    data: UpdateBranchDto,
    companyId: string,
  ) {
    const branch = await prisma.branch.findFirst({
      where: { id, companyId },
    });

    if (!branch) {
      throw new AppError("Branch not found", 404);
    }

    const updatedBranch = await prisma.branch.update({
      where: { id },
      data: {
        ...data,
      },
    });

    return {
      message: "Branch updated successfully",
      data: updatedBranch,
    };
  }

  public static async deleteBranch(id: string, companyId: string) {
    const branch = await prisma.branch.findFirst({
      where: { id, companyId },
      include: {
        users: true,
      },
    });

    if (!branch) {
      throw new AppError("Branch not found", 404);
    }

    if (branch.users.length > 0) {
      throw new AppError(
        "Cannot delete branch with assigned users. Please reassign users first.",
        400,
      );
    }

    // Prevent deletion of the main branch (bhfId "00")
    if (branch.bhfId === "00") {
      throw new AppError(
        "Cannot delete the main branch (bhfId 00). It is auto-generated with the company.",
        400,
      );
    }

    await prisma.branch.delete({
      where: { id },
    });

    return {
      message: "Branch deleted successfully",
    };
  }
}
