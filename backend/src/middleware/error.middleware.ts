// ============================================================
// NovaCare v2.0 — Middleware: Error Handler
// Centralized error handling with structured logging
// ============================================================

import { type Request, type Response, type NextFunction } from "express";
import pino from "pino";

const logger = pino({ name: "error-handler" });

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    logger.warn({ err: err.message, statusCode: err.statusCode, path: req.path }, "Operational error");
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Unexpected errors
  logger.error({ err, path: req.path, method: req.method }, "Unhandled error");
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
    timestamp: new Date().toISOString(),
  });
}

/** Async route handler wrapper to catch promise rejections */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
