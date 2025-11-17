import type { Request } from "express";
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { IPaged, IResponse } from "../utils/interfaces/common";

export interface CreateInsuranceClaimDto {
  patientId: string;
  insuranceCardId: string;
  encounterId?: string;
  billingId?: string;
  diagnosisCodes: string[];
  procedureCodes: string[];
  totalAmount: number;
  notes?: string;
}

export interface UpdateInsuranceClaimDto {
  diagnosisCodes?: string[];
  procedureCodes?: string[];
  totalAmount?: number;
  approvedAmount?: number;
  rejectedAmount?: number;
  status?: string;
  notes?: string;
}

async function getNextClaimNumber(companyId?: string): Promise<string> {
  if (!companyId) {
    const ts = new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, "")
      .slice(0, 14);
    return `CLM-${ts}`;
  }
  const prefix = "CLM";
  const year = new Date().getFullYear();
  // Generate unique claim number
  const count = await prisma.insuranceClaim.count({
    where: {
      claimNumber: { startsWith: `${prefix}-${year}-` },
    },
  });
  const number = (count + 1).toString().padStart(6, "0");
  return `${prefix}-${year}-${number}`;
}

export class InsuranceClaimService {
  public static async list(
    page?: number,
    limit?: number,
    filters?: {
      patientId?: string;
      insuranceCardId?: string;
      encounterId?: string;
      billingId?: string;
      status?: string;
    },
  ): Promise<IPaged<unknown[]>> {
    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 15;
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = {};
    if (filters?.patientId) where.patientId = filters.patientId;
    if (filters?.insuranceCardId)
      where.insuranceCardId = filters.insuranceCardId;
    if (filters?.encounterId) where.encounterId = filters.encounterId;
    if (filters?.billingId) where.billingId = filters.billingId;
    if (filters?.status) where.status = filters.status;

    const [data, totalItems] = await Promise.all([
      prisma.insuranceClaim.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
        include: {
          patient: {
            select: {
              id: true,
              name: true,
              patientNO: true,
            },
          },
          insuranceCard: {
            include: {
              insurance: true,
            },
          },
          encounter: {
            select: {
              id: true,
              status: true,
            },
          },
          billing: {
            select: {
              id: true,
              invoiceNumber: true,
              totalAmount: true,
            },
          },
        },
      }),
      prisma.insuranceClaim.count({ where }),
    ]);

    return {
      data,
      totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      statusCode: 200,
      message: "Insurance claims fetched successfully",
    };
  }

  public static async getById(id: string): Promise<IResponse<unknown>> {
    const claim = await prisma.insuranceClaim.findUnique({
      where: { id },
      include: {
        patient: true,
        insuranceCard: {
          include: {
            insurance: true,
          },
        },
        encounter: true,
        billing: true,
        createdByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!claim) {
      throw new AppError("Insurance claim not found", 404);
    }

    return {
      statusCode: 200,
      message: "Insurance claim fetched successfully",
      data: claim,
    };
  }

  public static async create(
    req: Request,
    dto: CreateInsuranceClaimDto,
  ): Promise<IResponse<unknown>> {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Not Authorized", 401);

    const companyId =
      (req.user && typeof req.user === "object"
        ? (req.user as unknown as { company?: { companyId?: string } }).company
            ?.companyId
        : undefined) || undefined;

    // Validate insurance card
    const insuranceCard = await prisma.insuranceCard.findUnique({
      where: { id: dto.insuranceCardId },
      include: { insurance: true },
    });

    if (!insuranceCard) {
      throw new AppError("Insurance card not found", 404);
    }

    if (insuranceCard.patientId !== dto.patientId) {
      throw new AppError("Insurance card does not belong to patient", 400);
    }

    const claimNumber = await getNextClaimNumber(companyId);

    const created = await prisma.insuranceClaim.create({
      data: {
        patientId: dto.patientId,
        insuranceCardId: dto.insuranceCardId,
        encounterId: dto.encounterId,
        billingId: dto.billingId,
        claimNumber,
        diagnosisCodes: dto.diagnosisCodes,
        procedureCodes: dto.procedureCodes,
        totalAmount: dto.totalAmount,
        status: "DRAFT",
        notes: dto.notes,
        createdBy: userId,
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
          },
        },
        insuranceCard: {
          include: {
            insurance: true,
          },
        },
      },
    });

    return {
      statusCode: 201,
      message: "Insurance claim created successfully",
      data: created,
    };
  }

  public static async update(
    id: string,
    dto: UpdateInsuranceClaimDto,
  ): Promise<IResponse<unknown>> {
    const existing = await prisma.insuranceClaim.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new AppError("Insurance claim not found", 404);
    }

    const updated = await prisma.insuranceClaim.update({
      where: { id },
      data: {
        diagnosisCodes: dto.diagnosisCodes ?? existing.diagnosisCodes,
        procedureCodes: dto.procedureCodes ?? existing.procedureCodes,
        totalAmount: dto.totalAmount ?? existing.totalAmount,
        approvedAmount: dto.approvedAmount ?? existing.approvedAmount,
        rejectedAmount: dto.rejectedAmount ?? existing.rejectedAmount,
        status: dto.status ?? existing.status,
        notes: dto.notes ?? existing.notes,
      },
    });

    return {
      statusCode: 200,
      message: "Insurance claim updated successfully",
      data: updated,
    };
  }

  public static async remove(id: string): Promise<IResponse<null>> {
    const existing = await prisma.insuranceClaim.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new AppError("Insurance claim not found", 404);
    }

    if (existing.status === "SUBMITTED" || existing.status === "APPROVED") {
      throw new AppError("Cannot delete submitted or approved claims", 409);
    }

    await prisma.insuranceClaim.delete({ where: { id } });

    return {
      statusCode: 200,
      message: "Insurance claim deleted successfully",
    };
  }

  public static async submit(id: string): Promise<IResponse<unknown>> {
    const claim = await prisma.insuranceClaim.findUnique({
      where: { id },
    });

    if (!claim) {
      throw new AppError("Insurance claim not found", 404);
    }

    if (claim.status !== "DRAFT") {
      throw new AppError("Only DRAFT claims can be submitted", 409);
    }

    // Generate claim file (HL7/X12 format - simplified for now)
    // In production, this would generate actual HL7 or X12 file
    const claimFileUrl = `/claims/${claim.claimNumber}.txt`; // Placeholder

    const updated = await prisma.insuranceClaim.update({
      where: { id },
      data: {
        status: "SUBMITTED",
        submittedDate: new Date(),
        claimFileUrl,
      },
    });

    return {
      statusCode: 200,
      message: "Insurance claim submitted successfully",
      data: updated,
    };
  }

  public static async processResponse(
    id: string,
    responseData: {
      approvedAmount?: number;
      rejectedAmount?: number;
      responseFileUrl?: string;
      status: "APPROVED" | "REJECTED" | "PARTIAL";
      notes?: string;
    },
  ): Promise<IResponse<unknown>> {
    const claim = await prisma.insuranceClaim.findUnique({
      where: { id },
    });

    if (!claim) {
      throw new AppError("Insurance claim not found", 404);
    }

    if (claim.status !== "SUBMITTED" && claim.status !== "PENDING") {
      throw new AppError(
        "Can only process response for SUBMITTED or PENDING claims",
        409,
      );
    }

    const updated = await prisma.insuranceClaim.update({
      where: { id },
      data: {
        status: responseData.status,
        approvedAmount: responseData.approvedAmount,
        rejectedAmount: responseData.rejectedAmount,
        responseFileUrl: responseData.responseFileUrl,
        responseDate: new Date(),
        notes: responseData.notes ?? claim.notes,
      },
    });

    return {
      statusCode: 200,
      message: "Claim response processed successfully",
      data: updated,
    };
  }
}
