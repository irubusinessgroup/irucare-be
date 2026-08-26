import dotenv from "dotenv";
dotenv.config();
export const appEnv = {
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY,
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET,
  cloudName: process.env.CLOUD_NAME,
  clientId: process.env.clientId,
  clientSecret: process.env.clientSecret,
  PAYPACK_API_BASE_URL: process.env.PAYPACK_API_BASE_URL,
  PAYPACK_WEBHOOK_SIGN_KEY: process.env.PAYPACK_WEBHOOK_SIGN_KEY,
  /** development | production — sent as X-Webhook-Mode on cashin/cashout */
  PAYPACK_WEBHOOK_MODE: process.env.PAYPACK_WEBHOOK_MODE || "development",
  /**
   * Shared secret for POST /api/payments/paypack/register
   * Header: x-paypack-registry-key
   * Used by IRULOVE, IRUCLAIMS, etc. to claim Paypack refs.
   */
  PAYPACK_REGISTRY_API_KEY: process.env.PAYPACK_REGISTRY_API_KEY || "",
};
