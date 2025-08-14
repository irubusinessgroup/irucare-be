import { z } from "zod";

export const createCompanySchema = z.object({
  company: z.object({
    name: z.string(),
    country: z.string().optional(),
    province: z.string().optional(),
    district: z.string().optional(),
    sector: z.string().optional(),
    email: z.string().email(),
    phoneNumber: z.string().optional(),
    industry: z.string().optional(),
    website: z.string().optional(),
    TIN: z.string().optional(),
    type: z.string().optional(),
    certificate: z.string().optional(),
    logo: z.string().optional(),
  }),
  contactPerson: z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string().email(),
    phoneNumber: z.string().optional(),
    title: z.string().optional(),
    role: z.string(),
    idNumber: z.string().optional(),
    idAttachment: z.string().optional(),
  }),
});
