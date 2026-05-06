// ============================================================
// NovaCare v2.0 — Patient Service
// Core business logic for patient lifecycle management
// ============================================================

import { v4 as uuid } from "uuid";
import { dynamoRepository } from "../repositories/dynamo.repository.js";
import { prismaRepository } from "../repositories/prisma.repository.js";
import { agentBridge } from "./agent-bridge.service.js";
import type { PatientState, PatientListItem, DashboardOverview } from "../types/index.js";
import pino from "pino";

const logger = pino({ name: "patient-service" });

export class PatientService {
  /** Register a new patient on discharge */
  async onDischarge(params: {
    abhaId: string;
    name: string;
    dateOfBirth: Date;
    gender: string;
    pincode: string;
    languagePref: string;
    contactPhone: string;
    hospitalId: string;
    fhirBundle: Record<string, unknown>;
    caregiverPhone?: string;
    caregiverName?: string;
    caregiverRelationship?: string;
  }): Promise<{ episodeId: string; jobId: string }> {
    const isRural = this.isPincodeRural(params.pincode);

    // 1. Upsert patient in PostgreSQL
    let patient = await prismaRepository.getPatientByAbhaId(params.abhaId);
    if (!patient) {
      await prismaRepository.createPatient({
        abhaId: params.abhaId,
        nameEncrypted: params.name, // TODO: KMS encryption
        dateOfBirth: params.dateOfBirth,
        gender: params.gender,
        pincode: params.pincode,
        languagePref: params.languagePref,
        contactPhone: params.contactPhone,
        hospitalId: params.hospitalId,
        ruralFlag: isRural,
      });
      patient = await prismaRepository.getPatientByAbhaId(params.abhaId);
    }

    // 2. Create episode
    const episode = await prismaRepository.createEpisode({
      patientAbhaId: params.abhaId,
      hospitalId: params.hospitalId,
      dischargeDate: new Date(),
      diagnosisCodes: [],
    });

    // 3. Register caregiver if provided
    if (params.caregiverPhone) {
      await prismaRepository.createCaregiver({
        patientAbhaId: params.abhaId,
        name: params.caregiverName || "Family Caregiver",
        phoneEncrypted: params.caregiverPhone, // TODO: KMS
        relationship: params.caregiverRelationship || "family",
        whatsappOptIn: true,
        languagePref: params.languagePref,
      });
    }

    // 4. Initialize DynamoDB patient state
    const initialState: PatientState = {
      patient_abha_id: params.abhaId,
      episode_id: episode.id,
      hospital_id: params.hospitalId,
      discharge_date: new Date().toISOString(),
      diagnosis_codes: [],
      medications: [],
      care_plan_id: "",
      language_pref: params.languagePref,
      contact_channel: "WHATSAPP",
      rural_flag: isRural,
      comorbidity_count: 0,
      current_day: 0,
      symptom_history: [],
      med_adherence_streak: 0,
      missed_contact_days: 0,
      risk_score: 0.0,
      risk_tier: "GREEN",
      shap_explanation: {},
      active_escalation_id: null,
      escalation_tier: null,
      caregiver_ids: [],
      readmission_detected: null,
      teleconsult_attended: null,
      final_adherence_rate: null,
      last_agent: "discharge_architect",
      next_scheduled_action: new Date(Date.now() + 86_400_000).toISOString(),
      errors: [],
    };

    await dynamoRepository.putPatientState(params.abhaId, initialState);

    // 5. Log discharge event
    await dynamoRepository.appendEvent(params.abhaId, "DISCHARGE", "discharge_architect", {
      hospital_id: params.hospitalId,
      episode_id: episode.id,
    });

    // 6. Dispatch Agent 1 workflow (Python)
    const { jobId } = await agentBridge.triggerDischargeWorkflow({
      patientAbhaId: params.abhaId,
      hospitalId: params.hospitalId,
      fhirBundle: params.fhirBundle,
      languagePref: params.languagePref,
      contactPhone: params.contactPhone,
      caregiverPhone: params.caregiverPhone,
    });

    logger.info({ abhaId: params.abhaId, episodeId: episode.id, jobId }, "Patient discharge processed");
    return { episodeId: episode.id, jobId };
  }

  /** Process daily pulse response from patient */
  async processPulseResponse(params: {
    abhaId: string;
    feelingScore: number; // 1-5
    medTaken: boolean;
    freeText?: string;
    vitalReadings?: Record<string, number>;
    source: "patient" | "caregiver";
  }): Promise<void> {
    let state = await dynamoRepository.getPatientState(params.abhaId);
    if (!state) {
      // Create a minimal DynamoDB state if one doesn't exist
      // This happens for patients registered via frontend who haven't had Agent 1 run
      const episode = await prismaRepository.getActiveEpisode(params.abhaId);
      if (!episode) {
        logger.warn({ abhaId: params.abhaId }, "No active episode for pulse response");
        return;
      }
      const patient = await prismaRepository.getPatientByAbhaId(params.abhaId);
      const initialState: PatientState = {
        patient_abha_id: params.abhaId,
        episode_id: episode.id,
        hospital_id: episode.hospitalId,
        discharge_date: episode.dischargeDate.toISOString(),
        diagnosis_codes: episode.diagnosisCodes || [],
        medications: [],
        care_plan_id: "",
        language_pref: patient?.languagePref || "en",
        contact_channel: "WHATSAPP",
        rural_flag: patient?.ruralFlag || false,
        comorbidity_count: 0,
        current_day: episode.currentDay || 1,
        symptom_history: [],
        med_adherence_streak: 0,
        missed_contact_days: 0,
        risk_score: 0.0,
        risk_tier: "GREEN",
        shap_explanation: {},
        active_escalation_id: null,
        escalation_tier: null,
        caregiver_ids: [],
        readmission_detected: null,
        teleconsult_attended: null,
        final_adherence_rate: null,
        last_agent: "discharge_architect",
        next_scheduled_action: "",
        errors: [],
      };
      await dynamoRepository.putPatientState(params.abhaId, initialState);
      state = initialState;
      logger.info({ abhaId: params.abhaId }, "Created DynamoDB state for patient on first pulse");
    }

    // Update adherence streak
    const newStreak = params.medTaken ? state.med_adherence_streak + 1 : 0;

    // Add to symptom history
    const newEntry = {
      day: state.current_day,
      scores: [params.feelingScore],
      notes: params.freeText || "",
      timestamp: new Date().toISOString(),
      source: params.source,
    };

    const updatedHistory = [...state.symptom_history, newEntry].slice(-30); // Keep last 30 entries

    // Update DynamoDB state
    await dynamoRepository.updatePatientState(params.abhaId, {
      med_adherence_streak: newStreak,
      symptom_history: updatedHistory,
      missed_contact_days: 0, // Reset missed counter on response
    });

    // Log event
    await dynamoRepository.appendEvent(params.abhaId, "PULSE_RESPONSE", "daily_pulse", {
      feeling_score: params.feelingScore,
      med_taken: params.medTaken,
      source: params.source,
    });

    // Trigger risk assessment (Agent 3) via Python
    const recentScores = updatedHistory.slice(-7).map((h) => h.scores[0]);
    await agentBridge.triggerRiskAssessment({
      patientAbhaId: params.abhaId,
      episodeId: state.episode_id,
      symptomScores: recentScores,
      medTaken: params.medTaken,
      dayNumber: state.current_day,
    });

    // Also get a quick risk score synchronously and update PostgreSQL
    // This ensures the frontend dashboard shows updated data immediately
    try {
      const riskResult = await agentBridge.getRiskScore(params.abhaId);
      if (riskResult) {
        const episode = await prismaRepository.getActiveEpisode(params.abhaId);
        if (episode) {
          await prismaRepository.updateEpisode(episode.id, {
            riskScore: riskResult.score,
            riskTier: riskResult.tier,
            currentDay: state.current_day,
          });
          logger.info({ abhaId: params.abhaId, score: riskResult.score, tier: riskResult.tier }, "Episode risk score synced to PostgreSQL");
        }
      }
    } catch (error) {
      logger.warn({ error }, "Failed to sync risk score to PostgreSQL (non-critical)");
    }

    // Check medication non-adherence threshold
    if (!params.medTaken && newStreak === 0 && state.med_adherence_streak <= 1) {
      const medicationCodes = (state.medications || [])
        .map((m: any) => m.rxnorm_code || m.code || "")
        .filter(Boolean);

      await agentBridge.triggerPharmacyCheck({
        patientAbhaId: params.abhaId,
        episodeId: state.episode_id,
        medicationCodes,
        missedDays: 2,
        pincode: "", // Will be resolved by pharmacy agent
      });
    }

    logger.info({ abhaId: params.abhaId, day: state.current_day, score: params.feelingScore }, "Pulse response processed");
  }

  /** Get patient details for dashboard */
  async getPatientDetails(abhaId: string) {
    const [patient, state, events] = await Promise.all([
      prismaRepository.getPatientByAbhaId(abhaId),
      dynamoRepository.getPatientState(abhaId),
      dynamoRepository.getPatientEvents(abhaId, undefined, 50),
    ]);

    return { patient, state, events };
  }

  /** Get dashboard overview for a hospital */
  async getDashboardOverview(hospitalId: string): Promise<DashboardOverview> {
    let episodes: Awaited<ReturnType<typeof prismaRepository.getActiveEpisodesByHospital>> = [];
    let escalations: Awaited<ReturnType<typeof prismaRepository.getPendingEscalations>> = [];

    try {
      episodes = await prismaRepository.getActiveEpisodesByHospital(hospitalId);
    } catch {
      // Hospital may not exist yet
    }

    try {
      escalations = await prismaRepository.getPendingEscalations(hospitalId);
    } catch {
      // No escalations yet
    }

    const riskBreakdown = { green: 0, orange: 0, red: 0 };
    let totalAdherence = 0;
    let adherenceCount = 0;

    for (const ep of episodes) {
      if (ep.riskTier === "GREEN") riskBreakdown.green++;
      else if (ep.riskTier === "ORANGE") riskBreakdown.orange++;
      else if (ep.riskTier === "RED") riskBreakdown.red++;

      if (ep.adherenceRate != null) {
        totalAdherence += ep.adherenceRate;
        adherenceCount++;
      }
    }

    return {
      active_patients: episodes.length,
      risk_breakdown: riskBreakdown,
      todays_escalations: escalations.length,
      pending_teleconsults: escalations.filter((e) => e.tier === "ORANGE").length,
      readmission_rate_30d: 0.0, // Computed from analytics
      avg_adherence_rate: adherenceCount > 0 ? totalAdherence / adherenceCount : 0,
      patients_completed_today: 0, // Computed from today's completions
    };
  }

  /** Get patient list for hospital dashboard */
  async getPatientList(hospitalId: string, page = 1, pageSize = 50): Promise<{
    patients: PatientListItem[];
    total: number;
  }> {
    const episodes = await prismaRepository.getActiveEpisodesByHospital(hospitalId);

    const patients: PatientListItem[] = episodes.map((ep) => ({
      abha_id: ep.patientAbhaId,
      name: ep.patient?.nameEncrypted || "Unknown", // Decrypt in production
      diagnosis: ep.diagnosisCodes?.[0] || "N/A",
      current_day: ep.currentDay,
      risk_score: ep.riskScore,
      risk_tier: ep.riskTier as PatientListItem["risk_tier"],
      last_contact: ep.updatedAt.toISOString(),
      last_contact_channel: "WHATSAPP",
      next_action: "Daily check-in",
      med_adherence_streak: 0,
    }));

    return {
      patients: patients.slice((page - 1) * pageSize, page * pageSize),
      total: patients.length,
    };
  }

  /** Determine if pincode is rural (simplified heuristic) */
  private isPincodeRural(pincode: string): boolean {
    // In production: use NHM pincode database
    // Simplified: pincodes starting with certain ranges are more rural
    const prefix = parseInt(pincode.substring(0, 2), 10);
    return prefix >= 70 || prefix <= 20;
  }
}

export const patientService = new PatientService();
