// ============================================================
// NovaCare v2.0 — Agent Task Queue
// BullMQ queue for dispatching tasks to Python agent workers
// This is the PRIMARY bridge between TypeScript and Python
// ============================================================

import { Queue, QueueEvents, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config/index.js";
import type { AgentTaskType } from "../types/index.js";
import pino from "pino";
import { v4 as uuid } from "uuid";

const logger = pino({ name: "agent-queue" });

// ---- Redis Connection (shared across queues) ----
export const redisConnection = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
});

redisConnection.on("error", (err) => logger.error({ err }, "Redis connection error"));
redisConnection.on("connect", () => logger.info("Redis connected for agent queue"));

// ---- Agent Task Queue ----
export const agentQueue = new Queue("novacare-agent-tasks", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 86400, count: 1000 }, // Keep 24h or 1000 completed jobs
    removeOnFail: { age: 604800 }, // Keep failed jobs for 7 days
  },
});

// ---- Queue Events (for monitoring) ----
export const agentQueueEvents = new QueueEvents("novacare-agent-tasks", {
  connection: redisConnection,
});

agentQueueEvents.on("completed", ({ jobId, returnvalue }) => {
  logger.info({ jobId, returnvalue }, "Agent task completed");
});

agentQueueEvents.on("failed", ({ jobId, failedReason }) => {
  logger.error({ jobId, failedReason }, "Agent task failed");
});

// ================================================================
// Task Dispatchers — Called by TypeScript services
// Each pushes a job to Redis → Python worker picks up and processes
// ================================================================

interface DischargeWorkflowPayload {
  patient_abha_id: string;
  hospital_id: string;
  fhir_bundle: Record<string, unknown>;
  language_pref: string;
  contact_phone: string;
  caregiver_phone?: string;
}

interface DailyPulsePayload {
  patient_abha_id: string;
  episode_id: string;
  day_number: number;
  contact_channel: string;
  language_pref: string;
}

interface RiskAssessmentPayload {
  patient_abha_id: string;
  episode_id: string;
  symptom_scores: number[];
  med_taken: boolean;
  day_number: number;
}

interface PharmacyCheckPayload {
  patient_abha_id: string;
  episode_id: string;
  medication_rxnorm_codes: string[];
  missed_days_count: number;
  patient_pincode: string;
}

interface FamilyAlertPayload {
  patient_abha_id: string;
  episode_id: string;
  alert_type: "non_response" | "escalation" | "weekly_report" | "onboarding";
  risk_tier?: string;
  missed_days?: number;
}

interface OutcomesCheckPayload {
  patient_abha_id: string;
  episode_id: string;
  hospital_id: string;
  care_plan_id: string;
}

/** Dispatch Agent 1: Discharge Architect workflow */
export async function dispatchDischargeWorkflow(
  payload: DischargeWorkflowPayload
): Promise<string> {
  const jobId = `discharge-${payload.patient_abha_id}-${uuid().slice(0, 8)}`;
  await agentQueue.add("discharge_workflow", payload, {
    jobId,
    priority: 1, // Highest priority — patient just discharged
  });
  logger.info({ jobId, abhaId: payload.patient_abha_id }, "Discharge workflow dispatched");
  return jobId;
}

/** Dispatch Agent 2: Daily Pulse check-in */
export async function dispatchDailyPulse(
  payload: DailyPulsePayload
): Promise<string> {
  const jobId = `pulse-${payload.patient_abha_id}-day${payload.day_number}-${uuid().slice(0, 8)}`;
  await agentQueue.add("daily_pulse", payload, {
    jobId,
    priority: 2,
  });
  logger.info({ jobId, abhaId: payload.patient_abha_id, day: payload.day_number }, "Daily pulse dispatched");
  return jobId;
}

/** Dispatch Agent 3: Risk assessment after pulse response */
export async function dispatchRiskAssessment(
  payload: RiskAssessmentPayload
): Promise<string> {
  const jobId = `risk-${payload.patient_abha_id}-day${payload.day_number}-${uuid().slice(0, 8)}`;
  await agentQueue.add("risk_assessment", payload, {
    jobId,
    priority: 1, // High priority — affects escalations
  });
  logger.info({ jobId, abhaId: payload.patient_abha_id }, "Risk assessment dispatched");
  return jobId;
}

/** Dispatch Agent 4: Pharmacy & lab bridge */
export async function dispatchPharmacyCheck(
  payload: PharmacyCheckPayload
): Promise<string> {
  const jobId = `pharmacy-${payload.patient_abha_id}-${uuid().slice(0, 8)}`;
  await agentQueue.add("pharmacy_check", payload, {
    jobId,
    priority: 3,
  });
  logger.info({ jobId, abhaId: payload.patient_abha_id }, "Pharmacy check dispatched");
  return jobId;
}

/** Dispatch Agent 5: Family network alert */
export async function dispatchFamilyAlert(
  payload: FamilyAlertPayload
): Promise<string> {
  const jobId = `family-${payload.patient_abha_id}-${payload.alert_type}-${uuid().slice(0, 8)}`;
  await agentQueue.add("family_alert", payload, {
    jobId,
    priority: payload.alert_type === "escalation" ? 1 : 3,
  });
  logger.info({ jobId, abhaId: payload.patient_abha_id, type: payload.alert_type }, "Family alert dispatched");
  return jobId;
}

/** Dispatch Agent 6: Day 30 outcomes check */
export async function dispatchOutcomesCheck(
  payload: OutcomesCheckPayload
): Promise<string> {
  const jobId = `outcomes-${payload.patient_abha_id}-${uuid().slice(0, 8)}`;
  await agentQueue.add("outcomes_check", payload, {
    jobId,
    priority: 5, // Lower priority — not time-sensitive
  });
  logger.info({ jobId, abhaId: payload.patient_abha_id }, "Outcomes check dispatched");
  return jobId;
}

/** Batch dispatch daily pulses for all active patients */
export async function dispatchBatchDailyPulse(
  patients: DailyPulsePayload[]
): Promise<string[]> {
  const jobIds: string[] = [];
  // Use BullMQ bulk add for efficiency
  const jobs = patients.map((p) => ({
    name: "daily_pulse" as const,
    data: p,
    opts: {
      jobId: `pulse-${p.patient_abha_id}-day${p.day_number}-${uuid().slice(0, 8)}`,
      priority: 2,
    } as JobsOptions,
  }));

  await agentQueue.addBulk(jobs);
  logger.info({ count: patients.length }, "Batch daily pulse dispatched");
  return jobs.map((j) => j.opts.jobId as string);
}

/** Get job status (for polling from frontend) */
export async function getJobStatus(jobId: string) {
  const job = await agentQueue.getJob(jobId);
  if (!job) return null;

  const state = await job.getState();
  return {
    id: job.id,
    name: job.name,
    state,
    data: job.data,
    returnvalue: job.returnvalue,
    failedReason: job.failedReason,
    progress: job.progress,
    attemptsMade: job.attemptsMade,
    timestamp: job.timestamp,
    finishedOn: job.finishedOn,
    processedOn: job.processedOn,
  };
}
