import { z } from "zod";

export const createCompanyStaffSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  phoneNumber: z.string().optional(),
  title: z.string().optional(),
  role: z.string(),
  idNumber: z.string().optional(),
  idAttachment: z.optional(z.string()),
});
