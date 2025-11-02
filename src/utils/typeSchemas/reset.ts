import { z } from "zod";

export const factoryResetRequestSchema = z.object({
  password: z.string().min(1, { message: "Password is required" }),
  securityToken: z.string().min(1, { message: "Security token is required" }),
  resetType: z.enum(["COMPLETE", "PARTIAL"], {
    errorMap: () => ({ message: "Reset type must be COMPLETE or PARTIAL" }),
  }),
});

export type FactoryResetRequestDto = {
  password: string;
  securityToken: string;
  resetType: "COMPLETE" | "PARTIAL";
};

export interface ResetTokenResponseDto {
  token: string;
  expiresAt: Date;
}

export interface ResetResponseDto {
  message: string;
  backupPath?: string;
  requiresSetup?: boolean;
  seedComplete?: boolean;
}
