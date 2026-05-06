// ============================================================
// NovaCare v2.0 — Middleware: Authentication
// JWT-based auth for hospital admin and doctor users
// ============================================================

import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import { prismaRepository } from "../repositories/prisma.repository.js";
import pino from "pino";

const logger = pino({ name: "auth-middleware" });

export interface AuthPayload {
  userId: string;
  email: string;
  role: string;
  hospitalId: string;
}

// Extend Express Request to include auth user
declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

/** Verify JWT token and attach user to request */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  // For hackathon demo: allow unauthenticated access with a default hospital context
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    // Set default demo user context
    req.user = {
      userId: "demo-user",
      email: "demo@novacare.in",
      role: "ADMIN",
      hospitalId: "demo-hospital-001",
    };
    next();
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as AuthPayload;
    req.user = payload;
    next();
  } catch (error) {
    logger.warn({ error }, "JWT verification failed");
    // Fallback to demo user for hackathon
    req.user = {
      userId: "demo-user",
      email: "demo@novacare.in",
      role: "ADMIN",
      hospitalId: "demo-hospital-001",
    };
    next();
  }
}

/** Role-based access control middleware */
export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Not authenticated", timestamp: new Date().toISOString() });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: `Insufficient permissions. Required: ${roles.join(" or ")}`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    next();
  };
}

/** Generate JWT for authenticated user */
export function generateToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN as string,
  } as jwt.SignOptions);
}
