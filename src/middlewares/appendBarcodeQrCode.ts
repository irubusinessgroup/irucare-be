import type { NextFunction } from "express";
import type { Request, Response } from "express";

export const appendBarcodeQrCode = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (req.files) {
      const files = req.files as Express.Multer.File[];
      // Extract the barcodeQrCode field
      const barcodeFile = files.find(
        (file) => file.fieldname === "barcodeQrCode",
      );
      if (barcodeFile) {
        req.body.barcodeQrCode = barcodeFile.path;
      }
    }
    next();
  } catch (error) {
    next(error);
  }
};
