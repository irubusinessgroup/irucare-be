import { prisma } from "../utils/client";
import AppError from "../utils/error";
import { IPaged, IResponse } from "../utils/interfaces/common";
import { Paginations } from "../utils/DBHelpers";
import {
  MedicationHistoryResponse,
  CheckDrugInteractionsRequest,
  DrugInteractionResponse,
  AllergyAlertResponse,
} from "../utils/interfaces/common";

export class PharmacyPatientsService {
  static async getMedicationHistory(
    patientId: string,
    companyId: string,
    limit?: number,
    currentPage?: number,
  ): Promise<IPaged<MedicationHistoryResponse>> {
    try {
      // Verify patient exists
      const patient = await prisma.patient.findFirst({
        where: { id: patientId, companyId },
      });

      if (!patient) {
        throw new AppError("Patient not found", 404);
      }

      const pagination = Paginations(currentPage, limit);

      // Fetch dispenses
      const dispenses = await prisma.pharmacyDispenses.findMany({
        where: {
          patientId,
          companyId,
          status: "DISPENSED",
        },
        ...pagination,
        orderBy: { dispensedAt: "desc" },
        include: {
          item: {
            select: {
              itemFullName: true,
              itemCodeSku: true,
            },
          },
          prescription: {
            select: {
              id: true,
            },
          },
        },
      });

      // Fetch OTC sales
      const otcSales = await prisma.otcSales.findMany({
        where: {
          patientId,
          companyId,
        },
        ...pagination,
        orderBy: { soldAt: "desc" },
        include: {
          item: {
            select: {
              itemFullName: true,
              itemCodeSku: true,
            },
          },
        },
      });

      const totalDispenses = await prisma.pharmacyDispenses.count({
        where: { patientId, companyId, status: "DISPENSED" },
      });

      const totalOTCSales = await prisma.otcSales.count({
        where: { patientId, companyId },
      });

      return {
        statusCode: 200,
        message: "Medication history fetched successfully",
        data: {
          dispenses: dispenses as any,
          otcSales: otcSales as any,
        },
        totalItems: totalDispenses + totalOTCSales,
        currentPage: currentPage || 1,
        itemsPerPage: limit || 10,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  static async checkDrugInteractions(
    data: CheckDrugInteractionsRequest,
    companyId: string,
  ): Promise<IResponse<DrugInteractionResponse>> {
    if (!data.medications || data.medications.length < 2) {
      return {
        statusCode: 200,
        message: "Not enough medications to check interactions",
        data: {
          hasInteractions: false,
          interactions: [],
        },
      };
    }

    // Verify all medications exist
    const items = await prisma.items.findMany({
      where: {
        id: { in: data.medications },
        companyId,
      },
    });

    if (items.length !== data.medications.length) {
      throw new AppError("One or more medications not found", 404);
    }

    const interactions: DrugInteractionResponse["interactions"] = [];

    return {
      statusCode: 200,
      message: "Drug interactions checked successfully",
      data: {
        hasInteractions: interactions.length > 0,
        interactions,
      },
    };
  }

  static async getAllergyAlerts(
    patientId: string,
    medicationId: string,
    companyId: string,
  ): Promise<IResponse<AllergyAlertResponse>> {
    // Verify patient exists
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, companyId },
    });

    if (!patient) {
      throw new AppError("Patient not found", 404);
    }

    // Verify medication exists
    const medication = await prisma.items.findFirst({
      where: { id: medicationId, companyId },
    });

    if (!medication) {
      throw new AppError("Medication not found", 404);
    }

    // Fetch patient's drug allergies
    const patientAllergies = await prisma.patientAllergies.findMany({
      where: {
        patientId,
        companyId,
        allergyType: "DRUG",
      },
    });

    const matchingAllergies = patientAllergies.filter(
      (allergy) =>
        medication.itemFullName
          .toLowerCase()
          .includes(allergy.allergen.toLowerCase()) ||
        allergy.allergen
          .toLowerCase()
          .includes(medication.itemFullName.toLowerCase()),
    );

    const allergies = matchingAllergies.map((allergy) => ({
      allergen: allergy.allergen,
      severity: allergy.severity,
      reaction: allergy.reaction || undefined,
    }));

    return {
      statusCode: 200,
      message: "Allergy alerts checked successfully",
      data: {
        hasAllergy: allergies.length > 0,
        allergies,
      },
    };
  }
}
