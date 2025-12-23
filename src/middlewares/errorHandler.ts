import { NextFunction, Request, Response } from "express";
import { ValidateError } from "tsoa";
import AppError, { ValidationError } from "../utils/error";

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): Response | void => {
  if (err instanceof ValidateError) {
    console.warn(`Caught Validation Error for ${req.path}:`, err.fields);
    const errors: Record<string, string> = {};
    Object.keys(err.fields).forEach((key) => {
      errors[key] = err.fields[key].message;
    });

    return res.status(400).json({
      message: "Validation failed",
      errors,
    });
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({
      status: err.status,
      message: err.message,
    });
  }

  if (err instanceof ValidationError) {
    try {
      const parsedErrors = JSON.parse(err.message);
      return res.status(400).json({
        error: "validate",
        data: parsedErrors,
      });
    } catch (e) {
      return res.status(400).json({
        error: "validate",
        message: err.message,
      });
    }
  }

  if (err instanceof Error) {
    console.error(`Unhandled Error at ${req.path}:`, err);
    return res.status(500).json({
      message: err.message ?? "Internal server error",
      status: 500,
    });
  }

  next();
};
