import { z } from "zod";

export const createDrugSchema = z.object({
  companyId: z.string(),
  drugCategoryId: z.string(),
  drugCode: z.string().min(1, "Drug code is required"),
  description: z.string().optional(),
  designation: z.string().min(1, "Designation is required"),
  instruction: z.string().optional(),
});

export const updateDrugSchema = z.object({
  drugCategoryId: z.string().optional(),
  drugCode: z.string().optional(),
  description: z.string().optional(),
  designation: z.string().optional(),
  instruction: z.string().optional(),
});
