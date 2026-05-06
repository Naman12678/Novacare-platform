// ============================================================
// NovaCare v2.0 — Patient Routes
// ============================================================

import { Router, type Request, type Response } from "express";
import { patientService } from "../services/patient.service.js";
import { prismaRepository } from "../repositories/prisma.repository.js";
import { dynamoRepository } from "../repositories/dynamo.repository.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { asyncHandler, AppError } from "../middleware/error.middleware.js";
import { z } from "zod";

const router = Router();

const registerSchema = z.object({
  abhaId: z.string().min(14),
  name: z.string().min(1),
  dateOfBirth: z.string(),
  gender: z.enum(["male", "female", "other"]),
  pincode: z.string().length(6),
  languagePref: z.string().default("hi"),
  contactPhone: z.string().min(10),
  hospitalId: z.string(),
  caregiverPhone: z.string().optional(),
  caregiverName: z.string().optional(),
  caregiverRelationship: z.string().optional(),
});

router.post("/register", authenticate, asyncHandler(async (req: Request, res: Response) => {
  const data = registerSchema.parse(req.body);
  const result = await patientService.onDischarge({
    ...data, dateOfBirth: new Date(data.dateOfBirth),
    fhirBundle: { resourceType: "Bundle", type: "document", entry: [] },
  });
  res.status(201).json({ success: true, data: result, timestamp: new Date().toISOString() });
}));

router.get("/:abhaId", authenticate, asyncHandler(async (req: Request, res: Response) => {
  const patient = await prismaRepository.getPatientByAbhaId(req.params.abhaId as string);
  if (!patient) throw new AppError("Patient not found", 404);
  res.json({ success: true, data: patient, timestamp: new Date().toISOString() });
}));

router.get("/:abhaId/state", authenticate, asyncHandler(async (req: Request, res: Response) => {
  const state = await dynamoRepository.getPatientState(req.params.abhaId as string);
  if (!state) throw new AppError("No active state", 404);
  res.json({ success: true, data: state, timestamp: new Date().toISOString() });
}));

router.get("/:abhaId/timeline", authenticate, asyncHandler(async (req: Request, res: Response) => {
  const events = await dynamoRepository.getPatientEvents(req.params.abhaId as string, undefined, 100);
  res.json({ success: true, data: events, timestamp: new Date().toISOString() });
}));

router.get("/:abhaId/fhir", authenticate, asyncHandler(async (req: Request, res: Response) => {
  const resources = await prismaRepository.getFhirResources(req.params.abhaId as string, req.query.resourceType as string);
  res.json({ success: true, data: resources, timestamp: new Date().toISOString() });
}));

router.get("/:abhaId/caregivers", authenticate, asyncHandler(async (req: Request, res: Response) => {
  const caregivers = await prismaRepository.getCaregivers(req.params.abhaId as string);
  res.json({ success: true, data: caregivers, timestamp: new Date().toISOString() });
}));

const pulseSchema = z.object({ feelingScore: z.number().min(1).max(5), medTaken: z.boolean(), freeText: z.string().optional() });

router.post("/:abhaId/pulse", authenticate, asyncHandler(async (req: Request, res: Response) => {
  const data = pulseSchema.parse(req.body);
  await patientService.processPulseResponse({ abhaId: req.params.abhaId as string, ...data, source: "patient" });
  res.json({ success: true, message: "Pulse recorded", timestamp: new Date().toISOString() });
}));

router.delete("/:abhaId", authenticate, asyncHandler(async (req: Request, res: Response) => {
  await dynamoRepository.deletePatientData(req.params.abhaId as string);
  await prismaRepository.deletePatient(req.params.abhaId as string);
  res.json({ success: true, message: "Patient data deleted (DPDP)", timestamp: new Date().toISOString() });
}));

export default router;
