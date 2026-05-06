// ============================================================
// NovaCare v2.0 — IVR Fallback Service
// Triggers IVR calls when patients don't respond on WhatsApp
// ============================================================

import { exotelClient } from "../integrations/exotel.client.js";
import { prismaRepository } from "../repositories/prisma.repository.js";
import { dynamoRepository } from "../repositories/dynamo.repository.js";
import pino from "pino";

const logger = pino({ name: "ivr-fallback" });

// Fallback thresholds (hours without response)
const FALLBACK_THRESHOLDS = {
  RED: 6,     // 6 hours for RED risk patients
  ORANGE: 12, // 12 hours for ORANGE
  GREEN: 24,  // 24 hours for GREEN
};

export class IVRFallbackService {
  /**
   * Check all active patients and trigger IVR for non-responsive ones.
   * Called by cron job every 4 hours.
   */
  async checkAndTriggerFallbacks(): Promise<void> {
    logger.info("Checking for non-responsive patients...");

    try {
      const hospitals = await prismaRepository.getAllHospitals();

      for (const hospital of hospitals) {
        const episodes = await prismaRepository.getActiveEpisodesByHospital(hospital.id);

        for (const episode of episodes) {
          await this.checkPatientResponse(episode);
        }
      }
    } catch (error) {
      logger.error({ error }, "IVR fallback check failed");
    }
  }

  /**
   * Check if a specific patient needs an IVR call
   */
  private async checkPatientResponse(episode: any): Promise<void> {
    try {
      const state = await dynamoRepository.getPatientState(episode.patientAbhaId);
      if (!state) return;

      const missedDays = state.missed_contact_days || 0;
      const riskTier = (state.risk_tier || episode.riskTier || "GREEN") as keyof typeof FALLBACK_THRESHOLDS;
      const threshold = FALLBACK_THRESHOLDS[riskTier] || 24;

      // Convert missed days to hours (approximate)
      const missedHours = missedDays * 24;

      if (missedHours >= threshold) {
        // Patient hasn't responded — trigger IVR
        const patient = await prismaRepository.getPatientByAbhaId(episode.patientAbhaId);
        if (!patient) return;

        logger.info({
          abhaId: episode.patientAbhaId,
          missedDays,
          riskTier,
          threshold,
        }, "Triggering IVR fallback for non-responsive patient");

        await this.triggerPatientIVR(patient, episode, state);
      }
    } catch (error) {
      logger.warn({ error, abhaId: episode.patientAbhaId }, "Failed to check patient response");
    }
  }

  /**
   * Trigger IVR call to patient
   */
  async triggerPatientIVR(patient: any, episode: any, state: any): Promise<string | null> {
    const callSid = await exotelClient.sendDailyPulseIVR({
      phone: patient.contactPhone,
      dayNumber: episode.currentDay || state.current_day || 1,
      language: patient.languagePref || "en",
      patientAbhaId: patient.abhaId,
      patientName: patient.nameEncrypted || "Patient",
    });

    if (callSid) {
      // Log the IVR attempt
      try {
        await dynamoRepository.appendEvent(
          patient.abhaId,
          "IVR_CALL_INITIATED",
          "daily_pulse",
          {
            call_sid: callSid,
            day: episode.currentDay,
            reason: "whatsapp_non_response",
            risk_tier: state.risk_tier,
          }
        );
      } catch { /* non-critical */ }

      logger.info({ callSid, phone: patient.contactPhone }, "IVR call initiated to patient");
    }

    return callSid;
  }

  /**
   * Trigger IVR call to caregiver when patient is completely unresponsive
   * (after IVR to patient also fails)
   */
  async triggerCaregiverIVR(patientAbhaId: string): Promise<string | null> {
    const caregivers = await prismaRepository.getCaregivers(patientAbhaId);
    if (caregivers.length === 0) {
      logger.warn({ patientAbhaId }, "No caregivers registered — cannot escalate via IVR");
      return null;
    }

    const patient = await prismaRepository.getPatientByAbhaId(patientAbhaId);
    const caregiver = caregivers[0]; // Most recently active

    const callSid = await exotelClient.sendCaregiverAlertIVR({
      phone: caregiver.phoneEncrypted, // In production, decrypt first
      patientName: patient?.nameEncrypted || "your family member",
      patientAbhaId,
      riskTier: "ORANGE",
    });

    if (callSid) {
      logger.info({ callSid, caregiver: caregiver.name }, "IVR call initiated to caregiver");
    }

    return callSid;
  }

  /**
   * Process IVR call result (called from webhook)
   * Maps DTMF digits to health responses
   */
  async processIVRResult(params: {
    callSid: string;
    status: string;
    digits?: string;
    customField?: string;
  }): Promise<void> {
    logger.info({ callSid: params.callSid, status: params.status, digits: params.digits }, "IVR result received");

    if (params.status !== "completed" || !params.digits) {
      // Call wasn't answered or no input — escalate to caregiver
      if (params.customField) {
        try {
          const custom = JSON.parse(params.customField);
          if (custom.type === "daily_pulse" && params.status === "no-answer") {
            logger.info({ patient: custom.patient_abha_id }, "Patient didn't answer IVR — escalating to caregiver");
            await this.triggerCaregiverIVR(custom.patient_abha_id);
          }
        } catch { /* ignore parse errors */ }
      }
      return;
    }

    // Parse custom field to get patient context
    let patientAbhaId = "";
    let dayNumber = 0;
    if (params.customField) {
      try {
        const custom = JSON.parse(params.customField);
        patientAbhaId = custom.patient_abha_id || "";
        dayNumber = custom.day_number || 0;
      } catch { /* ignore */ }
    }

    if (!patientAbhaId) return;

    // Map DTMF digits to feeling score
    // 1 = feeling good, 2 = some issues, 3 = need help
    const digitToScore: Record<string, number> = { "1": 1, "2": 3, "3": 5 };
    const feelingScore = digitToScore[params.digits] || 3;

    // Process as a pulse response
    try {
      const { patientService } = await import("./patient.service.js");
      await patientService.processPulseResponse({
        abhaId: patientAbhaId,
        feelingScore,
        medTaken: params.digits !== "3", // Assume meds taken unless they need help
        freeText: `IVR response: pressed ${params.digits}`,
        source: "patient",
      });

      logger.info({
        patientAbhaId,
        digits: params.digits,
        feelingScore,
      }, "IVR response processed through agent pipeline");
    } catch (error) {
      logger.error({ error, patientAbhaId }, "Failed to process IVR response");
    }
  }
}

export const ivrFallbackService = new IVRFallbackService();
