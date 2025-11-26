import type { Request } from "express";
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type {
  AddDiagnosisDto,
  CreateConsultationDto,
  IResponse,
  UpdateConsultationDto,
} from "../utils/interfaces/common";
// import { Prisma } from "@prisma/client";

export class ConsultationService {
  /**
   * Create consultation for encounter
   */
  public static async create(
    req: Request,
    dto: CreateConsultationDto,
  ): Promise<IResponse<unknown>> {
    const userId = req.user?.id;
    const companyId = req.user?.company?.companyId;
    if (!userId || !companyId) throw new AppError("Not Authorized", 401);

    // Verify encounter exists and belongs to company
    const encounter = await prisma.encounter.findFirst({
      where: { id: dto.encounterId, companyId },
      include: { triage: true },
    });

    if (!encounter) throw new AppError("Encounter not found", 404);

    // Check if consultation already exists
    const existingConsultation = await prisma.consultation.findUnique({
      where: { encounterId: dto.encounterId },
    });

    if (existingConsultation) {
      throw new AppError("Consultation already exists for this encounter", 409);
    }

    // Create consultation with diagnoses in a transaction
    const consultation = await prisma.$transaction(async (tx) => {
      const newConsultation = await tx.consultation.create({
        data: {
          encounterId: dto.encounterId,
          patientId: encounter.patientId,
          companyId,
          chiefComplaint: dto.chiefComplaint,
          historyOfPresentingIllness: dto.historyOfPresentingIllness,
          pastMedicalHistory: dto.pastMedicalHistory,
          familyHistory: dto.familyHistory,
          socialHistory: dto.socialHistory,
          reviewOfSystems: dto.reviewOfSystems as any,
          physicalExamination: dto.physicalExamination,
          generalAppearance: dto.generalAppearance,
          systemicExamination: dto.systemicExamination as any,
          clinicalImpression: dto.clinicalImpression,
          differentialDiagnosis: dto.differentialDiagnosis,
          treatmentPlan: dto.treatmentPlan,
          followUpInstructions: dto.followUpInstructions,
          consultedBy: userId,
        },
      });

      // Create diagnoses if provided
      if (dto.diagnoses && dto.diagnoses.length > 0) {
        await tx.diagnosis.createMany({
          data: dto.diagnoses.map((d) => ({
            consultationId: newConsultation.id,
            encounterId: dto.encounterId,
            patientId: encounter.patientId,
            companyId,
            icdCode: d.icdCode,
            icdVersion: d.icdVersion || "ICD-10",
            diagnosisName: d.diagnosisName,
            diagnosisType: d.diagnosisType || "PRIMARY",
            notes: d.notes,
            diagnosedBy: userId,
          })),
        });
      }

      return tx.consultation.findUnique({
        where: { id: newConsultation.id },
        include: {
          diagnoses: true,
          encounter: {
            include: {
              patient: true,
              triage: true,
            },
          },
        },
      });
    });

    return {
      statusCode: 201,
      message: "Consultation created successfully",
      data: consultation,
    };
  }

  /**
   * Get consultation by encounter ID
   */
  public static async getByEncounterId(
    encounterId: string,
    req: Request,
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const consultation = await prisma.consultation.findFirst({
      where: {
        encounterId,
        companyId,
      },
      include: {
        diagnoses: {
          orderBy: { diagnosedAt: "desc" },
        },
        encounter: {
          include: {
            patient: true,
            provider: true,
            triage: true,
          },
        },
        consultedByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!consultation) {
      throw new AppError("Consultation not found", 404);
    }

    return {
      statusCode: 200,
      message: "Consultation fetched successfully",
      data: consultation,
    };
  }

  /**
   * Update consultation
   */
  public static async update(
    id: string,
    dto: UpdateConsultationDto,
    req: Request,
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const existing = await prisma.consultation.findFirst({
      where: { id, companyId },
      include: { encounter: true },
    });

    if (!existing) throw new AppError("Consultation not found", 404);

    // Check if encounter is still in progress
    if (
      existing.encounter.status === "COMPLETED" ||
      existing.encounter.status === "CANCELLED"
    ) {
      throw new AppError(
        "Cannot update consultation for closed encounter",
        409,
      );
    }

    const updated = await prisma.consultation.update({
      where: { id },
      data: {
        chiefComplaint: dto.chiefComplaint,
        historyOfPresentingIllness: dto.historyOfPresentingIllness,
        pastMedicalHistory: dto.pastMedicalHistory,
        familyHistory: dto.familyHistory,
        socialHistory: dto.socialHistory,
        reviewOfSystems: dto.reviewOfSystems as any,
        physicalExamination: dto.physicalExamination,
        generalAppearance: dto.generalAppearance,
        systemicExamination: dto.systemicExamination as any,
        clinicalImpression: dto.clinicalImpression,
        differentialDiagnosis: dto.differentialDiagnosis,
        treatmentPlan: dto.treatmentPlan,
        followUpInstructions: dto.followUpInstructions,
      },
      include: {
        diagnoses: true,
        encounter: {
          include: {
            patient: true,
          },
        },
      },
    });

    return {
      statusCode: 200,
      message: "Consultation updated successfully",
      data: updated,
    };
  }

  /**
   * Add diagnosis to consultation
   */
  public static async addDiagnosis(
    consultationId: string,
    dto: AddDiagnosisDto,
    req: Request,
  ): Promise<IResponse<unknown>> {
    const userId = req.user?.id;
    const companyId = req.user?.company?.companyId;
    if (!userId || !companyId) throw new AppError("Not Authorized", 401);

    const consultation = await prisma.consultation.findFirst({
      where: { id: consultationId, companyId },
    });

    if (!consultation) throw new AppError("Consultation not found", 404);

    const diagnosis = await prisma.diagnosis.create({
      data: {
        consultationId,
        encounterId: consultation.encounterId,
        patientId: consultation.patientId,
        companyId,
        icdCode: dto.icdCode,
        icdVersion: dto.icdVersion || "ICD-10",
        diagnosisName: dto.diagnosisName,
        diagnosisType: dto.diagnosisType || "SECONDARY",
        notes: dto.notes,
        onsetDate: dto.onsetDate ? new Date(dto.onsetDate) : null,
        diagnosedBy: userId,
      },
    });

    return {
      statusCode: 201,
      message: "Diagnosis added successfully",
      data: diagnosis,
    };
  }

  /**
   * Update diagnosis
   */
  public static async updateDiagnosis(
    id: string,
    dto: Partial<AddDiagnosisDto>,
    req: Request,
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const existing = await prisma.diagnosis.findFirst({
      where: { id, companyId },
    });

    if (!existing) throw new AppError("Diagnosis not found", 404);

    const updated = await prisma.diagnosis.update({
      where: { id },
      data: {
        icdCode: dto.icdCode,
        diagnosisName: dto.diagnosisName,
        diagnosisType: dto.diagnosisType,
        notes: dto.notes,
        onsetDate: dto.onsetDate ? new Date(dto.onsetDate) : undefined,
      },
    });

    return {
      statusCode: 200,
      message: "Diagnosis updated successfully",
      data: updated,
    };
  }

  /**
   * Remove/deactivate diagnosis
   */
  public static async removeDiagnosis(
    id: string,
    req: Request,
  ): Promise<IResponse<null>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const existing = await prisma.diagnosis.findFirst({
      where: { id, companyId },
    });

    if (!existing) throw new AppError("Diagnosis not found", 404);

    // Soft delete by marking as inactive
    await prisma.diagnosis.update({
      where: { id },
      data: { isActive: false },
    });

    return {
      statusCode: 200,
      message: "Diagnosis removed successfully",
    };
  }

  /**
   * Get patient's diagnosis history
   */
  public static async getPatientDiagnosisHistory(
    patientId: string,
    req: Request,
  ): Promise<IResponse<unknown[]>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const diagnoses = await prisma.diagnosis.findMany({
      where: {
        patientId,
        companyId,
        isActive: true,
      },
      orderBy: { diagnosedAt: "desc" },
      include: {
        consultation: {
          include: {
            encounter: {
              select: {
                id: true,
                visitNumber: true,
                visitType: true,
                startTime: true,
              },
            },
          },
        },
        diagnosedByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return {
      statusCode: 200,
      message: "Diagnosis history fetched successfully",
      data: diagnoses,
    };
  }
}
