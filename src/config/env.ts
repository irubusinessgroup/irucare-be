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
};
