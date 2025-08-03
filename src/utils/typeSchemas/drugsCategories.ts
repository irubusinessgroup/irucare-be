import { z } from "zod";

export const createDrugsCategorySchema = z.object({
  name: z.string().min(1, "Name is required"),
});

export const updateDrugsCategorySchema = z.object({
  name: z.string().min(1, "Name is required"),
});
