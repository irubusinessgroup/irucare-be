import { prisma } from "../utils/client";
import AppError from "../utils/error";
import { CreateDoctorDto, UpdateDoctorDto } from "../utils/interfaces/common";
import type { Request } from "express";

export class DoctorService {
  public static async getAllDoctors(
    req: Request,
    searchq?: string,
    limit?: number,
    page?: number,
  ) {
    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 15;
    const skip = (pageNum - 1) * limitNum;
    const take = limitNum;

    const where = searchq
      ? {
          OR: [
            { name: { contains: searchq, mode: "insensitive" as const } },
            { code: { contains: searchq, mode: "insensitive" as const } },
          ],
        }
      : {};

    const doctors = await prisma.doctor.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
    });

    const totalItems = await prisma.doctor.count({ where });

    return {
      data: doctors,
      totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      message: "Doctors retrieved successfully",
    };
  }

  public static async getDoctorById(id: string) {
    const doctor = await prisma.doctor.findUnique({
      where: { id },
    });

    if (!doctor) {
      throw new AppError("Doctor not found", 404);
    }

    return {
      data: doctor,
      message: "Doctor retrieved successfully",
    };
  }

  public static async createDoctor(data: CreateDoctorDto) {
    const doctor = await prisma.doctor.create({
      data,
    });

    return {
      data: doctor,
      message: "Doctor created successfully",
    };
  }

  public static async updateDoctor(id: string, data: UpdateDoctorDto) {
    const existingDoctor = await prisma.doctor.findUnique({
      where: { id },
    });

    if (!existingDoctor) {
      throw new AppError("Doctor not found", 404);
    }

    const doctor = await prisma.doctor.update({
      where: { id },
      data,
    });

    return {
      data: doctor,
      message: "Doctor updated successfully",
    };
  }

  public static async deleteDoctor(id: string) {
    const existingDoctor = await prisma.doctor.findUnique({
      where: { id },
    });

    if (!existingDoctor) {
      throw new AppError("Doctor not found", 404);
    }

    await prisma.doctor.delete({
      where: { id },
    });

    return {
      message: "Doctor deleted successfully",
    };
  }
}
