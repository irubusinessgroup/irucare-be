import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { IResponse } from "../utils/interfaces/common";
import type { PrescriptionItem } from "../utils/interfaces/common";

export interface ValidationWarning {
  type: "INTERACTION" | "ALLERGY" | "DOSAGE";
  severity: "WARNING" | "ERROR";
  message: string;
  medication?: string;
  details?: Record<string, unknown>;
}

export interface DrugInteractionCheck {
  medications: string[];
}

export interface AllergyCheck {
  medicationName: string;
  patientId: string;
}

export interface DosageValidation {
  medication: string;
  dosage: string;
  patientId?: string;
  patientAge?: number;
  patientWeight?: number;
}

export class ClinicalDecisionSupportService {
  /**
   * Check for drug interactions between multiple medications
   */
  public static async checkInteractions(
    dto: DrugInteractionCheck,
  ): Promise<IResponse<ValidationWarning[]>> {
    const warnings: ValidationWarning[] = [];

    // Known drug interactions (in production, this would query a drug interaction database)
    const knownInteractions: Record<string, string[]> = {
      warfarin: ["aspirin", "ibuprofen", "naproxen"],
      aspirin: ["warfarin", "ibuprofen"],
      metformin: ["alcohol"],
      digoxin: ["quinidine", "verapamil"],
    };

    const medications = dto.medications.map((m) => m.toLowerCase());

    // Check for known interactions
    for (let i = 0; i < medications.length; i++) {
      for (let j = i + 1; j < medications.length; j++) {
        const med1 = medications[i];
        const med2 = medications[j];

        // Check both directions
        if (
          knownInteractions[med1]?.includes(med2) ||
          knownInteractions[med2]?.includes(med1)
        ) {
          warnings.push({
            type: "INTERACTION",
            severity: "WARNING",
            message: `Potential drug interaction between ${med1} and ${med2}`,
            medication: `${med1} and ${med2}`,
            details: {
              medication1: med1,
              medication2: med2,
            },
          });
        }
      }
    }

    // In production, integrate with RxNorm, DrugBank API, or similar
    // This is a simplified mock implementation

    return {
      statusCode: 200,
      message: "Drug interaction check completed",
      data: warnings,
    };
  }

  /**
   * Check if patient has allergies to a medication
   */
  public static async checkAllergies(
    dto: AllergyCheck,
  ): Promise<IResponse<ValidationWarning[]>> {
    const warnings: ValidationWarning[] = [];

    // Get patient EMR records for allergies
    const emrRecords = await prisma.eMR.findMany({
      where: {
        patientId: dto.patientId,
        recordType: {
          in: ["DIAGNOSIS", "NOTE"],
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Check EMR content for allergy mentions
    const medicationLower = dto.medicationName.toLowerCase();
    const allergyKeywords = ["allergy", "allergic", "sensitive", "intolerance"];

    for (const record of emrRecords) {
      const content = (record.content || "").toLowerCase();
      const data = record.data as Record<string, unknown> | null;

      // Check if record mentions the medication and allergy
      if (
        content.includes(medicationLower) &&
        allergyKeywords.some((keyword) => content.includes(keyword))
      ) {
        warnings.push({
          type: "ALLERGY",
          severity: "ERROR",
          message: `Patient has documented allergy or sensitivity to ${dto.medicationName}`,
          medication: dto.medicationName,
          details: {
            emrRecordId: record.id,
            recordType: record.recordType,
          },
        });
        break;
      }

      // Check data field for structured allergy information
      if (data && typeof data === "object") {
        const allergies = (data.allergies as string[]) || [];
        if (allergies.some((a) => a.toLowerCase().includes(medicationLower))) {
          warnings.push({
            type: "ALLERGY",
            severity: "ERROR",
            message: `Patient has documented allergy to ${dto.medicationName}`,
            medication: dto.medicationName,
            details: {
              emrRecordId: record.id,
            },
          });
          break;
        }
      }
    }

    return {
      statusCode: 200,
      message: "Allergy check completed",
      data: warnings,
    };
  }

  /**
   * Validate medication dosage
   */
  public static async validateDosage(
    dto: DosageValidation,
  ): Promise<IResponse<ValidationWarning[]>> {
    const warnings: ValidationWarning[] = [];

    // Get patient information if patientId is provided
    let patient = null;
    if (dto.patientId) {
      patient = await prisma.patient.findUnique({
        where: { id: dto.patientId },
      });

      if (!patient) {
        throw new AppError("Patient not found", 404);
      }
    }

    const age = dto.patientAge || this.calculateAge(patient?.birthDate);
    const weight = dto.patientWeight;

    // Parse dosage (e.g., "500mg", "2 tablets", "10ml")
    const dosageMatch = dto.dosage.match(
      /(\d+\.?\d*)\s*(mg|g|ml|tablet|tab|unit)/i,
    );
    if (!dosageMatch) {
      warnings.push({
        type: "DOSAGE",
        severity: "WARNING",
        message: "Dosage format unclear. Please verify.",
        medication: dto.medication,
        details: {
          dosage: dto.dosage,
        },
      });
      return {
        statusCode: 200,
        message: "Dosage validation completed",
        data: warnings,
      };
    }

    const dosageValue = parseFloat(dosageMatch[1]);
    const unit = dosageMatch[2].toLowerCase();

    // Known dosage guidelines (simplified - in production, use comprehensive database)
    const dosageGuidelines: Record<
      string,
      {
        adult?: { min: number; max: number; unit: string };
        pediatric?: { min: number; max: number; unit: string; perKg?: boolean };
      }
    > = {
      paracetamol: {
        adult: { min: 500, max: 1000, unit: "mg" },
        pediatric: { min: 10, max: 15, unit: "mg", perKg: true },
      },
      amoxicillin: {
        adult: { min: 250, max: 500, unit: "mg" },
        pediatric: { min: 20, max: 40, unit: "mg", perKg: true },
      },
      ibuprofen: {
        adult: { min: 200, max: 400, unit: "mg" },
        pediatric: { min: 5, max: 10, unit: "mg", perKg: true },
      },
    };

    const medicationKey = dto.medication.toLowerCase().split(" ")[0];
    const guidelines = dosageGuidelines[medicationKey];

    if (!guidelines) {
      // No guidelines available - cannot validate
      return {
        statusCode: 200,
        message: "Dosage validation completed (no guidelines available)",
        data: warnings,
      };
    }

    // Check if pediatric or adult
    const isPediatric = age !== undefined && age < 18;
    const relevantGuidelines = isPediatric
      ? guidelines.pediatric
      : guidelines.adult;

    if (!relevantGuidelines) {
      return {
        statusCode: 200,
        message: "Dosage validation completed",
        data: warnings,
      };
    }

    // Normalize dosage to same unit
    let normalizedDosage = dosageValue;
    if (unit !== relevantGuidelines.unit) {
      // Simple conversion (in production, use proper unit conversion)
      if (unit === "g" && relevantGuidelines.unit === "mg") {
        normalizedDosage = dosageValue * 1000;
      } else if (unit === "mg" && relevantGuidelines.unit === "g") {
        normalizedDosage = dosageValue / 1000;
      }
    }

    // For pediatric per-kg dosing
    if (
      isPediatric &&
      "perKg" in relevantGuidelines &&
      relevantGuidelines.perKg &&
      weight
    ) {
      normalizedDosage = normalizedDosage / weight;
    }

    // Check if dosage is within range
    const isPerKg =
      isPediatric && "perKg" in relevantGuidelines && relevantGuidelines.perKg;
    if (normalizedDosage < relevantGuidelines.min) {
      warnings.push({
        type: "DOSAGE",
        severity: "WARNING",
        message: `Dosage (${dto.dosage}) is below recommended minimum (${relevantGuidelines.min}${relevantGuidelines.unit}${isPerKg ? "/kg" : ""})`,
        medication: dto.medication,
        details: {
          dosage: dto.dosage,
          recommendedMin: relevantGuidelines.min,
          recommendedMax: relevantGuidelines.max,
          unit: relevantGuidelines.unit,
        },
      });
    } else if (normalizedDosage > relevantGuidelines.max) {
      warnings.push({
        type: "DOSAGE",
        severity: "WARNING",
        message: `Dosage (${dto.dosage}) exceeds recommended maximum (${relevantGuidelines.max}${relevantGuidelines.unit}${isPerKg ? "/kg" : ""})`,
        medication: dto.medication,
        details: {
          dosage: dto.dosage,
          recommendedMin: relevantGuidelines.min,
          recommendedMax: relevantGuidelines.max,
          unit: relevantGuidelines.unit,
        },
      });
    }

    return {
      statusCode: 200,
      message: "Dosage validation completed",
      data: warnings,
    };
  }

  /**
   * Validate a complete prescription
   */
  public static async validatePrescription(
    patientId: string,
    items: PrescriptionItem[],
  ): Promise<ValidationWarning[]> {
    const allWarnings: ValidationWarning[] = [];

    // Get medication names
    const medicationNames = items.map((item) => item.drugName);

    // Check interactions
    const interactionResult = await this.checkInteractions({
      medications: medicationNames,
    });
    allWarnings.push(...(interactionResult.data as ValidationWarning[]));

    // Check allergies for each medication
    for (const item of items) {
      const allergyResult = await this.checkAllergies({
        medicationName: item.drugName,
        patientId,
      });
      allWarnings.push(...(allergyResult.data as ValidationWarning[]));

      // Validate dosage
      const dosageResult = await this.validateDosage({
        medication: item.drugName,
        dosage: item.dose,
        patientId,
      });
      allWarnings.push(...(dosageResult.data as ValidationWarning[]));
    }

    return allWarnings;
  }

  /**
   * Calculate age from birth date
   */
  private static calculateAge(
    birthDate: Date | null | undefined,
  ): number | undefined {
    if (!birthDate) return undefined;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birth.getDate())
    ) {
      age--;
    }
    return age;
  }
}
