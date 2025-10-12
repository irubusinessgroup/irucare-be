import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";
import { v4 } from "uuid";
import { appEnv } from "../config/env";

cloudinary.config({
  api_key: appEnv.cloudinaryApiKey,
  api_secret: appEnv.cloudinaryApiSecret,
  cloud_name: appEnv.cloudName,
});
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: () => ({
    public_id: v4(),
    folder: "irucare",
  }),
});

const upload = multer({ storage: storage });

const memoryStorage = multer.memoryStorage();
export const uploadToMemory = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for Excel files
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-excel", // .xls
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only Excel files (.xlsx, .xls) are allowed.",
        ),
      );
    }
  },
});

export default upload;
