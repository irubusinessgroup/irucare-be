import { prisma } from "../utils/client";
import AppError from "../utils/error";
import { CreatePatientDto, UpdatePatientDto } from "../utils/interfaces/common";
import type { Request } from "express";

export class PatientService {
  public static async getAllPatients(
    req: Request,
    searchq?: string,
    limit?: number,
    page?: number
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const queryOptions = searchq
      ? {
          companyId,
          OR: [
            { name: { contains: searchq } },
            { phone: { contains: searchq } },
            { patientNO: { contains: searchq } },
            { NID: { contains: searchq } },
          ],
        }
      : { companyId };
    const skip = page && limit ? (page - 1) * limit : undefined;
    const take = limit;

    const patients = await prisma.patient.findMany({
      where: queryOptions,
      include: { address: true, insuranceCards: true },
      skip,
      take,
      orderBy: { createdAt: "desc" },
    });

    const totalItems = await prisma.patient.count({ where: queryOptions });

    return {
      data: patients,
      totalItems,
      currentPage: page || 1,
      itemsPerPage: limit || patients.length,
      message: "Patients retrieved successfully",
    };
  }

  public static async createPatient(data: CreatePatientDto, companyId: string) {
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const lastPatient = await prisma.patient.findFirst({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });

    const lastPatientNumber = lastPatient?.patientNO
      ? parseInt(lastPatient.patientNO.slice(2))
      : 0;

    const newPatientNumber = `PA${(lastPatientNumber + 1)
      .toString()
      .padStart(5, "0")}A`;

    return prisma.$transaction(async (tx) => {
      const patient = await tx.patient.create({
        data: {
          name: data.name,
          identificationType: data.identificationType,
          phone: data.phone,
          gender: data.gender,
          birthDate: new Date(data.birthDate),
          patientNO: newPatientNumber,
          NID: data.NID,
          motherName: data.motherName,
          fatherName: data.fatherName,
          email: data.email,
          nextOfKinName: data.nextOfKinName,
          nextOfKinPhone: data.nextOfKinPhone,
          nextOfKinRelation: data.nextOfKinRelation,
          companyId,
        },
      });

      if (data.address && data.address.length > 0) {
        await tx.patientAddress.createMany({
          data: data.address.map((addr) => ({
            patientId: patient.id,
            country: addr.country,
            province: addr.province,
            district: addr.district,
            sector: addr.sector,
            cell: addr.cell,
            village: addr.village,
            street: addr.street || "",
            // city: addr.city || "",
          })),
        });
      }

      return patient;
    });
  }

  public static async updatePatient(id: string, data: UpdatePatientDto) {
    return prisma.$transaction(async (tx) => {
      const patient = await tx.patient.update({
        where: { id },
        data: {
          name: data.name,
          identificationType: data.identificationType,
          phone: data.phone,
          gender: data.gender,
          birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
          NID: data.NID,
          motherName: data.motherName,
          fatherName: data.fatherName,
          email: data.email,
          nextOfKinName: data.nextOfKinName,
          nextOfKinPhone: data.nextOfKinPhone,
          nextOfKinRelation: data.nextOfKinRelation,
        },
      });

      if (data.address) {
        await tx.patientAddress.deleteMany({ where: { patientId: id } });
        await tx.patientAddress.createMany({
          data: data.address.map((addr) => ({
            patientId: id,
            country: addr.country,
            province: addr.province,
            district: addr.district,
            sector: addr.sector,
            cell: addr.cell,
            village: addr.village,
            street: addr.street || "",
            // city: addr.city || "",
          })),
        });
      }

      return patient;
    });
  }

  public static async deletePatient(id: string) {
    const patient = await prisma.patient.findUnique({ where: { id } });
    if (!patient) throw new AppError("Patient not found", 404);

    await prisma.$transaction(async (tx) => {
      await tx.patientAddress.deleteMany({ where: { patientId: id } });
      await tx.insuranceCard.deleteMany({ where: { patientId: id } });
      await tx.patient.delete({ where: { id } });
    });

    return { message: "Patient deleted successfully" };
  }
}
