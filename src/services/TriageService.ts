import type { Request } from "express";
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type {
  CreateTriageDto,
  IResponse,
  UpdateTriageDto,
} from "../utils/interfaces/common";

export class TriageService {
  /**
   * Create triage record for encounter
   */
  public static async create(
    req: Request,
    dto: CreateTriageDto,
  ): Promise<IResponse<unknown>> {
    const userId = req.user?.id;
    const companyId = req.user?.company?.companyId;
    if (!userId || !companyId) throw new AppError("Not Authorized", 401);

    // Verify encounter exists and belongs to company
    const encounter = await prisma.encounter.findFirst({
      where: { id: dto.encounterId, companyId },
    });

    if (!encounter) throw new AppError("Encounter not found", 404);

    // Check if triage already exists
    const existingTriage = await prisma.triage.findUnique({
      where: { encounterId: dto.encounterId },
    });

    if (existingTriage) {
      throw new AppError("Triage already exists for this encounter", 409);
    }

    // Calculate BMI if height and weight provided
    let bmi: number | undefined;
    if (dto.height && dto.weight) {
      const heightInMeters = dto.height / 100;
      bmi = dto.weight / (heightInMeters * heightInMeters);
      bmi = Math.round(bmi * 10) / 10; // Round to 1 decimal
    }

    const triage = await prisma.triage.create({
      data: {
        encounterId: dto.encounterId,
        patientId: encounter.patientId,
        companyId,
        triageLevel: dto.triageLevel,
        chiefComplaint: dto.chiefComplaint,
        triageNotes: dto.triageNotes,
        temperature: dto.temperature,
        bloodPressureSystolic: dto.bloodPressureSystolic,
        bloodPressureDiastolic: dto.bloodPressureDiastolic,
        heartRate: dto.heartRate,
        respiratoryRate: dto.respiratoryRate,
        oxygenSaturation: dto.oxygenSaturation,
        weight: dto.weight,
        height: dto.height,
        bmi,
        painScore: dto.painScore,
        allergies: dto.allergies,
        currentMedications: dto.currentMedications,
        capturedBy: userId,
      },
      include: {
        encounter: {
          include: {
            patient: true,
          },
        },
      },
    });

    // Update encounter status to IN_PROGRESS if not already
    if (encounter.status === "SCHEDULED") {
      await prisma.encounter.update({
        where: { id: dto.encounterId },
        data: {
          status: "IN_PROGRESS",
          startTime: new Date(),
        },
      });
    }

    return {
      statusCode: 201,
      message: "Triage created successfully",
      data: triage,
    };
  }

  /**
   * Get triage by encounter ID
   */
  public static async getByEncounterId(
    encounterId: string,
    req: Request,
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const triage = await prisma.triage.findFirst({
      where: {
        encounterId,
        companyId,
      },
      include: {
        encounter: {
          include: {
            patient: true,
            provider: true,
          },
        },
        capturedByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!triage) {
      throw new AppError("Triage not found", 404);
    }

    return {
      statusCode: 200,
      message: "Triage fetched successfully",
      data: triage,
    };
  }

  /**
   * Update triage record
   */
  public static async update(
    id: string,
    dto: UpdateTriageDto,
    req: Request,
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const existing = await prisma.triage.findFirst({
      where: { id, companyId },
    });

    if (!existing) throw new AppError("Triage not found", 404);

    // Recalculate BMI if height or weight updated
    let bmi = existing.bmi;
    const height = dto.height ?? existing.height;
    const weight = dto.weight ?? existing.weight;

    if (height && weight) {
      const heightInMeters = height / 100;
      bmi = weight / (heightInMeters * heightInMeters);
      bmi = Math.round(bmi * 10) / 10;
    }

    const updated = await prisma.triage.update({
      where: { id },
      data: {
        triageLevel: dto.triageLevel,
        chiefComplaint: dto.chiefComplaint,
        triageNotes: dto.triageNotes,
        temperature: dto.temperature,
        bloodPressureSystolic: dto.bloodPressureSystolic,
        bloodPressureDiastolic: dto.bloodPressureDiastolic,
        heartRate: dto.heartRate,
        respiratoryRate: dto.respiratoryRate,
        oxygenSaturation: dto.oxygenSaturation,
        weight: dto.weight,
        height: dto.height,
        bmi,
        painScore: dto.painScore,
        allergies: dto.allergies,
        currentMedications: dto.currentMedications,
      },
      include: {
        encounter: {
          include: {
            patient: true,
          },
        },
      },
    });

    return {
      statusCode: 200,
      message: "Triage updated successfully",
      data: updated,
    };
  }

  /**
   * Get patient's vital history
   */
  public static async getPatientVitalsHistory(
    patientId: string,
    req: Request,
    limit?: number,
  ): Promise<IResponse<unknown[]>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const limitNum = Number(limit) > 0 ? Number(limit) : 10;

    const vitals = await prisma.triage.findMany({
      where: {
        patientId,
        companyId,
      },
      orderBy: { capturedAt: "desc" },
      take: limitNum,
      select: {
        id: true,
        capturedAt: true,
        temperature: true,
        bloodPressureSystolic: true,
        bloodPressureDiastolic: true,
        heartRate: true,
        respiratoryRate: true,
        oxygenSaturation: true,
        weight: true,
        height: true,
        bmi: true,
        encounter: {
          select: {
            id: true,
            visitNumber: true,
            visitType: true,
          },
        },
      },
    });

    return {
      statusCode: 200,
      message: "Vital signs history fetched successfully",
      data: vitals,
    };
  }

  /**
   * Get triage queue (pending triage cases)
   */
  public static async getTriageQueue(
    req: Request,
  ): Promise<IResponse<unknown[]>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    // Get encounters that are in progress but don't have triage yet
    const pendingTriage = await prisma.encounter.findMany({
      where: {
        companyId,
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
        triage: null,
      },
      orderBy: { scheduledTime: "asc" },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            patientNO: true,
            birthDate: true,
            gender: true,
          },
        },
        provider: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      statusCode: 200,
      message: "Triage queue fetched successfully",
      data: pendingTriage,
    };
  }
}
