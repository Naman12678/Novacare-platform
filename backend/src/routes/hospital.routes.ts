// ============================================================
// NovaCare v2.0 — Hospital Admin Routes
// REST API for hospital dashboard and admin operations
// ============================================================

import { Router, type Request, type Response } from "express";
import { patientService } from "../services/patient.service.js";
import { escalationService } from "../services/escalation.service.js";
import { agentBridge } from "../services/agent-bridge.service.js";
import { prismaRepository } from "../repositories/prisma.repository.js";
import { authenticate, authorize, generateToken } from "../middleware/auth.middleware.js";
import { asyncHandler, AppError } from "../middleware/error.middleware.js";
import { z } from "zod";
import bcrypt from "jsonwebtoken"; // Using JWT for demo; in production use bcrypt
import pino from "pino";

const logger = pino({ name: "hospital-routes" });
const router = Router();

// ================================================================
// Auth Routes (Public)
// ================================================================

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

/** POST /api/v1/auth/login — Admin login */
router.post(
  "/auth/login",
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prismaRepository.getUserByEmail(email);
    if (!user) throw new AppError("Invalid credentials", 401);

    // TODO: bcrypt.compare in production
    // For hackathon demo: simple check
    if (user.passwordHash !== password) {
      throw new AppError("Invalid credentials", 401);
    }

    await prismaRepository.updateLastLogin(user.id);

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      hospitalId: user.hospitalId,
    });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          hospital: user.hospital,
        },
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// ================================================================
// Dashboard Routes (Authenticated)
// ================================================================

/** GET /api/v1/dashboard/overview — Dashboard overview stats */
router.get(
  "/dashboard/overview",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const hospitalId = req.user!.hospitalId;
    const overview = await patientService.getDashboardOverview(hospitalId);

    res.json({
      success: true,
      data: overview,
      timestamp: new Date().toISOString(),
    });
  })
);

/** GET /api/v1/dashboard/patients — Patient list for dashboard */
router.get(
  "/dashboard/patients",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const hospitalId = req.user!.hospitalId;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string) || 50, 100);

    const result = await patientService.getPatientList(hospitalId, page, pageSize);

    res.json({
      success: true,
      data: result.patients,
      total: result.total,
      page,
      pageSize,
      totalPages: Math.ceil(result.total / pageSize),
      timestamp: new Date().toISOString(),
    });
  })
);

/** GET /api/v1/dashboard/patient/:abhaId — Patient detail + timeline */
router.get(
  "/dashboard/patient/:abhaId",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const abhaId = req.params.abhaId as string;
    const details = await patientService.getPatientDetails(abhaId);

    if (!details.patient) {
      throw new AppError("Patient not found", 404);
    }

    res.json({
      success: true,
      data: details,
      timestamp: new Date().toISOString(),
    });
  })
);

// ================================================================
// Escalation Routes
// ================================================================

/** GET /api/v1/escalations — Pending escalation queue */
router.get(
  "/escalations",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const hospitalId = req.user!.hospitalId;
    const escalations = await escalationService.getEscalationQueue(hospitalId);

    res.json({
      success: true,
      data: escalations,
      timestamp: new Date().toISOString(),
    });
  })
);

/** POST /api/v1/escalations/:id/resolve — Resolve an escalation */
router.post(
  "/escalations/:id/resolve",
  authenticate,
  authorize("ADMIN", "DOCTOR", "COORDINATOR"),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { outcome } = z.object({ outcome: z.string() }).parse(req.body);

    await escalationService.resolveEscalation(id, outcome);

    res.json({
      success: true,
      message: "Escalation resolved",
      timestamp: new Date().toISOString(),
    });
  })
);

// ================================================================
// Analytics Routes
// ================================================================

/** GET /api/v1/analytics/trend — Analytics trend data */
router.get(
  "/analytics/trend",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const hospitalId = req.user!.hospitalId;
    const days = parseInt(req.query.days as string) || 30;

    const trend = await prismaRepository.getAnalyticsTrend(hospitalId, days);

    res.json({
      success: true,
      data: trend,
      timestamp: new Date().toISOString(),
    });
  })
);

// ================================================================
// Agent Control Routes
// ================================================================

/** POST /api/v1/agents/trigger-pulse — Manually trigger daily pulse */
router.post(
  "/agents/trigger-pulse",
  authenticate,
  authorize("ADMIN", "DOCTOR"),
  asyncHandler(async (req: Request, res: Response) => {
    const { abhaId } = z.object({ abhaId: z.string() }).parse(req.body);

    const state = await patientService.getPatientDetails(abhaId);
    if (!state.state) throw new AppError("No active episode for patient", 404);

    const { jobId } = await agentBridge.triggerDailyPulse({
      patientAbhaId: abhaId,
      episodeId: state.state.episode_id,
      dayNumber: state.state.current_day,
      contactChannel: state.state.contact_channel,
      languagePref: state.state.language_pref,
    });

    res.json({
      success: true,
      data: { jobId },
      message: "Daily pulse triggered",
      timestamp: new Date().toISOString(),
    });
  })
);

/** POST /api/v1/agents/trigger-ivr — Manually trigger IVR call to patient */
router.post(
  "/agents/trigger-ivr",
  authenticate,
  authorize("ADMIN", "DOCTOR"),
  asyncHandler(async (req: Request, res: Response) => {
    const { abhaId } = z.object({ abhaId: z.string() }).parse(req.body);

    const { ivrFallbackService } = await import("../services/ivr-fallback.service.js");
    const patient = await prismaRepository.getPatientByAbhaId(abhaId);
    if (!patient) throw new AppError("Patient not found", 404);

    const episode = await prismaRepository.getActiveEpisode(abhaId);
    if (!episode) throw new AppError("No active episode", 404);

    const state = { current_day: episode.currentDay, risk_tier: episode.riskTier };

    const callSid = await ivrFallbackService.triggerPatientIVR(patient, episode, state);

    res.json({
      success: true,
      data: { callSid },
      message: callSid ? "IVR call initiated" : "Failed to initiate call",
      timestamp: new Date().toISOString(),
    });
  })
);

/** GET /api/v1/agents/task/:jobId — Check agent task status */
router.get(
  "/agents/task/:jobId",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const jobId = req.params.jobId as string;
    const status = await agentBridge.getTaskStatus(jobId);

    if (!status) throw new AppError("Task not found", 404);

    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString(),
    });
  })
);

/** GET /api/v1/agents/health — Agent service health */
router.get(
  "/agents/health",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const health = await agentBridge.getAgentServiceHealth();

    res.json({
      success: true,
      data: health || { status: "unreachable" },
      timestamp: new Date().toISOString(),
    });
  })
);

// ================================================================
// Hospital Management
// ================================================================

/** GET /api/v1/hospitals — List all hospitals */
router.get(
  "/hospitals",
  authenticate,
  authorize("ADMIN"),
  asyncHandler(async (req: Request, res: Response) => {
    const hospitals = await prismaRepository.getAllHospitals();
    res.json({ success: true, data: hospitals, timestamp: new Date().toISOString() });
  })
);

export default router;
