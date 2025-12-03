import type { Request } from "express";
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type {
  ClinicalNoteFilters,
  CreateClinicalNoteDto,
  IPaged,
  IResponse,
  UpdateClinicalNoteDto,
} from "../utils/interfaces/common";

export class ClinicalNoteService {
  /**
   * List clinical notes with filters
   */
  public static async list(
    req: Request,
    page?: number,
    limit?: number,
    filters?: ClinicalNoteFilters,
  ): Promise<IPaged<unknown[]>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 20;
    const skip = (pageNum - 1) * limitNum;

    const dateWhere =
      filters?.startDate || filters?.endDate
        ? {
            createdAt: {
              gte: filters?.startDate ? new Date(filters.startDate) : undefined,
              lte: filters?.endDate ? new Date(filters.endDate) : undefined,
            },
          }
        : {};

    const where = {
      companyId,
      patientId: filters?.patientId,
      encounterId: filters?.encounterId,
      noteType: filters?.noteType,
      ...dateWhere,
    };

    const [data, totalItems] = await Promise.all([
      prisma.clinicalNote.findMany({
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
          encounter: {
            select: {
              id: true,
              visitNumber: true,
              visitType: true,
              startTime: true,
            },
          },
          createdByUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      prisma.clinicalNote.count({ where }),
    ]);

    return {
      data,
      totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      statusCode: 200,
      message: "Clinical notes fetched successfully",
    };
  }

  /**
   * Get clinical note by ID
   */
  public static async getById(
    id: string,
    req: Request,
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const note = await prisma.clinicalNote.findFirst({
      where: { id, companyId },
      include: {
        patient: true,
        encounter: {
          include: {
            provider: {
              select: {
                id: true,
                name: true,
              },
            },
            triage: true,
            consultation: {
              include: {
                diagnoses: true,
              },
            },
          },
        },
        createdByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!note) {
      throw new AppError("Clinical note not found", 404);
    }

    return {
      statusCode: 200,
      message: "Clinical note fetched successfully",
      data: note,
    };
  }

  /**
   * Create clinical note
   */
  public static async create(
    req: Request,
    dto: CreateClinicalNoteDto,
  ): Promise<IResponse<unknown>> {
    const userId = req.user?.id;
    const companyId = req.user?.company?.companyId;
    if (!userId || !companyId) throw new AppError("Not Authorized", 401);

    // Verify encounter exists
    const encounter = await prisma.encounter.findFirst({
      where: { id: dto.encounterId, companyId },
    });

    if (!encounter) throw new AppError("Encounter not found", 404);

    const created = await prisma.clinicalNote.create({
      data: {
        encounterId: dto.encounterId,
        patientId: encounter.patientId,
        companyId,
        noteType: dto.noteType,
        title: dto.title,
        content: dto.content,
        admissionDate: dto.admissionDate ? new Date(dto.admissionDate) : null,
        dischargeDate: dto.dischargeDate ? new Date(dto.dischargeDate) : null,
        dischargeDiagnosis: dto.dischargeDiagnosis,
        dischargeInstructions: dto.dischargeInstructions,
        referralTo: dto.referralTo,
        referralReason: dto.referralReason,
        referralUrgency: dto.referralUrgency,
        attachments: dto.attachments as any,
        createdBy: userId,
      },
      include: {
        patient: true,
        encounter: true,
      },
    });

    return {
      statusCode: 201,
      message: "Clinical note created successfully",
      data: created,
    };
  }

  /**
   * Update clinical note
   */
  public static async update(
    id: string,
    dto: UpdateClinicalNoteDto,
    req: Request,
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const existing = await prisma.clinicalNote.findFirst({
      where: { id, companyId },
    });

    if (!existing) throw new AppError("Clinical note not found", 404);

    const updated = await prisma.clinicalNote.update({
      where: { id },
      data: {
        title: dto.title,
        content: dto.content,
        admissionDate: dto.admissionDate
          ? new Date(dto.admissionDate)
          : undefined,
        dischargeDate: dto.dischargeDate
          ? new Date(dto.dischargeDate)
          : undefined,
        dischargeDiagnosis: dto.dischargeDiagnosis,
        dischargeInstructions: dto.dischargeInstructions,
        referralTo: dto.referralTo,
        referralReason: dto.referralReason,
        referralUrgency: dto.referralUrgency,
        attachments: dto.attachments as any,
      },
      include: {
        patient: true,
        encounter: true,
      },
    });

    return {
      statusCode: 200,
      message: "Clinical note updated successfully",
      data: updated,
    };
  }

  /**
   * Delete clinical note
   */
  public static async remove(
    id: string,
    req: Request,
  ): Promise<IResponse<null>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const existing = await prisma.clinicalNote.findFirst({
      where: { id, companyId },
    });

    if (!existing) throw new AppError("Clinical note not found", 404);

    await prisma.clinicalNote.delete({ where: { id } });

    return {
      statusCode: 200,
      message: "Clinical note deleted successfully",
    };
  }

  /**
   * Get encounter notes
   */
  public static async getEncounterNotes(
    encounterId: string,
    req: Request,
  ): Promise<IResponse<unknown[]>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const notes = await prisma.clinicalNote.findMany({
      where: {
        encounterId,
        companyId,
      },
      orderBy: { createdAt: "desc" },
      include: {
        createdByUser: {
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
      message: "Encounter notes fetched successfully",
      data: notes,
    };
  }

  /**
   * Generate discharge summary
   */
  public static async generateDischargeSummary(
    encounterId: string,
    req: Request,
  ): Promise<IResponse<unknown>> {
    const userId = req.user?.id;
    const companyId = req.user?.company?.companyId;
    if (!userId || !companyId) throw new AppError("Not Authorized", 401);

    // Get encounter with all related data
    const encounter = await prisma.encounter.findFirst({
      where: { id: encounterId, companyId },
      include: {
        patient: true,
        provider: true,
        triage: true,
        consultation: {
          include: {
            diagnoses: true,
          },
        },
        prescriptions: {
          where: { status: { not: "CANCELLED" } },
        },
        labOrders: {
          where: { status: "COMPLETED" },
          include: {
            test: true,
            results: true,
          },
        },
        procedureOrders: {
          where: { status: "COMPLETED" },
        },
      },
    });

    if (!encounter) throw new AppError("Encounter not found", 404);

    // Generate discharge summary content
    const content = this.formatDischargeSummary(encounter);

    const dischargeSummary = await prisma.clinicalNote.create({
      data: {
        encounterId,
        patientId: encounter.patientId,
        companyId,
        noteType: "DISCHARGE_SUMMARY",
        title: `Discharge Summary - ${encounter.visitNumber}`,
        content,
        admissionDate: encounter.startTime,
        dischargeDate: new Date(),
        dischargeDiagnosis: encounter.consultation?.diagnoses
          .filter((d: any) => d.diagnosisType === "PRIMARY")
          .map((d: any) => d.diagnosisName)
          .join(", "),
        dischargeInstructions: encounter.consultation?.followUpInstructions,
        createdBy: userId,
      },
    });

    return {
      statusCode: 201,
      message: "Discharge summary generated successfully",
      data: dischargeSummary,
    };
  }

  /**
   * Format discharge summary content
   */
  private static formatDischargeSummary(encounter: any): string {
    let content = `DISCHARGE SUMMARY\n\n`;
    content += `Patient: ${encounter.patient.firstName} ${encounter.patient.lastName}\n`;
    content += `Patient Number: ${encounter.patient.patientNumber}\n`;
    content += `Visit Number: ${encounter.visitNumber}\n`;
    content += `Admission Date: ${encounter.startTime?.toLocaleDateString()}\n`;
    content += `Discharge Date: ${new Date().toLocaleDateString()}\n`;
    content += `Attending Physician: ${encounter.provider.firstName} ${encounter.provider.lastName}\n\n`;

    if (encounter.consultation?.chiefComplaint) {
      content += `CHIEF COMPLAINT:\n${encounter.consultation.chiefComplaint}\n\n`;
    }

    if (encounter.consultation?.historyOfPresentingIllness) {
      content += `HISTORY OF PRESENT ILLNESS:\n${encounter.consultation.historyOfPresentingIllness}\n\n`;
    }

    if (encounter.triage) {
      content += `VITAL SIGNS AT ADMISSION:\n`;
      if (encounter.triage.temperature)
        content += `Temperature: ${encounter.triage.temperature}°C\n`;
      if (encounter.triage.bloodPressureSystolic)
        content += `Blood Pressure: ${encounter.triage.bloodPressureSystolic}/${encounter.triage.bloodPressureDiastolic} mmHg\n`;
      if (encounter.triage.heartRate)
        content += `Heart Rate: ${encounter.triage.heartRate} bpm\n`;
      content += `\n`;
    }

    if (encounter.consultation?.diagnoses?.length > 0) {
      content += `DIAGNOSES:\n`;
      encounter.consultation.diagnoses.forEach((d: any) => {
        content += `- ${d.diagnosisName} (${d.icdCode}) [${d.diagnosisType}]\n`;
      });
      content += `\n`;
    }

    if (encounter.consultation?.treatmentPlan) {
      content += `TREATMENT GIVEN:\n${encounter.consultation.treatmentPlan}\n\n`;
    }

    if (encounter.prescriptions?.length > 0) {
      content += `MEDICATIONS PRESCRIBED:\n`;
      encounter.prescriptions.forEach((p: any) => {
        content += `- ${p.medicationName} ${p.dosage} ${p.frequency} ${p.route}\n`;
      });
      content += `\n`;
    }

    if (encounter.consultation?.followUpInstructions) {
      content += `DISCHARGE INSTRUCTIONS:\n${encounter.consultation.followUpInstructions}\n\n`;
    }

    return content;
  }
}
