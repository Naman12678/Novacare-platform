// ============================================================
// NovaCare v2.0 — Agent Bridge Service
// The SINGLE GATEWAY from TypeScript backend to Python agents
// Supports: sync HTTP calls + async BullMQ task dispatching
// ============================================================

import { config } from "../config/index.js";
import {
  dispatchDischargeWorkflow,
  dispatchDailyPulse,
  dispatchRiskAssessment,
  dispatchPharmacyCheck,
  dispatchFamilyAlert,
  dispatchOutcomesCheck,
  dispatchBatchDailyPulse,
  getJobStatus,
} from "../queues/agent.queue.js";
import type { RiskScore, FHIRBundle } from "../types/index.js";
import pino from "pino";

const logger = pino({ name: "agent-bridge" });

export class AgentBridgeService {
  private agentServiceUrl: string;

  constructor() {
    this.agentServiceUrl = config.AGENT_SERVICE_URL;
  }

  // ================================================================
  // SYNCHRONOUS — Direct HTTP calls to Python FastAPI (< 5s)
  // Used for operations that need an immediate response
  // ================================================================

  /** Get current risk score for a patient (cached in Python service) */
  async getRiskScore(abhaId: string): Promise<RiskScore | null> {
    try {
      const response = await fetch(`${this.agentServiceUrl}/api/risk/${abhaId}`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        logger.warn({ abhaId, status: response.status }, "Risk score fetch failed");
        return null;
      }

      return (await response.json()) as RiskScore;
    } catch (error) {
      logger.error({ error, abhaId }, "Agent service unreachable for risk score");
      return null;
    }
  }

  /** Translate text using Bedrock Claude (via Python) */
  async translateText(
    text: string,
    targetLanguage: string,
    context: string = "medical"
  ): Promise<string | null> {
    try {
      const response = await fetch(`${this.agentServiceUrl}/api/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, target_language: targetLanguage, context }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) return null;

      const data = (await response.json()) as { translated_text: string };
      return data.translated_text;
    } catch (error) {
      logger.error({ error }, "Translation request failed");
      return null;
    }
  }

  /** Parse FHIR discharge summary (extract medications, diagnoses, etc.) */
  async parseFhirDischarge(fhirBundle: FHIRBundle): Promise<{
    diagnosis_codes: string[];
    medications: Record<string, unknown>[];
    follow_up_labs: string[];
    dietary_restrictions: string[];
  } | null> {
    try {
      const response = await fetch(`${this.agentServiceUrl}/api/parse-fhir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fhir_bundle: fhirBundle }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) return null;
      return response.json() as Promise<{
        diagnosis_codes: string[];
        medications: Record<string, unknown>[];
        follow_up_labs: string[];
        dietary_restrictions: string[];
      }>;
    } catch (error) {
      logger.error({ error }, "FHIR parsing failed");
      return null;
    }
  }

  /** Get health status of Python agent service */
  async getAgentServiceHealth(): Promise<{
    status: string;
    agents: Record<string, boolean>;
    model_version: string;
  } | null> {
    try {
      const response = await fetch(`${this.agentServiceUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) return null;
      return response.json() as Promise<{
        status: string;
        agents: Record<string, boolean>;
        model_version: string;
      }>;
    } catch {
      return null;
    }
  }

  // ================================================================
  // ASYNCHRONOUS — BullMQ task dispatch (Python workers consume)
  // Used for long-running agent workflows
  // ================================================================

  /** Trigger full discharge workflow (Agent 1) */
  async triggerDischargeWorkflow(params: {
    patientAbhaId: string;
    hospitalId: string;
    fhirBundle: Record<string, unknown>;
    languagePref: string;
    contactPhone: string;
    caregiverPhone?: string;
  }): Promise<{ jobId: string }> {
    const jobId = await dispatchDischargeWorkflow({
      patient_abha_id: params.patientAbhaId,
      hospital_id: params.hospitalId,
      fhir_bundle: params.fhirBundle,
      language_pref: params.languagePref,
      contact_phone: params.contactPhone,
      caregiver_phone: params.caregiverPhone,
    });
    return { jobId };
  }

  /** Trigger daily pulse for a single patient (Agent 2) */
  async triggerDailyPulse(params: {
    patientAbhaId: string;
    episodeId: string;
    dayNumber: number;
    contactChannel: string;
    languagePref: string;
  }): Promise<{ jobId: string }> {
    const jobId = await dispatchDailyPulse({
      patient_abha_id: params.patientAbhaId,
      episode_id: params.episodeId,
      day_number: params.dayNumber,
      contact_channel: params.contactChannel,
      language_pref: params.languagePref,
    });
    return { jobId };
  }

  /** Trigger risk assessment after receiving pulse response (Agent 3) */
  async triggerRiskAssessment(params: {
    patientAbhaId: string;
    episodeId: string;
    symptomScores: number[];
    medTaken: boolean;
    dayNumber: number;
  }): Promise<{ jobId: string }> {
    const jobId = await dispatchRiskAssessment({
      patient_abha_id: params.patientAbhaId,
      episode_id: params.episodeId,
      symptom_scores: params.symptomScores,
      med_taken: params.medTaken,
      day_number: params.dayNumber,
    });
    return { jobId };
  }

  /** Trigger pharmacy/lab check (Agent 4) */
  async triggerPharmacyCheck(params: {
    patientAbhaId: string;
    episodeId: string;
    medicationCodes: string[];
    missedDays: number;
    pincode: string;
  }): Promise<{ jobId: string }> {
    const jobId = await dispatchPharmacyCheck({
      patient_abha_id: params.patientAbhaId,
      episode_id: params.episodeId,
      medication_rxnorm_codes: params.medicationCodes,
      missed_days_count: params.missedDays,
      patient_pincode: params.pincode,
    });
    return { jobId };
  }

  /** Trigger family alert (Agent 5) */
  async triggerFamilyAlert(params: {
    patientAbhaId: string;
    episodeId: string;
    alertType: "non_response" | "escalation" | "weekly_report" | "onboarding";
    riskTier?: string;
    missedDays?: number;
  }): Promise<{ jobId: string }> {
    const jobId = await dispatchFamilyAlert({
      patient_abha_id: params.patientAbhaId,
      episode_id: params.episodeId,
      alert_type: params.alertType,
      risk_tier: params.riskTier,
      missed_days: params.missedDays,
    });
    return { jobId };
  }

  /** Trigger Day 30 outcomes check (Agent 6) */
  async triggerOutcomesCheck(params: {
    patientAbhaId: string;
    episodeId: string;
    hospitalId: string;
    carePlanId: string;
  }): Promise<{ jobId: string }> {
    const jobId = await dispatchOutcomesCheck({
      patient_abha_id: params.patientAbhaId,
      episode_id: params.episodeId,
      hospital_id: params.hospitalId,
      care_plan_id: params.carePlanId,
    });
    return { jobId };
  }

  /** Batch trigger daily pulses for all active patients */
  async triggerBatchDailyPulse(
    patients: Array<{
      patientAbhaId: string;
      episodeId: string;
      dayNumber: number;
      contactChannel: string;
      languagePref: string;
    }>
  ): Promise<{ jobIds: string[] }> {
    const jobIds = await dispatchBatchDailyPulse(
      patients.map((p) => ({
        patient_abha_id: p.patientAbhaId,
        episode_id: p.episodeId,
        day_number: p.dayNumber,
        contact_channel: p.contactChannel,
        language_pref: p.languagePref,
      }))
    );
    return { jobIds };
  }

  /** Check status of a dispatched agent task */
  async getTaskStatus(jobId: string) {
    return getJobStatus(jobId);
  }
}

export const agentBridge = new AgentBridgeService();
