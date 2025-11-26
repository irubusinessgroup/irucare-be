import type { Request } from "express";
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type {
  CareProgramType,
  CreateCareProgramDto,
  EnrollPatientDto,
  IPaged,
  IResponse,
  RecordVisitDto,
  UpdateCareProgramDto,
  UpdateEnrollmentDto,
} from "../utils/interfaces/common";
// import { Prisma } from "@prisma/client";

export class CareProgramService {
  /**
   * List care programs
   */
  public static async list(
    req: Request,
    page?: number,
    limit?: number,
    filters?: { programType?: CareProgramType; isActive?: boolean },
  ): Promise<IPaged<unknown[]>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 20;
    const skip = (pageNum - 1) * limitNum;

    const where = {
      companyId,
      programType: filters?.programType,
      isActive: filters?.isActive !== undefined ? filters.isActive : true,
    };

    const [data, totalItems] = await Promise.all([
      prisma.careProgram.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
        include: {
          createdByUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          _count: {
            select: {
              enrollments: true,
            },
          },
        },
      }),
      prisma.careProgram.count({ where }),
    ]);

    return {
      data,
      totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      statusCode: 200,
      message: "Care programs fetched successfully",
    };
  }

  /**
   * Get care program by ID
   */
  public static async getById(
    id: string,
    req: Request,
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const program = await prisma.careProgram.findFirst({
      where: { id, companyId },
      include: {
        createdByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        _count: {
          select: {
            enrollments: true,
          },
        },
      },
    });

    if (!program) {
      throw new AppError("Care program not found", 404);
    }

    return {
      statusCode: 200,
      message: "Care program fetched successfully",
      data: program,
    };
  }

  /**
   * Create care program
   */
  public static async create(
    req: Request,
    dto: CreateCareProgramDto,
  ): Promise<IResponse<unknown>> {
    const userId = req.user?.id;
    const companyId = req.user?.company?.companyId;
    if (!userId || !companyId) throw new AppError("Not Authorized", 401);

    const created = await prisma.careProgram.create({
      data: {
        companyId,
        programName: dto.programName,
        programType: dto.programType,
        description: dto.description,
        eligibilityCriteria: dto.eligibilityCriteria as any,
        protocolSteps: dto.protocolSteps as any,
        createdBy: userId,
      },
    });

    return {
      statusCode: 201,
      message: "Care program created successfully",
      data: created,
    };
  }

  /**
   * Update care program
   */
  public static async update(
    id: string,
    dto: UpdateCareProgramDto,
    req: Request,
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const existing = await prisma.careProgram.findFirst({
      where: { id, companyId },
    });

    if (!existing) throw new AppError("Care program not found", 404);

    const updated = await prisma.careProgram.update({
      where: { id },
      data: {
        programName: dto.programName,
        programType: dto.programType,
        description: dto.description,
        eligibilityCriteria: dto.eligibilityCriteria as any,
        protocolSteps: dto.protocolSteps as any,
        isActive: dto.isActive,
      },
    });

    return {
      statusCode: 200,
      message: "Care program updated successfully",
      data: updated,
    };
  }

  /**
   * Delete care program
   */
  public static async remove(
    id: string,
    req: Request,
  ): Promise<IResponse<null>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const existing = await prisma.careProgram.findFirst({
      where: { id, companyId },
    });

    if (!existing) throw new AppError("Care program not found", 404);

    // Check if program has enrollments
    const enrollmentCount = await prisma.careProgramEnrollment.count({
      where: { programId: id },
    });

    if (enrollmentCount > 0) {
      // Soft delete
      await prisma.careProgram.update({
        where: { id },
        data: { isActive: false },
      });

      return {
        statusCode: 200,
        message: "Care program deactivated (has enrollments)",
      };
    }

    await prisma.careProgram.delete({ where: { id } });

    return {
      statusCode: 200,
      message: "Care program deleted successfully",
    };
  }

  /**
   * Enroll patient in care program
   */
  public static async enrollPatient(
    req: Request,
    dto: EnrollPatientDto,
  ): Promise<IResponse<unknown>> {
    const userId = req.user?.id;
    const companyId = req.user?.company?.companyId;
    if (!userId || !companyId) throw new AppError("Not Authorized", 401);

    // Verify program and patient
    const [program, patient] = await Promise.all([
      prisma.careProgram.findFirst({
        where: { id: dto.programId, companyId, isActive: true },
      }),
      prisma.patient.findFirst({
        where: { id: dto.patientId, companyId },
      }),
    ]);

    if (!program) throw new AppError("Care program not found", 404);
    if (!patient) throw new AppError("Patient not found", 404);

    // Check for active enrollment
    const activeEnrollment = await prisma.careProgramEnrollment.findFirst({
      where: {
        programId: dto.programId,
        patientId: dto.patientId,
        status: "ACTIVE",
      },
    });

    if (activeEnrollment) {
      throw new AppError("Patient already enrolled in this program", 409);
    }

    const enrollment = await prisma.careProgramEnrollment.create({
      data: {
        programId: dto.programId,
        patientId: dto.patientId,
        companyId,
        enrollmentDate: dto.enrollmentDate
          ? new Date(dto.enrollmentDate)
          : new Date(),
        expectedEndDate: dto.expectedEndDate
          ? new Date(dto.expectedEndDate)
          : null,
        notes: dto.notes,
        enrolledBy: userId,
      },
      include: {
        program: true,
        patient: true,
      },
    });

    return {
      statusCode: 201,
      message: "Patient enrolled successfully",
      data: enrollment,
    };
  }

  /**
   * Get patient enrollments
   */
  public static async getPatientEnrollments(
    patientId: string,
    req: Request,
  ): Promise<IResponse<unknown[]>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const enrollments = await prisma.careProgramEnrollment.findMany({
      where: {
        patientId,
        companyId,
      },
      orderBy: { enrollmentDate: "desc" },
      include: {
        program: true,
        enrolledByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        _count: {
          select: {
            visits: true,
          },
        },
      },
    });

    return {
      statusCode: 200,
      message: "Patient enrollments fetched successfully",
      data: enrollments,
    };
  }

  /**
   * Update enrollment
   */
  public static async updateEnrollment(
    id: string,
    dto: UpdateEnrollmentDto,
    req: Request,
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const existing = await prisma.careProgramEnrollment.findFirst({
      where: { id, companyId },
    });

    if (!existing) throw new AppError("Enrollment not found", 404);

    const updated = await prisma.careProgramEnrollment.update({
      where: { id },
      data: {
        expectedEndDate: dto.expectedEndDate
          ? new Date(dto.expectedEndDate)
          : undefined,
        actualEndDate:
          dto.status === "COMPLETED" || dto.status === "DISCONTINUED"
            ? new Date()
            : undefined,
        currentStage: dto.currentStage,
        notes: dto.notes,
        status: dto.status,
        discontinuationReason: dto.discontinuationReason,
      },
      include: {
        program: true,
        patient: true,
      },
    });

    return {
      statusCode: 200,
      message: "Enrollment updated successfully",
      data: updated,
    };
  }

  /**
   * Record care program visit
   */
  public static async recordVisit(
    req: Request,
    dto: RecordVisitDto,
  ): Promise<IResponse<unknown>> {
    const userId = req.user?.id;
    const companyId = req.user?.company?.companyId;
    if (!userId || !companyId) throw new AppError("Not Authorized", 401);

    // Verify enrollment
    const enrollment = await prisma.careProgramEnrollment.findFirst({
      where: { id: dto.enrollmentId, companyId },
    });

    if (!enrollment) throw new AppError("Enrollment not found", 404);

    if (enrollment.status !== "ACTIVE") {
      throw new AppError("Enrollment is not active", 409);
    }

    const visit = await prisma.careProgramVisit.create({
      data: {
        enrollmentId: dto.enrollmentId,
        encounterId: dto.encounterId,
        patientId: enrollment.patientId,
        companyId,
        visitDate: new Date(dto.visitDate),
        visitType: dto.visitType,
        observations: dto.observations as any,
        measurements: dto.measurements as any,
        assessments: dto.assessments as any,
        interventions: dto.interventions as any,
        nextVisitDate: dto.nextVisitDate ? new Date(dto.nextVisitDate) : null,
        notes: dto.notes,
        conductedBy: userId,
      },
      include: {
        enrollment: {
          include: {
            program: true,
          },
        },
        encounter: true,
      },
    });

    return {
      statusCode: 201,
      message: "Care program visit recorded successfully",
      data: visit,
    };
  }

  /**
   * Get enrollment visits
   */
  public static async getEnrollmentVisits(
    enrollmentId: string,
    req: Request,
  ): Promise<IResponse<unknown[]>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const visits = await prisma.careProgramVisit.findMany({
      where: {
        enrollmentId,
        companyId,
      },
      orderBy: { visitDate: "desc" },
      include: {
        encounter: {
          select: {
            id: true,
            visitNumber: true,
            visitType: true,
          },
        },
        conductedByUser: {
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
      message: "Enrollment visits fetched successfully",
      data: visits,
    };
  }

  /**
   * Get program enrollments list
   */
  public static async getProgramEnrollments(
    programId: string,
    req: Request,
    page?: number,
    limit?: number,
    status?: string,
  ): Promise<IPaged<unknown[]>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 20;
    const skip = (pageNum - 1) * limitNum;

    const where = {
      programId,
      companyId,
      status: status || undefined,
    };

    const [data, totalItems] = await Promise.all([
      prisma.careProgramEnrollment.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { enrollmentDate: "desc" },
        include: {
          patient: {
            select: {
              id: true,
              name: true,
              patientNO: true,
            },
          },
          _count: {
            select: {
              visits: true,
            },
          },
        },
      }),
      prisma.careProgramEnrollment.count({ where }),
    ]);

    return {
      data,
      totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      statusCode: 200,
      message: "Program enrollments fetched successfully",
    };
  }
}
